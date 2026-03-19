// @vitest-environment jsdom
/**
 * Tests for useFileWatcher hook
 *
 * Validates IPC subscription for file change events and refresh delegation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to file change events on mount', () => {
    renderHook(() => useFileWatcher({ refreshSource: mockRefreshSource }));

    expect(capturedCallback).not.toBeNull();
  });

  it('calls refreshSource when file changes', () => {
    renderHook(() => useFileWatcher({ refreshSource: mockRefreshSource }));

    capturedCallback!('src-42', 'new file content');

    expect(mockRefreshSource).toHaveBeenCalledWith('src-42');
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useFileWatcher({ refreshSource: mockRefreshSource }));

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
