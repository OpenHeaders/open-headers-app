// @vitest-environment jsdom
/**
 * Tests for useEnvironmentTemplates hook
 *
 * Validates template resolution for strings, objects, and nested structures.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockResolveTemplate = vi.fn((template: string) => {
  // Simulate basic template resolution
  return template
    .replace('{{API_URL}}', 'https://api.test.com')
    .replace('{{TOKEN}}', 'secret123');
});

vi.mock('../../../../src/renderer/hooks/environment/useEnvironmentCore', () => ({
  useEnvironmentCore: () => ({
    service: {
      resolveTemplate: mockResolveTemplate,
    },
  }),
}));

import { useEnvironmentTemplates } from '../../../../src/renderer/hooks/environment/useEnvironmentTemplates';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEnvironmentTemplates', () => {
  beforeEach(() => {
    mockResolveTemplate.mockClear();
  });

  describe('resolveTemplate', () => {
    it('resolves string template', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());

      const resolved = result.current.resolveTemplate('{{API_URL}}/users');

      expect(resolved).toBe('https://api.test.com/users');
    });

    it('returns plain string unchanged', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());

      const resolved = result.current.resolveTemplate('plain text');

      expect(resolved).toBe('plain text');
    });
  });

  describe('resolveObjectTemplate', () => {
    it('resolves string values in objects', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());

      const resolved = result.current.resolveObjectTemplate({
        url: '{{API_URL}}/data',
        token: '{{TOKEN}}',
      });

      expect(resolved).toEqual({
        url: 'https://api.test.com/data',
        token: 'secret123',
      });
    });

    it('resolves nested objects', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());

      const resolved = result.current.resolveObjectTemplate({
        config: {
          endpoint: '{{API_URL}}',
        },
      });

      expect(resolved).toEqual({
        config: {
          endpoint: 'https://api.test.com',
        },
      });
    });

    it('resolves arrays of objects', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());

      const resolved = result.current.resolveObjectTemplate([
        { url: '{{API_URL}}' },
        { auth: '{{TOKEN}}' },
      ]);

      expect(resolved).toEqual([
        { url: 'https://api.test.com' },
        { auth: 'secret123' },
      ]);
    });

    it('returns string array items unchanged (only object values are resolved)', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());

      const resolved = result.current.resolveObjectTemplate([
        '{{API_URL}}',
        'plain',
      ]);

      // Standalone strings in arrays are not resolved (they are primitives)
      expect(resolved).toEqual(['{{API_URL}}', 'plain']);
    });

    it('returns primitives unchanged', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());

      expect(result.current.resolveObjectTemplate(null)).toBeNull();
      expect(result.current.resolveObjectTemplate(42)).toBe(42);
      expect(result.current.resolveObjectTemplate(undefined)).toBeUndefined();
    });

    it('preserves non-string values in objects', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());

      const resolved = result.current.resolveObjectTemplate({
        url: '{{API_URL}}',
        timeout: 5000,
        enabled: true,
      });

      expect(resolved).toEqual({
        url: 'https://api.test.com',
        timeout: 5000,
        enabled: true,
      });
    });
  });
});
