from __future__ import annotations

import csv
import json
import logging
import os
import re
from contextlib import asynccontextmanager
from datetime import date, timedelta
from calendar import monthrange
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import FastAPI

from app.database import Database
from app.email_parser import EmailParser
from app.gmail_client import GmailClient
from app.models import OrderRecord
from app.product_scraper import ProductScraperService
from app.reminder_service import ReminderService
from app.scheduler import SchedulerService

load_dotenv()
PURCHASES_QUERY = "category:purchases newer_than:180d"


def configure_logging() -> None:
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


class OrderTrackerApp:
    def __init__(self) -> None:
        self.database = Database(os.getenv("DATABASE_PATH", "data/orders.db"))
        self.gmail = GmailClient(
            credentials_file=os.getenv("GMAIL_CREDENTIALS_FILE", "credentials.json"),
            token_file=os.getenv("GMAIL_TOKEN_FILE", "token.json"),
        )
        self.email_parser = EmailParser()
        self.scraper = ProductScraperService()
        self.reminder_service = ReminderService(self.database)
        self.scheduler = SchedulerService(
            self.reminder_service,
            timezone=os.getenv("SCHEDULER_TIMEZONE", "Asia/Kolkata"),
        )

    def startup(self) -> None:
        self.database.init_db()
        self.scheduler.start()

    def shutdown(self) -> None:
        self.scheduler.stop()

    def ingest_orders(self) -> dict[str, Any]:
        query = PURCHASES_QUERY
        max_results = int(os.getenv("GMAIL_MAX_RESULTS", "100"))
        processed = 0
        discovered = 0
        skipped = 0

        for message in self.gmail.fetch_messages(query=query, max_results=max_results):
            if self.database.is_email_processed(message.message_id):
                skipped += 1
                continue

            candidate = self.email_parser.parse(
                gmail_message_id=message.message_id,
                subject=message.subject,
                html=message.html_body,
                message_date=message.message_date,
            )
            logging.getLogger(__name__).info("Email processed: %s", message.message_id)
            if not candidate.product_url:
                self.database.mark_email_processed(message.message_id)
                skipped += 1
                continue

            try:
                details = self.scraper.scrape_product_details(str(candidate.product_url))
            except Exception as exc:
                logging.getLogger(__name__).exception("Failed scraping URL %s: %s", candidate.product_url, exc)
                self.database.mark_email_processed(message.message_id)
                skipped += 1
                continue

            delivery_date = candidate.delivery_date
            return_deadline = self.database.calculate_return_deadline(delivery_date, details.return_days)
            warranty_expiry = self.database.calculate_warranty_expiry(delivery_date, details.warranty_months)

            order = OrderRecord(
                platform=candidate.platform,
                order_id=candidate.order_id,
                product_name=details.product_name or candidate.product_name,
                product_url=str(candidate.product_url),
                delivery_date=delivery_date,
                return_days=details.return_days,
                return_deadline=return_deadline,
                warranty_months=details.warranty_months,
                warranty_expiry=warranty_expiry,
            )
            self.database.insert_order(order)
            self.database.mark_email_processed(message.message_id)
            processed += 1
            discovered += 1
            logging.getLogger(__name__).info(
                "Order discovered: order_id=%s platform=%s product=%s",
                order.order_id,
                order.platform,
                (order.product_name or "N/A")[:100],
            )

        return {"query": query, "processed": processed, "discovered": discovered, "skipped": skipped}

    def reprocess_orders(self) -> dict[str, Any]:
        # Full rebuild from email source to refresh extracted fields (e.g. order_id).
        self.database.clear_orders()
        self.database.clear_processed_emails()
        logging.getLogger(__name__).info("Reprocess started: cleared orders and processed-email markers")
        result = self.ingest_orders()
        result["reprocessed"] = True
        return result

    def export_orders_sheet(self, output_path: str | None = None) -> dict[str, Any]:
        sheet_path = Path(output_path or os.getenv("ORDERS_SHEET_PATH", "data/order_reference_sheet.csv"))
        sheet_path.parent.mkdir(parents=True, exist_ok=True)
        rows = self.database.list_orders()
        today = date.today()

        with sheet_path.open("w", newline="", encoding="utf-8") as csv_file:
            writer = csv.writer(csv_file)
            writer.writerow(
                [
                    "id",
                    "platform",
                    "order_id",
                    "product_name",
                    "product_url",
                    "delivery_date",
                    "return_days",
                    "return_deadline",
                    "return_status",
                    "warranty_months",
                    "warranty_expiry",
                    "warranty_status",
                    "created_at",
                ]
            )
            for row in rows:
                return_deadline = row["return_deadline"]
                warranty_expiry = row["warranty_expiry"]
                return_status = self._date_status(return_deadline, today)
                warranty_status = self._date_status(warranty_expiry, today)
                export_order_id = row["order_id"] or f"MISSING-{row['id']}"
                writer.writerow(
                    [
                        row["id"],
                        row["platform"],
                        export_order_id,
                        row["product_name"],
                        row["product_url"],
                        row["delivery_date"],
                        row["return_days"],
                        return_deadline,
                        return_status,
                        row["warranty_months"],
                        warranty_expiry,
                        warranty_status,
                        row["created_at"],
                    ]
                )

        logging.getLogger(__name__).info("Order sheet exported: path=%s rows=%d", sheet_path, len(rows))
        return {"path": str(sheet_path), "rows": len(rows)}

    def export_orders_json(self, output_path: str | None = None) -> dict[str, Any]:
        json_path = Path(output_path or os.getenv("ORDERS_JSON_PATH", "data/order_reference_sheet.json"))
        json_path.parent.mkdir(parents=True, exist_ok=True)
        rows = self.database.list_orders()
        today = date.today()
        seen_order_ids: set[str] = set()
        seen_product_urls: set[str] = set()
        orders: list[dict[str, Any]] = []
        for row in rows:
            order_id = (row["order_id"] or "").strip()
            product_url = (row["product_url"] or "").strip()
            canonical_product_url = self._canonical_product_url(product_url)
            if order_id:
                if order_id in seen_order_ids:
                    continue
                seen_order_ids.add(order_id)
            elif canonical_product_url:
                if canonical_product_url in seen_product_urls:
                    continue
                seen_product_urls.add(canonical_product_url)

            return_deadline = row["return_deadline"]
            warranty_expiry = row["warranty_expiry"]
            orders.append(
                {
                    "id": row["id"],
                    "platform": row["platform"],
                    "order_id": row["order_id"] or f"MISSING-{row['id']}",
                    "product_name": row["product_name"],
                    "product_url": row["product_url"],
                    "delivery_date": row["delivery_date"],
                    "return_days": row["return_days"],
                    "return_deadline": return_deadline,
                    "return_status": self._date_status(return_deadline, today),
                    "warranty_months": row["warranty_months"],
                    "warranty_expiry": warranty_expiry,
                    "warranty_status": self._date_status(warranty_expiry, today),
                    "created_at": row["created_at"],
                }
            )

        payload = {"query": PURCHASES_QUERY, "count": len(orders), "orders": orders}
        json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        logging.getLogger(__name__).info("Order JSON exported: path=%s rows=%d", json_path, len(orders))
        return {"path": str(json_path), "rows": len(orders), "query": PURCHASES_QUERY}

    def export_orders_json_from_gmail(self, output_path: str | None = None) -> dict[str, Any]:
        """Build order JSON directly from Gmail parse output (DB-independent)."""
        json_path = Path(output_path or os.getenv("ORDERS_JSON_PATH", "data/order_reference_sheet.json"))
        json_path.parent.mkdir(parents=True, exist_ok=True)
        max_results = int(os.getenv("GMAIL_MAX_RESULTS", "100"))
        seen_order_ids: set[str] = set()
        seen_product_urls: set[str] = set()
        orders: list[dict[str, Any]] = []
        ajio_index_by_url: dict[str, int] = {}
        myntra_index_by_order_id: dict[str, int] = {}
        myntra_index_by_return_id: dict[str, int] = {}
        policy_days_by_url: dict[str, int | None] = {}
        returnable_by_url: dict[str, bool | None] = {}
        warranty_months_by_url: dict[str, int | None] = {}
        today = date.today()

        for message in self.gmail.fetch_messages(query=PURCHASES_QUERY, max_results=max_results):
            candidate = self.email_parser.parse(
                gmail_message_id=message.message_id,
                subject=message.subject,
                html=message.html_body,
                message_date=message.message_date,
            )

            # Keep only likely order rows. Myntra often lacks clean product URLs in mails,
            # so allow platform+order_id rows too.
            if not candidate.platform or (not candidate.product_url and candidate.platform != "Myntra"):
                continue

            order_id = (candidate.order_id or "").strip()
            return_id = (candidate.return_id or "").strip()
            product_url = str(candidate.product_url).strip() if candidate.product_url else ""
            canonical_product_url = self._canonical_product_url(product_url)

            # AJIO-specific normalization:
            # - FN... is order_id
            # - RT... is return_id
            if candidate.platform == "AJIO":
                if order_id.upper().startswith("RT"):
                    return_id = order_id
                    order_id = ""

                # Merge AJIO entries for same product URL so FN and RT land in one record.
                existing_idx = ajio_index_by_url.get(canonical_product_url)
                if existing_idx is not None:
                    existing = orders[existing_idx]
                    if not existing.get("order_id") and re.match(r"^FN\d{8,}$", order_id, re.IGNORECASE):
                        existing["order_id"] = order_id
                    if not existing.get("return_id") and re.match(r"^RT\d{8,}$", return_id, re.IGNORECASE):
                        existing["return_id"] = return_id
                    if not existing.get("price") and candidate.price:
                        existing["price"] = candidate.price
                    if not existing.get("delivery_date") and message.message_date:
                        existing["delivery_date"] = message.message_date.isoformat()
                    continue
            elif candidate.platform == "Myntra":
                # Merge Myntra updates by order id when available (e.g., return updates
                # and order updates arrive as separate emails).
                if return_id:
                    existing_idx = myntra_index_by_return_id.get(return_id)
                    if existing_idx is not None:
                        existing = orders[existing_idx]
                        if not existing.get("order_id") and order_id:
                            existing["order_id"] = order_id
                        if not existing.get("price") and candidate.price:
                            existing["price"] = candidate.price
                        if not existing.get("return_date") and candidate.return_date:
                            existing["return_date"] = candidate.return_date.isoformat()
                        if not existing.get("delivery_date") and message.message_date:
                            existing["delivery_date"] = message.message_date.isoformat()
                        continue
                if order_id:
                    existing_idx = myntra_index_by_order_id.get(order_id)
                    if existing_idx is not None:
                        existing = orders[existing_idx]
                        if not existing.get("return_id") and return_id:
                            existing["return_id"] = return_id
                        if not existing.get("price") and candidate.price:
                            existing["price"] = candidate.price
                        if not existing.get("return_date") and candidate.return_date:
                            existing["return_date"] = candidate.return_date.isoformat()
                        if not existing.get("delivery_date") and message.message_date:
                            existing["delivery_date"] = message.message_date.isoformat()
                        continue
            if order_id:
                if order_id in seen_order_ids:
                    continue
                seen_order_ids.add(order_id)
            elif canonical_product_url:
                if canonical_product_url in seen_product_urls:
                    continue
                seen_product_urls.add(canonical_product_url)

            policy_window_days = policy_days_by_url.get(canonical_product_url)
            warranty_months = warranty_months_by_url.get(canonical_product_url)
            if canonical_product_url not in policy_days_by_url:
                try:
                    details = self.scraper.scrape_product_details(product_url)
                    policy_window_days = details.return_days or details.exchange_days
                    is_returnable = details.is_returnable
                    warranty_months = details.warranty_months
                except Exception as exc:
                    logging.getLogger(__name__).warning(
                        "Policy scrape failed for %s: %s",
                        product_url,
                        exc,
                    )
                    policy_window_days = None
                    is_returnable = None
                    warranty_months = None
                policy_days_by_url[canonical_product_url] = policy_window_days
                returnable_by_url[canonical_product_url] = is_returnable
                warranty_months_by_url[canonical_product_url] = warranty_months
            else:
                is_returnable = returnable_by_url.get(canonical_product_url)
                warranty_months = warranty_months_by_url.get(canonical_product_url)

            delivery_date_value = candidate.delivery_date or message.message_date
            return_by_date: date | None = None
            return_days_left: int | None = None
            warranty_expiry: date | None = None
            if is_returnable is False:
                return_by_date = None
                return_days_left = None
                policy_window_days = None
            elif delivery_date_value and policy_window_days:
                return_by_date = delivery_date_value + timedelta(days=policy_window_days)
                return_days_left = (return_by_date - today).days
            if delivery_date_value and warranty_months:
                warranty_expiry = self._add_months(delivery_date_value, warranty_months)

            orders.append(
                {
                    "gmail_message_id": candidate.gmail_message_id,
                    "platform": candidate.platform,
                    "order_id": order_id or None,
                    "return_id": return_id or None,
                    "return_date": candidate.return_date.isoformat() if candidate.return_date else None,
                    "status": candidate.status or "Pending",
                    "is_returnable": is_returnable,
                    "return_window_days": policy_window_days,
                    "return_by_date": return_by_date.isoformat() if return_by_date else None,
                    "return_days_left": return_days_left,
                    "return_highlight": "NON_RETURNABLE" if is_returnable is False else None,
                    "price": candidate.price,
                    "warranty_months": warranty_months,
                    "warranty_expiry": warranty_expiry.isoformat() if warranty_expiry else None,
                    "product_name": candidate.product_name,
                    "product_url": product_url,
                    "delivery_date": (
                        candidate.delivery_date.isoformat()
                        if candidate.delivery_date
                        else (message.message_date.isoformat() if message.message_date else None)
                    ),
                    "invoice_url": str(candidate.invoice_url) if candidate.invoice_url else None,
                    "email_subject": candidate.email_subject,
                }
            )
            if candidate.platform == "AJIO":
                ajio_index_by_url[canonical_product_url] = len(orders) - 1
            elif candidate.platform == "Myntra" and order_id:
                myntra_index_by_order_id[order_id] = len(orders) - 1
            if candidate.platform == "Myntra" and return_id:
                myntra_index_by_return_id[return_id] = len(orders) - 1

        for order in orders:
            if not order.get("order_id"):
                order["order_id"] = f"MISSING-{order['gmail_message_id']}"

        payload = {"query": PURCHASES_QUERY, "count": len(orders), "orders": orders, "source": "gmail"}
        json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        logging.getLogger(__name__).info("Order JSON (gmail) exported: path=%s rows=%d", json_path, len(orders))
        return {"path": str(json_path), "rows": len(orders), "query": PURCHASES_QUERY, "source": "gmail"}

    @staticmethod
    def _canonical_product_url(raw_url: str) -> str:
        if not raw_url:
            return ""
        parsed = urlparse(raw_url)
        if not parsed.scheme or not parsed.netloc:
            return raw_url
        # Query params are mostly tracking references; keep stable path only.
        return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

    @staticmethod
    def _date_status(date_value: str | None, today: date) -> str | None:
        if not date_value:
            return None
        try:
            target = date.fromisoformat(date_value)
        except ValueError:
            return "invalid_date"
        if target < today:
            return "expired"
        if target == today:
            return "due_today"
        return f"{(target - today).days}_days_left"

    @staticmethod
    def _add_months(base_date: date, months: int) -> date:
        year = base_date.year + (base_date.month - 1 + months) // 12
        month = (base_date.month - 1 + months) % 12 + 1
        day = min(base_date.day, monthrange(year, month)[1])
        return date(year, month, day)


configure_logging()
order_tracker = OrderTrackerApp()


@asynccontextmanager
async def lifespan(_: FastAPI):
    order_tracker.startup()
    try:
        yield
    finally:
        order_tracker.shutdown()


app = FastAPI(title="Order Tracker", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ingest")
def ingest() -> dict[str, Any]:
    return order_tracker.ingest_orders()


@app.post("/ingest/reprocess")
def reprocess() -> dict[str, Any]:
    return order_tracker.reprocess_orders()


@app.post("/reminders/run")
def run_reminders() -> dict[str, str]:
    order_tracker.reminder_service.send_console_reminders()
    return {"status": "reminders processed"}


@app.post("/orders/sheet")
def export_orders_sheet() -> dict[str, Any]:
    return order_tracker.export_orders_sheet()


@app.get("/orders/json")
def export_orders_json() -> dict[str, Any]:
    return order_tracker.export_orders_json()


@app.get("/orders/json/gmail")
def export_orders_json_gmail() -> dict[str, Any]:
    return order_tracker.export_orders_json_from_gmail()
