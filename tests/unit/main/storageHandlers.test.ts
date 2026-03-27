import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IpcInvokeEvent } from '../../../src/types/common';

// --- Mocks ---

const mockFsAccess = vi.fn();
const mockFsUnlink = vi.fn().mockResolvedValue(undefined);
const mockFsRm = vi.fn().mockResolvedValue(undefined);

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
        BrowserWindow: Object.assign(vi.fn(), {
            getAllWindows: () => [],
            getFocusedWindow: () => null
        }),
        ipcMain: { handle: vi.fn(), on: vi.fn() },
        Tray: vi.fn(),
        Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
        nativeImage: { createFromPath: vi.fn(() => ({ resize: vi.fn() })) },
        shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
        screen: { getAllDisplays: () => [] },
        dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
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
    BrowserWindow: Object.assign(vi.fn(), {
        getAllWindows: () => [],
        getFocusedWindow: () => null
    }),
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    Tray: vi.fn(),
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    nativeImage: { createFromPath: vi.fn(() => ({ resize: vi.fn() })) },
    shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
    screen: { getAllDisplays: () => [] },
    dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
    systemPreferences: { getMediaAccessStatus: vi.fn() },
    globalShortcut: { register: vi.fn(), unregister: vi.fn(), isRegistered: vi.fn() }
}));

vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn(() => false),
        readFileSync: vi.fn(),
        promises: {
            access: (...args: unknown[]) => mockFsAccess(...args),
            unlink: (...args: unknown[]) => mockFsUnlink(...args),
            rm: (...args: unknown[]) => mockFsRm(...args),
            readFile: vi.fn().mockResolvedValue(''),
            writeFile: vi.fn().mockResolvedValue(undefined),
            mkdir: vi.fn().mockResolvedValue(undefined)
        }
    },
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    promises: {
        access: (...args: unknown[]) => mockFsAccess(...args),
        unlink: (...args: unknown[]) => mockFsUnlink(...args),
        rm: (...args: unknown[]) => mockFsRm(...args),
        readFile: vi.fn().mockResolvedValue(''),
        writeFile: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined)
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

const mockAtomicWriteJson = vi.fn().mockResolvedValue(undefined);
const mockAtomicWriteFile = vi.fn().mockResolvedValue(undefined);
const mockAtomicReadFile = vi.fn().mockResolvedValue(null);
vi.mock('../../../src/utils/atomicFileWriter.js', () => ({
    default: {
        writeJson: (...args: unknown[]) => mockAtomicWriteJson(...args),
        readJson: vi.fn().mockResolvedValue(null),
        readFile: (...args: unknown[]) => mockAtomicReadFile(...args),
        writeFile: (...args: unknown[]) => mockAtomicWriteFile(...args)
    }
}));

vi.mock('../../../src/main/modules/tray/trayManager.js', () => ({
    default: { updateTray: vi.fn() }
}));

vi.mock('../../../src/services/websocket/ws-service.js', () => ({
    default: {
        broadcastVideoRecordingState: vi.fn(),
        broadcastRecordingHotkeyChange: vi.fn()
    }
}));

vi.mock('auto-launch', () => {
    class MockAutoLaunch {
        enable = vi.fn().mockResolvedValue(undefined);
        disable = vi.fn().mockResolvedValue(undefined);
    }
    return { default: MockAutoLaunch };
});

import { StorageHandlers } from '../../../src/main/modules/ipc/handlers/storageHandlers';

const mockEvent = {} as IpcInvokeEvent;

