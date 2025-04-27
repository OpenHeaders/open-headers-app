# Privacy Policy for Open Headers App

**Effective Date: April 17, 2025**

## Introduction

Open Headers is committed to protecting your privacy and ensuring transparency about how our software operates. This Privacy Policy explains our data practices for the Open Headers Dynamic Sources application.

## 1. Overview

The Open Headers Dynamic Sources application is an open source companion tool for the Open Headers browser extension. It provides dynamic sources from your local system to enhance browser header functionality.

The application is available on GitHub under open source licenses, allowing for complete code inspection and verification.

## 2. Information Collection and Use

### What We Collect

**We Do Not Collect:**
- Personal information
- Usage statistics
- Browsing history
- Source content
- Any data from your computer

**Local Storage Only:**
- Your source configurations are stored locally on your device using standard file system I/O
- HTTP source responses remain on your local device
- File content read by the application remains on your local device
- Environment variables accessed by the application remain on your local device
- No data is transmitted to our servers or third parties

### How Information is Used

All configuration data is used solely for the functioning of the application and remains on your device. We have no access to this information.

## 3. Data Sharing and Transfer

We do not collect or share any user data with third parties, as we do not collect any data in the first place.

## 4. Local Communication

The application communicates with the browser extension via WebSocket on port 59210. This connection:
- Is limited to localhost (127.0.0.1)
- Does not transmit data over the internet
- Uses a simple JSON-based protocol for providing source values

## 5. Network Access

The application may make HTTP requests based on your configuration:
- These requests are initiated by you when configuring HTTP sources
- The application does not make any automatic requests to our servers
- Request URLs, headers, and other parameters are specified by you

## 6. File System Access

The application requires file system access to:
- Read and watch files specified as sources
- Save your configuration
- Import and export settings

This access is limited to the files you explicitly select or configure.

## 7. Security

We prioritize security through:
- Local-only data storage
- No external network connections beyond those you explicitly configure
- Open source code that can be audited by anyone
- Regular security updates

## 8. Children's Privacy

Open Headers is a developer tool and not intended for use by children under 13 years of age.

## 9. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify users of any changes by updating the "Effective Date" at the top of this policy.

## 10. Open Source Commitment

The Open Headers Dynamic Sources application is fully open source under the MIT License. The source code is available on GitHub at:
- https://github.com/OpenHeaders/open-headers-app

We encourage users to review the code to verify our privacy claims.

## 11. Contact Information

If you have questions about this Privacy Policy or the Open Headers project, please:
- Create an issue on our GitHub repository
- Contact us through our GitHub profile

As an open source project, we welcome community feedback and contributions to improve both our code and our policies.

## 12. Consent

By using Open Headers, you consent to this Privacy Policy. As we do not collect any personal information, there is no data to manage or delete.

This Privacy Policy is provided to enhance transparency about our commitment to privacy and data security.
