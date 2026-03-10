"""
AI service – uses OpenAI to grade exam answers and generate questions/flashcards.
Gracefully returns mock data when OPENAI_API_KEY is not set.
"""

import json
import logging
from typing import List, Optional, Dict, Any

from config import settings

logger = logging.getLogger(__name__)


def _get_client():
    if not settings.OPENAI_API_KEY:
        return None
    try:
        from openai import OpenAI
        return OpenAI(api_key=settings.OPENAI_API_KEY)
    except Exception as exc:
        logger.warning("OpenAI unavailable: %s", exc)
        return None


# ── Grading ───────────────────────────────────────────────────────────────────

GRADING_SYSTEM_PROMPT = """You are an expert educational assessor. Always respond in English.
Grade the student's answer to the question and return a JSON object with these fields:
- score: integer 0-10
- correct: boolean (true if score >= 7)
- feedback: brief constructive feedback (1-2 sentences)
- explanation: detailed explanation of the correct answer
- suggestions: specific improvement suggestions
- resources: suggested study resources or topics (comma-separated string)

Return ONLY valid JSON, no markdown, no extra text."""


def _mock_grade(question: str, answer: str) -> Dict[str, Any]:
    """Return plausible mock grading data when OpenAI is unavailable."""
    score = 5 if len(answer) > 20 else 2
    return {
        "score": score,
        "correct": score >= 7,
        "feedback": "Mock feedback: OpenAI API key not configured.",
        "explanation": f"The correct answer to '{question[:60]}...' requires deeper understanding.",
        "suggestions": "Review the relevant study materials and practice more examples.",
        "resources": "Course materials, textbook chapters, online tutorials",
    }


def grade_answer(question: str, answer: str) -> Dict[str, Any]:
    """Grade a single exam answer. Returns grading dict."""
    client = _get_client()
    if client is None:
        return _mock_grade(question, answer)

    prompt = f"Question: {question}\n\nStudent Answer: {answer}"
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": GRADING_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=600,
        )
        raw = response.choices[0].message.content.strip()
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.error("Could not parse grading JSON response")
        return _mock_grade(question, answer)
    except Exception as exc:
        logger.error("Grading API call failed: %s", exc)
        return _mock_grade(question, answer)


# ── Remediation Flash Cards ───────────────────────────────────────────────────

FLASHCARD_REMEDIATION_PROMPT = """You are an expert educator creating remediation flash cards. Always respond in English.
Given a question, the student's incorrect answer, and the correct explanation,
create {count} flash card(s) to help the student learn the material.

Return a JSON array of objects with fields:
- front: the question or prompt on the front of the card
- back: the answer or explanation on the back

Return ONLY valid JSON array, no markdown, no extra text."""


def generate_remediation_flashcards(
    question: str,
    answer: str,
    explanation: str,
    count: int = 2,
) -> List[Dict[str, str]]:
    """Generate remediation flashcards for a weak/wrong answer."""
    client = _get_client()
    if client is None:
        return [
            {
                "front": f"Review: {question[:100]}",
                "back": explanation[:300] if explanation else "Review the course material.",
            }
        ]

    user_msg = (
        f"Question: {question}\n"
        f"Student Answer: {answer}\n"
        f"Correct Explanation: {explanation}"
    )
    system = FLASHCARD_REMEDIATION_PROMPT.format(count=count)
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.5,
            max_tokens=800,
        )
        raw = response.choices[0].message.content.strip()
        cards = json.loads(raw)
        if isinstance(cards, list):
            return cards
        return []
    except Exception as exc:
        logger.error("Remediation flashcard generation failed: %s", exc)
        return [
            {
                "front": f"Review: {question[:100]}",
                "back": explanation[:300] if explanation else "Review the course material.",
            }
        ]


# ── Question Generation ────────────────────────────────────────────────────────

QUESTION_GEN_PROMPT = """You are an expert educator. Always respond in English.
Given the following educational content, generate {count} open-ended exam questions
that test deep understanding of the material.

Return a JSON array of strings (the questions only).
Return ONLY valid JSON array, no markdown, no extra text."""


def generate_questions_from_text(text: str, count: int = 5) -> List[str]:
    """Generate exam questions from document text."""
    client = _get_client()
    if client is None:
        return [f"Mock Question {i + 1}: Describe a key concept from the provided material." for i in range(count)]

    system = QUESTION_GEN_PROMPT.format(count=count)
    # Truncate text to avoid hitting token limits
    truncated = text[:8000]
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": truncated},
            ],
            temperature=0.7,
            max_tokens=1000,
        )
        raw = response.choices[0].message.content.strip()
        questions = json.loads(raw)
        if isinstance(questions, list):
            return [str(q) for q in questions]
        return []
    except Exception as exc:
        logger.error("Question generation failed: %s", exc)
        return [f"Mock Question {i + 1}: Explain a core concept from the material." for i in range(count)]


# ── Flash Card Generation ──────────────────────────────────────────────────────

FLASHCARD_GEN_PROMPT = """You are an expert educator. Always respond in English.
Given the following educational content, generate {count} flash cards
that help learners memorize and understand key concepts.

Return a JSON array of objects with fields:
- front: concise question or term
- back: clear answer or definition

Return ONLY valid JSON array, no markdown, no extra text."""


