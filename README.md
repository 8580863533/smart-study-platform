# 🎓 Smart Study Platform — AI Study Tutor

A full-stack, gamified AI-powered study assistant built to help students study smarter by summarizing notes, answering contextual questions, auto-generating active-recall flashcard decks, testing note mastery with circular timed quizzes, and auditing user security logs (login histories).

---

## 🚀 Key Features

*   **Smart Document Q&A**: Ask natural language questions about your uploaded study notes and lecture PDFs. Powered by extractive Q&A models, returning confidence metrics and exact source references.
*   **AI Summarization**: Condense long textbooks or PDFs into bullet points and key takeaways, tracking compression percentages and read-time changes.
*   **Active-Recall Flashcards**: Auto-generate flashcards from your documents, featuring a 3D flipping card study deck with Spaced Repetition (SR) scheduling (mastery levels 0-5).
*   **Adaptive MCQ Quizzes**: Test your knowledge with custom-generated multiple-choice questions, complete with a circular countdown timer and detailed explanation keys.
*   **Gamified Progress Tracker**: Earn XP, level up, and maintain study streaks. Track study durations and weekly progress via interactive charts.
*   **Login History Audits**: Keep your account secure with full logging of IP addresses, devices, browsers, operating systems, login locations, and session durations.
*   **Voice Interaction**: Integrated browser-native Speech-to-Text (SpeechRecognition API) for hands-free study queries.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, React Router v6, Axios, Recharts |
| **Styling** | Custom Vanilla CSS (Dark Glassmorphism Design System) |
| **Backend** | Python 3.11, Flask 3.x, Flask-SQLAlchemy, Flask-JWT-Extended, Flask-CORS |
| **Database** | SQLite (development) / PostgreSQL (production ready) |
| **AI Processing** | Hugging Face Transformers (`bart-large-cnn`, `roberta-base-squad2`), NLTK, Sumy |
| **PDF Extraction** | PyMuPDF (`fitz`), Tesseract OCR |
| **Containerization** | Docker, Docker Compose |

---

## 📂 Project Structure

```
├── backend/
│   ├── routes/              # Flask API blueprints (auth, doc, qa, flashcard, quiz, progress)
│   ├── services/            # Core business logic (AI model adapters, PDF extraction)
│   ├── app.py               # Application factory & settings initialization
│   ├── models.py            # SQLAlchemy schema models (User, LoginHistory, Document, etc.)
│   ├── run.py               # Main Flask entrypoint script
│   ├── requirements.txt     # Python backend dependencies
│   └── Dockerfile           # Backend container instructions
├── frontend/
│   ├── src/
│   │   ├── api/             # Axios request definitions
│   │   ├── components/      # Global widgets (Navbar, Sidebar, VoiceButton, Toast)
│   │   ├── context/         # Auth, Study, and Toast React Context providers
│   │   ├── pages/           # All application routes (Dashboard, Q&A, Quiz, Security logs...)
│   │   ├── index.css        # Full CSS dark theme tokens, classes, and animations
│   │   └── App.jsx          # Route definitions & protected route wrappers
│   └── vite.config.js       # Vite configuration with backend reverse proxy
├── docker-compose.yml       # Docker environment configuration
└── README.md                # This manual
```

---

## ⚙️ Setup & Local Development

### Prerequisites
*   Python 3.11+
*   Node.js 18+
*   Pip / npm

### Step 1: Clone and Set Up the Backend
1. Move to the backend folder:
   ```bash
   cd backend
   ```
2. Create and activate a python virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On MacOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up environment variables. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   *Note: If `HF_API_KEY` is left blank and `USE_LOCAL_MODELS` is false, the application automatically runs in **Lite Mode**, using lightweight TF-IDF and NLP algorithms (no internet connection or GPU required).*

5. Start the backend developer server:
   ```bash
   python run.py
   ```
   *The Flask backend will launch at `http://localhost:5000`.*

### Step 2: Set Up the Frontend
1. Open a new terminal window and move to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install npm modules:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
   *The Vite dev server will host at `http://localhost:5173` (with proxies routing `/api` calls directly to `http://localhost:5000`).*

---

## 🐳 Docker Setup

To run the complete application inside Docker containers:

1. Build and run containers using Docker Compose from the root folder:
   ```bash
   docker-compose up --build
   ```
2. Open `http://localhost:5173` in your browser.

---

## 🌐 Production Deployment

The project is structured for easy deployment to cloud services like Render, Railway, or Heroku.

### Backend Deployment (e.g. Render)
*   **Environment**: Docker (Render will read the Dockerfile) or Python.
*   **Build Command**: `pip install -r requirements.txt` (if not deploying via Docker).
*   **Start Command**: `gunicorn --bind 0.0.0.0:5000 run:app`.
*   **Database**: Provision a PostgreSQL instance and provide the connection string in the `DATABASE_URL` environment variable.

### Frontend Deployment (e.g. Vercel / Netlify / Render)
*   **Build Command**: `npm run build`.
*   **Output Directory**: `dist`.
