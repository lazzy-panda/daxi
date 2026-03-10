import json
import random
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_examinee
from models import (
    ExamAnswer,
    ExamSession,
    FlashCard,
    Notification,
    OrganizationMember,
    Question,
    User,
)
from schemas import (
    EligibilityOut,
    ExamAnswerOut,
    ExamHistoryOut,
    ExamResultOut,
    ExamSessionOut,
    ExamStartOut,
    ExamSubmit,
    QuestionResultOut,
    QuestionStart,
)
from services import ai_service

router = APIRouter(prefix="/api/exams", tags=["exams"])

EXAM_QUESTION_COUNT = 10


def _get_org_id(user_id: int, db: Session):
    member = db.query(OrganizationMember).filter(OrganizationMember.user_id == user_id).first()
    return member.org_id if member else None
PASSING_SCORE = 85.0  # percent
COOLDOWN_HOURS = 72


def _latest_completed_session(user_id: int, db: Session) -> ExamSession | None:
    return (
        db.query(ExamSession)
        .filter(ExamSession.user_id == user_id, ExamSession.status == "completed")
        .order_by(ExamSession.submitted_at.desc())
        .first()
    )


@router.get("/eligibility", response_model=EligibilityOut)
def check_eligibility(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    last = _latest_completed_session(current_user.id, db)
    if last is None:
        return EligibilityOut(eligible=True)

    cooldown_end = last.submitted_at + timedelta(hours=COOLDOWN_HOURS)
    now = datetime.utcnow()
    if now < cooldown_end:
        remaining = cooldown_end - now
        days_remaining = max(1, remaining.days + (1 if remaining.seconds > 0 else 0))
        return EligibilityOut(
            eligible=False,
            reason=f"You must wait {COOLDOWN_HOURS} hours between attempts.",
            next_eligible_at=cooldown_end,
            days_until_next_attempt=days_remaining,
            message=f"Next attempt available in {days_remaining} day{'s' if days_remaining != 1 else ''}.",
        )
    return EligibilityOut(eligible=True)


@router.post("/start", response_model=ExamStartOut, status_code=status.HTTP_201_CREATED)
def start_exam(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Enforce cooldown
    last = _latest_completed_session(current_user.id, db)
    if last and last.submitted_at:
        cooldown_end = last.submitted_at + timedelta(hours=COOLDOWN_HOURS)
        if datetime.utcnow() < cooldown_end:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Cooldown active. Next attempt available after {cooldown_end.isoformat()}Z",
            )

    # Abandon any stale in-progress session for this user
    stale = (
        db.query(ExamSession)
        .filter(
            ExamSession.user_id == current_user.id,
            ExamSession.status == "in_progress",
        )
        .all()
    )
    for s in stale:
        s.status = "completed"
        s.submitted_at = datetime.utcnow()
    db.flush()

    # Select questions
    org_id = _get_org_id(current_user.id, db)
    questions_query = db.query(Question)
    if org_id is not None:
        questions_query = questions_query.filter(Question.org_id == org_id)
    all_questions = questions_query.all()
    if len(all_questions) < EXAM_QUESTION_COUNT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Not enough questions in the bank. Need at least {EXAM_QUESTION_COUNT}, have {len(all_questions)}.",
        )
    selected = random.sample(all_questions, EXAM_QUESTION_COUNT)
    question_ids = [q.id for q in selected]

    session = ExamSession(
        user_id=current_user.id,
        questions_json={"question_ids": question_ids},
        status="in_progress",
        org_id=org_id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    def _safe_choices(q):
        if q.question_type not in ("mcq", "true_false") or not q.choices:
            return None
        return [{"label": c["label"], "text": c["text"]} for c in q.choices]

    return ExamStartOut(
        id=session.id,
        questions=[
            QuestionStart(
                id=q.id,
                text=q.content,
                question_type=q.question_type or "open",
                choices=_safe_choices(q),
            )
            for q in selected
        ],
        started_at=session.started_at,
        status=session.status,
    )


@router.post("/{session_id}/submit", response_model=ExamSessionOut)
def submit_exam(
    session_id: int,
    payload: ExamSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.get(ExamSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam session not found.")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your exam session.")
    if session.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This exam session is already completed.",
        )

    allowed_ids: set[int] = set(session.questions_json.get("question_ids", []))

    # Validate submitted question ids
    answer_map = {a.question_id: a.answer_text for a in payload.answers}
    for qid in answer_map:
        if qid not in allowed_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Question {qid} was not part of this exam.",
            )

    # Fetch questions for grading
    questions = db.query(Question).filter(Question.id.in_(list(allowed_ids))).all()
    question_map = {q.id: q for q in questions}

    # Split into open and MCQ
    open_pairs = []
    mcq_pairs = []
    for qid in allowed_ids:
        q = question_map.get(qid)
        pair = {
            "question_id": qid,
            "question": q.content if q else "",
            "answer": answer_map.get(qid, ""),
            "question_type": q.question_type if q else "open",
            "choices": q.choices if q else [],
        }
        if q and q.question_type in ("mcq", "true_false"):
            mcq_pairs.append(pair)
        else:
            open_pairs.append(pair)

    # Grade open questions with AI
    open_grades = ai_service.grade_exam_answers(
        [{"question": p["question"], "answer": p["answer"]} for p in open_pairs]
    )

    # Grade MCQ instantly
    def _grade_mcq(pair):
        chosen = (pair["answer"] or "").strip().upper()
        correct_label = next(
            (c["label"].upper() for c in (pair["choices"] or []) if c.get("correct")), None
        )
        is_correct = chosen == correct_label
        correct_text = next(
            (c["text"] for c in (pair["choices"] or []) if c.get("correct")), ""
        )
        return {
            "score": 10 if is_correct else 0,
            "correct": is_correct,
            "feedback": "Correct!" if is_correct else f"The correct answer was {correct_label}: {correct_text}",
            "explanation": f"Correct answer: {correct_label}. {correct_text}",
            "suggestions": "" if is_correct else "Review the relevant section in the course material.",
            "resources": "",
        }

    mcq_grades = [_grade_mcq(p) for p in mcq_pairs]

    # Merge all results preserving original order
    grade_by_qid = {}
    for pair, grade in zip(open_pairs, open_grades):
        grade_by_qid[pair["question_id"]] = (pair, grade)
    for pair, grade in zip(mcq_pairs, mcq_grades):
        grade_by_qid[pair["question_id"]] = (pair, grade)

    total_score = 0.0
    exam_answers = []

    for qid in allowed_ids:
        pair, grade = grade_by_qid[qid]
        answer = ExamAnswer(
            exam_session_id=session.id,
            question_id=pair["question_id"],
            answer_text=pair["answer"],
            ai_score=grade.get("score"),
            ai_correct=grade.get("correct"),
            ai_feedback=grade.get("feedback"),
            ai_explanation=grade.get("explanation"),
            ai_suggestions=grade.get("suggestions"),
            ai_resources=grade.get("resources"),
        )
        db.add(answer)
        db.flush()
        exam_answers.append((answer, grade, pair))
        total_score += grade.get("score", 0)

    # Score as percentage (max score = 10 per question)
    max_possible = EXAM_QUESTION_COUNT * 10
    score_pct = (total_score / max_possible) * 100
    passed = score_pct >= PASSING_SCORE

    session.submitted_at = datetime.utcnow()
    session.score = round(score_pct, 2)
    session.passed = passed
    session.status = "completed"
    db.flush()

    # Generate remediation flash cards for weak/wrong answers (score < 7)
    remediation_org_id = _get_org_id(current_user.id, db)
    for answer, grade, pair in exam_answers:
        if (grade.get("score") or 0) < 7:
            cards_data = ai_service.generate_remediation_flashcards(
                question=pair["question"],
                answer=pair["answer"],
                explanation=grade.get("explanation") or "",
                count=2,
            )
            for card_data in cards_data:
                card = FlashCard(
                    front=card_data.get("front", ""),
                    back=card_data.get("back", ""),
                    source_reference=f"exam_session:{session.id}",
                    is_auto_generated=True,
                    exam_answer_id=answer.id,
                    created_by=current_user.id,
                    org_id=remediation_org_id,
                )
                db.add(card)

    # Notify the examinee
    result_text = "passed" if passed else "failed"
    notif = Notification(
        user_id=current_user.id,
        type="exam_result",
        message=f"Exam completed. Score: {score_pct:.1f}%. You {result_text}.",
        related_id=session.id,
    )
    db.add(notif)

    # Notify curators in the same org (or all curators if no org)
    exam_org_id = _get_org_id(current_user.id, db)
    if exam_org_id is not None:
        curator_member_ids = [
            m.user_id for m in db.query(OrganizationMember).filter(
                OrganizationMember.org_id == exam_org_id,
                OrganizationMember.role.in_(["owner", "curator"]),
            ).all()
        ]
        curators = db.query(User).filter(
            User.id.in_(curator_member_ids), User.is_active == True
        ).all()
    else:
        curators = db.query(User).filter(User.role == "curator", User.is_active == True).all()
    for curator in curators:
        curator_notif = Notification(
            user_id=curator.id,
            type="exam_completed",
            message=f"{current_user.email} completed an exam. Score: {score_pct:.1f}% ({result_text}).",
            related_id=session.id,
        )
        db.add(curator_notif)

    db.commit()
    db.refresh(session)
    return session


