"""Seller-owned local drafts. No agent or PayPal side effects."""
import hashlib
import json
import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Literal
from uuid import uuid4
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from .models import InvoiceCase, InvoiceVersion

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

class ItemInput(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default='', max_length=2000)
    quantity: int = Field(strict=True, gt=0, le=1000000)
    unit_price: str

    @field_validator('unit_price')
    @classmethod
    def price(cls, value):
        if not re.fullmatch(r'\d{1,9}(\.\d{1,2})?', value) or Decimal(value) <= 0:
            raise ValueError('Enter a positive price with up to two decimal places.')
        return format(Decimal(value), '.2f')

class InvoiceInput(StrictModel):
    buyer_email: EmailStr = Field(max_length=254)
    currency: Literal['USD']
    items: list[ItemInput] = Field(min_length=1, max_length=100)
    note: str = Field(default='', max_length=2000)


def invoice_payload(body):
    payload = body.model_dump(mode='json')
    total = Decimal('0')
    for item in payload['items']:
        amount = Decimal(item['unit_price']) * item['quantity']
        item['line_total'] = format(amount, '.2f')
        total += amount
    payload['total'] = format(total, '.2f')
    return payload


def install_invoice_routes(app, seller_dependency):
    router = APIRouter()

    def serialize(case, version):
        return dict(version.payload, case_id=case.id, version=version.version,
                    review_status=case.review_state, paypal_invoice_id=None,
                    content_hash=version.content_hash)

    @router.post('/api/invoices', status_code=201)
    def create(body: InvoiceInput, request: Request, response: Response,
               operation_key: Annotated[str, Header(alias='Idempotency-Key', min_length=1, max_length=128)],
               data=Depends(seller_dependency)):
        seller_id = data[1].seller_id
        payload = invoice_payload(body)
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        with request.app.state.session_factory() as db:
            def existing_result():
                case = db.scalar(select(InvoiceCase).where(InvoiceCase.seller_id == seller_id, InvoiceCase.operation_key == operation_key))
                if not case:
                    return None
                version = db.get(InvoiceVersion, (case.id, 1))
                if version.content_hash != digest:
                    raise HTTPException(409, detail={'code':'IDEMPOTENCY_CONFLICT','message':'This save key was already used for different invoice details.'})
                response.status_code = 200
                return serialize(case, version)
            existing = existing_result()
            if existing:
                return existing
            case = InvoiceCase(id=str(uuid4()), seller_id=seller_id, operation_key=operation_key,
                               current_version=1, review_state='DRAFT', created_at=datetime.now(timezone.utc))
            version = InvoiceVersion(case_id=case.id, version=1, payload=payload, content_hash=digest,
                                     created_at=datetime.now(timezone.utc))
            try:
                db.add(case)
                db.flush()
                db.add(version)
                db.commit()
            except IntegrityError:
                db.rollback()
                existing = existing_result()
                if existing:
                    return existing
                raise
            return serialize(case, version)

    @router.get('/api/invoices/{case_id}')
    def get(case_id: str, request: Request, data=Depends(seller_dependency)):
        with request.app.state.session_factory() as db:
            case = db.get(InvoiceCase, case_id)
            if not case or case.seller_id != data[1].seller_id:
                raise HTTPException(404, detail={'code':'NOT_FOUND','message':'Invoice not found.'})
            return serialize(case, db.get(InvoiceVersion, (case.id, case.current_version)))

    app.include_router(router)
