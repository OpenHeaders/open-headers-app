// @vitest-environment jsdom
/**
 * Tests for useEnv hook — validates IPC delegation and input validation.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('calls electronAPI.getEnvVariable with enterprise variable name', async () => {
    mockGetEnvVariable.mockResolvedValue('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');

    const { result } = renderHook(() => useEnv());

    let value: string | undefined;
    await act(async () => {
      value = await result.current.getVariable('OAUTH2_CLIENT_SECRET');
    });

    expect(mockGetEnvVariable).toHaveBeenCalledWith('OAUTH2_CLIENT_SECRET');
    expect(value).toBe('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
  });

  it('handles connection string values with special characters', async () => {
    const connStr = 'postgresql://admin:P@ss=w0rd&special@db.openheaders.io:5432/production?sslmode=require';
    mockGetEnvVariable.mockResolvedValue(connStr);

    const { result } = renderHook(() => useEnv());

    let value: string | undefined;
    await act(async () => {
      value = await result.current.getVariable('DATABASE_CONNECTION_STRING');
    });

    expect(value).toBe(connStr);
  });

  it('handles JWT token values', async () => {
    const jwt =
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIiwiaWF0IjoxNzE2MDAwMDAwfQ.signature';
    mockGetEnvVariable.mockResolvedValue(jwt);

    const { result } = renderHook(() => useEnv());

    let value: string | undefined;
    await act(async () => {
      value = await result.current.getVariable('BEARER_TOKEN');
    });

    expect(value).toBe(jwt);
  });

  it('throws when name is empty', async () => {
    const { result } = renderHook(() => useEnv());

    await expect(
      act(async () => {
        await result.current.getVariable('');
      }),
    ).rejects.toThrow('Environment variable name is required');
  });

  it('wraps IPC errors with descriptive message', async () => {
    mockGetEnvVariable.mockRejectedValue(new Error('IPC channel timeout after 5000ms'));

    const { result } = renderHook(() => useEnv());

    await expect(
      act(async () => {
        await result.current.getVariable('OAUTH2_CLIENT_ID');
      }),
    ).rejects.toThrow('Error getting environment variable: IPC channel timeout after 5000ms');
  });

  it('memoizes getVariable across re-renders', () => {
    const { result, rerender } = renderHook(() => useEnv());
    const first = result.current.getVariable;

    rerender();

    expect(result.current.getVariable).toBe(first);
  });
});
