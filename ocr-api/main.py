"""
Document OCR HTTP API (FastAPI + EasyOCR).
Run: uvicorn main:app --host 0.0.0.0 --port 8000
Deploy: Dockerfile CMD or Railway startCommand with $PORT.
"""

from __future__ import annotations

import io
import logging
import os
import re
import statistics
from contextlib import asynccontextmanager
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageEnhance, ImageOps

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ocrservice")

_reader = None


def _get_reader():
    global _reader
    if _reader is None:
        import easyocr

        langs = os.getenv("OCR_LANGS", "en").split(",")
        langs = [x.strip() for x in langs if x.strip()]
        if not langs:
            langs = ["en"]
        log.info("loading EasyOCR reader langs=%s gpu=%s", langs, False)
        _reader = easyocr.Reader(langs, gpu=False)
    return _reader


def sanitize_bbox(bbox: Any) -> list[list[float]] | None:
    """EasyOCR uses numpy scalars in bbox; JSON needs plain Python floats."""
    if bbox is None:
        return None
    try:
        out: list[list[float]] = []
        for pt in bbox:
            out.append([float(pt[0]), float(pt[1])])
        return out
    except (TypeError, ValueError, IndexError):
        return None


def _bbox_center_yx(bbox: list[list[float]]) -> tuple[float, float]:
    ys = [float(p[1]) for p in bbox]
    xs = [float(p[0]) for p in bbox]
    return (sum(ys) / len(ys), sum(xs) / len(xs))


def sort_detections_reading_order(
    detections: list[tuple[Any, str, float]],
) -> list[tuple[Any, str, float]]:
    """Top-to-bottom, left-to-right so fullText matches table / receipt layout."""

    def sort_key(item: tuple[Any, str, float]) -> tuple[float, float]:
        bbox, _text, _conf = item
        cy, cx = _bbox_center_yx(bbox)
        return (cy, cx)

    return sorted(detections, key=sort_key)


def preprocess_for_easyocr(img: Image.Image) -> np.ndarray:
    """
    Upscale small receipts and boost contrast so thin digits (e.g. '1') survive OCR.
    Tunables: OCR_MIN_LONG_SIDE (default 1600), OCR_CONTRAST (default 1.35).
    """
    img = img.convert("RGB")
    w, h = img.size
    long_side = max(w, h)
    min_long = int(os.getenv("OCR_MIN_LONG_SIDE", "1600"))
    if long_side > 0 and long_side < min_long:
        scale = min_long / long_side
        nw = max(1, int(w * scale))
        nh = max(1, int(h * scale))
        img = img.resize((nw, nh), Image.Resampling.LANCZOS)

    gray = img.convert("L")
    gray = ImageOps.autocontrast(gray, cutoff=1)
    contrast = float(os.getenv("OCR_CONTRAST", "1.35"))
    gray = ImageEnhance.Contrast(gray).enhance(contrast)
    return np.array(gray.convert("RGB"))


_QUANTITY_RE = re.compile(r"^[1-9]\d{0,3}$")
_MONEY_RE = re.compile(r"^\d+[.,]\d{2}$")

HEADER_WORDS = frozenset(
    {
        "description",
        "quantity",
        "unit",
        "price",
        "vat",
        "amount",
    }
)


def _looks_like_quantity(token: str) -> bool:
    t = token.strip()
    if _QUANTITY_RE.fullmatch(t):
        return True
    return False


def _looks_like_money(token: str) -> bool:
    t = token.strip().replace(",", ".")
    if _MONEY_RE.fullmatch(t):
        return True
    return False


def parse_currency_token(token: str) -> float | None:
    """
    OCR often reads $ as S (e.g. S450). Also plain integers on invoices.
    """
    t = token.strip()
    if not t:
        return None
    if len(t) >= 2 and t[0] in "Ss$€£":
        rest = t[1:].replace(",", ".")
        try:
            v = float(rest)
            return v if v >= 0 else None
        except ValueError:
            return None
    tnorm = t.replace(",", ".")
    if _MONEY_RE.fullmatch(tnorm):
        try:
            return float(tnorm)
        except ValueError:
            return None
    if t.isdigit():
        return float(t)
    return None


