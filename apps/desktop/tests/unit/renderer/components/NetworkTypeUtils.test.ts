import type { NetworkRecord } from '@openheaders/core';
import { describe, expect, it } from 'vitest';
import {
  getTypeFromRecord,
  getUniqueMethods,
  getUniqueStatusGroups,
  getUniqueTypes,
} from '@/renderer/components/record/network/NetworkTypeUtils';

function makeNetRecord(overrides: Partial<NetworkRecord> = {}): NetworkRecord {
  return {
    id: 'rec-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    url: 'https://api.openheaders.io/v2/config',
    method: 'GET',
    status: 200,
    timestamp: 1700000000000,
    ...overrides,
  };
}

// ======================================================================
// getTypeFromRecord
// ======================================================================
describe('getTypeFromRecord', () => {
  it('maps main_frame to document', () => {
    expect(getTypeFromRecord(makeNetRecord({ type: 'main_frame' }))).toBe('document');
  });

  it('maps sub_frame to document', () => {
    expect(getTypeFromRecord(makeNetRecord({ type: 'sub_frame' }))).toBe('document');
  });

  it('maps stylesheet to css', () => {
    expect(getTypeFromRecord(makeNetRecord({ type: 'stylesheet' }))).toBe('css');
  });

  it('maps image to img', () => {
    expect(getTypeFromRecord(makeNetRecord({ type: 'image' }))).toBe('img');
  });

  it('maps xmlhttprequest to xhr', () => {
    expect(getTypeFromRecord(makeNetRecord({ type: 'xmlhttprequest' }))).toBe('xhr');
  });

  it('handles "other" type with JSON content-type as xhr', () => {
    const req = makeNetRecord({
      type: 'other',
      responseHeaders: { 'content-type': 'application/json' },
    });
    expect(getTypeFromRecord(req)).toBe('xhr');
  });

  it('handles "other" type with status 101 as websocket', () => {
    const req = makeNetRecord({ type: 'other', status: 101 });
    expect(getTypeFromRecord(req)).toBe('websocket');
  });

  it('handles "other" type with HTML content-type as xhr', () => {
    const req = makeNetRecord({
      type: 'other',
      responseHeaders: { 'content-type': 'text/html' },
    });
    expect(getTypeFromRecord(req)).toBe('xhr');
  });

  it('returns "fetch" for untyped records', () => {
    expect(getTypeFromRecord(makeNetRecord())).toBe('fetch');
  });

  it('identifies preflight requests', () => {
    expect(getTypeFromRecord(makeNetRecord({ method: 'OPTIONS' }))).toBe('preflight');
  });

  it('identifies websocket by status 101', () => {
    expect(getTypeFromRecord(makeNetRecord({ status: 101 }))).toBe('websocket');
  });

  it('identifies JSON by mime type for fetch/xhr', () => {
    const req = makeNetRecord({
      type: 'fetch',
      responseHeaders: { 'content-type': 'application/json; charset=utf-8' },
    });
    expect(getTypeFromRecord(req)).toBe('json');
  });

  it('identifies JavaScript by mime type', () => {
    const req = makeNetRecord({ type: 'fetch', responseHeaders: { 'content-type': 'application/javascript' } });
    expect(getTypeFromRecord(req)).toBe('js');
  });

  it('identifies CSS by mime type', () => {
    const req = makeNetRecord({ type: 'fetch', responseHeaders: { 'content-type': 'text/css' } });
    expect(getTypeFromRecord(req)).toBe('css');
  });

  it('identifies HTML by mime type', () => {
    const req = makeNetRecord({ type: 'fetch', responseHeaders: { 'content-type': 'text/html' } });
    expect(getTypeFromRecord(req)).toBe('document');
  });

  it('identifies image by mime type', () => {
    const req = makeNetRecord({ type: 'fetch', responseHeaders: { 'content-type': 'image/png' } });
    expect(getTypeFromRecord(req)).toBe('img');
  });

  it('identifies font by mime type', () => {
    const req = makeNetRecord({ type: 'fetch', responseHeaders: { 'content-type': 'font/woff2' } });
    expect(getTypeFromRecord(req)).toBe('font');
  });

  it('passes through unknown type for non-fetch/xhr', () => {
    expect(getTypeFromRecord(makeNetRecord({ type: 'media' }))).toBe('media');
  });
});

// ======================================================================
// getUniqueTypes
// ======================================================================
describe('getUniqueTypes', () => {
  it('returns empty for empty array', () => {
    expect(getUniqueTypes([])).toEqual([]);
  });

  it('returns sorted unique types', () => {
    const records = [
      makeNetRecord({ type: 'script' }),
      makeNetRecord({ type: 'stylesheet' }),
      makeNetRecord({ type: 'script' }),
      makeNetRecord(),
    ];
    const result = getUniqueTypes(records);
    expect(result).toEqual(['css', 'fetch', 'script']);
  });
});

// ======================================================================
// getUniqueStatusGroups
// ======================================================================
describe('getUniqueStatusGroups', () => {
  it('returns empty for empty array', () => {
    expect(getUniqueStatusGroups([])).toEqual([]);
  });

  it('groups by status ranges', () => {
    const records = [
      makeNetRecord({ status: 200 }),
      makeNetRecord({ status: 301 }),
      makeNetRecord({ status: 404 }),
      makeNetRecord({ status: 500 }),
      makeNetRecord({ status: 0, error: true }),
      makeNetRecord({ status: 0 }),
    ];
    const result = getUniqueStatusGroups(records);
    expect(result).toContain('2xx');
    expect(result).toContain('3xx');
    expect(result).toContain('4xx');
    expect(result).toContain('5xx');
    expect(result).toContain('Failed');
    expect(result).toContain('Pending');
  });
});

// ======================================================================
// getUniqueMethods
// ======================================================================
describe('getUniqueMethods', () => {
  it('returns empty for empty array', () => {
    expect(getUniqueMethods([])).toEqual([]);
  });

  it('returns sorted unique methods', () => {
    const records = [
      makeNetRecord({ method: 'GET' }),
      makeNetRecord({ method: 'POST' }),
      makeNetRecord({ method: 'GET' }),
      makeNetRecord(),
    ];
    expect(getUniqueMethods(records)).toEqual(['GET', 'POST']);
  });

  it('includes all HTTP methods from enterprise API', () => {
    const records = [
      makeNetRecord({ method: 'GET', url: 'https://api.openheaders.io/v2/sources' }),
      makeNetRecord({ method: 'POST', url: 'https://api.openheaders.io/v2/sources' }),
      makeNetRecord({ method: 'PUT', url: 'https://api.openheaders.io/v2/sources/a1b2c3d4' }),
      makeNetRecord({ method: 'DELETE', url: 'https://api.openheaders.io/v2/sources/a1b2c3d4' }),
      makeNetRecord({ method: 'PATCH', url: 'https://api.openheaders.io/v2/sources/a1b2c3d4' }),
      makeNetRecord({ method: 'OPTIONS', url: 'https://api.openheaders.io/v2/sources' }),
    ];
    expect(getUniqueMethods(records)).toEqual(['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
  });
});
