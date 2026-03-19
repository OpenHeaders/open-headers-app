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

  it('returns ref and handler', () => {
    const { result } = renderHook(() => useUpdateChecker());

    expect(result.current.updateNotificationRef).toBeDefined();
    expect(typeof result.current.handleCheckForUpdates).toBe('function');
  });

  it('delegates to ref when available', () => {
    const mockRefCheck = vi.fn();

    const { result } = renderHook(() => useUpdateChecker());

    // Set up ref
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
      })
    );
  });
});
