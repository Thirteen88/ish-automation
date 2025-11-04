# Anthropic Claude Provider Container
FROM python:3.11-slim

LABEL maintainer="ISH Chat Team"
LABEL description="Anthropic Claude AI Provider Microservice"
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
RUN groupadd -r claude && useradd -r -g claude claude

# Copy Python requirements
COPY claude-requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r claude-requirements.txt

# Copy application code
COPY src/services/ai_service.py ./src/services/
COPY src/config/settings.py ./src/config/
COPY health_check.py .

# Create necessary directories
RUN mkdir -p src/services src/config logs && \
    chown -R claude:claude /app

# Switch to non-root user
USER claude

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python health_check.py --provider claude || exit 1

# Expose port
EXPOSE 8003

# Run the Claude provider service
CMD ["python", "-m", "src.services.claude_provider"]