describe('StorageHandlers', () => {
    let handlers: StorageHandlers;

    beforeEach(() => {
        handlers = new StorageHandlers();
        vi.clearAllMocks();
    });

    describe('handleSaveToStorage', () => {
        it('saves valid JSON file atomically with writeJson', async () => {
            const content = JSON.stringify({
                sources: [{
                    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                    name: 'Production API Gateway Token',
                    type: 'http'
                }]
            });

            await handlers.handleSaveToStorage(mockEvent, 'sources.json', content);

            expect(mockAtomicWriteJson).toHaveBeenCalledWith(
                expect.stringContaining('sources.json'),
                expect.objectContaining({ sources: expect.any(Array) }),
                { pretty: true }
            );
        });

        it('saves non-JSON file atomically with writeFile', async () => {
            const content = 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.signature';

            await handlers.handleSaveToStorage(mockEvent, 'token.txt', content);

            expect(mockAtomicWriteFile).toHaveBeenCalledWith(
                expect.stringContaining('token.txt'),
                content
            );
        });

        it('falls back to writeFile for invalid JSON in .json file', async () => {
            const invalidJson = '{not valid json at all';

            await handlers.handleSaveToStorage(mockEvent, 'corrupt.json', invalidJson);

            expect(mockAtomicWriteFile).toHaveBeenCalledWith(
                expect.stringContaining('corrupt.json'),
                invalidJson
            );
        });

        it('uses correct path under userData directory', async () => {
            await handlers.handleSaveToStorage(mockEvent, 'workspaces/ws-1/rules.json', '[]');

            const calledPath = mockAtomicWriteJson.mock.calls[0]?.[0] ?? mockAtomicWriteFile.mock.calls[0]?.[0];
            expect(calledPath).toContain('/tmp/open-headers-test/userData');
            expect(calledPath).toContain('workspaces/ws-1/rules.json');
        });

        it('throws on write error', async () => {
            mockAtomicWriteFile.mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));

            await expect(
                handlers.handleSaveToStorage(mockEvent, 'data.txt', 'content')
            ).rejects.toThrow('ENOSPC');
        });
    });

    describe('handleLoadFromStorage', () => {
        it('returns file content when file exists', async () => {
            const content = JSON.stringify({
                id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                name: 'OpenHeaders — Production Configuration'
            });
            mockAtomicReadFile.mockResolvedValueOnce(content);

            const result = await handlers.handleLoadFromStorage(mockEvent, 'workspace.json');
            expect(result).toBe(content);
        });

        it('returns null when file does not exist', async () => {
            mockAtomicReadFile.mockResolvedValueOnce(null);

            const result = await handlers.handleLoadFromStorage(mockEvent, 'nonexistent.json');
            expect(result).toBeNull();
        });

        it('returns null for corrupted JSON files', async () => {
            mockAtomicReadFile.mockResolvedValueOnce('{invalid json}}}}');

            const result = await handlers.handleLoadFromStorage(mockEvent, 'corrupted.json');
            expect(result).toBeNull();
        });

        it('returns content for valid JSON files', async () => {
            const validJson = '{"key": "value"}';
            mockAtomicReadFile.mockResolvedValueOnce(validJson);

            const result = await handlers.handleLoadFromStorage(mockEvent, 'valid.json');
            expect(result).toBe(validJson);
        });

        it('returns content for non-JSON files without validation', async () => {
            const textContent = 'this is not json but its a .txt file';
            mockAtomicReadFile.mockResolvedValueOnce(textContent);

            const result = await handlers.handleLoadFromStorage(mockEvent, 'notes.txt');
            expect(result).toBe(textContent);
        });

        it('returns null on ENOENT error', async () => {
            const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
            enoent.code = 'ENOENT';
            mockAtomicReadFile.mockRejectedValueOnce(enoent);

            const result = await handlers.handleLoadFromStorage(mockEvent, 'missing.json');
            expect(result).toBeNull();
        });

        it('throws on non-ENOENT errors', async () => {
            const permError = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            permError.code = 'EACCES';
            mockAtomicReadFile.mockRejectedValueOnce(permError);

            await expect(
                handlers.handleLoadFromStorage(mockEvent, 'protected.json')
            ).rejects.toThrow('EACCES');
        });
    });

    describe('handleDeleteFromStorage', () => {
        it('deletes existing file and returns true', async () => {
            mockFsAccess.mockResolvedValueOnce(undefined);

            const result = await handlers.handleDeleteFromStorage(mockEvent, 'old-data.json');
            expect(result).toBe(true);
            expect(mockFsUnlink).toHaveBeenCalledWith(
                expect.stringContaining('old-data.json')
            );
        });

        it('returns true when file does not exist (ENOENT)', async () => {
            const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
            enoent.code = 'ENOENT';
            mockFsAccess.mockRejectedValueOnce(enoent);

            const result = await handlers.handleDeleteFromStorage(mockEvent, 'already-deleted.json');
            expect(result).toBe(true);
        });

        it('throws on non-ENOENT errors', async () => {
            const permError = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
            permError.code = 'EACCES';
            mockFsAccess.mockRejectedValueOnce(permError);

            await expect(
                handlers.handleDeleteFromStorage(mockEvent, 'protected.json')
            ).rejects.toThrow('EACCES');
        });
    });

    describe('handleDeleteDirectory', () => {
        it('deletes existing directory recursively', async () => {
            mockFsAccess.mockResolvedValueOnce(undefined);

            const result = await handlers.handleDeleteDirectory(
                mockEvent,
                'workspaces/a1b2c3d4-e5f6-7890-abcd-ef1234567890'
            );
            expect(result).toBe(true);
            expect(mockFsRm).toHaveBeenCalledWith(
                expect.stringContaining('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
                { recursive: true, force: true }
            );
        });

        it('returns true when directory does not exist (ENOENT)', async () => {
            const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
            enoent.code = 'ENOENT';
            mockFsAccess.mockRejectedValueOnce(enoent);

            const result = await handlers.handleDeleteDirectory(mockEvent, 'nonexistent-dir');
            expect(result).toBe(true);
        });

        it('throws on non-ENOENT errors', async () => {
            const permError = new Error('EACCES') as NodeJS.ErrnoException;
            permError.code = 'EACCES';
            mockFsAccess.mockRejectedValueOnce(permError);

            await expect(
                handlers.handleDeleteDirectory(mockEvent, 'protected-dir')
            ).rejects.toThrow('EACCES');
        });

        it('uses correct path under userData directory', async () => {
            mockFsAccess.mockResolvedValueOnce(undefined);

            await handlers.handleDeleteDirectory(mockEvent, 'recordings/rec-a1b2c3d4');

            expect(mockFsRm).toHaveBeenCalledWith(
                '/tmp/open-headers-test/userData/recordings/rec-a1b2c3d4',
                { recursive: true, force: true }
            );
        });
    });
});
