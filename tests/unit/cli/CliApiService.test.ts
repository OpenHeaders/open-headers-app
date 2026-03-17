import { describe, it, expect, beforeEach } from 'vitest';
import { CliApiService } from '../../../src/services/cli/CliApiService';
import type http from 'http';

describe('CliApiService', () => {
    let svc: CliApiService;

    beforeEach(() => {
        svc = new CliApiService();
        svc.requestLogs = []; // Clear any logs loaded from disk between tests
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
    });

    describe('getStatus()', () => {
        it('reports not running when no server', () => {
            const status = svc.getStatus();
            expect(status.running).toBe(false);
            expect(status.port).toBe(59213);
            expect(status.totalRequests).toBe(0);
        });
    });

    describe('getLogs() / clearLogs()', () => {
        it('returns empty logs initially', () => {
            expect(svc.getLogs()).toEqual([]);
        });

        it('returns a copy of logs', () => {
            svc.requestLogs = [{ a: 1 }];
            const logs = svc.getLogs();
            logs.push({ b: 2 });
            expect(svc.requestLogs).toHaveLength(1);
        });

        it('clearLogs empties the array', () => {
            svc.requestLogs = [{ a: 1 }, { b: 2 }];
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
            const req = { headers: { authorization: 'Bearer wrong-token' } } as http.IncomingMessage;
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
    });

    describe('_redactString()', () => {
        it('keeps short strings', () => {
            expect(svc._redactString('hello')).toBe('hello');
        });

        it('redacts GitHub tokens', () => {
            expect(svc._redactString('ghp_abcdefghijklmnopqrstuvwxyz12345')).toBe('***');
        });

        it('redacts OpenAI-style keys', () => {
            expect(svc._redactString('sk-abcdefghijklmnopqrstuvwxyz12345')).toBe('***');
        });

        it('redacts JWT tokens', () => {
            expect(svc._redactString('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature')).toBe('***');
        });

        it('redacts Bearer tokens', () => {
            expect(svc._redactString('Bearer abcdefghijklmnopqrstuvwxyz')).toBe('***');
        });

        it('keeps normal long strings', () => {
            expect(svc._redactString('this is a long normal string with no secret patterns')).toBe('this is a long normal string with no secret patterns');
        });
    });

    describe('_redactDeep()', () => {
        it('redacts sensitive keys', () => {
            const result = svc._redactDeep({
                token: 'secret-val',
                password: 'my-pass',
                username: 'visible',
            });
            expect(result.token).toBe('***');
            expect(result.password).toBe('***');
            expect(result.username).toBe('visible');
        });

        it('handles nested objects', () => {
            const result = svc._redactDeep({
                config: { secret: 'hidden', name: 'visible' }
            });
            expect(result.config.secret).toBe('***');
            expect(result.config.name).toBe('visible');
        });

        it('handles arrays', () => {
            const result = svc._redactDeep([{ token: 'x' }, { name: 'y' }]);
            expect(result[0].token).toBe('***');
            expect(result[1].name).toBe('y');
        });

        it('preserves non-string sensitive values', () => {
            const result = svc._redactDeep({ token: 12345, enabled: true });
            expect(result.token).toBe(12345);
            expect(result.enabled).toBe(true);
        });

        it('returns null for null', () => {
            expect(svc._redactDeep(null)).toBeNull();
        });
    });

    describe('_summarizeBody()', () => {
        it('returns null for non-object input', () => {
            expect(svc._summarizeBody('/cli/test', null)).toBeNull();
            expect(svc._summarizeBody('/cli/test', 'string')).toBeNull();
        });

        it('redacts sensitive fields in body', () => {
            const result = svc._summarizeBody('/cli/workspace/join', {
                workspaceName: 'My Team',
                authData: 'secret-value',
            });
            expect(result.workspaceName).toBe('My Team');
            expect(result.authData).toBe('***');
        });
    });

    describe('_addLog()', () => {
        it('prepends log entry with timestamp', () => {
            svc._addLog({ method: 'GET', path: '/cli/health', statusCode: 200 });

            expect(svc.requestLogs).toHaveLength(1);
            expect(svc.requestLogs[0].method).toBe('GET');
            expect(svc.requestLogs[0].timestamp).toBeGreaterThan(0);
        });

        it('newest entry is first', () => {
            svc._addLog({ method: 'GET', path: '/first' });
            svc._addLog({ method: 'POST', path: '/second' });

            expect(svc.requestLogs[0].path).toBe('/second');
            expect(svc.requestLogs[1].path).toBe('/first');
        });
    });

    describe('setMainWindow / setSetupHandler', () => {
        it('sets main window', () => {
            const win = { id: 1 };
            svc.setMainWindow(win);
            expect(svc.mainWindow).toBe(win);
        });

        it('passes window to setup handler', () => {
            let receivedWindow: any = null;
            const handler = { setMainWindow: (w: any) => { receivedWindow = w; } };
            svc.setSetupHandler(handler);

            const win = { id: 1 };
            svc.setMainWindow(win);
            expect(receivedWindow).toBe(win);
        });
    });
});
