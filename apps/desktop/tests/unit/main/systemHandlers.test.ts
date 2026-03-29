import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcInvokeEvent } from '../../../src/types/common';

// Mock electron
const mockShellOpenPath = vi.fn().mockResolvedValue('');
const mockShellShowItemInFolder = vi.fn();
const mockShellOpenExternal = vi.fn().mockResolvedValue(undefined);

vi.mock('electron', () => ({
  default: {
    app: {
      getPath: (name: string) => `/tmp/open-headers-test/${name}`,
      getName: () => 'OpenHeaders',
      getVersion: () => '3.2.1-test',
      isPackaged: false,
      on: vi.fn(),
      setAsDefaultProtocolClient: vi.fn(),
      dock: { show: vi.fn().mockResolvedValue(undefined) },
    },
    shell: {
      openExternal: (...args: unknown[]) => mockShellOpenExternal(...args),
      openPath: (...args: unknown[]) => mockShellOpenPath(...args),
      showItemInFolder: (...args: unknown[]) => mockShellShowItemInFolder(...args),
    },
    systemPreferences: {
      getMediaAccessStatus: vi.fn(() => 'granted'),
    },
    BrowserWindow: Object.assign(vi.fn(), {
      getAllWindows: () => [],
      getFocusedWindow: () => null,
      fromWebContents: () => null,
    }),
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    Tray: vi.fn(),
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    nativeImage: { createFromPath: vi.fn(() => ({ resize: vi.fn() })) },
    screen: { getAllDisplays: () => [] },
    dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
    globalShortcut: { register: vi.fn(), unregister: vi.fn(), isRegistered: vi.fn() },
  },
  app: {
    getPath: (name: string) => `/tmp/open-headers-test/${name}`,
    getName: () => 'OpenHeaders',
    getVersion: () => '3.2.1-test',
    on: vi.fn(),
    setAsDefaultProtocolClient: vi.fn(),
    dock: { show: vi.fn().mockResolvedValue(undefined) },
  },
  shell: {
    openExternal: (...args: unknown[]) => mockShellOpenExternal(...args),
    openPath: (...args: unknown[]) => mockShellOpenPath(...args),
    showItemInFolder: (...args: unknown[]) => mockShellShowItemInFolder(...args),
  },
  systemPreferences: {
    getMediaAccessStatus: vi.fn(() => 'granted'),
  },
  BrowserWindow: Object.assign(vi.fn(), {
    getAllWindows: () => [],
    getFocusedWindow: () => null,
    fromWebContents: () => null,
  }),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  Tray: vi.fn(),
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
  nativeImage: { createFromPath: vi.fn(() => ({ resize: vi.fn() })) },
  screen: { getAllDisplays: () => [] },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  globalShortcut: { register: vi.fn(), unregister: vi.fn(), isRegistered: vi.fn() },
}));

vi.mock('../../../src/utils/mainLogger.js', () => ({
  default: {
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    getLogDirectory: () => '/tmp/open-headers-logs',
  },
  setGlobalLogLevel: vi.fn(),
}));

vi.mock('../../../src/services/core/TimeManager.js', () => ({
  default: {
    now: () => Date.now(),
    getDate: () => new Date(),
  },
}));

vi.mock('../../../src/main/modules/tray/trayManager.js', () => ({
  default: { updateTray: vi.fn() },
}));

vi.mock('../../../src/services/websocket/ws-service.js', () => ({
  default: {
    broadcastVideoRecordingState: vi.fn(),
    broadcastRecordingHotkeyChange: vi.fn(),
  },
}));

