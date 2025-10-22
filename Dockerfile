# Multi-stage build for ISH Automation System
# Stage 1: Build dependencies and compile TypeScript
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    chromium \
    chromium-chromedriver

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY *.js ./
COPY config/ ./config/
COPY resilience/ ./resilience/
COPY monitoring/ ./monitoring/
COPY logging/ ./logging/

# Build TypeScript
RUN npm run build || true

# Stage 2: Production image
FROM node:18-alpine

# Install runtime dependencies including Chromium for Playwright
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    sqlite \
    dumb-init

# Set Playwright to use installed Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy dependencies from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy application files
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs *.js ./
COPY --chown=nodejs:nodejs config/ ./config/
COPY --chown=nodejs:nodejs resilience/ ./resilience/
COPY --chown=nodejs:nodejs monitoring/ ./monitoring/
COPY --chown=nodejs:nodejs logging/ ./logging/
COPY --chown=nodejs:nodejs public/ ./public/

# Create necessary directories
RUN mkdir -p \
    /app/logs/alerts \
    /app/cache \
    /app/cookies \
    /app/downloads \
    /app/sessions \
    /app/screenshots \
    /app/.secrets && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose ports
# 3000: Main API server
# 3001: Web interface
# 3002: PWA server
# 8080: Health/metrics endpoint
EXPOSE 3000 3001 3002 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Default command (can be overridden)
CMD ["node", "web-server.js"]
