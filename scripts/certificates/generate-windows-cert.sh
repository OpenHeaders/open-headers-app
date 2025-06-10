#!/bin/bash

# Script to generate self-signed certificates for Windows code signing
# This creates a CA certificate and a code signing certificate

set -e

# Check if OpenSSL is installed
if ! command -v openssl &> /dev/null; then
    echo "Error: OpenSSL is not installed."
    echo "Please install OpenSSL first:"
    echo "  - macOS: brew install openssl"
    echo "  - Linux: sudo apt-get install openssl (or equivalent)"
    exit 1
fi

CERT_DIR="./certs/windows"
CA_KEY="$CERT_DIR/ca.key"
CA_CERT="$CERT_DIR/ca.crt"
CODE_KEY="$CERT_DIR/code-signing.key"
CODE_CSR="$CERT_DIR/code-signing.csr"
CODE_CERT="$CERT_DIR/code-signing.crt"
CODE_PFX="$CERT_DIR/code-signing.pfx"
CA_PFX="$CERT_DIR/ca.pfx"

# Certificate details
COUNTRY="US"
STATE="California"
LOCALITY="San Francisco"
ORGANIZATION="OpenHeaders"
ORGANIZATIONAL_UNIT="Development"
COMMON_NAME="OpenHeaders Code Signing"
EMAIL="contact@openheaders.io"

# Create certificate directory
mkdir -p "$CERT_DIR"

echo "Generating CA private key..."
openssl genrsa -out "$CA_KEY" 4096

echo "Generating CA certificate..."
openssl req -new -x509 -days 3650 -key "$CA_KEY" -out "$CA_CERT" \
  -subj "/C=$COUNTRY/ST=$STATE/L=$LOCALITY/O=$ORGANIZATION CA/OU=$ORGANIZATIONAL_UNIT/CN=$ORGANIZATION Root CA/emailAddress=$EMAIL"

echo "Generating code signing private key..."
openssl genrsa -out "$CODE_KEY" 4096

echo "Generating code signing certificate request..."
openssl req -new -key "$CODE_KEY" -out "$CODE_CSR" \
  -subj "/C=$COUNTRY/ST=$STATE/L=$LOCALITY/O=$ORGANIZATION/OU=$ORGANIZATIONAL_UNIT/CN=$COMMON_NAME/emailAddress=$EMAIL"

echo "Creating extensions file..."
cat > "$CERT_DIR/v3.ext" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
extendedKeyUsage = codeSigning
EOF

echo "Signing code signing certificate with CA..."
openssl x509 -req -in "$CODE_CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
  -out "$CODE_CERT" -days 3650 -sha256 -extfile "$CERT_DIR/v3.ext"

echo "Creating PFX file for code signing..."
openssl pkcs12 -export -out "$CODE_PFX" -inkey "$CODE_KEY" -in "$CODE_CERT" \
  -certfile "$CA_CERT" -passout pass:

echo "Creating PFX file for CA certificate..."
openssl pkcs12 -export -out "$CA_PFX" -inkey "$CA_KEY" -in "$CA_CERT" \
  -passout pass:

# Clean up temporary files
rm -f "$CODE_CSR" "$CERT_DIR/v3.ext"

# Copy CA certificate to permanent location for distribution
mkdir -p "./build/certificates"
cp "$CA_CERT" "./build/certificates/open-headers-ca.crt"

echo ""
echo "Certificates generated successfully!"
echo ""
echo "Files created:"
echo "  CA Certificate: $CA_CERT"
echo "  CA PFX: $CA_PFX"
echo "  Code Signing Certificate: $CODE_CERT"
echo "  Code Signing PFX: $CODE_PFX"
echo ""
echo "The PFX files have no password (empty password)."
echo "Users should install $CA_CERT on their Windows systems to trust the signed application."
echo ""
echo "CA certificate copied to: ./build/certificates/open-headers-ca.crt"