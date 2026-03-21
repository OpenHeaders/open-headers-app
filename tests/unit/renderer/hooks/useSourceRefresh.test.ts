// @vitest-environment jsdom
/**
 * Tests for useSourceRefresh hook
 *
 * Validates HTTP source refresh logic, add-source with initial fetch,
 * and the routing of refresh calls based on source type.
 *
 * useHttp is mocked entirely because it depends on React contexts
 * (TotpContext, EnvironmentContext) that would require a full provider tree.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the logger (require-style used by the source file)
vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock showMessage
vi.mock('../../../../src/renderer/utils', () => ({
  showMessage: vi.fn(),
}));

// Mock useHttp – the critical mock for isolating this hook
const mockHttpRequest = vi.fn();
vi.mock('../../../../src/renderer/hooks/useHttp', () => ({
  useHttp: () => ({
    request: mockHttpRequest,
    testRequest: vi.fn(),
    applyJsonFilter: vi.fn(),
  }),
}));

import { useSourceRefresh } from '../../../../src/renderer/hooks/sources/useSourceRefresh';
import { showMessage } from '../../../../src/renderer/utils';
import type { Source } from '../../../../src/types/source';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseSourceRefreshDeps {
  sources: Source[];
  updateSource: (sourceId: string, updates: Partial<Source>) => void;
  refreshSource: (sourceId: string) => Promise<boolean>;
  manualRefresh: (sourceId: string) => Promise<boolean>;
  addSource: (sourceData: Source) => Promise<Source | null>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<UseSourceRefreshDeps> = {}): UseSourceRefreshDeps {
  return {
    sources: [],
    updateSource: vi.fn(),
    refreshSource: vi.fn(async () => true),
    manualRefresh: vi.fn(async () => true),
    addSource: vi.fn(async (data: Source) => ({ ...data, sourceId: 'new-src-1' })),
    ...overrides,
  };
}

function makeHttpSource(id: string, overrides: Partial<Source> = {}): Source {
  return {
    sourceId: id,
    sourceType: 'http',
    sourcePath: 'https://api.example.com/data',
    sourceMethod: 'GET',
    requestOptions: {},
    jsonFilter: { enabled: false },
    ...overrides,
  } as Source;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSourceRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHttpRequest.mockResolvedValue({
      content: '{"status":"ok"}',
      isFiltered: false,
      originalResponse: null,
    });
  });

  // =========================================================================
  // handleHttpSourceRefresh
  // =========================================================================

  describe('handleHttpSourceRefresh', () => {
    it('makes an HTTP request and updates the source', async () => {
      const source = makeHttpSource('src-1');
      const deps = makeDeps({ sources: [source] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.handleHttpSourceRefresh('src-1');
      });

      expect(ok).toBe(true);
      expect(mockHttpRequest).toHaveBeenCalledWith(
        'src-1',
        source.sourcePath,
        'GET',
        source.requestOptions,
        source.jsonFilter,
      );
      expect(deps.updateSource).toHaveBeenCalledWith('src-1', expect.objectContaining({
        sourceContent: '{"status":"ok"}',
      }));
      expect(showMessage).toHaveBeenCalledWith('success', 'Source refreshed');
    });

    it('uses the provided updatedSource instead of searching sources array', async () => {
      const deps = makeDeps({ sources: [] }); // empty array – would fail lookup
      const custom = makeHttpSource('src-2', { sourcePath: 'https://custom.example.com' });

      const { result } = renderHook(() => useSourceRefresh(deps));

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.handleHttpSourceRefresh('src-2', custom);
      });

      expect(ok).toBe(true);
      expect(mockHttpRequest).toHaveBeenCalledWith(
        'src-2',
        'https://custom.example.com',
        'GET',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('returns false when source is not found', async () => {
      const deps = makeDeps({ sources: [] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.handleHttpSourceRefresh('missing');
      });

      expect(ok).toBe(false);
    });

    it('returns false when source is not type http', async () => {
      const fileSource = { sourceId: 'file-1', sourceType: 'file', sourcePath: '/tmp/f' };
      const deps = makeDeps({ sources: [fileSource] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.handleHttpSourceRefresh('file-1');
      });

      expect(ok).toBe(false);
    });

    it('stores filtering metadata when response is filtered', async () => {
      mockHttpRequest.mockResolvedValue({
        content: '"filtered-value"',
        isFiltered: true,
        originalResponse: '{"a":"filtered-value"}',
        filteredWith: 'a',
      });

      const source = makeHttpSource('src-1', {
        jsonFilter: { enabled: true, path: 'a' },
      });
      const deps = makeDeps({ sources: [source] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      await act(async () => {
        await result.current.handleHttpSourceRefresh('src-1');
      });

      expect(deps.updateSource).toHaveBeenCalledWith('src-1', expect.objectContaining({
        sourceContent: '"filtered-value"',
        originalResponse: '{"a":"filtered-value"}',
        isFiltered: true,
        filteredWith: 'a',
      }));
    });

    it('clears filtering metadata when response is not filtered', async () => {
      mockHttpRequest.mockResolvedValue({
        content: 'plain content',
        isFiltered: false,
        originalResponse: null,
      });

      const source = makeHttpSource('src-1');
      const deps = makeDeps({ sources: [source] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      await act(async () => {
        await result.current.handleHttpSourceRefresh('src-1');
      });

      expect(deps.updateSource).toHaveBeenCalledWith('src-1', expect.objectContaining({
        originalResponse: null,
        isFiltered: false,
        filteredWith: null,
      }));
    });

    it('clears needsInitialFetch flag on first fetch', async () => {
      const source = makeHttpSource('src-1', { needsInitialFetch: true });
      const deps = makeDeps({ sources: [source] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      await act(async () => {
        await result.current.handleHttpSourceRefresh('src-1');
      });

      expect(deps.updateSource).toHaveBeenCalledWith('src-1', expect.objectContaining({
        needsInitialFetch: false,
      }));
    });

    it('returns false and shows error when HTTP request fails', async () => {
      mockHttpRequest.mockRejectedValue(new Error('Network error'));

      const source = makeHttpSource('src-1');
      const deps = makeDeps({ sources: [source] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.handleHttpSourceRefresh('src-1');
      });

      expect(ok).toBe(false);
      expect(showMessage).toHaveBeenCalledWith('error', 'Failed to refresh source: Network error');
    });

    it('defaults method to GET when sourceMethod is not set', async () => {
      const source = makeHttpSource('src-1', { sourceMethod: undefined });
      const deps = makeDeps({ sources: [source] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      await act(async () => {
        await result.current.handleHttpSourceRefresh('src-1');
      });

      expect(mockHttpRequest).toHaveBeenCalledWith(
        'src-1',
        expect.any(String),
        'GET',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  // =========================================================================
  // refreshSourceWithHttp
  // =========================================================================

  describe('refreshSourceWithHttp', () => {
    it('delegates to manualRefresh for HTTP sources', async () => {
      const source = makeHttpSource('http-1');
      const deps = makeDeps({ sources: [source] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      await act(async () => {
        await result.current.refreshSourceWithHttp('http-1');
      });

      expect(deps.manualRefresh).toHaveBeenCalledWith('http-1');
      expect(deps.refreshSource).not.toHaveBeenCalled();
    });

    it('delegates to refreshSource for non-HTTP sources', async () => {
      const fileSource = { sourceId: 'file-1', sourceType: 'file', sourcePath: '/f' };
      const deps = makeDeps({ sources: [fileSource] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      await act(async () => {
        await result.current.refreshSourceWithHttp('file-1');
      });

      expect(deps.refreshSource).toHaveBeenCalledWith('file-1');
      expect(deps.manualRefresh).not.toHaveBeenCalled();
    });

    it('delegates to refreshSource when source is not found', async () => {
      const deps = makeDeps({ sources: [] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      await act(async () => {
        await result.current.refreshSourceWithHttp('unknown');
      });

      expect(deps.refreshSource).toHaveBeenCalledWith('unknown');
    });
  });

  // =========================================================================
  // handleAddSource
  // =========================================================================

  describe('handleAddSource', () => {
    it('fetches content before adding an HTTP source', async () => {
      const deps = makeDeps();
      const { result } = renderHook(() => useSourceRefresh(deps));

      const sourceData = {
        sourceType: 'http',
        sourcePath: 'https://api.example.com',
        sourceMethod: 'POST',
        requestOptions: { body: '{}' },
        jsonFilter: { enabled: false },
      };

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.handleAddSource(sourceData);
      });

      expect(ok).toBe(true);
      expect(mockHttpRequest).toHaveBeenCalled();
      // The source data should have been enriched with content
      expect(deps.addSource).toHaveBeenCalledWith(expect.objectContaining({
        sourceContent: '{"status":"ok"}',
        needsInitialFetch: false,
      }));
      expect(showMessage).toHaveBeenCalledWith('success', 'Source added successfully');
    });

    it('stores filtering metadata when HTTP source response is filtered', async () => {
      mockHttpRequest.mockResolvedValue({
        content: '"value"',
        isFiltered: true,
        originalResponse: '{"key":"value"}',
        filteredWith: 'key',
      });

      const deps = makeDeps();
      const { result } = renderHook(() => useSourceRefresh(deps));

      const sourceData = {
        sourceType: 'http',
        sourcePath: 'https://api.example.com',
        jsonFilter: { enabled: true, path: 'key' },
      };

      await act(async () => {
        await result.current.handleAddSource(sourceData);
      });

      expect(deps.addSource).toHaveBeenCalledWith(expect.objectContaining({
        originalResponse: '{"key":"value"}',
        isFiltered: true,
        filteredWith: 'key',
      }));
    });

    it('sets lastRefresh on existing refreshOptions', async () => {
      const deps = makeDeps();
      const { result } = renderHook(() => useSourceRefresh(deps));

      const sourceData = {
        sourceType: 'http',
        sourcePath: 'https://api.example.com',
        refreshOptions: { interval: 60 },
      };

      const before = Date.now();
      await act(async () => {
        await result.current.handleAddSource(sourceData);
      });
      const after = Date.now();

      const passedData = (deps.addSource as Mock).mock.calls[0][0];
      expect(passedData.refreshOptions.lastRefresh).toBeGreaterThanOrEqual(before);
      expect(passedData.refreshOptions.lastRefresh).toBeLessThanOrEqual(after);
      // original interval preserved
      expect(passedData.refreshOptions.interval).toBe(60);
    });

    it('creates refreshOptions when not present on HTTP source', async () => {
      const deps = makeDeps();
      const { result } = renderHook(() => useSourceRefresh(deps));

      const sourceData = {
        sourceType: 'http',
        sourcePath: 'https://api.example.com',
      };

      await act(async () => {
        await result.current.handleAddSource(sourceData);
      });

      const passedData = (deps.addSource as Mock).mock.calls[0][0];
      expect(passedData.refreshOptions).toBeDefined();
      expect(typeof passedData.refreshOptions.lastRefresh).toBe('number');
    });

    it('returns false when HTTP fetch fails', async () => {
      mockHttpRequest.mockRejectedValue(new Error('timeout'));

      const deps = makeDeps();
      const { result } = renderHook(() => useSourceRefresh(deps));

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.handleAddSource({
          sourceType: 'http',
          sourcePath: 'https://api.example.com',
        });
      });

      expect(ok).toBe(false);
      expect(deps.addSource).not.toHaveBeenCalled();
      expect(showMessage).toHaveBeenCalledWith('error', 'Failed to fetch content: timeout');
    });

    it('adds non-HTTP sources without fetching and triggers refresh', async () => {
      vi.useFakeTimers();

      const deps = makeDeps();
      const { result } = renderHook(() => useSourceRefresh(deps));

      const sourceData = { sourceType: 'file', sourcePath: '/tmp/data.json' };

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.handleAddSource(sourceData);
      });

      expect(ok).toBe(true);
      expect(mockHttpRequest).not.toHaveBeenCalled();
      expect(deps.addSource).toHaveBeenCalledWith({ sourceId: '', ...sourceData });

      // Should trigger delayed refresh for file sources
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(deps.refreshSource).toHaveBeenCalledWith('new-src-1');
      vi.useRealTimers();
    });

    it('triggers refresh for env sources after adding', async () => {
      vi.useFakeTimers();

      const deps = makeDeps();
      const { result } = renderHook(() => useSourceRefresh(deps));

      await act(async () => {
        await result.current.handleAddSource({ sourceType: 'env', sourcePath: 'MY_VAR' });
      });

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(deps.refreshSource).toHaveBeenCalledWith('new-src-1');
      vi.useRealTimers();
    });

    it('returns false when addSource returns null', async () => {
      const deps = makeDeps({ addSource: vi.fn(async () => null) });
      const { result } = renderHook(() => useSourceRefresh(deps));

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.handleAddSource({ sourceType: 'file', sourcePath: '/tmp/f' });
      });

      expect(ok).toBe(false);
    });
  });
});
