import { describe, it, expect } from 'vitest';
import {
  validateUrlField,
  validateEnvironmentVariables,
  validateTotpPlaceholders,
  validateHttpHeaders,
  validateQueryParameters,
  validateRequestBody,
  validateJsonFilterPath,
  validateTotpSecret,
  validateAllHttpFields,
} from '../../../../src/renderer/components/sources/source-form/SourceFormValidation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeEnvContext = (vars = {}, activeEnv = 'default', ready = true) => ({
  environmentsReady: ready,
  activeEnvironment: activeEnv,
  getAllVariables: () => vars,
});

interface FormFields {
  requestOptions?: {
    headers?: Array<{ key: string; value: string }>;
    queryParams?: Array<{ key: string; value: string }>;
    body?: string;
    totpSecret?: string;
  };
  jsonFilter?: { enabled: boolean; path?: string };
}

const makeForm = (fields: FormFields = {}) => ({
  getFieldValue: (key: string | string[]) => {
    if (typeof key === 'string') return fields[key as keyof FormFields];
    let val: unknown = fields;
    for (const k of key) {
      val = (val as Record<string, unknown>)?.[k];
    }
    return val;
  },
});

// ======================================================================
// validateUrlField (SourceFormValidation)
// ======================================================================
describe('SourceFormValidation.validateUrlField', () => {
  it('resolves for empty value', async () => {
    await expect(validateUrlField({}, '', 'http', makeEnvContext(), makeForm())).resolves.toBeUndefined();
  });

  it('resolves for non-http source type', async () => {
    await expect(validateUrlField({}, 'anything', 'file', makeEnvContext(), makeForm())).resolves.toBeUndefined();
  });

  it('resolves when environments not ready', async () => {
    const ctx = makeEnvContext({}, 'default', false);
    await expect(validateUrlField({}, '{{X}}', 'http', ctx, makeForm())).resolves.toBeUndefined();
  });

  it('resolves for valid URL without vars', async () => {
    await expect(
      validateUrlField({}, 'https://example.com/api', 'http', makeEnvContext(), makeForm())
    ).resolves.toBeUndefined();
  });

  it('resolves for URL with existing env var', async () => {
    const ctx = makeEnvContext({ HOST: 'example.com' });
    await expect(
      validateUrlField({}, 'https://{{HOST}}/api', 'http', ctx, makeForm())
    ).resolves.toBeUndefined();
  });

  it('rejects for missing env var', async () => {
    const ctx = makeEnvContext({});
    await expect(
      validateUrlField({}, 'https://{{MISSING}}/api', 'http', ctx, makeForm())
    ).rejects.toThrow('MISSING');
  });

  it('rejects when TOTP placeholder used without secret', async () => {
    const ctx = makeEnvContext({});
    const form = makeForm({ requestOptions: { totpSecret: '' } });
    await expect(
      validateUrlField({}, 'https://api.test/[[TOTP_CODE]]', 'http', ctx, form)
    ).rejects.toThrow('TOTP');
  });

  it('resolves when TOTP placeholder used with secret', async () => {
    const ctx = makeEnvContext({});
    const form = makeForm({ requestOptions: { totpSecret: 'JBSWY3DPEHPK3PXP' } });
    await expect(
      validateUrlField({}, 'https://api.test/[[TOTP_CODE]]', 'http', ctx, form)
    ).resolves.toBeUndefined();
  });

  it('rejects for invalid URL format', async () => {
    const ctx = makeEnvContext({});
    await expect(
      validateUrlField({}, ':::invalid', 'http', ctx, makeForm())
    ).rejects.toThrow('Invalid URL');
  });

});

// ======================================================================
// validateEnvironmentVariables
// ======================================================================
describe('validateEnvironmentVariables', () => {
  it('returns null when no env vars present', () => {
    expect(validateEnvironmentVariables('plain text', makeEnvContext(), 'Field')).toBeNull();
  });

  it('returns null when env var exists', () => {
    const ctx = makeEnvContext({ KEY: 'val' });
    expect(validateEnvironmentVariables('{{KEY}}', ctx, 'Field')).toBeNull();
  });

  it('returns error when env var is missing', () => {
    const ctx = makeEnvContext({});
    const result = validateEnvironmentVariables('{{MISSING}}', ctx, 'MyField');
    expect(result).not.toBeNull();
    expect(result!.message).toContain('MyField');
    expect(result!.message).toContain('MISSING');
  });
});

// ======================================================================
// validateTotpPlaceholders
// ======================================================================
describe('validateTotpPlaceholders', () => {
  it('returns null when no TOTP placeholder', () => {
    expect(validateTotpPlaceholders('no totp', makeForm(), 'F')).toBeNull();
  });

  it('returns null when TOTP secret is set', () => {
    const form = makeForm({ requestOptions: { totpSecret: 'SECRET' } });
    expect(validateTotpPlaceholders('[[TOTP_CODE]]', form, 'F')).toBeNull();
  });

  it('returns error when TOTP secret is empty', () => {
    const form = makeForm({ requestOptions: { totpSecret: '' } });
    const result = validateTotpPlaceholders('[[TOTP_CODE]]', form, 'Header');
    expect(result).not.toBeNull();
    expect(result!.message).toContain('Header');
    expect(result!.message).toContain('TOTP');
  });
});

