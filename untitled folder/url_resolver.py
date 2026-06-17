from __future__ import annotations

from urllib.parse import parse_qs, unquote, urlparse


def _multi_unquote(value: str, rounds: int = 2) -> str:
    decoded = value
    for _ in range(rounds):
        decoded = unquote(decoded)
    return decoded


def resolve_email_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    query = parse_qs(parsed.query)

    # Some mail clients/proxies keep final destination in fragment.
    # Example: ...#https://www.myntra.com/...
    if parsed.fragment:
        fragment_candidate = _multi_unquote(parsed.fragment.strip())
        if fragment_candidate.startswith("http"):
            return fragment_candidate

    # Amazon email redirect format:
    # /gp/r.html?...&U=<encoded_destination>
    if "amazon." in host and parsed.path.startswith("/gp/r.html"):
        wrapped = query.get("U", [])
        if wrapped and wrapped[0]:
            return _multi_unquote(wrapped[0])

    # Generic wrapped destination keys.
    for key in ("url", "u", "redirect", "redirect_url", "redirectUrl", "target", "to", "dest"):
        wrapped = query.get(key, [])
        if wrapped and wrapped[0]:
            candidate = _multi_unquote(wrapped[0])
            if candidate.startswith("http"):
                return candidate

    return url
