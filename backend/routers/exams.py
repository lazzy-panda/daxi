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
    all_questions = db.query(Question).all()
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
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return ExamStartOut(
        id=session.id,
        questions=[QuestionStart(id=q.id, text=q.content) for q in selected],
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

    # Fetch question texts for grading
    questions = db.query(Question).filter(Question.id.in_(list(allowed_ids))).all()
    question_text_map = {q.id: q.content for q in questions}

    # Build qa pairs for AI grading
    qa_pairs = []
    for qid in allowed_ids:
        qa_pairs.append(
            {
                "question_id": qid,
                "question": question_text_map.get(qid, ""),
                "answer": answer_map.get(qid, ""),
            }
        )

    grading_results = ai_service.grade_exam_answers(
        [{"question": p["question"], "answer": p["answer"]} for p in qa_pairs]
    )

    total_score = 0.0
    exam_answers = []

    for pair, grade in zip(qa_pairs, grading_results):
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

    # Notify all curators
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
