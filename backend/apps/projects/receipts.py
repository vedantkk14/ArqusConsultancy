"""Receipt validation and sanitising: magic bytes decide the type, images are re-encoded."""

import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

from . import rules
from .exceptions import ReceiptError

Image.MAX_IMAGE_PIXELS = 40_000_000  # decompression-bomb guard; larger images raise

_TYPES = {
    "jpeg": ("image/jpeg", "jpg"),
    "png": ("image/png", "png"),
    "webp": ("image/webp", "webp"),
}


@dataclass
class Receipt:
    data: bytes
    content_type: str
    ext: str
    kind: str  # "image" or "pdf"


def sniff(head: bytes) -> str | None:
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head.startswith(b"%PDF-"):
        return "pdf"
    return None


def _clean_image(raw: bytes, fmt: str) -> bytes:
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img.load()
            img = ImageOps.exif_transpose(img)  # apply orientation, then drop all metadata
            side = rules.RECEIPT_MAX_SIDE
            if max(img.size) > side:
                img.thumbnail((side, side), Image.LANCZOS)
            out = io.BytesIO()
            if fmt == "jpeg":
                img.convert("RGB").save(out, "JPEG", quality=85, optimize=True)
            elif fmt == "png":
                img.save(out, "PNG", optimize=True)
            else:
                img.save(out, "WEBP", quality=85)
            return out.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise ReceiptError("This image could not be read. Try another photo.") from exc


def process(upload) -> Receipt:
    """Validate an uploaded file and return the bytes to store."""
    if upload.size > rules.MAX_RECEIPT_BYTES:
        raise ReceiptError("The receipt is larger than 5 MB.")
    raw = upload.read(rules.MAX_RECEIPT_BYTES + 1)
    if len(raw) > rules.MAX_RECEIPT_BYTES:
        raise ReceiptError("The receipt is larger than 5 MB.")
    fmt = sniff(raw[:16])
    if fmt is None:
        raise ReceiptError("Upload a JPG, PNG, WebP or PDF receipt.")
    if fmt == "pdf":
        return Receipt(raw, "application/pdf", "pdf", "pdf")
    content_type, ext = _TYPES[fmt]
    return Receipt(_clean_image(raw, fmt), content_type, ext, "image")
