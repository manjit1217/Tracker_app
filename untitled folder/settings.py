from __future__ import annotations

from pydantic import BaseModel, Field


class AppSettings(BaseModel):
    gmail_credentials_file: str = Field(default="credentials.json")
    gmail_token_file: str = Field(default="token.json")
    gmail_query: str = Field(default="category:purchases newer_than:90d")
    gmail_max_results: int = Field(default=100)
    database_path: str = Field(default="data/orders.db")
    log_level: str = Field(default="INFO")
    scheduler_timezone: str = Field(default="Asia/Kolkata")
