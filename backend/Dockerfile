FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download required NLTK resources
RUN python -m nltk.downloader punkt stopwords averaged_perceptron_tagger punkt_tab

# Copy the rest of the application
COPY . .

EXPOSE 5000

ENV FLASK_ENV=production
ENV FLASK_DEBUG=false

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "run:app"]
