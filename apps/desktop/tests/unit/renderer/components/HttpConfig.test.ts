import { describe, expect, it } from 'vitest';
import { getFormInitialValues } from '@/renderer/components/sources/http-options/HttpConfig';

// ======================================================================
// getFormInitialValues
// ======================================================================
describe('getFormInitialValues', () => {
  it('returns full initial values shape', () => {
    const values = getFormInitialValues();

    expect(values).toEqual({
      sourceMethod: 'GET',
      requestOptions: {
        contentType: 'application/json',
        headers: [],
        queryParams: [],
        body: '',
      },
      jsonFilter: {
        enabled: false,
        path: '',
      },
      refreshOptions: {
        enabled: false,
        type: 'preset',
        interval: 15,
      },
    });
  });

  it('returns correct default source method', () => {
    expect(getFormInitialValues().sourceMethod).toBe('GET');
  });

  it('returns requestOptions with application/json content type', () => {
    expect(getFormInitialValues().requestOptions.contentType).toBe('application/json');
  });

  it('returns empty headers array', () => {
    expect(getFormInitialValues().requestOptions.headers).toEqual([]);
  });

  it('returns empty queryParams array', () => {
    expect(getFormInitialValues().requestOptions.queryParams).toEqual([]);
  });

  it('returns empty body string', () => {
    expect(getFormInitialValues().requestOptions.body).toBe('');
  });

  it('returns jsonFilter disabled by default', () => {
    const { jsonFilter } = getFormInitialValues();
    expect(jsonFilter).toEqual({ enabled: false, path: '' });
  });

  it('returns refreshOptions disabled with preset type and 15s interval', () => {
    const { refreshOptions } = getFormInitialValues();
    expect(refreshOptions).toEqual({
      enabled: false,
      type: 'preset',
      interval: 15,
    });
  });

  it('returns a fresh object each time (no shared references)', () => {
    const a = getFormInitialValues();
    const b = getFormInitialValues();
    expect(a).not.toBe(b);
    expect(a.requestOptions).not.toBe(b.requestOptions);
    expect(a.requestOptions.headers).not.toBe(b.requestOptions.headers);
    expect(a).toEqual(b);
  });
});
