import http from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProxyService } from '../../src/services/proxy/ProxyService';
import type { ProxyRule } from '../../src/types/proxy';
import type { HeaderRule } from '../../src/types/rules';

/** Create a realistic HeaderRule with enterprise-style defaults */
function makeHeaderRule(overrides: Partial<HeaderRule> = {}): HeaderRule {
  return {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    type: 'header',
    name: 'Add OAuth2 Bearer Token (prod)',
    description: 'Injects production OAuth2 bearer token for API Gateway',
    isEnabled: true,
    domains: [],
    createdAt: '2025-11-15T09:30:00.000Z',
    updatedAt: '2026-01-20T14:45:12.345Z',
    headerName: 'Authorization',
    headerValue:
      'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQGFjbWUuY29tIiwiaWF0IjoxNzE2MDAwMDAwfQ.signature',
    tag: 'production',
    isResponse: false,
    isDynamic: false,
    sourceId: null,
    prefix: '',
    suffix: '',
    hasEnvVars: false,
    envVars: [],
    ...overrides,
  };
}

/** Create a realistic ProxyRule */
function makeProxyRule(overrides: Partial<ProxyRule> = {}): ProxyRule {
  return {
    id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    name: 'Proxy Rule — API Gateway',
    enabled: true,
    ...overrides,
  };
}

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
        res.end(
          JSON.stringify({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body,
          }),
        );
      });
    });
    echoServer.listen(0, '127.0.0.1', () => {
      echoPort = (echoServer.address() as { port: number }).port;
      resolve();
    });
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

