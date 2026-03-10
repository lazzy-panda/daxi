from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models import User, Organization, OrganizationMember

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: Optional[int] = payload.get("sub")
        if user_id is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    user = db.get(User, int(user_id))
    if user is None or not user.is_active:
        raise credentials_exc
    return user


def require_curator(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "curator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Curator role required",
        )
    return current_user


def require_examinee(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "examinee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Examinee role required",
        )
    return current_user


def get_current_org(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Optional[Organization]:
    member = db.query(OrganizationMember).filter(OrganizationMember.user_id == current_user.id).first()
    if member is None:
        return None
    return db.get(Organization, member.org_id)


def require_org(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Organization:
    member = db.query(OrganizationMember).filter(OrganizationMember.user_id == current_user.id).first()
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You don't belong to any organization. Create one first.",
        )
    return db.get(Organization, member.org_id)
