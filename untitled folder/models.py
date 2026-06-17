from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class EmailOrderCandidate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    gmail_message_id: str
    platform: Optional[str] = None
    order_id: Optional[str] = None
    return_id: Optional[str] = None
    status: Optional[str] = None
    product_name: Optional[str] = None
    product_url: Optional[HttpUrl] = None
    delivery_date: Optional[date] = None
    return_date: Optional[date] = None
    price: Optional[str] = None
    invoice_url: Optional[HttpUrl] = None
    email_subject: Optional[str] = None


class ProductDetails(BaseModel):
    model_config = ConfigDict(extra="ignore")

    product_name: Optional[str] = None
    brand: Optional[str] = None
    return_policy_text: Optional[str] = None
    return_days: Optional[int] = Field(default=None, ge=0)
    exchange_days: Optional[int] = Field(default=None, ge=0)
    warranty_information: Optional[str] = None
    warranty_months: Optional[int] = Field(default=None, ge=0)
    is_returnable: Optional[bool] = None


class OrderRecord(BaseModel):
    id: Optional[int] = None
    platform: Optional[str] = None
    order_id: Optional[str] = None
    product_name: Optional[str] = None
    product_url: Optional[str] = None
    delivery_date: Optional[date] = None
    return_days: Optional[int] = None
    return_deadline: Optional[date] = None
    warranty_months: Optional[int] = None
    warranty_expiry: Optional[date] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Reminder(BaseModel):
    order_id: Optional[str] = None
    product_name: Optional[str] = None
    message: str
    due_date: date
    reminder_type: str
