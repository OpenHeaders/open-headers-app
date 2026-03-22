import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpBridge } from '../../../src/preload/modules/httpBridge';
import timeUtils from '../../../src/preload/modules/timeUtils';
import { ipcRenderer } from 'electron';
import type { HttpRequestOptions, HttpConnectionOptions } from '../../../src/types/http';

describe('HttpBridge', () => {
    let bridge: InstanceType<typeof HttpBridge>;

    beforeEach(() => {
        bridge = new HttpBridge();
        vi.restoreAllMocks();
    });

    describe('makeHttpRequest()', () => {
        it('invokes ipcRenderer with enterprise URL, method, and options', async () => {
            const invokeSpy = vi.spyOn(ipcRenderer, 'invoke').mockResolvedValue('{"access_token":"eyJhbGciOiJSUzI1NiJ9.payload.sig","token_type":"Bearer","expires_in":3600}');

            const result = await bridge.makeHttpRequest(
                'https://auth.openheaders.io:8443/oauth2/token',
                'POST',
                {
                    body: 'grant_type=client_credentials&scope=read:headers',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ='
                    },
                    connectionOptions: { keepAlive: true, timeout: 15000, requestId: 'oauth-req-001' }
                }
            );

            expect(invokeSpy).toHaveBeenCalledWith(
                'makeHttpRequest',
                'https://auth.openheaders.io:8443/oauth2/token',
                'POST',
                {
                    body: 'grant_type=client_credentials&scope=read:headers',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ='
                    },
                    connectionOptions: { keepAlive: true, timeout: 15000, requestId: 'oauth-req-001' }
                }
            );
            expect(result).toBe('{"access_token":"eyJhbGciOiJSUzI1NiJ9.payload.sig","token_type":"Bearer","expires_in":3600}');
        });

        it('adds default connectionOptions when not provided', async () => {
            vi.spyOn(timeUtils, 'now').mockReturnValue(1737367512345);
            const invokeSpy = vi.spyOn(ipcRenderer, 'invoke').mockResolvedValue('{"ok":true}');

            await bridge.makeHttpRequest(
                'https://api.openheaders.io/v2/sources',
                'GET',
                { headers: { 'Accept': 'application/json' } }
            );

            const calledOptions = invokeSpy.mock.calls[0][3] as HttpRequestOptions;
            expect(calledOptions.connectionOptions).toBeDefined();
            const connOpts = calledOptions.connectionOptions as HttpConnectionOptions;
            expect(connOpts.keepAlive).toBe(true);
            expect(connOpts.timeout).toBe(30000);
            expect(typeof connOpts.requestId).toBe('string');
            expect(connOpts.requestId.length).toBeGreaterThan(0);
        });

        it('does not overwrite existing connectionOptions', async () => {
            const invokeSpy = vi.spyOn(ipcRenderer, 'invoke').mockResolvedValue('{}');
            const customOpts: HttpConnectionOptions = { keepAlive: false, timeout: 5000, requestId: 'custom-enterprise-req-42' };

            await bridge.makeHttpRequest(
                'https://api.partner-service.io:8443/headers/sync',
                'PUT',
                { connectionOptions: customOpts }
            );

            const calledOptions = invokeSpy.mock.calls[0][3] as HttpRequestOptions;
            expect(calledOptions.connectionOptions).toEqual({
                keepAlive: false,
                timeout: 5000,
                requestId: 'custom-enterprise-req-42'
            });
        });

        it('throws on ipc failure and logs error', async () => {
            const error = new Error('ECONNREFUSED: connect ECONNREFUSED 10.0.1.50:8443');
            vi.spyOn(ipcRenderer, 'invoke').mockRejectedValue(error);
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(bridge.makeHttpRequest(
                'https://internal.openheaders.io:8443/api/token',
                'POST',
                {}
            )).rejects.toThrow('ECONNREFUSED');

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('logs enhanced network error details for ECONNRESET', async () => {
            const error = new Error('ECONNRESET: connection reset by peer');
            vi.spyOn(ipcRenderer, 'invoke').mockRejectedValue(error);
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(bridge.makeHttpRequest(
                'https://api.openheaders.io/v2/sources/a1b2c3d4',
                'GET',
                {}
            )).rejects.toThrow('ECONNRESET');

            // Main error + network error detail = at least 2 calls
            expect(consoleSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
            consoleSpy.mockRestore();
        });

        it('logs enhanced network error details for ETIMEDOUT', async () => {
            const error = new Error('ETIMEDOUT: connection timed out after 30000ms');
            vi.spyOn(ipcRenderer, 'invoke').mockRejectedValue(error);
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(bridge.makeHttpRequest(
                'https://auth.openheaders.io/oauth2/token',
                'POST',
                {}
            )).rejects.toThrow('ETIMEDOUT');

            expect(consoleSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
            consoleSpy.mockRestore();
        });

        it('does not log extra details for non-network errors', async () => {
            const error = new Error('Request validation failed: invalid JSON body');
            vi.spyOn(ipcRenderer, 'invoke').mockRejectedValue(error);
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(bridge.makeHttpRequest(
                'https://api.openheaders.io/v2/rules',
                'POST',
                { body: '{"invalid json' }
            )).rejects.toThrow('Request validation failed');

            // Only the main error log, no extra network error detail
            expect(consoleSpy.mock.calls.length).toBe(1);
            consoleSpy.mockRestore();
        });

        it('generates unique request IDs across calls', async () => {
            vi.spyOn(ipcRenderer, 'invoke').mockResolvedValue('{}');

            const opts1: HttpRequestOptions = { headers: { 'X-Request': '1' } };
            const opts2: HttpRequestOptions = { headers: { 'X-Request': '2' } };
            await bridge.makeHttpRequest('https://api.openheaders.io/v2/sources', 'GET', opts1);
            await bridge.makeHttpRequest('https://api.openheaders.io/v2/rules', 'GET', opts2);

            const id1 = (opts1 as HttpRequestOptions & { connectionOptions: HttpConnectionOptions }).connectionOptions.requestId;
            const id2 = (opts2 as HttpRequestOptions & { connectionOptions: HttpConnectionOptions }).connectionOptions.requestId;
            expect(id1).not.toBe(id2);
        });

        it('handles non-Error thrown objects', async () => {
            vi.spyOn(ipcRenderer, 'invoke').mockRejectedValue('string error');
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(bridge.makeHttpRequest(
                'https://api.openheaders.io/v2/health',
                'GET',
                {}
            )).rejects.toBe('string error');

            // Should still log but not trigger the network error detail branch
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('passes through various HTTP methods correctly', async () => {
            const invokeSpy = vi.spyOn(ipcRenderer, 'invoke').mockResolvedValue('{}');
            const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;

            for (const method of methods) {
                await bridge.makeHttpRequest('https://api.openheaders.io/v2/test', method, {
                    connectionOptions: { keepAlive: true, timeout: 5000, requestId: `req-${method}` }
                });
            }

            expect(invokeSpy).toHaveBeenCalledTimes(methods.length);
            methods.forEach((method, i) => {
                expect(invokeSpy.mock.calls[i][2]).toBe(method);
            });
        });
    });
});
