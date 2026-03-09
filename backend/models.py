from datetime import datetime, date
from typing import Optional
from sqlalchemy import (
    Integer, String, Boolean, Float, Text, DateTime,
    Date, ForeignKey, JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)  # curator / examinee
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    allowlist_entries: Mapped[list["AllowlistEntry"]] = relationship(
        "AllowlistEntry", back_populates="added_by_user", foreign_keys="AllowlistEntry.added_by"
    )
    documents: Mapped[list["Document"]] = relationship("Document", back_populates="uploader")
    questions: Mapped[list["Question"]] = relationship("Question", back_populates="creator")
    flash_cards: Mapped[list["FlashCard"]] = relationship("FlashCard", back_populates="creator")
    exam_sessions: Mapped[list["ExamSession"]] = relationship("ExamSession", back_populates="user")
    flash_card_reviews: Mapped[list["FlashCardReview"]] = relationship(
        "FlashCardReview", back_populates="user"
    )
    notifications: Mapped[list["Notification"]] = relationship("Notification", back_populates="user")


class AllowlistEntry(Base):
    __tablename__ = "allowlist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)  # curator / examinee
    added_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    added_by_user: Mapped[Optional["User"]] = relationship(
        "User", back_populates="allowlist_entries", foreign_keys=[added_by]
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="processing")  # processing/ready/failed
    uploaded_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    uploader: Mapped["User"] = relationship("User", back_populates="documents")
    chunks: Mapped[list["KnowledgeChunk"]] = relationship("KnowledgeChunk", back_populates="document")
    questions: Mapped[list["Question"]] = relationship("Question", back_populates="source_document")


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    document_id: Mapped[int] = mapped_column(Integer, ForeignKey("documents.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    embedding_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    document: Mapped["Document"] = relationship("Document", back_populates="chunks")


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)  # ai_generated/manual/imported
    source_document_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("documents.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    source_document: Mapped[Optional["Document"]] = relationship("Document", back_populates="questions")
    creator: Mapped[Optional["User"]] = relationship("User", back_populates="questions")
    exam_answers: Mapped[list["ExamAnswer"]] = relationship("ExamAnswer", back_populates="question")


class FlashCard(Base):
    __tablename__ = "flash_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    front: Mapped[str] = mapped_column(Text, nullable=False)
    back: Mapped[str] = mapped_column(Text, nullable=False)
    source_reference: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    is_auto_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    exam_answer_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("exam_answers.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    creator: Mapped[Optional["User"]] = relationship("User", back_populates="flash_cards")
    exam_answer: Mapped[Optional["ExamAnswer"]] = relationship(
        "ExamAnswer", back_populates="flash_cards"
    )
    reviews: Mapped[list["FlashCardReview"]] = relationship("FlashCardReview", back_populates="flash_card")


class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    passed: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="in_progress")  # in_progress/completed
    questions_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="exam_sessions")
    answers: Mapped[list["ExamAnswer"]] = relationship("ExamAnswer", back_populates="exam_session")


class ExamAnswer(Base):
    __tablename__ = "exam_answers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    exam_session_id: Mapped[int] = mapped_column(Integer, ForeignKey("exam_sessions.id"), nullable=False)
    question_id: Mapped[int] = mapped_column(Integer, ForeignKey("questions.id"), nullable=False)
    answer_text: Mapped[str] = mapped_column(Text, nullable=False)
    ai_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ai_correct: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    ai_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_suggestions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_resources: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    exam_session: Mapped["ExamSession"] = relationship("ExamSession", back_populates="answers")
    question: Mapped["Question"] = relationship("Question", back_populates="exam_answers")
    flash_cards: Mapped[list["FlashCard"]] = relationship("FlashCard", back_populates="exam_answer")


class FlashCardReview(Base):
    __tablename__ = "flash_card_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    flash_card_id: Mapped[int] = mapped_column(Integer, ForeignKey("flash_cards.id"), nullable=False)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=1)
    next_review_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    last_review_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    review_count: Mapped[int] = mapped_column(Integer, default=0)

    user: Mapped["User"] = relationship("User", back_populates="flash_card_reviews")
    flash_card: Mapped["FlashCard"] = relationship("FlashCard", back_populates="reviews")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    related_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="notifications")
