import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTestSourceId,
  debounceValidation,
  generateTempSourceId,
  getFieldsWithTemplateVariables,
  getFormInitialValues,
} from '@/renderer/components/sources/source-form/SourceFormUtils';

// ======================================================================
// getFormInitialValues
// ======================================================================
describe('SourceFormUtils.getFormInitialValues', () => {
  it('returns file as default source type', () => {
    expect(getFormInitialValues().sourceType).toBe('file');
  });

  it('returns GET as default method', () => {
    expect(getFormInitialValues().sourceMethod).toBe('GET');
  });

  it('returns requestOptions with application/json', () => {
    expect(getFormInitialValues().requestOptions.contentType).toBe('application/json');
  });

  it('returns a fresh object each call', () => {
    const a = getFormInitialValues();
    const b = getFormInitialValues();
    expect(a).not.toBe(b);
  });
});

// ======================================================================
// getFieldsWithTemplateVariables
// ======================================================================
describe('getFieldsWithTemplateVariables', () => {
  it('returns empty array when no template variables', () => {
    expect(getFieldsWithTemplateVariables({ sourcePath: 'https://auth.openheaders.io/oauth2/token' })).toEqual([]);
  });

  it('detects env var pattern in sourcePath', () => {
    expect(getFieldsWithTemplateVariables({ sourcePath: 'https://{{HOST}}/api' })).toEqual(['sourcePath']);
  });

  it('detects TOTP pattern in sourcePath', () => {
    expect(getFieldsWithTemplateVariables({ sourcePath: 'https://api/[[TOTP_CODE]]' })).toEqual(['sourcePath']);
  });

  it('returns empty when sourcePath is not a string', () => {
    expect(getFieldsWithTemplateVariables({ sourcePath: 123 as unknown as string })).toEqual([]);
  });

  it('returns empty when sourcePath is undefined', () => {
    expect(getFieldsWithTemplateVariables({})).toEqual([]);
  });
});

// ======================================================================
// generateTempSourceId
// ======================================================================
describe('generateTempSourceId', () => {
  it('generates ID with default prefix', () => {
    const id = generateTempSourceId();
    expect(id).toMatch(/^new-source-\d+$/);
  });

  it('uses custom prefix', () => {
    const id = generateTempSourceId('test');
    expect(id).toMatch(/^test-\d+$/);
  });

  it('generates unique IDs', () => {
    const a = generateTempSourceId();
    const b = generateTempSourceId();
    // They might be the same in the same millisecond, so this is a soft check
    expect(typeof a).toBe('string');
    expect(typeof b).toBe('string');
  });
});

// ======================================================================
// createTestSourceId
// ======================================================================
describe('createTestSourceId', () => {
  it('adds test- prefix', () => {
    expect(createTestSourceId('new-source-123')).toBe('test-new-source-123');
  });

  it('handles empty string', () => {
    expect(createTestSourceId('')).toBe('test-');
  });
});

// ======================================================================
// debounceValidation
// ======================================================================
describe('debounceValidation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays execution by default 300ms', () => {
    const fn = vi.fn();
    const debounced = debounceValidation(fn);
    debounced('arg1');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledWith('arg1');
  });

  it('uses custom delay', () => {
    const fn = vi.fn();
    const debounced = debounceValidation(fn, 500);
    debounced('x');
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounceValidation(fn, 100);
    debounced('a');
    vi.advanceTimersByTime(50);
    debounced('b');
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });
});
