import { describe, it, expect } from 'vitest';

// The module uses CommonJS require for logger but exports with ESM export syntax.
// Vitest handles this mixed format natively.
import {
  extractEnvironmentVariables,
  hasEnvironmentVariables,
  extractVariablesFromRule,
  findMissingVariables,
  validateEnvironmentVariables,
  validateRuleEnvironmentVariables,
  resolveEnvironmentVariables,
  resolveRuleEnvironmentVariables,
  checkRuleActivation,
  formatMissingVariables,
  getResolvedPreview,
} from '../../../../src/renderer/utils/validation/environment-variables';

// ======================================================================
// extractEnvironmentVariables
// ======================================================================
describe('extractEnvironmentVariables', () => {
  it('extracts single variable', () => {
    expect(extractEnvironmentVariables('{{API_KEY}}')).toEqual(['API_KEY']);
  });

  it('extracts multiple variables', () => {
    expect(
      extractEnvironmentVariables('{{HOST}}:{{PORT}}/{{PATH}}')
    ).toEqual(['HOST', 'PORT', 'PATH']);
  });

  it('deduplicates variables', () => {
    expect(
      extractEnvironmentVariables('{{A}} and {{A}}')
    ).toEqual(['A']);
  });

  it('trims whitespace inside braces', () => {
    expect(extractEnvironmentVariables('{{ VAR }}')).toEqual(['VAR']);
  });

  it('returns empty array for null', () => {
    expect(extractEnvironmentVariables(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(extractEnvironmentVariables(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractEnvironmentVariables('')).toEqual([]);
  });

  it('returns empty array for non-string', () => {
    expect(extractEnvironmentVariables(42 as any)).toEqual([]);
  });

  it('returns empty array when no variables present', () => {
    expect(extractEnvironmentVariables('plain text')).toEqual([]);
  });

  it('handles nested braces gracefully', () => {
    // {{VAR}} is valid, {{{VAR}}} would match the inner part
    const result = extractEnvironmentVariables('{{VAR}}');
    expect(result).toEqual(['VAR']);
  });
});

// ======================================================================
// hasEnvironmentVariables
// ======================================================================
describe('hasEnvironmentVariables', () => {
  it('returns true when variables exist', () => {
    expect(hasEnvironmentVariables('Bearer {{TOKEN}}')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(hasEnvironmentVariables('just text')).toBe(false);
  });

  it('returns false for null', () => {
    expect(hasEnvironmentVariables(null)).toBe(false);
  });

  it('returns false for non-string', () => {
    expect(hasEnvironmentVariables(123 as any)).toBe(false);
  });
});

// ======================================================================
// extractVariablesFromRule
// ======================================================================
describe('extractVariablesFromRule', () => {
  it('extracts from headerName', () => {
    expect(
      extractVariablesFromRule({ headerName: '{{HEADER}}' })
    ).toEqual(['HEADER']);
  });

  it('extracts from headerValue for static rules', () => {
    expect(
      extractVariablesFromRule({
        headerName: 'Auth',
        headerValue: '{{TOKEN}}',
        isDynamic: false,
      })
    ).toEqual(['TOKEN']);
  });

  it('does NOT extract from headerValue for dynamic rules', () => {
    expect(
      extractVariablesFromRule({
        headerValue: '{{TOKEN}}',
        isDynamic: true,
      })
    ).toEqual([]);
  });

  it('extracts from prefix and suffix for dynamic rules', () => {
    expect(
      extractVariablesFromRule({
        isDynamic: true,
        prefix: 'Bearer {{PREFIX_VAR}}',
        suffix: '{{SUFFIX_VAR}}',
      })
    ).toEqual(['PREFIX_VAR', 'SUFFIX_VAR']);
  });

  it('extracts from domains array', () => {
    expect(
      extractVariablesFromRule({
        domains: ['{{DOMAIN_A}}', '{{DOMAIN_B}}'],
      })
    ).toEqual(['DOMAIN_A', 'DOMAIN_B']);
  });

  it('deduplicates across fields', () => {
    expect(
      extractVariablesFromRule({
        headerName: '{{SHARED}}',
        headerValue: '{{SHARED}}',
        isDynamic: false,
      })
    ).toEqual(['SHARED']);
  });

  it('handles rule with no fields', () => {
    expect(extractVariablesFromRule({})).toEqual([]);
  });
});

// ======================================================================
// findMissingVariables
// ======================================================================
describe('findMissingVariables', () => {
  it('returns missing variables', () => {
    expect(
      findMissingVariables(['A', 'B', 'C'], { A: 'val', C: 'val' })
    ).toEqual(['B']);
  });

  it('considers empty string as missing', () => {
    expect(findMissingVariables(['X'], { X: '' })).toEqual(['X']);
  });

  it('considers null as missing', () => {
    expect(findMissingVariables(['X'], { X: null })).toEqual(['X']);
  });

  it('considers undefined as missing', () => {
    expect(findMissingVariables(['X'], { Y: 'val' })).toEqual(['X']);
  });

  it('returns empty array when all present', () => {
    expect(
      findMissingVariables(['A', 'B'], { A: 'x', B: 'y' })
    ).toEqual([]);
  });

  it('returns requiredVars when availableVars is null', () => {
    expect(findMissingVariables(['A'], null)).toEqual(['A']);
  });

  it('returns empty array for non-array requiredVars', () => {
    expect(findMissingVariables(null as any, {})).toEqual([]);
  });
});

// ======================================================================
// validateEnvironmentVariables
// ======================================================================
describe('validateEnvironmentVariables', () => {
  it('returns valid when all vars available', () => {
    const result = validateEnvironmentVariables('{{A}} {{B}}', {
      A: 'x',
      B: 'y',
    });
    expect(result.isValid).toBe(true);
    expect(result.missingVars).toEqual([]);
    expect(result.usedVars).toEqual(['A', 'B']);
    expect(result.hasVars).toBe(true);
  });

  it('returns invalid when vars missing', () => {
    const result = validateEnvironmentVariables('{{A}} {{B}}', { A: 'x' });
    expect(result.isValid).toBe(false);
    expect(result.missingVars).toEqual(['B']);
  });

  it('handles text with no variables', () => {
    const result = validateEnvironmentVariables('plain', {});
    expect(result.isValid).toBe(true);
    expect(result.hasVars).toBe(false);
  });
});

// ======================================================================
// validateRuleEnvironmentVariables
// ======================================================================
describe('validateRuleEnvironmentVariables', () => {
  it('validates all fields of a static rule', () => {
    const result = validateRuleEnvironmentVariables(
      {
        headerName: '{{HNAME}}',
        headerValue: '{{HVAL}}',
        isDynamic: false,
        domains: ['{{DOMAIN}}'],
      },
      { HNAME: 'x', HVAL: 'y', DOMAIN: 'z' }
    );
    expect(result.isValid).toBe(true);
    expect(result.totalVarsUsed).toBe(3);
  });

  it('reports missing vars', () => {
    const result = validateRuleEnvironmentVariables(
      { headerName: '{{MISSING}}', isDynamic: false },
      {}
    );
    expect(result.isValid).toBe(false);
    expect(result.missingVars).toContain('MISSING');
  });

  it('validates dynamic rule prefix/suffix', () => {
    const result = validateRuleEnvironmentVariables(
      { isDynamic: true, prefix: '{{P}}', suffix: '{{S}}' },
      { P: 'a', S: 'b' }
    );
    expect(result.isValid).toBe(true);
  });

  it('deduplicates missing vars', () => {
    const result = validateRuleEnvironmentVariables(
      {
        headerName: '{{X}}',
        headerValue: '{{X}}',
        isDynamic: false,
      },
      {}
    );
    expect(result.missingVars).toEqual(['X']);
  });
});

// ======================================================================
// resolveEnvironmentVariables
// ======================================================================
describe('resolveEnvironmentVariables', () => {
  it('replaces variables with values', () => {
    expect(
      resolveEnvironmentVariables('Hello {{NAME}}', { NAME: 'World' })
    ).toBe('Hello World');
  });

  it('replaces multiple variables', () => {
    expect(
      resolveEnvironmentVariables('{{A}}-{{B}}', { A: '1', B: '2' })
    ).toBe('1-2');
  });

  it('returns placeholder for missing vars by default', () => {
    const result = resolveEnvironmentVariables('{{MISSING}}', {});
    expect(result).toBe('[MISSING_VAR:MISSING]');
  });

  it('keeps unresolved when option set', () => {
    const result = resolveEnvironmentVariables('{{KEEP}}', {}, {
      keepUnresolved: true,
    });
    expect(result).toBe('{{KEEP}}');
  });

  it('uses custom placeholder prefix', () => {
    const result = resolveEnvironmentVariables('{{X}}', {}, {
      placeholderPrefix: '[CUSTOM:',
    });
    expect(result).toBe('[CUSTOM:X]');
  });

  it('returns input for null', () => {
    expect(resolveEnvironmentVariables(null, {})).toBeNull();
  });

  it('returns input for non-string', () => {
    expect(resolveEnvironmentVariables(42 as any, {})).toBe(42);
  });

  it('handles empty variables value correctly', () => {
    // Empty string is treated as missing
    const result = resolveEnvironmentVariables('{{E}}', { E: '' });
    expect(result).toBe('[MISSING_VAR:E]');
  });
});

// ======================================================================
// resolveRuleEnvironmentVariables
// ======================================================================
describe('resolveRuleEnvironmentVariables', () => {
  it('resolves all static rule fields', () => {
    const rule = {
      headerName: '{{H}}',
      headerValue: '{{V}}',
      isDynamic: false,
      domains: ['{{D1}}', '{{D2}}'],
    };
    const resolved = resolveRuleEnvironmentVariables(rule, {
      H: 'Auth',
      V: 'Bearer token',
      D1: 'example.com',
      D2: 'api.com',
    });
    expect(resolved.headerName).toBe('Auth');
    expect(resolved.headerValue).toBe('Bearer token');
    expect(resolved.domains).toEqual(['example.com', 'api.com']);
  });

  it('resolves dynamic rule prefix/suffix', () => {
    const rule = {
      isDynamic: true,
      prefix: 'Bearer {{TOKEN}}',
      suffix: '{{SUFFIX}}',
    };
    const resolved = resolveRuleEnvironmentVariables(rule, {
      TOKEN: 'abc',
      SUFFIX: 'end',
    });
    expect(resolved.prefix).toBe('Bearer abc');
    expect(resolved.suffix).toBe('end');
  });

  it('does not mutate original rule', () => {
    const rule = { headerName: '{{X}}', isDynamic: false };
    const resolved = resolveRuleEnvironmentVariables(rule, { X: 'resolved' });
    expect(rule.headerName).toBe('{{X}}');
    expect(resolved.headerName).toBe('resolved');
  });
});

// ======================================================================
// checkRuleActivation
// ======================================================================
describe('checkRuleActivation', () => {
  it('returns shouldApply false when rule disabled', () => {
    const result = checkRuleActivation({ isEnabled: false }, {});
    expect(result.shouldApply).toBe(false);
    expect(result.reason).toBe('Rule is disabled');
  });

  it('returns shouldApply true when all deps satisfied', () => {
    const result = checkRuleActivation(
      { isEnabled: true, headerName: '{{A}}', isDynamic: false },
      { A: 'val' }
    );
    expect(result.shouldApply).toBe(true);
    expect(result.activationState).toBe('active');
  });

  it('returns shouldApply false when vars missing', () => {
    const result = checkRuleActivation(
      { isEnabled: true, headerName: '{{MISSING}}', isDynamic: false },
      {}
    );
    expect(result.shouldApply).toBe(false);
    expect(result.activationState).toBe('waiting_for_deps');
    expect(result.missingVars).toContain('MISSING');
  });
});

// ======================================================================
// formatMissingVariables
// ======================================================================
describe('formatMissingVariables', () => {
  it('returns empty string for empty array', () => {
    expect(formatMissingVariables([])).toBe('');
  });

  it('returns empty string for null', () => {
    expect(formatMissingVariables(null)).toBe('');
  });

  it('formats single variable', () => {
    expect(formatMissingVariables(['API_KEY'])).toBe(
      'Missing variable: {{API_KEY}}'
    );
  });

  it('formats multiple variables', () => {
    const result = formatMissingVariables(['A', 'B', 'C']);
    expect(result).toBe('Missing variables: {{A}}, {{B}}, {{C}}');
  });
});

// ======================================================================
// getResolvedPreview
// ======================================================================
describe('getResolvedPreview', () => {
  it('returns empty preview for null text', () => {
    const result = getResolvedPreview(null, {});
    expect(result.text).toBe('');
    expect(result.hasMissing).toBe(false);
    expect(result.missingCount).toBe(0);
  });

  it('returns resolved text with no missing vars', () => {
    const result = getResolvedPreview('Hello {{NAME}}', { NAME: 'World' });
    expect(result.text).toBe('Hello World');
    expect(result.hasMissing).toBe(false);
    expect(result.missingCount).toBe(0);
  });

  it('reports missing vars in preview', () => {
    const result = getResolvedPreview('{{A}} and {{B}}', { A: 'found' });
    expect(result.hasMissing).toBe(true);
    expect(result.missingCount).toBe(1);
    expect(result.missingVars).toEqual(['B']);
    expect(result.text).toContain('[MISSING:B]');
  });
});
