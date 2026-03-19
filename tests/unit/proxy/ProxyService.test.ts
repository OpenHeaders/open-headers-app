import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';

// Mock atomicFileWriter (ProxyCache and ProxyRuleStore use it for disk I/O)
vi.mock('../../../src/utils/atomicFileWriter', () => ({
    default: { readJson: () => Promise.resolve(null), writeJson: () => Promise.resolve() },
    readJson: () => Promise.resolve(null),
    writeJson: () => Promise.resolve(),
}));

let proxyService: any;

beforeAll(async () => {
    const mod = await import('../../../src/services/proxy/ProxyService');
    proxyService = mod.proxyService || mod.default;
});

interface MockResponse {
    statusCode: number | null;
    headers: Record<string, string>;
    body: string;
    writeHead(code: number, headers?: Record<string, string>): void;
    end(data?: string): void;
}

function createMockResponse(): MockResponse {
    const res: MockResponse = {
        statusCode: null,
        headers: {},
        body: '',
        writeHead(code: number, headers?: Record<string, string>) {
            res.statusCode = code;
            Object.assign(res.headers, headers || {});
        },
        end(data?: string) {
            res.body = data || '';
        },
    };
    return res;
}

describe('ProxyService', () => {
    beforeEach(() => {
        proxyService.headerRules = [];
        proxyService.sources = new Map();
        proxyService.environmentVariables = {};
        proxyService.strictSSL = false;
        proxyService.trustedCertificates = new Set();
        proxyService.certificateExceptions = new Map();
        proxyService.cacheEnabled = true;
        proxyService.stats = { requestsProcessed: 0, cacheHits: 0, cacheMisses: 0, errors: 0 };
        proxyService.ruleStore.rules = [];
    });

    afterEach(async () => {
        if (proxyService.isRunning) {
            await proxyService.stop();
        }
    });

    // ── resolveEnvironmentVariables ──────────────────────────────────

    describe('resolveEnvironmentVariables()', () => {
        it('replaces {{VAR}} with environment variable value', () => {
            proxyService.environmentVariables = { API_KEY: 'secret123' };
            expect(proxyService.resolveEnvironmentVariables('Bearer {{API_KEY}}')).toBe('Bearer secret123');
        });

        it('replaces multiple variables in one string', () => {
            proxyService.environmentVariables = { HOST: 'example.com', PORT: '8080' };
            expect(proxyService.resolveEnvironmentVariables('{{HOST}}:{{PORT}}')).toBe('example.com:8080');
        });

        it('keeps placeholder when variable is not defined', () => {
            proxyService.environmentVariables = {};
            expect(proxyService.resolveEnvironmentVariables('{{MISSING}}')).toBe('{{MISSING}}');
        });

        it('trims whitespace inside braces', () => {
            proxyService.environmentVariables = { TOKEN: 'abc' };
            expect(proxyService.resolveEnvironmentVariables('{{ TOKEN }}')).toBe('abc');
        });

        it('returns non-string input unchanged', () => {
            expect(proxyService.resolveEnvironmentVariables(null)).toBeNull();
            expect(proxyService.resolveEnvironmentVariables(undefined)).toBeUndefined();
            expect(proxyService.resolveEnvironmentVariables(42)).toBe(42);
        });

        it('returns plain string unchanged', () => {
            expect(proxyService.resolveEnvironmentVariables('no variables here')).toBe('no variables here');
        });

        it('resolves empty string variable', () => {
            proxyService.environmentVariables = { EMPTY: '' };
            expect(proxyService.resolveEnvironmentVariables('prefix-{{EMPTY}}-suffix')).toBe('prefix--suffix');
        });
    });

    // ── updateEnvironmentVariables ──────────────────────────────────

    describe('updateEnvironmentVariables()', () => {
        it('extracts values from {value: ...} objects', () => {
            proxyService.updateEnvironmentVariables({
                API_KEY: { value: 'secret' },
                HOST: { value: 'example.com' },
            });
            expect(proxyService.environmentVariables).toEqual({ API_KEY: 'secret', HOST: 'example.com' });
        });

        it('accepts direct string values', () => {
            proxyService.updateEnvironmentVariables({ TOKEN: 'bearer-xyz' });
            expect(proxyService.environmentVariables).toEqual({ TOKEN: 'bearer-xyz' });
        });

        it('handles mixed formats', () => {
            proxyService.updateEnvironmentVariables({ A: { value: 'from-object' }, B: 'direct-string' });
            expect(proxyService.environmentVariables).toEqual({ A: 'from-object', B: 'direct-string' });
        });

        it('handles null/undefined input gracefully', () => {
            proxyService.updateEnvironmentVariables(null);
            expect(proxyService.environmentVariables).toEqual({});
            proxyService.updateEnvironmentVariables(undefined);
            expect(proxyService.environmentVariables).toEqual({});
        });
    });

    // ── updateSource / updateSources ────────────────────────────────

    describe('source management', () => {
        it('updateSource stores value by string ID', () => {
            proxyService.updateSource(42, 'my-value');
            expect(proxyService.sources.get('42')).toBe('my-value');
        });

        it('updateSource overwrites existing value', () => {
            proxyService.updateSource('1', 'old');
            proxyService.updateSource('1', 'new');
            expect(proxyService.sources.get('1')).toBe('new');
        });

        it('updateSources loads from array', () => {
            proxyService.updateSources([
                { sourceId: '1', sourceContent: 'value-a' },
                { sourceId: '2', sourceContent: 'value-b' },
            ]);
            expect(proxyService.sources.get('1')).toBe('value-a');
            expect(proxyService.sources.get('2')).toBe('value-b');
        });

        it('updateSources skips entries without sourceId', () => {
            proxyService.updateSources([{ sourceContent: 'orphan' }, { sourceId: '1', sourceContent: 'valid' }]);
            expect(proxyService.sources.size).toBe(1);
        });

        it('updateSources ignores non-array input', () => {
            proxyService.updateSources('not an array');
            expect(proxyService.sources.size).toBe(0);
        });
    });

    // ── resolveHeaderValue ──────────────────────────────────────────

    describe('resolveHeaderValue()', () => {
        it('resolves dynamic rule from source', () => {
            proxyService.sources.set('10', 'source-token');
            expect(proxyService.resolveHeaderValue('fallback', { isDynamic: true, sourceId: 10 })).toBe('source-token');
        });

        it('returns fallback for dynamic rule when source is missing', () => {
            expect(proxyService.resolveHeaderValue('fallback', { isDynamic: true, sourceId: 99 })).toBe('fallback');
        });

        it('resolves __source_N reference', () => {
            proxyService.sources.set('5', 'resolved-value');
            expect(proxyService.resolveHeaderValue('__source_5', {})).toBe('resolved-value');
        });

        it('keeps __source_N if source not found', () => {
            expect(proxyService.resolveHeaderValue('__source_999', {})).toBe('__source_999');
        });

        it('resolves environment variables in static values', () => {
            proxyService.environmentVariables = { TOKEN: 'xyz' };
            expect(proxyService.resolveHeaderValue('Bearer {{TOKEN}}', {})).toBe('Bearer xyz');
        });

        it('returns empty string for undefined values', () => {
            expect(proxyService.resolveHeaderValue(undefined, {} as Record<string, unknown>)).toBe('');
        });
    });

    // ── getApplicableRules ──────────────────────────────────────────

    describe('getApplicableRules()', () => {
        it('returns empty array when no rules exist', () => {
            expect(proxyService.getApplicableRules('https://example.com')).toEqual([]);
        });

        it('matches header rule via proxy rule reference', () => {
            proxyService.headerRules = [{ id: 'hr-1', isEnabled: true, headerName: 'Authorization', headerValue: 'Bearer token', domains: [] }];
            proxyService.ruleStore.rules = [{ enabled: true, headerRuleId: 'hr-1' }];

            const result = proxyService.getApplicableRules('https://example.com/api');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('hr-1');
        });

        it('skips disabled proxy rules', () => {
            proxyService.headerRules = [{ id: 'hr-1', isEnabled: true, domains: [] }];
            proxyService.ruleStore.rules = [{ enabled: false, headerRuleId: 'hr-1' }];
            expect(proxyService.getApplicableRules('https://example.com')).toEqual([]);
        });

        it('skips disabled header rules', () => {
            proxyService.headerRules = [{ id: 'hr-1', isEnabled: false, domains: [] }];
            proxyService.ruleStore.rules = [{ enabled: true, headerRuleId: 'hr-1' }];
            expect(proxyService.getApplicableRules('https://example.com')).toEqual([]);
        });

        it('filters by domain when header rule has domains', () => {
            proxyService.headerRules = [{ id: 'hr-1', isEnabled: true, domains: ['api.example.com'] }];
            proxyService.ruleStore.rules = [{ enabled: true, headerRuleId: 'hr-1' }];

            expect(proxyService.getApplicableRules('https://api.example.com/v1')).toHaveLength(1);
            expect(proxyService.getApplicableRules('https://other.com/v1')).toHaveLength(0);
        });

        it('resolves environment variables in domain patterns', () => {
            proxyService.environmentVariables = { API_DOMAIN: 'api.example.com' };
            proxyService.headerRules = [{ id: 'hr-1', isEnabled: true, domains: ['{{API_DOMAIN}}'] }];
            proxyService.ruleStore.rules = [{ enabled: true, headerRuleId: 'hr-1' }];

            expect(proxyService.getApplicableRules('https://api.example.com/v1')).toHaveLength(1);
        });

        it('handles comma-separated domains from env variable', () => {
            proxyService.environmentVariables = { DOMAINS: 'api.example.com,cdn.example.com' };
            proxyService.headerRules = [{ id: 'hr-1', isEnabled: true, domains: ['{{DOMAINS}}'] }];
            proxyService.ruleStore.rules = [{ enabled: true, headerRuleId: 'hr-1' }];

            expect(proxyService.getApplicableRules('https://api.example.com/v1')).toHaveLength(1);
            expect(proxyService.getApplicableRules('https://cdn.example.com/v1')).toHaveLength(1);
            expect(proxyService.getApplicableRules('https://other.com/v1')).toHaveLength(0);
        });

        it('matches custom proxy rules (no header rule reference)', () => {
            proxyService.ruleStore.rules = [{ enabled: true, headerName: 'X-Custom', headerValue: 'val', domains: [] }];
            expect(proxyService.getApplicableRules('https://anything.com')).toHaveLength(1);
        });

        it('filters custom proxy rules by domain', () => {
            proxyService.ruleStore.rules = [{ enabled: true, headerName: 'X-Custom', headerValue: 'val', domains: ['specific.com'] }];
            expect(proxyService.getApplicableRules('https://specific.com/path')).toHaveLength(1);
            expect(proxyService.getApplicableRules('https://other.com/path')).toHaveLength(0);
        });
    });

    // ── clearRules ──────────────────────────────────────────────────

    describe('clearRules()', () => {
        it('clears all rules, sources, and environment variables', () => {
            proxyService.headerRules = [{ id: '1' }];
            proxyService.sources.set('1', 'val');
            proxyService.environmentVariables = { KEY: 'val' };

            proxyService.clearRules();

            expect(proxyService.headerRules).toEqual([]);
            expect(proxyService.sources.size).toBe(0);
            expect(proxyService.environmentVariables).toEqual({});
        });
    });

    // ── getStatus ───────────────────────────────────────────────────

    describe('getStatus()', () => {
        it('returns current state', () => {
            proxyService.headerRules = [{ id: '1' }, { id: '2' }];
            proxyService.sources.set('1', 'val');
            const status = proxyService.getStatus();

            expect(status.running).toBe(false);
            expect(status.port).toBe(proxyService.port);
            expect(status.rulesCount).toBe(2);
            expect(status.sourcesCount).toBe(1);
            expect(status.cacheEnabled).toBe(true);
            expect(status.strictSSL).toBe(false);
            expect(status.stats).toEqual({ requestsProcessed: 0, cacheHits: 0, cacheMisses: 0, errors: 0 });
        });
    });

    // ── Certificate management ──────────────────────────────────────

    describe('certificate management', () => {
        it('addTrustedCertificate / removeTrustedCertificate', () => {
            proxyService.addTrustedCertificate('abc123');
            expect(proxyService.trustedCertificates.has('abc123')).toBe(true);

            proxyService.removeTrustedCertificate('abc123');
            expect(proxyService.trustedCertificates.has('abc123')).toBe(false);
        });

        it('addCertificateException / removeCertificateException', () => {
            proxyService.addCertificateException('example.com', 'fp-1');
            proxyService.addCertificateException('example.com', 'fp-2');

            const info = proxyService.getCertificateInfo();
            const entry = info.certificateExceptions.find((e: any) => e.domain === 'example.com');
            expect(entry.fingerprints).toContain('fp-1');
            expect(entry.fingerprints).toContain('fp-2');

            proxyService.removeCertificateException('example.com');
            expect(proxyService.getCertificateInfo().certificateExceptions).toHaveLength(0);
        });

        it('setStrictSSL updates flag and agent', () => {
            proxyService.httpsAgent = { options: { rejectUnauthorized: false } };

            proxyService.setStrictSSL(true);
            expect(proxyService.strictSSL).toBe(true);
            expect(proxyService.httpsAgent.options.rejectUnauthorized).toBe(true);

            proxyService.setStrictSSL(false);
            expect(proxyService.strictSSL).toBe(false);
            expect(proxyService.httpsAgent.options.rejectUnauthorized).toBe(false);
        });
    });

    // ── start / stop lifecycle ──────────────────────────────────────

    describe('server lifecycle', () => {
        it('starts and stops the proxy server', async () => {
            const result = await proxyService.start(49999);
            expect(result.success).toBe(true);
            expect(proxyService.isRunning).toBe(true);

            const stopResult = await proxyService.stop();
            expect(stopResult.success).toBe(true);
            expect(proxyService.isRunning).toBe(false);
        });

        it('returns success when already running', async () => {
            await proxyService.start(49999);
            const result = await proxyService.start(49999);
            expect(result.success).toBe(true);
        });

        it('returns success when stopping while not running', async () => {
            const result = await proxyService.stop();
            expect(result.success).toBe(true);
        });
    });

    // ── handleRequest URL parsing ───────────────────────────────────

    describe('handleRequest() URL routing', () => {
        it('rejects non-proxy URLs with 400', async () => {
            const res = createMockResponse();
            await proxyService.handleRequest({ method: 'GET', url: '/not-a-proxy-url', headers: {} }, res);
            expect(res.statusCode).toBe(400);
        });

        it('responds to OPTIONS with CORS headers', async () => {
            const res = createMockResponse();
            await proxyService.handleRequest({ method: 'OPTIONS', url: '/', headers: {} }, res);
            expect(res.statusCode).toBe(200);
            expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
        });

        it('increments requestsProcessed counter', async () => {
            proxyService.cacheEnabled = false;
            const originalDoProxy = proxyService.doProxy;
            proxyService.doProxy = vi.fn();

            const res = createMockResponse();
            await proxyService.handleRequest({ method: 'GET', url: 'https://example.com', headers: {}, on: vi.fn() }, res);
            expect(proxyService.stats.requestsProcessed).toBe(1);

            proxyService.doProxy = originalDoProxy;
        });
    });
});
