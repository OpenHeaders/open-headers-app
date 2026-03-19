// @vitest-environment jsdom
/**
 * Tests for useCentralizedWorkspace hook
 *
 * Validates state subscription, isReady derivation, and useEnvironments delegation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

type StateListener = (state: Record<string, unknown>, changedKeys: string[]) => void;

let mockSubscriber: StateListener | null = null;
const mockUnsubscribe = vi.fn();
const mockGetState = vi.fn();
const mockInitialize = vi.fn().mockResolvedValue(true);

const defaultState = {
  initialized: false,
  loading: false,
  error: null,
  workspaces: [],
  activeWorkspaceId: 'default-personal',
  sources: [],
  rules: { header: [], request: [], response: [] },
  proxyRules: [],
  syncStatus: {},
  lastSaved: {},
  isWorkspaceSwitching: false,
};

const mockService = {
  getState: mockGetState,
  subscribe: vi.fn((listener: StateListener) => {
    mockSubscriber = listener;
    // Immediately call with current state (matching real BaseStateManager behavior)
    listener(mockGetState(), []);
    return () => {
      mockSubscriber = null;
      mockUnsubscribe();
    };
  }),
  initialize: mockInitialize,
};

vi.mock('../../../../src/renderer/services/CentralizedWorkspaceService', () => ({
  getCentralizedWorkspaceService: () => mockService,
}));

// Mock useCentralizedEnvironments for useEnvironments re-export
const mockEnvReturn = {
  environments: {},
  activeEnvironment: 'Default',
  loading: false,
  environmentsReady: true,
};

vi.mock('../../../../src/renderer/hooks/useCentralizedEnvironments', () => ({
  useCentralizedEnvironments: () => mockEnvReturn,
}));

// Mock the workspace sub-hooks (re-exported by useCentralizedWorkspace)
vi.mock('../../../../src/renderer/hooks/workspace', () => ({
  useWorkspaces: () => ({}),
  useSources: () => ({}),
  useHeaderRules: () => ({}),
  useProxyRules: () => ({}),
}));

import { useCentralizedWorkspace, useEnvironments } from '../../../../src/renderer/hooks/useCentralizedWorkspace';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCentralizedWorkspace', () => {
  beforeEach(() => {
    mockSubscriber = null;
    mockGetState.mockReturnValue({ ...defaultState });
    mockUnsubscribe.mockClear();
    mockService.subscribe.mockClear();
    mockService.subscribe.mockImplementation((listener: StateListener) => {
      mockSubscriber = listener;
      listener(mockGetState(), []);
      return () => {
        mockSubscriber = null;
        mockUnsubscribe();
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to service on mount', () => {
    renderHook(() => useCentralizedWorkspace());

    expect(mockService.subscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscriber).not.toBeNull();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useCentralizedWorkspace());

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscriber).toBeNull();
  });

  it('returns state spread with service and isReady', () => {
    const { result } = renderHook(() => useCentralizedWorkspace());

    expect(result.current.initialized).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.service).toBe(mockService);
    expect(result.current.isReady).toBe(false); // !initialized
  });

  it('isReady is true when initialized=true and loading=false', () => {
    mockGetState.mockReturnValue({ ...defaultState, initialized: true, loading: false });

    const { result } = renderHook(() => useCentralizedWorkspace());

    expect(result.current.isReady).toBe(true);
  });

  it('isReady is false when loading=true even if initialized', () => {
    mockGetState.mockReturnValue({ ...defaultState, initialized: true, loading: true });

    const { result } = renderHook(() => useCentralizedWorkspace());

    expect(result.current.isReady).toBe(false);
  });

  it('updates when service notifies listeners', () => {
    mockGetState.mockReturnValue({ ...defaultState });

    const { result } = renderHook(() => useCentralizedWorkspace());

    expect(result.current.initialized).toBe(false);

    // Simulate state change via subscriber
    act(() => {
      if (mockSubscriber) {
        mockSubscriber({ ...defaultState, initialized: true }, ['initialized']);
      }
    });

    expect(result.current.initialized).toBe(true);
    expect(result.current.isReady).toBe(true);
  });

  it('exposes workspace state fields', () => {
    const state = {
      ...defaultState,
      initialized: true,
      workspaces: [{ id: 'ws-1', name: 'Test' }],
      activeWorkspaceId: 'ws-1',
      sources: [{ sourceId: 's1' }],
    };
    mockGetState.mockReturnValue(state);

    const { result } = renderHook(() => useCentralizedWorkspace());

    expect(result.current.workspaces).toEqual([{ id: 'ws-1', name: 'Test' }]);
    expect(result.current.activeWorkspaceId).toBe('ws-1');
    expect(result.current.sources).toEqual([{ sourceId: 's1' }]);
  });

  it('memoizes service instance across re-renders', () => {
    const { result, rerender } = renderHook(() => useCentralizedWorkspace());
    const firstService = result.current.service;

    rerender();

    expect(result.current.service).toBe(firstService);
  });
});

describe('useEnvironments', () => {
  it('delegates to useCentralizedEnvironments', () => {
    const { result } = renderHook(() => useEnvironments());

    expect(result.current.environments).toEqual({});
    expect(result.current.activeEnvironment).toBe('Default');
    expect(result.current.environmentsReady).toBe(true);
  });
});
