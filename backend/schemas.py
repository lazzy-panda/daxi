from datetime import datetime, date
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, field_validator


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Allowlist ─────────────────────────────────────────────────────────────────

class AllowlistCreate(BaseModel):
    email: EmailStr
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("curator", "examinee"):
            raise ValueError("role must be 'curator' or 'examinee'")
        return v


class AllowlistOut(BaseModel):
    id: int
    email: str
    role: str
    added_by: Optional[int]
    created_at: datetime
    used: bool = False

    model_config = {"from_attributes": True}


# ── Documents ─────────────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: int
    filename: str
    original_filename: str
    name: Optional[str] = None
    file_type: str
    status: str
    uploaded_by: int
    created_at: datetime

    model_config = {"from_attributes": True}

    def model_post_init(self, __context: Any) -> None:
        if not self.name:
            self.name = self.original_filename or self.filename


class DocumentStatusOut(BaseModel):
    id: int
    status: str
    chunk_count: int

    model_config = {"from_attributes": True}


# ── Questions ─────────────────────────────────────────────────────────────────

class MCQChoice(BaseModel):
    label: str
    text: str


class MCQChoiceWithAnswer(MCQChoice):
    correct: bool


class QuestionCreate(BaseModel):
    # accept both 'content' (backend convention) and 'text' (frontend convention)
    content: Optional[str] = None
    text: Optional[str] = None

    def model_post_init(self, __context: Any) -> None:
        if not self.content and self.text:
            self.content = self.text
        if not self.content or not self.content.strip():
            raise ValueError("content/text must not be empty")


class QuestionGenerateRequest(BaseModel):
    document_id: int
    count: int = 5


class MCQGenerateRequest(BaseModel):
    document_id: int
    count: int = 5


class ShortGenerateRequest(BaseModel):
    document_id: int
    count: int = 5


class TrueFalseGenerateRequest(BaseModel):
    document_id: int
    count: int = 5


class QuestionImportItem(BaseModel):
    content: Optional[str] = None
    text: Optional[str] = None

    def model_post_init(self, __context: Any) -> None:
        if not self.content and self.text:
            self.content = self.text


class QuestionOut(BaseModel):
    id: int
    content: str
    text: str = ""
    question_type: str = "open"
    choices: Optional[List[MCQChoiceWithAnswer]] = None
    source_type: str
    source: Optional[str] = None
    auto_generated: bool = False
    source_document_id: Optional[int] = None
    created_at: datetime
    created_by: Optional[int] = None

    model_config = {"from_attributes": True}

    def model_post_init(self, __context: Any) -> None:
        self.text = self.content
        self.auto_generated = self.source_type == "ai_generated"
        self.source = {
            "manual": "Manual",
            "ai_generated": "AI",
            "imported": "Import",
        }.get(self.source_type, self.source_type)


# ── Flash Cards ───────────────────────────────────────────────────────────────

class FlashCardCreate(BaseModel):
    front: str
    back: str
    source_reference: Optional[str] = None


class FlashCardGenerateRequest(BaseModel):
    document_id: int
    count: int = 5


class FlashCardImportItem(BaseModel):
    front: str
    back: str
    source_reference: Optional[str] = None


class FlashCardOut(BaseModel):
    id: int
    front: str
    back: str
    source_reference: Optional[str]
    is_auto_generated: bool
    exam_answer_id: Optional[int]
    created_at: datetime
    created_by: Optional[int]

    model_config = {"from_attributes": True}


class FlashCardStudyOut(BaseModel):
    id: int
    front: str
    back: str
    source_reference: Optional[str]
    source: Optional[str] = None
    ease_factor: float
    interval_days: int
    next_review_date: Optional[date]
    review_count: int

    model_config = {"from_attributes": True}

    def model_post_init(self, __context: Any) -> None:
        if self.source is None:
            self.source = self.source_reference


class FlashCardReviewRequest(BaseModel):
    difficulty: str  # hard / medium / easy

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, v: str) -> str:
        if v not in ("hard", "medium", "easy"):
            raise ValueError("difficulty must be 'hard', 'medium', or 'easy'")
        return v


class FlashCardReviewOut(BaseModel):
    flash_card_id: int
    ease_factor: float
    interval_days: int
    next_review_date: date
    review_count: int

    model_config = {"from_attributes": True}


# ── Exams ─────────────────────────────────────────────────────────────────────

class EligibilityOut(BaseModel):
    eligible: bool
    reason: Optional[str] = None
    next_eligible_at: Optional[datetime] = None
    days_until_next_attempt: Optional[int] = None
    message: Optional[str] = None


class QuestionStart(BaseModel):
    id: int
    text: str
    question_type: str = "open"
    choices: Optional[List[MCQChoice]] = None  # no 'correct' exposed to examinee


class ExamStartOut(BaseModel):
    id: int
    questions: List[QuestionStart]
    started_at: datetime
    status: str


class QuestionResultOut(BaseModel):
    question_id: int
    question_text: str
    answer_text: str
    score: float
    max_score: float
    is_correct: bool
    feedback: Optional[str] = None
    explanation: Optional[str] = None
    suggestions: Optional[str] = None
    resources: Optional[List[str]] = None


class ExamResultOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    user_email: Optional[str] = None
    total_score: float
    max_score: float
    percentage: float
    passed: bool
    completed_at: datetime
    question_results: List[QuestionResultOut] = []


class ExamHistoryOut(BaseModel):
    id: int
    completed_at: datetime
    total_score: float
    max_score: float
    percentage: float
    passed: bool


class AnswerSubmit(BaseModel):
    question_id: int
    answer_text: str


class ExamSubmit(BaseModel):
    answers: List[AnswerSubmit]


class ExamAnswerOut(BaseModel):
    id: int
    question_id: int
    answer_text: str
    ai_score: Optional[float]
    ai_correct: Optional[bool]
    ai_feedback: Optional[str]
    ai_explanation: Optional[str]
    ai_suggestions: Optional[str]
    ai_resources: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ExamSessionOut(BaseModel):
    id: int
    user_id: int
    started_at: datetime
    submitted_at: Optional[datetime]
    score: Optional[float]
    passed: Optional[bool]
    status: str

    model_config = {"from_attributes": True}


# ── Results ───────────────────────────────────────────────────────────────────

class ExamResultDetail(BaseModel):
    session: ExamSessionOut
    answers: List[ExamAnswerOut]

    model_config = {"from_attributes": True}


# ── Organizations ─────────────────────────────────────────────────────────────

class OrgCreate(BaseModel):
    name: str


class OrgOut(BaseModel):
    id: int
    name: str
    owner_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class OrgMemberOut(BaseModel):
    id: int
    user_id: int
    role: str

    model_config = {"from_attributes": True}


# ── Notifications ─────────────────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: int
    user_id: int
    type: str
    message: str
    related_id: Optional[int]
    read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
