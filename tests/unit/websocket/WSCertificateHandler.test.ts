import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WSCertificateHandler } from '../../../src/services/websocket/ws-certificate-handler';

function createMockWSService() {
    return {
        appDataPath: '/tmp/test-app-data',
        _broadcastToAll: vi.fn().mockReturnValue(2)
    };
}

describe('WSCertificateHandler', () => {
    let handler: WSCertificateHandler;
    let mockService: ReturnType<typeof createMockWSService>;

    beforeEach(() => {
        mockService = createMockWSService();
        handler = new WSCertificateHandler(mockService as any);
    });

    // ------- constructor -------
    describe('constructor', () => {
        it('initializes with null certificate paths', () => {
            expect(handler.certificatePaths.keyPath).toBeNull();
            expect(handler.certificatePaths.certPath).toBeNull();
            expect(handler.certificatePaths.fingerprint).toBeNull();
        });

        it('stores reference to wsService', () => {
            expect(handler.wsService).toBe(mockService);
        });
    });

    // ------- _getCertificatesDirectory -------
    describe('_getCertificatesDirectory', () => {
        it('returns certs subdirectory under appDataPath', () => {
            const dir = handler._getCertificatesDirectory();
            expect(dir).toContain('/tmp/test-app-data');
            expect(dir).toMatch(/certs$/);
        });

        it('falls back to cwd when appDataPath is null', () => {
            mockService.appDataPath = null;
            const dir = handler._getCertificatesDirectory();
            expect(dir).toContain('certs');
            expect(dir).not.toContain('test-app-data');
        });

        it('uses process.cwd() as base when appDataPath is null', () => {
            mockService.appDataPath = null;
            const dir = handler._getCertificatesDirectory();
            expect(dir).toBe(require('path').join(process.cwd(), 'certs'));
        });
    });

    // ------- createHttpsRequestHandler -------
    describe('createHttpsRequestHandler', () => {
        interface MockReq { url: string; headers: Record<string, string> }
        interface MockRes { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
        let requestHandler: (req: MockReq, res: MockRes) => void;
        let mockRes: MockRes;

        beforeEach(() => {
            requestHandler = handler.createHttpsRequestHandler();
            mockRes = {
                writeHead: vi.fn(),
                end: vi.fn()
            };
        });

        it('returns a function', () => {
            expect(typeof requestHandler).toBe('function');
        });

        it('responds to /ping with 200 pong', () => {
            const req = { url: '/ping', headers: { host: 'localhost:59211' } };
            requestHandler(req, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/plain' });
            expect(mockRes.end).toHaveBeenCalledWith('pong');
        });

        it('responds to /verify-cert with 200 and HTML', () => {
            const req = { url: '/verify-cert', headers: { host: 'localhost:59211' } };
            requestHandler(req, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/html' });
            const htmlBody = mockRes.end.mock.calls[0][0];
            expect(htmlBody).toContain('Certificate Accepted');
            expect(htmlBody).toContain('Connected');
        });

        it('responds to /accept-cert with 302 redirect to /verify-cert', () => {
            const req = { url: '/accept-cert', headers: { host: 'localhost:59211' } };
            requestHandler(req, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalledWith(302, { 'Location': '/verify-cert' });
            expect(mockRes.end).toHaveBeenCalledWith();
        });

        it('responds to unknown paths with 426 Upgrade Required', () => {
            const req = { url: '/unknown', headers: { host: 'localhost:59211' } };
            requestHandler(req, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalledWith(426, { 'Content-Type': 'text/plain' });
            expect(mockRes.end).toHaveBeenCalledWith('Upgrade Required - WebSocket Only');
        });

        it('responds to root path with 426', () => {
            const req = { url: '/', headers: { host: 'localhost:59211' } };
            requestHandler(req, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalledWith(426, { 'Content-Type': 'text/plain' });
        });

        it('handles URLs with query parameters correctly', () => {
            const req = { url: '/ping?foo=bar', headers: { host: 'localhost:59211' } };
            requestHandler(req, mockRes);
            expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/plain' });
            expect(mockRes.end).toHaveBeenCalledWith('pong');
        });
    });

    // ------- _broadcastCertificateTrustChanged -------
    describe('_broadcastCertificateTrustChanged', () => {
        it('broadcasts trusted=true to all clients', () => {
            handler._broadcastCertificateTrustChanged(true);
            expect(mockService._broadcastToAll).toHaveBeenCalledTimes(1);
            const message = JSON.parse(mockService._broadcastToAll.mock.calls[0][0]);
            expect(message.type).toBe('certificateTrustChanged');
            expect(message.trusted).toBe(true);
        });

        it('broadcasts trusted=false to all clients', () => {
            handler._broadcastCertificateTrustChanged(false);
            const message = JSON.parse(mockService._broadcastToAll.mock.calls[0][0]);
            expect(message.type).toBe('certificateTrustChanged');
            expect(message.trusted).toBe(false);
        });

        it('does not throw when broadcastToAll throws', () => {
            mockService._broadcastToAll.mockImplementation(() => { throw new Error('broadcast error'); });
            expect(() => handler._broadcastCertificateTrustChanged(true)).not.toThrow();
        });
    });

    // ------- _calculateCertFingerprint -------
    describe('_calculateCertFingerprint', () => {
        it('returns UNKNOWN_FINGERPRINT for invalid certificate data', () => {
            const result = handler._calculateCertFingerprint(Buffer.from('not a cert'));
            expect(result).toBe('UNKNOWN_FINGERPRINT');
        });

        it('returns UNKNOWN_FINGERPRINT for empty buffer', () => {
            const result = handler._calculateCertFingerprint(Buffer.alloc(0));
            expect(result).toBe('UNKNOWN_FINGERPRINT');
        });
    });

    // ------- _parseCertificateInfo -------
    describe('_parseCertificateInfo', () => {
        it('returns null values for invalid certificate data', () => {
            const result = handler._parseCertificateInfo(Buffer.from('invalid cert'));
            expect(result.validTo).toBeNull();
            expect(result.subject).toBeNull();
        });

        it('returns null values for empty buffer', () => {
            const result = handler._parseCertificateInfo(Buffer.alloc(0));
            expect(result.validTo).toBeNull();
            expect(result.subject).toBeNull();
        });
    });

    // ------- checkCertificateTrust -------
    describe('checkCertificateTrust', () => {
        it('returns not trusted when certPath is null', async () => {
            handler.certificatePaths.certPath = null;
            const result = await handler.checkCertificateTrust();
            expect(result.trusted).toBe(false);
            expect(result.error).toBe('Certificate file not found');
        });

        it('returns not trusted when certPath does not exist', async () => {
            handler.certificatePaths.certPath = '/nonexistent/path/cert.pem';
            const result = await handler.checkCertificateTrust();
            expect(result.trusted).toBe(false);
            expect(result.error).toBe('Certificate file not found');
        });
    });

    // ------- trustCertificate -------
    describe('trustCertificate', () => {
        it('returns failure when certPath is null', async () => {
            handler.certificatePaths.certPath = null;
            const result = await handler.trustCertificate();
            expect(result.success).toBe(false);
            expect(result.error).toBe('Certificate file not found');
        });

        it('returns failure when certPath does not exist', async () => {
            handler.certificatePaths.certPath = '/nonexistent/cert.pem';
            const result = await handler.trustCertificate();
            expect(result.success).toBe(false);
            expect(result.error).toBe('Certificate file not found');
        });
    });

    // ------- untrustCertificate -------
    describe('untrustCertificate', () => {
        it('returns failure when certPath is null', async () => {
            handler.certificatePaths.certPath = null;
            const result = await handler.untrustCertificate();
            expect(result.success).toBe(false);
            expect(result.error).toBe('Certificate file not found');
        });

        it('returns failure when certPath does not exist', async () => {
            handler.certificatePaths.certPath = '/nonexistent/cert.pem';
            const result = await handler.untrustCertificate();
            expect(result.success).toBe(false);
            expect(result.error).toBe('Certificate file not found');
        });
    });

    // ------- _isOpenSSLAvailable -------
    describe('_isOpenSSLAvailable', () => {
        it('returns a boolean', () => {
            const result = handler._isOpenSSLAvailable();
            expect(typeof result).toBe('boolean');
        });
    });
});
