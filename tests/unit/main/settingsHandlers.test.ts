import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppSettings } from '../../../src/types/settings';
import type { IpcInvokeEvent } from '../../../src/types/common';

// Mock electron
vi.mock('electron', () => ({
    default: {
        app: {
            getPath: (name: string) => `/tmp/open-headers-test/${name}`,
            getName: () => 'OpenHeaders',
            getVersion: () => '3.2.1-test',
            getPath2: () => '/tmp',
            isPackaged: false
        },
        shell: {
            openExternal: vi.fn().mockResolvedValue(undefined)
        },
        ipcMain: { handle: vi.fn(), on: vi.fn() },
        BrowserWindow: Object.assign(vi.fn(), {
            getAllWindows: () => [],
            getFocusedWindow: () => null
        }),
        Tray: vi.fn(),
        Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
        nativeImage: { createFromPath: vi.fn(() => ({ resize: vi.fn() })) },
        screen: { getAllDisplays: () => [] },
        dialog: {
            showOpenDialog: vi.fn().mockResolvedValue({}),
            showSaveDialog: vi.fn().mockResolvedValue({})
        },
        systemPreferences: { getMediaAccessStatus: vi.fn(() => 'granted') },
        globalShortcut: { register: vi.fn(), unregister: vi.fn(), isRegistered: vi.fn() }
    },
    app: {
        getPath: (name: string) => `/tmp/open-headers-test/${name}`,
        getName: () => 'OpenHeaders',
        getVersion: () => '3.2.1-test'
    },
    shell: {
        openExternal: vi.fn().mockResolvedValue(undefined)
    },
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    BrowserWindow: Object.assign(vi.fn(), {
        getAllWindows: () => [],
        getFocusedWindow: () => null
    }),
    Tray: vi.fn(),
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    nativeImage: { createFromPath: vi.fn(() => ({ resize: vi.fn() })) },
    screen: { getAllDisplays: () => [] },
    dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({}),
        showSaveDialog: vi.fn().mockResolvedValue({})
    },
    systemPreferences: { getMediaAccessStatus: vi.fn(() => 'granted') },
    globalShortcut: { register: vi.fn(), unregister: vi.fn(), isRegistered: vi.fn() }
}));

// Mock mainLogger
vi.mock('../../../src/utils/mainLogger.js', () => ({
    default: {
        createLogger: () => ({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn()
        }),
        getLogDirectory: () => '/tmp/logs'
    },
    setGlobalLogLevel: vi.fn()
}));

// Mock atomicFileWriter
const mockWriteJson = vi.fn().mockResolvedValue(undefined);
const mockReadJson = vi.fn().mockResolvedValue(null);
vi.mock('../../../src/utils/atomicFileWriter.js', () => ({
    default: {
        writeJson: (...args: unknown[]) => mockWriteJson(...args),
        readJson: (...args: unknown[]) => mockReadJson(...args),
        readFile: vi.fn().mockResolvedValue(null),
        writeFile: vi.fn().mockResolvedValue(undefined)
    }
}));

// Mock trayManager
vi.mock('../../../src/main/modules/tray/trayManager.js', () => ({
    default: { updateTray: vi.fn() }
}));

