from __future__ import annotations

import base64
import json
import logging
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from email import message_from_bytes
from typing import Any, Iterable

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import Resource, build
from googleapiclient.errors import HttpError

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
LOGGER = logging.getLogger(__name__)


@dataclass
class GmailMessage:
    message_id: str
    subject: str | None
    html_body: str
    message_date: date | None


class GmailClient:
    def __init__(self, credentials_file: str, token_file: str) -> None:
        self.credentials_file = credentials_file
        self.token_file = token_file
        self._service: Resource | None = None

    def _get_credentials(self) -> Credentials:
        creds: Credentials | None = None
        try:
            creds = Credentials.from_authorized_user_file(self.token_file, SCOPES)
        except Exception:
            LOGGER.info("No valid token file found, running OAuth flow")

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                self._validate_oauth_client_config()
                flow = InstalledAppFlow.from_client_secrets_file(self.credentials_file, SCOPES)
                # Use a deterministic redirect URI to avoid random-port mismatches.
                creds = flow.run_local_server(host="localhost", port=8080)
            with open(self.token_file, "w", encoding="utf-8") as token:
                token.write(creds.to_json())
        return creds

    def _validate_oauth_client_config(self) -> None:
        with open(self.credentials_file, "r", encoding="utf-8") as f:
            cfg = json.load(f)

        if "installed" in cfg:
            # Desktop credentials are preferred and work out-of-the-box.
            return

        if "web" in cfg:
            redirect_uris = cfg["web"].get("redirect_uris", [])
            expected_uri = "http://localhost:8080/"
            if expected_uri not in redirect_uris:
                raise ValueError(
                    "Invalid OAuth config for local auth. You are using a web client, "
                    f"but `{expected_uri}` is missing in redirect_uris. "
                    "Either switch to a Desktop OAuth client JSON, or add this redirect URI "
                    "in Google Cloud Console and update credentials.json."
                )
            return

        raise ValueError(
            "credentials.json must contain either `installed` or `web` OAuth client configuration."
        )

    def service(self) -> Resource:
        if self._service is None:
            creds = self._get_credentials()
            self._service = build("gmail", "v1", credentials=creds)
        return self._service

    def list_message_ids(self, query: str, max_results: int = 100) -> list[str]:
        resp = self._retry(
            lambda: self.service()
            .users()
            .messages()
            .list(userId="me", q=query, maxResults=max_results)
            .execute()
        )
        messages = resp.get("messages", [])
        return [m["id"] for m in messages if "id" in m]

    def fetch_message(self, message_id: str) -> GmailMessage:
        raw = self._retry(
            lambda: self.service()
            .users()
            .messages()
            .get(userId="me", id=message_id, format="raw")
            .execute()
        )
        mime_bytes = base64.urlsafe_b64decode(raw["raw"])
        parsed = message_from_bytes(mime_bytes)
        subject = parsed.get("Subject")
        html_body = self._extract_html(parsed)
        internal_ms_raw = raw.get("internalDate")
        message_date: date | None = None
        try:
            if internal_ms_raw is not None:
                message_date = datetime.fromtimestamp(int(internal_ms_raw) / 1000, tz=timezone.utc).date()
        except (ValueError, TypeError, OSError):
            LOGGER.debug("Could not parse internalDate for message %s", message_id)
        return GmailMessage(message_id=message_id, subject=subject, html_body=html_body, message_date=message_date)

    def fetch_messages(self, query: str, max_results: int = 100) -> Iterable[GmailMessage]:
        for message_id in self.list_message_ids(query, max_results=max_results):
            yield self.fetch_message(message_id)

    @staticmethod
    def _extract_html(email_message: Any) -> str:
        if email_message.is_multipart():
            for part in email_message.walk():
                if part.get_content_type() == "text/html":
                    payload = part.get_payload(decode=True) or b""
                    return payload.decode(errors="ignore")
            for part in email_message.walk():
                if part.get_content_type() == "text/plain":
                    payload = part.get_payload(decode=True) or b""
                    return f"<pre>{payload.decode(errors='ignore')}</pre>"
            return ""
        payload = email_message.get_payload(decode=True) or b""
        return payload.decode(errors="ignore")

    def _retry(self, fn: Any, attempts: int = 3, wait_seconds: float = 1.5) -> Any:
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                return fn()
            except HttpError as exc:
                last_error = exc
                LOGGER.warning("Gmail API call failed on attempt %s/%s", attempt, attempts)
                if attempt < attempts:
                    time.sleep(wait_seconds * attempt)
        if last_error:
            raise last_error
        raise RuntimeError("Unexpected retry failure state")
