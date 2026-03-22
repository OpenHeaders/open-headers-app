import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IpcInvokeEvent } from '../../../src/types/common';

// --- Mocks ---

const mockFsReadFile = vi.fn();
const mockFsWriteFile = vi.fn().mockResolvedValue(undefined);
const mockDialogShowOpenDialog = vi.fn().mockResolvedValue({ canceled: true, filePaths: [] });
const mockDialogShowSaveDialog = vi.fn().mockResolvedValue({ canceled: true });
const mockFsExistsSync = vi.fn(() => false);

vi.mock('electron', () => ({
    default: {
        app: {
            getPath: (name: string) => `/tmp/open-headers-test/${name}`,
            getName: () => 'OpenHeaders',
            getVersion: () => '3.2.1-test',
            isPackaged: false,
            on: vi.fn(),
            setAsDefaultProtocolClient: vi.fn(),
            dock: { show: vi.fn().mockResolvedValue(undefined) }
        },
        dialog: {
            showOpenDialog: (...args: unknown[]) => mockDialogShowOpenDialog(...args),
            showSaveDialog: (...args: unknown[]) => mockDialogShowSaveDialog(...args)
        },
        BrowserWindow: Object.assign(vi.fn(), {
            getAllWindows: () => [],
            getFocusedWindow: () => null,
            fromWebContents: () => null
        }),
        ipcMain: { handle: vi.fn(), on: vi.fn() },
        Tray: vi.fn(),
        Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
        nativeImage: { createFromPath: vi.fn(() => ({ resize: vi.fn() })) },
        shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
        screen: { getAllDisplays: () => [] },
        systemPreferences: { getMediaAccessStatus: vi.fn() },
        globalShortcut: { register: vi.fn(), unregister: vi.fn(), isRegistered: vi.fn() }
    },
    app: {
        getPath: (name: string) => `/tmp/open-headers-test/${name}`,
        getName: () => 'OpenHeaders',
        getVersion: () => '3.2.1-test',
        on: vi.fn(),
        setAsDefaultProtocolClient: vi.fn(),
        dock: { show: vi.fn().mockResolvedValue(undefined) }
    },
    dialog: {
        showOpenDialog: (...args: unknown[]) => mockDialogShowOpenDialog(...args),
        showSaveDialog: (...args: unknown[]) => mockDialogShowSaveDialog(...args)
    },
    BrowserWindow: Object.assign(vi.fn(), {
        getAllWindows: () => [],
        getFocusedWindow: () => null,
        fromWebContents: () => null
    }),
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    Tray: vi.fn(),
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    nativeImage: { createFromPath: vi.fn(() => ({ resize: vi.fn() })) },
    shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
    screen: { getAllDisplays: () => [] },
    systemPreferences: { getMediaAccessStatus: vi.fn() },
    globalShortcut: { register: vi.fn(), unregister: vi.fn(), isRegistered: vi.fn() }
}));

vi.mock('fs', () => ({
    default: {
        existsSync: (...args: unknown[]) => mockFsExistsSync(...args),
        readFileSync: vi.fn(),
        promises: {
            readFile: (...args: unknown[]) => mockFsReadFile(...args),
            writeFile: (...args: unknown[]) => mockFsWriteFile(...args),
            access: vi.fn().mockResolvedValue(undefined),
            mkdir: vi.fn().mockResolvedValue(undefined),
            rm: vi.fn().mockResolvedValue(undefined),
            unlink: vi.fn().mockResolvedValue(undefined)
        }
    },
    existsSync: (...args: unknown[]) => mockFsExistsSync(...args),
    readFileSync: vi.fn(),
    promises: {
        readFile: (...args: unknown[]) => mockFsReadFile(...args),
        writeFile: (...args: unknown[]) => mockFsWriteFile(...args),
        access: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        rm: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockResolvedValue(undefined)
    }
}));

