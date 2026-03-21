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
        it('invokes ipcRenderer with url, method, and options', async () => {
            const invokeSpy = vi.spyOn(ipcRenderer, 'invoke').mockResolvedValue({ status: 200 });

            const result = await bridge.makeHttpRequest('https://example.com', 'GET', {
                connectionOptions: { keepAlive: true, timeout: 5000, requestId: 'test' }
            });

            expect(invokeSpy).toHaveBeenCalledWith('makeHttpRequest', 'https://example.com', 'GET', {
                connectionOptions: { keepAlive: true, timeout: 5000, requestId: 'test' }
            });
            expect(result).toEqual({ status: 200 });
        });

        it('adds default connectionOptions when not provided', async () => {
            vi.spyOn(timeUtils, 'now').mockReturnValue(1000);
            const invokeSpy = vi.spyOn(ipcRenderer, 'invoke').mockResolvedValue({ ok: true });

            await bridge.makeHttpRequest('https://api.test.com', 'POST', { body: 'data' });

            const calledOptions = invokeSpy.mock.calls[0][3] as HttpRequestOptions;
            expect(calledOptions.connectionOptions).toBeDefined();
            const connOpts = calledOptions.connectionOptions as HttpConnectionOptions;
            expect(connOpts.keepAlive).toBe(true);
            expect(connOpts.timeout).toBe(30000);
            expect(typeof connOpts.requestId).toBe('string');
        });

        it('does not overwrite existing connectionOptions', async () => {
            const invokeSpy = vi.spyOn(ipcRenderer, 'invoke').mockResolvedValue({});
            const customOpts = { keepAlive: false, timeout: 1000, requestId: 'custom' };

            await bridge.makeHttpRequest('https://test.com', 'GET', {
                connectionOptions: customOpts
            });

            const calledOptions = invokeSpy.mock.calls[0][3] as HttpRequestOptions;
            expect(calledOptions.connectionOptions).toEqual(customOpts);
        });

        it('throws on ipc failure and logs error', async () => {
            const error = new Error('ECONNREFUSED');
            vi.spyOn(ipcRenderer, 'invoke').mockRejectedValue(error);
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(bridge.makeHttpRequest('https://fail.com', 'GET', {})).rejects.toThrow('ECONNREFUSED');

            // Should log the error (logger.error calls console.error)
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('logs network error details for ECONNRESET', async () => {
            const error = new Error('ECONNRESET: connection reset');
            vi.spyOn(ipcRenderer, 'invoke').mockRejectedValue(error);
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(bridge.makeHttpRequest('https://fail.com', 'GET', {})).rejects.toThrow();

            // Should have at least 2 error log calls (main error + network error detail)
            expect(consoleSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
            consoleSpy.mockRestore();
        });

        it('logs network error details for ETIMEDOUT', async () => {
            const error = new Error('ETIMEDOUT: timed out');
            vi.spyOn(ipcRenderer, 'invoke').mockRejectedValue(error);
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(bridge.makeHttpRequest('https://fail.com', 'GET', {})).rejects.toThrow();

            expect(consoleSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
            consoleSpy.mockRestore();
        });

        it('generates unique request IDs', async () => {
            vi.spyOn(ipcRenderer, 'invoke').mockResolvedValue({});

            // Call twice with empty connectionOptions so defaults get assigned
            const opts1 = { body: '1' };
            const opts2 = { body: '2' };
            await bridge.makeHttpRequest('https://a.com', 'GET', opts1);
            await bridge.makeHttpRequest('https://b.com', 'GET', opts2);

            const id1 = (opts1 as HttpRequestOptions & { connectionOptions: HttpConnectionOptions }).connectionOptions.requestId;
            const id2 = (opts2 as HttpRequestOptions & { connectionOptions: HttpConnectionOptions }).connectionOptions.requestId;
            expect(id1).not.toBe(id2);
        });
    });
});