// ======================================================================
// validateHttpHeaders (SourceFormValidation)
// ======================================================================
describe('SourceFormValidation.validateHttpHeaders', () => {
  it('returns null for no headers', () => {
    const form = makeForm({ requestOptions: { headers: [] } });
    expect(validateHttpHeaders(form, makeEnvContext())).toBeNull();
  });

  it('returns error when header uses missing env var', () => {
    const form = makeForm({
      requestOptions: {
        headers: [{ key: 'Auth', value: '{{TOKEN}}' }],
      },
    });
    const result = validateHttpHeaders(form, makeEnvContext());
    expect(result).not.toBeNull();
    expect(result!.message).toContain('TOKEN');
  });

  it('returns error when header uses TOTP without secret', () => {
    const form = makeForm({
      requestOptions: {
        headers: [{ key: 'X-OTP', value: '[[TOTP_CODE]]' }],
        totpSecret: '',
      },
    });
    const result = validateHttpHeaders(form, makeEnvContext());
    expect(result).not.toBeNull();
    expect(result!.message).toContain('TOTP');
  });
});

// ======================================================================
// validateQueryParameters (SourceFormValidation)
// ======================================================================
describe('SourceFormValidation.validateQueryParameters', () => {
  it('returns null for no query params', () => {
    const form = makeForm({ requestOptions: { queryParams: [] } });
    expect(validateQueryParameters(form, makeEnvContext())).toBeNull();
  });

  it('returns error for missing env var in query param', () => {
    const form = makeForm({
      requestOptions: { queryParams: [{ key: 'key', value: '{{NOPE}}' }] },
    });
    const result = validateQueryParameters(form, makeEnvContext());
    expect(result).not.toBeNull();
    expect(result!.message).toContain('NOPE');
  });
});

// ======================================================================
// validateRequestBody (SourceFormValidation)
// ======================================================================
describe('SourceFormValidation.validateRequestBody', () => {
  it('returns null for no body', () => {
    const form = makeForm({ requestOptions: { body: '' } });
    expect(validateRequestBody(form, makeEnvContext())).toBeNull();
  });

  it('returns error for missing var in body', () => {
    const form = makeForm({ requestOptions: { body: '{{BODY_VAR}}' } });
    const result = validateRequestBody(form, makeEnvContext());
    expect(result).not.toBeNull();
    expect(result!.message).toContain('BODY_VAR');
  });
});

// ======================================================================
// validateJsonFilterPath (SourceFormValidation)
// ======================================================================
describe('SourceFormValidation.validateJsonFilterPath', () => {
  it('returns null when filter is disabled', () => {
    expect(validateJsonFilterPath({ jsonFilter: { enabled: false } }, makeEnvContext())).toBeNull();
  });

  it('returns null when filter path has no vars', () => {
    expect(validateJsonFilterPath({ jsonFilter: { enabled: true, path: 'data.items' } }, makeEnvContext())).toBeNull();
  });

  it('returns error when filter path has missing var', () => {
    const result = validateJsonFilterPath(
      { jsonFilter: { enabled: true, path: '{{ROOT}}.items' } },
      makeEnvContext()
    );
    expect(result).not.toBeNull();
    expect(result!.message).toContain('ROOT');
  });
});

// ======================================================================
// validateTotpSecret
// ======================================================================
describe('validateTotpSecret', () => {
  it('returns null when no totp secret', () => {
    const form = makeForm({ requestOptions: {} });
    expect(validateTotpSecret(form, makeEnvContext())).toBeNull();
  });

  it('returns error when totp secret references missing var', () => {
    const form = makeForm({ requestOptions: { totpSecret: '{{TOTP_KEY}}' } });
    const result = validateTotpSecret(form, makeEnvContext());
    expect(result).not.toBeNull();
    expect(result!.message).toContain('TOTP_KEY');
  });

  it('returns null when totp secret var exists', () => {
    const form = makeForm({ requestOptions: { totpSecret: '{{TOTP_KEY}}' } });
    const ctx = makeEnvContext({ TOTP_KEY: 'secret' });
    expect(validateTotpSecret(form, ctx)).toBeNull();
  });
});

// ======================================================================
// validateAllHttpFields (SourceFormValidation)
// ======================================================================
describe('SourceFormValidation.validateAllHttpFields', () => {
  it('returns null for non-http source type', () => {
    const form = makeForm({});
    expect(validateAllHttpFields(form, { sourceType: 'file' }, makeEnvContext())).toBeNull();
  });

  it('returns null when all fields are valid', () => {
    const form = makeForm({
      requestOptions: { headers: [], queryParams: [], body: '' },
    });
    expect(validateAllHttpFields(form, { sourceType: 'http' }, makeEnvContext())).toBeNull();
  });

  it('returns first encountered error', () => {
    const form = makeForm({
      requestOptions: {
        headers: [{ key: 'X', value: '{{MISSING}}' }],
        queryParams: [],
        body: '',
      },
    });
    const result = validateAllHttpFields(form, { sourceType: 'http' }, makeEnvContext());
    expect(result).not.toBeNull();
    expect(result!.message).toContain('MISSING');
  });
});
