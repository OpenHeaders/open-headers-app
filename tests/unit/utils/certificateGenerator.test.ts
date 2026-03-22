import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CertificateGenerator } from '../../../src/utils/certificateGenerator';
import path from 'path';
import fs from 'fs';

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
            const certDir = path.join('/tmp', `cert-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

            try {
                await generator.generateCertificates(certDir);
            } catch (e) {
                // node-forge may not be available
            }

            expect(fs.existsSync(certDir)).toBe(true);

            try {
                fs.rmSync(certDir, { recursive: true, force: true });
            } catch (e) { /* ignore */ }
        });

        it('generates key and cert files at expected paths', async () => {
            const certDir = path.join('/tmp', `cert-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

            try {
                const result = await generator.generateCertificates(certDir);
                expect(result).toEqual({
                    keyPath: path.join(certDir, 'server.key'),
                    certPath: path.join(certDir, 'server.crt')
                });

                expect(fs.existsSync(result.keyPath)).toBe(true);
                expect(fs.existsSync(result.certPath)).toBe(true);
            } finally {
                try { fs.rmSync(certDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
            }
        });

        it('logs messages during generation', async () => {
            const certDir = path.join('/tmp', `cert-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

            try {
                await generator.generateCertificates(certDir);
                expect(mockLogger.info.mock.calls.length).toBeGreaterThan(0);
            } finally {
                try { fs.rmSync(certDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
            }
        });

        it('creates nested directory structure', async () => {
            const certDir = path.join('/tmp', `cert-nested-${Date.now()}`, 'certs', 'proxy');

            try {
                await generator.generateCertificates(certDir);
                expect(fs.existsSync(certDir)).toBe(true);
            } finally {
                try { fs.rmSync(path.join('/tmp', `cert-nested-${Date.now()}`), { recursive: true, force: true }); } catch (e) { /* ignore */ }
            }
        });
    });

    describe('generateWithNodeCrypto()', () => {
        it('generates a valid PEM private key', async () => {
            const certDir = path.join('/tmp', `cert-crypto-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            const keyPath = path.join(certDir, 'server.key');
            const certPath = path.join(certDir, 'server.crt');

            try {
                fs.mkdirSync(certDir, { recursive: true });
                const result = await generator.generateWithNodeCrypto(keyPath, certPath);

                expect(result).toEqual({ keyPath, certPath });

                const keyContent = fs.readFileSync(keyPath, 'utf8');
                expect(keyContent).toContain('-----BEGIN PRIVATE KEY-----');
                expect(keyContent).toContain('-----END PRIVATE KEY-----');
                expect(keyContent.length).toBeGreaterThan(500);
            } finally {
                try { fs.rmSync(certDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
            }
        });

        it('writes a fallback certificate in PEM format', async () => {
            const certDir = path.join('/tmp', `cert-crypto-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            const keyPath = path.join(certDir, 'server.key');
            const certPath = path.join(certDir, 'server.crt');

            try {
                fs.mkdirSync(certDir, { recursive: true });
                await generator.generateWithNodeCrypto(keyPath, certPath);

                const certContent = fs.readFileSync(certPath, 'utf8');
                expect(certContent).toContain('-----BEGIN CERTIFICATE-----');
                expect(certContent).toContain('-----END CERTIFICATE-----');
            } finally {
                try { fs.rmSync(certDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
            }
        });

        it('logs a warning about fallback certificate', async () => {
            const certDir = path.join('/tmp', `cert-crypto-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            const keyPath = path.join(certDir, 'server.key');
            const certPath = path.join(certDir, 'server.crt');

            try {
                fs.mkdirSync(certDir, { recursive: true });
                await generator.generateWithNodeCrypto(keyPath, certPath);

                expect(mockLogger.warn).toHaveBeenCalledWith(
                    expect.stringContaining('fallback certificate')
                );
                expect(mockLogger.info).toHaveBeenCalledWith(
                    expect.stringContaining('Node.js crypto')
                );
            } finally {
                try { fs.rmSync(certDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
            }
        });
    });

    describe('export shape', () => {
        it('default export is the CertificateGenerator class', async () => {
            const mod = await import('../../../src/utils/certificateGenerator');
            expect(mod.default).toBe(CertificateGenerator);
        });

        it('CertificateGenerator is constructable with a logger', () => {
            const logger = createMockLogger();
            const gen = new CertificateGenerator(logger);
            expect(gen).toBeInstanceOf(CertificateGenerator);
            expect(gen.logger).toBe(logger);
        });
    });
});
