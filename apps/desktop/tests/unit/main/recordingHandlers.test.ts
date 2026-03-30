import type { RecordingMetadata, WorkflowRecordingFileMetadata } from '@openheaders/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcInvokeEvent } from '@/types/common';

// --- Mocks ---

const mockFsReaddir = vi.fn().mockResolvedValue([]);
const mockFsReadFile = vi.fn();
const mockFsMkdir = vi.fn().mockResolvedValue(undefined);
const mockFsRm = vi.fn().mockResolvedValue(undefined);
const mockFsUnlink = vi.fn().mockResolvedValue(undefined);
const mockFsAccess = vi.fn();
const mockFsExistsSync = vi.fn((_path: string) => true);
const mockFsCopyFile = vi.fn().mockResolvedValue(undefined);

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
    BrowserWindow: Object.assign(vi.fn(), {
      getAllWindows: () => [],
      getFocusedWindow: () => null,
      fromWebContents: () => null,
    }),
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    Tray: vi.fn(),
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    nativeImage: { createFromPath: vi.fn(() => ({ resize: vi.fn() })) },
    shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
    screen: { getAllDisplays: () => [] },
    dialog: {
      showOpenDialog: vi.fn().mockResolvedValue({}),
      showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
      showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
      showErrorBox: vi.fn(),
    },
    systemPreferences: { getMediaAccessStatus: vi.fn(() => 'granted') },
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
  BrowserWindow: Object.assign(vi.fn(), {
    getAllWindows: () => [],
    getFocusedWindow: () => null,
    fromWebContents: () => null,
  }),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  Tray: vi.fn(),
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
  nativeImage: { createFromPath: vi.fn(() => ({ resize: vi.fn() })) },
  shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
  screen: { getAllDisplays: () => [] },
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({}),
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
  },
  systemPreferences: { getMediaAccessStatus: vi.fn(() => 'granted') },
  globalShortcut: { register: vi.fn(), unregister: vi.fn(), isRegistered: vi.fn() },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (p: string) => mockFsExistsSync(p),
    readFileSync: vi.fn(),
    promises: {
      readdir: (...args: unknown[]) => mockFsReaddir(...args),
      readFile: (...args: unknown[]) => mockFsReadFile(...args),
      mkdir: (...args: unknown[]) => mockFsMkdir(...args),
      rm: (...args: unknown[]) => mockFsRm(...args),
      unlink: (...args: unknown[]) => mockFsUnlink(...args),
      access: (...args: unknown[]) => mockFsAccess(...args),
      copyFile: (...args: unknown[]) => mockFsCopyFile(...args),
    },
  },
  existsSync: (p: string) => mockFsExistsSync(p),
  readFileSync: vi.fn(),
  promises: {
    readdir: (...args: unknown[]) => mockFsReaddir(...args),
    readFile: (...args: unknown[]) => mockFsReadFile(...args),
    mkdir: (...args: unknown[]) => mockFsMkdir(...args),
    rm: (...args: unknown[]) => mockFsRm(...args),
    unlink: (...args: unknown[]) => mockFsUnlink(...args),
    access: (...args: unknown[]) => mockFsAccess(...args),
    copyFile: (...args: unknown[]) => mockFsCopyFile(...args),
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
    getLogDirectory: () => '/tmp/logs',
  },
  setGlobalLogLevel: vi.fn(),
}));

