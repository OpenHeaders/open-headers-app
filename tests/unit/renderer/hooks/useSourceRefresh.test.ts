// @vitest-environment jsdom
/**
 * Tests for useSourceRefresh hook
 *
 * The hook now delegates HTTP refreshes to the main-process SourceRefreshService
 * via window.electronAPI.sourceRefresh.manualRefresh(). Add-source still uses
 * the renderer-side useHttp for the creation flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

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

vi.mock('../../../../src/renderer/utils', () => ({
  showMessage: vi.fn(),
}));

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
import type { Source, NewSourceData } from '../../../../src/types/source';

function makeHttpSource(id: string, overrides: Partial<Source> = {}): Source {
  return {
    sourceId: id,
    sourceType: 'http',
    sourceName: 'Production API Gateway Token',
    sourcePath: 'https://auth.openheaders.io/oauth2/token',
    sourceMethod: 'GET',
    sourceTag: 'oauth',
    requestOptions: { contentType: 'application/json' },
    jsonFilter: { enabled: false },
    ...overrides,
  } as Source;
}

interface UseSourceRefreshDeps {
  sources: Source[];
  refreshSource: (sourceId: string) => Promise<boolean>;
  manualRefresh: (sourceId: string) => Promise<boolean>;
  addSource: (sourceData: Source) => Promise<Source | null>;
}

function makeDeps(overrides: Partial<UseSourceRefreshDeps> = {}): UseSourceRefreshDeps {
  return {
    sources: [],
    refreshSource: vi.fn(async () => true),
    manualRefresh: vi.fn(async () => true),
    addSource: vi.fn(async (data: Source) => ({ ...data, sourceId: 'new-src-1' })),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSourceRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHttpRequest.mockResolvedValue({
      content: '{"access_token":"eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzZXJ2aWNlQG9wZW5oZWFkZXJzLmlvIn0.sig","expires_in":3600}',
      isFiltered: false,
      originalResponse: null,
    });

    // Mock the electronAPI.sourceRefresh
    (globalThis as Record<string, unknown>).window = globalThis;
    (globalThis as Record<string, unknown>).electronAPI = {
      sourceRefresh: {
        manualRefresh: vi.fn(async () => ({ success: true })),
      },
    };
  });

  // =========================================================================
  // handleHttpSourceRefresh
  // =========================================================================

  describe('handleHttpSourceRefresh', () => {
    it('delegates to IPC manualRefresh and shows success', async () => {
      const source = makeHttpSource('src-1');
      const deps = makeDeps({ sources: [source] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.handleHttpSourceRefresh('src-1');
      });

      expect(ok).toBe(true);
      expect(window.electronAPI.sourceRefresh.manualRefresh).toHaveBeenCalledWith('src-1');
      expect(showMessage).toHaveBeenCalledWith('success', 'Source refreshed');
    });

    it('returns false and shows error when IPC manualRefresh fails', async () => {
      window.electronAPI.sourceRefresh.manualRefresh = vi.fn(async () => ({
        success: false,
        error: 'Network error',
      })) as typeof window.electronAPI.sourceRefresh.manualRefresh;

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

    it('falls back to manualRefresh from deps when electronAPI not available', async () => {
      (globalThis as Record<string, unknown>).electronAPI = {};

      const source = makeHttpSource('src-1');
      const deps = makeDeps({ sources: [source] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.handleHttpSourceRefresh('src-1');
      });

      expect(ok).toBe(true);
      expect(deps.manualRefresh).toHaveBeenCalledWith('src-1');
    });
  });

  // =========================================================================
  // refreshSourceWithHttp
  // =========================================================================

  describe('refreshSourceWithHttp', () => {
    it('delegates to handleHttpSourceRefresh for HTTP sources', async () => {
      const source = makeHttpSource('http-1');
      const deps = makeDeps({ sources: [source] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      await act(async () => {
        await result.current.refreshSourceWithHttp('http-1');
      });

      expect(window.electronAPI.sourceRefresh.manualRefresh).toHaveBeenCalledWith('http-1');
    });

    it('delegates to refreshSource for non-HTTP sources', async () => {
      const fileSource: Source = {
        sourceId: 'file-1',
        sourceType: 'file',
        sourcePath: '/Users/jane.doe/Documents/openheaders/tokens.json',
      } as Source;
      const deps = makeDeps({ sources: [fileSource] });
      const { result } = renderHook(() => useSourceRefresh(deps));

      await act(async () => {
        await result.current.refreshSourceWithHttp('file-1');
      });

      expect(deps.refreshSource).toHaveBeenCalledWith('file-1');
    });
  });

  // =========================================================================
  // handleAddSource
  // =========================================================================

  describe('handleAddSource', () => {
    it('fetches initial content for HTTP sources before adding', async () => {
      const deps = makeDeps();
      const { result } = renderHook(() => useSourceRefresh(deps));

      const newSource: NewSourceData = {
        sourceType: 'http',
        sourcePath: 'https://auth.openheaders.io/oauth2/token',
        sourceTag: 'oauth',
      };

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.handleAddSource(newSource);
      });

      expect(ok).toBe(true);
      expect(mockHttpRequest).toHaveBeenCalled();
      expect(deps.addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceContent: expect.any(String),
          needsInitialFetch: false,
        }),
      );
      expect(showMessage).toHaveBeenCalledWith('success', 'Source added successfully');
    });

    it('returns false when initial HTTP fetch fails', async () => {
      mockHttpRequest.mockRejectedValue(new Error('Connection refused'));
      const deps = makeDeps();
      const { result } = renderHook(() => useSourceRefresh(deps));

      const newSource: NewSourceData = {
        sourceType: 'http',
        sourcePath: 'https://auth.openheaders.io/oauth2/token',
        sourceTag: 'oauth',
      };

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.handleAddSource(newSource);
      });

      expect(ok).toBe(false);
      expect(showMessage).toHaveBeenCalledWith('error', expect.stringContaining('Connection refused'));
    });

    it('adds file sources without HTTP fetch', async () => {
      const deps = makeDeps();
      const { result } = renderHook(() => useSourceRefresh(deps));

      const newSource: NewSourceData = {
        sourceType: 'file',
        sourcePath: '/Users/jane.doe/Documents/openheaders/token.txt',
        sourceTag: 'local',
      };

      await act(async () => {
        await result.current.handleAddSource(newSource);
      });

      expect(mockHttpRequest).not.toHaveBeenCalled();
      expect(deps.addSource).toHaveBeenCalled();
    });
  });
});