def parse_price_total_row_cells(texts: list[str]) -> dict[str, Any] | None:
    """
    Row layout: … description … | unit price | line total (no 'each'), e.g. mock invoices.
    Uses last two tokens as currency when parsable.
    """
    if len(texts) < 3:
        return None
    if _is_footer_row(texts):
        return None
    low_join = " ".join(x.lower() for x in texts)
    if "product name" in low_join and texts[-1].lower() in ("price", "total", "quantity"):
        return None

    unit_p = parse_currency_token(texts[-2])
    line_t = parse_currency_token(texts[-1])
    if unit_p is None or line_t is None:
        return None
    desc = " ".join(texts[:-2]).strip()
    if not desc or len(desc) < 2:
        return None
    dl = desc.lower()
    if dl in HEADER_WORDS or dl in ("product name", "price", "total", "quantity"):
        return None

    qty = max(1, int(round(line_t / unit_p))) if unit_p > 0 else 1
    return {
        "description": desc,
        "quantity": qty,
        "unit": "unit",
        "unitPrice": round(unit_p, 4),
        "lineTotal": round(line_t, 2),
    }


def structured_line_items_price_total_flat(tokens: list[str]) -> list[dict[str, Any]]:
    """
    Detect repeated blocks: 'Product Name Here' + price token + total token + description lines
    until next product row or footer (common invoice templates without 'each').
    """
    tks = [t.strip() for t in tokens if t.strip()]
    if not tks:
        return []

    try:
        qty_hdr_idx = next(i for i, t in enumerate(tks) if t.lower() == "quantity")
    except StopIteration:
        qty_hdr_idx = -1

    start_scan = qty_hdr_idx + 1 if qty_hdr_idx >= 0 else 0

    out: list[dict[str, Any]] = []
    i = 0
    while i < len(tks):
        if i < start_scan:
            i += 1
            continue
        if tks[i].lower() != "product name here":
            i += 1
            continue
        if i + 2 >= len(tks):
            break
        unit_p = parse_currency_token(tks[i + 1])
        line_t = parse_currency_token(tks[i + 2])
        if unit_p is None or line_t is None:
            i += 1
            continue

        parts: list[str] = [tks[i]]
        j = i + 3
        while j < len(tks):
            tl = tks[j].lower()
            if tl == "product name here":
                break
            if tl.startswith("sub total") or tl.startswith("subtotal"):
                break
            if tl.startswith("grand total"):
                break
            if tl.startswith("tax ") or tl.startswith("discount "):
                break
            parts.append(tks[j])
            j += 1

        desc = " ".join(parts).strip()
        qty = max(1, int(round(line_t / unit_p))) if unit_p > 0 else 1
        out.append(
            {
                "description": desc[:2000],
                "quantity": qty,
                "unit": "unit",
                "unitPrice": round(unit_p, 4),
                "lineTotal": round(line_t, 2),
            }
        )
        i = j

    return out


def _bbox_cy(bbox: list[list[float]]) -> float:
    return sum(float(p[1]) for p in bbox) / len(bbox)


def _bbox_min_x(bbox: list[list[float]]) -> float:
    return min(float(p[0]) for p in bbox)


def _bbox_height(bbox: list[list[float]]) -> float:
    ys = [float(p[1]) for p in bbox]
    return max(ys) - min(ys)


