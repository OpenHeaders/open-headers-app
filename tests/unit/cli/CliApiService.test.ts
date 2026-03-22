import { describe, it, expect, beforeEach } from 'vitest';
import { CliApiService } from '../../../src/services/cli/CliApiService';
import type http from 'http';
import type { JsonObject, JsonValue } from '../../../src/types/common';

type RequestLogEntry = CliApiService['requestLogs'][number];

// Enterprise-realistic log entry factory
function makeLogEntry(overrides: Partial<RequestLogEntry> = {}): RequestLogEntry {
    return {
        timestamp: 1737367512345,
        method: 'POST',
        path: '/cli/workspace/join',
        statusCode: 200,
        userAgent: 'OpenHeaders-CLI/2.4.1 (darwin; arm64)',
        remoteAddress: '127.0.0.1:52341',
        duration: 142,
        errorMessage: null,
        bodySummary: { workspaceName: 'OpenHeaders — Production Config' },
        clientProcess: 'node (PID 48291)',
        ...overrides,
    };
}

describe('CliApiService', () => {
    let svc: CliApiService;

    beforeEach(() => {
        svc = new CliApiService();
        svc.requestLogs = [];
    });

    describe('constructor', () => {
        it('generates a 64-char hex token', () => {
            expect(svc.token).toMatch(/^[a-f0-9]{64}$/);
        });

        it('starts with no server', () => {
            expect(svc.server).toBeNull();
            expect(svc.startedAt).toBeNull();
        });

        it('uses port 59213', () => {
            expect(svc.port).toBe(59213);
        });

        it('generates unique tokens across instances', () => {
            const svc2 = new CliApiService();
            expect(svc.token).not.toBe(svc2.token);
        });
    });

    describe('getStatus()', () => {
        it('returns full status shape when not running', () => {
            const status = svc.getStatus();
            expect(status).toEqual({
                running: false,
                port: 59213,
                discoveryPath: svc.discoveryPath,
                token: svc.token,
                startedAt: null,
                totalRequests: 0,
            });
        });

        it('reflects totalRequests from requestLogs length', () => {
            svc.requestLogs = [makeLogEntry(), makeLogEntry({ path: '/cli/health' })];
            const status = svc.getStatus();
            expect(status.totalRequests).toBe(2);
        });
    });

    describe('getLogs() / clearLogs()', () => {
        it('returns empty logs initially', () => {
            expect(svc.getLogs()).toEqual([]);
        });

        it('returns a defensive copy (mutations do not affect internal state)', () => {
            svc.requestLogs = [makeLogEntry()];
            const logs = svc.getLogs();
            logs.push(makeLogEntry({ path: '/cli/injected' }));
            expect(svc.requestLogs).toHaveLength(1);
        });

        it('clearLogs empties the array', () => {
            svc.requestLogs = [makeLogEntry(), makeLogEntry()];
            svc.clearLogs();
            expect(svc.requestLogs).toEqual([]);
        });
    });

    describe('_validateAuth()', () => {
        it('rejects missing authorization header', () => {
            const req = { headers: {} } as http.IncomingMessage;
            expect(svc._validateAuth(req)).toBe(false);
        });

        it('rejects wrong token', () => {
            const req = { headers: { authorization: 'Bearer a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' } } as http.IncomingMessage;
            expect(svc._validateAuth(req)).toBe(false);
        });

        it('rejects non-Bearer scheme', () => {
            const req = { headers: { authorization: `Basic ${svc.token}` } } as http.IncomingMessage;
            expect(svc._validateAuth(req)).toBe(false);
        });

        it('accepts correct Bearer token', () => {
            const req = { headers: { authorization: `Bearer ${svc.token}` } } as http.IncomingMessage;
            expect(svc._validateAuth(req)).toBe(true);
        });

        it('rejects token with extra whitespace', () => {
            const req = { headers: { authorization: `Bearer  ${svc.token}` } } as http.IncomingMessage;
            expect(svc._validateAuth(req)).toBe(false);
        });

        it('rejects empty authorization header', () => {
            const req = { headers: { authorization: '' } } as http.IncomingMessage;
            expect(svc._validateAuth(req)).toBe(false);
        });
    });

    describe('_redactString()', () => {
        it('keeps short strings unchanged', () => {
            expect(svc._redactString('hello')).toBe('hello');
        });

        it('redacts GitHub PAT tokens (ghp_ prefix)', () => {
            expect(svc._redactString('ghp_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6')).toBe('***');
        });

        it('redacts Stripe-style secret keys (sk- prefix)', () => {
            expect(svc._redactString('sk-proj-abcdef1234567890abcdef')).toBe('***');
        });

        it('redacts JWT tokens (eyJ prefix)', () => {
            expect(svc._redactString('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIn0.sig')).toBe('***');
        });

        it('redacts Bearer authorization values', () => {
            expect(svc._redactString('Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig')).toBe('***');
        });

        it('keeps normal long strings unchanged', () => {
            const normal = 'Production API Gateway — OpenHeaders Internal Configuration Service';
            expect(svc._redactString(normal)).toBe(normal);
        });

        it('keeps strings at exactly 20 chars even with sensitive prefix', () => {
            // 20 chars, not > 20 — should NOT be redacted
            expect(svc._redactString('ghp_1234567890123456')).toBe('ghp_1234567890123456');
        });
    });

    describe('_redactDeep()', () => {
        it('redacts all sensitive keys in a realistic workspace join body', () => {
            const result = svc._redactDeep({
                workspaceName: 'OpenHeaders — Production Config',
                repoUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git',
                token: 'ghp_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6',
                password: 'P@ssw0rd!2026#Enterprise',
                secret: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
                authData: '{"sshKey":"-----BEGIN OPENSSH PRIVATE KEY-----"}',
                sshKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nbase64data\n-----END OPENSSH PRIVATE KEY-----',
                sshPassphrase: 'my-ssh-passphrase',
                value: 'Bearer eyJhbGciOiJSUzI1NiJ9.xxx.yyy',
                username: 'admin@openheaders.io',
            }) as JsonObject;

            expect(result.token).toBe('***');
            expect(result.password).toBe('***');
            expect(result.secret).toBe('***');
            expect(result.authData).toBe('***');
            expect(result.sshKey).toBe('***');
            expect(result.sshPassphrase).toBe('***');
            expect(result.value).toBe('***');
            // Non-sensitive keys preserved
            expect(result.workspaceName).toBe('OpenHeaders — Production Config');
            expect(result.repoUrl).toBe('https://gitlab.openheaders.io/platform/shared-headers.git');
            expect(result.username).toBe('admin@openheaders.io');
        });

        it('recursively redacts nested objects', () => {
            const result = svc._redactDeep({
                config: { secret: 'hidden-val', name: 'visible' },
                deep: { level1: { level2: { password: 'deep-pass' } } }
            }) as JsonObject;
            expect((result.config as JsonObject).secret).toBe('***');
            expect((result.config as JsonObject).name).toBe('visible');
            expect(((result.deep as JsonObject).level1 as JsonObject).level2).toEqual({ password: '***' });
        });

        it('handles arrays of mixed objects', () => {
            const result = svc._redactDeep([
                { token: 'ghp_secret123', name: 'Source A' },
                { value: 'Bearer xyz', enabled: true },
                'plain string'
            ]) as JsonValue[];
            expect((result[0] as JsonObject).token).toBe('***');
            expect((result[0] as JsonObject).name).toBe('Source A');
            expect((result[1] as JsonObject).value).toBe('***');
            expect((result[1] as JsonObject).enabled).toBe(true);
            expect(result[2]).toBe('plain string');
        });

        it('preserves non-string sensitive values (numbers, booleans)', () => {
            const result = svc._redactDeep({ token: 12345, secret: true, password: null }) as JsonObject;
            expect(result.token).toBe(12345);
            expect(result.secret).toBe(true);
            expect(result.password).toBeNull();
        });

        it('returns null for null input', () => {
            expect(svc._redactDeep(null)).toBeNull();
        });

        it('returns primitives unchanged', () => {
            expect(svc._redactDeep(42)).toBe(42);
            expect(svc._redactDeep(true)).toBe(true);
            expect(svc._redactDeep('short')).toBe('short');
        });
    });

    describe('_summarizeBody()', () => {
        it('returns null for non-object input', () => {
            expect(svc._summarizeBody('/cli/test', null)).toBeNull();
            expect(svc._summarizeBody('/cli/test', 'string')).toBeNull();
            expect(svc._summarizeBody('/cli/test', undefined)).toBeNull();
            expect(svc._summarizeBody('/cli/test', 42)).toBeNull();
        });

        it('redacts sensitive fields in enterprise workspace join body', () => {
            const result = svc._summarizeBody('/cli/workspace/join', {
                workspaceName: 'OpenHeaders — Staging Environment',
                repoUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git',
                authData: '{"token":"ghp_secret"}',
                token: 'ghp_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6',
            }) as JsonObject;
            expect(result.workspaceName).toBe('OpenHeaders — Staging Environment');
            expect(result.repoUrl).toBe('https://gitlab.openheaders.io/platform/shared-headers.git');
            expect(result.authData).toBe('***');
            expect(result.token).toBe('***');
        });
    });

    describe('_addLog()', () => {
        it('prepends log entry with timestamp and preserves all fields', () => {
            svc._addLog({
                method: 'POST',
                path: '/cli/workspace/join',
                statusCode: 200,
                userAgent: 'OpenHeaders-CLI/2.4.1',
                remoteAddress: '127.0.0.1:52341',
                duration: 142,
                errorMessage: null,
                bodySummary: { workspaceName: 'OpenHeaders — Production Config' },
                clientProcess: 'node (PID 48291)',
            });

            expect(svc.requestLogs).toHaveLength(1);
            const entry = svc.requestLogs[0];
            expect(entry.timestamp).toBeGreaterThan(0);
            expect(entry.method).toBe('POST');
            expect(entry.path).toBe('/cli/workspace/join');
            expect(entry.statusCode).toBe(200);
            expect(entry.userAgent).toBe('OpenHeaders-CLI/2.4.1');
            expect(entry.remoteAddress).toBe('127.0.0.1:52341');
            expect(entry.duration).toBe(142);
            expect(entry.errorMessage).toBeNull();
            expect(entry.bodySummary).toEqual({ workspaceName: 'OpenHeaders — Production Config' });
            expect(entry.clientProcess).toBe('node (PID 48291)');
        });

        it('newest entry is first (stack order)', () => {
            svc._addLog({ method: 'GET', path: '/cli/health', statusCode: 200 });
            svc._addLog({ method: 'POST', path: '/cli/workspace/join', statusCode: 200 });

            expect(svc.requestLogs[0].path).toBe('/cli/workspace/join');
            expect(svc.requestLogs[1].path).toBe('/cli/health');
        });

        it('logs error entries with error messages', () => {
            svc._addLog({
                method: 'POST',
                path: '/cli/environments/import',
                statusCode: 400,
                errorMessage: 'Invalid request body: Expected string, received number',
            });

            expect(svc.requestLogs[0].statusCode).toBe(400);
            expect(svc.requestLogs[0].errorMessage).toBe('Invalid request body: Expected string, received number');
        });
    });

    describe('_buildProcessTree()', () => {
        it('returns friendly name for known macOS process names', () => {
            const result = svc._buildProcessTree('com.apple.WebKit.Networking', 12345);
            expect(result).toBe('Safari (PID 12345)');
        });

        it('returns friendly name for WebKit Content process', () => {
            const result = svc._buildProcessTree('com.apple.WebKit.Content', 67890);
            expect(result).toBe('Safari (PID 67890)');
        });
    });

    describe('regenerateToken()', () => {
        it('generates a new 64-char hex token', async () => {
            const oldToken = svc.token;
            const newToken = await svc.regenerateToken();
            expect(newToken).toMatch(/^[a-f0-9]{64}$/);
            expect(newToken).not.toBe(oldToken);
            expect(svc.token).toBe(newToken);
        });
    });

    describe('setMainWindow / setSetupHandler', () => {
        it('sets main window', () => {
            const win = { id: 1 } as unknown as Parameters<typeof svc.setMainWindow>[0];
            svc.setMainWindow(win);
            expect(svc.mainWindow).toBe(win);
        });

        it('passes window to setup handler when handler is already set', () => {
            let receivedWindow: unknown = null;
            const handler = { setMainWindow: (w: unknown) => { receivedWindow = w; } };
            svc.setSetupHandler(handler as unknown as Parameters<typeof svc.setSetupHandler>[0]);

            const win = { id: 1 } as unknown as Parameters<typeof svc.setMainWindow>[0];
            svc.setMainWindow(win);
            expect(receivedWindow).toBe(win);
        });

        it('passes existing window to handler when handler is set after window', () => {
            const win = { id: 1 } as unknown as Parameters<typeof svc.setMainWindow>[0];
            svc.setMainWindow(win);

            let receivedWindow: unknown = null;
            const handler = { setMainWindow: (w: unknown) => { receivedWindow = w; } };
            svc.setSetupHandler(handler as unknown as Parameters<typeof svc.setSetupHandler>[0]);
            expect(receivedWindow).toBe(win);
        });

        it('does not pass window to handler when no window is set', () => {
            let receivedWindow: unknown = 'untouched';
            const handler = { setMainWindow: (w: unknown) => { receivedWindow = w; } };
            svc.setSetupHandler(handler as unknown as Parameters<typeof svc.setSetupHandler>[0]);
            expect(receivedWindow).toBe('untouched');
        });
    });
});
