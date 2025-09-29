# CI Setup Instructions

## GitHub Actions Secrets Required

### For Package Access

The CI workflow requires access to private GitHub Packages in the `@openheaders` organization. 

**Required Secret: `PACKAGES_PAT`**

To create this token:

1. Go to https://github.com/settings/tokens/new
2. Give it a descriptive name (e.g., "OpenHeaders CI Package Access")
3. Select the following scopes:
   - `read:packages` - Download packages from GitHub Package Registry
4. Click "Generate token"
5. Copy the token value
6. Go to your repository's Settings → Secrets and variables → Actions
7. Create a new repository secret named `PACKAGES_PAT` with the token value

### Optional Dependencies

The `@openheaders/windows-foreground` module is an optional dependency that enhances window focusing on Windows. If the `PACKAGES_PAT` secret is not configured, the app will still build and work correctly, but will use fallback window focusing methods on Windows.

### Other Required Secrets

For full CI functionality, you also need:

- `APPLE_ID` - Apple Developer account email (for macOS notarization)
- `APPLE_APP_SPECIFIC_PASSWORD` - App-specific password for Apple ID
- `APPLE_TEAM_ID` - Apple Developer Team ID
- `MACOS_CERTIFICATE` - Base64-encoded P12 certificate for macOS signing
- `MACOS_CERTIFICATE_PWD` - Password for the P12 certificate
- `KEYCHAIN_PASSWORD` - Temporary keychain password for CI
- `ES_USERNAME` - SSL.com eSigner username (for Windows signing)
- `ES_PASSWORD` - SSL.com eSigner password
- `CREDENTIAL_ID` - SSL.com credential ID
- `ES_TOTP_SECRET` - SSL.com TOTP secret for 2FA