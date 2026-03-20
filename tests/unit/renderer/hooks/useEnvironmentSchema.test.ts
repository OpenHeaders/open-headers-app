// @vitest-environment jsdom
/**
 * Tests for useEnvironmentSchema hook
 *
 * Validates variable usage analysis and schema generation.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockEnvironments = {
  Default: {
    API_KEY: { value: 'key', isSecret: true },
    BASE_URL: { value: 'https://api.test.com' },
    UNUSED: { value: 'x' },
  },
};

vi.mock('../../../../src/renderer/hooks/environment/useEnvironmentCore', () => ({
  useEnvironmentCore: () => ({
    environments: mockEnvironments,
  }),
}));

import { useEnvironmentSchema } from '../../../../src/renderer/hooks/environment/useEnvironmentSchema';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const httpSource = {
  sourceId: 'src-1',
  sourceType: 'http',
  sourcePath: '{{BASE_URL}}/users',
  requestOptions: {
    headers: [{ key: 'Authorization', value: 'Bearer {{API_KEY}}' }],
    queryParams: [{ key: 'token', value: '{{API_KEY}}' }],
    body: '{"secret": "{{API_KEY}}"}',
    totpSecret: '{{TOTP_SECRET}}',
  },
  jsonFilter: { enabled: true, path: '{{JSON_PATH}}' },
};

const fileSource = {
  sourceId: 'src-2',
  sourceType: 'file',
  sourcePath: '/tmp/data.json',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEnvironmentSchema', () => {
  describe('findVariableUsage', () => {
    it('finds variables in URL, headers, query params, body, totp, and jsonFilter', () => {
      const { result } = renderHook(() => useEnvironmentSchema());

      const usage = result.current.findVariableUsage([httpSource]);

      expect(usage.BASE_URL).toEqual(['src-1']);
      expect(usage.API_KEY).toEqual(['src-1']); // deduplicated
      expect(usage.TOTP_SECRET).toEqual(['src-1']);
      expect(usage.JSON_PATH).toEqual(['src-1']);
    });

    it('ignores non-http sources', () => {
      const { result } = renderHook(() => useEnvironmentSchema());

      const usage = result.current.findVariableUsage([fileSource]);

      expect(Object.keys(usage)).toHaveLength(0);
    });

    it('aggregates usage across multiple sources', () => {
      const { result } = renderHook(() => useEnvironmentSchema());

      const secondHttp = {
        sourceId: 'src-3',
        sourceType: 'http',
        sourcePath: '{{BASE_URL}}/items',
      };

      const usage = result.current.findVariableUsage([httpSource, secondHttp]);

      expect(usage.BASE_URL).toEqual(['src-1', 'src-3']);
    });
  });

  describe('generateEnvironmentSchema', () => {
    it('builds schema with environment structure', () => {
      const { result } = renderHook(() => useEnvironmentSchema());

      const schema = result.current.generateEnvironmentSchema([httpSource]);

      expect(schema.environments.Default.variables).toEqual(
        expect.arrayContaining([
          { name: 'API_KEY', isSecret: true },
          { name: 'BASE_URL', isSecret: false },
          { name: 'UNUSED', isSecret: false },
        ])
      );
    });

    it('marks sensitive variables in definitions', () => {
      const { result } = renderHook(() => useEnvironmentSchema());

      const schema = result.current.generateEnvironmentSchema([httpSource]);

      expect(schema.variableDefinitions.API_KEY.isSecret).toBe(true);
      expect(schema.variableDefinitions.BASE_URL.isSecret).toBe(false);
    });

    it('tracks which sources use each variable', () => {
      const { result } = renderHook(() => useEnvironmentSchema());

      const schema = result.current.generateEnvironmentSchema([httpSource]);

      expect(schema.variableDefinitions.API_KEY.usedIn).toEqual(['src-1']);
    });

    it('adds example for URL-like variable names', () => {
      const { result } = renderHook(() => useEnvironmentSchema());

      // Create a source that uses a variable named with URL in the name
      const urlSource = {
        sourceId: 'src-url',
        sourceType: 'http',
        sourcePath: '{{API_URL}}/test',
      };

      const schema = result.current.generateEnvironmentSchema([urlSource]);

      expect(schema.variableDefinitions.API_URL.example).toBe('https://api.example.com');
    });
  });
});