@router.get("/history", response_model=List[ExamHistoryOut])
def exam_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _MAX_SCORE = EXAM_QUESTION_COUNT * 10.0
    sessions = (
        db.query(ExamSession)
        .filter(ExamSession.user_id == current_user.id, ExamSession.status == "completed")
        .order_by(ExamSession.submitted_at.desc())
        .all()
    )
    result = []
    for s in sessions:
        pct = s.score or 0.0
        result.append(ExamHistoryOut(
            id=s.id,
            completed_at=s.submitted_at or s.started_at,
            total_score=round(pct * _MAX_SCORE / 100, 1),
            max_score=_MAX_SCORE,
            percentage=pct,
            passed=s.passed or False,
        ))
    return result


@router.get("/results/{session_id}", response_model=ExamResultOut)
def get_exam_result(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.get(ExamSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam session not found.")
    if current_user.role != "curator" and session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    _QUESTION_MAX = 10.0
    _MAX_SCORE = EXAM_QUESTION_COUNT * _QUESTION_MAX

    answers = (
        db.query(ExamAnswer)
        .filter(ExamAnswer.exam_session_id == session_id)
        .order_by(ExamAnswer.id)
        .all()
    )

    question_results = []
    for answer in answers:
        question = db.get(Question, answer.question_id)
        resources: Optional[List[str]] = None
        if answer.ai_resources:
            try:
                parsed = json.loads(answer.ai_resources)
                resources = parsed if isinstance(parsed, list) else [str(parsed)]
            except (json.JSONDecodeError, TypeError):
                resources = [answer.ai_resources]

        question_results.append(QuestionResultOut(
            question_id=answer.question_id,
            question_text=question.content if question else "",
            answer_text=answer.answer_text,
            score=answer.ai_score or 0.0,
            max_score=_QUESTION_MAX,
            is_correct=answer.ai_correct or False,
            feedback=answer.ai_feedback,
            explanation=answer.ai_explanation,
            suggestions=answer.ai_suggestions,
            resources=resources,
        ))

    pct = session.score or 0.0
    return ExamResultOut(
        id=session.id,
        total_score=round(pct * _MAX_SCORE / 100, 1),
        max_score=_MAX_SCORE,
        percentage=pct,
        passed=session.passed or False,
        completed_at=session.submitted_at or session.started_at,
        question_results=question_results,
    )
