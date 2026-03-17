import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CertificateGenerator } from '../../src/utils/certificateGenerator';
import path from 'path';
import fs from 'fs';

// Create a mock logger
function createMockLogger() {
    return {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    };
}

describe('CertificateGenerator', () => {
    let generator: CertificateGenerator;
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        mockLogger = createMockLogger();
        generator = new CertificateGenerator(mockLogger);
    });

    describe('constructor', () => {
        it('stores the logger reference', () => {
            expect(generator.logger).toBe(mockLogger);
        });
    });

    describe('generateCertificates()', () => {
        it('creates the certificate directory', async () => {
            const certDir = path.join('/tmp', `cert-test-${Date.now()}`);

            try {
                await generator.generateCertificates(certDir);
            } catch (e) {
                // node-forge may not be available, that's fine
            }

            // Directory should exist regardless of cert generation method
            const dirExists = fs.existsSync(certDir);
            expect(dirExists).toBe(true);

            // Cleanup
            try {
                fs.rmSync(certDir, { recursive: true, force: true });
            } catch (e) {
                // ignore cleanup errors
            }
        });

        it('generates key and cert files at expected paths', async () => {
            const certDir = path.join('/tmp', `cert-test-${Date.now()}`);

            try {
                const result = await generator.generateCertificates(certDir);
                expect(result.keyPath).toBe(path.join(certDir, 'server.key'));
                expect(result.certPath).toBe(path.join(certDir, 'server.crt'));

                // Files should exist
                expect(fs.existsSync(result.keyPath)).toBe(true);
                expect(fs.existsSync(result.certPath)).toBe(true);
            } finally {
                // Cleanup
                try {
                    fs.rmSync(certDir, { recursive: true, force: true });
                } catch (e) {
                    // ignore
                }
            }
        });

        it('logs messages during generation', async () => {
            const certDir = path.join('/tmp', `cert-test-${Date.now()}`);

            try {
                await generator.generateCertificates(certDir);
                // Should have logged at least one info message
                expect(mockLogger.info.mock.calls.length).toBeGreaterThan(0);
            } finally {
                try {
                    fs.rmSync(certDir, { recursive: true, force: true });
                } catch (e) {
                    // ignore
                }
            }
        });
    });

    describe('generateWithNodeCrypto()', () => {
        it('generates a valid PEM private key', async () => {
            const certDir = path.join('/tmp', `cert-crypto-${Date.now()}`);
            const keyPath = path.join(certDir, 'server.key');
            const certPath = path.join(certDir, 'server.crt');

            try {
                fs.mkdirSync(certDir, { recursive: true });
                const result = await generator.generateWithNodeCrypto(keyPath, certPath);

                expect(result.keyPath).toBe(keyPath);
                expect(result.certPath).toBe(certPath);

                const keyContent = fs.readFileSync(keyPath, 'utf8');
                expect(keyContent).toContain('-----BEGIN PRIVATE KEY-----');
                expect(keyContent).toContain('-----END PRIVATE KEY-----');
            } finally {
                try {
                    fs.rmSync(certDir, { recursive: true, force: true });
                } catch (e) {
                    // ignore
                }
            }
        });

        it('writes a fallback certificate in PEM format', async () => {
            const certDir = path.join('/tmp', `cert-crypto-${Date.now()}`);
            const keyPath = path.join(certDir, 'server.key');
            const certPath = path.join(certDir, 'server.crt');

            try {
                fs.mkdirSync(certDir, { recursive: true });
                await generator.generateWithNodeCrypto(keyPath, certPath);

                const certContent = fs.readFileSync(certPath, 'utf8');
                expect(certContent).toContain('-----BEGIN CERTIFICATE-----');
                expect(certContent).toContain('-----END CERTIFICATE-----');
            } finally {
                try {
                    fs.rmSync(certDir, { recursive: true, force: true });
                } catch (e) {
                    // ignore
                }
            }
        });

        it('logs a warning about fallback certificate', async () => {
            const certDir = path.join('/tmp', `cert-crypto-${Date.now()}`);
            const keyPath = path.join(certDir, 'server.key');
            const certPath = path.join(certDir, 'server.crt');

            try {
                fs.mkdirSync(certDir, { recursive: true });
                await generator.generateWithNodeCrypto(keyPath, certPath);

                expect(mockLogger.warn).toHaveBeenCalledWith(
                    expect.stringContaining('fallback certificate')
                );
            } finally {
                try {
                    fs.rmSync(certDir, { recursive: true, force: true });
                } catch (e) {
                    // ignore
                }
            }
        });
    });

    describe('export shape', () => {
        it('default export is the CertificateGenerator class', async () => {
            const mod = await import('../../src/utils/certificateGenerator');
            expect(mod.default).toBe(CertificateGenerator);
        });

        it('CertificateGenerator is constructable', () => {
            const logger = createMockLogger();
            const gen = new CertificateGenerator(logger);
            expect(gen).toBeInstanceOf(CertificateGenerator);
        });
    });
});
