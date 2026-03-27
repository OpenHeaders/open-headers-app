// @vitest-environment jsdom
/**
 * Tests for useSources hook
 *
 * Validates source CRUD, refresh (file/env/http), import, export,
 * and broadcast suppression during workspace switch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Source } from '../../../../src/types/source';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

const mockShowMessage = vi.fn();
vi.mock('../../../../src/renderer/utils', () => ({
  showMessage: (...args: unknown[]) => mockShowMessage(...args),
}));

const mockAddSource = vi.fn();
const mockUpdateSource = vi.fn();
const mockRemoveSource = vi.fn();
const mockUpdateSourceContent = vi.fn();
const mockRefreshSource = vi.fn();
const mockImportSources = vi.fn();
const mockSetState = vi.fn();
const mockGetState = vi.fn();

const mockSources: Source[] = [
  { sourceId: 'src-1', sourceType: 'file', sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json', sourceContent: '{"api_key":"ohk_live_4eC39HqLyjWDarjtT1zdp7dc"}' },
  { sourceId: 'src-2', sourceType: 'http', sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token', sourceMethod: 'GET', sourceName: 'Production OAuth Token' },
  { sourceId: 'src-3', sourceType: 'env', sourcePath: 'OPENHEADERS_API_KEY', sourceName: 'API Key from Environment' },
];

let mockIsWorkspaceSwitching = false;

vi.mock('../../../../src/renderer/hooks/useCentralizedWorkspace', () => ({
  useCentralizedWorkspace: () => ({
    sources: mockSources,
    isWorkspaceSwitching: mockIsWorkspaceSwitching,
    service: {
      state: { sources: mockSources },
      getState: mockGetState,
      setState: mockSetState,
      addSource: mockAddSource,
      updateSource: mockUpdateSource,
      removeSource: mockRemoveSource,
      updateSourceContent: mockUpdateSourceContent,
      refreshSource: mockRefreshSource,
      importSources: mockImportSources,
    },
  }),
}));

import { useSources } from '../../../../src/renderer/hooks/workspace/useSources';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSources', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockShowMessage.mockClear();
    mockAddSource.mockResolvedValue({ sourceId: 'new-1', sourceType: 'file' });
    mockUpdateSource.mockResolvedValue({ sourceId: 'src-1', sourceType: 'file' });
    mockRemoveSource.mockResolvedValue(undefined);
    mockUpdateSourceContent.mockResolvedValue(undefined);
    mockGetState.mockReturnValue({ sources: mockSources });
    mockRefreshSource.mockReset().mockResolvedValue(true);
    mockImportSources.mockReset().mockResolvedValue(undefined);
    mockIsWorkspaceSwitching = false;
  });

  // ── addSource ──────────────────────────────────────────────────

  describe('addSource', () => {
    it('adds a source via service and returns it', async () => {
      const { result } = renderHook(() => useSources());

      let added: unknown = null;
      await act(async () => {
        added = await result.current.addSource({ sourceId: 'new-1', sourceType: 'file', sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/dev.json' });
      });

      expect(added).toEqual({ sourceId: 'new-1', sourceType: 'file' });
      expect(mockAddSource).toHaveBeenCalledWith({ sourceId: 'new-1', sourceType: 'file', sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/dev.json' });
    });

    it('returns null and shows error on failure', async () => {
      mockAddSource.mockRejectedValue(new Error('Duplicate source'));

      const { result } = renderHook(() => useSources());

      let added: unknown = 'not-null';
      await act(async () => {
        added = await result.current.addSource({ sourceId: 'bad-1', sourceType: 'file' });
      });

      expect(added).toBeNull();
      expect(mockShowMessage).toHaveBeenCalledWith('error', 'Duplicate source');
    });
  });

  // ── updateSource ───────────────────────────────────────────────

  describe('updateSource', () => {
    it('updates a source and returns updated data', async () => {
      const { result } = renderHook(() => useSources());

      let updated: unknown = null;
      await act(async () => {
        updated = await result.current.updateSource('src-1', { sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/updated.json' });
      });

      expect(updated).toEqual({ sourceId: 'src-1', sourceType: 'file' });
      expect(mockUpdateSource).toHaveBeenCalledWith('src-1', { sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/updated.json' });
    });

    it('returns null on error', async () => {
      mockUpdateSource.mockRejectedValue(new Error('Not found'));

      const { result } = renderHook(() => useSources());

      let updated: unknown = 'not-null';
      await act(async () => {
        updated = await result.current.updateSource('bad-id', {});
      });

      expect(updated).toBeNull();
      expect(mockShowMessage).toHaveBeenCalledWith('error', 'Not found');
    });
  });

  // ── removeSource ───────────────────────────────────────────────

  describe('removeSource', () => {
    it('removes source and shows success', async () => {
      const { result } = renderHook(() => useSources());

      let removed = false;
      await act(async () => {
        removed = await result.current.removeSource('src-1');
      });

      expect(removed).toBe(true);
      expect(mockRemoveSource).toHaveBeenCalledWith('src-1');
      expect(mockShowMessage).toHaveBeenCalledWith('success', 'Source removed');
    });

    it('returns false on error', async () => {
      mockRemoveSource.mockRejectedValue(new Error('In use'));

      const { result } = renderHook(() => useSources());

      let removed = true;
      await act(async () => {
        removed = await result.current.removeSource('src-1');
      });

      expect(removed).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', 'In use');
    });
  });

  // ── refreshSource ──────────────────────────────────────────────

  describe('refreshSource', () => {
    it('delegates file source refresh to service via IPC', async () => {
      const { result } = renderHook(() => useSources());

      let refreshed = false;
      await act(async () => {
        refreshed = await result.current.refreshSource('src-1');
      });

      expect(refreshed).toBe(true);
      expect(mockRefreshSource).toHaveBeenCalledWith('src-1');
      expect(mockShowMessage).toHaveBeenCalledWith('success', 'Source refreshed');
    });

    it('delegates env source refresh to service via IPC', async () => {
      const { result } = renderHook(() => useSources());

      let refreshed = false;
      await act(async () => {
        refreshed = await result.current.refreshSource('src-3');
      });

      expect(refreshed).toBe(true);
      expect(mockRefreshSource).toHaveBeenCalledWith('src-3');
    });

    it('delegates HTTP source refresh to service via IPC', async () => {
      const { result } = renderHook(() => useSources());

      let refreshed = false;
      await act(async () => {
        refreshed = await result.current.refreshSource('src-2');
      });

      expect(refreshed).toBe(true);
      expect(mockRefreshSource).toHaveBeenCalledWith('src-2');
    });

    it('returns false when service refresh fails', async () => {
      mockRefreshSource.mockRejectedValue(new Error('Source non-existent not found'));

      const { result } = renderHook(() => useSources());

      let refreshed = true;
      await act(async () => {
        refreshed = await result.current.refreshSource('non-existent');
      });

      expect(refreshed).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', expect.stringContaining('not found'));
    });
  });

  // ── importSources ──────────────────────────────────────────────

  describe('importSources', () => {
    it('delegates import to service via IPC (merge by default)', async () => {
      const newSources = [{ sourceId: 'new-1', sourceType: 'file' as const, sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/imported.json' }];

      const { result } = renderHook(() => useSources());

      let imported = false;
      await act(async () => {
        imported = await result.current.importSources(newSources);
      });

      expect(imported).toBe(true);
      expect(mockImportSources).toHaveBeenCalledWith(newSources, false);
      expect(mockShowMessage).toHaveBeenCalledWith('success', expect.stringContaining('Imported'));
    });

    it('delegates replace import to service via IPC', async () => {
      const newSources = [{ sourceId: 'replaced-1', sourceType: 'file' as const }];

      const { result } = renderHook(() => useSources());

      await act(async () => {
        await result.current.importSources(newSources, true);
      });

      expect(mockImportSources).toHaveBeenCalledWith(newSources, true);
    });
  });

  // ── exportSources ──────────────────────────────────────────────

  describe('exportSources', () => {
    it('returns current sources array', () => {
      const { result } = renderHook(() => useSources());
      expect(result.current.exportSources()).toEqual(mockSources);
    });
  });

  // ── updateRefreshOptions ───────────────────────────────────────

  describe('updateRefreshOptions', () => {
    it('updates refresh options via updateSource', async () => {
      const { result } = renderHook(() => useSources());

      let updated = false;
      await act(async () => {
        updated = await result.current.updateRefreshOptions('src-2', { enabled: true, interval: 60 });
      });

      expect(updated).toBe(true);
      expect(mockUpdateSource).toHaveBeenCalledWith('src-2', {
        refreshOptions: { enabled: true, interval: 60 }
      });
    });
  });

  // ── shouldSuppressBroadcast ────────────────────────────────────

  describe('shouldSuppressBroadcast', () => {
    it('returns false normally', () => {
      const { result } = renderHook(() => useSources());
      expect(result.current.shouldSuppressBroadcast(mockSources)).toBe(false);
    });

    it('returns true during workspace switch', () => {
      mockIsWorkspaceSwitching = true;
      const { result } = renderHook(() => useSources());
      expect(result.current.shouldSuppressBroadcast(mockSources)).toBe(true);
    });
  });
});
