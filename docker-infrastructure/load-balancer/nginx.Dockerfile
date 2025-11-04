# Enhanced Nginx Dockerfile for ISH Chat Load Balancer
# Optimized for performance, security, and monitoring

FROM nginx:1.25-alpine

# Set environment variables
ENV NGINX_VERSION=1.25.3
ENV NJS_VERSION=0.8.2
ENV PKG_RELEASE=1

# Install additional packages for performance and monitoring
RUN apk add --no-cache \
    curl \
    ca-certificates \
    gzip \
    brotli \
    openssl \
    openssl-dev \
    pcre-dev \
    zlib-dev \
    linux-headers \
    libc-dev \
    make \
    gcc \
    git \
    vim

# Create directories for optimization
RUN mkdir -p /var/cache/nginx/proxy \
             /var/cache/nginx/fast \
             /var/cache/nginx/fastcgi \
             /var/tmp/nginx_proxy_temp \
             /var/tmp/nginx_fastcgi_temp \
             /var/log/nginx \
             /etc/nginx/ssl \
             /var/www/html/error-pages \
             /var/www/certbot

# Create nginx user with proper permissions
RUN addgroup -g 101 -S nginx && \
    adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx

# Set proper permissions
RUN chown -R nginx:nginx /var/cache/nginx /var/tmp /var/log/nginx && \
    chmod -R 755 /var/cache/nginx /var/tmp && \
    chmod -R 750 /var/log/nginx

# Copy custom configuration files
COPY nginx-enhanced.conf /etc/nginx/nginx.conf
COPY nginx-performance.conf /etc/nginx/nginx-performance.conf
COPY ssl-config.conf /etc/nginx/ssl-config.conf

# Copy SSL files (if they exist)
COPY ssl/ /etc/nginx/ssl/

# Create custom error pages
RUN cat > /var/www/html/error-pages/401.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>401 Unauthorized</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #e74c3c; }
    </style>
</head>
<body>
    <h1>401 Unauthorized</h1>
    <p>Authentication is required to access this resource.</p>
</body>
</html>
EOF

RUN cat > /var/www/html/error-pages/403.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>403 Forbidden</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #e74c3c; }
    </style>
</head>
<body>
    <h1>403 Forbidden</h1>
    <p>You don't have permission to access this resource.</p>
</body>
</html>
EOF

RUN cat > /var/www/html/error-pages/404.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>404 Not Found</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #e74c3c; }
    </style>
</head>
<body>
    <h1>404 Not Found</h1>
    <p>The requested resource was not found.</p>
</body>
</html>
EOF

RUN cat > /var/www/html/error-pages/429.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>429 Too Many Requests</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #f39c12; }
    </style>
</head>
<body>
    <h1>429 Too Many Requests</h1>
    <p>You have exceeded the rate limit. Please try again later.</p>
</body>
</html>
EOF

RUN cat > /var/www/html/error-pages/500.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>500 Internal Server Error</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #e74c3c; }
    </style>
</head>
<body>
    <h1>500 Internal Server Error</h1>
    <p>An internal server error occurred. Please try again later.</p>
</body>
</html>
EOF

# Create custom nginx modules and scripts
RUN cat > /usr/local/bin/nginx-health-check.sh << 'EOF'
#!/bin/sh

# Nginx Health Check Script
# Used by Docker health checks

# Check if nginx is running
if ! pgrep nginx > /dev/null; then
    echo "Nginx is not running"
    exit 1
fi

# Check nginx configuration
if ! nginx -t > /dev/null 2>&1; then
    echo "Nginx configuration test failed"
    exit 1
fi

# Check if nginx can bind to ports
if ! netstat -tlnp | grep -q ":80.*nginx" && ! netstat -tlnp | grep -q ":443.*nginx"; then
    echo "Nginx is not listening on expected ports"
    exit 1
fi