vi.mock('../../../src/utils/mainLogger.js', () => ({
    default: {
        createLogger: () => ({
            info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()
        }),
        getLogDirectory: () => '/tmp/logs'
    },
    setGlobalLogLevel: vi.fn()
}));

const mockAtomicWriteFile = vi.fn().mockResolvedValue(undefined);
const mockAtomicWriteJson = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/utils/atomicFileWriter.js', () => ({
    default: {
        writeJson: (...args: unknown[]) => mockAtomicWriteJson(...args),
        readJson: vi.fn().mockResolvedValue(null),
        readFile: vi.fn().mockResolvedValue(null),
        writeFile: (...args: unknown[]) => mockAtomicWriteFile(...args)
    }
}));

vi.mock('../../../src/main/modules/window/windowManager.js', () => ({
    default: {
        getMainWindow: vi.fn(() => ({})),
        sendToWindow: vi.fn()
    }
}));

vi.mock('../../../src/main/modules/tray/trayManager.js', () => ({
    default: { updateTray: vi.fn() }
}));

const mockFileWatchers = new Map();
vi.mock('../../../src/main/modules/app/lifecycle.js', () => ({
    default: {
        getGitSyncService: () => null,
        getWorkspaceSyncScheduler: () => null,
        getWorkspaceSettingsService: () => null,
        getFileWatchers: () => mockFileWatchers
    }
}));

vi.mock('../../../src/services/websocket/ws-service.js', () => ({
    default: {
        broadcastVideoRecordingState: vi.fn(),
        broadcastRecordingHotkeyChange: vi.fn()
    }
}));

vi.mock('chokidar', () => ({
    default: {
        watch: vi.fn(() => ({
            on: vi.fn().mockReturnThis(),
            close: vi.fn()
        }))
    }
}));

vi.mock('auto-launch', () => {
    class MockAutoLaunch {
        enable = vi.fn().mockResolvedValue(undefined);
        disable = vi.fn().mockResolvedValue(undefined);
    }
    return { default: MockAutoLaunch };
});

import { FileHandlers } from '../../../src/main/modules/ipc/handlers/fileHandlers';

const mockEvent = {} as IpcInvokeEvent;

