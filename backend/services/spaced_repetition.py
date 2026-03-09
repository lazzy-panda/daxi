"""
Spaced repetition scheduling service.

Algorithm:
  - hard   → interval = 1 day,  ease_factor -= 0.2 (min 1.3)
  - medium → interval = 3 days  (ease_factor unchanged)
  - easy   → interval = 7 days (first review), else prev_interval * ease_factor
             ease_factor += 0.1 (max 3.0)
"""

from datetime import date, timedelta
from typing import Tuple


MIN_EASE = 1.3
MAX_EASE = 3.0

DIFFICULTY_BASE_INTERVALS = {
    "hard": 1,
    "medium": 3,
    "easy": 7,
}


def compute_next_review(
    difficulty: str,
    current_ease_factor: float,
    current_interval_days: int,
    review_count: int,
) -> Tuple[int, float, date]:
    """
    Returns (new_interval_days, new_ease_factor, next_review_date).
    """
    ease = current_ease_factor

    if difficulty == "hard":
        new_interval = 1
        ease = max(MIN_EASE, ease - 0.2)
    elif difficulty == "medium":
        new_interval = 3
        # ease_factor unchanged
    else:  # easy
        if review_count == 0:
            new_interval = DIFFICULTY_BASE_INTERVALS["easy"]
        else:
            new_interval = max(1, round(current_interval_days * ease))
        ease = min(MAX_EASE, ease + 0.1)

    next_date = date.today() + timedelta(days=new_interval)
    return new_interval, ease, next_date
