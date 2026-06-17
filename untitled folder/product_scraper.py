from __future__ import annotations

import logging
import re
from abc import ABC, abstractmethod
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from playwright.sync_api import Page, sync_playwright

from app.models import ProductDetails

LOGGER = logging.getLogger(__name__)


def _compact_url(url: str, max_len: int = 120) -> str:
    parsed = urlparse(url)
    compact = f"{parsed.scheme}://{parsed.netloc}{parsed.path}" if parsed.scheme and parsed.netloc else url
    if len(compact) <= max_len:
        return compact
    return f"{compact[:max_len - 3]}..."


class BaseScraper(ABC):
    @abstractmethod
    def scrape(self, page: Page) -> ProductDetails:
        raise NotImplementedError

    @staticmethod
    def parse_days(text: str) -> tuple[int | None, int | None]:
        return_days = None
        exchange_days = None

        return_match = re.search(r"(\d+)\s*-?\s*day[s]?\s*return", text, re.IGNORECASE)
        if return_match:
            return_days = int(return_match.group(1))

        exchange_match = re.search(r"(\d+)\s*-?\s*day[s]?\s*exchange", text, re.IGNORECASE)
        if exchange_match:
            exchange_days = int(exchange_match.group(1))

        replacement_match = re.search(r"(\d+)\s*-?\s*day[s]?\s*replacement", text, re.IGNORECASE)
        if replacement_match and exchange_days is None:
            exchange_days = int(replacement_match.group(1))

        return return_days, exchange_days

    @staticmethod
    def parse_warranty_months(text: str) -> int | None:
        month_match = re.search(r"(\d+)\s*month[s]?\s*warranty", text, re.IGNORECASE)
        if month_match:
            return int(month_match.group(1))
        year_match = re.search(r"(\d+)\s*year[s]?\s*warranty", text, re.IGNORECASE)
        if year_match:
            return int(year_match.group(1)) * 12
        return None

    @staticmethod
    def parse_returnable(text: str) -> bool | None:
        if not text:
            return None
        if re.search(r"\bnon[-\s]?returnable\b", text, re.IGNORECASE):
            return False
        if re.search(r"\b\d+\s*day[s]?\s*(return|replacement|exchange)\b", text, re.IGNORECASE):
            return True
        return None


class AmazonScraper(BaseScraper):
    def scrape(self, page: Page) -> ProductDetails:
        page.wait_for_timeout(1500)
        title = self._safe_text(page, "#productTitle")
        brand = self._safe_text(page, "#bylineInfo")
        policy_text = self._extract_policy_text(page)
        warranty_text = self._extract_warranty_text(page)
        return_days, exchange_days = self.parse_days(policy_text or "")
        is_returnable = self.parse_returnable(policy_text or "")
        warranty_months = self.parse_warranty_months(warranty_text or "")
        return ProductDetails(
            product_name=title,
            brand=brand,
            return_policy_text=policy_text,
            return_days=return_days,
            exchange_days=exchange_days,
            warranty_information=warranty_text,
            warranty_months=warranty_months,
            is_returnable=is_returnable,
        )

    @staticmethod
    def _safe_text(page: Page, selector: str) -> str | None:
        locator = page.locator(selector)
        if locator.count() > 0:
            return locator.first.inner_text().strip()
        return None

    def _extract_policy_text(self, page: Page) -> str | None:
        # Try multiple known Amazon variants for returns/replacement policy text.
        candidates = [
            "#RETURNS_POLICY",
            "#RETURNS_POLICY a",
            "div#RETURNS_POLICY",
            "div[id='RETURNS_POLICY']",
            "a:has-text('Replacement')",
            "a:has-text('Return')",
            "a:has-text('Non-Returnable')",
            "span:has-text('days Replacement')",
            "span:has-text('days Return')",
            "span:has-text('Non-Returnable')",
        ]
        for selector in candidates:
            text = self._safe_text(page, selector)
            if text and re.search(r"\b\d+\s*day", text, re.IGNORECASE):
                return text

        # Fallback to scanning page content near returns keywords.
        body_text = re.sub(r"\s+", " ", page.content())
        match = re.search(
            r"(\d+\s*day[s]?\s*(?:replacement|return|exchange)|non[-\s]?returnable)",
            body_text,
            re.IGNORECASE,
        )
        if match:
            return match.group(1)
        return None

    def _extract_warranty_text(self, page: Page) -> str | None:
        candidates = [
            "#WARRANTY a",
            "#WARRANTY",
            "a:has-text('Warranty')",
            "#productDetails_feature_div",
            "#detailBullets_feature_div",
            "#technicalSpecifications_feature_div",
        ]
        for selector in candidates:
            text = self._safe_text(page, selector)
            if text and re.search(r"\b(\d+\s*(month|year)s?\s*warranty|warranty)\b", text, re.IGNORECASE):
                return text

        body_text = re.sub(r"\s+", " ", page.content())
        match = re.search(r"(\d+\s*(?:month|year)s?\s*warranty)", body_text, re.IGNORECASE)
        if match:
            return match.group(1)
        return None


