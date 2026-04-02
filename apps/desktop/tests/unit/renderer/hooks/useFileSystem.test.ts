// @vitest-environment jsdom
/**
 * Tests for useFileSystem hook
 *
 * Validates file operations, watcher tracking, and dialog handling.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockWatchFile = vi.fn();
const mockUnwatchFile = vi.fn();
const mockOpenFileDialog = vi.fn();
const mockSaveFileDialog = vi.fn();

Object.defineProperty(window, 'electronAPI', {
  value: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    watchFile: mockWatchFile,
    unwatchFile: mockUnwatchFile,
    openFileDialog: mockOpenFileDialog,
    saveFileDialog: mockSaveFileDialog,
  },
  writable: true,
});

import { useFileSystem } from '@/renderer/hooks/useFileSystem';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFileSystem', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── readFile ─────────────────────────────────────────────────────

  describe('readFile', () => {
    it('reads file via electronAPI', async () => {
      mockReadFile.mockResolvedValue('file content');

      const { result } = renderHook(() => useFileSystem());

      let content: string | undefined;
      await act(async () => {
        content = await result.current.readFile('/tmp/test.txt');
      });

      expect(mockReadFile).toHaveBeenCalledWith('/tmp/test.txt');
      expect(content).toBe('file content');
    });

    it('wraps errors with descriptive message', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const { result } = renderHook(() => useFileSystem());

      await expect(
        act(async () => {
          await result.current.readFile('/missing');
        }),
      ).rejects.toThrow('Error reading file: ENOENT');
    });
  });

  // ── writeFile ────────────────────────────────────────────────────

  describe('writeFile', () => {
    it('writes file and returns true', async () => {
      mockWriteFile.mockResolvedValue(undefined);

      const { result } = renderHook(() => useFileSystem());

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.writeFile('/tmp/out.txt', 'data');
      });

      expect(mockWriteFile).toHaveBeenCalledWith('/tmp/out.txt', 'data');
      expect(success).toBe(true);
    });

    it('wraps errors with descriptive message', async () => {
      mockWriteFile.mockRejectedValue(new Error('EACCES'));

      const { result } = renderHook(() => useFileSystem());

      await expect(
        act(async () => {
          await result.current.writeFile('/readonly', 'x');
        }),
      ).rejects.toThrow('Error writing to file: EACCES');
    });
  });

  // ── watchFile / unwatchFile ──────────────────────────────────────

  describe('watchFile', () => {
    it('watches file and returns initial content', async () => {
      mockWatchFile.mockResolvedValue('initial');

      const { result } = renderHook(() => useFileSystem());

      let content: string | undefined;
      await act(async () => {
        content = await result.current.watchFile('src-1', '/tmp/watched.txt');
      });

      expect(mockWatchFile).toHaveBeenCalledWith('src-1', '/tmp/watched.txt');
      expect(content).toBe('initial');
    });
  });

  describe('unwatchFile', () => {
    it('unwatches a previously watched file', async () => {
      mockWatchFile.mockResolvedValue('content');
      mockUnwatchFile.mockResolvedValue(undefined);

      const { result } = renderHook(() => useFileSystem());

      // First watch
      await act(async () => {
        await result.current.watchFile('src-1', '/tmp/watched.txt');
      });

      // Then unwatch
      let unwatched: boolean | undefined;
      await act(async () => {
        unwatched = await result.current.unwatchFile('src-1', '/tmp/watched.txt');
      });

      expect(mockUnwatchFile).toHaveBeenCalledWith('/tmp/watched.txt');
      expect(unwatched).toBe(true);
    });

    it('returns false for source that is not being watched', async () => {
      const { result } = renderHook(() => useFileSystem());

      let unwatched: boolean | undefined;
      await act(async () => {
        unwatched = await result.current.unwatchFile('unknown', '/tmp/x.txt');
      });

      expect(mockUnwatchFile).not.toHaveBeenCalled();
      expect(unwatched).toBe(false);
    });
  });

  // ── selectFile ───────────────────────────────────────────────────

  describe('selectFile', () => {
    it('returns selected file path', async () => {
      mockOpenFileDialog.mockResolvedValue('/tmp/selected.txt');

      const { result } = renderHook(() => useFileSystem());

      let path: string | null | undefined;
      await act(async () => {
        path = await result.current.selectFile();
      });

      expect(path).toBe('/tmp/selected.txt');
    });

    it('returns null when user cancels', async () => {
      mockOpenFileDialog.mockResolvedValue(null);

      const { result } = renderHook(() => useFileSystem());

      let path: string | null | undefined;
      await act(async () => {
        path = await result.current.selectFile();
      });

      expect(path).toBeNull();
    });
  });

  // ── saveFile ─────────────────────────────────────────────────────

  describe('saveFile', () => {
    it('saves content to selected path', async () => {
      mockSaveFileDialog.mockResolvedValue('/tmp/saved.txt');
      mockWriteFile.mockResolvedValue(undefined);

      const { result } = renderHook(() => useFileSystem());

      let path: string | null | undefined;
      await act(async () => {
        path = await result.current.saveFile({}, 'save this');
      });

      expect(path).toBe('/tmp/saved.txt');
      expect(mockWriteFile).toHaveBeenCalledWith('/tmp/saved.txt', 'save this');
    });

    it('does not write when user cancels', async () => {
      mockSaveFileDialog.mockResolvedValue(null);

      const { result } = renderHook(() => useFileSystem());

      let path: string | null | undefined;
      await act(async () => {
        path = await result.current.saveFile({}, 'content');
      });

      expect(path).toBeNull();
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('returns path without writing when no content provided', async () => {
      mockSaveFileDialog.mockResolvedValue('/tmp/empty.txt');

      const { result } = renderHook(() => useFileSystem());

      let path: string | null | undefined;
      await act(async () => {
        path = await result.current.saveFile();
      });

      expect(path).toBe('/tmp/empty.txt');
      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });
});
