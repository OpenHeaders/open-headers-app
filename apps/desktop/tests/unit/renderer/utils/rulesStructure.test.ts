import type { HeaderRule, PayloadRule, UrlRule } from '@openheaders/core';
import { describe, expect, it } from 'vitest';
import {
  createRule,
  createRulesStorage,
  exportForExtension,
  RULE_MESSAGE_TYPES,
  RULE_TYPES,
  validateRule,
} from '@/renderer/utils/data-structures/rulesStructure';

function createHeaderRule(overrides: Record<string, unknown> = {}): HeaderRule {
  return createRule(RULE_TYPES.HEADER, overrides) as HeaderRule;
}

function createPayloadRule(overrides: Record<string, unknown> = {}): PayloadRule {
  return createRule(RULE_TYPES.PAYLOAD, overrides) as PayloadRule;
}

function createUrlRule(overrides: Record<string, unknown> = {}): UrlRule {
  return createRule(RULE_TYPES.URL, overrides) as UrlRule;
}

// ======================================================================
// RULE_TYPES
// ======================================================================
describe('RULE_TYPES', () => {
  it('defines HEADER, PAYLOAD, URL', () => {
    expect(RULE_TYPES.HEADER).toBe('header');
    expect(RULE_TYPES.PAYLOAD).toBe('payload');
    expect(RULE_TYPES.URL).toBe('url');
  });
});

// ======================================================================
// createRule
// ======================================================================
describe('createRule', () => {
  describe('common base fields', () => {
    it('generates id from Date.now if not provided', () => {
      const rule = createHeaderRule();
      expect(rule.id).toBeTruthy();
    });

    it('uses provided id', () => {
      const rule = createHeaderRule({ id: 'custom-id' });
      expect(rule.id).toBe('custom-id');
    });

    it('defaults isEnabled to true', () => {
      const rule = createHeaderRule();
      expect(rule.isEnabled).toBe(true);
    });

    it('allows setting isEnabled to false', () => {
      const rule = createHeaderRule({ isEnabled: false });
      expect(rule.isEnabled).toBe(false);
    });

    it('defaults name and description to empty strings', () => {
      const rule = createHeaderRule();
      expect(rule.name).toBe('');
      expect(rule.description).toBe('');
    });

    it('defaults domains to empty array', () => {
      const rule = createHeaderRule();
      expect(rule.domains).toEqual([]);
    });

    it('sets createdAt and updatedAt', () => {
      const rule = createHeaderRule();
      expect(rule.createdAt).toBeTruthy();
      expect(rule.updatedAt).toBeTruthy();
    });
  });

  describe('HEADER type', () => {
    it('includes header-specific fields', () => {
      const rule = createHeaderRule({
        headerName: 'Authorization',
        headerValue: 'Bearer token',
        tag: 'auth',
      });
      expect(rule.type).toBe('header');
      expect(rule.headerName).toBe('Authorization');
      expect(rule.headerValue).toBe('Bearer token');
      expect(rule.tag).toBe('auth');
    });

    it('defaults header fields', () => {
      const rule = createHeaderRule();
      expect(rule.headerName).toBe('');
      expect(rule.headerValue).toBe('');
      expect(rule.isResponse).toBe(false);
      expect(rule.isDynamic).toBe(false);
      expect(rule.sourceId).toBeNull();
      expect(rule.prefix).toBe('');
      expect(rule.suffix).toBe('');
      expect(rule.hasEnvVars).toBe(false);
      expect(rule.envVars).toEqual([]);
    });
  });

  describe('PAYLOAD type', () => {
    it('includes payload-specific fields', () => {
      const rule = createPayloadRule({
        matchPattern: 'old-value',
        replaceWith: 'new-value',
      });
      expect(rule.type).toBe('payload');
      expect(rule.matchPattern).toBe('old-value');
      expect(rule.replaceWith).toBe('new-value');
    });

    it('defaults payload fields', () => {
      const rule = createPayloadRule();
      expect(rule.matchType).toBe('contains');
      expect(rule.isRequest).toBe(true);
      expect(rule.isResponse).toBe(true);
      expect(rule.contentType).toBe('any');
    });
  });

  describe('URL type', () => {
    it('includes URL-specific fields', () => {
      const rule = createUrlRule({
        matchPattern: '/api/v1',
        redirectTo: '/api/v2',
        action: 'redirect',
      });
      expect(rule.type).toBe('url');
      expect(rule.matchPattern).toBe('/api/v1');
      expect(rule.redirectTo).toBe('/api/v2');
      expect(rule.action).toBe('redirect');
    });

    it('defaults URL fields', () => {
      const rule = createUrlRule();
      expect(rule.matchType).toBe('contains');
      expect(rule.replacePattern).toBe('');
      expect(rule.modifyParams).toEqual([]);
      expect(rule.action).toBe('modify');
    });
  });

  it('throws for unknown rule type', () => {
    expect(() => createRule('unknown')).toThrow('Unknown rule type');
  });
});

