import { describe, it, expect, vi } from 'vitest';
import {
  validateVariableExists,
  resolveAllVariables,
  validateUrlField,
  validateHttpHeaders,
  validateQueryParameters,
  validateRequestBody,
  validateJsonFilterPath,
  validateAllHttpFields,
} from '../../../../src/renderer/components/sources/http-options/HttpValidation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeEnvContext = (vars = {}, activeEnv = 'default', ready = true) => ({
  environmentsReady: ready,
  activeEnvironment: activeEnv,
  getAllVariables: () => vars,
  resolveTemplate: (t: string) => t,
});

const makeForm = (opts: Record<string, any> = {}) => ({
  getFieldValue: (key: string | string[]) => {
    if (typeof key === 'string') return opts[key];
    // Support nested path like ['requestOptions', 'headers']
    let val: any = opts;
    for (const k of key) {
      val = val?.[k];
    }
    return val;
  },
});

// ======================================================================
// validateVariableExists
// ======================================================================
describe('validateVariableExists', () => {
  it('returns valid for empty value', () => {
    expect(validateVariableExists('', makeEnvContext(), makeForm())).toEqual({ valid: true });
  });

  it('returns valid when environments are not ready', () => {
    const ctx = makeEnvContext({}, 'default', false);
    expect(validateVariableExists('{{FOO}}', ctx, makeForm())).toEqual({ valid: true });
  });

  it('returns valid when env var exists', () => {
    const ctx = makeEnvContext({ API_KEY: 'abc' });
    expect(validateVariableExists('{{API_KEY}}', ctx, makeForm())).toEqual({ valid: true });
  });

  it('returns invalid when env var is missing', () => {
    const ctx = makeEnvContext({});
    const result = validateVariableExists('{{MISSING}}', ctx, makeForm());
    expect(result.valid).toBe(false);
    expect(result.error).toContain('MISSING');
  });

  it('validates multiple env vars', () => {
    const ctx = makeEnvContext({ A: '1' });
    const result = validateVariableExists('{{A}}{{B}}', ctx, makeForm());
    expect(result.valid).toBe(false);
    expect(result.error).toContain('B');
  });

  it('returns invalid when TOTP placeholder used without secret', () => {
    const ctx = makeEnvContext({});
    const form = makeForm({ requestOptions: { totpSecret: '' } });
    const result = validateVariableExists('[[TOTP_CODE]]', ctx, form);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('TOTP');
  });

  it('returns valid when TOTP placeholder used with secret', () => {
    const ctx = makeEnvContext({});
    const form = makeForm({ requestOptions: { totpSecret: 'JBSWY3DPEHPK3PXP' } });
    const result = validateVariableExists('[[TOTP_CODE]]', ctx, form);
    expect(result.valid).toBe(true);
  });

  it('returns invalid when TOTP secret is "none"', () => {
    const ctx = makeEnvContext({});
    const form = makeForm({ requestOptions: { totpSecret: 'none' } });
    const result = validateVariableExists('[[TOTP_CODE]]', ctx, form);
    expect(result.valid).toBe(false);
  });
});

// ======================================================================
// resolveAllVariables
// ======================================================================
describe('resolveAllVariables', () => {
  it('returns falsy value as-is', () => {
    expect(resolveAllVariables('', makeEnvContext())).toBe('');
    expect(resolveAllVariables(null as any, makeEnvContext())).toBe(null);
  });

  it('returns text as-is when environments not ready', () => {
    const ctx = makeEnvContext({}, 'default', false);
    expect(resolveAllVariables('{{FOO}}', ctx)).toBe('{{FOO}}');
  });

  it('delegates to resolveTemplate when ready', () => {
    const ctx = {
      ...makeEnvContext(),
      resolveTemplate: (t: string) => t.replace('{{X}}', 'resolved'),
    };
    expect(resolveAllVariables('{{X}}', ctx)).toBe('resolved');
  });
});

// ======================================================================
// validateUrlField
// ======================================================================
describe('validateUrlField', () => {
  it('resolves for empty value', async () => {
    await expect(validateUrlField({}, '', makeEnvContext(), makeForm())).resolves.toBeUndefined();
  });

  it('resolves for valid env var', async () => {
    const ctx = makeEnvContext({ HOST: 'example.com' });
    await expect(validateUrlField({}, 'https://{{HOST}}/api', ctx, makeForm())).resolves.toBeUndefined();
  });

  it('rejects for missing env var', async () => {
    const ctx = makeEnvContext({});
    await expect(validateUrlField({}, 'https://{{MISSING}}/api', ctx, makeForm())).rejects.toThrow('MISSING');
  });
});

