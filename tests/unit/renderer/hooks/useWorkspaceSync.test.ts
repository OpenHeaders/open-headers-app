// @vitest-environment jsdom
/**
 * Tests for useWorkspaceSync hook
 *
 * Validates IPC subscription, event dispatch, and notification coalescing.
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

const mockShowMessage = vi.fn();
vi.mock('../../../../src/renderer/utils/ui/messageUtil', () => ({
  showMessage: (...args: unknown[]) => mockShowMessage(...args),
}));

type UpdateCallback = (data: { workspaceId: string; timestamp: number }) => void;

let capturedCallback: UpdateCallback | null = null;
const mockUnsubscribe = vi.fn();

Object.defineProperty(window, 'electronAPI', {
  value: {
    onWorkspaceDataUpdated: vi.fn((cb: UpdateCallback) => {
      capturedCallback = cb;
      return mockUnsubscribe;
    }),
  },
  writable: true,
});

import { useWorkspaceSync } from '../../../../src/renderer/hooks/app/useWorkspaceSync';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWorkspaceSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedCallback = null;
    mockShowMessage.mockClear();
    mockUnsubscribe.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('subscribes to workspace data updates on mount', () => {
    renderHook(() => useWorkspaceSync({ activeWorkspaceId: 'ws-1' }));

    expect(capturedCallback).not.toBeNull();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useWorkspaceSync({ activeWorkspaceId: 'ws-1' }));

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('dispatches workspace-data-refresh-needed event for active workspace', () => {
    renderHook(() => useWorkspaceSync({ activeWorkspaceId: 'ws-1' }));

    const handler = vi.fn();
    window.addEventListener('workspace-data-refresh-needed', handler);

    capturedCallback!({ workspaceId: 'ws-1', timestamp: Date.now() });

    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as CustomEvent).detail.workspaceId).toBe('ws-1');

    window.removeEventListener('workspace-data-refresh-needed', handler);
  });

  it('ignores updates for non-active workspace', () => {
    renderHook(() => useWorkspaceSync({ activeWorkspaceId: 'ws-1' }));

    const handler = vi.fn();
    window.addEventListener('workspace-data-refresh-needed', handler);

    capturedCallback!({ workspaceId: 'ws-other', timestamp: Date.now() });

    expect(handler).not.toHaveBeenCalled();

    window.removeEventListener('workspace-data-refresh-needed', handler);
  });

  it('shows success notification after coalesce delay', () => {
    renderHook(() => useWorkspaceSync({ activeWorkspaceId: 'ws-1' }));

    capturedCallback!({ workspaceId: 'ws-1', timestamp: Date.now() });

    // Not shown immediately
    expect(mockShowMessage).not.toHaveBeenCalled();

    // Shown after 1000ms coalesce
    vi.advanceTimersByTime(1000);

    expect(mockShowMessage).toHaveBeenCalledWith('success', 'Workspace synced successfully');
  });

  it('coalesces rapid-fire events into single notification', () => {
    renderHook(() => useWorkspaceSync({ activeWorkspaceId: 'ws-1' }));

    // Fire 3 events rapidly
    capturedCallback!({ workspaceId: 'ws-1', timestamp: Date.now() });
    vi.advanceTimersByTime(200);
    capturedCallback!({ workspaceId: 'ws-1', timestamp: Date.now() });
    vi.advanceTimersByTime(200);
    capturedCallback!({ workspaceId: 'ws-1', timestamp: Date.now() });

    // After 1000ms from last event
    vi.advanceTimersByTime(1000);

    // Only one notification
    expect(mockShowMessage).toHaveBeenCalledTimes(1);
  });
});