vi.mock('../../../src/utils/atomicFileWriter.js', () => ({
  default: {
    writeJson: vi.fn().mockResolvedValue(undefined),
    readJson: vi.fn().mockResolvedValue(null),
    readFile: vi.fn().mockResolvedValue(null),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('auto-launch', () => {
  class MockAutoLaunch {
    enable = vi.fn().mockResolvedValue(undefined);
    disable = vi.fn().mockResolvedValue(undefined);
  }
  return { default: MockAutoLaunch };
});

import { SystemHandlers } from '../../../src/main/modules/ipc/handlers/systemHandlers';

const mockEvent = {} as IpcInvokeEvent;

describe('SystemHandlers', () => {
  let handlers: SystemHandlers;

  beforeEach(() => {
    handlers = new SystemHandlers();
    vi.clearAllMocks();
  });

  describe('mapWindowsToIANA', () => {
    describe('North America', () => {
      it('maps Pacific Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Pacific Standard Time')).toBe('America/Los_Angeles');
      });

      it('maps Mountain Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Mountain Standard Time')).toBe('America/Denver');
      });

      it('maps Central Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Central Standard Time')).toBe('America/Chicago');
      });

      it('maps Eastern Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Eastern Standard Time')).toBe('America/New_York');
      });

      it('maps US Mountain Standard Time (Arizona)', () => {
        expect(handlers.mapWindowsToIANA('US Mountain Standard Time')).toBe('America/Phoenix');
      });

      it('maps Hawaiian Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Hawaiian Standard Time')).toBe('Pacific/Honolulu');
      });

      it('maps Alaskan Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Alaskan Standard Time')).toBe('America/Anchorage');
      });

      it('maps Mexico timezone variants', () => {
        expect(handlers.mapWindowsToIANA('Pacific Standard Time (Mexico)')).toBe('America/Tijuana');
        expect(handlers.mapWindowsToIANA('Central Standard Time (Mexico)')).toBe('America/Mexico_City');
      });
    });

    describe('Europe', () => {
      it('maps GMT Standard Time', () => {
        expect(handlers.mapWindowsToIANA('GMT Standard Time')).toBe('Europe/London');
      });

      it('maps Central European Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Central European Standard Time')).toBe('Europe/Berlin');
      });

      it('maps W. Europe Standard Time', () => {
        expect(handlers.mapWindowsToIANA('W. Europe Standard Time')).toBe('Europe/Paris');
      });

      it('maps E. Europe Standard Time', () => {
        expect(handlers.mapWindowsToIANA('E. Europe Standard Time')).toBe('Europe/Bucharest');
      });

      it('maps Russian Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Russian Standard Time')).toBe('Europe/Moscow');
      });

      it('maps Turkey Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Turkey Standard Time')).toBe('Europe/Istanbul');
      });
    });

    describe('Asia-Pacific', () => {
      it('maps Tokyo Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Tokyo Standard Time')).toBe('Asia/Tokyo');
      });

      it('maps India Standard Time', () => {
        expect(handlers.mapWindowsToIANA('India Standard Time')).toBe('Asia/Kolkata');
      });

      it('maps China Standard Time', () => {
        expect(handlers.mapWindowsToIANA('China Standard Time')).toBe('Asia/Shanghai');
      });

      it('maps Korea Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Korea Standard Time')).toBe('Asia/Seoul');
      });

      it('maps Singapore Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Singapore Standard Time')).toBe('Asia/Singapore');
      });

      it('maps AUS Eastern Standard Time', () => {
        expect(handlers.mapWindowsToIANA('AUS Eastern Standard Time')).toBe('Australia/Sydney');
      });

      it('maps New Zealand Standard Time', () => {
        expect(handlers.mapWindowsToIANA('New Zealand Standard Time')).toBe('Pacific/Auckland');
      });
    });

    describe('South America', () => {
      it('maps Argentina Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Argentina Standard Time')).toBe('America/Buenos_Aires');
      });

      it('maps Brasilia Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Brasilia Standard Time')).toBe('America/Sao_Paulo');
      });
    });

    describe('Middle East & Africa', () => {
      it('maps Arabian Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Arabian Standard Time')).toBe('Asia/Dubai');
      });

      it('maps Israel Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Israel Standard Time')).toBe('Asia/Jerusalem');
      });

      it('maps Iran Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Iran Standard Time')).toBe('Asia/Tehran');
      });

      it('maps South Africa Standard Time', () => {
        expect(handlers.mapWindowsToIANA('South Africa Standard Time')).toBe('Africa/Johannesburg');
      });

      it('maps Egypt Standard Time', () => {
        expect(handlers.mapWindowsToIANA('Egypt Standard Time')).toBe('Africa/Cairo');
      });
    });

    describe('edge cases', () => {
      it('maps UTC correctly', () => {
        expect(handlers.mapWindowsToIANA('UTC')).toBe('UTC');
      });

      it('returns unknown timezone IDs unchanged', () => {
        expect(handlers.mapWindowsToIANA('Some Unknown Timezone')).toBe('Some Unknown Timezone');
      });

      it('returns empty string unchanged', () => {
        expect(handlers.mapWindowsToIANA('')).toBe('');
      });
    });
  });

  describe('handleShowItemInFolder', () => {
    it('calls shell.showItemInFolder with the path', () => {
      handlers.handleShowItemInFolder(mockEvent, '/Users/jane.doe/Documents/OpenHeaders/exports/config.json');
      expect(mockShellShowItemInFolder).toHaveBeenCalledWith(
        '/Users/jane.doe/Documents/OpenHeaders/exports/config.json',
      );
    });

    it('does nothing for empty string', () => {
      handlers.handleShowItemInFolder(mockEvent, '');
      expect(mockShellShowItemInFolder).not.toHaveBeenCalled();
    });

    it('does nothing for non-string input', () => {
      handlers.handleShowItemInFolder(mockEvent, null as unknown as string);
      expect(mockShellShowItemInFolder).not.toHaveBeenCalled();
    });
  });

  describe('handleOpenAppPath', () => {
    it('opens logs directory', async () => {
      const result = await handlers.handleOpenAppPath(mockEvent, 'logs');
      expect(result).toEqual({ success: true });
      expect(mockShellOpenPath).toHaveBeenCalledWith('/tmp/open-headers-logs');
    });

    it('opens userData directory', async () => {
      const result = await handlers.handleOpenAppPath(mockEvent, 'userData');
      expect(result).toEqual({ success: true });
      expect(mockShellOpenPath).toHaveBeenCalledWith('/tmp/open-headers-test/userData');
    });

    it('shows settings.json in folder', async () => {
      const result = await handlers.handleOpenAppPath(mockEvent, 'settings');
      expect(result).toEqual({ success: true });
      expect(mockShellShowItemInFolder).toHaveBeenCalledWith(expect.stringContaining('settings.json'));
    });

    it('returns error for unknown path key', async () => {
      const result = await handlers.handleOpenAppPath(mockEvent, 'unknown-key');
      expect(result).toEqual({
        success: false,
        error: 'Unknown path key: unknown-key',
      });
    });

    it('returns error when shell.openPath fails', async () => {
      mockShellOpenPath.mockResolvedValueOnce('Permission denied');

      const result = await handlers.handleOpenAppPath(mockEvent, 'userData');
      expect(result).toEqual({
        success: false,
        error: 'Permission denied',
      });
    });
  });

  describe('handleCheckScreenRecordingPermission', () => {
    it('returns platform info', async () => {
      const result = await handlers.handleCheckScreenRecordingPermission();
      expect(result.success).toBe(true);
      expect(result.platform).toBe(process.platform);
    });

    it('returns hasPermission true on non-macOS platforms', async () => {
      // In test env, platform is typically 'darwin' but the handler
      // checks for it; on darwin it returns null, others return true
      const result = await handlers.handleCheckScreenRecordingPermission();
      expect(result.success).toBe(true);
      if (process.platform === 'darwin') {
        expect(result.hasPermission).toBeNull();
      } else {
        expect(result.hasPermission).toBe(true);
      }
    });
  });
});
