// @vitest-environment jsdom
/**
 * Tests for useEnvironmentCore hook
 *
 * Validates state subscription and service exposure.
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
  environments: {},
  activeEnvironment: 'Default',
  isLoading: false,
  isReady: false,
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
};

vi.mock('../../../../src/renderer/services/CentralizedEnvironmentService', () => ({
  getCentralizedEnvironmentService: () => mockService,
  CentralizedEnvironmentService: class {},
}));

import { useEnvironmentCore } from '../../../../src/renderer/hooks/environment/useEnvironmentCore';

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

  it('returns state fields', () => {
    const { result } = renderHook(() => useEnvironmentCore());

    expect(result.current.environments).toEqual({});
    expect(result.current.activeEnvironment).toBe('Default');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isReady).toBe(false);
  });

  it('exposes service reference', () => {
    const { result } = renderHook(() => useEnvironmentCore());

    expect(result.current.service).toBe(mockService);
  });

  it('updates when service pushes new state', () => {
    const { result } = renderHook(() => useEnvironmentCore());

    expect(result.current.isReady).toBe(false);

    act(() => {
      mockSubscriber!({
        ...defaultState,
        isReady: true,
        environments: { Default: { FOO: { value: 'bar' } } },
      }, ['isReady', 'environments']);
    });

    expect(result.current.isReady).toBe(true);
    expect(result.current.environments).toEqual({ Default: { FOO: { value: 'bar' } } });
  });

  it('memoizes service across re-renders', () => {
    const { result, rerender } = renderHook(() => useEnvironmentCore());
    const first = result.current.service;

    rerender();

    expect(result.current.service).toBe(first);
  });
});