// ======================================================================
// validateHttpHeaders
// ======================================================================
describe('validateHttpHeaders', () => {
  it('returns valid for non-array input', () => {
    expect(validateHttpHeaders(null as any, makeEnvContext(), makeForm())).toEqual({ valid: true });
  });

  it('returns valid for empty array', () => {
    expect(validateHttpHeaders([], makeEnvContext(), makeForm())).toEqual({ valid: true });
  });

  it('returns valid when header has no value', () => {
    const headers = [{ key: 'X-Custom' }];
    expect(validateHttpHeaders(headers, makeEnvContext(), makeForm())).toEqual({ valid: true });
  });

  it('returns invalid when header references missing var', () => {
    const ctx = makeEnvContext({});
    const headers = [{ key: 'Authorization', value: 'Bearer {{TOKEN}}' }];
    const result = validateHttpHeaders(headers, ctx, makeForm());
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Authorization');
    expect(result.error).toContain('TOKEN');
  });

  it('returns valid when header var exists', () => {
    const ctx = makeEnvContext({ TOKEN: 'abc' });
    const headers = [{ key: 'Authorization', value: 'Bearer {{TOKEN}}' }];
    const result = validateHttpHeaders(headers, ctx, makeForm());
    expect(result.valid).toBe(true);
  });

  it('uses index-based name when header key is missing', () => {
    const ctx = makeEnvContext({});
    const headers = [{ value: '{{MISSING}}' }];
    const result = validateHttpHeaders(headers, ctx, makeForm());
    expect(result.valid).toBe(false);
    expect(result.error).toContain('#1');
  });
});

// ======================================================================
// validateQueryParameters
// ======================================================================
describe('validateQueryParameters', () => {
  it('returns valid for non-array', () => {
    expect(validateQueryParameters(null as any, makeEnvContext(), makeForm())).toEqual({ valid: true });
  });

  it('returns invalid for missing env var in query param', () => {
    const ctx = makeEnvContext({});
    const params = [{ key: 'token', value: '{{TOKEN}}' }];
    const result = validateQueryParameters(params, ctx, makeForm());
    expect(result.valid).toBe(false);
    expect(result.error).toContain('token');
  });

  it('returns valid when env var exists', () => {
    const ctx = makeEnvContext({ TOKEN: 'x' });
    const params = [{ key: 'token', value: '{{TOKEN}}' }];
    expect(validateQueryParameters(params, ctx, makeForm()).valid).toBe(true);
  });
});

// ======================================================================
// validateRequestBody
// ======================================================================
describe('validateRequestBody', () => {
  it('returns valid for empty body', () => {
    expect(validateRequestBody('', makeEnvContext(), makeForm())).toEqual({ valid: true });
  });

  it('returns invalid for missing env var in body', () => {
    const ctx = makeEnvContext({});
    const result = validateRequestBody('{"key":"{{VAL}}"}', ctx, makeForm());
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Request body');
  });
});

// ======================================================================
// validateJsonFilterPath
// ======================================================================
describe('validateJsonFilterPath', () => {
  it('returns valid for empty path', () => {
    expect(validateJsonFilterPath('', makeEnvContext(), makeForm())).toEqual({ valid: true });
  });

  it('returns invalid for missing env var in path', () => {
    const ctx = makeEnvContext({});
    const result = validateJsonFilterPath('{{ROOT}}.items', ctx, makeForm());
    expect(result.valid).toBe(false);
    expect(result.error).toContain('JSON filter path');
  });
});

// ======================================================================
// validateAllHttpFields
// ======================================================================
describe('validateAllHttpFields', () => {
  it('returns null when everything is valid', () => {
    const form = makeForm({
      requestOptions: { headers: [], queryParams: [], body: '' },
      jsonFilter: { enabled: false, path: '' },
    });
    const ctx = makeEnvContext({});
    expect(validateAllHttpFields(form, {}, ctx)).toBeNull();
  });

  it('returns error when headers have missing vars', () => {
    const form = makeForm({
      requestOptions: { headers: [{ key: 'Auth', value: '{{MISSING}}' }], queryParams: [], body: '' },
      jsonFilter: { enabled: false },
    });
    const ctx = makeEnvContext({});
    const result = validateAllHttpFields(form, {}, ctx);
    expect(result).not.toBeNull();
    expect(result!.message).toContain('MISSING');
  });

  it('returns error when jsonFilter path has missing var and is enabled', () => {
    const form = makeForm({
      requestOptions: { headers: [], queryParams: [], body: '' },
      jsonFilter: { enabled: true, path: '{{ROOT}}.data' },
    });
    const ctx = makeEnvContext({});
    const result = validateAllHttpFields(form, {}, ctx);
    expect(result).not.toBeNull();
    expect(result!.message).toContain('ROOT');
  });
});
