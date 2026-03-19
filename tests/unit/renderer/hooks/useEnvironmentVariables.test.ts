// @vitest-environment jsdom
/**
 * Tests for useEnvironmentVariables hook
 *
 * Validates variable CRUD, environment targeting, and metadata filtering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
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
    API_KEY: { value: 'abc123', isSecret: true },
    BASE_URL: { value: 'https://api.test.com' },
  },
  Staging: {
    API_KEY: { value: 'staging-key', isSecret: true },
    BASE_URL: { value: 'https://staging.test.com' },
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

      expect(result.current.getVariable('API_KEY')).toBe('abc123');
    });

    it('returns variable from specified environment', () => {
      const { result } = renderHook(() => useEnvironmentVariables());

      expect(result.current.getVariable('BASE_URL', 'Staging')).toBe('https://staging.test.com');
    });

    it('returns empty string for missing variable', () => {
      const { result } = renderHook(() => useEnvironmentVariables());

      expect(result.current.getVariable('MISSING')).toBe('');
    });
  });

  // ── getAllVariables ──────────────────────────────────────────────

  describe('getAllVariables', () => {
    it('returns all variables as string map', () => {
      const { result } = renderHook(() => useEnvironmentVariables());

      const vars = result.current.getAllVariables();

      expect(vars).toEqual({
        API_KEY: 'abc123',
        BASE_URL: 'https://api.test.com',
      });
    });

    it('returns variables from specified environment', () => {
      const { result } = renderHook(() => useEnvironmentVariables());

      const vars = result.current.getAllVariables('Staging');

      expect(vars.BASE_URL).toBe('https://staging.test.com');
    });
  });

  // ── getAllVariablesWithMetadata ───────────────────────────────────

  describe('getAllVariablesWithMetadata', () => {
    it('returns variables with metadata', () => {
      const { result } = renderHook(() => useEnvironmentVariables());

      const vars = result.current.getAllVariablesWithMetadata();

      expect(vars.API_KEY).toEqual({ value: 'abc123', isSecret: true });
      expect(vars.BASE_URL).toEqual({ value: 'https://api.test.com' });
    });
  });

  // ── setVariable ──────────────────────────────────────────────────

  describe('setVariable', () => {
    it('sets variable in active environment', async () => {
      const { result } = renderHook(() => useEnvironmentVariables());

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.setVariable('NEW_VAR', 'value');
      });

      expect(success).toBe(true);
      expect(mockSetVariable).toHaveBeenCalledWith('NEW_VAR', 'value', false);
    });

    it('sets variable in specific environment', async () => {
      const { result } = renderHook(() => useEnvironmentVariables());

      await act(async () => {
        await result.current.setVariable('KEY', 'val', 'Staging', true);
      });

      expect(mockSetVariableInEnvironment).toHaveBeenCalledWith('KEY', 'val', 'Staging', true);
      expect(mockSetVariable).not.toHaveBeenCalled();
    });

    it('shows error on failure', async () => {
      mockSetVariable.mockRejectedValueOnce(new Error('Save failed'));

      const { result } = renderHook(() => useEnvironmentVariables());

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.setVariable('X', 'y');
      });

      expect(success).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', 'Save failed');
    });
  });

  // ── deleteVariable ───────────────────────────────────────────────

  describe('deleteVariable', () => {
    it('deletes by setting value to null', async () => {
      const { result } = renderHook(() => useEnvironmentVariables());

      await act(async () => {
        await result.current.deleteVariable('API_KEY');
      });

      expect(mockSetVariable).toHaveBeenCalledWith('API_KEY', null, false);
    });
  });
});
