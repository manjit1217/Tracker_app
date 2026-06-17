from __future__ import annotations

from email.header import decode_header


def decode_mime_subject(subject: str | None) -> str | None:
    if not subject:
        return subject

    parts: list[str] = []
    for part, encoding in decode_header(subject):
        if isinstance(part, bytes):
            codec = encoding or "utf-8"
            try:
                parts.append(part.decode(codec, errors="replace"))
            except LookupError:
                parts.append(part.decode("utf-8", errors="replace"))
        else:
            parts.append(part)
    return "".join(parts).strip()