# Test HTTP endpoint
if command -v curl > /dev/null; then
    if ! curl -f -s http://localhost/health > /dev/null; then
        echo "HTTP health check failed"
        exit 1
    fi
fi

echo "Nginx health check passed"
exit 0
EOF

RUN chmod +x /usr/local/bin/nginx-health-check.sh

# Create log rotation script
RUN cat > /usr/local/bin/nginx-log-rotate.sh << 'EOF'
#!/bin/sh

# Nginx Log Rotation Script
# Rotates and compresses nginx logs

LOG_DIR="/var/log/nginx"
MAX_FILES=10

# Rotate access logs
if [ -f "$LOG_DIR/access.log" ]; then
    mv "$LOG_DIR/access.log" "$LOG_DIR/access.log.$(date +%Y%m%d_%H%M%S)"
    gzip "$LOG_DIR/access.log.$(date +%Y%m%d_%H%M%S)"
fi

# Rotate error logs
if [ -f "$LOG_DIR/error.log" ]; then
    mv "$LOG_DIR/error.log" "$LOG_DIR/error.log.$(date +%Y%m%d_%H%M%S)"
    gzip "$LOG_DIR/error.log.$(date +%Y%m%d_%H%M%S)"
fi

# Keep only last N files
cd "$LOG_DIR"
ls -t access.log.*.gz 2>/dev/null | tail -n +$((MAX_FILES + 1)) | xargs -r rm -f
ls -t error.log.*.gz 2>/dev/null | tail -n +$((MAX_FILES + 1)) | xargs -r rm -f

# Reopen log files
if pgrep nginx > /dev/null; then
    nginx -s reopen
fi

echo "Log rotation completed"
EOF

RUN chmod +x /usr/local/bin/nginx-log-rotate.sh

# Create performance monitoring script
RUN cat > /usr/local/bin/nginx-perf-monitor.sh << 'EOF'
#!/bin/sh

# Nginx Performance Monitoring Script
# Collects and reports performance metrics

METRICS_FILE="/var/log/nginx/metrics.log"
STATUS_URL="http://localhost/nginx_status"

