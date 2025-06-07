#!/usr/bin/env node

// Script to generate Windows certificates from base64-encoded secrets in CI
// Usage: Set WINDOWS_CERT_PFX_BASE64 environment variable and run this script

const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, '..', '..', 'certs', 'windows');
const pfxPath = path.join(certDir, 'code-signing.pfx');
const caPath = path.join(certDir, 'ca.crt');

// Check if we're in CI and have the certificate
if (process.env.CI && process.env.WINDOWS_CERT_PFX_BASE64) {
  console.log('Setting up Windows code signing certificate from CI secrets...');
  
  // Create directory
  fs.mkdirSync(certDir, { recursive: true });
  
  // Decode and write PFX
  const pfxBuffer = Buffer.from(process.env.WINDOWS_CERT_PFX_BASE64, 'base64');
  fs.writeFileSync(pfxPath, pfxBuffer);
  console.log('✓ Code signing certificate written');
  
  // Decode and write CA cert if provided
  if (process.env.WINDOWS_CA_CERT_BASE64) {
    const caBuffer = Buffer.from(process.env.WINDOWS_CA_CERT_BASE64, 'base64');
    fs.writeFileSync(caPath, caBuffer);
    console.log('✓ CA certificate written');
  }
  
  console.log('Windows certificates setup complete');
} else if (process.env.CI) {
  console.log('No Windows certificate found in CI secrets, will build unsigned');
} else {
  console.log('Not in CI environment, skipping certificate setup');
}