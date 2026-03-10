import os
import uuid
from typing import List

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, status
from sqlalchemy.orm import Session

from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import settings
from database import get_db
from dependencies import get_current_user, require_curator
from models import Document, KnowledgeChunk, OrganizationMember, User
from schemas import DocumentOut, DocumentStatusOut
from services import document_service
from services import embedding_service


def _get_org_id(user_id: int, db: Session):
    member = db.query(OrganizationMember).filter(OrganizationMember.user_id == user_id).first()
    return member.org_id if member else None

router = APIRouter(prefix="/api/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {"pdf", "doc", "docx", "txt", "png", "jpg", "jpeg", "tiff", "bmp", "gif"}


def _get_extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


@router.get("", response_model=List[DocumentOut])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    org_id = _get_org_id(current_user.id, db)
    query = db.query(Document)
    if org_id is not None:
        query = query.filter(Document.org_id == org_id)
    return query.order_by(Document.created_at.desc()).all()


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

    org_id = _get_org_id(current_user.id, db)
    doc = Document(
        filename=unique_name,
        original_filename=file.filename or unique_name,
        file_path=file_path,
        file_type=ext,
        status="processing",
        uploaded_by=current_user.id,
        org_id=org_id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(document_service.process_document, doc.id, db)

    return doc


@router.get("/available", response_model=List[DocumentOut])
def list_available_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return ready documents visible to any authenticated org member."""
    org_id = _get_org_id(current_user.id, db)
    query = db.query(Document).filter(Document.status == "ready")
    if org_id is not None:
        query = query.filter(Document.org_id == org_id)
    return query.order_by(Document.created_at.desc()).all()


class ChatRequest(BaseModel):
    question: str


class ChatResponse(BaseModel):
    answer: str
    sources: List[str]


@router.post("/{doc_id}/chat", response_model=ChatResponse)
def chat_with_document(
    doc_id: int,
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    # Org access check
    org_id = _get_org_id(current_user.id, db)
    if org_id is not None and doc.org_id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    if doc.status != "ready":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document is still processing. Try again shortly.",
        )

    # Retrieve relevant chunks
    chunks = embedding_service.query_similar_for_doc(payload.question, doc_id, n_results=5)

    if not chunks:
        # Fall back to all chunks from DB
        db_chunks = (
            db.query(KnowledgeChunk)
            .filter(KnowledgeChunk.document_id == doc_id)
            .limit(5)
            .all()
        )
        chunks = [c.content for c in db_chunks]

    if not chunks:
        return ChatResponse(
            answer="No content found in this document to answer your question.",
            sources=[],
        )

    # Build prompt and call OpenAI
    if not settings.OPENAI_API_KEY:
        return ChatResponse(
            answer=(
                "AI chat is not available in demo mode. "
                "Set OPENAI_API_KEY to enable document Q&A."
            ),
            sources=chunks[:2],
        )

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        context = "\n\n---\n\n".join(chunks)
        system_prompt = (
            "You are a helpful assistant that answers questions based strictly on the provided document excerpts. "
            "If the answer is not in the excerpts, say so clearly. "
            "Be concise and cite the relevant part of the text when possible."
        )
        user_message = f"Document excerpts:\n\n{context}\n\nQuestion: {payload.question}"
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            max_tokens=600,
            temperature=0.2,
        )
        answer = response.choices[0].message.content or ""
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Chat completion failed: %s", exc)
        answer = "Failed to generate an answer. Please try again."

    return ChatResponse(answer=answer, sources=chunks)


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
