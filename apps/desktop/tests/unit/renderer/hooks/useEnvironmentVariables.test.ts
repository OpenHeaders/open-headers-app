// @vitest-environment jsdom
/**
 * Tests for useEnvironmentVariables hook — validates variable CRUD, environment targeting, and metadata.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockShowMessage = vi.fn();
vi.mock('../../../../src/renderer/utils/ui/messageUtil', () => ({
  showMessage: (...args: unknown[]) => mockShowMessage(...args),
}));

const mockSetVariable = vi.fn().mockResolvedValue(undefined);
const mockSetVariableInEnvironment = vi.fn().mockResolvedValue(undefined);
const mockGetAllVariables = vi.fn().mockReturnValue({});

const mockEnvironments: Record<string, Record<string, { value: string; isSecret?: boolean }>> = {
  Default: {
    OAUTH2_CLIENT_ID: { value: 'oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890', isSecret: false },
    API_GATEWAY_URL: { value: 'https://gateway.openheaders.io:8443/v2', isSecret: false },
  },
  'Staging — EU Region': {
    OAUTH2_CLIENT_ID: { value: 'oidc-client-staging-b2c3d4e5-f6a7-8901-bcde-f12345678901', isSecret: false },
    OAUTH2_CLIENT_SECRET: { value: 'ohk_test_7fD48IqMzkXEbskuU2aer8fg', isSecret: true },
  },
  Production: {
    DATABASE_CONNECTION_STRING: {
      value: 'postgresql://prod_user:Pr0d$ecret!@db.openheaders.io:5432/production?sslmode=verify-full',
      isSecret: true,
    },
  },
};

vi.mock('../../../../src/renderer/hooks/environment/useEnvironmentCore', () => ({
  useEnvironmentCore: () => ({
    service: {
      setVariable: mockSetVariable,
      setVariableInEnvironment: mockSetVariableInEnvironment,
      getAllVariables: mockGetAllVariables,
    },
    state: {},
    activeEnvironment: 'Default',
    environments: mockEnvironments,
    isReady: true,
  }),
}));

import { useEnvironmentVariables } from '../../../../src/renderer/hooks/environment/useEnvironmentVariables';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEnvironmentVariables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getVariable ──────────────────────────────────────────────────

  describe('getVariable', () => {
    it('returns variable from active environment', () => {
      const { result } = renderHook(() => useEnvironmentVariables());
      expect(result.current.getVariable('OAUTH2_CLIENT_ID')).toBe('oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('returns variable from specified enterprise environment', () => {
      const { result } = renderHook(() => useEnvironmentVariables());
      expect(result.current.getVariable('OAUTH2_CLIENT_SECRET', 'Staging — EU Region')).toBe(
        'ohk_test_7fD48IqMzkXEbskuU2aer8fg',
      );
    });

    it('returns connection string with special characters', () => {
      const { result } = renderHook(() => useEnvironmentVariables());
      expect(result.current.getVariable('DATABASE_CONNECTION_STRING', 'Production')).toBe(
        'postgresql://prod_user:Pr0d$ecret!@db.openheaders.io:5432/production?sslmode=verify-full',
      );
    });

    it('returns empty string for missing variable', () => {
      const { result } = renderHook(() => useEnvironmentVariables());
      expect(result.current.getVariable('NONEXISTENT_VAR')).toBe('');
    });

    it('returns empty string for variable in non-existent environment', () => {
      const { result } = renderHook(() => useEnvironmentVariables());
      expect(result.current.getVariable('OAUTH2_CLIENT_ID', 'NonExistent')).toBe('');
    });
  });

  // ── getAllVariables ──────────────────────────────────────────────

  describe('getAllVariables', () => {
    it('returns all variables as string map for active environment', () => {
      const { result } = renderHook(() => useEnvironmentVariables());
      const vars = result.current.getAllVariables();
      expect(vars).toEqual({
        OAUTH2_CLIENT_ID: 'oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        API_GATEWAY_URL: 'https://gateway.openheaders.io:8443/v2',
      });
    });

    it('returns variables from specified enterprise environment', () => {
      const { result } = renderHook(() => useEnvironmentVariables());
      const vars = result.current.getAllVariables('Staging — EU Region');
      expect(vars).toEqual({
        OAUTH2_CLIENT_ID: 'oidc-client-staging-b2c3d4e5-f6a7-8901-bcde-f12345678901',
        OAUTH2_CLIENT_SECRET: 'ohk_test_7fD48IqMzkXEbskuU2aer8fg',
      });
    });
  });

  // ── getAllVariablesWithMetadata ───────────────────────────────────

  describe('getAllVariablesWithMetadata', () => {
    it('returns variables with metadata including isSecret', () => {
      const { result } = renderHook(() => useEnvironmentVariables());
      const vars = result.current.getAllVariablesWithMetadata();
      expect(vars.OAUTH2_CLIENT_ID).toEqual({
        value: 'oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        isSecret: false,
      });
      expect(vars.API_GATEWAY_URL).toEqual({
        value: 'https://gateway.openheaders.io:8443/v2',
        isSecret: false,
      });
    });

    it('returns metadata from specific environment', () => {
      const { result } = renderHook(() => useEnvironmentVariables());
      const vars = result.current.getAllVariablesWithMetadata('Staging — EU Region');
      expect(vars.OAUTH2_CLIENT_SECRET).toEqual({
        value: 'ohk_test_7fD48IqMzkXEbskuU2aer8fg',
        isSecret: true,
      });
    });
  });

  // ── setVariable ──────────────────────────────────────────────────

  describe('setVariable', () => {
    it('sets variable in active environment', async () => {
      const { result } = renderHook(() => useEnvironmentVariables());

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.setVariable('REDIS_URL', 'rediss://redis.openheaders.io:6380/0');
      });

      expect(success).toBe(true);
      expect(mockSetVariable).toHaveBeenCalledWith('REDIS_URL', 'rediss://redis.openheaders.io:6380/0', false);
    });

    it('sets secret variable in specific environment', async () => {
      const { result } = renderHook(() => useEnvironmentVariables());

      await act(async () => {
        await result.current.setVariable('STRIPE_WEBHOOK_SECRET', 'whsec_a1b2c3d4e5f6g7h8i9j0', 'Production', true);
      });

      expect(mockSetVariableInEnvironment).toHaveBeenCalledWith(
        'STRIPE_WEBHOOK_SECRET',
        'whsec_a1b2c3d4e5f6g7h8i9j0',
        'Production',
        true,
      );
      expect(mockSetVariable).not.toHaveBeenCalled();
    });

    it('shows error on failure', async () => {
      mockSetVariable.mockRejectedValueOnce(new Error('Storage write failed: disk full'));

      const { result } = renderHook(() => useEnvironmentVariables());

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.setVariable('KEY', 'value');
      });

      expect(success).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', 'Storage write failed: disk full');
    });
  });

  // ── deleteVariable ───────────────────────────────────────────────

  describe('deleteVariable', () => {
    it('deletes by setting value to null', async () => {
      const { result } = renderHook(() => useEnvironmentVariables());

      await act(async () => {
        await result.current.deleteVariable('OAUTH2_CLIENT_ID');
      });

      expect(mockSetVariable).toHaveBeenCalledWith('OAUTH2_CLIENT_ID', null, false);
    });

    it('deletes secret variable', async () => {
      const { result } = renderHook(() => useEnvironmentVariables());

      await act(async () => {
        await result.current.deleteVariable('DATABASE_CONNECTION_STRING');
      });

      expect(mockSetVariable).toHaveBeenCalledWith('DATABASE_CONNECTION_STRING', null, false);
    });
  });
});