def generate_flashcards_from_text(text: str, count: int = 5) -> List[Dict[str, str]]:
    """Generate flash cards from document text."""
    client = _get_client()
    if client is None:
        return [
            {"front": f"Mock Card {i + 1} Front", "back": f"Mock Card {i + 1} Back"}
            for i in range(count)
        ]

    system = FLASHCARD_GEN_PROMPT.format(count=count)
    truncated = text[:8000]
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": truncated},
            ],
            temperature=0.6,
            max_tokens=1200,
        )
        raw = response.choices[0].message.content.strip()
        cards = json.loads(raw)
        if isinstance(cards, list):
            return cards
        return []
    except Exception as exc:
        logger.error("Flash card generation failed: %s", exc)
        return [
            {"front": f"Mock Card {i + 1} Front", "back": f"Mock Card {i + 1} Back"}
            for i in range(count)
        ]


# ── Short Answer Generation ───────────────────────────────────────────────────

SHORT_GEN_PROMPT = """You are an expert educator. Always respond in English.
Given the following educational content, generate {count} short-answer questions.
Each question should require a 1-2 sentence answer that tests factual recall or basic understanding.

Return a JSON array of strings (the questions only).
Return ONLY valid JSON array, no markdown, no extra text."""


def generate_short_from_text(text: str, count: int = 5) -> List[str]:
    """Generate short-answer questions from document text."""
    client = _get_client()
    if client is None:
        return [f"Mock Short Q {i+1}: Name a key term from the material." for i in range(count)]

    system = SHORT_GEN_PROMPT.format(count=count)
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": text[:8000]},
            ],
            temperature=0.6,
            max_tokens=800,
        )
        raw = response.choices[0].message.content.strip()
        questions = json.loads(raw)
        return [str(q) for q in questions] if isinstance(questions, list) else []
    except Exception as exc:
        logger.error("Short answer generation failed: %s", exc)
        return [f"Mock Short Q {i+1}: Name a key term from the material." for i in range(count)]


# ── True/False Generation ──────────────────────────────────────────────────────

TF_GEN_PROMPT = """You are an expert educator. Always respond in English.
Given the following educational content, generate {count} true/false questions.
Each statement should be clearly true or false based on the material.

Return a JSON array of objects with fields:
- question: the statement to evaluate
- correct: boolean (true if the statement is correct)

Return ONLY valid JSON array, no markdown, no extra text."""


def generate_true_false_from_text(text: str, count: int = 5) -> List[Dict[str, Any]]:
    """Generate true/false questions from document text."""
    client = _get_client()
    if client is None:
        return [
            {
                "question": f"Mock T/F {i+1}: This statement about the material is true.",
                "correct": i % 2 == 0,
            }
            for i in range(count)
        ]

    system = TF_GEN_PROMPT.format(count=count)
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": text[:8000]},
            ],
            temperature=0.6,
            max_tokens=1000,
        )
        raw = response.choices[0].message.content.strip()
        items = json.loads(raw)
        return items if isinstance(items, list) else []
    except Exception as exc:
        logger.error("True/False generation failed: %s", exc)
        return []


# ── MCQ Generation ────────────────────────────────────────────────────────────

MCQ_GEN_PROMPT = """You are an expert educator. Always respond in English.
Given the following educational content, generate {count} multiple-choice questions.
Each question must have exactly 4 answer choices labeled A, B, C, D.
Exactly one choice must be correct. Distractors should be plausible but clearly wrong.

Return a JSON array of objects with fields:
- question: the question text
- choices: array of {{label, text, correct}} objects

Return ONLY valid JSON array, no markdown, no extra text."""


def generate_mcq_from_text(text: str, count: int = 5) -> List[Dict[str, Any]]:
    """Generate MCQ questions with choices from document text."""
    client = _get_client()
    if client is None:
        return [
            {
                "question": f"Mock MCQ {i + 1}: Which of the following best describes a key concept?",
                "choices": [
                    {"label": "A", "text": "Correct answer", "correct": True},
                    {"label": "B", "text": "Wrong answer B", "correct": False},
                    {"label": "C", "text": "Wrong answer C", "correct": False},
                    {"label": "D", "text": "Wrong answer D", "correct": False},
                ],
            }
            for i in range(count)
        ]

    system = MCQ_GEN_PROMPT.format(count=count)
    truncated = text[:8000]
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": truncated},
            ],
            temperature=0.6,
            max_tokens=2000,
        )
        raw = response.choices[0].message.content.strip()
        items = json.loads(raw)
        if isinstance(items, list):
            return items
        return []
    except Exception as exc:
        logger.error("MCQ generation failed: %s", exc)
        return []


# ── Batch Grading ─────────────────────────────────────────────────────────────

def grade_exam_answers(
    qa_pairs: List[Dict[str, str]]
) -> List[Dict[str, Any]]:
    """
    Grade multiple question-answer pairs.
    qa_pairs: list of {"question": ..., "answer": ...}
    Returns list of grading dicts in the same order.
    """
    results = []
    for pair in qa_pairs:
        result = grade_answer(pair["question"], pair["answer"])
        results.append(result)
    return results
