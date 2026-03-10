"""
Stripe Billing router.
Supports Stripe Checkout (redirect flow) + Customer Portal + Webhooks.
Degrades gracefully when STRIPE_SECRET_KEY is not set.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from dependencies import require_curator
from models import AllowlistEntry, Document, Organization, OrganizationMember, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])

# ── Plan definitions ────────────────────────────────────────────────────────

PLANS = {
    "free": {
        "name": "Free",
        "price_monthly": 0,
        "max_users": 5,
        "max_docs": 10,
        "features": ["5 users", "10 documents", "AI grading", "Flashcards"],
    },
    "pro": {
        "name": "Pro",
        "price_monthly": 29,
        "max_users": 50,
        "max_docs": None,  # unlimited
        "features": ["50 users", "Unlimited documents", "AI grading", "Flashcards", "Analytics", "Certificates"],
    },
    "business": {
        "name": "Business",
        "price_monthly": 99,
        "max_users": 200,
        "max_docs": None,
        "features": ["200 users", "Unlimited documents", "AI grading", "Flashcards", "Analytics", "Certificates", "Priority support"],
    },
}


def _get_stripe():
    if not settings.STRIPE_SECRET_KEY:
        return None
    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        return stripe
    except ImportError:
        logger.warning("stripe package not installed")
        return None


def _get_org(user_id: int, db: Session) -> Optional[Organization]:
    member = db.query(OrganizationMember).filter(OrganizationMember.user_id == user_id).first()
    if not member:
        return None
    return db.get(Organization, member.org_id)


def _get_usage(org_id: int, db: Session) -> dict:
    users = db.query(AllowlistEntry).filter(AllowlistEntry.org_id == org_id).count()
    docs = db.query(Document).filter(Document.org_id == org_id).count()
    return {"users": users, "docs": docs}


# ── Schemas ─────────────────────────────────────────────────────────────────

class PlanOut(BaseModel):
    key: str
    name: str
    price_monthly: int
    max_users: Optional[int]
    max_docs: Optional[int]
    features: list[str]


class BillingStatusOut(BaseModel):
    plan: str
    plan_name: str
    max_users: Optional[int]
    max_docs: Optional[int]
    usage_users: int
    usage_docs: int
    stripe_enabled: bool
    manage_url: Optional[str] = None


class CheckoutRequest(BaseModel):
    plan: str  # "pro" or "business"


class CheckoutOut(BaseModel):
    checkout_url: str


class PortalOut(BaseModel):
    portal_url: str


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/plans", response_model=list[PlanOut])
def get_plans():
    return [PlanOut(key=k, **v) for k, v in PLANS.items()]


@router.get("/status", response_model=BillingStatusOut)
def billing_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    org = _get_org(current_user.id, db)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    plan_key = org.plan or "free"
    plan = PLANS.get(plan_key, PLANS["free"])
    usage = _get_usage(org.id, db)
    return BillingStatusOut(
        plan=plan_key,
        plan_name=plan["name"],
        max_users=plan["max_users"],
        max_docs=plan["max_docs"],
        usage_users=usage["users"],
        usage_docs=usage["docs"],
        stripe_enabled=bool(settings.STRIPE_SECRET_KEY),
    )


@router.post("/checkout", response_model=CheckoutOut)
def create_checkout(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    if payload.plan not in ("pro", "business"):
        raise HTTPException(status_code=400, detail="Invalid plan. Choose 'pro' or 'business'.")

    stripe = _get_stripe()
    if not stripe:
        raise HTTPException(
            status_code=503,
            detail="Stripe is not configured. Set STRIPE_SECRET_KEY.",
        )

    price_id = settings.STRIPE_PRO_PRICE_ID if payload.plan == "pro" else settings.STRIPE_BUSINESS_PRICE_ID
    if not price_id:
        raise HTTPException(
            status_code=503,
            detail=f"Price ID for '{payload.plan}' plan is not configured.",
        )

    org = _get_org(current_user.id, db)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")

    frontend = settings.FRONTEND_URL.rstrip("/")
    try:
        # Reuse existing Stripe customer if possible
        customer_id = org.stripe_customer_id
        if not customer_id:
            customer = stripe.Customer.create(
                email=current_user.email,
                metadata={"org_id": str(org.id), "org_name": org.name},
            )
            customer_id = customer.id
            org.stripe_customer_id = customer_id
            db.commit()

        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{frontend}/(curator)/billing?success=1",
            cancel_url=f"{frontend}/(curator)/billing?canceled=1",
            metadata={"org_id": str(org.id), "plan": payload.plan},
            allow_promotion_codes=True,
        )
        return CheckoutOut(checkout_url=session.url)
    except Exception as exc:
        logger.error("Stripe checkout failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/portal", response_model=PortalOut)
def customer_portal(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_curator),
):
    stripe = _get_stripe()
    if not stripe:
        raise HTTPException(status_code=503, detail="Stripe is not configured.")

    org = _get_org(current_user.id, db)
    if not org or not org.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No active subscription found.")

    frontend = settings.FRONTEND_URL.rstrip("/")
    try:
        session = stripe.billing_portal.Session.create(
            customer=org.stripe_customer_id,
            return_url=f"{frontend}/(curator)/billing",
        )
        return PortalOut(portal_url=session.url)
    except Exception as exc:
        logger.error("Stripe portal failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    stripe = _get_stripe()
    if not stripe:
        return {"status": "stripe not configured"}

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig, settings.STRIPE_WEBHOOK_SECRET or ""
        )
    except Exception as exc:
        logger.error("Webhook signature verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type in ("checkout.session.completed", "customer.subscription.updated"):
        org_id_str = data.get("metadata", {}).get("org_id") or data.get("metadata", {}).get("org_id")
        plan_key = data.get("metadata", {}).get("plan")
        customer_id = data.get("customer")
        subscription_id = data.get("subscription") or data.get("id")

        # For subscription events, look up the org by customer_id
        if not org_id_str and customer_id:
            org = db.query(Organization).filter(Organization.stripe_customer_id == customer_id).first()
            if org:
                org_id_str = str(org.id)

        if org_id_str:
            org = db.get(Organization, int(org_id_str))
            if org:
                if plan_key:
                    org.plan = plan_key
                if customer_id:
                    org.stripe_customer_id = customer_id
                if subscription_id:
                    org.stripe_subscription_id = subscription_id
                db.commit()
                logger.info("Updated org %s → plan=%s", org_id_str, plan_key)

    elif event_type == "customer.subscription.deleted":
        customer_id = data.get("customer")
        if customer_id:
            org = db.query(Organization).filter(Organization.stripe_customer_id == customer_id).first()
            if org:
                org.plan = "free"
                org.stripe_subscription_id = None
                db.commit()
                logger.info("Subscription cancelled for org %s → downgraded to free", org.id)

    return {"status": "ok"}
