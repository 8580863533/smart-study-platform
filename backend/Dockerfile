FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy production requirements and install
COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt

# Download required NLTK resources
RUN python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab'); nltk.download('stopwords'); nltk.download('averaged_perceptron_tagger')"

# Copy the rest of the application
COPY . .

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 10000

ENV FLASK_ENV=production
ENV FLASK_DEBUG=false
ENV PORT=10000

CMD gunicorn --bind 0.0.0.0:${PORT} --workers 2 --timeout 120 run:app
