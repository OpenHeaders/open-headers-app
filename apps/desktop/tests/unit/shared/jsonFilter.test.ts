import { describe, expect, it } from 'vitest';
import { applyJsonFilter } from '@/shared/jsonFilter';

describe('applyJsonFilter', () => {
  const sampleJson = JSON.stringify({
    access_token: 'eyJhbGciOiJSUzI1NiJ9.openheaders.sig',
    expires_in: 3600,
    token_type: 'Bearer',
    nested: { deep: { value: 'found-it' } },
    items: [{ id: 1 }, { id: 2 }, { id: 3 }],
    error: null,
  });

  it('returns original body when filter is disabled', () => {
    const result = applyJsonFilter(sampleJson, { enabled: false });
    expect(result).toBe(sampleJson);
  });

  it('returns original body when filter has no path', () => {
    const result = applyJsonFilter(sampleJson, { enabled: true, path: '' });
    expect(result).toBe(sampleJson);
  });

  it('extracts a top-level string field', () => {
    const result = applyJsonFilter(sampleJson, { enabled: true, path: 'access_token' });
    expect(result).toBe('eyJhbGciOiJSUzI1NiJ9.openheaders.sig');
  });

  it('extracts a top-level number field', () => {
    const result = applyJsonFilter(sampleJson, { enabled: true, path: 'expires_in' });
    expect(result).toBe('3600');
  });

  it('extracts a nested field with dot notation', () => {
    const result = applyJsonFilter(sampleJson, { enabled: true, path: 'nested.deep.value' });
    expect(result).toBe('found-it');
  });

  it('extracts an array element with bracket notation', () => {
    const result = applyJsonFilter(sampleJson, { enabled: true, path: 'items[1]' });
    expect(result).toContain('"id": 2');
  });

  it('strips root. prefix from path', () => {
    const result = applyJsonFilter(sampleJson, { enabled: true, path: 'root.token_type' });
    expect(result).toBe('Bearer');
  });

  it('returns error message when field not found', () => {
    const result = applyJsonFilter(sampleJson, { enabled: true, path: 'nonexistent' });
    expect(result).toContain('not found');
  });

  it('returns error message for out-of-bounds array index', () => {
    const result = applyJsonFilter(sampleJson, { enabled: true, path: 'items[99]' });
    expect(result).toContain('out of bounds');
  });

  it('returns error message when accessing array on non-array field', () => {
    const result = applyJsonFilter(sampleJson, { enabled: true, path: 'access_token[0]' });
    expect(result).toContain('not an array');
  });

  it('handles error response objects', () => {
    const errorJson = JSON.stringify({ error: 'invalid_grant', error_description: 'Token expired' });
    const result = applyJsonFilter(errorJson, { enabled: true, path: 'access_token' });
    expect(result).toContain('invalid_grant');
    expect(result).toContain('Token expired');
  });

  it('works with pre-parsed object body', () => {
    const obj = { token: 'abc123' };
    const result = applyJsonFilter(obj, { enabled: true, path: 'token' });
    expect(result).toBe('abc123');
  });

  it('returns original body for unparseable string', () => {
    const result = applyJsonFilter('not json', { enabled: true, path: 'field' });
    expect(result).toBe('not json');
  });

  it('serializes object results as JSON', () => {
    const result = applyJsonFilter(sampleJson, { enabled: true, path: 'nested.deep' });
    const parsed = JSON.parse(result as string);
    expect(parsed).toEqual({ value: 'found-it' });
  });
});
