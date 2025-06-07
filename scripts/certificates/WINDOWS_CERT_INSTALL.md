# Windows Certificate Installation Guide

This guide explains how to install the Open Headers CA certificate on Windows to trust the signed application.

## For End Users

### Method 1: Using Certificate Manager (Recommended)

1. Download the `ca.crt` file from the releases page
2. Double-click the `ca.crt` file
3. Click "Install Certificate..."
4. Choose "Local Machine" (requires administrator privileges)
5. Click "Next"
6. Select "Place all certificates in the following store"
7. Click "Browse..." and select "Trusted Root Certification Authorities"
8. Click "Next" and then "Finish"
9. Confirm the security warning by clicking "Yes"

### Method 2: Using Command Line (Administrator)

1. Open Command Prompt as Administrator
2. Run the following command:
   ```cmd
   certutil -addstore "Root" "path\to\ca.crt"
   ```

### Method 3: Using PowerShell (Administrator)

1. Open PowerShell as Administrator
2. Run the following command:
   ```powershell
   Import-Certificate -FilePath "path\to\ca.crt" -CertStoreLocation Cert:\LocalMachine\Root
   ```

## Verification

To verify the certificate was installed correctly:

1. Open Certificate Manager (certmgr.msc)
2. Navigate to "Trusted Root Certification Authorities" > "Certificates"
3. Look for "Open Headers Root CA"

## Removal

To remove the certificate if needed:

1. Open Certificate Manager (certmgr.msc)
2. Navigate to "Trusted Root Certification Authorities" > "Certificates"
3. Find "Open Headers Root CA"
4. Right-click and select "Delete"

## Security Note

Installing a root certificate allows any application signed with that certificate to be trusted by your system. Only install certificates from sources you trust.