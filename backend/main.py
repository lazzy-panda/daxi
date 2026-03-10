import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import settings
from database import init_db
from routers import auth, allowlist, documents, questions, flashcards, exams, results, notifications, organizations

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Daxi API",
    description="AI-powered learning platform backend",
    version="1.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(allowlist.router)
app.include_router(documents.router)
app.include_router(questions.router)
app.include_router(flashcards.router)
app.include_router(exams.router)
app.include_router(results.router)
app.include_router(notifications.router)
app.include_router(organizations.router)

# ── Static file serving for uploads ──────────────────────────────────────────
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    logger.info("Initialising database…")
    init_db()
    logger.info("Database ready.")
    _seed_curator()


def _seed_curator():
    seed_email = os.getenv("SEED_CURATOR_EMAIL")
    seed_password = os.getenv("SEED_CURATOR_PASSWORD")
    if not seed_email or not seed_password:
        return
    from database import SessionLocal
    from models import User, AllowlistEntry
    from passlib.context import CryptContext
    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.email == seed_email).first():
            if not db.query(AllowlistEntry).filter(AllowlistEntry.email == seed_email).first():
                db.add(AllowlistEntry(email=seed_email, role="curator"))
            db.add(User(email=seed_email, password_hash=pwd.hash(seed_password), role="curator", is_active=True))
            db.commit()
            logger.info(f"Seeded curator: {seed_email}")
    finally:
        db.close()


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", "app": "daxi"}


# ── Seed first curator (temporary) ────────────────────────────────────────────
@app.post("/seed-curator", include_in_schema=False)
def seed_curator(email: str, password: str, secret: str):
    if secret != settings.SECRET_KEY:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    from database import SessionLocal
    from models import User, AllowlistEntry
    from passlib.context import CryptContext
    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    db = SessionLocal()
    try:
        if not db.query(AllowlistEntry).filter(AllowlistEntry.email == email).first():
            db.add(AllowlistEntry(email=email, role="curator"))
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.role = "curator"
            user.is_active = True
            user.password_hash = pwd.hash(password)
        else:
            db.add(User(email=email, password_hash=pwd.hash(password), role="curator", is_active=True))
        db.commit()
        return {"status": "ok"}
    finally:
        db.close()
