import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the logger
vi.mock('@/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const TemplateResolver = (await import('../../../../src/renderer/services/environment/TemplateResolver')).default;

type ResolveResult = { resolved: string; missingVars: string[]; hasAllVars: boolean };

function asResult(val: unknown): ResolveResult {
  return val as ResolveResult;
}

// Enterprise-like variable sets
const ENTERPRISE_VARS: Record<string, string> = {
  API_URL: 'https://api.openheaders.io',
  AUTH_URL: 'https://auth.openheaders.internal:8443/oauth2/token',
  API_KEY: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
  BEARER_TOKEN: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig',
  TENANT_ID: 'org-openheaders-prod',
  ENVIRONMENT: 'production',
  REGION: 'eu-west-1',
};

describe('TemplateResolver', () => {
  let resolver: InstanceType<typeof TemplateResolver>;

  beforeEach(() => {
    resolver = new TemplateResolver();
  });

  // ------------------------------------------------------------------
  // resolveTemplate
  // ------------------------------------------------------------------
  describe('resolveTemplate', () => {
    it('resolves single variable', () => {
      const result = asResult(resolver.resolveTemplate('Hello {{name}}', { name: 'World' }));
      expect(result).toEqual({
        resolved: 'Hello World',
        missingVars: [],
        hasAllVars: true,
      });
    });

    it('resolves multiple variables', () => {
      const result = asResult(resolver.resolveTemplate('{{a}} and {{b}}', { a: 'X', b: 'Y' }));
      expect(result.resolved).toBe('X and Y');
      expect(result.hasAllVars).toBe(true);
    });

    it('resolves enterprise URL template', () => {
      const result = asResult(
        resolver.resolveTemplate('{{API_URL}}/v2/workspaces/{{TENANT_ID}}/config', ENTERPRISE_VARS),
      );
      expect(result.resolved).toBe('https://api.openheaders.io/v2/workspaces/org-openheaders-prod/config');
      expect(result.hasAllVars).toBe(true);
    });

    it('resolves enterprise auth header template', () => {
      const result = asResult(resolver.resolveTemplate('{{BEARER_TOKEN}}', ENTERPRISE_VARS));
      expect(result.resolved).toBe('Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig');
    });

    it('uses empty default value for missing vars', () => {
      const result = asResult(resolver.resolveTemplate('{{missing}}', {}));
      expect(result).toEqual({
        resolved: '',
        missingVars: ['missing'],
        hasAllVars: false,
      });
    });

    it('uses custom default value', () => {
      const result = asResult(resolver.resolveTemplate('{{x}}', {}, { defaultValue: 'N/A' }));
      expect(result.resolved).toBe('N/A');
    });

    it('tracks all missing vars', () => {
      const result = asResult(resolver.resolveTemplate('{{a}} {{b}} {{c}}', { b: 'ok' }));
      expect(result.resolved).toBe(' ok ');
      expect(result.missingVars).toEqual(['a', 'c']);
      expect(result.hasAllVars).toBe(false);
    });

    it('throws on missing when throwOnMissing is true', () => {
      expect(() => resolver.resolveTemplate('{{MISSING_VAR}}', {}, { throwOnMissing: true })).toThrow(
        "Variable 'MISSING_VAR' not found",
      );
    });

    it('returns null as-is for null template', () => {
      expect(resolver.resolveTemplate(null, {})).toBeNull();
    });

    it('returns empty string template unchanged', () => {
      expect(resolver.resolveTemplate('', {})).toBe('');
    });

    it('returns non-string input unchanged', () => {
      expect(resolver.resolveTemplate(undefined as unknown as string, {})).toBeUndefined();
    });

    it('handles template with no variables', () => {
      const result = asResult(resolver.resolveTemplate('no vars here', { a: '1' }));
      expect(result).toEqual({
        resolved: 'no vars here',
        missingVars: [],
        hasAllVars: true,
      });
    });

    it('respects logMissing: false option', () => {
      const result = asResult(resolver.resolveTemplate('{{x}}', {}, { logMissing: false }));
      expect(result.missingVars).toEqual(['x']);
    });

    it('resolves same variable appearing multiple times', () => {
      const result = asResult(resolver.resolveTemplate('{{ENV}}-{{ENV}}-{{ENV}}', { ENV: 'prod' }));
      expect(result.resolved).toBe('prod-prod-prod');
      expect(result.hasAllVars).toBe(true);
    });

    it('does not resolve partial brace patterns', () => {
      const result = asResult(resolver.resolveTemplate('{notavar}', { notavar: 'val' }));
      expect(result.resolved).toBe('{notavar}');
    });
  });

  // ------------------------------------------------------------------
  // extractVariables
  // ------------------------------------------------------------------
  describe('extractVariables', () => {
    it('extracts variable names from template', () => {
      expect(resolver.extractVariables('{{a}} {{b}} {{c}}')).toEqual(['a', 'b', 'c']);
    });

    it('deduplicates variables', () => {
      expect(resolver.extractVariables('{{a}} {{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
    });

    it('returns empty array for null', () => {
      expect(resolver.extractVariables(null)).toEqual([]);
    });

    it('returns empty array for undefined', () => {
      expect(resolver.extractVariables(undefined as unknown as string)).toEqual([]);
    });

    it('returns empty array for no variables', () => {
      expect(resolver.extractVariables('no vars')).toEqual([]);
    });

    it('extracts enterprise variable names', () => {
      const template = '{{API_URL}}/v2/{{TENANT_ID}}/{{ENVIRONMENT}}';
      expect(resolver.extractVariables(template)).toEqual(['API_URL', 'TENANT_ID', 'ENVIRONMENT']);
    });

    it('returns empty for empty string', () => {
      expect(resolver.extractVariables('')).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // hasVariables
  // ------------------------------------------------------------------
  describe('hasVariables', () => {
    it('returns true when variables present', () => {
      expect(resolver.hasVariables('{{API_KEY}}')).toBe(true);
    });

    it('returns true for template with embedded variable', () => {
      expect(resolver.hasVariables('Bearer {{TOKEN}}')).toBe(true);
    });

    it('returns false when no variables', () => {
      expect(resolver.hasVariables('plain text')).toBe(false);
    });

    it('returns false for null', () => {
      expect(resolver.hasVariables(null)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(resolver.hasVariables('')).toBe(false);
    });

    it('returns false for single braces', () => {
      expect(resolver.hasVariables('{notavar}')).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // resolveObject
  // ------------------------------------------------------------------
  describe('resolveObject', () => {
    it('resolves string values in object', () => {
      const result = resolver.resolveObject(
        { url: '{{API_URL}}/config', key: '{{API_KEY}}' },
        ENTERPRISE_VARS,
      ) as Record<string, unknown>;
      expect(result.url).toBe('https://api.openheaders.io/config');
      expect(result.key).toBe('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
    });

    it('preserves non-string values', () => {
      const result = resolver.resolveObject(
        { count: 42, enabled: true, name: '{{TENANT_ID}}' },
        ENTERPRISE_VARS,
      ) as Record<string, unknown>;
      expect(result.count).toBe(42);
      expect(result.enabled).toBe(true);
      expect(result.name).toBe('org-openheaders-prod');
    });

    it('handles nested objects', () => {
      const result = resolver.resolveObject({ outer: { inner: '{{ENVIRONMENT}}' } }, ENTERPRISE_VARS) as Record<
        string,
        Record<string, string>
      >;
      expect(result.outer.inner).toBe('production');
    });

    it('handles arrays', () => {
      const result = resolver.resolveObject(['{{API_URL}}', '{{AUTH_URL}}'], ENTERPRISE_VARS) as unknown[];
      expect(result).toHaveLength(2);
    });

    it('returns non-object input through resolveTemplate', () => {
      const result = asResult(resolver.resolveObject('{{API_URL}}', ENTERPRISE_VARS));
      expect(result.resolved).toBe('https://api.openheaders.io');
    });

    it('handles null input', () => {
      expect(resolver.resolveObject(null, {})).toBeNull();
    });

    it('handles enterprise config object', () => {
      const config = {
        baseUrl: '{{API_URL}}',
        auth: { token: '{{BEARER_TOKEN}}', tenant: '{{TENANT_ID}}' },
        metadata: { region: '{{REGION}}', version: 3 },
      };
      const result = resolver.resolveObject(config, ENTERPRISE_VARS) as Record<string, unknown>;
      expect(result.baseUrl).toBe('https://api.openheaders.io');
      expect((result.auth as Record<string, string>).token).toBe('Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig');
      expect((result.auth as Record<string, string>).tenant).toBe('org-openheaders-prod');
      expect((result.metadata as Record<string, unknown>).version).toBe(3);
    });
  });

  // ------------------------------------------------------------------
  // validateVariables
  // ------------------------------------------------------------------
  describe('validateVariables', () => {
    it('returns valid when all variables present', () => {
      const result = resolver.validateVariables('{{API_URL}} {{API_KEY}}', ENTERPRISE_VARS);
      expect(result).toEqual({
        isValid: true,
        missing: [],
        required: ['API_URL', 'API_KEY'],
      });
    });

    it('returns invalid with missing variables listed', () => {
      const result = resolver.validateVariables('{{API_URL}} {{MISSING}}', ENTERPRISE_VARS);
      expect(result).toEqual({
        isValid: false,
        missing: ['MISSING'],
        required: ['API_URL', 'MISSING'],
      });
    });

    it('returns valid for template with no variables', () => {
      const result = resolver.validateVariables('no vars', {});
      expect(result).toEqual({
        isValid: true,
        missing: [],
        required: [],
      });
    });

    it('returns valid for null template', () => {
      const result = resolver.validateVariables(null, {});
      expect(result).toEqual({
        isValid: true,
        missing: [],
        required: [],
      });
    });

    it('identifies all missing from enterprise template', () => {
      const result = resolver.validateVariables(
        '{{API_URL}}/{{TENANT_ID}}/{{MISSING_A}}/{{MISSING_B}}',
        ENTERPRISE_VARS,
      );
      expect(result.isValid).toBe(false);
      expect(result.missing).toEqual(['MISSING_A', 'MISSING_B']);
      expect(result.required).toHaveLength(4);
    });
  });

  // ------------------------------------------------------------------
  // createResolver
  // ------------------------------------------------------------------
  describe('createResolver', () => {
    it('returns a function that resolves templates', () => {
      const resolve = resolver.createResolver({ name: 'OpenHeaders' });
      const result = asResult(resolve('Hello {{name}}'));
      expect(result.resolved).toBe('Hello OpenHeaders');
    });

    it('pre-bound resolver uses provided options', () => {
      const resolve = resolver.createResolver({ name: 'OpenHeaders' }, { defaultValue: 'MISSING' });
      const result = asResult(resolve('{{name}} — {{env}}'));
      expect(result.resolved).toBe('OpenHeaders — MISSING');
    });

    it('pre-bound resolver with enterprise vars', () => {
      const resolve = resolver.createResolver(ENTERPRISE_VARS);
      const result = asResult(resolve('{{API_URL}}/v2/workspaces/{{TENANT_ID}}'));
      expect(result.resolved).toBe('https://api.openheaders.io/v2/workspaces/org-openheaders-prod');
      expect(result.hasAllVars).toBe(true);
    });

    it('pre-bound resolver handles null template', () => {
      const resolve = resolver.createResolver(ENTERPRISE_VARS);
      expect(resolve(null)).toBeNull();
    });
  });
});