class FlipkartScraper(BaseScraper):
    def scrape(self, page: Page) -> ProductDetails:
        page.wait_for_timeout(1500)
        title = self._safe_text(page, "span.VU-ZEz")
        if title is None:
            title = self._safe_text(page, "span.B_NuCI")
        brand = self._safe_text(page, "span.mEh187")
        policy_text = self._safe_text(page, "div._1UzWbD")
        warranty_text = self._safe_text(page, "div._10G4el")
        return_days, exchange_days = self.parse_days(policy_text or "")
        warranty_months = self.parse_warranty_months(warranty_text or "")
        return ProductDetails(
            product_name=title,
            brand=brand,
            return_policy_text=policy_text,
            return_days=return_days,
            exchange_days=exchange_days,
            warranty_information=warranty_text,
            warranty_months=warranty_months,
        )

    @staticmethod
    def _safe_text(page: Page, selector: str) -> str | None:
        locator = page.locator(selector)
        if locator.count() > 0:
            return locator.first.inner_text().strip()
        return None


class MyntraScraper(BaseScraper):
    def scrape(self, page: Page) -> ProductDetails:
        page.wait_for_timeout(1500)
        title = self._safe_text(page, "h1.pdp-title")
        subtitle = self._safe_text(page, "h1.pdp-name")
        product_name = f"{title} {subtitle}".strip() if title and subtitle else title or subtitle
        brand = title
        policy_text = self._safe_text(page, "div.pdp-return-container")
        warranty_text = self._safe_text(page, "div.index-row")
        return_days, exchange_days = self.parse_days(policy_text or "")
        warranty_months = self.parse_warranty_months(warranty_text or "")
        return ProductDetails(
            product_name=product_name,
            brand=brand,
            return_policy_text=policy_text,
            return_days=return_days,
            exchange_days=exchange_days,
            warranty_information=warranty_text,
            warranty_months=warranty_months,
        )

    @staticmethod
    def _safe_text(page: Page, selector: str) -> str | None:
        locator = page.locator(selector)
        if locator.count() > 0:
            return locator.first.inner_text().strip()
        return None


class AjioScraper(BaseScraper):
    def scrape(self, page: Page) -> ProductDetails:
        page.wait_for_timeout(1500)
        title = self._safe_text(page, "div.prod-name")
        brand = self._safe_text(page, "div.brand-name")
        policy_text = self._safe_text(page, "div.return-desc")
        warranty_text = self._safe_text(page, "div.warranty-desc")
        return_days, exchange_days = self.parse_days(policy_text or "")
        warranty_months = self.parse_warranty_months(warranty_text or "")
        return ProductDetails(
            product_name=title,
            brand=brand,
            return_policy_text=policy_text,
            return_days=return_days,
            exchange_days=exchange_days,
            warranty_information=warranty_text,
            warranty_months=warranty_months,
        )

    @staticmethod
    def _safe_text(page: Page, selector: str) -> str | None:
        locator = page.locator(selector)
        if locator.count() > 0:
            return locator.first.inner_text().strip()
        return None


class GenericScraper(BaseScraper):
    def scrape(self, page: Page) -> ProductDetails:
        page.wait_for_timeout(1200)
        text = page.content()
        soup_text = re.sub(r"\s+", " ", text)
        return_days, exchange_days = self.parse_days(soup_text)
        warranty_months = self.parse_warranty_months(soup_text)
        return ProductDetails(
            return_policy_text=soup_text[:500],
            return_days=return_days,
            exchange_days=exchange_days,
            warranty_information=soup_text[:500],
            warranty_months=warranty_months,
        )


class ProductScraperFactory:
    @staticmethod
    def get_scraper(url: str) -> BaseScraper:
        host = urlparse(url).netloc.lower()
        if "amazon." in host:
            return AmazonScraper()
        if "flipkart.com" in host:
            return FlipkartScraper()
        if "myntra.com" in host:
            return MyntraScraper()
        if "ajio.com" in host:
            return AjioScraper()
        return GenericScraper()


class ProductScraperService:
    def scrape_product_details(self, url: str) -> ProductDetails:
        target_url = self._resolve_url(url)
        scraper = ProductScraperFactory.get_scraper(target_url)
        LOGGER.info("Scraper start: scraper=%s url=%s", scraper.__class__.__name__, _compact_url(target_url))
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(target_url, timeout=60000, wait_until="domcontentloaded")
            details = scraper.scrape(page)
            browser.close()
        LOGGER.info(
            "Scraper done: url=%s return_days=%s exchange_days=%s warranty_months=%s product=%s",
            _compact_url(target_url),
            details.return_days,
            details.exchange_days,
            details.warranty_months,
            (details.product_name or "N/A")[:80],
        )
        return details

    @staticmethod
    def _resolve_url(url: str) -> str:
        parsed = urlparse(url)
        host = parsed.netloc.lower()

        # Skip resolver for already direct marketplace hosts.
        if (
            "amazon.in" in host
            or "flipkart.com" in host
            or "myntra.com" in host and "url" not in host
            or "ajio.com" in host and "url" not in host
        ):
            return url

        request = Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/126.0.0.0 Safari/537.36"
                )
            },
        )
        try:
            with urlopen(request, timeout=15) as response:
                resolved_url = response.geturl()
                if resolved_url:
                    LOGGER.info("Resolved tracking URL: %s", _compact_url(resolved_url))
                    return resolved_url
        except (URLError, TimeoutError, ValueError) as exc:
            LOGGER.warning("Could not resolve tracking URL %s: %s", url, exc)
        return url
