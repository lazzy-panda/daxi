from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_curator
from models import AllowlistEntry, OrganizationMember, User
from schemas import AllowlistCreate, AllowlistOut


def _get_org_id(user_id: int, db: Session):
    member = db.query(OrganizationMember).filter(OrganizationMember.user_id == user_id).first()
    return member.org_id if member else None


def _with_used(entries: List[AllowlistEntry], db: Session) -> List[AllowlistOut]:
    emails_used = {
        u.email
        for u in db.query(User.email).filter(
            User.email.in_([e.email for e in entries])
        )
    }
    result = []
    for entry in entries:
        out = AllowlistOut.model_validate(entry)
        out.used = entry.email in emails_used
        result.append(out)
    return result

router = APIRouter(prefix="/api/allowlist", tags=["allowlist"])


@router.get("", response_model=List[AllowlistOut])
def list_allowlist(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    org_id = _get_org_id(current_user.id, db)
    query = db.query(AllowlistEntry)
    if org_id is not None:
        query = query.filter(AllowlistEntry.org_id == org_id)
    entries = query.order_by(AllowlistEntry.created_at.desc()).all()
    return _with_used(entries, db)


@router.post("", response_model=AllowlistOut, status_code=status.HTTP_201_CREATED)
def add_to_allowlist(
    payload: AllowlistCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    existing = db.query(AllowlistEntry).filter(AllowlistEntry.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already in allowlist.",
        )
    org_id = _get_org_id(current_user.id, db)
    entry = AllowlistEntry(
        email=payload.email,
        role=payload.role,
        added_by=current_user.id,
        org_id=org_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_from_allowlist(
    entry_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_curator),
):
    entry = db.get(AllowlistEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found.")
    db.delete(entry)
    db.commit()
