# Open Headers CA Certificate

This directory contains the CA (Certificate Authority) certificate for Open Headers Windows code signing.

## About

The `open-headers-ca.crt` file is the root certificate that Windows users need to install to trust the Open Headers application. This certificate is automatically included in releases.

## For Windows Users

To trust the Open Headers application on Windows:

1. Download `open-headers-ca.crt` from the GitHub release
2. Double-click the certificate file
3. Click "Install Certificate..."
4. Choose "Local Machine" (requires administrator privileges)
5. Select "Place all certificates in the following store"
6. Browse and select "Trusted Root Certification Authorities"
7. Click "Next" and "Finish"

After installation, Windows will trust applications signed with our certificate.

## Security Note

This is a self-signed certificate for open source distribution. Only install it if you trust the Open Headers project.

## For Developers

The certificate is automatically:
- Generated when running `npm run cert:generate`
- Copied here for distribution
- Included in Windows releases via GitHub Actions