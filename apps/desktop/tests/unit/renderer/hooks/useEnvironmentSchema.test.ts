// @vitest-environment jsdom
/**
 * Tests for useEnvironmentSchema hook — validates variable usage analysis and schema generation.
 */

import type { Source } from '@openheaders/core';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockEnvironments = {
  Default: {
    OAUTH2_CLIENT_ID: { value: 'oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890', isSecret: false },
    OAUTH2_CLIENT_SECRET: { value: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc', isSecret: true },
    API_GATEWAY_URL: { value: 'https://gateway.openheaders.io:8443/v2' },
    UNUSED_LEGACY_VAR: { value: 'deprecated-value' },
  },
  Production: {
    REDIS_URL: { value: 'rediss://redis.openheaders.io:6380/0', isSecret: true },
  },
};

vi.mock('@/renderer/hooks/environment/useEnvironmentCore', () => ({
  useEnvironmentCore: () => ({
    environments: mockEnvironments,
  }),
}));

import { useEnvironmentSchema } from '@/renderer/hooks/environment/useEnvironmentSchema';

// ---------------------------------------------------------------------------
// Enterprise test data
// ---------------------------------------------------------------------------

const oauthSource: Source = {
  sourceId: 'src-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  sourceType: 'http',
  sourcePath: '{{API_GATEWAY_URL}}/oauth2/token',
  requestOptions: {
    headers: [
      { key: 'Authorization', value: 'Basic {{OAUTH2_CLIENT_ID}}:{{OAUTH2_CLIENT_SECRET}}' },
      { key: 'Content-Type', value: 'application/x-www-form-urlencoded' },
    ],
    queryParams: [{ key: 'scope', value: '{{OAUTH_SCOPE}}' }],
    body: '{"grant_type": "client_credentials", "client_id": "{{OAUTH2_CLIENT_ID}}"}',
    totpSecret: '{{TOTP_SECRET}}',
  },
  jsonFilter: { enabled: true, path: '{{JSON_FILTER_PATH}}' },
};

const fileSource: Source = {
  sourceId: 'src-file-b2c3d4e5-f6a7-8901-bcde-f12345678901',
  sourceType: 'file',
  sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json',
};

const apiKeySource: Source = {
  sourceId: 'src-apikey-c3d4e5f6-a7b8-9012-cdef-123456789012',
  sourceType: 'http',
  sourcePath: '{{API_GATEWAY_URL}}/v2/resources',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEnvironmentSchema', () => {
  describe('findVariableUsage', () => {
    it('finds all variables across URL, headers, query params, body, totp, and jsonFilter', () => {
      const { result } = renderHook(() => useEnvironmentSchema());
      const usage = result.current.findVariableUsage([oauthSource]);

      expect(usage.API_GATEWAY_URL).toEqual(['src-a1b2c3d4-e5f6-7890-abcd-ef1234567890']);
      expect(usage.OAUTH2_CLIENT_ID).toEqual(['src-a1b2c3d4-e5f6-7890-abcd-ef1234567890']); // deduplicated
      expect(usage.OAUTH2_CLIENT_SECRET).toEqual(['src-a1b2c3d4-e5f6-7890-abcd-ef1234567890']);
      expect(usage.OAUTH_SCOPE).toEqual(['src-a1b2c3d4-e5f6-7890-abcd-ef1234567890']);
      expect(usage.TOTP_SECRET).toEqual(['src-a1b2c3d4-e5f6-7890-abcd-ef1234567890']);
      expect(usage.JSON_FILTER_PATH).toEqual(['src-a1b2c3d4-e5f6-7890-abcd-ef1234567890']);
    });

    it('ignores non-http sources', () => {
      const { result } = renderHook(() => useEnvironmentSchema());
      const usage = result.current.findVariableUsage([fileSource]);
      expect(Object.keys(usage)).toHaveLength(0);
    });

    it('aggregates usage across multiple enterprise sources', () => {
      const { result } = renderHook(() => useEnvironmentSchema());
      const usage = result.current.findVariableUsage([oauthSource, apiKeySource]);

      expect(usage.API_GATEWAY_URL).toEqual([
        'src-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        'src-apikey-c3d4e5f6-a7b8-9012-cdef-123456789012',
      ]);
    });

    it('handles source with no variables', () => {
      const staticSource: Source = {
        sourceId: 'src-static',
        sourceType: 'http',
        sourcePath: 'https://api.openheaders.io/health',
      };
      const { result } = renderHook(() => useEnvironmentSchema());
      const usage = result.current.findVariableUsage([staticSource]);
      expect(Object.keys(usage)).toHaveLength(0);
    });
  });

  describe('generateEnvironmentSchema', () => {
    it('builds schema with enterprise environment structure', () => {
      const { result } = renderHook(() => useEnvironmentSchema());
      const schema = result.current.generateEnvironmentSchema([oauthSource]);

      expect(schema.environments.Default.variables).toEqual(
        expect.arrayContaining([
          { name: 'OAUTH2_CLIENT_ID', isSecret: false },
          { name: 'OAUTH2_CLIENT_SECRET', isSecret: true },
          { name: 'API_GATEWAY_URL', isSecret: false },
          { name: 'UNUSED_LEGACY_VAR', isSecret: false },
        ]),
      );
    });

    it('marks sensitive variables correctly in definitions', () => {
      const { result } = renderHook(() => useEnvironmentSchema());
      const schema = result.current.generateEnvironmentSchema([oauthSource]);

      expect(schema.variableDefinitions.OAUTH2_CLIENT_SECRET.isSecret).toBe(true);
      expect(schema.variableDefinitions.API_GATEWAY_URL.isSecret).toBe(false);
      expect(schema.variableDefinitions.OAUTH2_CLIENT_ID.isSecret).toBe(false);
    });

    it('tracks which sources use each variable', () => {
      const { result } = renderHook(() => useEnvironmentSchema());
      const schema = result.current.generateEnvironmentSchema([oauthSource, apiKeySource]);

      expect(schema.variableDefinitions.API_GATEWAY_URL.usedIn).toEqual([
        'src-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        'src-apikey-c3d4e5f6-a7b8-9012-cdef-123456789012',
      ]);
      expect(schema.variableDefinitions.OAUTH2_CLIENT_ID.usedIn).toEqual(['src-a1b2c3d4-e5f6-7890-abcd-ef1234567890']);
    });

    it('adds example for URL-like variable names', () => {
      const { result } = renderHook(() => useEnvironmentSchema());
      const urlSource: Source = {
        sourceId: 'src-url',
        sourceType: 'http',
        sourcePath: '{{WEBHOOK_URL}}/callback',
      };
      const schema = result.current.generateEnvironmentSchema([urlSource]);
      expect(schema.variableDefinitions.WEBHOOK_URL.example).toBe('https://api.example.com');
    });

    it('includes all environments from mock (Default and Production)', () => {
      const { result } = renderHook(() => useEnvironmentSchema());
      const schema = result.current.generateEnvironmentSchema([]);
      expect(Object.keys(schema.environments)).toContain('Default');
      expect(Object.keys(schema.environments)).toContain('Production');
    });
  });
});
