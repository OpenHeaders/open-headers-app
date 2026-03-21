import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http from 'http';

// Mock atomicFileWriter to avoid filesystem I/O
vi.mock('../../src/utils/atomicFileWriter', () => ({
    default: { readJson: () => Promise.resolve(null), writeJson: () => Promise.resolve() },
    readJson: () => Promise.resolve(null),
    writeJson: () => Promise.resolve(),
}));

// ── Echo server: reflects received headers back as JSON ─────────────
let echoServer: http.Server;
let echoPort: number;

function startEchoServer(): Promise<void> {
    return new Promise((resolve) => {
        echoServer = http.createServer((req, res) => {
            const chunks: Buffer[] = [];
            req.on('data', (c) => chunks.push(c));
            req.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    method: req.method,
                    url: req.url,
                    headers: req.headers,
                    body,
                }));
            });
        });
        echoServer.listen(0, '127.0.0.1', () => {
            echoPort = (echoServer.address() as { port: number }).port;
            resolve();
        });
    });
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Make an HTTP request through the proxy and return {statusCode, headers, body}. */
function proxyRequest(
    proxyPort: number,
    targetUrl: string,
    options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
        const reqPath = `/${targetUrl}`;
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port: proxyPort,
                path: reqPath,
                method: options.method || 'GET',
                headers: options.headers || {},
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode!,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString(),
                    });
                });
            },
        );
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

// ── Test suite ──────────────────────────────────────────────────────

let proxyService: InstanceType<typeof import('../../src/services/proxy/ProxyService').ProxyService>;
let proxyPort: number;

beforeAll(async () => {
    // Start echo server first (the proxy needs a target to forward to)
    await startEchoServer();

    // Import the singleton — the test setup.js already mocks electron / electron-log
    const mod = await import('../../src/services/proxy/ProxyService');
    proxyService = mod.proxyService || mod.default;

    // Initialize (sets up cache + rule store in memory since atomicFileWriter is mocked)
    await proxyService.initialize();

    // Start on a random port
    const result = await proxyService.start(0);
    expect(result.success).toBe(true);
    proxyPort = (proxyService.server!.address() as { port: number }).port;
    // Keep port in sync so redirect Location headers use the right value
    proxyService.port = proxyPort;
});

afterAll(async () => {
    if (proxyService?.isRunning) {
        await proxyService.stop();
    }
    await new Promise<void>((resolve) => echoServer.close(() => resolve()));
});

beforeEach(() => {
    // Reset state between tests
    proxyService.headerRules = [];
    proxyService.sources = new Map();
    proxyService.environmentVariables = {};
    proxyService.ruleStore.rules = [];
    proxyService.cacheEnabled = true;
    proxyService.stats = { requestsProcessed: 0, cacheHits: 0, cacheMisses: 0, errors: 0 };
    // Clear in-memory cache metadata so tests are isolated
    proxyService.cache.metadata.clear();
});