describe('FileHandlers', () => {
    let handlers: FileHandlers;

    beforeEach(() => {
        handlers = new FileHandlers();
        vi.clearAllMocks();
        mockFileWatchers.clear();
    });

    describe('handleReadFile', () => {
        it('reads file with utf8 encoding by default', async () => {
            const content = '{"sources": [{"id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}]}';
            mockFsReadFile.mockResolvedValueOnce(content);

            const result = await handlers.handleReadFile(
                mockEvent,
                '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json'
            );
            expect(result).toBe(content);
            expect(mockFsReadFile).toHaveBeenCalledWith(
                '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json',
                'utf8'
            );
        });

        it('reads file with specified encoding', async () => {
            mockFsReadFile.mockResolvedValueOnce('latin1-content');

            await handlers.handleReadFile(mockEvent, '/path/to/file.txt', 'latin1');
            expect(mockFsReadFile).toHaveBeenCalledWith('/path/to/file.txt', 'latin1');
        });

        it('reads binary file when encoding is null', async () => {
            const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
            mockFsReadFile.mockResolvedValueOnce(buffer);

            const result = await handlers.handleReadFile(mockEvent, '/path/to/image.png', null);
            expect(result).toEqual(buffer);
            expect(mockFsReadFile).toHaveBeenCalledWith('/path/to/image.png');
        });

        it('reads binary file when encoding is "buffer"', async () => {
            const buffer = Buffer.from([0xFF, 0xD8, 0xFF]);
            mockFsReadFile.mockResolvedValueOnce(buffer);

            const result = await handlers.handleReadFile(mockEvent, '/path/to/photo.jpg', 'buffer');
            expect(result).toEqual(buffer);
        });

        it('throws on file not found', async () => {
            mockFsReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

            await expect(
                handlers.handleReadFile(mockEvent, '/nonexistent/path/file.txt')
            ).rejects.toThrow('ENOENT');
        });

        it('throws on permission denied', async () => {
            mockFsReadFile.mockRejectedValueOnce(new Error('EACCES: permission denied'));

            await expect(
                handlers.handleReadFile(mockEvent, '/protected/file.txt')
            ).rejects.toThrow('EACCES');
        });
    });

    describe('handleWriteFile', () => {
        it('writes JSON file atomically', async () => {
            const content = '{"name": "OpenHeaders — Staging Environment"}';

            await handlers.handleWriteFile(
                mockEvent,
                '/Users/jane.doe/Documents/OpenHeaders/config.json',
                content
            );

            expect(mockAtomicWriteJson).toHaveBeenCalledWith(
                '/Users/jane.doe/Documents/OpenHeaders/config.json',
                { name: 'OpenHeaders — Staging Environment' },
                { pretty: true }
            );
        });

        it('writes non-JSON text file atomically', async () => {
            const content = 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.signature';

            await handlers.handleWriteFile(mockEvent, '/path/to/token.txt', content);

            expect(mockAtomicWriteFile).toHaveBeenCalledWith('/path/to/token.txt', content);
        });

        it('writes JSON file with invalid JSON content as plain text', async () => {
            const content = 'not valid json {{{}}}';

            await handlers.handleWriteFile(mockEvent, '/path/to/data.json', content);

            // JSON.parse fails, so it falls back to writeFile
            expect(mockAtomicWriteFile).toHaveBeenCalledWith('/path/to/data.json', content);
        });

        it('writes binary Buffer content directly', async () => {
            const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);

            await handlers.handleWriteFile(mockEvent, '/path/to/binary.dat', buffer as unknown as string);

            expect(mockFsWriteFile).toHaveBeenCalledWith('/path/to/binary.dat', buffer);
        });
    });

    describe('handleOpenFileDialog', () => {
        it('returns null when dialog is canceled', async () => {
            mockDialogShowOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });

            const result = await handlers.handleOpenFileDialog();
            expect(result).toBeNull();
        });

        it('returns selected file path', async () => {
            mockDialogShowOpenDialog.mockResolvedValueOnce({
                canceled: false,
                filePaths: ['/Users/jane.doe/Documents/OpenHeaders/tokens/production.json']
            });

            const result = await handlers.handleOpenFileDialog();
            expect(result).toBe('/Users/jane.doe/Documents/OpenHeaders/tokens/production.json');
        });
    });

    describe('handleSaveFileDialog', () => {
        it('returns null when dialog is canceled', async () => {
            mockDialogShowSaveDialog.mockResolvedValueOnce({ canceled: true });

            const result = await handlers.handleSaveFileDialog(mockEvent);
            expect(result).toBeNull();
        });

        it('returns selected save path', async () => {
            mockDialogShowSaveDialog.mockResolvedValueOnce({
                canceled: false,
                filePath: '/Users/jane.doe/Documents/export-2026-01-20.json'
            });

            const result = await handlers.handleSaveFileDialog(mockEvent);
            expect(result).toBe('/Users/jane.doe/Documents/export-2026-01-20.json');
        });
    });

    describe('handleWatchFile', () => {
        it('reads file content and sets up watcher', async () => {
            const tokenContent = 'Bearer eyJhbGciOiJSUzI1NiJ9.xxxxx.yyyyy';
            mockFsReadFile.mockResolvedValueOnce(tokenContent);

            const result = await handlers.handleWatchFile(
                mockEvent,
                'src-a1b2c3d4-e5f6-7890',
                '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json'
            );

            expect(result).toBe(tokenContent);
            expect(mockFileWatchers.has('/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json')).toBe(true);
        });

        it('does not create duplicate watchers for the same file', async () => {
            const tokenContent = 'token-content';
            mockFsReadFile.mockResolvedValue(tokenContent);

            // Watch the same file twice
            await handlers.handleWatchFile(mockEvent, 'src-1', '/path/to/file.txt');
            const watcherCount = mockFileWatchers.size;

            await handlers.handleWatchFile(mockEvent, 'src-2', '/path/to/file.txt');

            expect(mockFileWatchers.size).toBe(watcherCount);
        });

        it('throws when file does not exist', async () => {
            mockFsReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file'));

            await expect(
                handlers.handleWatchFile(mockEvent, 'src-1', '/nonexistent/file.txt')
            ).rejects.toThrow('ENOENT');
        });
    });

    describe('handleUnwatchFile', () => {
        it('removes watcher and returns true', async () => {
            const mockWatcher = { close: vi.fn() };
            mockFileWatchers.set('/path/to/watched.txt', mockWatcher);

            const result = await handlers.handleUnwatchFile(mockEvent, '/path/to/watched.txt');

            expect(result).toBe(true);
            expect(mockWatcher.close).toHaveBeenCalled();
            expect(mockFileWatchers.has('/path/to/watched.txt')).toBe(false);
        });

        it('returns false when file is not being watched', async () => {
            const result = await handlers.handleUnwatchFile(mockEvent, '/path/to/unwatched.txt');
            expect(result).toBe(false);
        });
    });

    describe('handleGetEnvVariable', () => {
        it('returns environment variable value when set', () => {
            const originalPath = process.env.PATH;
            const result = handlers.handleGetEnvVariable(mockEvent, 'PATH');
            expect(result).toBe(originalPath);
        });

        it('returns descriptive message for unset variable', () => {
            const result = handlers.handleGetEnvVariable(
                mockEvent,
                'OPENHEADERS_NONEXISTENT_VAR_a1b2c3d4'
            );
            expect(result).toBe("Environment variable 'OPENHEADERS_NONEXISTENT_VAR_a1b2c3d4' is not set");
        });
    });

    describe('handleGetAppPath', () => {
        it('returns userData path', () => {
            const result = handlers.handleGetAppPath();
            expect(result).toBe('/tmp/open-headers-test/userData');
        });
    });

    describe('handleOpenRecordFile', () => {
        it('reads and returns file content as utf8', async () => {
            const recordJson = '{"record": {"metadata": {"recordId": "rec-a1b2c3d4"}}}';
            mockFsReadFile.mockResolvedValueOnce(recordJson);

            const result = await handlers.handleOpenRecordFile(mockEvent, '/path/to/record.json');
            expect(result).toBe(recordJson);
        });

        it('throws when file does not exist', async () => {
            mockFsReadFile.mockRejectedValueOnce(new Error('ENOENT'));

            await expect(
                handlers.handleOpenRecordFile(mockEvent, '/nonexistent/record.json')
            ).rejects.toThrow('ENOENT');
        });
    });

    describe('handleGetResourcePath', () => {
        beforeEach(() => {
            // process.resourcesPath is undefined outside Electron runtime
            (process as Record<string, unknown>).resourcesPath = '/tmp/test-resources';
        });

        it('returns production resource path when it exists', async () => {
            mockFsExistsSync.mockReturnValueOnce(true);

            const result = await handlers.handleGetResourcePath(mockEvent, 'icon.png');
            expect(result).toContain('icon.png');
            expect(result).toContain('resources');
        });

        it('falls back to development path when production path does not exist', async () => {
            mockFsExistsSync
                .mockReturnValueOnce(false)  // production
                .mockReturnValueOnce(true);  // development

            const result = await handlers.handleGetResourcePath(mockEvent, 'icon.png');
            expect(result).toContain('icon.png');
        });

        it('throws when resource is not found anywhere', async () => {
            mockFsExistsSync.mockReturnValue(false);

            await expect(
                handlers.handleGetResourcePath(mockEvent, 'nonexistent-resource.txt')
            ).rejects.toThrow('Resource not found: nonexistent-resource.txt');
        });
    });
});
