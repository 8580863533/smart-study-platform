"""
services/pdf_service.py — Document extraction and text-processing utilities.

Handles PDF extraction (via PyMuPDF / fitz), plain-text reading,
cleaning, chunking and paragraph splitting.
"""

import os
import re
import unicodedata
from typing import List, Dict

try:
    import fitz  # PyMuPDF
    _FITZ_AVAILABLE = True
except ImportError:
    _FITZ_AVAILABLE = False


class PdfService:
    """Service for extracting and processing text from uploaded study materials."""

    # ── Public extraction entry-point ──────────────────────────────────────────

    def extract_from_file(self, file_path: str, file_type: str) -> Dict:
        """
        Extract text from *file_path* and return a dict with:
          - content   : str   — cleaned full text
          - word_count: int
          - char_count: int

        *file_type* must be 'pdf' or 'txt'.
        """
        try:
            if file_type == "pdf":
                raw = self.extract_text_from_pdf(file_path)
            else:
                raw = self.extract_text_from_txt(file_path)

            content = self.clean_text(raw)
            return {
                "content": content,
                "word_count": self.count_words(content),
                "char_count": len(content),
            }
        except Exception as exc:
            raise RuntimeError(f"Failed to extract text from '{file_path}': {exc}") from exc

    # ── PDF ────────────────────────────────────────────────────────────────────

    def extract_text_from_pdf(self, file_path: str) -> str:
        """
        Extract all text from a PDF using PyMuPDF (fitz) and pytesseract OCR fallback
        for scanned/image-only pages.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"PDF not found: {file_path}")

        if not _FITZ_AVAILABLE:
            raise RuntimeError(
                "PyMuPDF (fitz) is not installed. "
                "Run `pip install PyMuPDF` to enable PDF extraction."
            )

        # Check if pytesseract and Pillow are available and configured
        tesseract_available = False
        try:
            import pytesseract
            from PIL import Image
            import io
            tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
            if os.path.exists(tesseract_path):
                pytesseract.pytesseract.tesseract_cmd = tesseract_path
                tesseract_available = True
            else:
                pytesseract.get_tesseract_version()
                tesseract_available = True
        except Exception:
            tesseract_available = False

        pages: List[str] = []
        try:
            doc = fitz.open(file_path)
            total_pages = len(doc)
            logger.info("Extracting text from PDF (%d pages): %s", total_pages, file_path)

            for page_num in range(total_pages):
                page = doc.load_page(page_num)
                text = page.get_text("text", sort=True)
                
                # If text mode is empty or sparse, try block-level extraction
                if len(text.strip()) < 20:
                    try:
                        blocks = page.get_text("blocks")
                        if isinstance(blocks, list):
                            block_texts = [b[4].strip() for b in blocks if len(b) >= 5 and isinstance(b[4], str) and b[4].strip()]
                            if block_texts:
                                text = "\n".join(block_texts)
                    except Exception:
                        pass

                # If still sparse and OCR is available, run OCR
                if len(text.strip()) < 20 and tesseract_available:
                    try:
                        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                        img_data = pix.tobytes("png")
                        image = Image.open(io.BytesIO(img_data))
                        ocr_text = pytesseract.image_to_string(image)
                        if ocr_text.strip():
                            text = ocr_text
                    except Exception:
                        pass

                if text.strip():
                    pages.append(text.strip())
                else:
                    logger.warning("Page %d of PDF had no extractable text.", page_num + 1)
            
            doc.close()
        except Exception as exc:
            raise RuntimeError(f"PyMuPDF failed on '{file_path}': {exc}") from exc

        return "\n\n".join(pages)

    # ── TXT ────────────────────────────────────────────────────────────────────

    def extract_text_from_txt(self, file_path: str) -> str:
        """
        Read a plain-text file, trying UTF-8 first then latin-1.

        Raises FileNotFoundError / RuntimeError on failure.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Text file not found: {file_path}")

        for encoding in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
            try:
                with open(file_path, "r", encoding=encoding) as fh:
                    return fh.read()
            except UnicodeDecodeError:
                continue
        raise RuntimeError(f"Cannot decode text file '{file_path}' with any known encoding.")

    # ── Cleaning ───────────────────────────────────────────────────────────────

    def clean_text(self, text: str) -> str:
        """
        Normalise and clean raw extracted text:
          1. Unicode NFKC normalisation (ligatures, special spaces …).
          2. Replace Windows-style line endings.
          3. Remove non-printable control characters (keep \\n and \\t).
          4. Collapse more-than-two consecutive blank lines into two.
          5. Strip trailing whitespace from each line.
          6. Collapse sequences of 3+ spaces / horizontal tabs into a single space.
        """
        if not text:
            return ""

        # 1. Normalise unicode
        text = unicodedata.normalize("NFKC", text)

        # 2. Normalise line endings
        text = text.replace("\r\n", "\n").replace("\r", "\n")

        # 3. Remove non-printable characters (keep \n, \t, space)
        text = re.sub(r"[^\S\n\t ]+", " ", text)
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

        # 4. Collapse excessive blank lines
        text = re.sub(r"\n{3,}", "\n\n", text)

        # 5. Strip trailing whitespace per line
        lines = [line.rstrip() for line in text.split("\n")]
        text = "\n".join(lines)

        # 6. Collapse long horizontal whitespace runs
        text = re.sub(r"[ \t]{3,}", " ", text)

        return text.strip()

    # ── Chunking ───────────────────────────────────────────────────────────────

    def split_into_chunks(self, text: str, chunk_size: int = 500) -> List[str]:
        """
        Split *text* into overlapping word-level chunks of roughly *chunk_size*
        words each, with a 50-word overlap to preserve context across boundaries.

        Returns a list of string chunks.
        """
        if not text:
            return []

        words = text.split()
        if len(words) <= chunk_size:
            return [text]

        overlap = min(50, chunk_size // 10)
        chunks: List[str] = []
        start = 0

        while start < len(words):
            end = min(start + chunk_size, len(words))
            chunk = " ".join(words[start:end])
            chunks.append(chunk)
            if end == len(words):
                break
            start = end - overlap  # step back by overlap

        return chunks

    # ── Paragraphs ─────────────────────────────────────────────────────────────

    def extract_paragraphs(self, text: str) -> List[str]:
        """
        Split *text* into meaningful paragraphs.

        A paragraph boundary is one or more blank lines.  Very short segments
        (< 30 chars) are merged with the following paragraph to avoid
        orphaned headers being treated as standalone paragraphs.
        """
        if not text:
            return []

        raw_paragraphs = re.split(r"\n\s*\n", text)
        paragraphs: List[str] = []
        buffer = ""

        for para in raw_paragraphs:
            para = para.strip()
            if not para:
                continue

            if buffer:
                combined = buffer + " " + para
                if len(buffer) < 30:
                    buffer = combined
                    continue
                else:
                    paragraphs.append(buffer)
                    buffer = para
            else:
                buffer = para

        if buffer:
            paragraphs.append(buffer)

        return paragraphs

    # ── Helpers ────────────────────────────────────────────────────────────────

    def count_words(self, text: str) -> int:
        """Return the number of whitespace-separated tokens in *text*."""
        if not text:
            return 0
        return len(text.split())