describe('Proxy integration – full request flow', () => {
    // ── 1. Basic proxying ──────────────────────────────────────────

    describe('basic proxying', () => {
        it('forwards a GET request to the target and returns the response', async () => {
            const targetUrl = `http://127.0.0.1:${echoPort}/hello`;
            const res = await proxyRequest(proxyPort, targetUrl);

            expect(res.statusCode).toBe(200);
            const echo = JSON.parse(res.body);
            expect(echo.url).toBe('/hello');
            expect(echo.method).toBe('GET');
        });

        it('forwards a POST request with body', async () => {
            const targetUrl = `http://127.0.0.1:${echoPort}/api/data`;
            const res = await proxyRequest(proxyPort, targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'value' }),
            });

            expect(res.statusCode).toBe(200);
            const echo = JSON.parse(res.body);
            expect(echo.method).toBe('POST');
            expect(echo.body).toBe('{"key":"value"}');
        });

        it('increments requestsProcessed stat', async () => {
            const targetUrl = `http://127.0.0.1:${echoPort}/stat-test`;
            await proxyRequest(proxyPort, targetUrl);

            expect(proxyService.stats.requestsProcessed).toBe(1);
        });
    });

    // ── 2. Header injection end-to-end ─────────────────────────────

    describe('header injection end-to-end', () => {
        it('injects a static header into the proxied request', async () => {
            // Set up a proxy rule that applies to all domains
            proxyService.ruleStore.rules = [
                { id: 'r1', enabled: true, headerName: 'X-Custom-Token', headerValue: 'my-secret', domains: [] },
            ];

            const targetUrl = `http://127.0.0.1:${echoPort}/with-header`;
            const res = await proxyRequest(proxyPort, targetUrl);
            const echo = JSON.parse(res.body);

            expect(echo.headers['x-custom-token']).toBe('my-secret');
        });

        it('injects multiple headers from multiple rules', async () => {
            proxyService.ruleStore.rules = [
                { id: 'r1', enabled: true, headerName: 'X-First', headerValue: 'one', domains: [] },
                { id: 'r2', enabled: true, headerName: 'X-Second', headerValue: 'two', domains: [] },
            ];

            const targetUrl = `http://127.0.0.1:${echoPort}/multi`;
            const res = await proxyRequest(proxyPort, targetUrl);
            const echo = JSON.parse(res.body);

            expect(echo.headers['x-first']).toBe('one');
            expect(echo.headers['x-second']).toBe('two');
        });

        it('does NOT inject header when rule is disabled', async () => {
            proxyService.ruleStore.rules = [
                { id: 'r1', enabled: false, headerName: 'X-Disabled', headerValue: 'nope', domains: [] },
            ];

            const targetUrl = `http://127.0.0.1:${echoPort}/disabled`;
            const res = await proxyRequest(proxyPort, targetUrl);
            const echo = JSON.parse(res.body);

            expect(echo.headers['x-disabled']).toBeUndefined();
        });

        it('injects header from a header rule referenced by a proxy rule', async () => {
            proxyService.headerRules = [
                { id: 'hr-1', isEnabled: true, headerName: 'Authorization', headerValue: 'Bearer abc123', domains: [] },
            ];
            proxyService.ruleStore.rules = [
                { id: 'pr-1', enabled: true, headerRuleId: 'hr-1' },
            ];

            const targetUrl = `http://127.0.0.1:${echoPort}/auth`;
            const res = await proxyRequest(proxyPort, targetUrl);
            const echo = JSON.parse(res.body);

            expect(echo.headers['authorization']).toBe('Bearer abc123');
        });

        it('applies domain-scoped rules only to matching domains', async () => {
            proxyService.ruleStore.rules = [
                { id: 'r1', enabled: true, headerName: 'X-Scoped', headerValue: 'yes', domains: ['127.0.0.1'] },
            ];

            const targetUrl = `http://127.0.0.1:${echoPort}/scoped`;
            const res = await proxyRequest(proxyPort, targetUrl);
            const echo = JSON.parse(res.body);
            expect(echo.headers['x-scoped']).toBe('yes');
        });

        it('skips domain-scoped rules for non-matching domains', async () => {
            proxyService.ruleStore.rules = [
                { id: 'r1', enabled: true, headerName: 'X-Scoped', headerValue: 'yes', domains: ['other-domain.com'] },
            ];

            const targetUrl = `http://127.0.0.1:${echoPort}/other`;
            const res = await proxyRequest(proxyPort, targetUrl);
            const echo = JSON.parse(res.body);
            expect(echo.headers['x-scoped']).toBeUndefined();
        });

        it('injects dynamic header with prefix and suffix', async () => {
            proxyService.sources.set('42', 'dynamic-token');
            proxyService.ruleStore.rules = [
                {
                    id: 'r1', enabled: true,
                    headerName: 'Authorization',
                    headerValue: '',
                    isDynamic: true,
                    sourceId: 42,
                    prefix: 'Bearer ',
                    suffix: '-end',
                    domains: [],
                },
            ];

            const targetUrl = `http://127.0.0.1:${echoPort}/dynamic`;
            const res = await proxyRequest(proxyPort, targetUrl);
            const echo = JSON.parse(res.body);

            expect(echo.headers['authorization']).toBe('Bearer dynamic-token-end');
        });
    });

    // ── 3. Caching – MISS then HIT ─────────────────────────────────

    describe('caching', () => {
        it('first request is a MISS, second request is a HIT', async () => {
            const targetUrl = `http://127.0.0.1:${echoPort}/cacheable.json`;

            // First request — cache MISS
            const first = await proxyRequest(proxyPort, targetUrl);
            expect(first.statusCode).toBe(200);
            expect(first.headers['x-proxy-cache']).toBe('MISS');
            expect(proxyService.stats.cacheMisses).toBe(1);
            expect(proxyService.stats.cacheHits).toBe(0);

            // Second request — cache HIT
            const second = await proxyRequest(proxyPort, targetUrl);
            expect(second.statusCode).toBe(200);
            expect(proxyService.stats.cacheHits).toBe(1);
        });

        it('does not cache when caching is disabled', async () => {
            proxyService.cacheEnabled = false;

            const targetUrl = `http://127.0.0.1:${echoPort}/no-cache.json`;
            await proxyRequest(proxyPort, targetUrl);
            await proxyRequest(proxyPort, targetUrl);

            expect(proxyService.stats.cacheHits).toBe(0);
            expect(proxyService.stats.cacheMisses).toBe(0);
        });

        it('does not cache non-GET requests', async () => {
            const targetUrl = `http://127.0.0.1:${echoPort}/post.json`;

            await proxyRequest(proxyPort, targetUrl, { method: 'POST', body: 'data' });
            await proxyRequest(proxyPort, targetUrl, { method: 'POST', body: 'data' });

            // POST requests bypass cache entirely — no MISS/HIT counting
            expect(proxyService.stats.cacheHits).toBe(0);
        });

        it('caches various cacheable content types', async () => {
            // The proxy determines content type from the URL extension
            for (const ext of ['.css', '.js', '.png', '.svg', '.ico', '.woff2']) {
                proxyService.cache.metadata.clear();
                proxyService.stats = { requestsProcessed: 0, cacheHits: 0, cacheMisses: 0, errors: 0 };

                const targetUrl = `http://127.0.0.1:${echoPort}/static/file${ext}`;
                await proxyRequest(proxyPort, targetUrl);
                await proxyRequest(proxyPort, targetUrl);

                expect(proxyService.stats.cacheHits).toBe(1);
            }
        });
    });

    // ── 4. Environment variable resolution in headers ──────────────

    describe('environment variable resolution in headers', () => {
        it('resolves {{VAR}} in header value end-to-end', async () => {
            proxyService.environmentVariables = { SECRET: 'env-secret-123' };
            proxyService.ruleStore.rules = [
                { id: 'r1', enabled: true, headerName: 'X-Api-Key', headerValue: '{{SECRET}}', domains: [] },
            ];

            const targetUrl = `http://127.0.0.1:${echoPort}/env-header`;
            const res = await proxyRequest(proxyPort, targetUrl);
            const echo = JSON.parse(res.body);

            expect(echo.headers['x-api-key']).toBe('env-secret-123');
        });

        it('resolves {{VAR}} in header name end-to-end', async () => {
            proxyService.environmentVariables = { HEADER_NAME: 'x-dynamic-name' };
            proxyService.ruleStore.rules = [
                { id: 'r1', enabled: true, headerName: '{{HEADER_NAME}}', headerValue: 'value', domains: [] },
            ];

            const targetUrl = `http://127.0.0.1:${echoPort}/env-name`;
            const res = await proxyRequest(proxyPort, targetUrl);
            const echo = JSON.parse(res.body);

            expect(echo.headers['x-dynamic-name']).toBe('value');
        });

        it('resolves env vars in prefix/suffix for dynamic rules', async () => {
            proxyService.environmentVariables = { PREFIX: 'Bearer ', SUFFIX: '!!' };
            proxyService.sources.set('7', 'src-val');
            proxyService.ruleStore.rules = [
                {
                    id: 'r1', enabled: true,
                    headerName: 'Authorization',
                    headerValue: '',
                    isDynamic: true,
                    sourceId: 7,
                    prefix: '{{PREFIX}}',
                    suffix: '{{SUFFIX}}',
                    domains: [],
                },
            ];

            const targetUrl = `http://127.0.0.1:${echoPort}/env-dynamic`;
            const res = await proxyRequest(proxyPort, targetUrl);
            const echo = JSON.parse(res.body);

            expect(echo.headers['authorization']).toBe('Bearer src-val!!');
        });

        it('keeps unresolved placeholder when variable is not set', async () => {
            proxyService.ruleStore.rules = [
                { id: 'r1', enabled: true, headerName: 'X-Token', headerValue: '{{UNDEFINED_VAR}}', domains: [] },
            ];

            const targetUrl = `http://127.0.0.1:${echoPort}/env-missing`;
            const res = await proxyRequest(proxyPort, targetUrl);
            const echo = JSON.parse(res.body);

            expect(echo.headers['x-token']).toBe('{{UNDEFINED_VAR}}');
        });
    });

    // ── 5. CORS preflight handling ─────────────────────────────────

    describe('CORS preflight handling', () => {
        it('responds to OPTIONS with correct CORS headers', async () => {
            const res = await proxyRequest(proxyPort, `http://127.0.0.1:${echoPort}/cors`, {
                method: 'OPTIONS',
                headers: {
                    'Access-Control-Request-Headers': 'Authorization, X-Custom',
                },
            });

            expect(res.statusCode).toBe(200);
            expect(res.headers['access-control-allow-origin']).toBe('*');
            expect(res.headers['access-control-allow-methods']).toContain('GET');
            expect(res.headers['access-control-allow-methods']).toContain('POST');
            expect(res.headers['access-control-allow-headers']).toBe('Authorization, X-Custom');
            expect(res.headers['access-control-max-age']).toBe('86400');
        });

        it('OPTIONS returns 200 even without access-control-request-headers', async () => {
            const res = await proxyRequest(proxyPort, `http://127.0.0.1:${echoPort}/cors-simple`, {
                method: 'OPTIONS',
            });

            expect(res.statusCode).toBe(200);
            expect(res.headers['access-control-allow-origin']).toBe('*');
        });

        it('does NOT increment requestsProcessed on OPTIONS', async () => {
            await proxyRequest(proxyPort, `http://127.0.0.1:${echoPort}/cors-stat`, {
                method: 'OPTIONS',
            });

            expect(proxyService.stats.requestsProcessed).toBe(0);
        });
    });

    // ── 6. Error responses for invalid URLs ────────────────────────

    describe('error responses for invalid URLs', () => {
        it('returns 400 for a bare path (no scheme)', async () => {
            const res = await proxyRequest(proxyPort, 'just-a-path');

            expect(res.statusCode).toBe(400);
            expect(res.body).toContain('Invalid proxy request');
        });

        it('returns 400 for a relative path', async () => {
            const res = await proxyRequest(proxyPort, 'some/relative/path');

            expect(res.statusCode).toBe(400);
            expect(res.body).toContain('Invalid proxy request');
        });

        it('returns 502 when the target server is unreachable', async () => {
            // Use a port that nothing is listening on
            const res = await proxyRequest(proxyPort, 'http://127.0.0.1:19999/unreachable');

            expect(res.statusCode).toBe(502);
            expect(res.body).toContain('Proxy Error');
            expect(proxyService.stats.errors).toBe(1);
        });
    });

    // ── 7. Response headers ────────────────────────────────────────

    describe('response headers', () => {
        it('adds access-control-allow-origin: * to all responses', async () => {
            const targetUrl = `http://127.0.0.1:${echoPort}/cors-response`;
            const res = await proxyRequest(proxyPort, targetUrl);

            expect(res.headers['access-control-allow-origin']).toBe('*');
        });

        it('sets x-proxy-cache header on responses', async () => {
            const targetUrl = `http://127.0.0.1:${echoPort}/cache-header.json`;
            const res = await proxyRequest(proxyPort, targetUrl);

            expect(res.headers['x-proxy-cache']).toBe('MISS');
        });
    });

    // ── 8. Multiple rules interacting ──────────────────────────────

    describe('multiple rules interacting', () => {
        it('applies both proxy rules and header rules simultaneously', async () => {
            proxyService.headerRules = [
                { id: 'hr-1', isEnabled: true, headerName: 'X-From-Header-Rule', headerValue: 'hr-value', domains: [] },
            ];
            proxyService.ruleStore.rules = [
                { id: 'pr-1', enabled: true, headerRuleId: 'hr-1' },
                { id: 'pr-2', enabled: true, headerName: 'X-From-Proxy-Rule', headerValue: 'pr-value', domains: [] },
            ];

            const targetUrl = `http://127.0.0.1:${echoPort}/combined`;
            const res = await proxyRequest(proxyPort, targetUrl);
            const echo = JSON.parse(res.body);

            expect(echo.headers['x-from-header-rule']).toBe('hr-value');
            expect(echo.headers['x-from-proxy-rule']).toBe('pr-value');
        });

        it('env var in domain pattern with header injection', async () => {
            proxyService.environmentVariables = { TARGET_HOST: '127.0.0.1' };
            proxyService.ruleStore.rules = [
                { id: 'r1', enabled: true, headerName: 'X-Env-Domain', headerValue: 'matched', domains: ['{{TARGET_HOST}}'] },
            ];

            const targetUrl = `http://127.0.0.1:${echoPort}/env-domain`;
            const res = await proxyRequest(proxyPort, targetUrl);
            const echo = JSON.parse(res.body);

            expect(echo.headers['x-env-domain']).toBe('matched');
        });
    });
});
