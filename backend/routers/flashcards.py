import csv
import io
from datetime import date
from typing import List, Union

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_curator
from models import Document, FlashCard, FlashCardReview, KnowledgeChunk, User
from schemas import (
    FlashCardCreate,
    FlashCardGenerateRequest,
    FlashCardImportItem,
    FlashCardOut,
    FlashCardReviewOut,
    FlashCardReviewRequest,
    FlashCardStudyOut,
)
from services import ai_service
from services.spaced_repetition import compute_next_review

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


# ── Study queue (examinee) ────────────────────────────────────────────────────

@router.get("/study", response_model=List[FlashCardStudyOut])
def get_study_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return flash cards due for review today for the current user."""
    today = date.today()

    # Get all reviews for this user where next_review_date <= today
    due_reviews = (
        db.query(FlashCardReview)
        .filter(
            FlashCardReview.user_id == current_user.id,
            FlashCardReview.next_review_date <= today,
        )
        .all()
    )
    reviewed_card_ids = {r.flash_card_id for r in due_reviews}

    # Also include cards that have no review record yet (new cards)
    all_cards = db.query(FlashCard).all()
    unreviewed_cards = [c for c in all_cards if c.id not in reviewed_card_ids]

    result = []

    # Add due cards with review data
    review_map = {r.flash_card_id: r for r in due_reviews}
    for card_id, review in review_map.items():
        card = db.get(FlashCard, card_id)
        if card:
            result.append(
                FlashCardStudyOut(
                    id=card.id,
                    front=card.front,
                    back=card.back,
                    source_reference=card.source_reference,
                    ease_factor=review.ease_factor,
                    interval_days=review.interval_days,
                    next_review_date=review.next_review_date,
                    review_count=review.review_count,
                )
            )

    # Add brand-new cards with defaults
    for card in unreviewed_cards:
        result.append(
            FlashCardStudyOut(
                id=card.id,
                front=card.front,
                back=card.back,
                source_reference=card.source_reference,
                ease_factor=2.5,
                interval_days=1,
                next_review_date=today,
                review_count=0,
            )
        )

    return result


# ── List / Create ─────────────────────────────────────────────────────────────

@router.get("", response_model=List[FlashCardOut])
def list_flashcards(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "curator":
        return db.query(FlashCard).order_by(FlashCard.created_at.desc()).all()
    # Examinee: return all available cards (same as study queue source)
    return db.query(FlashCard).order_by(FlashCard.created_at.desc()).all()


@router.post("", response_model=FlashCardOut, status_code=status.HTTP_201_CREATED)
def create_flashcard(
    payload: FlashCardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    card = FlashCard(
        front=payload.front,
        back=payload.back,
        source_reference=payload.source_reference,
        is_auto_generated=False,
        created_by=current_user.id,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


# ── AI Generation ─────────────────────────────────────────────────────────────

@router.post("/generate", response_model=List[FlashCardOut], status_code=status.HTTP_201_CREATED)
def generate_flashcards(
    payload: FlashCardGenerateRequest,
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

    generated = ai_service.generate_flashcards_from_text(combined_text, count=payload.count)

    created = []
    for item in generated:
        card = FlashCard(
            front=item.get("front", ""),
            back=item.get("back", ""),
            source_reference=f"document:{payload.document_id}",
            is_auto_generated=True,
            created_by=current_user.id,
        )
        db.add(card)
        db.flush()
        created.append(card)

    db.commit()
    for card in created:
        db.refresh(card)
    return created


# ── Import ────────────────────────────────────────────────────────────────────

@router.post("/import/json", response_model=List[FlashCardOut], status_code=status.HTTP_201_CREATED)
def import_flashcards_json(
    payload: List[FlashCardImportItem],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No flash cards provided.")
    created = []
    for item in payload:
        card = FlashCard(
            front=item.front,
            back=item.back,
            source_reference=item.source_reference,
            is_auto_generated=False,
            created_by=current_user.id,
        )
        db.add(card)
        db.flush()
        created.append(card)
    db.commit()
    for card in created:
        db.refresh(card)
    return created


@router.post("/import/csv", response_model=List[FlashCardOut], status_code=status.HTTP_201_CREATED)
async def import_flashcards_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    """CSV columns: front, back, source_reference (optional)."""
    raw = await file.read()
    text = raw.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))

    created = []
    for row in reader:
        front = (row.get("front") or "").strip()
        back = (row.get("back") or "").strip()
        if not front or not back:
            continue
        card = FlashCard(
            front=front,
            back=back,
            source_reference=(row.get("source_reference") or "").strip() or None,
            is_auto_generated=False,
            created_by=current_user.id,
        )
        db.add(card)
        db.flush()
        created.append(card)

    if not created:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid flash cards found in CSV.",
        )
    db.commit()
    for card in created:
        db.refresh(card)
    return created


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_flashcard(
    card_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_curator),
):
    card = db.get(FlashCard, card_id)
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flash card not found.")
    db.delete(card)
    db.commit()


# ── Review ────────────────────────────────────────────────────────────────────

@router.post("/{card_id}/review", response_model=FlashCardReviewOut)
def review_flashcard(
    card_id: int,
    payload: FlashCardReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = db.get(FlashCard, card_id)
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flash card not found.")

    review = (
        db.query(FlashCardReview)
        .filter(
            FlashCardReview.user_id == current_user.id,
            FlashCardReview.flash_card_id == card_id,
        )
        .first()
    )

    if review is None:
        review = FlashCardReview(
            user_id=current_user.id,
            flash_card_id=card_id,
            ease_factor=2.5,
            interval_days=1,
            review_count=0,
        )
        db.add(review)
        db.flush()

    new_interval, new_ease, next_date = compute_next_review(
        difficulty=payload.difficulty,
        current_ease_factor=review.ease_factor,
        current_interval_days=review.interval_days,
        review_count=review.review_count,
    )

    review.ease_factor = new_ease
    review.interval_days = new_interval
    review.next_review_date = next_date
    review.last_review_date = date.today()
    review.review_count += 1

    db.commit()
    db.refresh(review)

    return FlashCardReviewOut(
        flash_card_id=card_id,
        ease_factor=review.ease_factor,
        interval_days=review.interval_days,
        next_review_date=review.next_review_date,
        review_count=review.review_count,
    )
