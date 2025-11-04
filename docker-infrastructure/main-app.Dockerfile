# ISH Chat Main Application Container
FROM python:3.11-slim

LABEL maintainer="ISH Chat Team"
LABEL description="ISH Chat Main Backend Application"
LABEL version="1.0.0"

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/app

# Create app directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    jq \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgthread-2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r ishchat && useradd -r -g ishchat ishchat

# Copy Python requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/
COPY static/ ./static/
COPY health_check.py .

# Create necessary directories
RUN mkdir -p logs uploads temp screenshots && \
    chown -R ishchat:ishchat /app

# Switch to non-root user
USER ishchat

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python health_check.py --app main || exit 1

# Expose ports
EXPOSE 8000 9090

# Run the main application
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]