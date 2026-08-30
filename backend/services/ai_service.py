"""
services/ai_service.py — AI backend for summarisation, Q&A, flashcard and quiz generation.

Operating modes (detected at runtime):
  hf_api  — Hugging Face Inference API (requires HF_API_KEY in environment).
  local   — Local transformer pipelines  (requires USE_LOCAL_MODELS=true).
  lite    — Pure-Python fallback: sumy + scikit-learn TF-IDF + NLTK.

All public methods return plain Python objects (lists / dicts) that are
safe to serialise with Flask's jsonify.
"""

from __future__ import annotations

import os
import re
import logging
import random
import string
from typing import List, Dict, Optional, Tuple

import nltk
import requests

logger = logging.getLogger(__name__)

# ── Lazy NLTK downloads (silent if already present) ────────────────────────────

def _ensure_nltk() -> None:
    for resource in ("punkt", "stopwords", "averaged_perceptron_tagger", "punkt_tab"):
        try:
            try:
                nltk.data.find(f"tokenizers/{resource}" if resource.startswith("punkt") else f"corpora/{resource}")
            except (LookupError, OSError):
                nltk.download(resource, quiet=True)
        except Exception:
            try:
                nltk.download(resource, quiet=True)
            except Exception:
                pass

_ensure_nltk()

from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.corpus import stopwords
from nltk.probability import FreqDist

# ── Optional heavy imports ─────────────────────────────────────────────────────

try:
    from sumy.parsers.plaintext import PlaintextParser
    from sumy.nlp.tokenizers import Tokenizer as SumyTokenizer
    from sumy.summarizers.lsa import LsaSummarizer
    from sumy.nlp.stemmers import Stemmer
    from sumy.utils import get_stop_words
    _SUMY_AVAILABLE = True
except Exception:
    _SUMY_AVAILABLE = False

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    import numpy as np
    _SKLEARN_AVAILABLE = True
except Exception:
    _SKLEARN_AVAILABLE = False

try:
    from transformers import pipeline as hf_pipeline
    _TRANSFORMERS_AVAILABLE = True
except Exception:
    _TRANSFORMERS_AVAILABLE = False

# ── Standalone helper ──────────────────────────────────────────────────────────

def extract_key_terms(text: str, top_n: int = 20) -> List[str]:
    """
    Return the *top_n* most frequent meaningful words from *text*,
    using NLTK frequency distribution with stopword filtering.
    """
    try:
        _ensure_nltk()
        tokens = word_tokenize(text.lower())
        stop_words = set(stopwords.words("english"))
        # Keep only alphabetic tokens longer than 2 chars that are not stopwords
        filtered = [
            t for t in tokens
            if t.isalpha() and len(t) > 2 and t not in stop_words
        ]
        freq = FreqDist(filtered)
        return [word for word, _ in freq.most_common(top_n)]
    except Exception as exc:
        logger.warning("extract_key_terms failed: %s", exc)
        # Fallback: simple split + filter
        words = re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())
        return list(dict.fromkeys(words))[:top_n]


# ══════════════════════════════════════════════════════════════════════════════
# AIService
# ══════════════════════════════════════════════════════════════════════════════

