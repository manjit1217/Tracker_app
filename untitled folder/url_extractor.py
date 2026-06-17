from __future__ import annotations

from dataclasses import dataclass

from bs4 import BeautifulSoup

from app.url_classifier import URLType, classify_url, detect_platform, is_product_candidate
from app.url_resolver import resolve_email_url


@dataclass
class URLCandidate:
    original_url: str
    resolved_url: str
    url_type: URLType
    platform: str | None


def extract_url_candidates(soup: BeautifulSoup) -> list[URLCandidate]:
    candidates: list[URLCandidate] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        original = anchor["href"].strip()
        if not original.startswith("http"):
            continue
        resolved = resolve_email_url(original)
        key = f"{original}::{resolved}"
        if key in seen:
            continue
        seen.add(key)
        candidates.append(
            URLCandidate(
                original_url=original,
                resolved_url=resolved,
                url_type=classify_url(resolved),
                platform=detect_platform(resolved),
            )
        )
    return candidates


def select_product_url(candidates: list[URLCandidate]) -> URLCandidate | None:
    for candidate in candidates:
        if is_product_candidate(candidate.resolved_url):
            return candidate
    return None


def select_invoice_url(candidates: list[URLCandidate]) -> URLCandidate | None:
    for candidate in candidates:
        if candidate.url_type == URLType.INVOICE:
            return candidate
    return None
