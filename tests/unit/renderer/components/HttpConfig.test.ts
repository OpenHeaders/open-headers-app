import { describe, it, expect, vi } from 'vitest';
import {
  getFormInitialValues,
} from '../../../../src/renderer/components/sources/http-options/HttpConfig';

// ======================================================================
// getFormInitialValues
// ======================================================================
describe('getFormInitialValues', () => {
  it('returns correct default source method', () => {
    const values = getFormInitialValues();
    expect(values.sourceMethod).toBe('GET');
  });

  it('returns requestOptions with application/json content type', () => {
    const values = getFormInitialValues();
    expect(values.requestOptions.contentType).toBe('application/json');
  });

  it('returns empty headers array', () => {
    const values = getFormInitialValues();
    expect(values.requestOptions.headers).toEqual([]);
  });

  it('returns empty queryParams array', () => {
    const values = getFormInitialValues();
    expect(values.requestOptions.queryParams).toEqual([]);
  });

  it('returns empty body string', () => {
    const values = getFormInitialValues();
    expect(values.requestOptions.body).toBe('');
  });

  it('returns jsonFilter disabled by default', () => {
    const values = getFormInitialValues();
    expect(values.jsonFilter.enabled).toBe(false);
    expect(values.jsonFilter.path).toBe('');
  });

  it('returns refreshOptions disabled with preset type and 15 interval', () => {
    const values = getFormInitialValues();
    expect(values.refreshOptions.enabled).toBe(false);
    expect(values.refreshOptions.type).toBe('preset');
    expect(values.refreshOptions.interval).toBe(15);
  });

  it('returns a fresh object each time', () => {
    const a = getFormInitialValues();
    const b = getFormInitialValues();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
