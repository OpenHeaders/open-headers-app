// @vitest-environment jsdom
/**
 * Tests for useEnv hook
 *
 * Validates IPC delegation and input validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetEnvVariable = vi.fn();

Object.defineProperty(window, 'electronAPI', {
  value: { getEnvVariable: mockGetEnvVariable },
  writable: true,
});

import { useEnv } from '../../../../src/renderer/hooks/useEnv';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEnv', () => {
  beforeEach(() => {
    mockGetEnvVariable.mockReset();
  });

  it('returns getVariable function', () => {
    const { result } = renderHook(() => useEnv());
    expect(typeof result.current.getVariable).toBe('function');
  });

  it('calls electronAPI.getEnvVariable with the name', async () => {
    mockGetEnvVariable.mockResolvedValue('bar');

    const { result } = renderHook(() => useEnv());

    let value: string | undefined;
    await act(async () => {
      value = await result.current.getVariable('FOO');
    });

    expect(mockGetEnvVariable).toHaveBeenCalledWith('FOO');
    expect(value).toBe('bar');
  });

  it('throws when name is empty', async () => {
    const { result } = renderHook(() => useEnv());

    await expect(
      act(async () => {
        await result.current.getVariable('');
      })
    ).rejects.toThrow('Environment variable name is required');
  });

  it('wraps IPC errors with descriptive message', async () => {
    mockGetEnvVariable.mockRejectedValue(new Error('IPC timeout'));

    const { result } = renderHook(() => useEnv());

    await expect(
      act(async () => {
        await result.current.getVariable('MISSING');
      })
    ).rejects.toThrow('Error getting environment variable: IPC timeout');
  });
});
