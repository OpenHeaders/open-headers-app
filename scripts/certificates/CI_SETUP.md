# CI/CD Windows Code Signing Setup

This guide explains how to set up Windows code signing in GitHub Actions.

## Option 1: Build Unsigned (Default)

By default, the CI will build unsigned Windows executables. This is the simplest approach and requires no additional setup.

## Option 2: Use Self-Signed Certificates in CI

To sign Windows builds in CI with your self-signed certificates:

### 1. Generate Certificates Locally

```bash
npm run cert:generate
```

### 2. Convert to Base64

```bash
# Convert PFX to base64
base64 -i certs/windows/code-signing.pfx -o code-signing-pfx.txt

# Convert CA cert to base64 (optional, for distribution)
base64 -i certs/windows/ca.crt -o ca-cert.txt
```

### 3. Add GitHub Secrets

1. Go to your repository's Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `WINDOWS_CERT_PFX_BASE64`: Contents of `code-signing-pfx.txt`
   - `WINDOWS_CA_CERT_BASE64`: Contents of `ca-cert.txt` (optional)

### 4. Update Workflow

The workflow needs to be updated to use these secrets. Add this step before the Windows build:

```yaml
# Windows code signing setup
- name: Setup Windows code signing
  if: matrix.os == 'windows-latest'
  run: node scripts/certificates/generate-ci-cert.js
  env:
    WINDOWS_CERT_PFX_BASE64: ${{ secrets.WINDOWS_CERT_PFX_BASE64 }}
    WINDOWS_CA_CERT_BASE64: ${{ secrets.WINDOWS_CA_CERT_BASE64 }}
```

## Option 3: Use a Real Certificate

For production releases, consider purchasing a code signing certificate from a trusted CA like:
- DigiCert
- Sectigo (formerly Comodo)
- GlobalSign

With a real certificate, Windows will trust your application without users needing to install a CA certificate.

## Current Behavior

Without any setup, the CI will:
1. Detect no certificate is available
2. Show a warning: "Building without code signing..."
3. Build an unsigned executable
4. Users will see Windows SmartScreen warnings when running the app