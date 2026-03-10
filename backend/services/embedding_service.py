"""
Embedding service – wraps ChromaDB for storing and querying knowledge chunk embeddings.
Gracefully degrades when ChromaDB or OpenAI is unavailable.
"""

import logging
from typing import List, Optional

from config import settings

logger = logging.getLogger(__name__)

_chroma_client = None
_collection = None
COLLECTION_NAME = "daxi_knowledge"


def _get_collection():
    global _chroma_client, _collection
    if _collection is not None:
        return _collection
    try:
        import chromadb

        _chroma_client = chromadb.PersistentClient(path=settings.CHROMA_PATH)
        _collection = _chroma_client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        return _collection
    except Exception as exc:
        logger.warning("ChromaDB unavailable: %s", exc)
        return None


def _get_openai_client():
    if not settings.OPENAI_API_KEY:
        return None
    try:
        from openai import OpenAI

        return OpenAI(api_key=settings.OPENAI_API_KEY)
    except Exception as exc:
        logger.warning("OpenAI client unavailable: %s", exc)
        return None


def embed_texts(texts: List[str]) -> List[Optional[List[float]]]:
    """Return embeddings for a list of texts. Returns list of None on failure."""
    client = _get_openai_client()
    if client is None:
        return [None] * len(texts)
    try:
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )
        return [item.embedding for item in response.data]
    except Exception as exc:
        logger.error("Embedding generation failed: %s", exc)
        return [None] * len(texts)


def store_chunk(chunk_id: str, content: str, metadata: dict) -> bool:
    """Embed and store a single chunk. Returns True on success."""
    collection = _get_collection()
    if collection is None:
        return False
    embeddings = embed_texts([content])
    embedding = embeddings[0]
    try:
        if embedding is not None:
            collection.upsert(
                ids=[chunk_id],
                documents=[content],
                embeddings=[embedding],
                metadatas=[metadata],
            )
        else:
            collection.upsert(
                ids=[chunk_id],
                documents=[content],
                metadatas=[metadata],
            )
        return True
    except Exception as exc:
        logger.error("Failed to store chunk %s: %s", chunk_id, exc)
        return False


def query_similar(query: str, n_results: int = 5) -> List[str]:
    """Return top-n similar document chunks for a query."""
    collection = _get_collection()
    if collection is None:
        return []
    try:
        embeddings = embed_texts([query])
        embedding = embeddings[0]
        if embedding is not None:
            results = collection.query(
                query_embeddings=[embedding],
                n_results=n_results,
            )
        else:
            results = collection.query(
                query_texts=[query],
                n_results=n_results,
            )
        docs = results.get("documents", [[]])[0]
        return docs
    except Exception as exc:
        logger.error("ChromaDB query failed: %s", exc)
        return []


def query_similar_for_doc(query: str, document_id: int, n_results: int = 5) -> List[str]:
    """Return top-n similar chunks from a specific document."""
    collection = _get_collection()
    if collection is None:
        return []
    try:
        embeddings = embed_texts([query])
        embedding = embeddings[0]
        kwargs = {
            "n_results": n_results,
            "where": {"document_id": document_id},
        }
        if embedding is not None:
            results = collection.query(query_embeddings=[embedding], **kwargs)
        else:
            results = collection.query(query_texts=[query], **kwargs)
        return results.get("documents", [[]])[0]
    except Exception as exc:
        logger.error("ChromaDB doc query failed: %s", exc)
        return []


def delete_document_chunks(document_id: int) -> bool:
    """Delete all chunks belonging to a document."""
    collection = _get_collection()
    if collection is None:
        return False
    try:
        results = collection.get(where={"document_id": document_id})
        ids = results.get("ids", [])
        if ids:
            collection.delete(ids=ids)
        return True
    except Exception as exc:
        logger.error("Failed to delete chunks for document %d: %s", document_id, exc)
        return False