def cluster_lines_into_rows(lines: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Group OCR boxes that share the same visual row (similar Y center)."""
    boxed = [ln for ln in lines if ln.get("bbox") is not None]
    if len(boxed) < 2:
        return []
    heights = [_bbox_height(ln["bbox"]) for ln in boxed]
    tol_scale = float(os.getenv("OCR_ROW_TOL_SCALE", "1.0"))
    tol = max(10.0, statistics.median(heights) * 0.65 * tol_scale if heights else 18.0)
    boxed.sort(key=lambda ln: (_bbox_cy(ln["bbox"]), _bbox_min_x(ln["bbox"])))
    clusters: list[list[dict[str, Any]]] = []
    cur: list[dict[str, Any]] = []
    ref_y: float | None = None
    for ln in boxed:
        cy = _bbox_cy(ln["bbox"])
        if not cur:
            cur = [ln]
            ref_y = cy
        elif ref_y is not None and abs(cy - ref_y) <= tol:
            cur.append(ln)
            ref_y = sum(_bbox_cy(x["bbox"]) for x in cur) / len(cur)
        else:
            clusters.append(sorted(cur, key=lambda x: _bbox_min_x(x["bbox"])))
            cur = [ln]
            ref_y = cy
    if cur:
        clusters.append(sorted(cur, key=lambda x: _bbox_min_x(x["bbox"])))
    return clusters


_FOOTER_ROW_RE = re.compile(
    r"subtotal|sub\s+total|total\s+gbp|^vat\s|amount\s+due|grand\s*total|terms\s*[€$]|conditions",
    re.IGNORECASE,
)

# Rows that start summary / footer section (stop table body before these)
_TABLE_FOOTER_START_RE = re.compile(
    r"sub\s*total|subtotal|grand\s*total|amount\s*due|balance\s*due|tax\s*\d|discount\s*\d|^vat\s",
    re.IGNORECASE,
)

_HEADER_KEYWORDS = frozenset(
    {
        "price",
        "total",
        "qty",
        "quantity",
        "amount",
        "description",
        "product",
        "item",
        "article",
        "unit",
        "name",
        "line",
        "rate",
        "vat",
    }
)


def _is_footer_row(texts: list[str]) -> bool:
    joined = " ".join(texts)
    return bool(_FOOTER_ROW_RE.search(joined))


def row_looks_like_column_header(texts: list[str]) -> bool:
    """Synonym-agnostic: table header row usually contains several column keywords."""
    if len(texts) < 2:
        return False
    blob = " ".join(t.lower() for t in texts)
    hits = sum(1 for k in _HEADER_KEYWORDS if re.search(rf"\b{re.escape(k)}\b", blob))
    return hits >= 2


def row_starts_table_footer(texts: list[str]) -> bool:
    joined = " ".join(texts).strip()
    if not joined:
        return False
    return bool(_TABLE_FOOTER_START_RE.search(joined))


def find_table_header_row_index(clusters: list[list[dict[str, Any]]]) -> int:
    for i, row in enumerate(clusters):
        texts = [str(c.get("text") or "").strip() for c in row]
        texts = [t for t in texts if t]
        if row_looks_like_column_header(texts):
            return i
    return -1


def find_table_footer_row_index(
    clusters: list[list[dict[str, Any]]], start_from: int = 0
) -> int:
    for i in range(max(0, start_from), len(clusters)):
        texts = [str(c.get("text") or "").strip() for c in clusters[i]]
        texts = [t for t in texts if t]
        if not texts:
            continue
        if row_starts_table_footer(texts) or _is_footer_row(texts):
            return i
    return len(clusters)


def parse_geometric_data_row(texts_raw: list[str]) -> dict[str, Any] | None:
    """
    Use token order L→R: description prefix, optional qty, trailing currency… unit price, line total.
    Works without fixed column titles (Description vs Product name, etc.).
    """
    texts = [t.strip() for t in texts_raw if t.strip()]
    if len(texts) < 2:
        return None
    if _is_footer_row(texts) or row_starts_table_footer(texts):
        return None

    money_vals: list[float] = []
    i = len(texts)
    while i > 0:
        v = parse_currency_token(texts[i - 1])
        if v is not None:
            money_vals.insert(0, v)
            i -= 1
        else:
            break

    if len(money_vals) < 1:
        return None

    prefix = texts[:i]
    qty: int | None = None
    if prefix:
        last = prefix[-1].strip()
        if last.isdigit() and len(last) <= 7:
            q = int(last)
            if 1 <= q <= 999_999 and q <= 50_000:
                qty = q
                prefix = prefix[:-1]

    desc = " ".join(prefix).strip()
    if len(desc) < 2:
        return None

    dl = desc.lower()
    if dl in HEADER_WORDS:
        return None
    if len(texts) <= 6 and row_looks_like_column_header(texts):
        return None

    if len(money_vals) >= 2:
        unit_p, lt = money_vals[-2], money_vals[-1]
    else:
        lt = money_vals[-1]
        unit_p = (lt / qty) if qty and qty > 0 else lt

    if unit_p <= 0 or lt <= 0:
        return None
    # Skip OCR garbage / invoice IDs mistaken for amounts
    if lt > 50_000_000 or unit_p > 50_000_000 or max(money_vals) > 50_000_000:
        return None

    q_final = qty if qty else max(1, min(1_000_000, int(round(lt / unit_p)))) if unit_p > 0 else 1

    return {
        "description": desc[:2000],
        "quantity": max(1, q_final),
        "unit": "unit",
        "unitPrice": round(unit_p, 4),
        "lineTotal": round(lt, 2),
    }


def extract_geometric_line_items(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Table row count ≈ visual rows between detected header and footer (bbox geometry).
    """
    clusters = cluster_lines_into_rows(lines)
    if not clusters:
        return []

    hdr_idx = find_table_header_row_index(clusters)
    footer_idx = find_table_footer_row_index(clusters, start_from=hdr_idx + 1 if hdr_idx >= 0 else 0)

    start_body = hdr_idx + 1 if hdr_idx >= 0 else 0
    end_body = footer_idx if footer_idx > start_body else len(clusters)

    out: list[dict[str, Any]] = []
    for row in clusters[start_body:end_body]:
        texts = [str(c.get("text") or "").strip() for c in row]
        texts = [t for t in texts if t]
        parsed = parse_geometric_data_row(texts)
        if parsed:
            out.append(parsed)

    if out:
        return out

    # No header match: take rows before footer that parse as line items (weak signal)
    footer_only = find_table_footer_row_index(clusters, 0)
    for row in clusters[:footer_only]:
        texts = [str(c.get("text") or "").strip() for c in row]
        texts = [t for t in texts if t]
        parsed = parse_geometric_data_row(texts)
        if parsed and len(parsed["description"]) >= 8:
            out.append(parsed)

    return out


def parse_invoice_row_cells(texts: list[str]) -> dict[str, Any] | None:
    """
    One table row left→right: … description … | qty? | each | unit price? | … | line total.
    """
    if not texts:
        return None
    low = [t.lower() for t in texts]
    if "each" not in low:
        return None
    if _is_footer_row(texts):
        return None
    ie = low.index("each")
    qty = 1
    desc_end = ie
    if ie > 0 and _looks_like_quantity(texts[ie - 1]):
        qty = int(texts[ie - 1])
        desc_end = ie - 1
    desc = " ".join(texts[:desc_end]).strip()
    if not desc or desc.lower() in HEADER_WORDS:
        return None
    rest = texts[ie + 1 :]
    moneys: list[float] = []
    for t in rest:
        if _looks_like_money(t):
            moneys.append(float(t.replace(",", ".")))
    if not moneys:
        return None
    unit_price = moneys[0]
    line_total = moneys[-1]
    return {
        "description": desc,
        "quantity": qty,
        "unit": "each",
        "unitPrice": round(unit_price, 4),
        "lineTotal": round(line_total, 2),
    }


def extract_structured_line_items(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    1) Geometry (header/footer + numeric tails) — layout-agnostic column names.
    2) Legacy row parsers (each / price–total on one cluster).
    3) Template-specific flat tokens (Product Name Here…).
    4) each-token fallback.
    """
    flat_tokens = [str(ln.get("text") or "").strip() for ln in lines]

    geo = extract_geometric_line_items(lines)
    if geo:
        log.info("structuredLineItems: geometric extraction → %s rows", len(geo))
        return geo

    rows = cluster_lines_into_rows(lines)
    out: list[dict[str, Any]] = []
    for row in rows:
        texts = [str(c.get("text") or "").strip() for c in row]
        texts = [t for t in texts if t]
        parsed = parse_invoice_row_cells(texts) or parse_price_total_row_cells(texts)
        if parsed:
            out.append(parsed)
    if out:
        return out

    pt = structured_line_items_price_total_flat(flat_tokens)
    if pt:
        return pt

    return structured_line_items_token_fallback(flat_tokens)


def structured_line_items_token_fallback(tokens: list[str]) -> list[dict[str, Any]]:
    """Last resort: find segments … [qty?] 'each' … money … between flat OCR tokens."""
    tks = [t.strip() for t in tokens if t.strip()]
    out: list[dict[str, Any]] = []
    i = 0
    while i < len(tks):
        if tks[i].lower() in HEADER_WORDS:
            i += 1
            continue
        if _FOOTER_ROW_RE.match(tks[i]):
            break
        try:
            je = next(j for j in range(i, len(tks)) if tks[j].lower() == "each")
        except StopIteration:
            break
        seg = tks[i:je]
        if not seg:
            i = je + 1
            continue
        qty = 1
        if len(seg) >= 2 and _looks_like_quantity(seg[-1]):
            qty = int(seg[-1])
            desc = " ".join(seg[:-1]).strip()
        else:
            desc = " ".join(seg).strip()
        if not desc or desc.lower() in HEADER_WORDS:
            i = je + 1
            continue
        moneys: list[float] = []
        k = je + 1
        while k < len(tks) and k < je + 16:
            if _looks_like_money(tks[k]):
                moneys.append(float(tks[k].replace(",", ".")))
            if _FOOTER_ROW_RE.search(tks[k]):
                break
            k += 1
        if moneys:
            out.append(
                {
                    "description": desc,
                    "quantity": qty,
                    "unit": "each",
                    "unitPrice": round(moneys[0], 4),
                    "lineTotal": round(moneys[-1], 2),
                }
            )
        i = k if k > je + 1 else je + 1
    return out


def inject_implicit_quantity_before_each_rows(
    lines: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    If OCR skips a lone '1' before 'each', insert quantity 1 (common on receipts).
    Only when the token before 'each' is not already a quantity or money amount.
    """
    if not lines:
        return lines
    out: list[dict[str, Any]] = []
    for row in lines:
        t = (row.get("text") or "").strip()
        if not t:
            continue
        low = t.lower()
        if low == "each" and out:
            prev = (out[-1].get("text") or "").strip()
            pl = prev.lower()
            if (
                pl not in HEADER_WORDS
                and not _looks_like_quantity(prev)
                and not _looks_like_money(prev)
            ):
                out.append({"text": "1", "confidence": 1.0, "inferred": True, "bbox": None})
        out.append(row)
    return out


