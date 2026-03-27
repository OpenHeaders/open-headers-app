// @vitest-environment jsdom
/**
 * Tests for useUpdateChecker hook
 *
 * Validates ref delegation and fallback to electronAPI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCheckForUpdates = vi.fn();
const mockNotificationOpen = vi.fn();

vi.mock('antd', () => ({
  notification: { open: (...args: unknown[]) => mockNotificationOpen(...args) },
}));

vi.mock('@ant-design/icons', () => ({
  LoadingOutlined: () => 'LoadingOutlined',
}));

Object.defineProperty(window, 'electronAPI', {
  value: { checkForUpdates: mockCheckForUpdates },
  writable: true,
});

import { useUpdateChecker } from '../../../../src/renderer/hooks/app/useUpdateChecker';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useUpdateChecker', () => {
  beforeEach(() => {
    mockCheckForUpdates.mockClear();
    mockNotificationOpen.mockClear();
  });

  it('returns ref and handler with correct types', () => {
    const { result } = renderHook(() => useUpdateChecker());

    expect(result.current).toEqual({
      updateNotificationRef: expect.objectContaining({ current: null }),
      handleCheckForUpdates: expect.any(Function),
    });
  });

  it('delegates to ref.checkForUpdates when ref is available', () => {
    const mockRefCheck = vi.fn();
    const { result } = renderHook(() => useUpdateChecker());

    result.current.updateNotificationRef.current = { checkForUpdates: mockRefCheck };

    act(() => {
      result.current.handleCheckForUpdates();
    });

    expect(mockRefCheck).toHaveBeenCalledWith(true);
    expect(mockCheckForUpdates).not.toHaveBeenCalled();
  });

  it('falls back to electronAPI when ref is null', () => {
    const { result } = renderHook(() => useUpdateChecker());

    act(() => {
      result.current.handleCheckForUpdates();
    });

    expect(mockCheckForUpdates).toHaveBeenCalledWith(true);
    expect(mockNotificationOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Checking for Updates',
        key: 'checking-updates',
      }),
    );
  });

  it('shows notification with correct properties on fallback', () => {
    const { result } = renderHook(() => useUpdateChecker());

    act(() => {
      result.current.handleCheckForUpdates();
    });

    expect(mockNotificationOpen).toHaveBeenCalledOnce();
    const notifArgs = mockNotificationOpen.mock.calls[0][0];
    expect(notifArgs.message).toBe('Checking for Updates');
    expect(notifArgs.key).toBe('checking-updates');
    expect(notifArgs.duration).toBeDefined();
  });

  it('can be called multiple times without error', () => {
    const { result } = renderHook(() => useUpdateChecker());

    act(() => {
      result.current.handleCheckForUpdates();
      result.current.handleCheckForUpdates();
    });

    expect(mockCheckForUpdates).toHaveBeenCalledTimes(2);
  });
});