interface ProxyResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** Make an HTTP request through the proxy and return {statusCode, headers, body}. */
function proxyRequest(
  proxyPort: number,
  targetUrl: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<ProxyResponse> {
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

/** Parse the echo server's JSON response body */
function parseEcho(body: string): { method: string; url: string; headers: Record<string, string>; body: string } {
  return JSON.parse(body);
}

// ── Test suite ──────────────────────────────────────────────────────

let proxyService: ProxyService;
let proxyPort: number;

beforeAll(async () => {
  await startEchoServer();

  const mod = await import('../../src/services/proxy/ProxyService');
  proxyService = mod.proxyService || mod.default;

  await proxyService.initialize();

  const result = await proxyService.start(0);
  expect(result.success).toBe(true);
  proxyPort = (proxyService.server!.address() as { port: number }).port;
  proxyService.port = proxyPort;
});

afterAll(async () => {
  if (proxyService?.isRunning) {
    await proxyService.stop();
  }
  await new Promise<void>((resolve) => echoServer.close(() => resolve()));
});

beforeEach(() => {
  proxyService.headerRules = [];
  proxyService.sources = new Map();
  proxyService.environmentVariables = {};
  proxyService.ruleStore.rules = [];
  proxyService.cacheEnabled = true;
  proxyService.stats = { requestsProcessed: 0, cacheHits: 0, cacheMisses: 0, errors: 0 };
  proxyService.cache.metadata.clear();
});

describe('Proxy integration – full request flow', () => {
  // ── 1. Basic proxying ──────────────────────────────────────────

  describe('basic proxying', () => {
    it('forwards a GET request to the target and returns full response', async () => {
      const targetUrl = `http://127.0.0.1:${echoPort}/api/v2/users?page=1&limit=50`;
      const res = await proxyRequest(proxyPort, targetUrl);

      expect(res.statusCode).toBe(200);
      const echo = parseEcho(res.body);
      expect(echo.url).toBe('/api/v2/users?page=1&limit=50');
      expect(echo.method).toBe('GET');
    });

    it('forwards a POST request with JSON body', async () => {
      const targetUrl = `http://127.0.0.1:${echoPort}/api/v2/resources`;
      const requestBody = JSON.stringify({
        name: 'Open Headers — Staging Environment',
        config: { apiKey: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc', region: 'us-east-1' },
      });
      const res = await proxyRequest(proxyPort, targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });

      expect(res.statusCode).toBe(200);
      const echo = parseEcho(res.body);
      expect(echo.method).toBe('POST');
      expect(echo.body).toBe(requestBody);
    });

    it('forwards a PUT request', async () => {
      const targetUrl = `http://127.0.0.1:${echoPort}/api/v2/resources/a1b2c3d4`;
      const res = await proxyRequest(proxyPort, targetUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Resource' }),
      });

      expect(res.statusCode).toBe(200);
      const echo = parseEcho(res.body);
      expect(echo.method).toBe('PUT');
    });

    it('forwards a DELETE request', async () => {
      const targetUrl = `http://127.0.0.1:${echoPort}/api/v2/resources/a1b2c3d4`;
      const res = await proxyRequest(proxyPort, targetUrl, { method: 'DELETE' });

      expect(res.statusCode).toBe(200);
      const echo = parseEcho(res.body);
      expect(echo.method).toBe('DELETE');
    });

    it('forwards a PATCH request with partial body', async () => {
      const targetUrl = `http://127.0.0.1:${echoPort}/api/v2/resources/a1b2c3d4`;
      const res = await proxyRequest(proxyPort, targetUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Patched' }),
      });

      expect(res.statusCode).toBe(200);
      const echo = parseEcho(res.body);
      expect(echo.method).toBe('PATCH');
    });

    it('increments requestsProcessed stat', async () => {
      const targetUrl = `http://127.0.0.1:${echoPort}/stat-test`;
      await proxyRequest(proxyPort, targetUrl);
      expect(proxyService.stats.requestsProcessed).toBe(1);
    });

    it('preserves original request headers (except host/accept-encoding)', async () => {
      const targetUrl = `http://127.0.0.1:${echoPort}/headers-test`;
      const res = await proxyRequest(proxyPort, targetUrl, {
        headers: {
          'X-Custom-Trace': 'trace-a1b2c3d4',
          Accept: 'application/json',
        },
      });

      const echo = parseEcho(res.body);
      expect(echo.headers['x-custom-trace']).toBe('trace-a1b2c3d4');
      expect(echo.headers['accept']).toBe('application/json');
    });
  });

  // ── 2. Header injection end-to-end ─────────────────────────────

  describe('header injection end-to-end', () => {
    it('injects a static header via proxy rule', async () => {
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'r-static',
          headerName: 'X-Api-Key',
          headerValue: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
          domains: [],
        }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/with-header`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      expect(echo.headers['x-api-key']).toBe('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
    });

    it('injects multiple headers from multiple rules', async () => {
      proxyService.ruleStore.rules = [
        makeProxyRule({ id: 'r1', headerName: 'X-Trace-Id', headerValue: 'trace-a1b2c3d4-e5f6', domains: [] }),
        makeProxyRule({ id: 'r2', headerName: 'X-Request-Source', headerValue: 'open-headers-proxy', domains: [] }),
        makeProxyRule({ id: 'r3', headerName: 'X-Team', headerValue: 'platform-engineering', domains: [] }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/multi-header`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      expect(echo.headers['x-trace-id']).toBe('trace-a1b2c3d4-e5f6');
      expect(echo.headers['x-request-source']).toBe('open-headers-proxy');
      expect(echo.headers['x-team']).toBe('platform-engineering');
    });

    it('does NOT inject header when rule is disabled', async () => {
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'r-disabled',
          enabled: false,
          headerName: 'X-Should-Not-Appear',
          headerValue: 'nope',
          domains: [],
        }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/disabled`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      expect(echo.headers['x-should-not-appear']).toBeUndefined();
    });

    it('injects header from header rule referenced by proxy rule', async () => {
      proxyService.headerRules = [
        makeHeaderRule({
          id: 'hr-oauth',
          headerName: 'Authorization',
          headerValue: 'Bearer eyJhbGciOiJSUzI1NiJ9.prod-token.sig',
        }),
      ];
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'pr-oauth',
          headerRuleId: 'hr-oauth',
        }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/auth`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      expect(echo.headers['authorization']).toBe('Bearer eyJhbGciOiJSUzI1NiJ9.prod-token.sig');
    });

    it('applies domain-scoped rules only to matching domains', async () => {
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'r-scoped',
          headerName: 'X-Scoped',
          headerValue: 'yes',
          domains: ['127.0.0.1'],
        }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/scoped`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);
      expect(echo.headers['x-scoped']).toBe('yes');
    });

    it('skips domain-scoped rules for non-matching domains', async () => {
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'r-other',
          headerName: 'X-Scoped',
          headerValue: 'yes',
          domains: ['api.openheaders.io'],
        }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/other`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);
      expect(echo.headers['x-scoped']).toBeUndefined();
    });

    it('injects dynamic header with prefix and suffix from source', async () => {
      proxyService.sources.set('42', 'eyJhbGciOiJSUzI1NiJ9.dynamic-source-token.sig');
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'r-dynamic',
          headerName: 'Authorization',
          headerValue: '',
          isDynamic: true,
          sourceId: 42,
          prefix: 'Bearer ',
          suffix: '',
          domains: [],
        }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/dynamic`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      expect(echo.headers['authorization']).toBe('Bearer eyJhbGciOiJSUzI1NiJ9.dynamic-source-token.sig');
    });

    it('does NOT inject dynamic header when source content is missing', async () => {
      // Source ID 999 is not registered → no source content
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'r-missing-source',
          headerName: 'Authorization',
          headerValue: '',
          isDynamic: true,
          sourceId: 999,
          prefix: 'Bearer ',
          suffix: '',
          domains: [],
        }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/no-source`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      // isDynamic with no resolved value and no fallback → empty, so header not injected
      expect(echo.headers['authorization']).toBeUndefined();
    });

    it('end-to-end: source → header rule → proxy rule → injected header', async () => {
      // 1. Register a source with a realistic OAuth2 token
      const sourceId = 'src-oauth-prod';
      const token =
        'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzZXJ2aWNlLWFjY291bnRAYWNtZS5jb20iLCJpYXQiOjE3MTYwMDAwMDAsImV4cCI6MTcxNjAwMzYwMH0.sig';
      proxyService.updateSource(sourceId, token);

      // 2. Create a header rule that references this source
      proxyService.headerRules = [
        makeHeaderRule({
          id: 'hr-e2e',
          headerName: 'Authorization',
          headerValue: '',
          isDynamic: true,
          sourceId: sourceId,
          prefix: 'Bearer ',
          suffix: '',
          isEnabled: true,
          domains: [],
        }),
      ];

      // 3. Create a proxy rule that references the header rule
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'pr-e2e',
          headerRuleId: 'hr-e2e',
          enabled: true,
        }),
      ];

      // 4. Make a request through the proxy
      const targetUrl = `http://127.0.0.1:${echoPort}/e2e-full-flow`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      // 5. Verify the header was injected with source value + prefix
      expect(echo.headers['authorization']).toBe(`Bearer ${token}`);
    });
  });

  // ── 3. Caching ────────────────────────────────────────────────

  describe('caching', () => {
    it('first request is MISS, second is HIT', async () => {
      const targetUrl = `http://127.0.0.1:${echoPort}/cacheable.json`;

      const first = await proxyRequest(proxyPort, targetUrl);
      expect(first.statusCode).toBe(200);
      expect(first.headers['x-proxy-cache']).toBe('MISS');
      expect(proxyService.stats.cacheMisses).toBe(1);
      expect(proxyService.stats.cacheHits).toBe(0);

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

      await proxyRequest(proxyPort, targetUrl, { method: 'POST', body: '{"data":"test"}' });
      await proxyRequest(proxyPort, targetUrl, { method: 'POST', body: '{"data":"test"}' });

      expect(proxyService.stats.cacheHits).toBe(0);
    });

    it('caches various cacheable content types by URL extension', async () => {
      const cacheableExtensions = ['.css', '.js', '.png', '.svg', '.ico', '.woff2', '.json'];
      for (const ext of cacheableExtensions) {
        proxyService.cache.metadata.clear();
        proxyService.stats = { requestsProcessed: 0, cacheHits: 0, cacheMisses: 0, errors: 0 };

        const targetUrl = `http://127.0.0.1:${echoPort}/assets/file${ext}`;
        await proxyRequest(proxyPort, targetUrl);
        await proxyRequest(proxyPort, targetUrl);

        expect(proxyService.stats.cacheHits).toBe(1);
      }
    });
  });

  // ── 4. Environment variable resolution in headers ──────────────

  describe('environment variable resolution', () => {
    it('resolves {{VAR}} in header value end-to-end', async () => {
      proxyService.environmentVariables = { API_SECRET: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc' };
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'r-env-val',
          headerName: 'X-Api-Key',
          headerValue: '{{API_SECRET}}',
          domains: [],
        }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/env-header`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      expect(echo.headers['x-api-key']).toBe('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
    });

    it('resolves {{VAR}} in header name end-to-end', async () => {
      proxyService.environmentVariables = { HEADER_NAME: 'x-dynamic-auth' };
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'r-env-name',
          headerName: '{{HEADER_NAME}}',
          headerValue: 'Bearer token',
          domains: [],
        }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/env-name`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      expect(echo.headers['x-dynamic-auth']).toBe('Bearer token');
    });

    it('resolves env vars in prefix/suffix for dynamic rules', async () => {
      proxyService.environmentVariables = { TOKEN_PREFIX: 'Bearer ', TOKEN_SUFFIX: ' (prod)' };
      proxyService.sources.set('7', 'dynamic-token-value');
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'r-env-dynamic',
          headerName: 'Authorization',
          headerValue: '',
          isDynamic: true,
          sourceId: 7,
          prefix: '{{TOKEN_PREFIX}}',
          suffix: '{{TOKEN_SUFFIX}}',
          domains: [],
        }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/env-dynamic`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      expect(echo.headers['authorization']).toBe('Bearer dynamic-token-value (prod)');
    });

    it('skips rule with unresolved env var instead of injecting placeholder', async () => {
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'r-unresolved',
          headerName: 'X-Token',
          headerValue: '{{UNDEFINED_VAR}}',
          domains: [],
        }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/env-missing`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      // Rule should be skipped entirely — no header injected
      expect(echo.headers['x-token']).toBeUndefined();
    });

    it('resolves environment variables in domain patterns', async () => {
      proxyService.environmentVariables = { TARGET_HOST: '127.0.0.1' };
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'r-env-domain',
          headerName: 'X-Env-Domain',
          headerValue: 'matched',
          domains: ['{{TARGET_HOST}}'],
        }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/env-domain`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      expect(echo.headers['x-env-domain']).toBe('matched');
    });
  });

  // ── 5. CORS preflight handling ─────────────────────────────────

  describe('CORS preflight handling', () => {
    it('responds to OPTIONS with correct CORS headers', async () => {
      const res = await proxyRequest(proxyPort, `http://127.0.0.1:${echoPort}/cors`, {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Headers': 'Authorization, X-Custom-Header, X-Request-ID',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['access-control-allow-methods']).toContain('GET');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-methods']).toContain('PUT');
      expect(res.headers['access-control-allow-methods']).toContain('DELETE');
      expect(res.headers['access-control-allow-methods']).toContain('OPTIONS');
      expect(res.headers['access-control-allow-headers']).toBe('Authorization, X-Custom-Header, X-Request-ID');
      expect(res.headers['access-control-max-age']).toBe('86400');
    });

    it('OPTIONS returns 200 without access-control-request-headers', async () => {
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

  // ── 6. Error responses ────────────────────────────────────────

  describe('error responses', () => {
    it('returns 400 for bare path (no scheme)', async () => {
      const res = await proxyRequest(proxyPort, 'just-a-path');
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('Invalid proxy request');
    });

    it('returns 400 for relative path', async () => {
      const res = await proxyRequest(proxyPort, 'some/relative/path');
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('Invalid proxy request');
    });

    it('returns 502 when target server is unreachable', async () => {
      const res = await proxyRequest(proxyPort, 'http://127.0.0.1:19999/unreachable');
      expect(res.statusCode).toBe(502);
      expect(res.body).toContain('Proxy Error');
      expect(proxyService.stats.errors).toBe(1);
    });

    it('returns 400 for ftp:// scheme', async () => {
      const res = await proxyRequest(proxyPort, 'ftp://files.openheaders.io/data');
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('Invalid proxy request');
    });
  });

  // ── 7. Response headers ──────────────────────────────────────

  describe('response headers', () => {
    it('adds access-control-allow-origin: * to all responses', async () => {
      const targetUrl = `http://127.0.0.1:${echoPort}/cors-response`;
      const res = await proxyRequest(proxyPort, targetUrl);
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });

    it('sets x-proxy-cache header on cacheable responses', async () => {
      const targetUrl = `http://127.0.0.1:${echoPort}/cache-header.json`;
      const res = await proxyRequest(proxyPort, targetUrl);
      expect(res.headers['x-proxy-cache']).toBe('MISS');
    });

    it('sets correct content-type for known extensions', async () => {
      const extensionMap: Record<string, string> = {
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.woff2': 'font/woff2',
      };

      for (const [ext, expectedType] of Object.entries(extensionMap)) {
        const targetUrl = `http://127.0.0.1:${echoPort}/static/file${ext}`;
        const res = await proxyRequest(proxyPort, targetUrl);
        expect(res.headers['content-type']).toBe(expectedType);
      }
    });
  });

  // ── 8. Multiple rules interacting ──────────────────────────────

  describe('multiple rules interacting', () => {
    it('applies both proxy rules and header rules simultaneously', async () => {
      proxyService.headerRules = [
        makeHeaderRule({
          id: 'hr-auth',
          headerName: 'Authorization',
          headerValue: 'Bearer eyJhbGciOiJSUzI1NiJ9.from-header-rule.sig',
        }),
      ];
      proxyService.ruleStore.rules = [
        makeProxyRule({ id: 'pr-auth', headerRuleId: 'hr-auth' }),
        makeProxyRule({
          id: 'pr-trace',
          headerName: 'X-Trace-Id',
          headerValue: 'trace-a1b2c3d4',
          domains: [],
        }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/combined`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      expect(echo.headers['authorization']).toBe('Bearer eyJhbGciOiJSUzI1NiJ9.from-header-rule.sig');
      expect(echo.headers['x-trace-id']).toBe('trace-a1b2c3d4');
    });

    it('mixes dynamic and static rules together', async () => {
      proxyService.sources.set('src-dynamic', 'dynamic-oauth-token');
      proxyService.headerRules = [
        makeHeaderRule({
          id: 'hr-dynamic',
          headerName: 'Authorization',
          headerValue: '',
          isDynamic: true,
          sourceId: 'src-dynamic',
          prefix: 'Bearer ',
          suffix: '',
        }),
        makeHeaderRule({
          id: 'hr-static',
          headerName: 'X-Api-Version',
          headerValue: 'v2.1.0',
        }),
      ];
      proxyService.ruleStore.rules = [
        makeProxyRule({ id: 'pr-dynamic', headerRuleId: 'hr-dynamic' }),
        makeProxyRule({ id: 'pr-static', headerRuleId: 'hr-static' }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/mixed`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      expect(echo.headers['authorization']).toBe('Bearer dynamic-oauth-token');
      expect(echo.headers['x-api-version']).toBe('v2.1.0');
    });

    it('env var in domain pattern with header injection', async () => {
      proxyService.environmentVariables = { TARGET_HOST: '127.0.0.1' };
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'r-env-combo',
          headerName: 'X-Env-Matched',
          headerValue: 'matched-via-env',
          domains: ['{{TARGET_HOST}}'],
        }),
      ];

      const targetUrl = `http://127.0.0.1:${echoPort}/env-domain-combo`;
      const res = await proxyRequest(proxyPort, targetUrl);
      const echo = parseEcho(res.body);

      expect(echo.headers['x-env-matched']).toBe('matched-via-env');
    });
  });

  // ── 9. Concurrent requests ────────────────────────────────────

  describe('concurrent requests', () => {
    it('handles multiple simultaneous requests correctly', async () => {
      proxyService.ruleStore.rules = [
        makeProxyRule({
          id: 'r-concurrent',
          headerName: 'X-Concurrent',
          headerValue: 'true',
          domains: [],
        }),
      ];

      const requests = Array.from({ length: 10 }, (_, i) =>
        proxyRequest(proxyPort, `http://127.0.0.1:${echoPort}/concurrent/${i}`),
      );

      const results = await Promise.all(requests);

      for (let i = 0; i < results.length; i++) {
        expect(results[i].statusCode).toBe(200);
        const echo = parseEcho(results[i].body);
        expect(echo.url).toBe(`/concurrent/${i}`);
        expect(echo.headers['x-concurrent']).toBe('true');
      }

      expect(proxyService.stats.requestsProcessed).toBe(10);
    });

    it('handles concurrent requests with different rules', async () => {
      proxyService.ruleStore.rules = [
        makeProxyRule({ id: 'r1', headerName: 'X-Rule-1', headerValue: 'val1', domains: [] }),
        makeProxyRule({ id: 'r2', headerName: 'X-Rule-2', headerValue: 'val2', domains: [] }),
      ];

      const [res1, res2] = await Promise.all([
        proxyRequest(proxyPort, `http://127.0.0.1:${echoPort}/a`),
        proxyRequest(proxyPort, `http://127.0.0.1:${echoPort}/b`),
      ]);

      const echo1 = parseEcho(res1.body);
      const echo2 = parseEcho(res2.body);

      expect(echo1.headers['x-rule-1']).toBe('val1');
      expect(echo1.headers['x-rule-2']).toBe('val2');
      expect(echo2.headers['x-rule-1']).toBe('val1');
      expect(echo2.headers['x-rule-2']).toBe('val2');
    });
  });

  // ── 10. Stats tracking ────────────────────────────────────────

  describe('stats tracking', () => {
    it('tracks request count and errors', async () => {
      // Normal request
      await proxyRequest(proxyPort, `http://127.0.0.1:${echoPort}/stats-1`);
      // POST request
      await proxyRequest(proxyPort, `http://127.0.0.1:${echoPort}/stats-2`, { method: 'POST' });
      // Error request (unreachable port)
      await proxyRequest(proxyPort, 'http://127.0.0.1:19999/error');

      expect(proxyService.stats.requestsProcessed).toBe(3);
      expect(proxyService.stats.errors).toBe(1);
    });
  });
});
