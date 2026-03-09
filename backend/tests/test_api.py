"""
Comprehensive API tests for Daxi backend.
Uses an in-memory SQLite DB so no production data is touched.
"""
import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app
from models import AllowlistEntry, User
from passlib.context import CryptContext

# ── Test database setup ───────────────────────────────────────────────────────

TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _seed_curator(email="curator@test.com", password="Password1!"):
    db = TestingSession()
    entry = AllowlistEntry(email=email, role="curator")
    db.add(entry)
    user = User(email=email, password_hash=pwd_context.hash(password), role="curator")
    db.add(user)
    db.commit()
    db.close()
    return email, password


def _seed_examinee(email="exam@test.com", password="Password1!"):
    db = TestingSession()
    entry = AllowlistEntry(email=email, role="examinee")
    db.add(entry)
    user = User(email=email, password_hash=pwd_context.hash(password), role="examinee")
    db.add(user)
    db.commit()
    db.close()
    return email, password


def _login(email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200
    return r.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _curator_token():
    email, pw = _seed_curator()
    return _login(email, pw)


def _examinee_token():
    email, pw = _seed_examinee()
    return _login(email, pw)


def _seed_questions(n=10):
    from models import Question
    db = TestingSession()
    for i in range(n):
        db.add(Question(content=f"Question {i+1}?", source_type="manual"))
    db.commit()
    db.close()


# ── Auth ──────────────────────────────────────────────────────────────────────

class TestAuth:
    def test_login_success(self):
        email, pw = _seed_curator()
        r = client.post("/api/auth/login", json={"email": email, "password": pw})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == email
        assert data["user"]["role"] == "curator"

    def test_login_wrong_password(self):
        email, _ = _seed_curator()
        r = client.post("/api/auth/login", json={"email": email, "password": "wrong"})
        assert r.status_code == 401

    def test_login_unknown_email(self):
        r = client.post("/api/auth/login", json={"email": "nobody@test.com", "password": "x"})
        assert r.status_code == 401

    def test_login_inactive_user(self):
        email, pw = _seed_curator(email="inactive@test.com")
        db = TestingSession()
        u = db.query(User).filter(User.email == email).first()
        u.is_active = False
        db.commit()
        db.close()
        r = client.post("/api/auth/login", json={"email": email, "password": pw})
        assert r.status_code == 403

    def test_register_success(self):
        db = TestingSession()
        db.add(AllowlistEntry(email="new@test.com", role="examinee"))
        db.commit()
        db.close()
        r = client.post("/api/auth/register", json={"email": "new@test.com", "password": "Password1!"})
        assert r.status_code == 201
        data = r.json()
        assert "access_token" in data
        assert data["user"]["email"] == "new@test.com"

    def test_register_not_on_allowlist(self):
        r = client.post("/api/auth/register", json={"email": "nobody@test.com", "password": "Password1!"})
        assert r.status_code == 403

    def test_register_duplicate_email(self):
        db = TestingSession()
        db.add(AllowlistEntry(email="dup@test.com", role="examinee"))
        db.add(User(email="dup@test.com", password_hash=pwd_context.hash("x"), role="examinee"))
        db.commit()
        db.close()
        r = client.post("/api/auth/register", json={"email": "dup@test.com", "password": "Password1!"})
        assert r.status_code == 409

    def test_me_authenticated(self):
        token = _curator_token()
        r = client.get("/api/auth/me", headers=_auth(token))
        assert r.status_code == 200
        assert r.json()["role"] == "curator"

    def test_me_unauthenticated(self):
        r = client.get("/api/auth/me")
        assert r.status_code == 401

    def test_me_invalid_token(self):
        r = client.get("/api/auth/me", headers=_auth("badtoken"))
        assert r.status_code == 401


# ── Allowlist ─────────────────────────────────────────────────────────────────

class TestAllowlist:
    def test_list_as_curator(self):
        token = _curator_token()
        r = client.get("/api/allowlist", headers=_auth(token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_as_examinee_forbidden(self):
        token = _examinee_token()
        r = client.get("/api/allowlist", headers=_auth(token))
        assert r.status_code == 403

    def test_add_entry(self):
        token = _curator_token()
        r = client.post("/api/allowlist", json={"email": "newuser@test.com", "role": "examinee"},
                        headers=_auth(token))
        assert r.status_code == 201
        data = r.json()
        assert data["email"] == "newuser@test.com"
        assert data["role"] == "examinee"
        assert "used" in data

    def test_add_duplicate_entry(self):
        token = _curator_token()
        client.post("/api/allowlist", json={"email": "dup2@test.com", "role": "examinee"},
                    headers=_auth(token))
        r = client.post("/api/allowlist", json={"email": "dup2@test.com", "role": "examinee"},
                        headers=_auth(token))
        assert r.status_code == 409

    def test_add_invalid_role(self):
        token = _curator_token()
        r = client.post("/api/allowlist", json={"email": "x@test.com", "role": "admin"},
                        headers=_auth(token))
        assert r.status_code == 422

    def test_delete_entry(self):
        token = _curator_token()
        r = client.post("/api/allowlist", json={"email": "todel@test.com", "role": "examinee"},
                        headers=_auth(token))
        entry_id = r.json()["id"]
        r = client.delete(f"/api/allowlist/{entry_id}", headers=_auth(token))
        assert r.status_code == 204

    def test_delete_nonexistent(self):
        token = _curator_token()
        r = client.delete("/api/allowlist/9999", headers=_auth(token))
        assert r.status_code == 404

    def test_used_field_reflects_registered_user(self):
        token = _curator_token()
        # Add entry and register a user
        client.post("/api/allowlist", json={"email": "used@test.com", "role": "examinee"},
                    headers=_auth(token))
        client.post("/api/auth/register", json={"email": "used@test.com", "password": "Password1!"})
        r = client.get("/api/allowlist", headers=_auth(token))
        entries = {e["email"]: e for e in r.json()}
        assert entries["used@test.com"]["used"] is True


# ── Documents ─────────────────────────────────────────────────────────────────

class TestDocuments:
    def test_list_empty(self):
        token = _curator_token()
        r = client.get("/api/documents", headers=_auth(token))
        assert r.status_code == 200
        assert r.json() == []

    def test_list_examinee_forbidden(self):
        token = _examinee_token()
        r = client.get("/api/documents", headers=_auth(token))
        assert r.status_code == 403

    def test_upload_txt(self):
        token = _curator_token()
        content = b"Hello world"
        r = client.post("/api/documents/upload",
                        headers=_auth(token),
                        files={"file": ("test.txt", io.BytesIO(content), "text/plain")})
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "test.txt"
        assert data["status"] == "processing"

    def test_upload_unsupported_type(self):
        token = _curator_token()
        r = client.post("/api/documents/upload",
                        headers=_auth(token),
                        files={"file": ("bad.exe", io.BytesIO(b"x"), "application/octet-stream")})
        assert r.status_code == 400

    def test_delete_document(self):
        token = _curator_token()
        r = client.post("/api/documents/upload",
                        headers=_auth(token),
                        files={"file": ("del.txt", io.BytesIO(b"content"), "text/plain")})
        doc_id = r.json()["id"]
        r = client.delete(f"/api/documents/{doc_id}", headers=_auth(token))
        assert r.status_code == 204

    def test_delete_nonexistent(self):
        token = _curator_token()
        r = client.delete("/api/documents/9999", headers=_auth(token))
        assert r.status_code == 404


# ── Questions ─────────────────────────────────────────────────────────────────

class TestQuestions:
    def _get_token(self):
        return _curator_token()

    def test_list_empty(self):
        token = self._get_token()
        r = client.get("/api/questions", headers=_auth(token))
        assert r.status_code == 200
        assert r.json() == []

    def test_create_question(self):
        token = self._get_token()
        r = client.post("/api/questions", json={"content": "What is 2+2?"},
                        headers=_auth(token))
        assert r.status_code == 201
        assert r.json()["content"] == "What is 2+2?"

    def test_create_question_empty_content(self):
        token = self._get_token()
        r = client.post("/api/questions", json={"content": ""},
                        headers=_auth(token))
        assert r.status_code in (400, 422)

    def test_update_question(self):
        token = self._get_token()
        r = client.post("/api/questions", json={"content": "Old?"},
                        headers=_auth(token))
        qid = r.json()["id"]
        r = client.put(f"/api/questions/{qid}", json={"content": "New?"},
                       headers=_auth(token))
        assert r.status_code == 200
        assert r.json()["content"] == "New?"

    def test_delete_question(self):
        token = self._get_token()
        r = client.post("/api/questions", json={"content": "Delete me?"},
                        headers=_auth(token))
        qid = r.json()["id"]
        r = client.delete(f"/api/questions/{qid}", headers=_auth(token))
        assert r.status_code == 204

    def test_examinee_cannot_create(self):
        token = _examinee_token()
        r = client.post("/api/questions", json={"content": "Hack?"},
                        headers=_auth(token))
        assert r.status_code == 403


# ── Flashcards ────────────────────────────────────────────────────────────────

class TestFlashcards:
    def test_list_empty(self):
        token = _curator_token()
        r = client.get("/api/flashcards", headers=_auth(token))
        assert r.status_code == 200
        assert r.json() == []

    def test_create_flashcard(self):
        token = _curator_token()
        r = client.post("/api/flashcards",
                        json={"front": "Question side", "back": "Answer side"},
                        headers=_auth(token))
        assert r.status_code == 201
        data = r.json()
        assert data["front"] == "Question side"
        assert data["back"] == "Answer side"

    def test_examinee_cannot_create(self):
        token = _examinee_token()
        r = client.post("/api/flashcards",
                        json={"front": "Q", "back": "A"},
                        headers=_auth(token))
        assert r.status_code == 403

    def test_delete_flashcard(self):
        token = _curator_token()
        r = client.post("/api/flashcards",
                        json={"front": "Del Q", "back": "Del A"},
                        headers=_auth(token))
        cid = r.json()["id"]
        r = client.delete(f"/api/flashcards/{cid}", headers=_auth(token))
        assert r.status_code == 204

    def test_study_queue_empty(self):
        token = _examinee_token()
        r = client.get("/api/flashcards/study", headers=_auth(token))
        assert r.status_code == 200
        assert r.json() == []

    def test_study_queue_has_new_cards(self):
        c_token = _curator_token()
        client.post("/api/flashcards", json={"front": "F", "back": "B"}, headers=_auth(c_token))
        e_token = _examinee_token()
        r = client.get("/api/flashcards/study", headers=_auth(e_token))
        assert r.status_code == 200
        cards = r.json()
        assert len(cards) == 1
        assert "source" in cards[0]

    def test_review_flashcard(self):
        c_token = _curator_token()
        r = client.post("/api/flashcards", json={"front": "F", "back": "B"}, headers=_auth(c_token))
        cid = r.json()["id"]
        e_token = _examinee_token()
        r = client.post(f"/api/flashcards/{cid}/review",
                        json={"difficulty": "easy"},
                        headers=_auth(e_token))
        assert r.status_code == 200
        data = r.json()
        assert data["interval_days"] == 7  # easy → 7 days

    def test_review_invalid_difficulty(self):
        c_token = _curator_token()
        r = client.post("/api/flashcards", json={"front": "F", "back": "B"}, headers=_auth(c_token))
        cid = r.json()["id"]
        e_token = _examinee_token()
        r = client.post(f"/api/flashcards/{cid}/review",
                        json={"difficulty": "very_hard"},
                        headers=_auth(e_token))
        assert r.status_code == 422

    def test_import_json(self):
        token = _curator_token()
        r = client.post("/api/flashcards/import/json",
                        json=[{"front": "A", "back": "B"}, {"front": "C", "back": "D"}],
                        headers=_auth(token))
        assert r.status_code == 201
        assert len(r.json()) == 2


# ── Exams ─────────────────────────────────────────────────────────────────────

class TestExams:
    def test_eligibility_no_history(self):
        token = _examinee_token()
        r = client.get("/api/exams/eligibility", headers=_auth(token))
        assert r.status_code == 200
        assert r.json()["eligible"] is True

    def test_start_not_enough_questions(self):
        token = _examinee_token()
        r = client.post("/api/exams/start", headers=_auth(token))
        assert r.status_code == 400
        assert "Not enough questions" in r.json()["detail"]

    def test_start_exam(self):
        _seed_questions(10)
        token = _examinee_token()
        r = client.post("/api/exams/start", headers=_auth(token))
        assert r.status_code == 201
        data = r.json()
        assert "id" in data
        assert len(data["questions"]) == 10
        assert "text" in data["questions"][0]
        assert data["status"] == "in_progress"

    def test_start_exam_curator_allowed(self):
        _seed_questions(10)
        token = _curator_token()
        r = client.post("/api/exams/start", headers=_auth(token))
        assert r.status_code == 201

    def test_submit_exam(self):
        _seed_questions(10)
        token = _examinee_token()
        session = client.post("/api/exams/start", headers=_auth(token)).json()
        sid = session["id"]
        answers = [{"question_id": q["id"], "answer_text": f"Answer {i}"}
                   for i, q in enumerate(session["questions"])]
        r = client.post(f"/api/exams/{sid}/submit",
                        json={"answers": answers},
                        headers=_auth(token))
        assert r.status_code == 200
        data = r.json()
        assert "id" in data

    def test_submit_wrong_session(self):
        _seed_questions(10)
        token = _examinee_token()
        r = client.post("/api/exams/9999/submit",
                        json={"answers": []},
                        headers=_auth(token))
        assert r.status_code == 404

    def test_cannot_submit_other_user_session(self):
        _seed_questions(10)
        e1_email, e1_pw = _seed_examinee(email="e1@test.com")
        e2_email, e2_pw = _seed_examinee(email="e2@test.com")
        t1 = _login(e1_email, e1_pw)
        t2 = _login(e2_email, e2_pw)
        session = client.post("/api/exams/start", headers=_auth(t1)).json()
        sid = session["id"]
        r = client.post(f"/api/exams/{sid}/submit",
                        json={"answers": []},
                        headers=_auth(t2))
        assert r.status_code == 403

    def test_get_exam_result(self):
        _seed_questions(10)
        token = _examinee_token()
        session = client.post("/api/exams/start", headers=_auth(token)).json()
        answers = [{"question_id": q["id"], "answer_text": "test"}
                   for q in session["questions"]]
        submit = client.post(f"/api/exams/{session['id']}/submit",
                             json={"answers": answers}, headers=_auth(token)).json()
        result_id = submit["id"]
        r = client.get(f"/api/exams/results/{result_id}", headers=_auth(token))
        assert r.status_code == 200
        data = r.json()
        assert "total_score" in data
        assert "max_score" in data
        assert "percentage" in data
        assert "passed" in data
        assert "question_results" in data

    def test_history_empty(self):
        token = _examinee_token()
        r = client.get("/api/exams/history", headers=_auth(token))
        assert r.status_code == 200
        assert r.json() == []

    def test_history_after_exam(self):
        _seed_questions(10)
        token = _examinee_token()
        session = client.post("/api/exams/start", headers=_auth(token)).json()
        answers = [{"question_id": q["id"], "answer_text": "ans"} for q in session["questions"]]
        client.post(f"/api/exams/{session['id']}/submit", json={"answers": answers}, headers=_auth(token))
        r = client.get("/api/exams/history", headers=_auth(token))
        assert r.status_code == 200
        history = r.json()
        assert len(history) == 1
        assert "completed_at" in history[0]
        assert "total_score" in history[0]
        assert "percentage" in history[0]

    def test_eligibility_in_cooldown(self):
        _seed_questions(10)
        token = _examinee_token()
        session = client.post("/api/exams/start", headers=_auth(token)).json()
        answers = [{"question_id": q["id"], "answer_text": "ans"} for q in session["questions"]]
        client.post(f"/api/exams/{session['id']}/submit", json={"answers": answers}, headers=_auth(token))
        r = client.get("/api/exams/eligibility", headers=_auth(token))
        assert r.status_code == 200
        data = r.json()
        assert data["eligible"] is False
        assert data["days_until_next_attempt"] is not None
        assert data["message"] is not None


# ── Results (curator) ─────────────────────────────────────────────────────────

class TestResults:
    def test_all_results_empty(self):
        token = _curator_token()
        r = client.get("/api/results", headers=_auth(token))
        assert r.status_code == 200
        assert r.json() == []

    def test_all_results_examinee_forbidden(self):
        token = _examinee_token()
        r = client.get("/api/results", headers=_auth(token))
        assert r.status_code == 403

    def test_all_results_after_exam(self):
        _seed_questions(10)
        e_token = _examinee_token()
        session = client.post("/api/exams/start", headers=_auth(e_token)).json()
        answers = [{"question_id": q["id"], "answer_text": "a"} for q in session["questions"]]
        client.post(f"/api/exams/{session['id']}/submit", json={"answers": answers}, headers=_auth(e_token))

        c_token = _curator_token()
        r = client.get("/api/results", headers=_auth(c_token))
        assert r.status_code == 200
        results = r.json()
        assert len(results) == 1
        assert "user_email" in results[0]
        assert "total_score" in results[0]
        assert "percentage" in results[0]

    def test_get_result_by_id(self):
        _seed_questions(10)
        e_token = _examinee_token()
        session = client.post("/api/exams/start", headers=_auth(e_token)).json()
        answers = [{"question_id": q["id"], "answer_text": "a"} for q in session["questions"]]
        submit = client.post(f"/api/exams/{session['id']}/submit",
                             json={"answers": answers}, headers=_auth(e_token)).json()

        c_token = _curator_token()
        r = client.get(f"/api/results/{submit['id']}", headers=_auth(c_token))
        assert r.status_code == 200
        data = r.json()
        assert "question_results" in data
        assert len(data["question_results"]) == 10

    def test_examinee_can_view_own_result(self):
        _seed_questions(10)
        e_token = _examinee_token()
        session = client.post("/api/exams/start", headers=_auth(e_token)).json()
        answers = [{"question_id": q["id"], "answer_text": "a"} for q in session["questions"]]
        submit = client.post(f"/api/exams/{session['id']}/submit",
                             json={"answers": answers}, headers=_auth(e_token)).json()
        r = client.get(f"/api/results/{submit['id']}", headers=_auth(e_token))
        assert r.status_code == 200

    def test_examinee_cannot_view_other_result(self):
        _seed_questions(10)
        e1_email, e1_pw = _seed_examinee(email="re1@test.com")
        e2_email, e2_pw = _seed_examinee(email="re2@test.com")
        t1 = _login(e1_email, e1_pw)
        t2 = _login(e2_email, e2_pw)
        session = client.post("/api/exams/start", headers=_auth(t1)).json()
        answers = [{"question_id": q["id"], "answer_text": "a"} for q in session["questions"]]
        submit = client.post(f"/api/exams/{session['id']}/submit",
                             json={"answers": answers}, headers=_auth(t1)).json()
        r = client.get(f"/api/results/{submit['id']}", headers=_auth(t2))
        assert r.status_code == 403


# ── Notifications ─────────────────────────────────────────────────────────────

class TestNotifications:
    def test_list_empty(self):
        token = _examinee_token()
        r = client.get("/api/notifications", headers=_auth(token))
        assert r.status_code == 200
        assert r.json() == []

    def test_unread_count_zero(self):
        token = _examinee_token()
        r = client.get("/api/notifications/unread-count", headers=_auth(token))
        assert r.status_code == 200
        assert r.json()["count"] == 0

    def test_notifications_created_after_exam(self):
        _seed_questions(10)
        e_token = _examinee_token()
        session = client.post("/api/exams/start", headers=_auth(e_token)).json()
        answers = [{"question_id": q["id"], "answer_text": "ans"} for q in session["questions"]]
        client.post(f"/api/exams/{session['id']}/submit", json={"answers": answers}, headers=_auth(e_token))

        r = client.get("/api/notifications", headers=_auth(e_token))
        assert r.status_code == 200
        assert len(r.json()) >= 1

        r = client.get("/api/notifications/unread-count", headers=_auth(e_token))
        assert r.json()["count"] >= 1

    def test_mark_read(self):
        _seed_questions(10)
        e_token = _examinee_token()
        session = client.post("/api/exams/start", headers=_auth(e_token)).json()
        answers = [{"question_id": q["id"], "answer_text": "ans"} for q in session["questions"]]
        client.post(f"/api/exams/{session['id']}/submit", json={"answers": answers}, headers=_auth(e_token))

        notifs = client.get("/api/notifications", headers=_auth(e_token)).json()
        nid = notifs[0]["id"]
        r = client.patch(f"/api/notifications/{nid}/read", headers=_auth(e_token))
        assert r.status_code == 200
        assert r.json()["read"] is True

    def test_mark_all_read(self):
        _seed_questions(10)
        e_token = _examinee_token()
        session = client.post("/api/exams/start", headers=_auth(e_token)).json()
        answers = [{"question_id": q["id"], "answer_text": "ans"} for q in session["questions"]]
        client.post(f"/api/exams/{session['id']}/submit", json={"answers": answers}, headers=_auth(e_token))

        r = client.post("/api/notifications/read-all", headers=_auth(e_token))
        assert r.status_code == 204

        r = client.get("/api/notifications/unread-count", headers=_auth(e_token))
        assert r.json()["count"] == 0

    def test_delete_notification(self):
        _seed_questions(10)
        e_token = _examinee_token()
        session = client.post("/api/exams/start", headers=_auth(e_token)).json()
        answers = [{"question_id": q["id"], "answer_text": "ans"} for q in session["questions"]]
        client.post(f"/api/exams/{session['id']}/submit", json={"answers": answers}, headers=_auth(e_token))

        notifs = client.get("/api/notifications", headers=_auth(e_token)).json()
        nid = notifs[0]["id"]
        r = client.delete(f"/api/notifications/{nid}", headers=_auth(e_token))
        assert r.status_code == 204

    def test_cannot_read_other_notification(self):
        _seed_questions(10)
        e1_email, e1_pw = _seed_examinee(email="n1@test.com")
        e2_email, e2_pw = _seed_examinee(email="n2@test.com")
        t1 = _login(e1_email, e1_pw)
        t2 = _login(e2_email, e2_pw)
        session = client.post("/api/exams/start", headers=_auth(t1)).json()
        answers = [{"question_id": q["id"], "answer_text": "a"} for q in session["questions"]]
        client.post(f"/api/exams/{session['id']}/submit", json={"answers": answers}, headers=_auth(t1))

        notifs = client.get("/api/notifications", headers=_auth(t1)).json()
        nid = notifs[0]["id"]
        r = client.patch(f"/api/notifications/{nid}/read", headers=_auth(t2))
        assert r.status_code == 403

    def test_unauthenticated_cannot_access(self):
        r = client.get("/api/notifications")
        assert r.status_code == 401


# ── Health check ──────────────────────────────────────────────────────────────

class TestHealth:
    def test_health(self):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
