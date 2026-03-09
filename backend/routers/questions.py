import csv
import io
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_curator
from models import Document, KnowledgeChunk, Question, User
from schemas import (
    QuestionCreate,
    QuestionGenerateRequest,
    QuestionImportItem,
    QuestionOut,
)
from services import ai_service

router = APIRouter(prefix="/api/questions", tags=["questions"])


@router.get("", response_model=List[QuestionOut])
def list_questions(
    db: Session = Depends(get_db),
    _: User = Depends(require_curator),
):
    return db.query(Question).order_by(Question.created_at.desc()).all()


@router.post("", response_model=QuestionOut, status_code=status.HTTP_201_CREATED)
def create_question(
    payload: QuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    q = Question(
        content=payload.content,
        source_type="manual",
        created_by=current_user.id,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


@router.post("/generate", response_model=List[QuestionOut], status_code=status.HTTP_201_CREATED)
def generate_questions(
    payload: QuestionGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    doc = db.get(Document, payload.document_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    if doc.status != "ready":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Document is not ready (status: {doc.status}).",
        )

    chunks = (
        db.query(KnowledgeChunk)
        .filter(KnowledgeChunk.document_id == payload.document_id)
        .order_by(KnowledgeChunk.chunk_index)
        .all()
    )
    combined_text = "\n\n".join(c.content for c in chunks)

    generated = ai_service.generate_questions_from_text(combined_text, count=payload.count)

    created = []
    for text in generated:
        q = Question(
            content=text,
            source_type="ai_generated",
            source_document_id=payload.document_id,
            created_by=current_user.id,
        )
        db.add(q)
        db.flush()
        created.append(q)

    db.commit()
    for q in created:
        db.refresh(q)
    return created


@router.post("/import/json", response_model=List[QuestionOut], status_code=status.HTTP_201_CREATED)
def import_questions_json(
    payload: List[QuestionImportItem],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No questions provided.")
    created = []
    for item in payload:
        q = Question(
            content=item.content,
            source_type="imported",
            created_by=current_user.id,
        )
        db.add(q)
        db.flush()
        created.append(q)
    db.commit()
    for q in created:
        db.refresh(q)
    return created


@router.post("/import/csv", response_model=List[QuestionOut], status_code=status.HTTP_201_CREATED)
async def import_questions_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    """
    CSV format: one column named 'content' (or just one column per row with the question text).
    """
    raw = await file.read()
    text = raw.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))

    created = []
    for row in reader:
        # Accept 'content' column or first column value
        content = row.get("content") or next(iter(row.values()), "")
        content = content.strip()
        if not content:
            continue
        q = Question(
            content=content,
            source_type="imported",
            created_by=current_user.id,
        )
        db.add(q)
        db.flush()
        created.append(q)

    if not created:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid questions found in CSV.",
        )
    db.commit()
    for q in created:
        db.refresh(q)
    return created


@router.put("/{question_id}", response_model=QuestionOut)
def update_question(
    question_id: int,
    payload: QuestionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_curator),
):
    q = db.get(Question, question_id)
    if q is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
    q.content = payload.content
    db.commit()
    db.refresh(q)
    return q


@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_curator),
):
    q = db.get(Question, question_id)
    if q is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
    db.delete(q)
    db.commit()
