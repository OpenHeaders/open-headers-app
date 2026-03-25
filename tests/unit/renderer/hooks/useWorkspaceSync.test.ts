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
  showMessage: (...args: [type: string, content: React.ReactNode, duration?: number]) => mockShowMessage(...args),
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

  const enterpriseWorkspaceId = 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('subscribes to workspace data updates on mount', () => {
    renderHook(() => useWorkspaceSync({ activeWorkspaceId: enterpriseWorkspaceId }));

    expect(capturedCallback).not.toBeNull();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useWorkspaceSync({ activeWorkspaceId: enterpriseWorkspaceId }));

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('ignores updates for non-active workspace', () => {
    renderHook(() => useWorkspaceSync({ activeWorkspaceId: enterpriseWorkspaceId }));

    capturedCallback!({ workspaceId: 'ws-b2c3d4e5-f6a7-8901-bcde-other', timestamp: Date.now() });

    // Should not show any message for non-active workspace
    expect(mockShowMessage).not.toHaveBeenCalled();
  });

  it('shows success notification after coalesce delay', () => {
    renderHook(() => useWorkspaceSync({ activeWorkspaceId: enterpriseWorkspaceId }));

    capturedCallback!({ workspaceId: enterpriseWorkspaceId, timestamp: Date.now() });

    // Not shown immediately
    expect(mockShowMessage).not.toHaveBeenCalled();

    // Shown after 1000ms coalesce
    vi.advanceTimersByTime(1000);

    expect(mockShowMessage).toHaveBeenCalledWith('success', 'Workspace synced successfully');
  });

  it('coalesces rapid-fire events into single notification', () => {
    renderHook(() => useWorkspaceSync({ activeWorkspaceId: enterpriseWorkspaceId }));

    // Fire 3 events rapidly (simulating multiple git syncs)
    capturedCallback!({ workspaceId: enterpriseWorkspaceId, timestamp: Date.now() });
    vi.advanceTimersByTime(200);
    capturedCallback!({ workspaceId: enterpriseWorkspaceId, timestamp: Date.now() });
    vi.advanceTimersByTime(200);
    capturedCallback!({ workspaceId: enterpriseWorkspaceId, timestamp: Date.now() });

    // After 1000ms from last event
    vi.advanceTimersByTime(1000);

    // Only one notification
    expect(mockShowMessage).toHaveBeenCalledTimes(1);
  });
});
