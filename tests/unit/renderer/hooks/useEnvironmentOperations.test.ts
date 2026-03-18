// @vitest-environment jsdom
/**
 * Tests for useEnvironmentOperations hook
 *
 * Validates environment CRUD, switch, clone, and waitForEnvironments.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const mockShowMessage = vi.fn();
vi.mock('../../../../src/renderer/utils/ui/messageUtil', () => ({
  showMessage: (...args: unknown[]) => mockShowMessage(...args),
}));

const mockCreateEnvironment = vi.fn();
const mockDeleteEnvironment = vi.fn();
const mockSwitchEnvironment = vi.fn();
const mockBatchSetVariables = vi.fn();
const mockWaitForReady = vi.fn();

const mockEnvironments: Record<string, Record<string, { value: string; isSecret: boolean }>> = {
  Default: {
    API_KEY: { value: 'abc123', isSecret: true },
    BASE_URL: { value: 'https://api.example.com', isSecret: false },
  },
  Staging: {
    API_KEY: { value: 'stg456', isSecret: true },
  },
};

vi.mock('../../../../src/renderer/hooks/environment/useEnvironmentCore', () => ({
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

import { useEnvironmentOperations } from '../../../../src/renderer/hooks/environment/useEnvironmentOperations';

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
    it('creates environment and shows success', async () => {
      const { result } = renderHook(() => useEnvironmentOperations());

      let created = false;
      await act(async () => {
        created = await result.current.createEnvironment('Production');
      });

      expect(created).toBe(true);
      expect(mockCreateEnvironment).toHaveBeenCalledWith('Production');
      expect(mockShowMessage).toHaveBeenCalledWith('success', "Environment 'Production' created");
    });

    it('returns false on error', async () => {
      mockCreateEnvironment.mockRejectedValue(new Error('Already exists'));

      const { result } = renderHook(() => useEnvironmentOperations());

      let created = true;
      await act(async () => {
        created = await result.current.createEnvironment('Default');
      });

      expect(created).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', 'Already exists');
    });
  });

  describe('deleteEnvironment', () => {
    it('deletes environment and shows success', async () => {
      const { result } = renderHook(() => useEnvironmentOperations());

      let deleted = false;
      await act(async () => {
        deleted = await result.current.deleteEnvironment('Staging');
      });

      expect(deleted).toBe(true);
      expect(mockDeleteEnvironment).toHaveBeenCalledWith('Staging');
      expect(mockShowMessage).toHaveBeenCalledWith('success', "Environment 'Staging' deleted");
    });
  });

  describe('switchEnvironment', () => {
    it('switches and shows success', async () => {
      const { result } = renderHook(() => useEnvironmentOperations());

      let switched = false;
      await act(async () => {
        switched = await result.current.switchEnvironment('Staging');
      });

      expect(switched).toBe(true);
      expect(mockSwitchEnvironment).toHaveBeenCalledWith('Staging');
      expect(mockShowMessage).toHaveBeenCalledWith('success', "Switched to 'Staging' environment");
    });
  });

  describe('cloneEnvironment', () => {
    it('clones environment with all variables', async () => {
      const { result } = renderHook(() => useEnvironmentOperations());

      let cloned = false;
      await act(async () => {
        cloned = await result.current.cloneEnvironment('Default', 'Default-Copy');
      });

      expect(cloned).toBe(true);
      expect(mockCreateEnvironment).toHaveBeenCalledWith('Default-Copy');
      expect(mockBatchSetVariables).toHaveBeenCalledWith('Default-Copy', [
        { name: 'API_KEY', value: 'abc123', isSecret: true },
        { name: 'BASE_URL', value: 'https://api.example.com', isSecret: false },
      ]);
      expect(mockShowMessage).toHaveBeenCalledWith('success', "Environment 'Default' cloned to 'Default-Copy'");
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
        ready = await result.current.waitForEnvironments(1000);
      });

      expect(ready).toBe(false);
      expect(mockWaitForReady).toHaveBeenCalledWith(1000);
    });
  });
});
