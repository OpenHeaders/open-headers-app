import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcInvokeEvent } from '../../../src/types/common';
import type { AppSettings } from '../../../src/types/settings';

// Mock electron
vi.mock('electron', () => ({
  default: {
    app: {
      getPath: (name: string) => `/tmp/open-headers-test/${name}`,
      getName: () => 'OpenHeaders',
      getVersion: () => '3.2.1-test',
      getPath2: () => '/tmp',
      isPackaged: false,
    },
    shell: {
      openExternal: vi.fn().mockResolvedValue(undefined),
    },
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    BrowserWindow: Object.assign(vi.fn(), {
      getAllWindows: () => [],
      getFocusedWindow: () => null,
    }),
    Tray: vi.fn(),
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    nativeImage: { createFromPath: vi.fn(() => ({ resize: vi.fn() })) },
    screen: { getAllDisplays: () => [] },
    dialog: {
      showOpenDialog: vi.fn().mockResolvedValue({}),
      showSaveDialog: vi.fn().mockResolvedValue({}),
    },
    systemPreferences: { getMediaAccessStatus: vi.fn(() => 'granted') },
    globalShortcut: { register: vi.fn(), unregister: vi.fn(), isRegistered: vi.fn() },
  },
  app: {
    getPath: (name: string) => `/tmp/open-headers-test/${name}`,
    getName: () => 'OpenHeaders',
    getVersion: () => '3.2.1-test',
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: Object.assign(vi.fn(), {
    getAllWindows: () => [],
    getFocusedWindow: () => null,
  }),
  Tray: vi.fn(),
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
  nativeImage: { createFromPath: vi.fn(() => ({ resize: vi.fn() })) },
  screen: { getAllDisplays: () => [] },
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({}),
    showSaveDialog: vi.fn().mockResolvedValue({}),
  },
  systemPreferences: { getMediaAccessStatus: vi.fn(() => 'granted') },
  globalShortcut: { register: vi.fn(), unregister: vi.fn(), isRegistered: vi.fn() },
}));

// Mock mainLogger
vi.mock('../../../src/utils/mainLogger.js', () => ({
  default: {
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    getLogDirectory: () => '/tmp/logs',
  },
  setGlobalLogLevel: vi.fn(),
}));

