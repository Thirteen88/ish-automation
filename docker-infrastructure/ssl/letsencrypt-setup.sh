#!/bin/bash

# Let's Encrypt SSL Certificate Setup for ISH Chat
# Production-ready SSL certificate management with auto-renewal

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${SCRIPT_DIR}"
DOMAIN=${1:-"ish-chat.local"}
EMAIL=${2:-"admin@ish-chat.local"}

echo "🔐 Setting up Let's Encrypt SSL certificates for ${DOMAIN}..."

# Check if certbot is installed
if ! command -v certbot &> /dev/null; then
    echo "📦 Installing certbot..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y certbot python3-certbot-nginx
    elif command -v yum &> /dev/null; then
        sudo yum install -y certbot python3-certbot-nginx
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y certbot python3-certbot-nginx
    else
        echo "❌ Please install certbot manually"
        exit 1
    fi
fi

# Create webroot directory for domain validation
WEBROOT_DIR="/var/www/certbot"
sudo mkdir -p "${WEBROOT_DIR}"
sudo chown -R www-data:www-data "${WEBROOT_DIR}"

# Create Nginx configuration for Let's Encrypt challenge
sudo tee /etc/nginx/sites-available/certbot > /dev/null << EOF
server {
    listen 80;
    server_name ${DOMAIN} *.${DOMAIN};
    
    location /.well-known/acme-challenge/ {
        root ${WEBROOT_DIR};
        try_files \$uri =404;
    }
    
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}
EOF

# Enable the site
if [ -d /etc/nginx/sites-enabled ]; then
    sudo ln -sf /etc/nginx/sites-available/certbot /etc/nginx/sites-enabled/
fi

# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Obtain SSL certificate
echo "📜 Obtaining SSL certificate from Let's Encrypt..."
sudo certbot certonly \
    --webroot \
    --webroot-path="${WEBROOT_DIR}" \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --domains "${DOMAIN}" \
    --domains "www.${DOMAIN}" \
    --rsa-key-size 4096 \
    --keep-until-expiring \
    --non-interactive

# Copy certificates to our directory
echo "📋 Copying certificates to SSL directory..."
sudo cp /etc/letsencrypt/live/${DOMAIN}/fullchain.pem "${CERT_DIR}/cert.pem"
sudo cp /etc/letsencrypt/live/${DOMAIN}/privkey.pem "${CERT_DIR}/key.pem"
sudo cp /etc/letsencrypt/live/${DOMAIN}/chain.pem "${CERT_DIR}/chain.pem"

# Generate DH parameters
if [ ! -f "${CERT_DIR}/dhparam.pem" ]; then
    echo "🔒 Generating DH parameters (this may take a while)..."
    sudo openssl dhparam -out "${CERT_DIR}/dhparam.pem" 2048
fi

# Generate SSL session ticket key
if [ ! -f "${CERT_DIR}/ticket.key" ]; then
    echo "🎫 Generating SSL session ticket key..."
    sudo openssl rand -hex 48 > "${CERT_DIR}/ticket.key"
fi

# Set appropriate permissions
sudo chown root:root "${CERT_DIR}/key.pem"
sudo chmod 600 "${CERT_DIR}/key.pem"
sudo chown root:root "${CERT_DIR}/ticket.key"
sudo chmod 600 "${CERT_DIR}/ticket.key"
sudo chmod 644 "${CERT_DIR}/cert.pem"
sudo chmod 644 "${CERT_DIR}/chain.pem"
sudo chmod 644 "${CERT_DIR}/dhparam.pem"

# Set up auto-renewal
echo "🔄 Setting up auto-renewal..."
sudo crontab -l 2>/dev/null | grep -v "certbot renew" | sudo crontab -

# Add renewal cron job
(crontab -l 2>/dev/null; echo "0 3 * * * /usr/bin/certbot renew --quiet --deploy-hook 'systemctl reload nginx'") | sudo crontab -

# Create renewal hook for copying certificates
sudo tee /etc/letsencrypt/renewal-hooks/deploy/ish-chat-copy-certs.sh > /dev/null << EOF
#!/bin/bash
DOMAIN="${DOMAIN}"
CERT_DIR="${CERT_DIR}"

# Copy renewed certificates
cp /etc/letsencrypt/live/\$DOMAIN/fullchain.pem "\${CERT_DIR}/cert.pem"
cp /etc/letsencrypt/live/\$DOMAIN/privkey.pem "\${CERT_DIR}/key.pem"
cp /etc/letsencrypt/live/\$DOMAIN/chain.pem "\${CERT_DIR}/chain.pem"

# Set permissions
chown root:root "\${CERT_DIR}/key.pem"
chmod 600 "\${CERT_DIR}/key.pem"
chmod 644 "\${CERT_DIR}/cert.pem"
chmod 644 "\${CERT_DIR}/chain.pem"

# Reload nginx
systemctl reload nginx

echo "SSL certificates renewed and copied to ISH Chat SSL directory"
EOF

sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/ish-chat-copy-certs.sh

# Create certificate monitoring script
sudo tee /usr/local/bin/ssl-monitor.sh > /dev/null << 'EOF'
#!/bin/bash

# SSL Certificate Monitoring Script
# Checks certificate expiration and sends alerts

DOMAINS=("ish-chat.local" "www.ish-chat.local")
ALERT_DAYS=30
ALERT_EMAIL="admin@ish-chat.local"

for domain in "${DOMAINS[@]}"; do
    if [ -f "/etc/letsencrypt/live/$domain/cert.pem" ]; then
        exp_date=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/$domain/cert.pem" | cut -d= -f2)
        exp_timestamp=$(date -d "$exp_date" +%s)
        current_timestamp=$(date +%s)
        days_left=$(( (exp_timestamp - current_timestamp) / 86400 ))
        
        if [ $days_left -le $ALERT_DAYS ]; then
            echo "⚠️  SSL certificate for $domain expires in $days_left days ($exp_date)" | \
                mail -s "SSL Certificate Expiration Alert" "$ALERT_EMAIL"
        fi
    fi
done
EOF

sudo chmod +x /usr/local/bin/ssl-monitor.sh

# Add monitoring to cron (daily check)
(crontab -l 2>/dev/null; echo "0 8 * * * /usr/local/bin/ssl-monitor.sh") | sudo crontab -

# Test certificate
echo "🔍 Testing SSL certificate..."
if openssl x509 -in "${CERT_DIR}/cert.pem" -text -noout | grep -q "${DOMAIN}"; then
    echo "✅ Certificate test passed!"
else
    echo "❌ Certificate test failed!"
    exit 1
fi

echo ""
echo "✅ Let's Encrypt SSL setup completed successfully!"
echo ""
echo "📋 Certificate Information:"
echo "   Domain: ${DOMAIN}"
echo "   Email: ${EMAIL}"
echo "   Certificate Path: ${CERT_DIR}/cert.pem"
echo "   Private Key: ${CERT_DIR}/key.pem"
echo "   Chain File: ${CERT_DIR}/chain.pem"
echo ""
echo "🔄 Auto-renewal: Enabled (runs daily at 3 AM)"
echo "📊 Monitoring: Enabled (runs daily at 8 AM)"
echo ""
echo "🔍 Test certificate renewal:"
echo "   sudo certbot renew --dry-run"
echo ""
echo "📜 Certificate details:"
openssl x509 -in "${CERT_DIR}/cert.pem" -text -noout | grep -E "(Subject:|Issuer:|Not Before|Not After|DNS:)"
echo ""