from __future__ import annotations

import logging
import re
from datetime import date, timedelta
from urllib.parse import parse_qs, urlparse

from bs4 import BeautifulSoup
from bs4.element import Tag
from dateutil import parser as date_parser

from app.models import EmailOrderCandidate
from app.url_classifier import URLType, classify_url
from app.url_extractor import extract_url_candidates, select_invoice_url, select_product_url
from app.utils import decode_mime_subject

LOGGER = logging.getLogger(__name__)

PLATFORM_PATTERNS: dict[str, str] = {
    "Amazon": r"amazon\.(in|com)",
    "Flipkart": r"flipkart\.com",
    "Myntra": r"myntra\.com",
    "AJIO": r"ajio\.com",
    "Croma": r"croma\.com",
    "Reliance Digital": r"reliancedigital\.in",
}

SUPPORTED_PRODUCT_DOMAINS = ("amazon.in", "flipkart.com", "myntra.com", "ajio.com")


def _compact_url(url: str, max_len: int = 120) -> str:
    parsed = urlparse(url)
    compact = f"{parsed.scheme}://{parsed.netloc}{parsed.path}" if parsed.scheme and parsed.netloc else url
    if len(compact) <= max_len:
        return compact
    return f"{compact[:max_len - 3]}..."


class EmailParser:
    ORDER_ID_PATTERNS = [
        re.compile(r"Order(?:\s*ID|\s*#)\s*[:\-]?\s*([A-Z0-9\-]{6,})", re.IGNORECASE),
        re.compile(r"order\s+number\s*[:\-]?\s*([A-Z0-9\-]{6,})", re.IGNORECASE),
        re.compile(r"\b(OD[A-Z0-9]{10,})\b", re.IGNORECASE),  # Flipkart order id
    ]
    DATE_PATTERNS = [
        re.compile(r"(Delivered(?:\s*on)?|Delivery Date)\s*[:\-]?\s*([^\n\r|]{1,80})", re.IGNORECASE),
    ]
    RETURN_DATE_PATTERNS = [
        re.compile(r"(?:return\s*pickup|pick\s*up)[^.\n\r]{0,60}\bby\b\s*([^\n\r|]{1,80})", re.IGNORECASE),
        re.compile(r"return\s*date\s*[:\-]?\s*([^\n\r|]{1,80})", re.IGNORECASE),
    ]
    STRICT_DATE_VALUE_PATTERN = re.compile(
        r"("
        r"\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b"  # 17/06/2026, 17-06-26
        r"|"
        r"\b\d{4}-\d{2}-\d{2}\b"  # 2026-06-17
        r"|"
        r"\b\d{1,2}\s+"
        r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)"
        r"[a-z]*"
        r"(?:\s+\d{2,4})?\b"  # 17 June 2026, 17 Jun
        r"|"
        r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)"
        r"[a-z]*\s+\d{1,2}(?:,\s*\d{2,4})?\b"  # June 17, 2026
        r")",
        re.IGNORECASE,
    )

    def parse(
        self,
        gmail_message_id: str,
        subject: str | None,
        html: str,
        message_date: date | None = None,
    ) -> EmailOrderCandidate:
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator=" ", strip=True)
        decoded_subject = decode_mime_subject(subject)
        url_candidates = extract_url_candidates(soup)
        product_candidate = select_product_url(url_candidates)
        invoice_candidate = select_invoice_url(url_candidates)

        type_counts: dict[str, int] = {}
        platform_counts: dict[str, int] = {}
        for candidate in url_candidates:
            type_counts[candidate.url_type.value] = type_counts.get(candidate.url_type.value, 0) + 1
            platform_key = candidate.platform or "unknown"
            platform_counts[platform_key] = platform_counts.get(platform_key, 0) + 1

        links = [candidate.resolved_url for candidate in url_candidates]
        platform = self._detect_platform(text, links)
        order_id = self._extract_order_id(text) or self._extract_order_id_from_urls(links)
        return_id: str | None = None
        if platform == "AJIO":
            ajio_order_id, ajio_return_id = self._extract_ajio_ids(text)
            if ajio_order_id:
                order_id = ajio_order_id
            return_id = ajio_return_id
        elif platform == "Myntra":
            myntra_order_id, myntra_return_id = self._extract_myntra_ids(text=text, subject=decoded_subject)
            if myntra_order_id:
                order_id = myntra_order_id
            if myntra_return_id:
                return_id = myntra_return_id
        elif platform == "Flipkart":
            flipkart_order_id = self._extract_flipkart_order_id(text=text, subject=decoded_subject, urls=links)
            if flipkart_order_id:
                order_id = flipkart_order_id
        status = self._extract_status(text=text, subject=decoded_subject)
        product_url = product_candidate.resolved_url if product_candidate else None
        if platform == "Myntra" and not product_url:
            product_url = self._recover_myntra_product_url(soup=soup, urls=links)
        product_name = self._extract_product_name(soup, decoded_subject)
        if platform == "Myntra":
            myntra_product_name = self._extract_myntra_product_name(soup)
            if myntra_product_name:
                product_name = myntra_product_name
        delivery_date = self._extract_delivery_date(
            text=text,
            message_date=message_date,
            platform=platform,
            subject=decoded_subject,
        )
        return_date = self._extract_return_date(text=text, subject=decoded_subject, platform=platform)
        price = self._extract_price(text=text, subject=decoded_subject, platform=platform, soup=soup)
        invoice_url = invoice_candidate.resolved_url if invoice_candidate else None

        LOGGER.info(
            (
                "Email parsed: id=%s platform=%s order_id=%s product=%s "
                "return_id=%s status=%s urls_total=%d url_types=%s url_platforms=%s product_url=%s invoice_url=%s"
            ),
            gmail_message_id,
            platform,
            order_id,
            return_id,
            status,
            (product_name or "N/A")[:80],
            len(url_candidates),
            type_counts,
            platform_counts,
            _compact_url(product_url) if product_url else None,
            _compact_url(invoice_url) if invoice_url else None,
        )

        return EmailOrderCandidate(
            gmail_message_id=gmail_message_id,
            platform=platform,
            order_id=order_id,
            return_id=return_id,
            status=status,
            product_name=product_name,
            product_url=product_url,
            delivery_date=delivery_date,
            return_date=return_date,
            price=price,
            invoice_url=invoice_url,
            email_subject=decoded_subject,
        )

    def _detect_platform(self, text: str, links: list[str]) -> str | None:
        content = f"{text} {' '.join(links)}"
        for platform, pattern in PLATFORM_PATTERNS.items():
            if re.search(pattern, content, re.IGNORECASE):
                return platform
        return None

    def _extract_order_id(self, text: str) -> str | None:
        # Normalize hidden bidirectional marks often present in HTML emails
        # (e.g. Amazon "Order #" snippets) so regex can match the order id.
        normalized = re.sub(r"[\u200e\u200f\u202a-\u202e\u2066-\u2069]", "", text)
        for pattern in self.ORDER_ID_PATTERNS:
            match = pattern.search(normalized)
            if match:
                return match.group(1).strip()
        return None

    def _extract_order_id_from_urls(self, urls: list[str]) -> str | None:
        for url in urls:
            try:
                parsed = urlparse(url)
                query = parse_qs(parsed.query)
            except Exception:
                continue

            for key in ("orderId", "orderID", "orderid"):
                values = query.get(key, [])
                for value in values:
                    candidate = value.strip()
                    if re.match(r"^\d{3}-\d{7}-\d{7}$", candidate):
                        return candidate
                    if re.match(r"^[A-Z0-9\-]{6,}$", candidate, re.IGNORECASE):
                        return candidate
        return None

    def _extract_ajio_ids(self, text: str) -> tuple[str | None, str | None]:
        normalized = re.sub(r"[\u200e\u200f\u202a-\u202e\u2066-\u2069]", "", text)
        order_match = re.search(r"\b(FN\d{8,})\b", normalized, re.IGNORECASE)
        return_match = re.search(r"\b(RT\d{8,})\b", normalized, re.IGNORECASE)
        order_id = order_match.group(1).upper() if order_match else None
        return_id = return_match.group(1).upper() if return_match else None
        return order_id, return_id

    def _extract_flipkart_order_id(self, text: str, subject: str | None, urls: list[str]) -> str | None:
        combined = re.sub(r"[\u200e\u200f\u202a-\u202e\u2066-\u2069]", "", f"{text} {subject or ''}")
        match = re.search(r"\b(OD[A-Z0-9]{10,})\b", combined, re.IGNORECASE)
        if match:
            return match.group(1).upper()

        # Fallback from query params in Flipkart links.
        for url in urls:
            try:
                parsed = urlparse(url)
                query = parse_qs(parsed.query)
            except Exception:
                continue
            for key in ("order_id", "orderId", "orderid"):
                for value in query.get(key, []):
                    candidate = value.strip()
                    if re.match(r"^OD[A-Z0-9]{10,}$", candidate, re.IGNORECASE):
                        return candidate.upper()
        return None

    def _extract_myntra_ids(self, text: str, subject: str | None) -> tuple[str | None, str | None]:
        combined = re.sub(r"[\u200e\u200f\u202a-\u202e\u2066-\u2069]", "", f"{text} {subject or ''}")

        # Myntra frequently uses 7-7-7 grouped numeric ids in transactional emails.
        order_patterns = [
            re.compile(r"order\s*(?:id|number)?\s*[:#-]?\s*(\d{7}-\d{7}-\d{7})", re.IGNORECASE),
            re.compile(r"order[_\s]?id\s*=\s*(\d{7}-\d{7}-\d{7})", re.IGNORECASE),
            re.compile(r"\border\s*(?:id|number)?\s*[:#-]?\s*(\d{10,})\b", re.IGNORECASE),
            re.compile(r"\b(\d{7}-\d{7}-\d{7})\b"),
        ]
        return_patterns = [
            re.compile(r"return\s*(?:request\s*)?id\s*[:#-]?\s*([A-Z0-9\-]{6,})", re.IGNORECASE),
            re.compile(r"\b(RT[A-Z0-9\-]{6,})\b", re.IGNORECASE),
        ]

        order_id: str | None = None
        for pattern in order_patterns:
            match = pattern.search(combined)
            if match:
                order_id = match.group(1).upper()
                break

        return_id: str | None = None
        for pattern in return_patterns:
            match = pattern.search(combined)
            if match:
                return_id = match.group(1).upper()
                break

        return order_id, return_id

    def _extract_myntra_product_name(self, soup: BeautifulSoup) -> str | None:
        """
        Myntra emails usually render product lines in HTML ids like:
        ItemProductBrandName-<id> and ItemProductName-<id>.
        Build a compact readable summary from those blocks.
        """
        products: list[str] = []
        seen: set[str] = set()

        brand_nodes = soup.find_all(id=re.compile(r"ItemProductBrandName-\d+", re.IGNORECASE))
        for brand_node in brand_nodes:
            if not isinstance(brand_node, Tag):
                continue
            brand_text = brand_node.get_text(" ", strip=True)
            if not brand_text:
                continue
            product_id_match = re.search(r"(\d+)$", str(brand_node.get("id", "")))
            if not product_id_match:
                continue
            product_id = product_id_match.group(1)
            name_node = soup.find(id=f"ItemProductName-{product_id}")
            name_text = name_node.get_text(" ", strip=True) if isinstance(name_node, Tag) else ""
            combined = f"{brand_text} - {name_text}".strip(" -")
            normalized = re.sub(r"\s+", " ", combined).strip()
            if normalized and normalized.lower() not in seen:
                products.append(normalized)
                seen.add(normalized.lower())

        if not products:
            return None
        if len(products) == 1:
            return products[0]
        return "; ".join(products[:3])

    def _extract_myntra_price(self, soup: BeautifulSoup) -> str | None:
        totals: list[float] = []
        for total_node in soup.find_all(id=re.compile(r"ItemTotal-\d+", re.IGNORECASE)):
            if not isinstance(total_node, Tag):
                continue
            raw = total_node.get_text(" ", strip=True)
            amount = self._parse_currency_amount(raw)
            if amount is not None:
                totals.append(amount)
        if not totals:
            return None
        # Myntra mails can include multiple line items, so sum visible item totals.
        return f"₹{sum(totals):.2f}"

    def _extract_price(
        self,
        text: str,
        subject: str | None,
        platform: str | None,
        soup: BeautifulSoup,
    ) -> str | None:
        if platform == "Myntra":
            myntra_price = self._extract_myntra_price(soup)
            if myntra_price:
                return myntra_price

        combined = f"{text} {subject or ''}"
        contextual_patterns = [
            re.compile(
                r"(?:order\s*total|item\s*total|amount\s*paid|total\s*amount|grand\s*total|price)\D{0,20}"
                r"(₹\s*[0-9][0-9,]*(?:\.\d{1,2})?)",
                re.IGNORECASE,
            ),
            re.compile(
                r"(?:order\s*total|item\s*total|amount\s*paid|total\s*amount|grand\s*total|price)\D{0,20}"
                r"(?:rs\.?|inr)\s*([0-9][0-9,]*(?:\.\d{1,2})?)",
                re.IGNORECASE,
            ),
        ]
        for pattern in contextual_patterns:
            match = pattern.search(combined)
            if not match:
                continue
            amount = self._parse_currency_amount(match.group(1))
            if amount is not None:
                return f"₹{amount:.2f}"

        generic_match = re.search(
            r"(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.\d{1,2})?)",
            combined,
            re.IGNORECASE,
        )
        if generic_match:
            amount = self._parse_currency_amount(generic_match.group(1))
            if amount is not None:
                return f"₹{amount:.2f}"
        return None

    @staticmethod
    def _parse_currency_amount(raw: str) -> float | None:
        if not raw:
            return None
        cleaned = re.sub(r"[^\d.,]", "", raw)
        if not cleaned:
            return None
        # Treat commas as thousand separators.
        normalized = cleaned.replace(",", "")
        try:
            return float(normalized)
        except ValueError:
            return None

    def _recover_myntra_product_url(self, soup: BeautifulSoup, urls: list[str]) -> str | None:
        # 1) Prefer direct Myntra links that are not tracking/invoice/order pages.
        for url in urls:
            parsed = urlparse(url)
            host = parsed.netloc.lower()
            if "myntra.com" not in host:
                continue
            url_type = classify_url(url)
            if url_type in {URLType.ORDER_PAGE, URLType.INVOICE, URLType.TRACKING}:
                continue
            if url_type == URLType.PRODUCT_PAGE:
                return url
            # Keep non-classified Myntra links as fallback if they carry style hints.
            query = parse_qs(parsed.query)
            for key in ("styleId", "style_id", "productId", "product_id", "pId", "pid"):
                values = query.get(key, [])
                if values and re.match(r"^\d{5,}$", values[0].strip()):
                    style_id = values[0].strip()
                    return f"https://www.myntra.com/{style_id}/buy"

        # 2) Fallback from Myntra image asset URLs in HTML, e.g. /assets/images/<styleId>/...
        for img in soup.find_all("img", src=True):
            src = str(img.get("src", ""))
            # Gmail proxy style can carry original URL in fragment after '#'
            if "#" in src:
                src = src.split("#", 1)[1]
            src = src.strip()
            if "assets.myntassets.com" not in src:
                continue
            match = re.search(r"/assets/images/(\d{5,})/", src)
            if match:
                style_id = match.group(1)
                return f"https://www.myntra.com/{style_id}/buy"
        return None

    def _extract_product_name(self, soup: BeautifulSoup, subject: str | None) -> str | None:
        title = soup.title.string.strip() if soup.title and soup.title.string else None
        if title:
            return title[:255]
        if subject:
            cleaned = re.sub(r"(?i)(order|delivered|shipped|invoice|confirmation)", "", subject).strip("-: |")
            return cleaned[:255] if cleaned else subject[:255]
        return None

    def _extract_delivery_date(
        self,
        text: str,
        message_date: date | None = None,
        platform: str | None = None,
        subject: str | None = None,
    ) -> date | None:
        for pattern in self.DATE_PATTERNS:
            match = pattern.search(text)
            if match:
                raw = match.group(2).strip()
                date_match = self.STRICT_DATE_VALUE_PATTERN.search(raw)
                if not date_match:
                    continue
                candidate_date_text = date_match.group(0)
                try:
                    return date_parser.parse(candidate_date_text, fuzzy=False).date()
                except Exception:
                    LOGGER.debug("Could not parse delivery date from: %s", candidate_date_text)

        # Relative keywords fallback anchored to Gmail message date.
        normalized = f"{text} {subject or ''}".lower()
        if message_date:
            if "tomorrow" in normalized:
                return message_date + timedelta(days=1)
            if "today" in normalized:
                return message_date
            if re.search(r"\bdelivered\b|\bout for delivery\b|\bshipped\b|\barriving\b", normalized):
                return message_date
            # AJIO emails may not include explicit delivery phrases in body;
            # use message date as best available event date for timeline completeness.
            if platform == "AJIO":
                return message_date
        return None

    def _extract_return_date(self, text: str, subject: str | None = None, platform: str | None = None) -> date | None:
        if platform != "AJIO":
            return None
        combined_text = f"{text} {subject or ''}"
        for pattern in self.RETURN_DATE_PATTERNS:
            match = pattern.search(combined_text)
            if not match:
                continue
            raw = match.group(1).strip()
            date_match = self.STRICT_DATE_VALUE_PATTERN.search(raw)
            if not date_match:
                continue
            candidate_date_text = date_match.group(0)
            try:
                return date_parser.parse(candidate_date_text, fuzzy=False).date()
            except Exception:
                LOGGER.debug("Could not parse return date from: %s", candidate_date_text)
        return None

    def _extract_status(self, text: str, subject: str | None = None) -> str:
        normalized = f"{text} {subject or ''}".lower()

        if re.search(r"\b(refund (successful|success|completed|processed|credited)|credited back)\b", normalized):
            return "Refund Success"
        if re.search(r"\b(refund initiated|refund in process|refund being processed|initiate a refund)\b", normalized):
            return "Pending Refund"
        if re.search(r"\b(return request|return initiated|returned|return pickup)\b", normalized):
            return "Returned"
        if re.search(r"\bdelivered\b", normalized):
            return "Delivered"
        if re.search(r"\b(shipped|out for delivery|arriving)\b", normalized):
            return "Shipped"
        return "Pending"

