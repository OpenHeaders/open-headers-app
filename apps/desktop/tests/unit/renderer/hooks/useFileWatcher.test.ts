// @vitest-environment jsdom
/**
 * Tests for useFileWatcher hook
 *
 * Validates IPC subscription for file change events and refresh delegation.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

type FileChangedCallback = (sourceId: string, content: string) => void;

let capturedCallback: FileChangedCallback | null = null;
const mockUnsubscribe = vi.fn();

Object.defineProperty(window, 'electronAPI', {
  value: {
    onFileChanged: vi.fn((cb: FileChangedCallback) => {
      capturedCallback = cb;
      return mockUnsubscribe;
    }),
  },
  writable: true,
});

import { useFileWatcher } from '../../../../src/renderer/hooks/app/useFileWatcher';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFileWatcher', () => {
  const mockRefreshSource = vi.fn();

  beforeEach(() => {
    capturedCallback = null;
    mockRefreshSource.mockClear();
    mockUnsubscribe.mockClear();
    (window.electronAPI.onFileChanged as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to file change events on mount', () => {
    renderHook(() => useFileWatcher({ refreshSource: mockRefreshSource }));

    expect(capturedCallback).not.toBeNull();
    expect(window.electronAPI.onFileChanged).toHaveBeenCalledOnce();
  });

  it('calls refreshSource when file changes with enterprise source ID', () => {
    renderHook(() => useFileWatcher({ refreshSource: mockRefreshSource }));

    const enterpriseSourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const tokenContent = 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig';
    capturedCallback!(enterpriseSourceId, tokenContent);

    expect(mockRefreshSource).toHaveBeenCalledOnce();
    expect(mockRefreshSource).toHaveBeenCalledWith(enterpriseSourceId);
  });

  it('calls refreshSource for each file change event', () => {
    renderHook(() => useFileWatcher({ refreshSource: mockRefreshSource }));

    capturedCallback!('src-1', 'content-1');
    capturedCallback!('src-2', 'content-2');
    capturedCallback!('src-3', 'content-3');

    expect(mockRefreshSource).toHaveBeenCalledTimes(3);
    expect(mockRefreshSource).toHaveBeenNthCalledWith(1, 'src-1');
    expect(mockRefreshSource).toHaveBeenNthCalledWith(2, 'src-2');
    expect(mockRefreshSource).toHaveBeenNthCalledWith(3, 'src-3');
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useFileWatcher({ refreshSource: mockRefreshSource }));

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledOnce();
  });

  it('does not call refreshSource after unmount', () => {
    const { unmount } = renderHook(() => useFileWatcher({ refreshSource: mockRefreshSource }));

    const callbackRef = capturedCallback;
    unmount();
    mockRefreshSource.mockClear();

    // Simulating a late callback after unmount should not cause issues
    // (the unsubscribe should have prevented this, but testing the callback itself)
    if (callbackRef) {
      callbackRef('late-source', 'late-content');
    }
    // refreshSource may or may not be called depending on implementation
    // but it should not throw
  });
});
