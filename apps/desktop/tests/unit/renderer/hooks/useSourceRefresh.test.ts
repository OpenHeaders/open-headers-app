// @vitest-environment jsdom
/**
 * Tests for useSourceRefresh hook
 *
 * The hook delegates HTTP refreshes to main-process SourceRefreshService
 * via IPC, and initial HTTP fetches to HttpRequestService via IPC.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequestResult } from '../../../../src/types/http';

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

import { useSourceRefresh } from '../../../../src/renderer/hooks/sources/useSourceRefresh';
import { showMessage } from '../../../../src/renderer/utils';
import type { NewSourceData, Source } from '../../../../src/types/source';

const mockExecuteRequest = vi.fn<() => Promise<HttpRequestResult>>();
const mockManualRefresh = vi.fn<() => Promise<{ success: boolean; error?: string }>>();

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
  workspaceId: string;
  refreshSource: (sourceId: string) => Promise<boolean>;
  manualRefresh: (sourceId: string) => Promise<boolean>;
  addSource: (sourceData: Source) => Promise<Source | null>;
}

function makeDeps(overrides: Partial<UseSourceRefreshDeps> = {}): UseSourceRefreshDeps {
  return {
    sources: [],
    workspaceId: 'ws-test-1',
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
    mockExecuteRequest.mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"access_token":"eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzZXJ2aWNlQG9wZW5oZWFkZXJzLmlvIn0.sig","expires_in":3600}',
      duration: 100,
      responseSize: 100,
      isFiltered: false,
    });
    mockManualRefresh.mockResolvedValue({ success: true });

    Object.defineProperty(window, 'electronAPI', {
      value: {
        sourceRefresh: {
          manualRefresh: mockManualRefresh,
        },
        httpRequest: {
          executeRequest: mockExecuteRequest,
          getTotpCooldown: vi.fn(),
          generateTotpPreview: vi.fn(),
        },
      },
      writable: true,
      configurable: true,
    });
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
      expect(mockManualRefresh).toHaveBeenCalledWith('src-1');
      expect(showMessage).toHaveBeenCalledWith('success', 'Source refreshed');
    });

    it('returns false and shows error when IPC manualRefresh fails', async () => {
      mockManualRefresh.mockResolvedValue({ success: false, error: 'Network error' });

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
      Object.defineProperty(window, 'electronAPI', {
        value: {},
        writable: true,
        configurable: true,
      });

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

      expect(mockManualRefresh).toHaveBeenCalledWith('http-1');
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
    it('fetches initial content for HTTP sources via IPC before adding', async () => {
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
      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://auth.openheaders.io/oauth2/token',
          method: 'GET',
        }),
      );
      expect(deps.addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceContent: expect.any(String),
          needsInitialFetch: false,
        }),
      );
      expect(showMessage).toHaveBeenCalledWith('success', 'Source added successfully');
    });

    it('returns false when initial HTTP fetch fails', async () => {
      mockExecuteRequest.mockRejectedValue(new Error('Connection refused'));
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

      expect(mockExecuteRequest).not.toHaveBeenCalled();
      expect(deps.addSource).toHaveBeenCalled();
    });
  });
});
