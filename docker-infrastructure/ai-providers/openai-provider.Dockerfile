# OpenAI Provider Container
FROM python:3.11-slim

LABEL maintainer="ISH Chat Team"
LABEL description="OpenAI GPT-4 AI Provider Microservice"
LABEL version="1.0.0"

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/app

# Create app directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r openai && useradd -r -g openai openai

# Copy Python requirements
COPY openai-requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r openai-requirements.txt

# Copy application code
COPY src/services/ai_service.py ./src/services/
COPY src/config/settings.py ./src/config/
COPY health_check.py .

# Create necessary directories
RUN mkdir -p src/services src/config logs && \
    chown -R openai:openai /app

# Switch to non-root user
USER openai

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python health_check.py --provider openai || exit 1

# Expose port
EXPOSE 8002

# Run the OpenAI provider service
CMD ["python", "-m", "src.services.openai_provider"]