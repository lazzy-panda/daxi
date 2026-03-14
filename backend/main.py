import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from database import init_db
from routers import auth, allowlist, documents, questions, flashcards, exams, results, notifications, organizations, analytics, billing

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
app.include_router(analytics.router)
app.include_router(billing.router)

# ── Static file serving for uploads ──────────────────────────────────────────
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    # Ensure persistent data directories exist (e.g. Railway volume)
    for path in [settings.UPLOAD_DIR, settings.CHROMA_PATH]:
        os.makedirs(path, exist_ok=True)
    db_dir = os.path.dirname(settings.DATABASE_URL.replace("sqlite:///", ""))
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
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


# ── Public certificate page ────────────────────────────────────────────────────
@app.get("/certificate/{token}", response_class=HTMLResponse, include_in_schema=False)
def view_certificate(token: str):
    from database import SessionLocal
    from models import ExamSession, User, Organization
    db = SessionLocal()
    try:
        session = db.query(ExamSession).filter(ExamSession.certificate_token == token).first()
        if not session:
            raise HTTPException(status_code=404, detail="Certificate not found")
        user = db.get(User, session.user_id)
        org = db.get(Organization, session.org_id) if session.org_id else None

        email = user.email if user else "Unknown"
        org_name = org.name if org else "Daxi"
        score = f"{session.score:.1f}" if session.score is not None else "—"
        date = session.submitted_at.strftime("%B %d, %Y") if session.submitted_at else "—"

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Certificate of Completion — {org_name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@400;500;600&display=swap');
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: 'Inter', sans-serif;
    background: #f8f7f4;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }}
  .cert {{
    background: #ffffff;
    width: 100%;
    max-width: 780px;
    padding: 60px 72px;
    border: 2px solid #e5e0d8;
    position: relative;
    box-shadow: 0 8px 40px rgba(0,0,0,0.08);
  }}
  .cert::before {{
    content: '';
    position: absolute;
    inset: 10px;
    border: 1px solid #d4c9b8;
    pointer-events: none;
  }}
  .logo {{
    font-family: 'Playfair Display', serif;
    font-size: 18px;
    font-weight: 700;
    color: #3b82f6;
    letter-spacing: 3px;
    text-transform: uppercase;
    text-align: center;
    margin-bottom: 36px;
  }}
  .seal {{
    width: 72px; height: 72px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 32px;
    font-size: 32px;
  }}
  h1 {{
    font-family: 'Playfair Display', serif;
    font-size: 36px;
    font-weight: 700;
    color: #1a1a2e;
    text-align: center;
    margin-bottom: 8px;
    letter-spacing: 0.5px;
  }}
  .subtitle {{
    font-size: 13px;
    color: #9ca3af;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 44px;
  }}
  .divider {{
    height: 1px;
    background: linear-gradient(to right, transparent, #d4c9b8, transparent);
    margin: 0 auto 44px;
    width: 80%;
  }}
  .present {{ font-size: 14px; color: #6b7280; text-align: center; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }}
  .recipient {{
    font-family: 'Playfair Display', serif;
    font-size: 32px;
    font-weight: 400;
    color: #1a1a2e;
    text-align: center;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 12px;
    margin-bottom: 44px;
    font-style: italic;
  }}
  .body-text {{
    font-size: 15px;
    color: #4b5563;
    text-align: center;
    line-height: 1.8;
    margin-bottom: 44px;
    max-width: 520px;
    margin-left: auto;
    margin-right: auto;
  }}
  .score-row {{
    display: flex;
    justify-content: center;
    gap: 48px;
    margin-bottom: 48px;
  }}
  .score-item {{ text-align: center; }}
  .score-value {{
    font-family: 'Playfair Display', serif;
    font-size: 28px;
    font-weight: 700;
    color: #3b82f6;
  }}
  .score-label {{ font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px; }}
  .footer {{
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-top: 1px solid #e5e7eb;
    padding-top: 32px;
    margin-top: 12px;
  }}
  .sig {{ text-align: center; flex: 1; }}
  .sig-line {{ width: 120px; height: 1px; background: #9ca3af; margin: 0 auto 8px; }}
  .sig-name {{ font-size: 12px; color: #6b7280; }}
  .badge {{
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 24px;
    padding: 8px 20px;
    font-size: 13px;
    font-weight: 600;
    color: #16a34a;
    text-align: center;
  }}
  .print-btn {{
    margin-top: 24px;
    padding: 10px 28px;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
  }}
  .print-btn:hover {{ background: #2563eb; }}
  @media print {{
    body {{ background: #fff; padding: 0; }}
    .cert {{ box-shadow: none; max-width: 100%; }}
    .print-btn, .print-hint {{ display: none; }}
  }}
</style>
</head>
<body>
<div class="cert">
  <div class="logo">Daxi</div>
  <div class="seal">🎓</div>
  <h1>Certificate of Completion</h1>
  <div class="subtitle">This certifies that</div>
  <div class="divider"></div>

  <div class="present">The following individual has successfully completed</div>
  <div class="recipient">{email}</div>

  <p class="body-text">
    has successfully passed the knowledge assessment administered by
    <strong>{org_name}</strong> on the Daxi learning platform, demonstrating
    proficiency in the required subject matter.
  </p>

  <div class="score-row">
    <div class="score-item">
      <div class="score-value">{score}%</div>
      <div class="score-label">Final Score</div>
    </div>
    <div class="score-item">
      <div class="score-value">85%</div>
      <div class="score-label">Passing Threshold</div>
    </div>
    <div class="score-item">
      <div class="score-value">{date}</div>
      <div class="score-label">Date Issued</div>
    </div>
  </div>

  <div class="footer">
    <div class="sig">
      <div class="sig-line"></div>
      <div class="sig-name">{org_name}</div>
    </div>
    <div class="badge">✓ Verified by Daxi</div>
    <div class="sig">
      <div class="sig-line"></div>
      <div class="sig-name">Daxi AI Platform</div>
    </div>
  </div>
</div>

<button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
<p class="print-hint" style="margin-top:8px;font-size:12px;color:#9ca3af;">
  Use your browser's Print dialog → Save as PDF
</p>
</body>
</html>"""
        return HTMLResponse(content=html)
    finally:
        db.close()


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
