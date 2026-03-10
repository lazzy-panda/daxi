from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_db():
    """Add org_id columns to existing SQLite tables if they don't already exist."""
    migrations = [
        ("allowlist", "org_id", "INTEGER"),
        ("documents", "org_id", "INTEGER"),
        ("questions", "org_id", "INTEGER"),
        ("flash_cards", "org_id", "INTEGER"),
        ("exam_sessions", "org_id", "INTEGER"),
        ("users", "email_verified", "INTEGER DEFAULT 0"),
        ("users", "verification_token", "TEXT"),
        ("users", "reset_token", "TEXT"),
        ("users", "reset_token_expires", "DATETIME"),
        ("questions", "question_type", "TEXT DEFAULT 'open'"),
        ("questions", "choices", "TEXT"),
        ("exam_sessions", "certificate_token", "TEXT"),
    ]
    with engine.connect() as conn:
        for table, column, col_type in migrations:
            try:
                # Check if column already exists
                result = conn.execute(
                    __import__("sqlalchemy").text(f"PRAGMA table_info({table})")
                )
                existing_columns = [row[1] for row in result]
                if column not in existing_columns:
                    conn.execute(
                        __import__("sqlalchemy").text(
                            f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"
                        )
                    )
                    conn.commit()
            except Exception:
                pass  # Table may not exist yet; create_all will handle it


def init_db():
    from models import (  # noqa: F401
        User, AllowlistEntry, Document, KnowledgeChunk,
        Question, FlashCard, ExamSession, ExamAnswer,
        FlashCardReview, Notification, Organization, OrganizationMember,
    )
    Base.metadata.create_all(bind=engine)
    migrate_db()