// Mock webSocketService
vi.mock('../../../src/services/websocket/ws-service.js', () => ({
    default: {
        broadcastVideoRecordingState: vi.fn(),
        broadcastRecordingHotkeyChange: vi.fn()
    }
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
        logLevel: 'info'
    };
}

describe('SettingsHandlers', () => {
    let handlers: SettingsHandlers;

    beforeEach(() => {
        handlers = new SettingsHandlers();
        vi.clearAllMocks();
    });

    describe('handleGetSettings', () => {
        it('returns stored settings when settings file exists', async () => {
            const storedSettings: Partial<AppSettings> = {
                launchAtLogin: false,
                hideOnLaunch: false,
                theme: 'dark',
                autoStartProxy: false,
                developerMode: true,
                logLevel: 'debug'
            };
            mockReadJson.mockResolvedValueOnce(storedSettings);

            const result = await handlers.handleGetSettings();
            expect(result).toEqual(storedSettings);
        });

        it('returns full default settings when settings file is missing', async () => {
            mockReadJson.mockResolvedValueOnce(null);

            const result = await handlers.handleGetSettings();

            expect(result).toEqual(makeDefaultSettings());
            expect(mockWriteJson).toHaveBeenCalledWith(
                expect.stringContaining('settings.json'),
                makeDefaultSettings(),
                { pretty: true }
            );
        });

        it('default settings have correct boolean values', async () => {
            mockReadJson.mockResolvedValueOnce(null);

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
        });

        it('default settings have correct non-boolean values', async () => {
            mockReadJson.mockResolvedValueOnce(null);

            const result = await handlers.handleGetSettings();
            const settings = result as AppSettings;

            expect(settings.theme).toBe('auto');
            expect(settings.videoQuality).toBe('high');
            expect(settings.recordingHotkey).toBe('CommandOrControl+Shift+E');
            expect(settings.recordingHotkeyEnabled).toBe(true);
            expect(settings.logLevel).toBe('info');
        });

        it('throws on filesystem error', async () => {
            mockReadJson.mockRejectedValueOnce(new Error('EACCES: permission denied'));

            await expect(handlers.handleGetSettings()).rejects.toThrow('EACCES: permission denied');
        });
    });

    describe('handleSaveSettings', () => {
        it('saves partial settings atomically and returns success', async () => {
            const partialSettings: Partial<AppSettings> = {
                theme: 'dark',
                compactMode: true,
                developerMode: true
            };

            const result = await handlers.handleSaveSettings(mockEvent, partialSettings);

            expect(result).toEqual({ success: true });
            expect(mockWriteJson).toHaveBeenCalledWith(
                expect.stringContaining('settings.json'),
                expect.objectContaining({
                    theme: 'dark',
                    compactMode: true,
                    developerMode: true
                }),
                { pretty: true }
            );
        });

        it('coerces boolean settings to actual booleans', async () => {
            const settings = {
                hideOnLaunch: 1,
                showDockIcon: 0,
                developerMode: ''
            } as unknown as Partial<AppSettings>;

            await handlers.handleSaveSettings(mockEvent, settings);

            const savedData = mockWriteJson.mock.calls[0][1] as Record<string, unknown>;
            expect(savedData.hideOnLaunch).toBe(true);
            expect(savedData.showDockIcon).toBe(false);
            expect(savedData.developerMode).toBe(false);
        });

        it('returns error result on write failure', async () => {
            mockWriteJson.mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));

            const result = await handlers.handleSaveSettings(mockEvent, { theme: 'light' });

            expect(result).toEqual({
                success: false,
                message: 'ENOSPC: no space left on device'
            });
        });

        it('accepts null event for programmatic saves', async () => {
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
                const result = await handlers.handleOpenExternal(mockEvent, 'https://docs.openheaders.io/guide/getting-started');
                expect(result).toEqual({ success: true });
            });

            it('allows github.com', async () => {
                const result = await handlers.handleOpenExternal(mockEvent, 'https://github.com/OpenHeaders/open-headers-app');
                expect(result).toEqual({ success: true });
            });

            it('allows chromewebstore.google.com', async () => {
                const result = await handlers.handleOpenExternal(mockEvent, 'https://chromewebstore.google.com/detail/openheaders/abcdef123456');
                expect(result).toEqual({ success: true });
            });

            it('allows microsoftedge.microsoft.com', async () => {
                const result = await handlers.handleOpenExternal(mockEvent, 'https://microsoftedge.microsoft.com/addons/detail/openheaders/abcdef123456');
                expect(result).toEqual({ success: true });
            });

            it('allows addons.mozilla.org', async () => {
                const result = await handlers.handleOpenExternal(mockEvent, 'https://addons.mozilla.org/en-US/firefox/addon/openheaders/');
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
});
