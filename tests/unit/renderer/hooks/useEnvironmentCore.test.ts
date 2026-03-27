// @vitest-environment jsdom
/**
 * Tests for useEnvironmentCore hook — validates state subscription and service exposure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type StateListener = (state: Record<string, unknown>, changedKeys: string[]) => void;

let mockSubscriber: StateListener | null = null;
const mockUnsubscribe = vi.fn();

const defaultState = {
  environments: { Default: {} },
  activeEnvironment: 'Default',
  isLoading: false,
  isReady: false,
  currentWorkspaceId: 'default-personal',
  error: null,
};

const mockGetState = vi.fn().mockReturnValue({ ...defaultState });

const mockService = {
  getState: mockGetState,
  subscribe: vi.fn((listener: StateListener) => {
    mockSubscriber = listener;
    listener(mockGetState(), []);
    return () => {
      mockSubscriber = null;
      mockUnsubscribe();
    };
  }),
  initialize: vi.fn().mockResolvedValue(true),
  handleWorkspaceChange: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../../../src/renderer/services/CentralizedEnvironmentService', () => ({
  getCentralizedEnvironmentService: () => mockService,
  CentralizedEnvironmentService: class {},
}));

vi.mock('../../../../src/renderer/hooks/useCentralizedWorkspace', () => ({
  useCentralizedWorkspace: () => ({
    activeWorkspaceId: 'default-personal',
    initialized: true,
    loading: false,
  }),
}));

import { useEnvironmentCore } from '../../../../src/renderer/hooks/environment/useEnvironmentCore';

// ---------------------------------------------------------------------------
// Enterprise data
// ---------------------------------------------------------------------------

function makeEnterpriseState() {
  return {
    ...defaultState,
    isReady: true,
    currentWorkspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    activeEnvironment: 'Production',
    environments: {
      Default: {
        OAUTH2_CLIENT_ID: { value: 'oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890', isSecret: false },
      },
      Production: {
        OAUTH2_CLIENT_SECRET: { value: 'sk_prod_9hF60KrOalZGdumwW4cgt0hi', isSecret: true },
        DATABASE_CONNECTION_STRING: {
          value: 'postgresql://prod_user:Pr0d$ecret!@db.openheaders.io:5432/production',
          isSecret: true,
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEnvironmentCore', () => {
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
    renderHook(() => useEnvironmentCore());
    expect(mockService.subscribe).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useEnvironmentCore());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('returns full default state fields', () => {
    const { result } = renderHook(() => useEnvironmentCore());
    expect(result.current.environments).toEqual({ Default: {} });
    expect(result.current.activeEnvironment).toBe('Default');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isReady).toBe(false);
  });

  it('exposes service reference', () => {
    const { result } = renderHook(() => useEnvironmentCore());
    expect(result.current.service).toBe(mockService);
  });

  it('updates when service pushes enterprise state', () => {
    const { result } = renderHook(() => useEnvironmentCore());
    expect(result.current.isReady).toBe(false);

    const enterpriseState = makeEnterpriseState();
    act(() => {
      mockSubscriber!(enterpriseState, ['isReady', 'environments', 'activeEnvironment', 'currentWorkspaceId']);
    });

    expect(result.current.isReady).toBe(true);
    expect(result.current.activeEnvironment).toBe('Production');
    expect(result.current.environments).toEqual(enterpriseState.environments);
  });

  it('memoizes service across re-renders', () => {
    const { result, rerender } = renderHook(() => useEnvironmentCore());
    const first = result.current.service;
    rerender();
    expect(result.current.service).toBe(first);
  });

  it('handles workspace switch state transition', () => {
    const { result } = renderHook(() => useEnvironmentCore());

    // Start loading
    act(() => {
      mockSubscriber!({ ...defaultState, isLoading: true, isReady: false }, ['isLoading', 'isReady']);
    });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isReady).toBe(false);

    // Finish loading with enterprise data
    const enterpriseState = makeEnterpriseState();
    act(() => {
      mockSubscriber!({ ...enterpriseState, isLoading: false }, ['isLoading', 'environments', 'activeEnvironment']);
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isReady).toBe(true);
    expect(result.current.activeEnvironment).toBe('Production');
  });

  it('handles error state', () => {
    const { result } = renderHook(() => useEnvironmentCore());

    act(() => {
      mockSubscriber!({
        ...defaultState,
        error: 'Failed to load environments for workspace ws-a1b2c3d4',
        isReady: true,
      }, ['error', 'isReady']);
    });

    expect(result.current.isReady).toBe(true);
  });
});
