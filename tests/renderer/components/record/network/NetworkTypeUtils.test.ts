import { describe, it, expect } from 'vitest';
import {
  getTypeFromRecord,
  getUniqueTypes,
  getUniqueStatusGroups,
  getUniqueMethods,
} from '../../../../../src/renderer/components/record/network/NetworkTypeUtils';

// ======================================================================
// getTypeFromRecord
// ======================================================================
describe('getTypeFromRecord', () => {
  it('returns "unknown" for null', () => {
    expect(getTypeFromRecord(null as any)).toBe('unknown');
  });

  it('returns "unknown" for non-object', () => {
    expect(getTypeFromRecord('string' as any)).toBe('unknown');
  });

  it('maps main_frame to document', () => {
    expect(getTypeFromRecord({ type: 'main_frame' })).toBe('document');
  });

  it('maps sub_frame to document', () => {
    expect(getTypeFromRecord({ type: 'sub_frame' })).toBe('document');
  });

  it('maps stylesheet to css', () => {
    expect(getTypeFromRecord({ type: 'stylesheet' })).toBe('css');
  });

  it('maps image to img', () => {
    expect(getTypeFromRecord({ type: 'image' })).toBe('img');
  });

  it('maps xmlhttprequest to xhr', () => {
    expect(getTypeFromRecord({ type: 'xmlhttprequest' })).toBe('xhr');
  });

  it('handles "other" type with JSON content-type as xhr', () => {
    const req = {
      type: 'other',
      responseHeaders: { 'content-type': 'application/json' },
    };
    expect(getTypeFromRecord(req)).toBe('xhr');
  });

  it('handles "other" type with status 101 as websocket', () => {
    const req = { type: 'other', status: 101 };
    expect(getTypeFromRecord(req)).toBe('websocket');
  });

  it('handles "other" type with HTML content-type as xhr', () => {
    const req = {
      type: 'other',
      responseHeaders: { 'content-type': 'text/html' },
    };
    expect(getTypeFromRecord(req)).toBe('xhr');
  });

  it('returns "fetch" for untyped records', () => {
    expect(getTypeFromRecord({})).toBe('fetch');
  });

  it('identifies preflight requests', () => {
    expect(getTypeFromRecord({ method: 'OPTIONS' })).toBe('preflight');
  });

  it('identifies websocket by status 101', () => {
    expect(getTypeFromRecord({ status: 101 })).toBe('websocket');
  });

  it('identifies JSON by mime type for fetch/xhr', () => {
    const req = { type: 'fetch', responseHeaders: { 'content-type': 'application/json; charset=utf-8' } };
    expect(getTypeFromRecord(req)).toBe('json');
  });

  it('identifies JavaScript by mime type', () => {
    const req = { type: 'fetch', responseHeaders: { 'content-type': 'application/javascript' } };
    expect(getTypeFromRecord(req)).toBe('js');
  });

  it('identifies CSS by mime type', () => {
    const req = { type: 'fetch', responseHeaders: { 'content-type': 'text/css' } };
    expect(getTypeFromRecord(req)).toBe('css');
  });

  it('identifies HTML by mime type', () => {
    const req = { type: 'fetch', responseHeaders: { 'content-type': 'text/html' } };
    expect(getTypeFromRecord(req)).toBe('document');
  });

  it('identifies image by mime type', () => {
    const req = { type: 'fetch', responseHeaders: { 'content-type': 'image/png' } };
    expect(getTypeFromRecord(req)).toBe('img');
  });

  it('identifies font by mime type', () => {
    const req = { type: 'fetch', responseHeaders: { 'content-type': 'font/woff2' } };
    expect(getTypeFromRecord(req)).toBe('font');
  });

  it('passes through unknown type for non-fetch/xhr', () => {
    expect(getTypeFromRecord({ type: 'media' })).toBe('media');
  });
});

// ======================================================================
// getUniqueTypes
// ======================================================================
describe('getUniqueTypes', () => {
  it('returns empty for non-array', () => {
    expect(getUniqueTypes(null as any)).toEqual([]);
  });

  it('returns empty for empty array', () => {
    expect(getUniqueTypes([])).toEqual([]);
  });

  it('returns sorted unique types', () => {
    const records = [
      { type: 'script' },
      { type: 'stylesheet' },
      { type: 'script' },
      {},
    ];
    const result = getUniqueTypes(records);
    expect(result).toEqual(['css', 'fetch', 'script']);
  });
});

// ======================================================================
// getUniqueStatusGroups
// ======================================================================
describe('getUniqueStatusGroups', () => {
  it('returns empty for non-array', () => {
    expect(getUniqueStatusGroups(null as any)).toEqual([]);
  });

  it('returns empty for empty array', () => {
    expect(getUniqueStatusGroups([])).toEqual([]);
  });

  it('groups by status ranges', () => {
    const records = [
      { status: 200 },
      { status: 301 },
      { status: 404 },
      { status: 500 },
      { error: true },
      {},
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
  it('returns empty for non-array', () => {
    expect(getUniqueMethods(null as any)).toEqual([]);
  });

  it('returns empty for empty array', () => {
    expect(getUniqueMethods([])).toEqual([]);
  });

  it('returns sorted unique methods', () => {
    const records = [
      { method: 'GET' },
      { method: 'POST' },
      { method: 'GET' },
      {},
    ];
    expect(getUniqueMethods(records)).toEqual(['GET', 'POST']);
  });
});
