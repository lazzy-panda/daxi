from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_curator
from models import ExamAnswer, ExamSession, OrganizationMember, Question, User
from schemas import AnalyticsOverview, ExamineeStat, QuestionStat

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _get_org_id(user_id: int, db: Session):
    member = db.query(OrganizationMember).filter(OrganizationMember.user_id == user_id).first()
    return member.org_id if member else None


@router.get("/overview", response_model=AnalyticsOverview)
def overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    org_id = _get_org_id(current_user.id, db)
    q = db.query(ExamSession).filter(ExamSession.status == "completed")
    if org_id:
        q = q.filter(ExamSession.org_id == org_id)
    sessions = q.all()

    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    total_attempts = len(sessions)
    passed = sum(1 for s in sessions if s.passed)
    pass_rate = round(passed / total_attempts * 100, 1) if total_attempts else 0.0
    avg_score = round(sum(s.score or 0 for s in sessions) / total_attempts, 1) if total_attempts else 0.0
    attempts_week = sum(1 for s in sessions if s.submitted_at and s.submitted_at >= week_ago)
    attempts_month = sum(1 for s in sessions if s.submitted_at and s.submitted_at >= month_ago)
    total_examinees = len(set(s.user_id for s in sessions))

    return AnalyticsOverview(
        total_examinees=total_examinees,
        total_attempts=total_attempts,
        pass_rate=pass_rate,
        avg_score=avg_score,
        attempts_this_week=attempts_week,
        attempts_this_month=attempts_month,
    )


@router.get("/questions", response_model=List[QuestionStat])
def question_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    org_id = _get_org_id(current_user.id, db)

    # Get all completed session IDs in this org
    q = db.query(ExamSession).filter(ExamSession.status == "completed")
    if org_id:
        q = q.filter(ExamSession.org_id == org_id)
    session_ids = [s.id for s in q.all()]
    if not session_ids:
        return []

    answers = db.query(ExamAnswer).filter(ExamAnswer.exam_session_id.in_(session_ids)).all()

    # Aggregate per question
    stats: dict = {}
    for a in answers:
        qid = a.question_id
        if qid not in stats:
            stats[qid] = {"total": 0, "correct": 0}
        stats[qid]["total"] += 1
        if a.ai_correct:
            stats[qid]["correct"] += 1

    result = []
    for qid, data in stats.items():
        question = db.get(Question, qid)
        if not question:
            continue
        total = data["total"]
        correct = data["correct"]
        fail_rate = round((1 - correct / total) * 100, 1) if total else 0.0
        result.append(QuestionStat(
            question_id=qid,
            question_text=question.content,
            question_type=question.question_type or "open",
            total_answers=total,
            correct_count=correct,
            fail_rate=fail_rate,
        ))

    result.sort(key=lambda x: x.fail_rate, reverse=True)
    return result[:20]


@router.get("/examinees", response_model=List[ExamineeStat])
def examinee_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    org_id = _get_org_id(current_user.id, db)
    q = db.query(ExamSession).filter(ExamSession.status == "completed")
    if org_id:
        q = q.filter(ExamSession.org_id == org_id)
    sessions = q.order_by(ExamSession.submitted_at.desc()).all()

    user_map: dict = {}
    for s in sessions:
        uid = s.user_id
        if uid not in user_map:
            user_map[uid] = {"attempts": 0, "best_score": 0.0, "last_at": None, "ever_passed": False}
        user_map[uid]["attempts"] += 1
        score = s.score or 0.0
        if score > user_map[uid]["best_score"]:
            user_map[uid]["best_score"] = score
        if s.submitted_at and (user_map[uid]["last_at"] is None or s.submitted_at > user_map[uid]["last_at"]):
            user_map[uid]["last_at"] = s.submitted_at
        if s.passed:
            user_map[uid]["ever_passed"] = True

    result = []
    for uid, data in user_map.items():
        user = db.get(User, uid)
        if not user:
            continue
        result.append(ExamineeStat(
            user_id=uid,
            email=user.email,
            attempts=data["attempts"],
            best_score=round(data["best_score"], 1),
            last_attempt_at=data["last_at"],
            ever_passed=data["ever_passed"],
        ))

    result.sort(key=lambda x: x.last_attempt_at or datetime.min, reverse=True)
    return result
