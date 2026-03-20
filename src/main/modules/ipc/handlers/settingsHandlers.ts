import electron from 'electron';
import path from 'path';
import AutoLaunch from 'auto-launch';
import mainLogger from '../../../../utils/mainLogger';
import atomicWriter from '../../../../utils/atomicFileWriter';
import trayManager from '../../tray/trayManager';
import webSocketService from '../../../../services/websocket/ws-service';
import type { IpcInvokeEvent, OperationResult } from '../../../../types/common';
import { errorMessage } from '../../../../types/common';
import type { AppSettings } from '../../../../types/settings';

const { app, shell } = electron;
const { createLogger } = mainLogger;
const log = createLogger('SettingsHandlers');

class SettingsHandlers {
    async handleSaveSettings(_: IpcInvokeEvent | null, settings: Partial<AppSettings>) {
        try {
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');

            // Ensure ALL boolean settings are properly typed
            type BooleanKey = { [K in keyof AppSettings]-?: NonNullable<AppSettings[K]> extends boolean ? K : never }[keyof AppSettings];
            const booleanSettings: BooleanKey[] = [
                'hideOnLaunch', 'showStatusBarIcon', 'showDockIcon', 'launchAtLogin',
                'tutorialMode', 'autoStartProxy', 'proxyCacheEnabled',
                'autoHighlightTableEntries', 'autoScrollTableEntries',
                'compactMode', 'developerMode',
                'videoRecording', 'pendingVideoRecording'
            ];

            const mutableSettings = { ...settings };
            for (const key of booleanSettings) {
                if (key in mutableSettings) {
                    mutableSettings[key] = Boolean(mutableSettings[key]);
                }
            }

            await atomicWriter.writeJson(settingsPath, mutableSettings, { pretty: true });

            // Broadcast video recording state change to connected extensions
            if ('videoRecording' in mutableSettings) {
                webSocketService.broadcastVideoRecordingState(!!mutableSettings.videoRecording);
            }

            // Apply settings
            trayManager.updateTray(mutableSettings);

            // Apply log level if changed
            if (mutableSettings.logLevel) {
                const { setGlobalLogLevel } = await import('../../../../utils/mainLogger');
                setGlobalLogLevel(mutableSettings.logLevel);
            }

            // Update global recording hotkey if changed
            if (mutableSettings.recordingHotkey || 'recordingHotkeyEnabled' in mutableSettings) {
                const globalShortcuts = (await import('../../shortcuts/globalShortcuts')).default;

                // Update hotkey if it changed
                if (mutableSettings.recordingHotkey) {
                    await globalShortcuts.updateHotkey(mutableSettings.recordingHotkey);
                }

                // Update enabled state if it changed
                if ('recordingHotkeyEnabled' in mutableSettings) {
                    await globalShortcuts.updateHotkeyEnabled(
                        mutableSettings.recordingHotkeyEnabled as boolean,
                        mutableSettings.recordingHotkey || 'CommandOrControl+Shift+E'
                    );
                }

                // Broadcast the hotkey change to all connected extensions
                webSocketService.broadcastRecordingHotkeyChange(
                    mutableSettings.recordingHotkey || 'CommandOrControl+Shift+E',
                    'recordingHotkeyEnabled' in mutableSettings ? !!mutableSettings.recordingHotkeyEnabled : true
                );
            }

            return { success: true };
        } catch (err: unknown) {
            log.error('Error saving settings:', err);
            return { success: false, message: errorMessage(err) };
        }
    }

    async handleGetSettings(): Promise<Partial<AppSettings>> {
        try {
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');

            // Try to read with atomic reader first
            const settings = await atomicWriter.readJson(settingsPath);

            if (settings !== null) {
                return settings as Partial<AppSettings>;
            } else {
                // Default settings
                const defaultSettings: AppSettings = {
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

                // Create settings file atomically
                await atomicWriter.writeJson(settingsPath, defaultSettings, { pretty: true });
                return defaultSettings;
            }
        } catch (err) {
            log.error('Error getting settings:', err);
            throw err;
        }
    }

    async handleSetAutoLaunch(_: IpcInvokeEvent, enable: boolean) {
        try {
            // Platform-specific args configuration
            let args = ['--hidden']; // Default for all platforms

            // Add platform-specific args
            if (process.platform === 'win32' || process.platform === 'linux') {
                args = ['--hidden', '--autostart'];
            }

            // Get app naming properties
            const appName = app.getName();
            const execPath = app.getPath('exe');


            const autoLauncher = new AutoLaunch({
                name: appName,
                path: execPath,
                args: args,
                isHidden: true
            });

            if (enable) {
                await autoLauncher.enable();
            } else {
                await autoLauncher.disable();
            }

            return { success: true };
        } catch (err: unknown) {
            log.error('Error setting auto launch:', err);
            return { success: false, message: errorMessage(err) };
        }
    }

    async handleOpenExternal(_: IpcInvokeEvent, url: string): Promise<OperationResult> {
        try {
            // Validate URL to prevent security issues
            const validUrl = new URL(url);
            // Only allow https links to trusted domains
            if (validUrl.protocol !== 'https:') {
                log.warn(`Blocked attempt to open non-HTTPS URL: ${url}`);
                return { success: false, error: 'Only HTTPS URLs are allowed' };
            }

            // Allow OpenHeaders website, GitHub, Chrome Web Store, Microsoft Edge Add-ons, Mozilla Add-ons
            const allowedDomains = [
                'openheaders.io',
                'github.com',
                'chromewebstore.google.com',
                'microsoftedge.microsoft.com',
                'addons.mozilla.org'
            ];

            const isAllowed = allowedDomains.some(domain =>
                validUrl.hostname === domain || validUrl.hostname.endsWith(`.${domain}`)
            );

            if (!isAllowed) {
                log.warn(`Blocked attempt to open URL to untrusted domain: ${validUrl.hostname}`);
                return { success: false, error: 'Only trusted domains are allowed' };
            }

            await shell.openExternal(url);
            return { success: true };
        } catch (error: unknown) {
            log.error('Error opening external URL:', error);
            return { success: false, error: errorMessage(error) };
        }
    }
}

const settingsHandlers = new SettingsHandlers();
export { SettingsHandlers };
export default settingsHandlers;