def _env_truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes", "on")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm model on startup so first request is not 60s+ (local/Docker Compose).
    # On Railway: set OCR_SKIP_STARTUP_WARMUP=1 so /health returns quickly and deploy
    # does not OOM or exceed healthcheck while downloading PyTorch/EasyOCR weights.
    if _env_truthy("OCR_SKIP_STARTUP_WARMUP"):
        log.info("skipping EasyOCR warmup (OCR_SKIP_STARTUP_WARMUP); first OCR request may be slow")
        yield
        return
    try:
        _get_reader()
        log.info("EasyOCR reader ready")
    except Exception as e:
        log.exception("failed to init EasyOCR: %s", e)
    yield


app = FastAPI(
    title="Mastery Document OCR API",
    description="Image upload → OCR text/structured JSON for the document pipeline.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": "easyocr",
        "readerLoaded": _reader is not None,
    }


@app.post("/ocr/image")
async def ocr_image(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="missing filename")

    raw = await file.read()
    if len(raw) > int(os.getenv("MAX_UPLOAD_BYTES", str(15 * 1024 * 1024))):
        raise HTTPException(status_code=413, detail="file too large")

    try:
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"invalid image: {e}") from e

    arr = preprocess_for_easyocr(img)
    reader = _get_reader()
    mag_ratio = float(os.getenv("OCR_MAG_RATIO", "2.0"))
    canvas_size = int(os.getenv("OCR_CANVAS_SIZE", "2560"))
    try:
        detections = reader.readtext(
            arr,
            paragraph=False,
            mag_ratio=mag_ratio,
            canvas_size=canvas_size,
        )
    except Exception as e:
        log.exception("readtext failed")
        raise HTTPException(status_code=500, detail=str(e)) from e

    detections = sort_detections_reading_order(detections)

    lines: list[dict[str, Any]] = []

    for bbox, text, conf in detections:
        if text and text.strip():
            lines.append(
                {
                    "text": text.strip(),
                    "confidence": float(conf),
                    "bbox": sanitize_bbox(bbox),
                }
            )

    structured_line_items = extract_structured_line_items(lines)

    lines = inject_implicit_quantity_before_each_rows(lines)
    text_parts = [str(r["text"]).strip() for r in lines]

    full_text = "\n".join(text_parts)
    conf_all = [float(r["confidence"]) for r in lines if r.get("confidence") is not None]
    avg_conf = sum(conf_all) / len(conf_all) if conf_all else None

    return {
        "engine": "easyocr",
        "fullText": full_text,
        "confidence": avg_conf,
        "lines": lines,
        "detectionCount": len(lines),
        "structuredLineItems": structured_line_items,
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
