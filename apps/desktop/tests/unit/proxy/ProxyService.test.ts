import type { HeaderRule, Source } from '@openheaders/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProxyService, ProxyStatus } from '@/services/proxy/ProxyService';
import type { ProxyRule } from '@/types/proxy';

// Mock atomicFileWriter (ProxyCache and ProxyRuleStore use it for disk I/O)
vi.mock('@/utils/atomicFileWriter', () => ({
  default: { readJson: () => Promise.resolve(null), writeJson: () => Promise.resolve() },
  readJson: () => Promise.resolve(null),
  writeJson: () => Promise.resolve(),
}));

let proxyService: ProxyService;

beforeAll(async () => {
  const mod = await import('../../../src/services/proxy/ProxyService');
  proxyService = mod.proxyService || mod.default;
});

interface MockResponse {
  statusCode: number | null;
  headers: Record<string, string>;
  body: string;
  headersSent: boolean;
  writeHead(code: number, headers?: Record<string, string>): void;
  end(data?: string): void;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: null,
    headers: {},
    body: '',
    headersSent: false,
    writeHead(code: number, headers?: Record<string, string>) {
      res.statusCode = code;
      Object.assign(res.headers, headers || {});
      res.headersSent = true;
    },
    end(data?: string) {
      res.body = data || '';
    },
  };
  return res;
}

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

