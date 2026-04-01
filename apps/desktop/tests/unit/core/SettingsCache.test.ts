import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@/types/settings';

// ── Mocks ─────────────────────────────────────────────────────────

const mockSend = vi.fn();
const mockWindows = vi.fn<() => Array<{ isDestroyed: () => boolean; webContents: { send: typeof mockSend } }>>(() => []);

vi.mock('electron', () => ({
  default: {
    app: {
      getPath: (name: string) => `/tmp/open-headers-test/${name}`,
      getVersion: () => '3.0.0',
    },
    BrowserWindow: {
      getAllWindows: () => mockWindows(),
    },
  },
}));

const mockWriteJson = vi.fn().mockResolvedValue(undefined);
vi.mock('@/utils/atomicFileWriter.js', () => ({
  default: {
    writeJson: (...args: unknown[]) => mockWriteJson(...args),
  },
}));

vi.mock('@/utils/mainLogger.js', () => ({
  default: {
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// ── Import after mocks ────────────────────────────────────────────

import { SettingsCache } from '@/services/core/SettingsCache';

function makeWindow(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: { send: mockSend },
  };
}

describe('SettingsCache', () => {
  let cache: SettingsCache;

  beforeEach(() => {
    cache = new SettingsCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('load()', () => {
    it('loads settings from disk when file exists', async () => {
      const diskSettings = { theme: 'dark', compactMode: true };
      vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs.promises, 'readFile').mockResolvedValue(JSON.stringify(diskSettings));

      const result = await cache.load();

      expect(result.theme).toBe('dark');
      expect(result.compactMode).toBe(true);
      // Defaults should still be present
      expect(result.launchAtLogin).toBe(true);
      expect(cache.isFirstRun()).toBe(false);
    });

    it('creates default settings on first run', async () => {
      vi.spyOn(fs.promises, 'access').mockRejectedValue(new Error('ENOENT'));

      const result = await cache.load();

      expect(result.theme).toBe('auto');
      expect(cache.isFirstRun()).toBe(true);
      expect(mockWriteJson).toHaveBeenCalledOnce();
    });

    it('returns cached settings on subsequent calls', async () => {
      vi.spyOn(fs.promises, 'access').mockRejectedValue(new Error('ENOENT'));

      const first = await cache.load();
      const second = await cache.load();

      expect(first).toBe(second);
    });
  });

  describe('get()', () => {
    it('throws when called before load()', () => {
      expect(() => cache.get()).toThrow('called before load()');
    });

    it('returns settings after load()', async () => {
      vi.spyOn(fs.promises, 'access').mockRejectedValue(new Error('ENOENT'));
      await cache.load();

      const result = cache.get();
      expect(result.theme).toBe('auto');
    });
  });

  describe('save()', () => {
    beforeEach(async () => {
      vi.spyOn(fs.promises, 'access').mockRejectedValue(new Error('ENOENT'));
      await cache.load();
      vi.clearAllMocks();
    });

    it('merges updates and persists to disk', async () => {
      const result = await cache.save({ theme: 'dark', compactMode: true });

      expect(result.theme).toBe('dark');
      expect(result.compactMode).toBe(true);
      expect(result.launchAtLogin).toBe(true); // Unchanged default preserved
      expect(mockWriteJson).toHaveBeenCalledOnce();
    });

    it('updates in-memory cache so get() reflects changes', async () => {
      await cache.save({ theme: 'dark' });

      expect(cache.get().theme).toBe('dark');
    });

    it('pushes settings to all open renderer windows', async () => {
      mockWindows.mockReturnValue([makeWindow(), makeWindow()]);

      await cache.save({ theme: 'dark' });

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenCalledWith('settings-changed', expect.objectContaining({ theme: 'dark' }));
    });

    it('skips destroyed windows', async () => {
      mockWindows.mockReturnValue([makeWindow(true), makeWindow()]);

      await cache.save({ theme: 'dark' });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('gracefully handles zero open windows (background-only mode)', async () => {
      mockWindows.mockReturnValue([]);

      await cache.save({ theme: 'dark' });

      expect(mockSend).not.toHaveBeenCalled();
      // Settings still saved to disk
      expect(mockWriteJson).toHaveBeenCalledOnce();
      // Cache still updated
      expect(cache.get().theme).toBe('dark');
    });

    it('pushes full merged settings, not just the partial update', async () => {
      mockWindows.mockReturnValue([makeWindow()]);

      await cache.save({ theme: 'dark' });

      const pushed = mockSend.mock.calls[0][1] as AppSettings;
      // Should contain the updated field
      expect(pushed.theme).toBe('dark');
      // Should also contain all other fields (full settings)
      expect(pushed.launchAtLogin).toBe(true);
      expect(pushed.recordingHotkey).toBe('CommandOrControl+Shift+E');
    });
  });
});
