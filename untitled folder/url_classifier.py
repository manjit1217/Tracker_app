from __future__ import annotations

from enum import Enum
from urllib.parse import urlparse


class URLType(str, Enum):
    PRODUCT_PAGE = "PRODUCT_PAGE"
    ORDER_PAGE = "ORDER_PAGE"
    INVOICE = "INVOICE"
    TRACKING = "TRACKING"
    UNKNOWN = "UNKNOWN"


def detect_platform(url: str) -> str | None:
    host = urlparse(url).netloc.lower()
    if "amazon." in host:
        return "Amazon"
    if "flipkart.com" in host:
        return "Flipkart"
    if "myntra.com" in host:
        return "Myntra"
    if "ajio.com" in host:
        return "AJIO"
    if "croma.com" in host:
        return "Croma"
    if "reliancedigital.in" in host:
        return "Reliance Digital"
    return None


def classify_url(url: str) -> URLType:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    full = f"{host}{path}"

    if any(token in full for token in ("invoice", "receipt", "bill")):
        return URLType.INVOICE
    if any(token in full for token in ("track", "tracking", "shiprocket")):
        return URLType.TRACKING
    if any(
        token in full
        for token in (
            "order-history",
            "/orders",
            "/order/",
            "your-account",
            "gp/css/order-history",
        )
    ):
        return URLType.ORDER_PAGE
    if any(token in full for token in ("login", "signin", "customer-care", "support", "help")):
        return URLType.UNKNOWN

    if "ajio.com" in host and "/p/" in path:
        return URLType.PRODUCT_PAGE
    if "myntra.com" in host and any(token in path for token in ("/buy", "/p/", "/product/")):
        return URLType.PRODUCT_PAGE
    if "flipkart.com" in host and "/p/" in path:
        return URLType.PRODUCT_PAGE
    if "amazon." in host and any(
        token in path for token in ("/dp/", "/gp/product/", "/gp/aw/d/", "/-/")
    ):
        return URLType.PRODUCT_PAGE

    return URLType.UNKNOWN


def is_product_candidate(url: str) -> bool:
    return classify_url(url) == URLType.PRODUCT_PAGE