/** Create a realistic Source */
function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    sourceId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    sourceType: 'http',
    sourcePath: 'https://auth.internal.openheaders.io:8443/oauth2/token',
    sourceMethod: 'POST',
    sourceName: 'Production API Gateway Token',
    sourceTag: 'production',
    sourceContent: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzZXJ2aWNlLWFjY291bnRAYWNtZS5jb20ifQ.sig',
    createdAt: '2025-11-15T09:30:00.000Z',
    updatedAt: '2026-01-20T14:45:12.345Z',
    ...overrides,
  };
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
      proxyService.environmentVariables = { API_KEY: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc' };
      expect(proxyService.resolveEnvironmentVariables('Bearer {{API_KEY}}')).toBe(
        'Bearer ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
      );
    });

    it('replaces multiple variables in one string', () => {
      proxyService.environmentVariables = {
        AUTH_HOST: 'auth.internal.openheaders.io',
        AUTH_PORT: '8443',
      };
      expect(proxyService.resolveEnvironmentVariables('https://{{AUTH_HOST}}:{{AUTH_PORT}}/oauth2/token')).toBe(
        'https://auth.internal.openheaders.io:8443/oauth2/token',
      );
    });

    it('keeps placeholder when variable is not defined', () => {
      proxyService.environmentVariables = {};
      expect(proxyService.resolveEnvironmentVariables('{{MISSING_VAR}}')).toBe('{{MISSING_VAR}}');
    });

    it('trims whitespace inside braces', () => {
      proxyService.environmentVariables = { TOKEN: 'abc123' };
      expect(proxyService.resolveEnvironmentVariables('{{ TOKEN }}')).toBe('abc123');
    });

    it('returns non-string input unchanged', () => {
      expect(proxyService.resolveEnvironmentVariables(null as unknown as string)).toBeNull();
      expect(proxyService.resolveEnvironmentVariables(undefined as unknown as string)).toBeUndefined();
      expect(proxyService.resolveEnvironmentVariables(42 as unknown as string)).toBe(42);
    });

    it('returns plain string unchanged', () => {
      expect(proxyService.resolveEnvironmentVariables('no variables here')).toBe('no variables here');
    });

    it('resolves empty string variable to empty string', () => {
      proxyService.environmentVariables = { EMPTY: '' };
      expect(proxyService.resolveEnvironmentVariables('prefix-{{EMPTY}}-suffix')).toBe('prefix--suffix');
    });

    it('handles variable names with underscores and numbers', () => {
      proxyService.environmentVariables = { API_KEY_V2: 'key-v2', DB_HOST_1: 'db1.openheaders.io' };
      expect(proxyService.resolveEnvironmentVariables('{{API_KEY_V2}} @ {{DB_HOST_1}}')).toBe(
        'key-v2 @ db1.openheaders.io',
      );
    });

    it('resolves only matching variables, keeps unresolved ones', () => {
      proxyService.environmentVariables = { FOUND: 'yes' };
      expect(proxyService.resolveEnvironmentVariables('{{FOUND}}-{{NOT_FOUND}}')).toBe('yes-{{NOT_FOUND}}');
    });
  });

  // ── updateEnvironmentVariables ──────────────────────────────────

  describe('updateEnvironmentVariables()', () => {
    it('extracts values from {value: ...} objects', () => {
      proxyService.updateEnvironmentVariables({
        API_KEY: { value: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc' },
        AUTH_HOST: { value: 'auth.internal.openheaders.io:8443' },
      });
      expect(proxyService.environmentVariables).toEqual({
        API_KEY: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
        AUTH_HOST: 'auth.internal.openheaders.io:8443',
      });
    });

    it('accepts direct string values', () => {
      proxyService.updateEnvironmentVariables({
        JWT_SECRET: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.sig',
      });
      expect(proxyService.environmentVariables).toEqual({
        JWT_SECRET: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.sig',
      });
    });

    it('handles mixed formats (object and string values)', () => {
      proxyService.updateEnvironmentVariables({
        FROM_OBJECT: { value: 'obj-val' },
        DIRECT_STRING: 'str-val',
      });
      expect(proxyService.environmentVariables).toEqual({
        FROM_OBJECT: 'obj-val',
        DIRECT_STRING: 'str-val',
      });
    });

    it('handles null input gracefully', () => {
      proxyService.updateEnvironmentVariables(null);
      expect(proxyService.environmentVariables).toEqual({});
    });

    it('handles undefined input gracefully', () => {
      proxyService.updateEnvironmentVariables(undefined);
      expect(proxyService.environmentVariables).toEqual({});
    });

    it('replaces all previous variables', () => {
      proxyService.environmentVariables = { OLD_VAR: 'old-value' };
      proxyService.updateEnvironmentVariables({ NEW_VAR: 'new-value' });
      expect(proxyService.environmentVariables).toEqual({ NEW_VAR: 'new-value' });
      expect(proxyService.environmentVariables).not.toHaveProperty('OLD_VAR');
    });
  });

  // ── updateSource / updateSources ────────────────────────────────

  describe('source management', () => {
    it('updateSource stores value by string ID (number converted)', () => {
      proxyService.updateSource(42, 'eyJhbGciOiJSUzI1NiJ9.token-body.sig');
      expect(proxyService.sources.get('42')).toBe('eyJhbGciOiJSUzI1NiJ9.token-body.sig');
    });

    it('updateSource stores value by string ID directly', () => {
      proxyService.updateSource('c3d4e5f6-a7b8-9012-cdef-123456789012', 'token-value');
      expect(proxyService.sources.get('c3d4e5f6-a7b8-9012-cdef-123456789012')).toBe('token-value');
    });

    it('updateSource overwrites existing value', () => {
      proxyService.updateSource('src-1', 'old-token');
      proxyService.updateSource('src-1', 'new-token');
      expect(proxyService.sources.get('src-1')).toBe('new-token');
    });

    it('updateSources loads from Source array', () => {
      proxyService.updateSources([
        makeSource({ sourceId: 'src-alpha', sourceContent: 'token-alpha' }),
        makeSource({ sourceId: 'src-beta', sourceContent: 'token-beta' }),
      ]);
      expect(proxyService.sources.get('src-alpha')).toBe('token-alpha');
      expect(proxyService.sources.get('src-beta')).toBe('token-beta');
    });

    it('updateSources skips entries without sourceId', () => {
      proxyService.updateSources([
        { sourceContent: 'orphan' } as unknown as Source,
        makeSource({ sourceId: 'valid', sourceContent: 'valid-token' }),
      ]);
      expect(proxyService.sources.size).toBe(1);
      expect(proxyService.sources.get('valid')).toBe('valid-token');
    });

    it('updateSources skips entries without sourceContent', () => {
      proxyService.updateSources([
        makeSource({ sourceId: 'no-content', sourceContent: undefined }),
        makeSource({ sourceId: 'with-content', sourceContent: 'has-token' }),
      ]);
      // sourceContent is undefined → falsy, so it's skipped
      expect(proxyService.sources.has('no-content')).toBe(false);
      expect(proxyService.sources.get('with-content')).toBe('has-token');
    });

    it('updateSources skips entries with null sourceContent', () => {
      proxyService.updateSources([makeSource({ sourceId: 'null-content', sourceContent: null })]);
      expect(proxyService.sources.has('null-content')).toBe(false);
    });

    it('updateSources ignores non-array input', () => {
      proxyService.updateSources('not an array' as unknown as Source[]);
      expect(proxyService.sources.size).toBe(0);
    });
  });

  // ── resolveHeaderValue ──────────────────────────────────────────

  describe('resolveHeaderValue()', () => {
    it('resolves dynamic rule from source by sourceId', () => {
      proxyService.sources.set('10', 'eyJhbGciOiJSUzI1NiJ9.resolved-source-token');
      const rule = makeHeaderRule({ isDynamic: true, sourceId: 10 });
      expect(proxyService.resolveHeaderValue('fallback', rule)).toBe('eyJhbGciOiJSUzI1NiJ9.resolved-source-token');
    });

    it('returns fallback for dynamic rule when source is missing', () => {
      const rule = makeHeaderRule({ isDynamic: true, sourceId: 999 });
      expect(proxyService.resolveHeaderValue('fallback-value', rule)).toBe('fallback-value');
    });

    it('returns empty string for dynamic rule when both source and fallback are missing', () => {
      const rule = makeHeaderRule({ isDynamic: true, sourceId: 999 });
      expect(proxyService.resolveHeaderValue(undefined, rule)).toBe('');
    });

    it('resolves __source_N legacy reference', () => {
      proxyService.sources.set('5', 'legacy-resolved-value');
      const rule = makeHeaderRule();
      expect(proxyService.resolveHeaderValue('__source_5', rule)).toBe('legacy-resolved-value');
    });

    it('keeps __source_N if source not found', () => {
      const rule = makeHeaderRule();
      expect(proxyService.resolveHeaderValue('__source_999', rule)).toBe('__source_999');
    });

    it('resolves environment variables in static values', () => {
      proxyService.environmentVariables = { TOKEN: 'env-resolved-xyz' };
      const rule = makeHeaderRule();
      expect(proxyService.resolveHeaderValue('Bearer {{TOKEN}}', rule)).toBe('Bearer env-resolved-xyz');
    });

    it('returns empty string for undefined values on non-dynamic rule', () => {
      const rule = makeHeaderRule();
      expect(proxyService.resolveHeaderValue(undefined, rule)).toBe('');
    });

    it('resolves dynamic rule with string sourceId', () => {
      proxyService.sources.set('uuid-source', 'uuid-token');
      const rule = makeHeaderRule({ isDynamic: true, sourceId: 'uuid-source' });
      expect(proxyService.resolveHeaderValue('', rule)).toBe('uuid-token');
    });
  });

  // ── getApplicableRules ──────────────────────────────────────────

  describe('getApplicableRules()', () => {
    it('returns empty array when no rules exist', () => {
      expect(proxyService.getApplicableRules('https://api.openheaders.io/v2/resource')).toEqual([]);
    });

    it('matches header rule via proxy rule reference (no domain filter)', () => {
      proxyService.headerRules = [makeHeaderRule({ id: 'hr-prod', isEnabled: true, domains: [] })];
      proxyService.ruleStore.rules = [makeProxyRule({ enabled: true, headerRuleId: 'hr-prod' })];

      const result = proxyService.getApplicableRules('https://api.openheaders.io/v2/resource');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('hr-prod');
    });

    it('skips disabled proxy rules', () => {
      proxyService.headerRules = [makeHeaderRule({ id: 'hr-1', isEnabled: true, domains: [] })];
      proxyService.ruleStore.rules = [makeProxyRule({ enabled: false, headerRuleId: 'hr-1' })];
      expect(proxyService.getApplicableRules('https://api.openheaders.io')).toEqual([]);
    });

    it('skips disabled header rules', () => {
      proxyService.headerRules = [makeHeaderRule({ id: 'hr-1', isEnabled: false, domains: [] })];
      proxyService.ruleStore.rules = [makeProxyRule({ enabled: true, headerRuleId: 'hr-1' })];
      expect(proxyService.getApplicableRules('https://api.openheaders.io')).toEqual([]);
    });

    it('filters by domain when header rule has domains', () => {
      proxyService.headerRules = [
        makeHeaderRule({
          id: 'hr-scoped',
          isEnabled: true,
          domains: ['api.openheaders.io'],
        }),
      ];
      proxyService.ruleStore.rules = [makeProxyRule({ enabled: true, headerRuleId: 'hr-scoped' })];

      expect(proxyService.getApplicableRules('https://api.openheaders.io/v2/users')).toHaveLength(1);
      expect(proxyService.getApplicableRules('https://api.partners.openheaders.io/v1')).toHaveLength(0);
    });

    it('matches wildcard domain patterns in header rules', () => {
      proxyService.headerRules = [
        makeHeaderRule({
          id: 'hr-wildcard',
          isEnabled: true,
          domains: ['*.openheaders.io'],
        }),
      ];
      proxyService.ruleStore.rules = [makeProxyRule({ enabled: true, headerRuleId: 'hr-wildcard' })];

      expect(proxyService.getApplicableRules('https://api.openheaders.io/v1')).toHaveLength(1);
      expect(proxyService.getApplicableRules('https://staging.api.openheaders.io/v1')).toHaveLength(1);
      expect(proxyService.getApplicableRules('https://evil.notrelated.com/')).toHaveLength(0);
    });

    it('resolves environment variables in domain patterns', () => {
      proxyService.environmentVariables = { API_DOMAIN: 'api.openheaders.io' };
      proxyService.headerRules = [
        makeHeaderRule({
          id: 'hr-env',
          isEnabled: true,
          domains: ['{{API_DOMAIN}}'],
        }),
      ];
      proxyService.ruleStore.rules = [makeProxyRule({ enabled: true, headerRuleId: 'hr-env' })];

      expect(proxyService.getApplicableRules('https://api.openheaders.io/v1')).toHaveLength(1);
    });

    it('handles comma-separated domains from env variable', () => {
      proxyService.environmentVariables = {
        ALLOWED_DOMAINS: 'api.openheaders.io,cdn.openheaders.io,auth.internal.openheaders.io',
      };
      proxyService.headerRules = [
        makeHeaderRule({
          id: 'hr-multi',
          isEnabled: true,
          domains: ['{{ALLOWED_DOMAINS}}'],
        }),
      ];
      proxyService.ruleStore.rules = [makeProxyRule({ enabled: true, headerRuleId: 'hr-multi' })];

      expect(proxyService.getApplicableRules('https://api.openheaders.io/v1')).toHaveLength(1);
      expect(proxyService.getApplicableRules('https://cdn.openheaders.io/assets')).toHaveLength(1);
      expect(proxyService.getApplicableRules('https://auth.internal.openheaders.io/token')).toHaveLength(1);
      expect(proxyService.getApplicableRules('https://other.notmatched.com/')).toHaveLength(0);
    });

    it('matches custom proxy rules (no headerRuleId)', () => {
      proxyService.ruleStore.rules = [
        makeProxyRule({
          enabled: true,
          headerName: 'X-Custom-Header',
          headerValue: 'custom-value',
          domains: [],
        }),
      ];
      expect(proxyService.getApplicableRules('https://any-domain.com')).toHaveLength(1);
    });

    it('filters custom proxy rules by domain', () => {
      proxyService.ruleStore.rules = [
        makeProxyRule({
          enabled: true,
          headerName: 'X-Api-Key',
          headerValue: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
          domains: ['api.openheaders.io'],
        }),
      ];
      expect(proxyService.getApplicableRules('https://api.openheaders.io/v2')).toHaveLength(1);
      expect(proxyService.getApplicableRules('https://other.notmatched.com/')).toHaveLength(0);
    });

    it('returns multiple matching rules for the same URL', () => {
      proxyService.headerRules = [
        makeHeaderRule({ id: 'hr-auth', headerName: 'Authorization', headerValue: 'Bearer token', domains: [] }),
        makeHeaderRule({ id: 'hr-custom', headerName: 'X-Request-ID', headerValue: 'req-123', domains: [] }),
      ];
      proxyService.ruleStore.rules = [
        makeProxyRule({ id: 'pr-1', enabled: true, headerRuleId: 'hr-auth' }),
        makeProxyRule({ id: 'pr-2', enabled: true, headerRuleId: 'hr-custom' }),
      ];

      const result = proxyService.getApplicableRules('https://api.openheaders.io/v2');
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['hr-auth', 'hr-custom']);
    });

    it('skips proxy rule referencing non-existent header rule', () => {
      proxyService.headerRules = [];
      proxyService.ruleStore.rules = [makeProxyRule({ enabled: true, headerRuleId: 'non-existent' })];
      expect(proxyService.getApplicableRules('https://api.openheaders.io')).toEqual([]);
    });
  });

  // ── clearRules ──────────────────────────────────────────────────

  describe('clearRules()', () => {
    it('clears all rules, sources, and environment variables', () => {
      proxyService.headerRules = [makeHeaderRule({ id: 'hr-1' }), makeHeaderRule({ id: 'hr-2' })];
      proxyService.sources.set('src-1', 'token-a');
      proxyService.sources.set('src-2', 'token-b');
      proxyService.environmentVariables = {
        API_KEY: 'ohk_live_key',
        AUTH_HOST: 'auth.openheaders.io',
      };

      proxyService.clearRules();

      expect(proxyService.headerRules).toEqual([]);
      expect(proxyService.sources.size).toBe(0);
      expect(proxyService.environmentVariables).toEqual({});
    });
  });

  // ── getStatus ───────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('returns full status object with all fields', () => {
      proxyService.headerRules = [
        makeHeaderRule({ id: 'hr-1' }),
        makeHeaderRule({ id: 'hr-2' }),
        makeHeaderRule({ id: 'hr-3' }),
      ];
      proxyService.sources.set('src-1', 'token-a');
      proxyService.sources.set('src-2', 'token-b');
      proxyService.cacheEnabled = true;
      proxyService.strictSSL = false;
      proxyService.trustedCertificates = new Set(['fp-1']);
      proxyService.certificateExceptions = new Map([['proxy.openheaders.io', new Set(['fp-2'])]]);
      proxyService.stats = { requestsProcessed: 42, cacheHits: 10, cacheMisses: 32, errors: 3 };

      const status: ProxyStatus = proxyService.getStatus();

      expect(status).toEqual({
        running: false,
        port: proxyService.port,
        rulesCount: 3,
        sourcesCount: 2,
        cacheEnabled: true,
        cacheSize: 0,
        stats: { requestsProcessed: 42, cacheHits: 10, cacheMisses: 32, errors: 3 },
        strictSSL: false,
        trustedCertificates: 1,
        certificateExceptions: 1,
      });
    });

    it('returns a copy of stats (not a reference)', () => {
      const status = proxyService.getStatus();
      status.stats.requestsProcessed = 999;
      expect(proxyService.stats.requestsProcessed).toBe(0);
    });
  });

  // ── Certificate management ──────────────────────────────────────

  describe('certificate management', () => {
    it('addTrustedCertificate and removeTrustedCertificate', () => {
      const fingerprint = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      proxyService.addTrustedCertificate(fingerprint);
      expect(proxyService.trustedCertificates.has(fingerprint)).toBe(true);

      proxyService.removeTrustedCertificate(fingerprint);
      expect(proxyService.trustedCertificates.has(fingerprint)).toBe(false);
    });

    it('addCertificateException accumulates fingerprints per domain', () => {
      proxyService.addCertificateException('api.openheaders.io', 'fp-sha256-aaa');
      proxyService.addCertificateException('api.openheaders.io', 'fp-sha256-bbb');
      proxyService.addCertificateException('cdn.openheaders.io', 'fp-sha256-ccc');

      const info = proxyService.getCertificateInfo();
      expect(info.strictSSL).toBe(false);
      expect(info.trustedCertificates).toEqual([]);

      const apiEntry = info.certificateExceptions.find(
        (e: { domain: string; fingerprints: string[] }) => e.domain === 'api.openheaders.io',
      );
      expect(apiEntry!.fingerprints).toContain('fp-sha256-aaa');
      expect(apiEntry!.fingerprints).toContain('fp-sha256-bbb');
      expect(apiEntry!.fingerprints).toHaveLength(2);

      const cdnEntry = info.certificateExceptions.find(
        (e: { domain: string; fingerprints: string[] }) => e.domain === 'cdn.openheaders.io',
      );
      expect(cdnEntry!.fingerprints).toEqual(['fp-sha256-ccc']);
    });

    it('removeCertificateException removes all fingerprints for a domain', () => {
      proxyService.addCertificateException('api.openheaders.io', 'fp-1');
      proxyService.addCertificateException('api.openheaders.io', 'fp-2');

      proxyService.removeCertificateException('api.openheaders.io');
      expect(proxyService.getCertificateInfo().certificateExceptions).toHaveLength(0);
    });

    it('setStrictSSL updates flag and agent options', () => {
      proxyService.httpsAgent = { options: { rejectUnauthorized: false } } as unknown as typeof proxyService.httpsAgent;

      proxyService.setStrictSSL(true);
      expect(proxyService.strictSSL).toBe(true);
      expect(proxyService.httpsAgent!.options.rejectUnauthorized).toBe(true);

      proxyService.setStrictSSL(false);
      expect(proxyService.strictSSL).toBe(false);
      expect(proxyService.httpsAgent!.options.rejectUnauthorized).toBe(false);
    });

    it('getCertificateInfo returns full certificate state', () => {
      proxyService.strictSSL = true;
      proxyService.addTrustedCertificate('global-fp-1');
      proxyService.addTrustedCertificate('global-fp-2');
      proxyService.addCertificateException('api.openheaders.io', 'domain-fp-1');

      const info = proxyService.getCertificateInfo();
      expect(info.strictSSL).toBe(true);
      expect(info.trustedCertificates).toEqual(['global-fp-1', 'global-fp-2']);
      expect(info.certificateExceptions).toHaveLength(1);
      expect(info.certificateExceptions[0].domain).toBe('api.openheaders.io');
      expect(info.certificateExceptions[0].fingerprints).toEqual(['domain-fp-1']);
    });
  });

  // ── start / stop lifecycle ──────────────────────────────────────

  describe('server lifecycle', () => {
    it('starts and stops the proxy server', async () => {
      const result = await proxyService.start(49999);
      expect(result).toEqual({ success: true, port: 49999 });
      expect(proxyService.isRunning).toBe(true);

      const stopResult = await proxyService.stop();
      expect(stopResult).toEqual({ success: true });
      expect(proxyService.isRunning).toBe(false);
    });

    it('returns success when already running', async () => {
      await proxyService.start(49998);
      const result = await proxyService.start(49998);
      expect(result.success).toBe(true);
      expect(result.port).toBeDefined();
    });

    it('returns success when stopping while not running', async () => {
      const result = await proxyService.stop();
      expect(result).toEqual({ success: true });
    });
  });

  // ── handleRequest URL parsing ───────────────────────────────────

  describe('handleRequest() URL routing', () => {
    it('rejects non-proxy URLs with 400 and helpful error message', async () => {
      const res = createMockResponse();
      await proxyService.handleRequest(
        { method: 'GET', url: '/not-a-proxy-url', headers: {} } as Parameters<typeof proxyService.handleRequest>[0],
        res as unknown as Parameters<typeof proxyService.handleRequest>[1],
      );
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('Invalid proxy request');
      expect(res.body).toContain('http://');
    });

    it('strips leading slash from URL (e.g., /https://...)', async () => {
      proxyService.cacheEnabled = false;
      const originalDoProxy = proxyService.doProxy;
      let capturedUrl = '';
      proxyService.doProxy = vi.fn((_req, _res, url) => {
        capturedUrl = url;
      }) as typeof proxyService.doProxy;

      const res = createMockResponse();
      await proxyService.handleRequest(
        { method: 'GET', url: '/https://api.openheaders.io/v2', headers: {}, on: vi.fn() } as unknown as Parameters<
          typeof proxyService.handleRequest
        >[0],
        res as unknown as Parameters<typeof proxyService.handleRequest>[1],
      );
      expect(capturedUrl).toBe('https://api.openheaders.io/v2');

      proxyService.doProxy = originalDoProxy;
    });

    it('responds to OPTIONS with CORS headers', async () => {
      const res = createMockResponse();
      await proxyService.handleRequest(
        {
          method: 'OPTIONS',
          url: '/',
          headers: { 'access-control-request-headers': 'Authorization, X-Custom-Header' },
        } as unknown as Parameters<typeof proxyService.handleRequest>[0],
        res as unknown as Parameters<typeof proxyService.handleRequest>[1],
      );
      expect(res.statusCode).toBe(200);
      expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(res.headers['Access-Control-Allow-Methods']).toContain('GET');
      expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
      expect(res.headers['Access-Control-Allow-Methods']).toContain('PUT');
      expect(res.headers['Access-Control-Allow-Methods']).toContain('DELETE');
      expect(res.headers['Access-Control-Allow-Methods']).toContain('OPTIONS');
      expect(res.headers['Access-Control-Allow-Headers']).toBe('Authorization, X-Custom-Header');
      expect(res.headers['Access-Control-Max-Age']).toBe('86400');
    });

    it('OPTIONS uses * as default allow-headers when request header is missing', async () => {
      const res = createMockResponse();
      await proxyService.handleRequest(
        { method: 'OPTIONS', url: '/', headers: {} } as unknown as Parameters<typeof proxyService.handleRequest>[0],
        res as unknown as Parameters<typeof proxyService.handleRequest>[1],
      );
      expect(res.statusCode).toBe(200);
      expect(res.headers['Access-Control-Allow-Headers']).toBe('*');
    });

    it('increments requestsProcessed counter on valid proxy URL', async () => {
      proxyService.cacheEnabled = false;
      const originalDoProxy = proxyService.doProxy;
      proxyService.doProxy = vi.fn() as typeof proxyService.doProxy;

      const res = createMockResponse();
      await proxyService.handleRequest(
        { method: 'GET', url: 'https://api.openheaders.io/v2', headers: {}, on: vi.fn() } as unknown as Parameters<
          typeof proxyService.handleRequest
        >[0],
        res as unknown as Parameters<typeof proxyService.handleRequest>[1],
      );
      expect(proxyService.stats.requestsProcessed).toBe(1);

      proxyService.doProxy = originalDoProxy;
    });

    it('does NOT increment requestsProcessed on OPTIONS', async () => {
      const res = createMockResponse();
      await proxyService.handleRequest(
        { method: 'OPTIONS', url: '/', headers: {} } as unknown as Parameters<typeof proxyService.handleRequest>[0],
        res as unknown as Parameters<typeof proxyService.handleRequest>[1],
      );
      expect(proxyService.stats.requestsProcessed).toBe(0);
    });

    it('does NOT increment requestsProcessed on 400 rejection', async () => {
      const res = createMockResponse();
      await proxyService.handleRequest(
        { method: 'GET', url: '/invalid', headers: {} } as unknown as Parameters<typeof proxyService.handleRequest>[0],
        res as unknown as Parameters<typeof proxyService.handleRequest>[1],
      );
      expect(proxyService.stats.requestsProcessed).toBe(0);
    });
  });

  // ── updateHeaderRules ──────────────────────────────────────────

  describe('updateHeaderRules()', () => {
    it('replaces all header rules', () => {
      const rules = [
        makeHeaderRule({ id: 'hr-1', headerName: 'Authorization' }),
        makeHeaderRule({ id: 'hr-2', headerName: 'X-Api-Key' }),
      ];
      proxyService.updateHeaderRules(rules);
      expect(proxyService.headerRules).toEqual(rules);
      expect(proxyService.headerRules).toHaveLength(2);
    });

    it('handles null input', () => {
      proxyService.headerRules = [makeHeaderRule()];
      proxyService.updateHeaderRules(null as unknown as HeaderRule[]);
      expect(proxyService.headerRules).toEqual([]);
    });
  });

  // ── saveRule / deleteRule / getRules ────────────────────────────

  describe('rule CRUD via ProxyService', () => {
    it('saveRule returns success', async () => {
      const result = await proxyService.saveRule(
        makeProxyRule({
          id: 'new-rule',
          headerName: 'X-Test',
          headerValue: 'test-value',
        }),
      );
      expect(result).toEqual({ success: true });
      expect(proxyService.getRules()).toHaveLength(1);
    });

    it('deleteRule returns success', async () => {
      proxyService.ruleStore.rules = [makeProxyRule({ id: 'to-delete' })];
      const result = await proxyService.deleteRule('to-delete');
      expect(result).toEqual({ success: true });
      expect(proxyService.getRules()).toHaveLength(0);
    });

    it('getRules returns current rules', () => {
      proxyService.ruleStore.rules = [makeProxyRule({ id: 'r1' }), makeProxyRule({ id: 'r2' })];
      expect(proxyService.getRules()).toHaveLength(2);
    });
  });

  // ── cache management ──────────────────────────────────────────

  describe('cache management', () => {
    it('setCacheEnabled toggles caching', () => {
      proxyService.setCacheEnabled(false);
      expect(proxyService.cacheEnabled).toBe(false);

      proxyService.setCacheEnabled(true);
      expect(proxyService.cacheEnabled).toBe(true);
    });
  });
});