// Mock atomicFileWriter (still used transitively by SettingsCache)
const mockWriteJson = vi.fn().mockResolvedValue(undefined);
const mockReadJson = vi.fn().mockResolvedValue(null);
vi.mock('../../../src/utils/atomicFileWriter.js', () => ({
  default: {
    writeJson: (...args: unknown[]) => mockWriteJson(...args),
    readJson: (...args: unknown[]) => mockReadJson(...args),
    readFile: vi.fn().mockResolvedValue(null),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock SettingsCache — settingsHandlers now delegates to this singleton
const mockSettingsGet = vi.fn<() => AppSettings>();
const mockSettingsSave = vi.fn<(updates: Partial<AppSettings>) => Promise<AppSettings>>();
vi.mock('../../../src/services/core/SettingsCache.js', () => {
  const defaultSettings = {
    launchAtLogin: true,
    hideOnLaunch: true,
    showDockIcon: true,
    showStatusBarIcon: true,
    theme: 'auto',
    autoStartProxy: true,
    proxyCacheEnabled: true,
    autoHighlightTableEntries: false,
    autoScrollTableEntries: false,
    compactMode: false,
    tutorialMode: true,
    developerMode: false,
    videoRecording: false,
    videoQuality: 'high',
    recordingHotkey: 'CommandOrControl+Shift+E',
    recordingHotkeyEnabled: true,
    logLevel: 'info',
    autoUpdate: true,
    updateChannel: 'production',
  };

  const cache = {
    get: (...args: unknown[]) => mockSettingsGet(...(args as [])),
    save: (...args: unknown[]) => mockSettingsSave(...(args as [Record<string, unknown>])),
    load: vi.fn().mockResolvedValue(defaultSettings),
    isFirstRun: vi.fn().mockReturnValue(false),
  };
  return { default: cache, settingsCache: cache, getDefaultSettings: () => defaultSettings, SettingsCache: vi.fn() };
});

// Mock trayManager
vi.mock('../../../src/main/modules/tray/trayManager.js', () => ({
  default: { updateTray: vi.fn() },
}));

// Mock webSocketService
vi.mock('../../../src/services/websocket/ws-service.js', () => ({
  default: {
    broadcastVideoRecordingState: vi.fn(),
    broadcastRecordingHotkeyChange: vi.fn(),
  },
}));

// Mock autoUpdater module (dynamically imported by settingsHandlers)
const mockApplyUpdateSettings = vi.fn();
vi.mock('../../../src/main/modules/updater/autoUpdater.js', () => ({
  default: { applyUpdateSettings: mockApplyUpdateSettings },
}));

// Mock AutoLaunch
vi.mock('auto-launch', () => {
  class MockAutoLaunch {
    enable = vi.fn().mockResolvedValue(undefined);
    disable = vi.fn().mockResolvedValue(undefined);
  }
  return { default: MockAutoLaunch };
});

import { SettingsHandlers } from '../../../src/main/modules/ipc/handlers/settingsHandlers';

const mockEvent = {} as IpcInvokeEvent;

function makeDefaultSettings(): AppSettings {
  return {
    launchAtLogin: true,
    hideOnLaunch: true,
    showDockIcon: true,
    showStatusBarIcon: true,
    theme: 'auto',
    autoStartProxy: true,
    proxyCacheEnabled: true,
    autoHighlightTableEntries: false,
    autoScrollTableEntries: false,
    compactMode: false,
    tutorialMode: true,
    developerMode: false,
    videoRecording: false,
    videoQuality: 'high',
    recordingHotkey: 'CommandOrControl+Shift+E',
    recordingHotkeyEnabled: true,
    logLevel: 'info',
    autoUpdate: true,
    updateChannel: 'production',
  };
}

describe('SettingsHandlers', () => {
  let handlers: SettingsHandlers;

  beforeEach(() => {
    handlers = new SettingsHandlers();
    vi.clearAllMocks();
  });

  describe('handleGetSettings', () => {
    it('returns settings from SettingsCache', async () => {
      const cachedSettings = makeDefaultSettings();
      cachedSettings.theme = 'dark';
      cachedSettings.developerMode = true;
      mockSettingsGet.mockReturnValue(cachedSettings);

      const result = await handlers.handleGetSettings();
      expect(result).toEqual(cachedSettings);
      expect(mockSettingsGet).toHaveBeenCalled();
    });

    it('returns default settings when cache has defaults', async () => {
      mockSettingsGet.mockReturnValue(makeDefaultSettings());

      const result = await handlers.handleGetSettings();
      const settings = result as AppSettings;

      expect(settings.launchAtLogin).toBe(true);
      expect(settings.hideOnLaunch).toBe(true);
      expect(settings.showDockIcon).toBe(true);
      expect(settings.showStatusBarIcon).toBe(true);
      expect(settings.autoStartProxy).toBe(true);
      expect(settings.proxyCacheEnabled).toBe(true);
      expect(settings.autoHighlightTableEntries).toBe(false);
      expect(settings.autoScrollTableEntries).toBe(false);
      expect(settings.compactMode).toBe(false);
      expect(settings.tutorialMode).toBe(true);
      expect(settings.developerMode).toBe(false);
      expect(settings.videoRecording).toBe(false);
      expect(settings.theme).toBe('auto');
      expect(settings.videoQuality).toBe('high');
      expect(settings.recordingHotkey).toBe('CommandOrControl+Shift+E');
      expect(settings.recordingHotkeyEnabled).toBe(true);
      expect(settings.logLevel).toBe('info');
    });

    it('throws when cache is not loaded', async () => {
      mockSettingsGet.mockImplementation(() => {
        throw new Error('SettingsCache.get() called before load()');
      });

      await expect(handlers.handleGetSettings()).rejects.toThrow('SettingsCache.get() called before load()');
    });
  });

  describe('handleSaveSettings', () => {
    it('saves partial settings via SettingsCache and returns success', async () => {
      const partialSettings: Partial<AppSettings> = {
        theme: 'dark',
        compactMode: true,
        developerMode: true,
      };
      mockSettingsSave.mockResolvedValueOnce({ ...makeDefaultSettings(), ...partialSettings });

      const result = await handlers.handleSaveSettings(mockEvent, partialSettings);

      expect(result).toEqual({ success: true });
      expect(mockSettingsSave).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: 'dark',
          compactMode: true,
          developerMode: true,
        }),
      );
    });

    it('coerces boolean settings to actual booleans', async () => {
      const settings = {
        hideOnLaunch: 1,
        showDockIcon: 0,
        developerMode: '',
      } as unknown as Partial<AppSettings>;
      mockSettingsSave.mockResolvedValueOnce({ ...makeDefaultSettings() });

      await handlers.handleSaveSettings(mockEvent, settings);

      const savedData = mockSettingsSave.mock.calls[0][0] as Record<string, unknown>;
      expect(savedData.hideOnLaunch).toBe(true);
      expect(savedData.showDockIcon).toBe(false);
      expect(savedData.developerMode).toBe(false);
    });

    it('returns error result on write failure', async () => {
      mockSettingsSave.mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));

      const result = await handlers.handleSaveSettings(mockEvent, { theme: 'light' });

      expect(result).toEqual({
        success: false,
        message: 'ENOSPC: no space left on device',
      });
    });

    it('accepts null event for programmatic saves', async () => {
      mockSettingsSave.mockResolvedValueOnce({ ...makeDefaultSettings(), autoStartProxy: false });

      const result = await handlers.handleSaveSettings(null, { autoStartProxy: false });
      expect(result).toEqual({ success: true });
    });
  });

  describe('handleSetAutoLaunch', () => {
    it('enables auto launch and returns success', async () => {
      const result = await handlers.handleSetAutoLaunch(mockEvent, true);
      expect(result).toEqual({ success: true });
    });

    it('disables auto launch and returns success', async () => {
      const result = await handlers.handleSetAutoLaunch(mockEvent, false);
      expect(result).toEqual({ success: true });
    });
  });

  describe('handleOpenExternal', () => {
    describe('protocol checks', () => {
      it('rejects non-HTTPS URLs', async () => {
        const result = await handlers.handleOpenExternal(mockEvent, 'http://openheaders.io');
        expect(result).toEqual({ success: false, error: 'Only HTTPS URLs are allowed' });
      });

      it('rejects ftp protocol', async () => {
        const result = await handlers.handleOpenExternal(mockEvent, 'ftp://files.openheaders.io');
        expect(result).toEqual({ success: false, error: 'Only HTTPS URLs are allowed' });
      });

      it('rejects file protocol', async () => {
        const result = await handlers.handleOpenExternal(mockEvent, 'file:///etc/passwd');
        expect(result).toEqual({ success: false, error: 'Only HTTPS URLs are allowed' });
      });

      it('rejects data protocol', async () => {
        const result = await handlers.handleOpenExternal(mockEvent, 'data:text/html,<script>alert(1)</script>');
        expect(result).toEqual({ success: false, error: 'Only HTTPS URLs are allowed' });
      });
    });

    describe('domain whitelist', () => {
      it('allows openheaders.io', async () => {
        const result = await handlers.handleOpenExternal(mockEvent, 'https://openheaders.io');
        expect(result).toEqual({ success: true });
      });

      it('allows openheaders.io subdomains', async () => {
        const result = await handlers.handleOpenExternal(
          mockEvent,
          'https://docs.openheaders.io/guide/getting-started',
        );
        expect(result).toEqual({ success: true });
      });

      it('allows github.com', async () => {
        const result = await handlers.handleOpenExternal(mockEvent, 'https://github.com/OpenHeaders/open-headers-app');
        expect(result).toEqual({ success: true });
      });

      it('allows chromewebstore.google.com', async () => {
        const result = await handlers.handleOpenExternal(
          mockEvent,
          'https://chromewebstore.google.com/detail/openheaders/abcdef123456',
        );
        expect(result).toEqual({ success: true });
      });

      it('allows microsoftedge.microsoft.com', async () => {
        const result = await handlers.handleOpenExternal(
          mockEvent,
          'https://microsoftedge.microsoft.com/addons/detail/openheaders/abcdef123456',
        );
        expect(result).toEqual({ success: true });
      });

      it('allows addons.mozilla.org', async () => {
        const result = await handlers.handleOpenExternal(
          mockEvent,
          'https://addons.mozilla.org/en-US/firefox/addon/openheaders/',
        );
        expect(result).toEqual({ success: true });
      });

      it('rejects untrusted domains', async () => {
        const result = await handlers.handleOpenExternal(mockEvent, 'https://evil-phishing.com/steal-data');
        expect(result).toEqual({ success: false, error: 'Only trusted domains are allowed' });
      });

      it('rejects domain spoofing with subdomain trick', async () => {
        const result = await handlers.handleOpenExternal(mockEvent, 'https://openheaders.io.evil.com/phish');
        expect(result).toEqual({ success: false, error: 'Only trusted domains are allowed' });
      });

      it('rejects google.com (only chromewebstore.google.com allowed)', async () => {
        const result = await handlers.handleOpenExternal(mockEvent, 'https://google.com');
        expect(result).toEqual({ success: false, error: 'Only trusted domains are allowed' });
      });

      it('rejects microsoft.com (only microsoftedge.microsoft.com allowed)', async () => {
        const result = await handlers.handleOpenExternal(mockEvent, 'https://microsoft.com');
        expect(result).toEqual({ success: false, error: 'Only trusted domains are allowed' });
      });
    });

    describe('invalid URLs', () => {
      it('returns error for non-URL strings', async () => {
        const result = await handlers.handleOpenExternal(mockEvent, 'not-a-url');
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('returns error for empty string', async () => {
        const result = await handlers.handleOpenExternal(mockEvent, '');
        expect(result.success).toBe(false);
      });
    });
  });

  describe('update settings', () => {
    it('applies update settings when autoUpdate changes', async () => {
      const savedSettings = { ...makeDefaultSettings(), autoUpdate: false };
      mockSettingsSave.mockResolvedValueOnce(savedSettings);
      mockSettingsGet.mockReturnValue(savedSettings);

      await handlers.handleSaveSettings(mockEvent, { autoUpdate: false });

      expect(mockApplyUpdateSettings).toHaveBeenCalledWith(savedSettings);
    });

    it('applies update settings when updateChannel changes', async () => {
      const savedSettings = { ...makeDefaultSettings(), updateChannel: 'beta' as const };
      mockSettingsSave.mockResolvedValueOnce(savedSettings);
      mockSettingsGet.mockReturnValue(savedSettings);

      await handlers.handleSaveSettings(mockEvent, { updateChannel: 'beta' });

      expect(mockApplyUpdateSettings).toHaveBeenCalledWith(savedSettings);
    });

    it('does not apply update settings when unrelated settings change', async () => {
      mockSettingsSave.mockResolvedValueOnce({ ...makeDefaultSettings(), theme: 'dark' });

      await handlers.handleSaveSettings(mockEvent, { theme: 'dark' });

      expect(mockApplyUpdateSettings).not.toHaveBeenCalled();
    });

    it('coerces autoUpdate to boolean', async () => {
      const savedSettings = makeDefaultSettings();
      mockSettingsSave.mockResolvedValueOnce(savedSettings);
      mockSettingsGet.mockReturnValue(savedSettings);

      await handlers.handleSaveSettings(mockEvent, { autoUpdate: 0 } as unknown as Partial<AppSettings>);

      const savedData = mockSettingsSave.mock.calls[0][0] as Record<string, unknown>;
      expect(savedData.autoUpdate).toBe(false);
    });
  });
});
