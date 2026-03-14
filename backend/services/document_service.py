"""
Document processing service.
Extracts text from PDF, DOCX, TXT, and image files,
splits into ~500-token chunks, and stores embeddings in ChromaDB.
"""

import asyncio
import logging
import os
from pathlib import Path
from typing import List

from sqlalchemy.orm import Session

from models import Document, KnowledgeChunk
from services import embedding_service

logger = logging.getLogger(__name__)

CHUNK_SIZE = 500  # approximate tokens (characters / 4)
CHUNK_CHAR_SIZE = CHUNK_SIZE * 4


def _extract_text_pdf(file_path: str) -> str:
    # Try pymupdf first (best results for Russian/CJK/scanned PDFs)
    try:
        import fitz  # pymupdf
        doc = fitz.open(file_path)
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
        if text.strip():
            return text
    except Exception as exc:
        logger.warning("pymupdf extraction failed for %s: %s", file_path, exc)

    # Fallback to PyPDF2
    try:
        import PyPDF2
        text_parts = []
        with open(file_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                text_parts.append(page.extract_text() or "")
        return "\n".join(text_parts)
    except Exception as exc:
        logger.error("PDF extraction failed for %s: %s", file_path, exc)
        return ""


def _extract_text_docx(file_path: str) -> str:
    try:
        from docx import Document as DocxDocument

        doc = DocxDocument(file_path)
        return "\n".join(para.text for para in doc.paragraphs)
    except Exception as exc:
        logger.error("DOCX extraction failed for %s: %s", file_path, exc)
        return ""


def _extract_text_txt(file_path: str) -> str:
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as exc:
        logger.error("TXT extraction failed for %s: %s", file_path, exc)
        return ""


def _extract_text_image(file_path: str) -> str:
    try:
        import pytesseract
        from PIL import Image

        image = Image.open(file_path)
        return pytesseract.image_to_string(image)
    except Exception as exc:
        logger.error("Image OCR failed for %s: %s", file_path, exc)
        return ""


def extract_text(file_path: str, file_type: str) -> str:
    ft = file_type.lower()
    if ft == "pdf":
        return _extract_text_pdf(file_path)
    elif ft in ("doc", "docx"):
        return _extract_text_docx(file_path)
    elif ft == "txt":
        return _extract_text_txt(file_path)
    elif ft in ("png", "jpg", "jpeg", "tiff", "bmp", "gif"):
        return _extract_text_image(file_path)
    else:
        # Attempt plain text as fallback
        return _extract_text_txt(file_path)


def split_into_chunks(text: str) -> List[str]:
    """Split text into chunks of approximately CHUNK_SIZE tokens."""
    chunks = []
    text = text.strip()
    if not text:
        return chunks

    start = 0
    while start < len(text):
        end = start + CHUNK_CHAR_SIZE
        if end >= len(text):
            chunks.append(text[start:].strip())
            break
        # Try to break at a sentence or paragraph boundary
        boundary = text.rfind("\n", start, end)
        if boundary == -1 or boundary <= start:
            boundary = text.rfind(". ", start, end)
        if boundary == -1 or boundary <= start:
            boundary = end
        chunks.append(text[start:boundary].strip())
        start = boundary + 1

    return [c for c in chunks if c]


async def process_document(document_id: int, db: Session = None) -> None:
    """
    Background task: extract text, chunk, embed, and store.
    Updates document status in the database.
    """
    from database import SessionLocal
    own_session = db is None
    if own_session:
        db = SessionLocal()

    doc = db.get(Document, document_id)
    if doc is None:
        logger.error("Document %d not found", document_id)
        return

    try:
        # Run blocking I/O in thread pool
        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(None, extract_text, doc.file_path, doc.file_type)

        if not text.strip():
            logger.warning("No text extracted from document %d", document_id)
            doc.status = "failed"
            db.commit()
            return

        chunks = split_into_chunks(text)
        logger.info("Document %d split into %d chunks", document_id, len(chunks))

        for idx, chunk_text in enumerate(chunks):
            chunk = KnowledgeChunk(
                document_id=document_id,
                content=chunk_text,
                chunk_index=idx,
            )
            db.add(chunk)
            db.flush()  # get chunk.id

            chunk_id = f"doc{document_id}_chunk{chunk.id}"
            success = embedding_service.store_chunk(
                chunk_id=chunk_id,
                content=chunk_text,
                metadata={"document_id": document_id, "chunk_index": idx},
            )
            if success:
                chunk.embedding_id = chunk_id

        doc.status = "ready"
        db.commit()
        logger.info("Document %d processed successfully", document_id)

    except Exception as exc:
        logger.exception("Document %d processing failed: %s", document_id, exc)
        doc.status = "failed"
        db.commit()
    finally:
        if own_session:
            db.close()
