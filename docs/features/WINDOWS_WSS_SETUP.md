# Windows WSS (Secure WebSocket) Setup Guide

This guide explains how the Open Headers app handles SSL certificates for secure WebSocket connections on Windows, where OpenSSL is often not available by default.

## Overview

Starting with version 2.11.6, Open Headers automatically generates SSL certificates for WSS (Secure WebSocket) connections without requiring OpenSSL installation on Windows. This enables secure communication between the browser extension and the desktop app.

## How It Works

### Automatic Certificate Generation

When you enable WSS in the app settings, Open Headers will:

1. **Check for existing certificates** in the app data directory
2. **Generate new certificates** if none exist using built-in JavaScript libraries
3. **Store certificates securely** in your user data folder

### Certificate Location

Certificates are stored in:
- **Windows**: `%APPDATA%\open-headers\certs\`
- **macOS**: `~/Library/Application Support/open-headers/certs/`
- **Linux**: `~/.config/open-headers/certs/`

### Certificate Details

The generated certificates:
- Are valid for 397 days (just under the 398-day browser limit)
- Support localhost and 127.0.0.1
- Use RSA 2048-bit encryption
- Are self-signed (suitable for local communication)

## Accepting the Certificate

When you first connect using WSS, your browser may warn about the self-signed certificate. This is normal and expected.

### Chrome/Edge
1. Navigate to `https://127.0.0.1:59211/verify-cert` in your browser
2. Click "Advanced" when you see the security warning
3. Click "Proceed to 127.0.0.1 (unsafe)"
4. You'll see a "Certificate Accepted" page that auto-closes

### Firefox
1. Navigate to `https://127.0.0.1:59211/verify-cert` in your browser
2. Click "Advanced" when you see the security warning
3. Click "Accept the Risk and Continue"
4. You'll see a "Certificate Accepted" page that auto-closes

### Safari
1. Navigate to `https://127.0.0.1:59211/verify-cert` in your browser
2. Click "Show Details"
3. Click "visit this website"
4. Enter your system password if prompted
5. You'll see a "Certificate Accepted" page that auto-closes

## Certificate Renewal

Since certificates are valid for 397 days, they will need to be renewed approximately once a year. The app will automatically generate new certificates when:

1. The existing certificates are missing
2. You manually delete the old certificates

To renew certificates:
1. Close the Open Headers app
2. Delete the `certs` folder in your app data directory
3. Restart the app - new certificates will be generated automatically

## Troubleshooting

### Certificate Generation Failed

If certificate generation fails, the app will:
1. Try multiple generation methods automatically
2. Fall back to basic certificates if needed
3. Log detailed error information

To manually regenerate certificates:
1. Close the Open Headers app
2. Delete the `certs` folder in your app data directory
3. Restart the app - new certificates will be generated

### WSS Connection Issues

If you can't connect via WSS:

1. **Check the logs**: Look for certificate-related errors in the app logs
2. **Verify the port**: Ensure port 59211 is not blocked by firewall
3. **Accept the certificate**: Visit `https://127.0.0.1:59211/verify-cert` in your browser
4. **Restart the app**: Sometimes a fresh start resolves connection issues

### Viewing Certificate Details

To view the certificate fingerprint and details:
1. Open the app's developer console (if available)
2. Look for log entries containing "Certificate fingerprint"
3. Compare with what your browser shows

## Security Considerations

- Certificates are generated locally and never leave your machine
- Each installation generates unique certificates
- Certificates are only valid for localhost connections
- The private key is stored securely in your user data folder

## Advanced Users

### Using Custom Certificates

If you prefer to use your own certificates:

1. Generate your certificates using your preferred method
2. Name them `server.key` (private key) and `server.crt` (certificate)
3. Place them in the app's certs directory
4. Restart the app


## Technical Details

The app uses multiple certificate generation methods in order:

1. **OpenSSL** (if available) - Best compatibility
2. **node-forge** - Pure JavaScript implementation
3. **Node.js crypto** - Built-in fallback

This ensures certificates can be generated on any Windows system without additional dependencies.