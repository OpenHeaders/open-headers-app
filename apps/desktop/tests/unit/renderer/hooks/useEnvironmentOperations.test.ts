// @vitest-environment jsdom
/**
 * Tests for useEnvironmentOperations hook — validates CRUD, switch, clone, and waitForEnvironments.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const mockShowMessage = vi.fn();
vi.mock('@/renderer/utils/ui/messageUtil', () => ({
  showMessage: (...args: unknown[]) => mockShowMessage(...args),
}));

const mockCreateEnvironment = vi.fn();
const mockDeleteEnvironment = vi.fn();
const mockSwitchEnvironment = vi.fn();
const mockBatchSetVariables = vi.fn();
const mockWaitForReady = vi.fn();

const mockEnvironments: Record<string, Record<string, { value: string; isSecret: boolean }>> = {
  Default: {
    OAUTH2_CLIENT_ID: { value: 'oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890', isSecret: false },
    API_GATEWAY_URL: { value: 'https://gateway.openheaders.io:8443/v2', isSecret: false },
  },
  'Staging — EU Region': {
    OAUTH2_CLIENT_ID: { value: 'oidc-client-staging-b2c3d4e5-f6a7-8901-bcde-f12345678901', isSecret: false },
    OAUTH2_CLIENT_SECRET: { value: 'ohk_test_7fD48IqMzkXEbskuU2aer8fg', isSecret: true },
    API_GATEWAY_URL: { value: 'https://staging-eu.openheaders.io:8443/v2', isSecret: false },
  },
  Production: {
    OAUTH2_CLIENT_SECRET: { value: 'sk_prod_9hF60KrOalZGdumwW4cgt0hi', isSecret: true },
    DATABASE_CONNECTION_STRING: {
      value: 'postgresql://prod_user:Pr0d$ecret!@db.openheaders.io:5432/production',
      isSecret: true,
    },
  },
};

vi.mock('@/renderer/hooks/environment/useEnvironmentCore', () => ({
  useEnvironmentCore: () => ({
    service: {
      createEnvironment: mockCreateEnvironment,
      deleteEnvironment: mockDeleteEnvironment,
      switchEnvironment: mockSwitchEnvironment,
      batchSetVariablesInEnvironment: mockBatchSetVariables,
      waitForReady: mockWaitForReady,
    },
    environments: mockEnvironments,
    activeEnvironment: 'Default',
  }),
}));

import { useEnvironmentOperations } from '@/renderer/hooks/environment/useEnvironmentOperations';

describe('useEnvironmentOperations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockShowMessage.mockClear();
    mockCreateEnvironment.mockReset().mockResolvedValue(undefined);
    mockDeleteEnvironment.mockReset().mockResolvedValue(undefined);
    mockSwitchEnvironment.mockReset().mockResolvedValue(undefined);
    mockBatchSetVariables.mockReset().mockResolvedValue(undefined);
    mockWaitForReady.mockReset().mockResolvedValue(true);
  });

  it('returns environments and active environment', () => {
    const { result } = renderHook(() => useEnvironmentOperations());
    expect(result.current.environments).toEqual(mockEnvironments);
    expect(result.current.activeEnvironment).toBe('Default');
  });

  describe('createEnvironment', () => {
    it('creates enterprise environment and shows success', async () => {
      const { result } = renderHook(() => useEnvironmentOperations());

      let created = false;
      await act(async () => {
        created = await result.current.createEnvironment('DR — Disaster Recovery');
      });

      expect(created).toBe(true);
      expect(mockCreateEnvironment).toHaveBeenCalledWith('DR — Disaster Recovery');
      expect(mockShowMessage).toHaveBeenCalledWith('success', "Environment 'DR — Disaster Recovery' created");
    });

    it('returns false on error with descriptive message', async () => {
      mockCreateEnvironment.mockRejectedValue(new Error("Environment 'Default' already exists"));

      const { result } = renderHook(() => useEnvironmentOperations());

      let created = true;
      await act(async () => {
        created = await result.current.createEnvironment('Default');
      });

      expect(created).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', "Environment 'Default' already exists");
    });
  });

  describe('deleteEnvironment', () => {
    it('deletes environment and shows success', async () => {
      const { result } = renderHook(() => useEnvironmentOperations());

      let deleted = false;
      await act(async () => {
        deleted = await result.current.deleteEnvironment('Staging — EU Region');
      });

      expect(deleted).toBe(true);
      expect(mockDeleteEnvironment).toHaveBeenCalledWith('Staging — EU Region');
      expect(mockShowMessage).toHaveBeenCalledWith('success', "Environment 'Staging — EU Region' deleted");
    });

    it('returns false when deletion fails', async () => {
      mockDeleteEnvironment.mockRejectedValue(new Error('Cannot delete Default environment'));

      const { result } = renderHook(() => useEnvironmentOperations());

      let deleted = true;
      await act(async () => {
        deleted = await result.current.deleteEnvironment('Default');
      });

      expect(deleted).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', 'Cannot delete Default environment');
    });
  });

  describe('switchEnvironment', () => {
    it('switches to enterprise environment and shows success', async () => {
      const { result } = renderHook(() => useEnvironmentOperations());

      let switched = false;
      await act(async () => {
        switched = await result.current.switchEnvironment('Production');
      });

      expect(switched).toBe(true);
      expect(mockSwitchEnvironment).toHaveBeenCalledWith('Production');
      expect(mockShowMessage).toHaveBeenCalledWith('success', "Switched to 'Production' environment");
    });

    it('handles environment names with special characters', async () => {
      const { result } = renderHook(() => useEnvironmentOperations());

      await act(async () => {
        await result.current.switchEnvironment('Staging — EU Region');
      });

      expect(mockSwitchEnvironment).toHaveBeenCalledWith('Staging — EU Region');
    });
  });

  describe('cloneEnvironment', () => {
    it('clones Staging environment with all 3 variables', async () => {
      const { result } = renderHook(() => useEnvironmentOperations());

      let cloned = false;
      await act(async () => {
        cloned = await result.current.cloneEnvironment('Staging — EU Region', 'Staging — EU Region-Copy');
      });

      expect(cloned).toBe(true);
      expect(mockCreateEnvironment).toHaveBeenCalledWith('Staging — EU Region-Copy');
      expect(mockBatchSetVariables).toHaveBeenCalledWith('Staging — EU Region-Copy', [
        {
          name: 'OAUTH2_CLIENT_ID',
          value: 'oidc-client-staging-b2c3d4e5-f6a7-8901-bcde-f12345678901',
          isSecret: false,
        },
        { name: 'OAUTH2_CLIENT_SECRET', value: 'ohk_test_7fD48IqMzkXEbskuU2aer8fg', isSecret: true },
        { name: 'API_GATEWAY_URL', value: 'https://staging-eu.openheaders.io:8443/v2', isSecret: false },
      ]);
      expect(mockShowMessage).toHaveBeenCalledWith(
        'success',
        "Environment 'Staging — EU Region' cloned to 'Staging — EU Region-Copy'",
      );
    });

    it('fails if source environment does not exist', async () => {
      const { result } = renderHook(() => useEnvironmentOperations());

      let cloned = true;
      await act(async () => {
        cloned = await result.current.cloneEnvironment('NonExistent', 'Copy');
      });

      expect(cloned).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', expect.stringContaining('does not exist'));
    });

    it('clones Production with secret connection string', async () => {
      const { result } = renderHook(() => useEnvironmentOperations());

      await act(async () => {
        await result.current.cloneEnvironment('Production', 'Production-DR');
      });

      expect(mockBatchSetVariables).toHaveBeenCalledWith('Production-DR', [
        { name: 'OAUTH2_CLIENT_SECRET', value: 'sk_prod_9hF60KrOalZGdumwW4cgt0hi', isSecret: true },
        {
          name: 'DATABASE_CONNECTION_STRING',
          value: 'postgresql://prod_user:Pr0d$ecret!@db.openheaders.io:5432/production',
          isSecret: true,
        },
      ]);
    });
  });

  describe('waitForEnvironments', () => {
    it('returns true when environments are ready', async () => {
      const { result } = renderHook(() => useEnvironmentOperations());

      let ready = false;
      await act(async () => {
        ready = await result.current.waitForEnvironments();
      });

      expect(ready).toBe(true);
      expect(mockWaitForReady).toHaveBeenCalledWith(5000);
    });

    it('returns false on timeout', async () => {
      mockWaitForReady.mockResolvedValue(false);

      const { result } = renderHook(() => useEnvironmentOperations());

      let ready = true;
      await act(async () => {
        ready = await result.current.waitForEnvironments(2000);
      });

      expect(ready).toBe(false);
      expect(mockWaitForReady).toHaveBeenCalledWith(2000);
    });
  });
});
