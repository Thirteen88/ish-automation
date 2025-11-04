#!/bin/bash

# SSL Certificate Generation Script for ISH Chat
# Generates self-signed certificates for development and testing
# For production, use Let's Encrypt or purchase certificates from a CA

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${SCRIPT_DIR}"
DOMAIN=${1:-"ish-chat.local"}

echo "🔐 Generating SSL certificates for ${DOMAIN}..."

# Certificate configuration
COUNTRY="US"
STATE="California"
CITY="San Francisco"
ORGANIZATION="ISH Chat"
ORGANIZATIONAL_UNIT="Engineering"
EMAIL="admin@ish-chat.local"

# Create OpenSSL configuration
cat > "${CERT_DIR}/openssl.conf" << EOF
[req]
default_bits = 4096
default_md = sha256
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = ${COUNTRY}
ST = ${STATE}
L = ${CITY}
O = ${ORGANIZATION}
OU = ${ORGANIZATIONAL_UNIT}
CN = ${DOMAIN}
emailAddress = ${EMAIL}

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${DOMAIN}
DNS.2 = *.${DOMAIN}
DNS.3 = localhost
DNS.4 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
IP.3 = 172.20.0.5
IP.4 = 172.20.0.0
EOF

# Generate private key
echo "🔑 Generating private key..."
openssl genrsa -out "${CERT_DIR}/key.pem" 4096

# Generate certificate signing request
echo "📝 Generating certificate signing request..."
openssl req -new -key "${CERT_DIR}/key.pem" -out "${CERT_DIR}/cert.csr" -config "${CERT_DIR}/openssl.conf"

# Generate self-signed certificate
echo "📜 Generating self-signed certificate..."
openssl x509 -req -days 365 -in "${CERT_DIR}/cert.csr" -signkey "${CERT_DIR}/key.pem" -out "${CERT_DIR}/cert.pem" -extensions v3_req -extfile "${CERT_DIR}/openssl.conf"

# Generate DH parameters for perfect forward secrecy
echo "🔒 Generating DH parameters (this may take a while)..."
openssl dhparam -out "${CERT_DIR}/dhparam.pem" 2048

# Create certificate chain file
echo "🔗 Creating certificate chain..."
cp "${CERT_DIR}/cert.pem" "${CERT_DIR}/chain.pem"

# Generate SSL session ticket key
echo "🎫 Generating SSL session ticket key..."
openssl rand -hex 48 > "${CERT_DIR}/ticket.key"

# Set appropriate permissions
echo "🔐 Setting permissions..."
chmod 600 "${CERT_DIR}/key.pem"
chmod 600 "${CERT_DIR}/ticket.key"
chmod 644 "${CERT_DIR}/cert.pem"
chmod 644 "${CERT_DIR}/chain.pem"
chmod 644 "${CERT_DIR}/dhparam.pem"

# Clean up CSR and config
rm -f "${CERT_DIR}/cert.csr" "${CERT_DIR}/openssl.conf"

# Display certificate information
echo ""
echo "✅ SSL certificates generated successfully!"
echo ""
echo "📋 Certificate Information:"
openssl x509 -in "${CERT_DIR}/cert.pem" -text -noout | grep -A 2 "Subject:"
openssl x509 -in "${CERT_DIR}/cert.pem" -text -noout | grep -A 10 "Subject Alternative Name"
echo ""
echo "📁 Files created:"
echo "   - Private Key: ${CERT_DIR}/key.pem"
echo "   - Certificate: ${CERT_DIR}/cert.pem"
echo "   - Chain File: ${CERT_DIR}/chain.pem"
echo "   - DH Parameters: ${CERT_DIR}/dhparam.pem"
echo "   - Session Ticket Key: ${CERT_DIR}/ticket.key"
echo ""
echo "⚠️  These are self-signed certificates for development/testing only."
echo "   For production, use certificates from a trusted CA or Let's Encrypt."
echo ""

# Verify certificate
echo "🔍 Verifying certificate..."
openssl verify -CAfile "${CERT_DIR}/cert.pem" "${CERT_DIR}/cert.pem"

echo "✅ Certificate verification completed."