// ======================================================================
// createRulesStorage
// ======================================================================
describe('createRulesStorage', () => {
  it('creates empty storage with correct structure', () => {
    const storage = createRulesStorage();
    expect(storage.rules.header).toEqual([]);
    expect(storage.rules.request).toEqual([]);
    expect(storage.rules.response).toEqual([]);
    expect(storage.metadata.totalRules).toBe(0);
    expect(storage.metadata.lastUpdated).toBeTruthy();
  });

  it('includes version', () => {
    const storage = createRulesStorage();
    expect(storage.version).toBeTruthy();
  });
});

// ======================================================================
// exportForExtension
// ======================================================================
describe('exportForExtension', () => {
  it('exports version, rules, metadata', () => {
    const storage = createRulesStorage();
    const exported = exportForExtension(storage);
    expect(exported).toHaveProperty('version');
    expect(exported).toHaveProperty('rules');
    expect(exported).toHaveProperty('metadata');
  });
});

// ======================================================================
// RULE_MESSAGE_TYPES
// ======================================================================
describe('RULE_MESSAGE_TYPES', () => {
  it('defines expected message types', () => {
    expect(RULE_MESSAGE_TYPES.RULES_REQUEST).toBe('rulesRequest');
    expect(RULE_MESSAGE_TYPES.RULES_UPDATE).toBe('rulesUpdate');
    expect(RULE_MESSAGE_TYPES.RULE_TOGGLE).toBe('ruleToggle');
    expect(RULE_MESSAGE_TYPES.RULE_CREATE).toBe('ruleCreate');
    expect(RULE_MESSAGE_TYPES.RULE_DELETE).toBe('ruleDelete');
    expect(RULE_MESSAGE_TYPES.RULE_MODIFY).toBe('ruleModify');
  });
});

// ======================================================================
// validateRule
// ======================================================================
describe('validateRule', () => {
  describe('common validation', () => {
    it('rejects missing type', () => {
      const result = validateRule({ domains: ['example.com'] });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid rule type');
    });

    it('rejects invalid type', () => {
      const result = validateRule({
        type: 'invalid',
        domains: ['example.com'],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects missing domains', () => {
      const result = validateRule({ type: 'header' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('domain');
    });

    it('rejects empty domains array', () => {
      const result = validateRule({ type: 'header', domains: [] });
      expect(result.valid).toBe(false);
    });
  });

  describe('header validation', () => {
    it('validates valid static header rule', () => {
      const result = validateRule({
        type: 'header',
        domains: ['example.com'],
        headerName: 'X-Test',
        headerValue: 'value',
        isDynamic: false,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing headerName', () => {
      const result = validateRule({
        type: 'header',
        domains: ['example.com'],
        headerValue: 'val',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Header name');
    });

    it('rejects static header without value', () => {
      const result = validateRule({
        type: 'header',
        domains: ['example.com'],
        headerName: 'X-Test',
        isDynamic: false,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Header value');
    });

    it('rejects dynamic header without sourceId', () => {
      const result = validateRule({
        type: 'header',
        domains: ['example.com'],
        headerName: 'X-Test',
        isDynamic: true,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Source');
    });

    it('validates dynamic header with sourceId', () => {
      const result = validateRule({
        type: 'header',
        domains: ['example.com'],
        headerName: 'X-Test',
        isDynamic: true,
        sourceId: 'src-1',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('payload validation', () => {
    it('validates valid payload rule', () => {
      const result = validateRule({
        type: 'payload',
        domains: ['example.com'],
        matchPattern: 'old',
        replaceWith: 'new',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing matchPattern', () => {
      const result = validateRule({
        type: 'payload',
        domains: ['example.com'],
        replaceWith: 'new',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Match pattern');
    });

    it('allows empty string replaceWith', () => {
      const result = validateRule({
        type: 'payload',
        domains: ['example.com'],
        matchPattern: 'old',
        replaceWith: '',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('URL validation', () => {
    it('validates valid URL modify rule', () => {
      const result = validateRule({
        type: 'url',
        domains: ['example.com'],
        matchPattern: '/api',
        action: 'modify',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing matchPattern', () => {
      const result = validateRule({
        type: 'url',
        domains: ['example.com'],
        action: 'modify',
      });
      expect(result.valid).toBe(false);
    });

    it('rejects redirect without redirectTo', () => {
      const result = validateRule({
        type: 'url',
        domains: ['example.com'],
        matchPattern: '/old',
        action: 'redirect',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Redirect URL');
    });

    it('validates redirect with redirectTo', () => {
      const result = validateRule({
        type: 'url',
        domains: ['example.com'],
        matchPattern: '/old',
        action: 'redirect',
        redirectTo: '/new',
      });
      expect(result.valid).toBe(true);
    });
  });
});
