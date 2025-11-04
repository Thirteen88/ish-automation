# Perplexity Provider Container
FROM python:3.11-slim

LABEL maintainer="ISH Chat Team"
LABEL description="Perplexity AI Provider Microservice"
LABEL version="1.0.0"

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/app

# Create app directory
WORKDIR /app

# Install system dependencies for Android ADB and Perplexity integration
RUN apt-get update && apt-get install -y \
    curl \
    jq \
    android-tools-adb \
    android-sdk-platform-tools \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r perplexity && useradd -r -g perplexity perplexity

# Copy Python requirements
COPY perplexity-requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r perplexity-requirements.txt

# Copy application code
COPY src/services/perplexity_service.py ./src/services/
COPY src/config/settings.py ./src/config/
COPY health_check.py .

# Create necessary directories
RUN mkdir -p src/services src/config logs /tmp/screenshots && \
    chown -R perplexity:perplexity /app

# Switch to non-root user
USER perplexity

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python health_check.py --provider perplexity || exit 1

# Expose port
EXPOSE 8004

# Run the Perplexity provider service
CMD ["python", "-m", "src.services.perplexity_provider"]