# Get nginx status
if command -v curl > /dev/null; then
    STATUS_OUTPUT=$(curl -s "$STATUS_URL" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        # Extract metrics
        ACTIVE_CONNECTIONS=$(echo "$STATUS_OUTPUT" | grep "Active connections" | awk '{print $3}')
        ACCEPTED_CONNECTIONS=$(echo "$STATUS_OUTPUT" | grep -A1 "server accepts" | grep -v "server" | awk '{print $1}')
        HANDLED_CONNECTIONS=$(echo "$STATUS_OUTPUT" | grep -A1 "server accepts" | grep -v "server" | awk '{print $2}')
        TOTAL_REQUESTS=$(echo "$STATUS_OUTPUT" | grep -A1 "server accepts" | grep -v "server" | awk '{print $3}')
        
        # Get memory usage
        MEMORY_USAGE=$(ps -o pid,vsz,rss,comm -p $(cat /var/run/nginx.pid) | tail -1 | awk '{print $2+$3}')
        
        # Get CPU usage
        CPU_USAGE=$(ps -o pid,pcpu,comm -p $(cat /var/run/nginx.pid) | tail -1 | awk '{print $2}')
        
        # Get system load
        LOAD_AVG=$(cat /proc/loadavg | awk '{print $1}')
        
        # Write metrics
        echo "$(date '+%Y-%m-%d %H:%M:%S'),active_connections=$ACTIVE_CONNECTIONS,accepted_connections=$ACCEPTED_CONNECTIONS,handled_connections=$HANDLED_CONNECTIONS,total_requests=$TOTAL_REQUESTS,memory_kb=$MEMORY_USAGE,cpu_percent=$CPU_USAGE,load_avg=$LOAD_AVG" >> "$METRICS_FILE"
        
        # Keep only last 1000 lines
        tail -n 1000 "$METRICS_FILE" > "${METRICS_FILE}.tmp" && mv "${METRICS_FILE}.tmp" "$METRICS_FILE"
    fi
fi

# Cache hit ratio (if cache is used)
CACHE_DIR="/var/cache/nginx"
if [ -d "$CACHE_DIR" ]; then
    CACHE_SIZE=$(du -sh "$CACHE_DIR" 2>/dev/null | cut -f1)
    echo "$(date '+%Y-%m-%d %H:%M:%S'),cache_size=$CACHE_SIZE" >> "$METRICS_FILE"
fi
EOF

RUN chmod +x /usr/local/bin/nginx-perf-monitor.sh

# Create nginx reload script
RUN cat > /usr/local/bin/nginx-safe-reload.sh << 'EOF'
#!/bin/sh

# Safe Nginx Reload Script
# Performs configuration test before reload

echo "Testing nginx configuration..."
if nginx -t; then
    echo "Configuration test passed, reloading nginx..."
    nginx -s reload
    echo "Nginx reloaded successfully"
else
    echo "Configuration test failed, reload aborted"
    exit 1
fi
EOF

RUN chmod +x /usr/local/bin/nginx-safe-reload.sh

# Add log rotation to cron
RUN echo "0 */6 * * * /usr/local/bin/nginx-log-rotate.sh" >> /etc/crontabs/root
RUN echo "*/5 * * * * /usr/local/bin/nginx-perf-monitor.sh" >> /etc/crontabs/root

# Create startup script
RUN cat > /docker-entrypoint.d/10-nginx-setup.sh << 'EOF'
#!/bin/sh

# Nginx Setup Script
# Runs before nginx starts

# Create necessary directories
mkdir -p /var/cache/nginx/proxy \
         /var/cache/nginx/fast \
         /var/cache/nginx/fastcgi \
         /var/tmp/nginx_proxy_temp \
         /var/tmp/nginx_fastcgi_temp \
         /var/log/nginx

# Set proper permissions
chown -R nginx:nginx /var/cache/nginx /var/tmp /var/log/nginx
chmod -R 755 /var/cache/nginx /var/tmp

# Generate SSL certificates if they don't exist
if [ ! -f /etc/nginx/ssl/cert.pem ]; then
    echo "Generating self-signed SSL certificates..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/key.pem \
        -out /etc/nginx/ssl/cert.pem \
        -subj "/C=US/ST=California/L=San Francisco/O=ISH Chat/OU=IT/CN=ish-chat.local"
    
    # Create certificate chain
    cp /etc/nginx/ssl/cert.pem /etc/nginx/ssl/chain.pem
    
    # Generate DH parameters
    openssl dhparam -out /etc/nginx/ssl/dhparam.pem 1024
    
    # Generate session ticket key
    openssl rand -hex 48 > /etc/nginx/ssl/ticket.key
    
    chmod 600 /etc/nginx/ssl/key.pem /etc/nginx/ssl/ticket.key
    chmod 644 /etc/nginx/ssl/cert.pem /etc/nginx/ssl/chain.pem /etc/nginx/ssl/dhparam.pem
    
    echo "SSL certificates generated successfully"
fi

# Test configuration
nginx -t

echo "Nginx setup completed"
EOF

RUN chmod +x /docker-entrypoint.d/10-nginx-setup.sh

# Expose ports
EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /usr/local/bin/nginx-health-check.sh

# Set labels
LABEL maintainer="ISH Chat Team" \
      version="1.0.0" \
      description="Enhanced Nginx Load Balancer for ISH Chat" \
      org.opencontainers.image.title="ISH Chat Nginx Load Balancer" \
      org.opencontainers.image.description="Production-ready Nginx load balancer with SSL, caching, and monitoring" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="ISH Chat"

# Switch to non-root user
USER nginx

# Start nginx
CMD ["nginx", "-g", "daemon off;"]