const mockWriteJson = vi.fn().mockResolvedValue(undefined);
vi.mock('@/utils/atomicFileWriter.js', () => ({
  default: {
    writeJson: (...args: unknown[]) => mockWriteJson(...args),
    readJson: vi.fn().mockResolvedValue(null),
    readFile: vi.fn().mockResolvedValue(null),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/main/modules/window/windowManager.js', () => ({
  default: {
    sendToWindow: vi.fn(),
    getMainWindow: vi.fn(() => null),
  },
}));

vi.mock('@/main/modules/tray/trayManager.js', () => ({
  default: { updateTray: vi.fn() },
}));

vi.mock('@/main/modules/app/lifecycle.js', () => ({
  default: {
    getGitSyncService: () => null,
    getWorkspaceSyncScheduler: () => null,
    getWorkspaceSettingsService: () => null,
    getFileWatchers: () => new Map(),
  },
}));

vi.mock('@/services/websocket/ws-service.js', () => ({
  default: {
    broadcastVideoRecordingState: vi.fn(),
    broadcastRecordingHotkeyChange: vi.fn(),
    getConnectionStatus: vi.fn(() => null),
    onWorkspaceSwitch: vi.fn(),
  },
}));

vi.mock('@/services/proxy/ProxyService.js', () => ({
  default: {
    getStatus: vi.fn().mockResolvedValue(null),
    isRunning: false,
    port: null,
  },
}));

vi.mock('@/services/network/NetworkService.js', () => ({
  default: { getState: () => ({ isOnline: true }) },
}));

vi.mock('@/services/core/ServiceRegistry.js', () => ({
  default: { getStatus: () => ({}) },
}));

vi.mock('@/services/websocket/utils/recordingPreprocessor.js', () => ({
  preprocessRecordingForSave: vi.fn().mockImplementation((data: unknown) => Promise.resolve(data)),
}));

vi.mock('auto-launch', () => {
  class MockAutoLaunch {
    enable = vi.fn().mockResolvedValue(undefined);
    disable = vi.fn().mockResolvedValue(undefined);
  }
  return { default: MockAutoLaunch };
});

import { RecordingHandlers } from '@/main/modules/ipc/handlers/recordingHandlers';
import windowManager from '@/main/modules/window/windowManager';

const mockEvent = { sender: { send: vi.fn() } } as unknown as IpcInvokeEvent;

function makeRecordingMetaFile(overrides: Partial<WorkflowRecordingFileMetadata> = {}): WorkflowRecordingFileMetadata {
  return {
    id: 'rec-a1b2c3d4e5f6-20260120T144512',
    timestamp: 1737376512345,
    url: 'https://dashboard.openheaders.io/settings/team',
    duration: 45200,
    eventCount: 1247,
    size: 2_500_000,
    source: 'extension',
    hasVideo: false,
    hasProcessedVersion: true,
    tag: 'regression-test',
    description: 'Team settings flow — verifying OAuth2 header injection works end-to-end',
    ...overrides,
  };
}

describe('RecordingHandlers', () => {
  let handlers: RecordingHandlers;

  beforeEach(() => {
    handlers = new RecordingHandlers();
    vi.clearAllMocks();
  });

  describe('handleLoadRecordings', () => {
    it('returns empty array when no recordings exist', async () => {
      mockFsReaddir.mockResolvedValueOnce([]);

      const result = await handlers.handleLoadRecordings();
      expect(result).toEqual([]);
      expect(mockFsMkdir).toHaveBeenCalledWith(expect.stringContaining('recordings'), { recursive: true });
    });

    it('loads and sorts recordings by timestamp (newest first)', async () => {
      const meta1 = makeRecordingMetaFile({
        id: 'rec-older',
        timestamp: 1737300000000,
      });
      const meta2 = makeRecordingMetaFile({
        id: 'rec-newer',
        timestamp: 1737400000000,
      });

      mockFsReaddir.mockResolvedValueOnce(['rec-older.meta.json', 'rec-newer.meta.json']);
      mockFsReadFile.mockResolvedValueOnce(JSON.stringify(meta1)).mockResolvedValueOnce(JSON.stringify(meta2));
      // Video/processed access checks
      mockFsAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await handlers.handleLoadRecordings();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('rec-newer');
      expect(result[1].id).toBe('rec-older');
    });

    it('skips non-meta files', async () => {
      mockFsReaddir.mockResolvedValueOnce(['rec-1.meta.json', 'rec-1', 'other-file.json', 'readme.txt']);
      const meta = makeRecordingMetaFile({ id: 'rec-1' });
      mockFsReadFile.mockResolvedValueOnce(JSON.stringify(meta));
      mockFsAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await handlers.handleLoadRecordings();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('rec-1');
    });

    it('detects hasVideo when video files exist', async () => {
      const meta = makeRecordingMetaFile({ hasVideo: undefined });
      mockFsReaddir.mockResolvedValueOnce([`${meta.id}.meta.json`]);
      mockFsReadFile.mockResolvedValueOnce(JSON.stringify(meta));
      // video.webm and video-metadata.json both exist
      mockFsAccess.mockResolvedValue(undefined);

      const result = await handlers.handleLoadRecordings();
      expect(result[0].hasVideo).toBe(true);
    });

    it('sets hasVideo false when video files do not exist', async () => {
      const meta = makeRecordingMetaFile({ hasVideo: undefined });
      mockFsReaddir.mockResolvedValueOnce([`${meta.id}.meta.json`]);
      mockFsReadFile.mockResolvedValueOnce(JSON.stringify(meta));
      mockFsAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await handlers.handleLoadRecordings();
      expect(result[0].hasVideo).toBe(false);
    });

    it('continues loading when one meta file is corrupted', async () => {
      const goodMeta = makeRecordingMetaFile({ id: 'good-rec' });
      mockFsReaddir.mockResolvedValueOnce(['bad.meta.json', 'good-rec.meta.json']);
      mockFsReadFile.mockResolvedValueOnce('not-valid-json{{{').mockResolvedValueOnce(JSON.stringify(goodMeta));
      mockFsAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await handlers.handleLoadRecordings();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('good-rec');
    });
  });

  describe('handleLoadRecording', () => {
    it('loads and parses processed recording file', async () => {
      const recordData = {
        record: {
          metadata: { recordId: 'rec-a1b2c3d4', url: 'https://dashboard.openheaders.io' },
          events: [{ type: 2, timestamp: 1737376512345 }],
        },
      };
      mockFsReadFile.mockResolvedValueOnce(JSON.stringify(recordData));

      const result = await handlers.handleLoadRecording(mockEvent, 'rec-a1b2c3d4');
      expect(result).toEqual(recordData);
    });

    it('throws when recording file does not exist', async () => {
      mockFsReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file'));

      await expect(handlers.handleLoadRecording(mockEvent, 'nonexistent-id')).rejects.toThrow('ENOENT');
    });
  });

  describe('handleSaveRecording', () => {
    it('saves recording with all metadata fields', async () => {
      const recordData = {
        record: {
          metadata: {
            recordId: 'rec-enterprise-test-a1b2c3d4',
            timestamp: 1737376512345,
            url: 'https://dashboard.openheaders.io/settings/team',
            duration: 45200,
          } as RecordingMetadata,
          events: [{ type: 2 }, { type: 3 }, { type: 4 }],
        },
        source: 'extension',
        tag: 'regression-test',
        description: 'Team settings flow — OAuth2 header injection',
      };

      const result = await handlers.handleSaveRecording(mockEvent, recordData);

      expect(result.success).toBe(true);
      expect(result.recordId).toBe('rec-enterprise-test-a1b2c3d4');
      expect(result.metadata).toBeDefined();
      expect(result.metadata.id).toBe('rec-enterprise-test-a1b2c3d4');
      expect(result.metadata.timestamp).toBe(1737376512345);
      expect(result.metadata.url).toBe('https://dashboard.openheaders.io/settings/team');
      expect(result.metadata.duration).toBe(45200);
      expect(result.metadata.eventCount).toBe(3);
      expect(result.metadata.source).toBe('extension');
      expect(result.metadata.hasVideo).toBe(false);
      expect(result.metadata.tag).toBe('regression-test');
      expect(result.metadata.description).toBe('Team settings flow — OAuth2 header injection');
      expect(result.metadata.size).toBeGreaterThan(0);
    });

    it('generates fallback recordId when not provided', async () => {
      const recordData = {
        record: {
          metadata: {} as RecordingMetadata,
          events: [],
        },
      };

      const result = await handlers.handleSaveRecording(mockEvent, recordData);

      expect(result.success).toBe(true);
      expect(result.recordId).toMatch(/^record-\d+-[a-z0-9]+$/);
    });

    it('defaults missing metadata fields', async () => {
      const recordData = {
        record: {
          metadata: {} as RecordingMetadata,
        },
      };

      const result = await handlers.handleSaveRecording(mockEvent, recordData);

      expect(result.metadata.url).toBe('Unknown');
      expect(result.metadata.duration).toBe(0);
      expect(result.metadata.eventCount).toBe(0);
      expect(result.metadata.source).toBe('extension');
      expect(result.metadata.tag).toBeNull();
      expect(result.metadata.description).toBeNull();
    });

    it('uses initialUrl as fallback when url is missing', async () => {
      const recordData = {
        record: {
          metadata: { initialUrl: 'https://auth.openheaders.io/login' } as RecordingMetadata,
          events: [],
        },
      };

      const result = await handlers.handleSaveRecording(mockEvent, recordData);
      expect(result.metadata.url).toBe('https://auth.openheaders.io/login');
    });

    it('notifies renderer about new recording', async () => {
      const recordData = {
        record: {
          metadata: { recordId: 'notify-test' } as RecordingMetadata,
          events: [],
        },
      };

      await handlers.handleSaveRecording(mockEvent, recordData);

      expect(windowManager.sendToWindow).toHaveBeenCalledWith(
        'recording-received',
        expect.objectContaining({ id: 'notify-test' }),
      );
    });
  });

  describe('handleDeleteRecording', () => {
    it('deletes recording directory and metadata file', async () => {
      await handlers.handleDeleteRecording(mockEvent, 'rec-to-delete-a1b2c3d4');

      expect(mockFsRm).toHaveBeenCalledWith(expect.stringContaining('rec-to-delete-a1b2c3d4'), {
        recursive: true,
        force: true,
      });
    });

    it('returns success result', async () => {
      const result = await handlers.handleDeleteRecording(mockEvent, 'rec-a1b2c3d4');
      expect(result).toEqual({ success: true });
    });
  });

  describe('handleUpdateRecordingMetadata', () => {
    it('merges updates into existing metadata', async () => {
      const existingMeta = makeRecordingMetaFile();
      mockFsReadFile.mockResolvedValueOnce(JSON.stringify(existingMeta));

      const result = await handlers.handleUpdateRecordingMetadata(mockEvent, {
        recordId: existingMeta.id,
        updates: { tag: 'smoke-test', description: 'Updated description — smoke test pass' },
      });

      expect(result.success).toBe(true);
      expect(result.metadata.tag).toBe('smoke-test');
      expect(result.metadata.description).toBe('Updated description — smoke test pass');
      expect(result.metadata.id).toBe(existingMeta.id);
      expect(result.metadata.lastModified).toBeTypeOf('number');
    });

    it('throws when metadata file does not exist', async () => {
      mockFsExistsSync.mockReturnValueOnce(false);

      await expect(
        handlers.handleUpdateRecordingMetadata(mockEvent, {
          recordId: 'nonexistent',
          updates: { tag: 'test' },
        }),
      ).rejects.toThrow('not found');
    });

    it('notifies renderer about metadata update', async () => {
      const existingMeta = makeRecordingMetaFile();
      mockFsReadFile.mockResolvedValueOnce(JSON.stringify(existingMeta));

      await handlers.handleUpdateRecordingMetadata(mockEvent, {
        recordId: existingMeta.id,
        updates: { tag: 'updated' },
      });

      expect(windowManager.sendToWindow).toHaveBeenCalledWith(
        'recording-metadata-updated',
        expect.objectContaining({
          recordId: existingMeta.id,
          metadata: expect.objectContaining({ tag: 'updated' }),
        }),
      );
    });
  });

  describe('handleDownloadRecording', () => {
    it('returns canceled when user cancels save dialog', async () => {
      const result = await handlers.handleDownloadRecording(mockEvent, { id: 'rec-a1b2c3d4' });
      expect(result).toEqual({ success: false, canceled: true });
    });

    it('throws when recording file does not exist', async () => {
      mockFsExistsSync.mockReturnValueOnce(false);

      await expect(handlers.handleDownloadRecording(mockEvent, { id: 'nonexistent' })).rejects.toThrow('not found');
    });
  });
});
