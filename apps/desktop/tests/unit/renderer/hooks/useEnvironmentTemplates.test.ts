// @vitest-environment jsdom
/**
 * Tests for useEnvironmentTemplates hook — validates template resolution for strings, objects, and nested structures.
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockResolveTemplate = vi.fn((template: string) => {
  return template
    .replace('{{API_GATEWAY_URL}}', 'https://gateway.openheaders.io:8443/v2')
    .replace('{{OAUTH2_ACCESS_TOKEN}}', 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig')
    .replace('{{DATABASE_HOST}}', 'db.openheaders.io')
    .replace('{{DATABASE_PORT}}', '5432');
});

vi.mock('@/renderer/hooks/environment/useEnvironmentCore', () => ({
  useEnvironmentCore: () => ({
    service: {
      resolveTemplate: mockResolveTemplate,
    },
  }),
}));

import { useEnvironmentTemplates } from '@/renderer/hooks/environment/useEnvironmentTemplates';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEnvironmentTemplates', () => {
  beforeEach(() => {
    mockResolveTemplate.mockClear();
  });

  describe('resolveTemplate', () => {
    it('resolves enterprise URL template', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());
      const resolved = result.current.resolveTemplate('{{API_GATEWAY_URL}}/oauth2/token');
      expect(resolved).toBe('https://gateway.openheaders.io:8443/v2/oauth2/token');
    });

    it('resolves JWT Bearer token template', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());
      const resolved = result.current.resolveTemplate('Bearer {{OAUTH2_ACCESS_TOKEN}}');
      expect(resolved).toBe('Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig');
    });

    it('returns plain string unchanged', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());
      const resolved = result.current.resolveTemplate('https://api.openheaders.io/health');
      expect(resolved).toBe('https://api.openheaders.io/health');
    });

    it('resolves multiple variables in single template', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());
      const resolved = result.current.resolveTemplate('postgresql://admin@{{DATABASE_HOST}}:{{DATABASE_PORT}}/prod');
      expect(resolved).toBe('postgresql://admin@db.openheaders.io:5432/prod');
    });
  });

  describe('resolveObjectTemplate', () => {
    it('resolves string values in enterprise config object', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());
      const resolved = result.current.resolveObjectTemplate({
        url: '{{API_GATEWAY_URL}}/resources',
        authorization: 'Bearer {{OAUTH2_ACCESS_TOKEN}}',
      });
      expect(resolved).toEqual({
        url: 'https://gateway.openheaders.io:8443/v2/resources',
        authorization: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
      });
    });

    it('resolves nested config objects', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());
      const resolved = result.current.resolveObjectTemplate({
        database: {
          host: '{{DATABASE_HOST}}',
          port: '{{DATABASE_PORT}}',
        },
        api: {
          gateway: '{{API_GATEWAY_URL}}',
        },
      });
      expect(resolved).toEqual({
        database: {
          host: 'db.openheaders.io',
          port: '5432',
        },
        api: {
          gateway: 'https://gateway.openheaders.io:8443/v2',
        },
      });
    });

    it('resolves arrays of config objects', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());
      const resolved = result.current.resolveObjectTemplate([
        { endpoint: '{{API_GATEWAY_URL}}/v1' },
        { auth: 'Bearer {{OAUTH2_ACCESS_TOKEN}}' },
      ]);
      expect(resolved).toEqual([
        { endpoint: 'https://gateway.openheaders.io:8443/v2/v1' },
        { auth: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig' },
      ]);
    });

    it('returns string array items unchanged (only object values are resolved)', () => {
      const { result } = renderHook(() => useEnvironmentTemplates());
      const resolved = result.current.resolveObjectTemplate(['{{API_GATEWAY_URL}}', 'static-value']);
      expect(resolved).toEqual(['{{API_GATEWAY_URL}}', 'static-value']);
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
        url: '{{API_GATEWAY_URL}}',
        timeout: 30000,
        retryEnabled: true,
        maxRetries: 3,
      });
      expect(resolved).toEqual({
        url: 'https://gateway.openheaders.io:8443/v2',
        timeout: 30000,
        retryEnabled: true,
        maxRetries: 3,
      });
    });
  });
});
