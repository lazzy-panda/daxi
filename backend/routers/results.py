import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_curator
from models import ExamAnswer, ExamSession, Question, User
from schemas import ExamResultOut, QuestionResultOut

router = APIRouter(prefix="/api/results", tags=["results"])

_EXAM_QUESTION_COUNT = 10
_QUESTION_MAX = 10.0
_MAX_SCORE = _EXAM_QUESTION_COUNT * _QUESTION_MAX


def _build_result(session: ExamSession, db: Session, include_questions: bool = True) -> ExamResultOut:
    user = db.get(User, session.user_id)
    pct = session.score or 0.0
    question_results: List[QuestionResultOut] = []

    if include_questions:
        answers = (
            db.query(ExamAnswer)
            .filter(ExamAnswer.exam_session_id == session.id)
            .order_by(ExamAnswer.id)
            .all()
        )
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

    return ExamResultOut(
        id=session.id,
        user_id=session.user_id,
        user_email=user.email if user else None,
        total_score=round(pct * _MAX_SCORE / 100, 1),
        max_score=_MAX_SCORE,
        percentage=pct,
        passed=session.passed or False,
        completed_at=session.submitted_at or session.started_at,
        question_results=question_results,
    )


@router.get("", response_model=List[ExamResultOut])
def all_results(
    db: Session = Depends(get_db),
    _: User = Depends(require_curator),
):
    sessions = (
        db.query(ExamSession)
        .filter(ExamSession.status == "completed")
        .order_by(ExamSession.submitted_at.desc())
        .all()
    )
    return [_build_result(s, db, include_questions=False) for s in sessions]


@router.get("/{session_id}", response_model=ExamResultOut)
def get_result(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.get(ExamSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam session not found.")
    if current_user.role != "curator" and session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return _build_result(session, db, include_questions=True)
