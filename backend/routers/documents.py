import os
import uuid
from typing import List

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, status
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from dependencies import require_curator
from models import Document, KnowledgeChunk, User
from schemas import DocumentOut, DocumentStatusOut
from services import document_service
from services import embedding_service

router = APIRouter(prefix="/api/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {"pdf", "doc", "docx", "txt", "png", "jpg", "jpeg", "tiff", "bmp", "gif"}


def _get_extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


@router.get("", response_model=List[DocumentOut])
def list_documents(
    db: Session = Depends(get_db),
    _: User = Depends(require_curator),
):
    return db.query(Document).order_by(Document.created_at.desc()).all()


@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    ext = _get_extension(file.filename or "")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_name)

    async with aiofiles.open(file_path, "wb") as out_file:
        content = await file.read()
        await out_file.write(content)

    doc = Document(
        filename=unique_name,
        original_filename=file.filename or unique_name,
        file_path=file_path,
        file_type=ext,
        status="processing",
        uploaded_by=current_user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(document_service.process_document, doc.id, db)

    return doc


@router.get("/{doc_id}/status", response_model=DocumentStatusOut)
def document_status(
    doc_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_curator),
):
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    chunk_count = db.query(KnowledgeChunk).filter(KnowledgeChunk.document_id == doc_id).count()
    return DocumentStatusOut(id=doc.id, status=doc.status, chunk_count=chunk_count)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_curator),
):
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    # Remove from ChromaDB
    embedding_service.delete_document_chunks(doc_id)

    # Delete related chunks first (prevent NOT NULL constraint failure)
    db.query(KnowledgeChunk).filter(KnowledgeChunk.document_id == doc_id).delete()

    # Remove file from disk
    try:
        if os.path.exists(doc.file_path):
            os.remove(doc.file_path)
    except OSError as exc:
        import logging
        logging.getLogger(__name__).warning("Could not delete file %s: %s", doc.file_path, exc)

    db.delete(doc)
    db.commit()
