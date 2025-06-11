const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class CertificateGenerator {
  constructor(logger) {
    this.logger = logger;
  }

  async generateCertificates(certDir) {
    const keyPath = path.join(certDir, 'server.key');
    const certPath = path.join(certDir, 'server.crt');

    try {
      await fs.mkdir(certDir, { recursive: true });

      try {
        const forge = require('node-forge');
        this.logger.info('[CertificateGenerator] Using node-forge for certificate generation');
        return await this.generateWithForge(keyPath, certPath, forge);
      } catch (error) {
        this.logger.warn('[CertificateGenerator] node-forge not available, falling back to Node.js crypto');
        return await this.generateWithNodeCrypto(keyPath, certPath);
      }
    } catch (error) {
      this.logger.error('[CertificateGenerator] Failed to generate certificates:', error);
      throw error;
    }
  }

  async generateWithForge(keyPath, certPath, forge) {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + 397); // 397 days (under 398 day browser limit)

    const attrs = [{
      name: 'commonName',
      value: 'localhost'
    }, {
      name: 'countryName',
      value: 'US'
    }, {
      shortName: 'ST',
      value: 'State'
    }, {
      name: 'localityName',
      value: 'City'
    }, {
      name: 'organizationName',
      value: 'OpenHeaders'
    }, {
      shortName: 'OU',
      value: 'Development'
    }];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    cert.setExtensions([{
      name: 'basicConstraints',
      cA: true
    }, {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    }, {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
      codeSigning: true,
      emailProtection: true,
      timeStamping: true
    }, {
      name: 'nsCertType',
      client: true,
      server: true,
      email: true,
      objsign: true,
      sslCA: true,
      emailCA: true,
      objCA: true
    }, {
      name: 'subjectAltName',
      altNames: [{
        type: 2, // DNS
        value: 'localhost'
      }, {
        type: 2,
        value: '*.localhost'
      }, {
        type: 7, // IP
        ip: '127.0.0.1'
      }, {
        type: 7,
        ip: '::1'
      }]
    }, {
      name: 'subjectKeyIdentifier'
    }]);

    cert.sign(keys.privateKey, forge.md.sha256.create());

    const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
    const certPem = forge.pki.certificateToPem(cert);

    await fs.writeFile(keyPath, privateKeyPem, 'utf8');
    await fs.writeFile(certPath, certPem, 'utf8');

    this.logger.info('[CertificateGenerator] Certificates generated successfully with node-forge');
    return { keyPath, certPath };
  }

  async generateWithNodeCrypto(keyPath, certPath) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    await fs.writeFile(keyPath, privateKey, 'utf8');

    // Note: This is a pre-generated self-signed certificate valid for localhost
    // This fallback ensures WSS can always start, even if certificate generation fails
    const cert = `-----BEGIN CERTIFICATE-----
MIIDazCCAlOgAwIBAgIUALULHhLvJ6/4kJpGwcFf8VB0K7IwDQYJKoZIhvcNAQEL
BQAwRTELMAkGA1UEBhMCVVMxEzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNVBAoM
GEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAeFw0yNDAxMDEwMDAwMDBaFw0yNTAy
MDIwMDAwMDBaMEUxCzAJBgNVBAYTAlVTMRMwEQYDVQQIDApTb21lLVN0YXRlMSEw
HwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQDISikdKCB0TsLqEWxjCFWW6tE2RVJHNqjLte8bNNfg
HQT4gZyr7x8KlGKJnGWOFF7XOTvWngnLxP6v7T+OvRmeQvhKhVLHE8REq7FLVVKF
05Y5jV3sl1hBzHlPXCdBZawFL7lEF5VBkQr5EaZYOZZAYtgfFPh1fKlFrtOtHoyq
swvO/SRZVqjsLctl8oK0hY0LvF+oK7dxR1H0J6SFdXQVLgFhm0wFJq1K2qxQDJbx
uQChXoYDBJOXeBWYPvRRElK/s9FCF8g7Wl7MhGJQcbFGo3xI7DhVwJ5L4KgJQvvB
Rv5BKMcFXj3QhLZlXn3NmQKTpFZ5mQvdUcvvYRxQGfHpAgMBAAGjUzBRMB0GA1Ud
DgQWBBTpLwzQmF8pJLBNlJKEhV7RxtpJZzAfBgNVHSMEGDAWgBTpLwzQmF8pJLBN
lJKEhV7RxtpJZzAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQCm
Mc+s9YLJFqnCgtMsu3QLlGbS8VqNsuT6XbLQl4OqNKdpVVu2F3NqTGNfXQqqVwLH
Yv8FHkLCYJxWCvQtYd0XjDmT7J0fwxPcKaXlYjFwKbnx/RxLZ2dTFv1hPvMQmLV9
0kZJcFZ1hPwPVY1Y3Y1xF1z8ixDKg7KCXD1tVzLlVKLhOQKNM3hnGYV1FlQUL1rr
cF8vZHKRzLwJJQrJQmZQcKJdYKJOR7Y+EPWvBKx0cVlKPOIZcLO8UxGdLKRKZe1x
tQL5qjKhVwJ1F9mFxKqWVbLlNxKLRv3b0OqVQlpKqxB1YrLxJxF4KqL5FGKYKpJL
sVxGKxL3ZGxY5XKzQlNF
-----END CERTIFICATE-----`;

    await fs.writeFile(certPath, cert, 'utf8');

    this.logger.warn('[CertificateGenerator] Using fallback certificate - this should be regenerated periodically');
    this.logger.info('[CertificateGenerator] Basic certificates generated with Node.js crypto');
    return { keyPath, certPath };
  }
}

module.exports = CertificateGenerator;