class AIService:
    """
    Unified AI service that delegates to hf_api / local / lite depending
    on the current environment configuration.
    """

    HF_BASE_URL = "https://api-inference.huggingface.co/models"

    # Spaced-repetition intervals per mastery level (days)
    SR_INTERVALS = {0: 1, 1: 3, 2: 7, 3: 14, 4: 30, 5: 60}

    def __init__(self) -> None:
        self._hf_api_key: str = os.environ.get("HF_API_KEY", "")
        self._use_local: bool = os.environ.get("USE_LOCAL_MODELS", "false").lower() == "true"
        self._mode: str = self.detect_mode()

        # Local pipeline cache (populated lazily)
        self._local_summarizer = None
        self._local_qa = None
        self._local_generator = None

        logger.info("AIService initialised in mode: %s", self._mode)

    # ── Mode detection ─────────────────────────────────────────────────────────

    def detect_mode(self) -> str:
        """Return 'hf_api', 'local', or 'lite'."""
        if self._use_local and _TRANSFORMERS_AVAILABLE:
            return "local"
        # Only use hf_api if key is set and not a placeholder
        if (self._hf_api_key 
            and self._hf_api_key.strip() 
            and "your-" not in self._hf_api_key
            and "optional" not in self._hf_api_key):
            return "hf_api"
        return "lite"

    # ── Internal HF API helper ─────────────────────────────────────────────────

    def _hf_post(self, model: str, payload: dict, timeout: int = 60) -> dict:
        """POST *payload* to the HF Inference API and return parsed JSON."""
        url = f"{self.HF_BASE_URL}/{model}"
        headers = {"Authorization": f"Bearer {self._hf_api_key}"}
        resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
        resp.raise_for_status()
        return resp.json()

    # ── Local pipeline helpers ─────────────────────────────────────────────────

    def _get_local_summarizer(self):
        if self._local_summarizer is None:
            self._local_summarizer = hf_pipeline(
                "summarization", model="sshleifer/distilbart-cnn-12-6"
            )
        return self._local_summarizer

    def _get_local_qa(self):
        if self._local_qa is None:
            self._local_qa = hf_pipeline(
                "question-answering", model="deepset/roberta-base-squad2"
            )
        return self._local_qa

    def _get_local_generator(self):
        if self._local_generator is None:
            self._local_generator = hf_pipeline(
                "text-generation", model="gpt2", max_new_tokens=200
            )
        return self._local_generator

    # ══════════════════════════════════════════════════════════════════════════
    # summarize
    # ══════════════════════════════════════════════════════════════════════════

    def summarize(self, text: str, num_bullets: int = 8) -> List[str]:
        """
        Summarise *text* and return a list of *num_bullets* bullet strings.

        Delegates to the active mode (lite / hf_api / local).
        Always returns a non-empty list even on failure.
        """
        if not text or not text.strip():
            return ["No content provided to summarise."]

        try:
            if self._mode == "hf_api":
                return self._summarize_hf(text, num_bullets)
            elif self._mode == "local":
                return self._summarize_local(text, num_bullets)
            else:
                return self._summarize_lite(text, num_bullets)
        except Exception as exc:
            logger.error("summarize error (%s): %s", self._mode, exc)
            return self._summarize_lite(text, num_bullets)

    def _summarize_lite(self, text: str, num_bullets: int) -> List[str]:
        """Use sumy LSA or sentence-selection fallback."""
        if _SUMY_AVAILABLE:
            try:
                parser = PlaintextParser.from_string(text, SumyTokenizer("english"))
                stemmer = Stemmer("english")
                summarizer = LsaSummarizer(stemmer)
                summarizer.stop_words = get_stop_words("english")
                sentences = summarizer(parser.document, num_bullets)
                bullets = [str(s) for s in sentences]
                if bullets:
                    return bullets
            except Exception as exc:
                logger.warning("sumy failed, using fallback: %s", exc)

        # Fallback: pick the most information-dense sentences by TF-IDF score
        return self._tfidf_top_sentences(text, num_bullets)

    def _tfidf_top_sentences(self, text: str, n: int) -> List[str]:
        """Select top-n sentences by TF-IDF score with robust fallbacks."""
        try:
            sentences = [s.strip() for s in sent_tokenize(text) if s.strip()]
            if not sentences:
                sentences = [s.strip() for s in text.split('\n') if s.strip()]
            if not sentences:
                return [text[:300]]

            # Relax length filter if we have few sentences
            min_len = 20 if len(sentences) > n else 5
            filtered_sentences = [s for s in sentences if len(s) >= min_len]
            if not filtered_sentences:
                filtered_sentences = sentences

            if len(filtered_sentences) <= n:
                return filtered_sentences

            if _SKLEARN_AVAILABLE:
                vec = TfidfVectorizer(stop_words="english")
                matrix = vec.fit_transform(filtered_sentences)
                scores = np.asarray(matrix.sum(axis=1)).flatten()
                top_indices = scores.argsort()[-n:][::-1]
                top_indices_sorted = sorted(top_indices)
                return [filtered_sentences[i] for i in top_indices_sorted]
            else:
                # Simple frequency-based selection
                step = max(1, len(filtered_sentences) // n)
                return [filtered_sentences[i] for i in range(0, len(filtered_sentences), step)][:n]
        except Exception as exc:
            logger.warning("_tfidf_top_sentences failed: %s", exc)
            return [text[:300]]


    def _summarize_hf(self, text: str, num_bullets: int) -> List[str]:
        """Use facebook/bart-large-cnn via HF Inference API."""
        # Truncate to 1024 words to avoid token limits
        truncated = " ".join(text.split()[:1024])
        payload = {
            "inputs": truncated,
            "parameters": {"max_length": 512, "min_length": 50, "do_sample": False},
        }
        result = self._hf_post("facebook/bart-large-cnn", payload)
        if isinstance(result, list) and result:
            summary_text = result[0].get("summary_text", "")
        else:
            summary_text = str(result)

        sentences = sent_tokenize(summary_text) if summary_text else []
        return sentences[:num_bullets] if sentences else [summary_text]

    def _summarize_local(self, text: str, num_bullets: int) -> List[str]:
        """Use local distilbart pipeline."""
        truncated = " ".join(text.split()[:900])
        pipe = self._get_local_summarizer()
        result = pipe(truncated, max_length=300, min_length=40, do_sample=False)
        summary_text = result[0]["summary_text"] if result else ""
        sentences = sent_tokenize(summary_text) if summary_text else []
        return sentences[:num_bullets] if sentences else [summary_text]

    # ══════════════════════════════════════════════════════════════════════════
    # answer_question
    # ══════════════════════════════════════════════════════════════════════════

    def answer_question(self, question: str, context: str) -> Dict:
        """
        Answer *question* using *context*.
        Rank semantic chunks across ALL pages of the document to find the best relevant passage.
        """
        if not question or not context:
            return {"answer": "Insufficient context provided.", "confidence": 0.0, "source_passage": ""}

        # Retrieve relevant passage from anywhere in the multi-page PDF using TF-IDF chunk ranking
        from services.pdf_service import PdfService
        pdf_svc = PdfService()
        chunks = pdf_svc.split_into_chunks(context, chunk_size=350)
        best_passage = context

        if _SKLEARN_AVAILABLE and len(chunks) > 1:
            try:
                vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
                corpus = [question] + chunks
                matrix = vec.fit_transform(corpus)
                sims = cosine_similarity(matrix[0], matrix[1:]).flatten()
                top_idx = int(np.argmax(sims))
                # Take the best matching chunk and adjacent chunk for maximum context
                selected_chunks = [chunks[top_idx]]
                if top_idx + 1 < len(chunks):
                    selected_chunks.append(chunks[top_idx + 1])
                best_passage = " ".join(selected_chunks)
            except Exception as exc:
                logger.warning("Multi-page chunk ranking failed: %s", exc)

        try:
            if self._mode == "hf_api":
                return self._qa_hf(question, best_passage)
            elif self._mode == "local":
                return self._qa_local(question, best_passage)
            else:
                return self._qa_lite(question, best_passage)
        except Exception as exc:
            logger.error("answer_question error (%s): %s", self._mode, exc)
            return self._qa_lite(question, best_passage)

    def _qa_lite(self, question: str, context: str) -> Dict:
        """
        Answer a question from context in clear, simple language.
        Finds the best-matching sentence(s), then reformats them into a
        direct, friendly answer rather than dumping raw text.
        """
        if not question or not context:
            return {"answer": "I don't have enough information to answer that.", "confidence": 0.0, "source_passage": ""}

        question_lower = question.strip().lower()
        sentences = [s.strip() for s in sent_tokenize(context) if len(s.strip()) > 10]
        if not sentences:
            return {"answer": "The document doesn't contain relevant information for this question.", "confidence": 0.0, "source_passage": ""}

        # ── Step 1: Extract the topic/subject from the question ────────────────
        # Strip question words to find the subject
        stop_q_words = {"what", "is", "are", "was", "were", "who", "how", "why",
                        "when", "where", "which", "does", "do", "did", "can",
                        "could", "would", "should", "define", "explain", "describe",
                        "tell", "me", "about", "the", "a", "an", "of", "in", "on"}
        q_words = [w.strip("?.,!'\"") for w in question_lower.split()]
        topic_words = [w for w in q_words if w not in stop_q_words and len(w) > 2]

        # ── Step 2: Find best-matching sentences via TF-IDF ───────────────────
        best_sentences = []
        if _SKLEARN_AVAILABLE:
            try:
                corpus = [question] + sentences
                vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
                matrix = vec.fit_transform(corpus)
                sims = cosine_similarity(matrix[0], matrix[1:]).flatten()
                # Pick top-3 sentences sorted by score
                top_idxs = sims.argsort()[::-1][:3]
                best_sentences = [
                    (sentences[i], float(sims[i]))
                    for i in top_idxs
                    if float(sims[i]) > 0.05
                ]
            except Exception as exc:
                logger.warning("_qa_lite TF-IDF failed: %s", exc)

        # Fallback: keyword overlap scoring
        if not best_sentences:
            scored = []
            for sent in sentences:
                sent_lower = sent.lower()
                score = sum(1 for w in topic_words if w in sent_lower)
                scored.append((sent, score))
            scored.sort(key=lambda x: x[1], reverse=True)
            best_sentences = [(s, sc) for s, sc in scored[:3] if sc > 0]

        if not best_sentences:
            best_sentences = [(sentences[0], 0.1)]

        best_sent, best_score = best_sentences[0]

        # ── Step 3: Build a natural-language answer ────────────────────────────
        # Combine top 1-2 sentences into a clean, direct answer
        answer_sents = [s for s, _ in best_sentences[:2]]
        raw_answer = " ".join(answer_sents).strip()

        # Clean up the answer: trim trailing refs like "(p. 12)" or "[1]"
        raw_answer = re.sub(r"\s*\(p\.?\s*\d+\)", "", raw_answer)
        raw_answer = re.sub(r"\s*\[\d+\]", "", raw_answer)
        raw_answer = re.sub(r"\s{2,}", " ", raw_answer).strip()

        # Build a friendly prefix based on the question type
        answer_text = raw_answer
        q_start = question_lower.lstrip()
        if q_start.startswith(("what is", "what are", "define", "what does")):
            answer_text = raw_answer
        elif q_start.startswith(("who",)):
            answer_text = raw_answer
        elif q_start.startswith(("how",)):
            answer_text = raw_answer
        elif q_start.startswith(("why",)):
            answer_text = raw_answer
        else:
            answer_text = raw_answer

        # Ensure it ends with a period
        if answer_text and not answer_text.endswith(('.', '!', '?')):
            answer_text += '.'

        confidence = round(min(best_score + 0.15, 0.95), 4)

        # source passage: the original surrounding context (1 sentence)
        source_passage = best_sent

        return {
            "answer": answer_text,
            "confidence": confidence,
            "source_passage": source_passage,
        }

    def _qa_hf(self, question: str, context: str) -> Dict:
        """Use deepset/roberta-base-squad2 via HF Inference API."""
        truncated_context = " ".join(context.split()[:400])
        payload = {"inputs": {"question": question, "context": truncated_context}}
        result = self._hf_post("deepset/roberta-base-squad2", payload)
        return {
            "answer": result.get("answer", ""),
            "confidence": round(float(result.get("score", 0.0)), 4),
            "source_passage": truncated_context,
        }

    def _qa_local(self, question: str, context: str) -> Dict:
        """Use local roberta-base-squad2 pipeline."""
        truncated = " ".join(context.split()[:400])
        pipe = self._get_local_qa()
        result = pipe(question=question, context=truncated)
        return {
            "answer": result.get("answer", ""),
            "confidence": round(float(result.get("score", 0.0)), 4),
            "source_passage": truncated,
        }

    # ══════════════════════════════════════════════════════════════════════════
    # generate_flashcards
    # ══════════════════════════════════════════════════════════════════════════

    def generate_flashcards(self, text: str, num_cards: int = 10) -> List[Dict]:
        """
        Generate *num_cards* flashcards from *text*.

        Each flashcard is::
            {"front": str, "back": str, "hint": str}
        """
        if not text or not text.strip():
            return []

        try:
            if self._mode in ("hf_api", "local"):
                cards = self._flashcards_ai(text, num_cards)
            else:
                cards = self._flashcards_lite(text, num_cards)

            # Ensure we have at least a few cards
            if len(cards) < min(num_cards, 3):
                extra = self._flashcards_lite(text, num_cards - len(cards))
                cards.extend(extra)

            return cards[:num_cards]
        except Exception as exc:
            logger.error("generate_flashcards error: %s", exc)
            return self._flashcards_lite(text, num_cards)

    def _flashcards_lite(self, text: str, num_cards: int) -> List[Dict]:
        """
        Lite flashcard generation strategy:
          1. Paragraph-based: first sentence = front, rest = back.
          2. Key-term definition cards: "What is [TERM]?" → surrounding sentence.
          3. Fill-in-the-blank cards from sentences.
        """
        from services.pdf_service import PdfService
        pdf_svc = PdfService()
        all_paragraphs = pdf_svc.extract_paragraphs(text)
        
        # Stratified sampling across ALL pages (beginning, middle, and end of document)
        if len(all_paragraphs) > num_cards:
            step = len(all_paragraphs) / float(num_cards)
            paragraphs = [all_paragraphs[int(i * step)] for i in range(num_cards)]
        else:
            paragraphs = all_paragraphs

        # Ensure we have sentences
        sentences = [s.strip() for s in sent_tokenize(text) if s.strip()]
        if not sentences:
            sentences = [s.strip() for s in text.split('\n') if s.strip()]
        if not sentences:
            sentences = [text]

        key_terms = extract_key_terms(text, top_n=40)
        cards: List[Dict] = []

        # Strategy 1: paragraph-level cards (sampled from all pages)
        for para in paragraphs:
            para_sents = [s.strip() for s in sent_tokenize(para) if s.strip()]
            if len(para_sents) < 2:
                continue
            front = para_sents[0]
            back = " ".join(para_sents[1:3])
            hint = para_sents[-1] if len(para_sents) > 3 else ""
            if len(front) > 10 and len(back) > 10:
                cards.append({"front": front, "back": back, "hint": hint})

        # Strategy 2: key-term definition cards
        for term in key_terms:
            if len(cards) >= num_cards:
                break
            # Find a sentence that contains this term
            for sent in sentences:
                if re.search(r"\b" + re.escape(term) + r"\b", sent, re.IGNORECASE):
                    front = f"What is '{term}' in this context?"
                    back = sent
                    hint = f"Look for the definition or usage of '{term}'."
                    cards.append({"front": front, "back": back, "hint": hint})
                    break

        # Strategy 3: fill-in-the-blank cards
        if len(cards) < num_cards and len(sentences) >= 2:
            try:
                # Any sentence can be blanked out
                for sent in sentences:
                    if len(cards) >= num_cards:
                        break
                    words = sent.split()
                    if len(words) > 5:
                        mid = len(words) // 2
                        blank_word = words[mid]
                        # Clean up punctuation from blank word
                        blank_word_clean = blank_word.strip(".,;:?!\"()'")
                        if len(blank_word_clean) > 3:
                            blanked = " ".join(
                                w if i != mid else "_____" for i, w in enumerate(words)
                            )
                            cards.append({
                                "front": f"Fill in the blank: {blanked}",
                                "back": f"The missing word is: '{blank_word_clean}'",
                                "hint": "Think about the context of the surrounding words.",
                            })
            except Exception as exc:
                logger.warning("fill-in-blank cards failed: %s", exc)

        # Strategy 4: Fallback to simple split cards if we still have nothing
        if not cards:
            for i, sent in enumerate(sentences[:num_cards]):
                cards.append({
                    "front": f"Review Card {i+1} from key text",
                    "back": sent,
                    "hint": "Refer directly to your uploaded notes."
                })

        # Deduplicate fronts
        seen: set = set()
        unique: List[Dict] = []
        for card in cards:
            key = card["front"][:60].lower()
            if key not in seen:
                seen.add(key)
                unique.append(card)

        # If we still have fewer cards than requested, pad them
        while len(unique) < min(num_cards, 5) and sentences:
            sent = random.choice(sentences)
            unique.append({
                "front": f"Explain this key statement: '{sent[:60]}...'",
                "back": sent,
                "hint": "Analyze the context of this statement."
            })

        return unique[:num_cards]

    def _flashcards_ai(self, text: str, num_cards: int) -> List[Dict]:
        """
        Generate flashcards using an AI model.
        For simplicity, falls back to lite mode with richer prompting.
        """
        return self._flashcards_lite(text, num_cards)

    # ══════════════════════════════════════════════════════════════════════════
    # generate_quiz
    # ══════════════════════════════════════════════════════════════════════════

    def generate_quiz(self, text: str, num_questions: int = 5) -> List[Dict]:
        """
        Generate *num_questions* multiple-choice quiz questions from *text*.

        Each question is::
            {
                "question": str,
                "options": [str, str, str, str],   # always 4
                "correct_answer": str,
                "explanation": str,
            }
        """
        if not text or not text.strip():
            return []

        try:
            if self._mode in ("hf_api", "local"):
                questions = self._quiz_ai(text, num_questions)
            else:
                questions = self._quiz_lite(text, num_questions)

            if len(questions) < min(num_questions, 2):
                questions.extend(self._quiz_lite(text, num_questions - len(questions)))

            return questions[:num_questions]
        except Exception as exc:
            logger.error("generate_quiz error: %s", exc)
            return self._quiz_lite(text, num_questions)

    def _quiz_lite(self, text: str, num_questions: int) -> List[Dict]:
        """
        Generate genuine quiz questions where:
        - Questions are phrased naturally (not copy-pasted from text)
        - Answer OPTIONS are short keywords/phrases (not whole sentences)
        - Each question has a clear, single correct short answer
        """
        sentences = [s.strip() for s in sent_tokenize(text) if s.strip()]
        if not sentences:
            sentences = [s.strip() for s in text.split('\n') if s.strip()]
        if not sentences:
            sentences = [text]

        key_terms = extract_key_terms(text, top_n=50)
        if not key_terms:
            key_terms = list(set([w.strip(".,;:?!") for w in text.split() if len(w) > 4]))[:20]

        # Informative sentences (7-50 words — not headers, not too long)
        info_sents = [s for s in sentences if 7 <= len(s.split()) <= 50]
        if not info_sents:
            info_sents = sentences
        random.shuffle(info_sents)

        questions: List[Dict] = []
        used_terms: set = set()
        used_sents: set = set()

        # ── Helper: shorten a sentence to a readable snippet ─────────────────
        def _snippet(s: str, max_words: int = 12) -> str:
            words = s.split()
            return " ".join(words[:max_words]) + ("..." if len(words) > max_words else "")

        # ── TYPE A: What-is / Definition (short keyword answer) ───────────────
        # Question: "What is [term]?"  Options: correct term meaning + 3 other terms
        what_templates = [
            "What is '{term}'?",
            "How would you describe '{term}'?",
            "What does '{term}' mean in this context?",
            "Which of these best describes '{term}'?",
        ]
        for term in key_terms:
            if len(questions) >= num_questions:
                break
            if term in used_terms:
                continue
            # Find the sentence that best explains this term
            for sent in info_sents:
                if sent in used_sents:
                    continue
                if re.search(r"\b" + re.escape(term) + r"\b", sent, re.IGNORECASE):
                    # Make the CORRECT answer a short snippet of that sentence
                    correct_opt = _snippet(sent, 10)
                    # Distractors = snippets of OTHER sentences (not the same)
                    distractor_pool = [
                        _snippet(s, 10) for s in info_sents
                        if s != sent and s not in used_sents
                    ]
                    random.shuffle(distractor_pool)
                    distractors = distractor_pool[:3]
                    while len(distractors) < 3:
                        distractors.append(random.choice([
                            "It is not mentioned in the text",
                            "A general background concept",
                            "An unrelated idea from a different topic",
                        ]))
                    options = [correct_opt] + distractors
                    random.shuffle(options)
                    q_tmpl = random.choice(what_templates)
                    questions.append({
                        "question": q_tmpl.format(term=term),
                        "options": options[:4],
                        "correct_answer": correct_opt,
                        "explanation": f"According to the text: \"{sent.strip()}\"",
                    })
                    used_sents.add(sent)
                    used_terms.add(term)
                    break

        # ── TYPE B: Fill-in-the-Blank (single keyword answer) ────────────────
        fitb_target = max(1, num_questions // 4)
        fitb_done = 0
        random.shuffle(info_sents)
        try:
            for sent in info_sents:
                if fitb_done >= fitb_target or len(questions) >= num_questions:
                    break
                if sent in used_sents:
                    continue
                words = sent.split()
                # Pick a content word to blank out
                candidates = [
                    (i, w.strip(".,;:?!'\""))
                    for i, w in enumerate(words)
                    if len(w.strip(".,;:?!'\"")) > 4
                    and w.strip(".,;:?!'\"").isalpha()
                    and i not in (0, len(words) - 1)
                ]
                if not candidates:
                    continue
                blank_pos, correct_word = random.choice(candidates)
                blanked = " ".join(
                    "_____" if i == blank_pos else w for i, w in enumerate(words)
                )
                # Options: correct word + 3 other key terms
                distractor_terms = [
                    t for t in key_terms if t.lower() != correct_word.lower()
                ]
                random.shuffle(distractor_terms)
                distractors = distractor_terms[:3]
                while len(distractors) < 3:
                    distractors.append(random.choice(
                        ["result", "method", "process", "system", "factor"]
                    ))
                options = [correct_word] + distractors
                random.shuffle(options)
                questions.append({
                    "question": f"Fill in the blank: {blanked}",
                    "options": options[:4],
                    "correct_answer": correct_word,
                    "explanation": f"The full sentence is: \"{sent}\"",
                })
                used_sents.add(sent)
                fitb_done += 1
        except Exception as exc:
            logger.warning("quiz fill-in-blank failed: %s", exc)

        # ── TYPE C: Concept probe (How / Why / What / Which) ─────────────────
        concept_templates = [
            "How does '{term}' work according to the text?",
            "Why is '{term}' important in this context?",
            "What is the main purpose of '{term}'?",
            "Which statement correctly describes '{term}'?",
            "What happens when '{term}' is applied?",
        ]
        remaining_terms = [t for t in key_terms if t not in used_terms]
        random.shuffle(remaining_terms)
        tmpl_idx = 0
        for term in remaining_terms:
            if len(questions) >= num_questions:
                break
            for sent in info_sents:
                if sent in used_sents:
                    continue
                if re.search(r"\b" + re.escape(term) + r"\b", sent, re.IGNORECASE):
                    correct_opt = _snippet(sent, 10)
                    distractor_pool = [
                        _snippet(s, 10) for s in info_sents if s != sent
                    ]
                    random.shuffle(distractor_pool)
                    distractors = distractor_pool[:3]
                    while len(distractors) < 3:
                        distractors.append("Not covered in the material")
                    options = [correct_opt] + distractors
                    random.shuffle(options)
                    tmpl = concept_templates[tmpl_idx % len(concept_templates)]
                    tmpl_idx += 1
                    questions.append({
                        "question": tmpl.format(term=term),
                        "options": options[:4],
                        "correct_answer": correct_opt,
                        "explanation": f"The text says: \"{sent.strip()}\"",
                    })
                    used_sents.add(sent)
                    used_terms.add(term)
                    break

        # ── TYPE D: True / False ──────────────────────────────────────────────
        tf_templates = [
            'True or False: "{stmt}"',
            'Is this statement correct? "{stmt}"',
            'Does the text support this? "{stmt}"',
        ]
        tf_cycle = 0
        for sent in info_sents:
            if len(questions) >= num_questions:
                break
            if sent in used_sents or len(sent.split()) < 8:
                continue
            q_text = tf_templates[tf_cycle % len(tf_templates)].format(stmt=sent.strip())
            tf_cycle += 1
            options = ["True", "False", "Cannot be determined from the text", "Partially correct"]
            questions.append({
                "question": q_text,
                "options": options,
                "correct_answer": "True",
                "explanation": "This statement is taken directly from the source material.",
            })
            used_sents.add(sent)

        # Deduplicate and enforce exactly 4 options
        seen: set = set()
        unique: List[Dict] = []
        for q in questions:
            key = q["question"][:80].lower()
            if key not in seen:
                seen.add(key)
                while len(q["options"]) < 4:
                    q["options"].append("None of the above")
                unique.append(q)

        # Shuffle the final list so question types are interleaved
        random.shuffle(unique)
        return unique[:num_questions]

    def _quiz_ai(self, text: str, num_questions: int) -> List[Dict]:
        """AI-based quiz generation — falls back to lite for now."""
        return self._quiz_lite(text, num_questions)

    def _generate_distractors(
        self, correct: str, all_sentences: List[str], n: int = 3
    ) -> List[str]:
        """
        Generate *n* distractor answer options from *all_sentences*,
        excluding *correct*, with fallback padding.
        """
        pool = [s.strip() for s in all_sentences if s.strip() != correct and len(s) > 15]
        random.shuffle(pool)
        distractors = pool[:n]
        
        # Plausible academic generic distractors
        generics = [
            "This concept is not supported by the context.",
            "This represents an unrelated detail from the text.",
            "None of the other options are correct.",
            "This is a misinterpretation of the statement.",
            "This statement is incorrect under these conditions.",
            "This represents an alternative but invalid viewpoint."
        ]
        
        while len(distractors) < n:
            cand = random.choice(generics)
            if cand not in distractors:
                distractors.append(cand)
                
        return distractors



    # ══════════════════════════════════════════════════════════════════════════
    # get_recommendations
    # ══════════════════════════════════════════════════════════════════════════

    def get_recommendations(self, user_stats: Dict) -> List[str]:
        """
        Rule-based personalised study recommendations.

        *user_stats* should include: avg_quiz_score, streak_days,
        avg_mastery, due_cards, total_sessions, xp_points, level.
        """
        tips: List[str] = []

        avg_score = user_stats.get("avg_quiz_score", 0)
        streak = user_stats.get("streak_days", 0)
        avg_mastery = user_stats.get("avg_mastery", 0)
        due_cards = user_stats.get("due_cards", 0)
        total_sessions = user_stats.get("total_sessions", 0)
        level = user_stats.get("level", 1)

        # Quiz performance
        if avg_score < 50:
            tips.append(
                "Your quiz scores are below 50%. Try reviewing the summaries before taking quizzes."
            )
        elif avg_score < 75:
            tips.append(
                "You're scoring between 50-75%. Focus on the topics where you answered incorrectly."
            )
        else:
            tips.append(
                "Excellent quiz performance! Challenge yourself with longer quizzes to push further."
            )

        # Streaks
        if streak == 0:
            tips.append(
                "Start a study streak today! Consistent daily practice is the fastest path to mastery."
            )
        elif streak < 3:
            tips.append(
                f"You have a {streak}-day streak — keep going! Aim for 7 days to unlock the Weekly Warrior badge."
            )
        elif streak < 7:
            tips.append(
                f"Great {streak}-day streak! You're close to the 7-day milestone. Don't break it!"
            )
        else:
            tips.append(
                f"Impressive {streak}-day streak! You're building a powerful study habit."
            )

        # Flashcard mastery
        if avg_mastery < 2:
            tips.append(
                "Your flashcard mastery is low. Review due cards daily to build long-term memory."
            )
        elif avg_mastery < 4:
            tips.append(
                "Good flashcard progress! Push through to mastery level 4-5 for true long-term retention."
            )

        # Due cards
        if due_cards > 10:
            tips.append(
                f"You have {due_cards} flashcards due for review. Clear them to maintain your spaced repetition schedule."
            )
        elif due_cards > 0:
            tips.append(
                f"You have {due_cards} card(s) due. Quick review sessions keep your memory sharp!"
            )

        # Session volume
        if total_sessions < 5:
            tips.append(
                "You're just getting started. Upload more study material to unlock all AI features."
            )
        elif total_sessions < 20:
            tips.append(
                "You're building momentum! Try the Q&A feature to deepen your understanding."
            )

        # Level-based
        if level < 5:
            tips.append(
                "Earn XP by completing quizzes, reviewing flashcards, and asking questions to level up faster."
            )
        elif level >= 10:
            tips.append(
                f"You've reached level {level}! Consider revisiting older documents to reinforce past learning."
            )

        return tips[:6]  # cap at 6 recommendations
