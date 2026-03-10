from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_curator
from models import Organization, OrganizationMember, User
from schemas import OrgCreate, OrgMemberOut, OrgOut

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


def _get_org_id(user_id: int, db: Session):
    member = db.query(OrganizationMember).filter(OrganizationMember.user_id == user_id).first()
    return member.org_id if member else None


@router.post("", response_model=OrgOut, status_code=status.HTTP_201_CREATED)
def create_org(
    payload: OrgCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    existing_member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == current_user.id
    ).first()
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already belong to an organization.",
        )
    org = Organization(name=payload.name, owner_id=current_user.id)
    db.add(org)
    db.flush()
    member = OrganizationMember(org_id=org.id, user_id=current_user.id, role="owner")
    db.add(member)
    db.commit()
    db.refresh(org)
    return org


@router.get("/me", response_model=OrgOut)
def get_my_org(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == current_user.id
    ).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No organization found.")
    org = db.get(Organization, member.org_id)
    return org


@router.get("/me/members", response_model=List[OrgMemberOut])
def list_org_members(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    org_id = _get_org_id(current_user.id, db)
    if org_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No organization found.")
    members = db.query(OrganizationMember).filter(OrganizationMember.org_id == org_id).all()
    return members
