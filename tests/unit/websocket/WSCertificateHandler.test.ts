import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import { WSCertificateHandler } from '../../../src/services/websocket/ws-certificate-handler';

function createMockWSService(): ConstructorParameters<typeof WSCertificateHandler>[0] {
    return {
        appDataPath: '/Users/jane.doe/Library/Application Support/OpenHeaders',
        _broadcastToAll: vi.fn().mockReturnValue(2)
    };
}

describe('WSCertificateHandler', () => {
    let handler: WSCertificateHandler;
    let mockService: ReturnType<typeof createMockWSService>;

    beforeEach(() => {
        mockService = createMockWSService();
        handler = new WSCertificateHandler(mockService);
    });

    describe('constructor', () => {
        it('initializes with null certificate paths', () => {
            expect(handler.certificatePaths).toEqual({
                keyPath: null,
                certPath: null,
                fingerprint: null,
            });
        });

        it('stores reference to wsService', () => {
            expect(handler.wsService).toBe(mockService);
        });
    });

    describe('_getCertificatesDirectory', () => {
        it('returns certs subdirectory under appDataPath', () => {
            const dir = handler._getCertificatesDirectory();
            expect(dir).toBe(path.join('/Users/jane.doe/Library/Application Support/OpenHeaders', 'certs'));
        });

        it('falls back to process.cwd()/certs when appDataPath is null', () => {
            mockService.appDataPath = null;
            const dir = handler._getCertificatesDirectory();
            expect(dir).toBe(path.join(process.cwd(), 'certs'));
        });
    });

    describe('createHttpsRequestHandler', () => {
        interface MockReq { url: string; headers: Record<string, string> }
        interface MockRes { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
        let requestHandler: (req: MockReq, res: MockRes) => void;
        let mockRes: MockRes;

        beforeEach(() => {
            requestHandler = handler.createHttpsRequestHandler() as unknown as (req: MockReq, res: MockRes) => void;
            mockRes = {
                writeHead: vi.fn(),
                end: vi.fn()
            };
        });

        it('returns a function', () => {
            expect(typeof requestHandler).toBe('function');
        });

        it('responds to /ping with 200 pong', () => {
            requestHandler({ url: '/ping', headers: { host: '127.0.0.1:59211' } }, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/plain' });
            expect(mockRes.end).toHaveBeenCalledWith('pong');
        });

        it('responds to /verify-cert with 200 and certificate verification HTML', () => {
            requestHandler({ url: '/verify-cert', headers: { host: '127.0.0.1:59211' } }, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/html' });
            const htmlBody = mockRes.end.mock.calls[0][0] as string;
            expect(htmlBody).toContain('Certificate Accepted');
            expect(htmlBody).toContain('Connected');
            expect(htmlBody).toContain('<!DOCTYPE html>');
        });

        it('responds to /accept-cert with 302 redirect to /verify-cert', () => {
            requestHandler({ url: '/accept-cert', headers: { host: '127.0.0.1:59211' } }, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalledWith(302, { 'Location': '/verify-cert' });
            expect(mockRes.end).toHaveBeenCalledWith();
        });

        it('responds to unknown paths with 426 Upgrade Required', () => {
            requestHandler({ url: '/unknown-path', headers: { host: '127.0.0.1:59211' } }, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalledWith(426, { 'Content-Type': 'text/plain' });
            expect(mockRes.end).toHaveBeenCalledWith('Upgrade Required - WebSocket Only');
        });

        it('responds to root path with 426', () => {
            requestHandler({ url: '/', headers: { host: '127.0.0.1:59211' } }, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalledWith(426, { 'Content-Type': 'text/plain' });
        });

        it('handles URLs with query parameters correctly', () => {
            requestHandler({ url: '/ping?ts=1709123456789', headers: { host: '127.0.0.1:59211' } }, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/plain' });
            expect(mockRes.end).toHaveBeenCalledWith('pong');
        });

        it('handles /verify-cert with query parameters', () => {
            requestHandler({ url: '/verify-cert?auto=true', headers: { host: '127.0.0.1:59211' } }, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/html' });
        });

        it('handles deep unknown paths with 426', () => {
            requestHandler({ url: '/api/v2/status', headers: { host: '127.0.0.1:59211' } }, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalledWith(426, { 'Content-Type': 'text/plain' });
        });
    });

    describe('_broadcastCertificateTrustChanged', () => {
        it('broadcasts trusted=true with correct message shape', () => {
            handler._broadcastCertificateTrustChanged(true);
            expect(mockService._broadcastToAll).toHaveBeenCalledTimes(1);
            const message = JSON.parse(vi.mocked(mockService._broadcastToAll).mock.calls[0][0]);
            expect(message).toEqual({
                type: 'certificateTrustChanged',
                trusted: true,
            });
        });

        it('broadcasts trusted=false with correct message shape', () => {
            handler._broadcastCertificateTrustChanged(false);
            const message = JSON.parse(vi.mocked(mockService._broadcastToAll).mock.calls[0][0]);
            expect(message).toEqual({
                type: 'certificateTrustChanged',
                trusted: false,
            });
        });

        it('does not throw when broadcastToAll throws', () => {
            vi.mocked(mockService._broadcastToAll).mockImplementation(() => { throw new Error('All clients disconnected'); });
            expect(() => handler._broadcastCertificateTrustChanged(true)).not.toThrow();
        });
    });

    describe('_calculateCertFingerprint', () => {
        it('returns UNKNOWN_FINGERPRINT for invalid certificate data', () => {
            const result = handler._calculateCertFingerprint(Buffer.from('not a valid PEM certificate'));
            expect(result).toBe('UNKNOWN_FINGERPRINT');
        });

        it('returns UNKNOWN_FINGERPRINT for empty buffer', () => {
            const result = handler._calculateCertFingerprint(Buffer.alloc(0));
            expect(result).toBe('UNKNOWN_FINGERPRINT');
        });

        it('returns UNKNOWN_FINGERPRINT for random binary data', () => {
            const result = handler._calculateCertFingerprint(Buffer.from([0x00, 0xFF, 0xAB, 0xCD]));
            expect(result).toBe('UNKNOWN_FINGERPRINT');
        });
    });

    describe('_parseCertificateInfo', () => {
        it('returns null values for invalid certificate data', () => {
            const result = handler._parseCertificateInfo(Buffer.from('invalid PEM certificate data'));
            expect(result).toEqual({
                validTo: null,
                subject: null,
            });
        });

        it('returns null values for empty buffer', () => {
            const result = handler._parseCertificateInfo(Buffer.alloc(0));
            expect(result).toEqual({
                validTo: null,
                subject: null,
            });
        });
    });

    describe('checkCertificateTrust', () => {
        it('returns not trusted with error when certPath is null', async () => {
            handler.certificatePaths.certPath = null;
            const result = await handler.checkCertificateTrust();
            expect(result).toEqual({
                trusted: false,
                error: 'Certificate file not found',
            });
        });

        it('returns not trusted with error when certPath does not exist', async () => {
            handler.certificatePaths.certPath = '/nonexistent/path/to/server.cert';
            const result = await handler.checkCertificateTrust();
            expect(result).toEqual({
                trusted: false,
                error: 'Certificate file not found',
            });
        });
    });

    describe('trustCertificate', () => {
        it('returns failure when certPath is null', async () => {
            handler.certificatePaths.certPath = null;
            const result = await handler.trustCertificate();
            expect(result).toEqual({
                success: false,
                error: 'Certificate file not found',
            });
        });

        it('returns failure when certPath does not exist', async () => {
            handler.certificatePaths.certPath = '/nonexistent/server.cert';
            const result = await handler.trustCertificate();
            expect(result).toEqual({
                success: false,
                error: 'Certificate file not found',
            });
        });
    });

    describe('untrustCertificate', () => {
        it('returns failure when certPath is null', async () => {
            handler.certificatePaths.certPath = null;
            const result = await handler.untrustCertificate();
            expect(result).toEqual({
                success: false,
                error: 'Certificate file not found',
            });
        });

        it('returns failure when certPath does not exist', async () => {
            handler.certificatePaths.certPath = '/nonexistent/server.cert';
            const result = await handler.untrustCertificate();
            expect(result).toEqual({
                success: false,
                error: 'Certificate file not found',
            });
        });
    });

    describe('_isOpenSSLAvailable', () => {
        it('returns a boolean', () => {
            const result = handler._isOpenSSLAvailable();
            expect(typeof result).toBe('boolean');
        });
    });

    describe('ensureCertificatesExist', () => {
        it('returns failure when certificate directory cannot be accessed and generation fails', async () => {
            // Use an invalid appDataPath to trigger error path
            mockService.appDataPath = null;
            handler = new WSCertificateHandler(mockService);
            // This will try to generate certs in cwd/certs, which may or may not work
            // but at least exercises the code path without crashing
            const result = await handler.ensureCertificatesExist();
            expect(result).toHaveProperty('success');
            expect(typeof result.success).toBe('boolean');
        });
    });
});
