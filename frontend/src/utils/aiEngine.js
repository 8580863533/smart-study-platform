// utils/aiEngine.js — Client-side AI fallback & Local Document Storage Engine

export function getStoredDocuments() {
  try {
    const raw = localStorage.getItem('study_documents');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn("Failed to read stored documents:", e);
  }

  // Default sample document if storage is empty
  const defaultDoc = {
    id: 'doc-ai-master-1',
    title: 'Artificial Intelligence & Neural Networks (13-Page Comprehensive Notes)',
    word_count: 1420,
    file_type: 'pdf',
    created_at: new Date().toISOString(),
    content: "Artificial Intelligence (AI) is the science and engineering of making intelligent machines, especially intelligent computer programs. Machine learning is a method of data analysis that automates analytical model building. It is a branch of artificial intelligence based on the idea that systems can learn from data, identify patterns and make decisions with minimal human intervention.\n\nDeep learning is a subset of machine learning, which is essentially a neural network with three or more layers. These neural networks attempt to simulate the behavior of the human brain to learn from large amounts of data. Supervised learning algorithms learn from labeled data to predict outcomes or classify information. Unsupervised learning discovers hidden patterns or data groupings without human intervention.\n\nReinforcement learning is a machine learning training method based on rewarding desired behaviors and punishing undesired ones. Natural Language Processing (NLP) refers to the branch of computer science and artificial intelligence concerned with giving computers the ability to understand text and spoken words in much the same way human beings can.\n\nKey components of neural networks include input layers, hidden layers, activation functions (like ReLU, Sigmoid), weights, biases, loss functions, and backpropagation algorithms with gradient descent optimizer. Convolutional Neural Networks (CNNs) excel at image processing, while Recurrent Neural Networks (RNNs) and Transformers power modern language models."
  };
  return [defaultDoc];
}

export function saveDocumentLocally(doc) {
  try {
    const docs = getStoredDocuments();
    const existingIndex = docs.findIndex(d => d.id === doc.id);
    if (existingIndex >= 0) {
      docs[existingIndex] = { ...docs[existingIndex], ...doc };
    } else {
      docs.unshift(doc);
    }
    localStorage.setItem('study_documents', JSON.stringify(docs));
    return docs;
  } catch (e) {
    console.error("Failed to save document locally:", e);
    return [];
  }
}

export function deleteStoredDocument(id) {
  try {
    const docs = getStoredDocuments().filter(d => d.id !== id);
    localStorage.setItem('study_documents', JSON.stringify(docs));
    return docs;
  } catch (e) {
    console.error("Failed to delete local document:", e);
    return [];
  }
}

// Client-Side AI: Q&A Engine
export function answerQuestionFromText(question, text) {
  if (!question || !text) {
    return {
      answer: "Please provide a question and notes content.",
      confidence: 0.0,
      source_passage: ""
    };
  }

  const qLower = question.toLowerCase().trim();
  const stopWords = new Set(["what", "is", "are", "was", "were", "who", "how", "why", "when", "where", "which", "does", "do", "did", "the", "a", "an", "of", "in", "on", "to", "for", "with", "about"]);
  const qWords = qLower.split(/[^a-zA-Z0-9]+/).filter(w => w.length > 2 && !stopWords.has(w));

  const sentences = text.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(s => s.length > 15);
  if (sentences.length === 0) {
    return {
      answer: text.slice(0, 300) + "...",
      confidence: 0.7,
      source_passage: text.slice(0, 200)
    };
  }

  let bestSent = sentences[0];
  let bestScore = -1;

  for (const sent of sentences) {
    const sentLower = sent.toLowerCase();
    let score = 0;
    for (const w of qWords) {
      if (sentLower.includes(w)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestSent = sent;
    }
  }

  return {
    answer: bestSent,
    confidence: bestScore > 0 ? 0.92 : 0.75,
    source_passage: bestSent
  };
}

// Client-Side AI: Quiz Generation
export function generateQuizFromText(text, numQuestions = 5) {
  const sentences = text.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(s => s.split(' ').length >= 6);
  const questions = [];
  const total = Math.min(sentences.length, numQuestions);
  const step = Math.max(1, Math.floor(sentences.length / total));

  for (let i = 0; i < total; i++) {
    const sent = sentences[i * step] || sentences[i] || "Artificial Intelligence enables smart computing systems.";
    const words = sent.split(' ').map(w => w.replace(/[^a-zA-Z0-9]/g, '')).filter(w => w.length > 4);
    const keyWord = words[Math.floor(words.length / 2)] || "Intelligence";
    const blanked = sent.replace(new RegExp('\\b' + keyWord + '\\b', 'i'), '______');

    const distractors = ["Learning", "Processing", "Network", "Algorithms", "Optimization", "Inference"].filter(d => d.toLowerCase() !== keyWord.toLowerCase());

    const options = [keyWord, distractors[0], distractors[1], distractors[2]].sort(() => 0.5 - Math.random());

    questions.push({
      question: "Fill in the blank: \"" + blanked + "\"",
      options: options,
      correct_answer: keyWord,
      explanation: "Full context: \"" + sent + "\""
    });
  }

  return {
    quiz_id: 'quiz-' + Date.now(),
    questions: questions
  };
}

// Client-Side AI: Flashcard Generation
export function generateFlashcardsFromText(text, numCards = 8) {
  const sentences = text.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(s => s.length > 20);
  const cards = [];
  const total = Math.min(sentences.length, numCards);
  const step = Math.max(1, Math.floor(sentences.length / total));

  for (let i = 0; i < total; i++) {
    const sent = sentences[i * step] || sentences[i];
    const words = sent.split(' ');
    const term = words.slice(0, 3).join(' ').replace(/[^a-zA-Z0-9 ]/g, '');
    cards.push({
      id: 'card-' + Date.now() + '-' + i,
      front: "What is key concept: \"" + term + "\"?",
      back: sent,
      hint: "Refer to section on " + term
    });
  }
  return cards;
}

// Client-Side AI: Summarization
export function summarizeTextContent(text, numBullets = 6) {
  const sentences = text.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(s => s.length > 25);
  const bullets = [];
  const total = Math.min(sentences.length, numBullets);
  const step = Math.max(1, Math.floor(sentences.length / total));

  for (let i = 0; i < total; i++) {
    bullets.push(sentences[i * step] || sentences[i]);
  }

  return {
    summary_bullets: bullets,
    word_count: text.split(/\s+/).length,
    xp_earned: 15
  };
}
