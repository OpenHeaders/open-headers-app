/**
 * WebSocket Certificate Handler
 * Manages SSL certificate generation, trust, and lifecycle for the WSS server
 */

import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import crypto from 'crypto';
import mainLogger from '../../utils/mainLogger';

const { execSync } = child_process;
const { createLogger } = mainLogger;
const log = createLogger('WSCertificateHandler');

const CERT_VERIFY_HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Certificate Verified</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;text-align:center;margin-top:50px;background:#f8f9fa;color:#333}.container{max-width:500px;margin:0 auto;padding:20px;background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.1)}.success-icon{font-size:48px;color:#34A853;margin-bottom:20px}h1{color:#4285F4}</style></head>
<body><div class="container"><div class="success-icon">\u2713</div><h1>Certificate Accepted</h1>
<p>Certificate has been verified successfully. This window will close automatically.</p>
<p>Connection status: <strong style="color:#34A853">Connected</strong></p></div>
<script>setTimeout(()=>window.close(),2000)</script></body></html>`;

interface CertificatePaths {
    keyPath: string | null;
    certPath: string | null;
    fingerprint: string | null;
    validTo?: string | null;
    subject?: string | null;
}

interface CertEnsureResult {
    success: boolean;
    renewed?: boolean;
    error?: string;
}

interface TrustResult {
    trusted: boolean;
    error?: string;
}

interface TrustActionResult {
    success: boolean;
    error?: string;
}

interface WSServiceLike {
    appDataPath: string | null;
    _broadcastToAll(message: string): number;
}

class WSCertificateHandler {
    wsService: WSServiceLike;
    certificatePaths: CertificatePaths;

    constructor(wsService: WSServiceLike) {
        this.wsService = wsService;
        this.certificatePaths = {
            keyPath: null,
            certPath: null,
            fingerprint: null
        };
    }

    /**
     * Ensure certificate files exist, or create them
     */
    async ensureCertificatesExist(): Promise<CertEnsureResult> {
        try {
            const certsDir = this._getCertificatesDirectory();
            if (!fs.existsSync(certsDir)) {
                fs.mkdirSync(certsDir, { recursive: true });
                log.info(`Created certificates directory: ${certsDir}`);
            }

            const keyPath = path.join(certsDir, 'server.key');
            const certPath = path.join(certsDir, 'server.cert');
            const certPathAlt = path.join(certsDir, 'server.crt');

            // Check if certificates already exist (try both .cert and .crt extensions)
            if (fs.existsSync(keyPath) && (fs.existsSync(certPath) || fs.existsSync(certPathAlt))) {
                const actualCertPath = fs.existsSync(certPath) ? certPath : certPathAlt;
                const cert = fs.readFileSync(actualCertPath);
                const { validTo } = this._parseCertificateInfo(cert);

                // Auto-renew if expiring within 30 days or already expired
                const RENEWAL_THRESHOLD_DAYS = 30;
                if (validTo) {
                    const daysLeft = Math.ceil((new Date(validTo).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    if (daysLeft <= RENEWAL_THRESHOLD_DAYS) {
                        log.info(`Certificate expires in ${daysLeft} days, auto-renewing...`);
                        try {
                            fs.unlinkSync(actualCertPath);
                            fs.unlinkSync(keyPath);
                            await this._generateCertificates(certsDir, keyPath, certPath);
                            const newCertPath = fs.existsSync(certPath) ? certPath : certPathAlt;
                            const newCert = fs.readFileSync(newCertPath);
                            const fingerprint = this._calculateCertFingerprint(newCert);
                            const info = this._parseCertificateInfo(newCert);
                            this.certificatePaths = {
                                keyPath,
                                certPath: newCertPath,
                                fingerprint,
                                validTo: info.validTo,
                                subject: info.subject
                            };
                            log.info('Certificate auto-renewed successfully');
                            return { success: true, renewed: true };
                        } catch (renewError: any) {
                            log.warn('Certificate auto-renewal failed, using existing cert:', renewError.message);
                            // Fall through to use existing cert
                        }
                    }
                }

                log.info('Using existing certificate files');
                const fingerprint = this._calculateCertFingerprint(cert);
                const { subject } = this._parseCertificateInfo(cert);

                this.certificatePaths = {
                    keyPath,
                    certPath: actualCertPath,
                    fingerprint,
                    validTo,
                    subject
                };

                return { success: true };
            }

            // Certificates don't exist, generate them
            log.info('Certificate files not found, generating new ones...');

            try {
                await this._generateCertificates(certsDir, keyPath, certPath);

                const actualCertPath = fs.existsSync(certPath) ? certPath : certPathAlt;
                const cert = fs.readFileSync(actualCertPath);
                const fingerprint = this._calculateCertFingerprint(cert);
                const { validTo, subject } = this._parseCertificateInfo(cert);

                this.certificatePaths = {
                    keyPath,
                    certPath: actualCertPath,
                    fingerprint,
                    validTo,
                    subject
                };

                return { success: true };
            } catch (genError: any) {
                return {
                    success: false,
                    error: `Failed to generate certificates: ${genError.message}`
                };
            }
        } catch (error: any) {
            return {
                success: false,
                error: `Error ensuring certificates exist: ${error.message}`
            };
        }
    }

    /**
     * Gets the appropriate directory for storing certificates
     */
    _getCertificatesDirectory(): string {
        if (this.wsService.appDataPath) {
            return path.join(this.wsService.appDataPath, 'certs');
        }
        return path.join(process.cwd(), 'certs');
    }

    /**
     * Generate SSL certificates using cross-platform method
     */
    async _generateCertificates(certsDir: string, keyPath: string, certPath: string): Promise<void> {
        try {
            if (this._isOpenSSLAvailable()) {
                try {
                    log.info('OpenSSL detected, using it for certificate generation...');
                    execSync(`openssl genrsa -out "${keyPath}" 2048`);
                    execSync(`openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 397 -subj "/O=OpenHeaders/CN=OpenHeaders localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`);
                    log.info('Successfully generated certificate files with OpenSSL');
                    return;
                } catch (opensslError: any) {
                    log.warn('OpenSSL command failed, falling back to Node.js implementation:', opensslError.message);
                }
            }

            log.info('Using cross-platform certificate generator...');
            const CertificateGenerator = require('../../utils/certificateGenerator');
            const generator = new CertificateGenerator(log);
            const result = await generator.generateCertificates(certsDir);

            if (!result || !result.keyPath || !result.certPath) {
                throw new Error('Certificate generation failed');
            }

            log.info('Successfully generated certificate files');
        } catch (error: any) {
            log.error('Failed to generate certificates:', error.message);
            throw error;
        }
    }

    /**
     * Check if OpenSSL is available on the system
     */
    _isOpenSSLAvailable(): boolean {
        try {
            execSync('openssl version', { stdio: 'ignore' });
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Calculate certificate fingerprint
     */
    _calculateCertFingerprint(cert: Buffer): string {
        try {
            const x509 = new crypto.X509Certificate(cert);
            return x509.fingerprint.toUpperCase();
        } catch (error) {
            log.error('Error calculating certificate fingerprint:', error);
            return 'UNKNOWN_FINGERPRINT';
        }
    }

    /**
     * Parse certificate metadata (expiry and subject)
     */
    _parseCertificateInfo(cert: Buffer): { validTo: string | null; subject: string | null } {
        try {
            const x509 = new crypto.X509Certificate(cert);
            return {
                validTo: new Date(x509.validTo).toISOString(),
                subject: x509.subject || null
            };
        } catch (error: any) {
            log.warn('Could not parse certificate info:', error.message);
            return { validTo: null, subject: null };
        }
    }

    /**
     * Returns an HTTPS request handler for the WSS server
     * Handles /ping, /verify-cert, /accept-cert endpoints
     */
    createHttpsRequestHandler(): (req: any, res: any) => void {
        return (req: any, res: any) => {
            const urlPath = new URL(req.url, `https://${req.headers.host}`).pathname;

            if (urlPath === '/ping') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('pong');
            } else if (urlPath === '/verify-cert') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(CERT_VERIFY_HTML);
            } else if (urlPath === '/accept-cert') {
                res.writeHead(302, { 'Location': '/verify-cert' });
                res.end();
            } else {
                res.writeHead(426, { 'Content-Type': 'text/plain' });
                res.end('Upgrade Required - WebSocket Only');
            }
        };
    }

    /**
     * Check if the WSS certificate is trusted by the OS
     */
    async checkCertificateTrust(): Promise<TrustResult> {
        const certPath = this.certificatePaths.certPath;
        if (!certPath || !fs.existsSync(certPath)) {
            return { trusted: false, error: 'Certificate file not found' };
        }

        try {
            const platform = process.platform;

            if (platform === 'darwin') {
                const fingerprint = this.certificatePaths.fingerprint;
                if (!fingerprint) return { trusted: false };
                const sha1 = fingerprint.replace(/:/g, '').toUpperCase();
                try {
                    const output = execSync('security find-certificate -a -Z', { stdio: 'pipe', encoding: 'utf8' });
                    return { trusted: output.includes(sha1) };
                } catch {
                    return { trusted: false };
                }
            }

            if (platform === 'win32') {
                const fingerprint = this.certificatePaths.fingerprint;
                if (!fingerprint) return { trusted: false };
                const thumbprint = fingerprint.replace(/:/g, ' ').toLowerCase();
                try {
                    const output = execSync('certutil -store -user Root', { stdio: 'pipe', encoding: 'utf8' });
                    return { trusted: output.toLowerCase().includes(thumbprint) };
                } catch {
                    return { trusted: false };
                }
            }

            if (platform === 'linux') {
                const nssDb = path.join(process.env.HOME || '', '.pki', 'nssdb');
                try {
                    execSync(`certutil -d sql:"${nssDb}" -L -n "OpenHeaders localhost"`, { stdio: 'pipe' });
                    return { trusted: true };
                } catch {
                    return { trusted: false };
                }
            }

            return { trusted: false, error: `Unsupported platform: ${platform}` };
        } catch (error: any) {
            log.error('Error checking certificate trust:', error);
            return { trusted: false, error: error.message };
        }
    }

    /**
     * Trust the WSS certificate in the OS trust store
     */
    async trustCertificate(): Promise<TrustActionResult> {
        const certPath = this.certificatePaths.certPath;
        if (!certPath || !fs.existsSync(certPath)) {
            return { success: false, error: 'Certificate file not found' };
        }

        try {
            const platform = process.platform;
            let result: TrustActionResult | undefined;

            if (platform === 'darwin') {
                try {
                    execSync(`security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db "${certPath}"`, { stdio: 'pipe' });
                    log.info('Certificate added to macOS login keychain');
                    result = { success: true };
                } catch (error) {
                    try {
                        execSync(`security delete-certificate -c "OpenHeaders localhost" ~/Library/Keychains/login.keychain-db`, { stdio: 'pipe' });
                        log.info('Cleaned up partially-added certificate after cancelled auth');
                    } catch { /* cert wasn't added, nothing to clean */ }
                    return { success: false, error: 'Authorization was cancelled' };
                }
            } else if (platform === 'win32') {
                try {
                    execSync(`certutil -addstore -user Root "${certPath}"`, { stdio: 'pipe' });
                    log.info('Certificate added to Windows user Root store');
                    result = { success: true };
                } catch (error: any) {
                    const msg = (error.message || '').toLowerCase();
                    if (msg.includes('denied') || msg.includes('policy')) {
                        return { success: false, error: 'Your organization\'s policy prevents adding certificates. Contact your IT administrator.' };
                    }
                    return { success: false, error: 'Failed to add certificate — please confirm the Windows security dialog when prompted' };
                }
            } else if (platform === 'linux') {
                const nssDb = path.join(process.env.HOME || '', '.pki', 'nssdb');
                try {
                    if (!fs.existsSync(nssDb)) {
                        fs.mkdirSync(nssDb, { recursive: true });
                        execSync(`certutil -d sql:"${nssDb}" -N --empty-password`, { stdio: 'pipe' });
                    }
                    try {
                        execSync(`certutil -d sql:"${nssDb}" -D -n "OpenHeaders localhost"`, { stdio: 'pipe' });
                    } catch { /* ignore */ }
                    execSync(`certutil -d sql:"${nssDb}" -A -n "OpenHeaders localhost" -t "C,," -i "${certPath}"`, { stdio: 'pipe' });
                    log.info('Certificate added to Linux NSS database');
                    result = { success: true };
                } catch (error: any) {
                    return { success: false, error: error.message || 'Failed to add certificate — ensure libnss3-tools is installed (apt install libnss3-tools)' };
                }
            } else {
                return { success: false, error: `Unsupported platform: ${platform}` };
            }

            // Notify connected extensions so they can upgrade from WS to WSS
            if (result && result.success) {
                this._broadcastCertificateTrustChanged(true);
            }

            return result!;
        } catch (error: any) {
            log.error('Error trusting certificate:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Remove the WSS certificate from the OS trust store
     */
    async untrustCertificate(): Promise<TrustActionResult> {
        const certPath = this.certificatePaths.certPath;
        if (!certPath || !fs.existsSync(certPath)) {
            return { success: false, error: 'Certificate file not found' };
        }

        try {
            const platform = process.platform;

            if (platform === 'darwin') {
                try {
                    execSync(`security delete-certificate -c "OpenHeaders localhost" ~/Library/Keychains/login.keychain-db`, { stdio: 'pipe' });
                    log.info('Certificate removed from macOS login keychain');
                    return { success: true };
                } catch (error: any) {
                    return { success: false, error: error.message || 'Failed to remove certificate' };
                }
            }

            if (platform === 'win32') {
                try {
                    execSync(`certutil -delstore -user Root "OpenHeaders localhost"`, { stdio: 'pipe' });
                    log.info('Certificate removed from Windows user Root store');
                    return { success: true };
                } catch (error: any) {
                    return { success: false, error: error.message || 'Failed to remove certificate' };
                }
            }

            if (platform === 'linux') {
                const nssDb = path.join(process.env.HOME || '', '.pki', 'nssdb');
                try {
                    execSync(`certutil -d sql:"${nssDb}" -D -n "OpenHeaders localhost"`, { stdio: 'pipe' });
                    log.info('Certificate removed from Linux NSS database');
                    return { success: true };
                } catch (error: any) {
                    return { success: false, error: error.message || 'Failed to remove certificate' };
                }
            }

            return { success: false, error: `Unsupported platform: ${platform}` };
        } catch (error: any) {
            log.error('Error untrusting certificate:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Broadcast certificate trust status change to all connected extensions
     */
    _broadcastCertificateTrustChanged(trusted: boolean): void {
        try {
            const message = JSON.stringify({
                type: 'certificateTrustChanged',
                trusted
            });
            this.wsService._broadcastToAll(message);
            log.info('Broadcasted certificate trust change to extensions');
        } catch (error) {
            log.error('Failed to broadcast certificate trust change:', error);
        }
    }
}

export { WSCertificateHandler };
export default WSCertificateHandler;
