# Windows Code Signing Setup

This directory contains scripts and instructions for self-signed Windows code signing.

## Quick Start

1. Generate certificates:
   ```bash
   npm run cert:generate
   ```

2. Build signed Windows app:
   ```bash
   npm run dist:win
   ```

3. Distribute the CA certificate (`certs/windows/ca.crt`) to users along with your app

## What This Does

- Creates a self-signed Certificate Authority (CA)
- Creates a code signing certificate signed by your CA
- Configures electron-builder to sign Windows builds with this certificate
- No password is set on the certificates for easier CI/CD integration

## Directory Structure

After running `npm run cert:generate`:
```
certs/windows/
├── ca.crt          # CA certificate (distribute to users)
├── ca.key          # CA private key (keep secure)
├── ca.pfx          # CA in PFX format
├── code-signing.crt    # Code signing certificate
├── code-signing.key    # Code signing private key
└── code-signing.pfx    # Code signing PFX (used by electron-builder)
```

## User Installation

Users need to install the CA certificate to trust your signed app. See [WINDOWS_CERT_INSTALL.md](./WINDOWS_CERT_INSTALL.md) for detailed instructions.

## Security Notes

- The `certs/` directory is gitignored - never commit certificates to version control
- Keep your private keys secure
- This is suitable for open source distribution where users explicitly trust your certificate
- For commercial distribution, consider purchasing a certificate from a trusted CA

## Clean Up

To remove generated certificates:
```bash
npm run cert:clean
```