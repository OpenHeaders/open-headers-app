import electron from 'electron';
import fs from 'fs';
import path from 'path';
import AutoLaunch from 'auto-launch';
import mainLogger from '../../../../utils/mainLogger';
import atomicWriter from '../../../../utils/atomicFileWriter';
import trayManager from '../../tray/trayManager';
import webSocketService from '../../../../services/websocket/ws-service';

const { app, shell } = electron;
const { createLogger } = mainLogger;
const log = createLogger('SettingsHandlers');

class SettingsHandlers {
    async handleSaveSettings(_: any, settings: any) {
        try {
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');

            // Ensure ALL boolean settings are properly typed
            const booleanSettings = [
                'hideOnLaunch', 'showStatusBarIcon', 'showDockIcon', 'launchAtLogin',
                'tutorialMode', 'autoStartProxy', 'proxyCacheEnabled',
                'autoHighlightTableEntries', 'autoScrollTableEntries',
                'compactMode', 'developerMode',
                'videoRecording', 'pendingVideoRecording'
            ];

            booleanSettings.forEach(key => {
                if (settings.hasOwnProperty(key)) {
                    settings[key] = Boolean(settings[key]);
                }
            });

            await atomicWriter.writeJson(settingsPath, settings, { pretty: true });

            // Broadcast video recording state change to connected extensions
            if (settings.hasOwnProperty('videoRecording')) {
                webSocketService.broadcastVideoRecordingState(settings.videoRecording);
            }

            // Apply settings
            trayManager.updateTray(settings);

            // Apply log level if changed
            if (settings.logLevel) {
                const { setGlobalLogLevel } = require('../../../../utils/mainLogger');
                setGlobalLogLevel(settings.logLevel);
            }

            // Update global recording hotkey if changed
            if (settings.recordingHotkey || settings.hasOwnProperty('recordingHotkeyEnabled')) {
                const globalShortcuts = require('../../shortcuts/globalShortcuts');

                // Update hotkey if it changed
                if (settings.recordingHotkey) {
                    await globalShortcuts.updateHotkey(settings.recordingHotkey);
                }

                // Update enabled state if it changed
                if (settings.hasOwnProperty('recordingHotkeyEnabled')) {
                    await globalShortcuts.updateHotkeyEnabled(
                        settings.recordingHotkeyEnabled,
                        settings.recordingHotkey || 'CommandOrControl+Shift+E'
                    );
                }

                // Broadcast the hotkey change to all connected extensions
                webSocketService.broadcastRecordingHotkeyChange(
                    settings.recordingHotkey || 'CommandOrControl+Shift+E',
                    settings.recordingHotkeyEnabled !== undefined ? settings.recordingHotkeyEnabled : true
                );
            }

            return { success: true };
        } catch (err: any) {
            log.error('Error saving settings:', err);
            return { success: false, message: err.message };
        }
    }

    async handleGetSettings() {
        try {
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');

            // Try to read with atomic reader first
            const settings = await atomicWriter.readJson(settingsPath);

            if (settings !== null) {
                return settings;
            } else {
                // Default settings
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

    async handleSetAutoLaunch(_: any, enable: boolean) {
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


            const autoLauncher = new (AutoLaunch as any)({
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
        } catch (err: any) {
            log.error('Error setting auto launch:', err);
            return { success: false, message: err.message };
        }
    }

    async handleOpenExternal(_: any, url: string) {
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
        } catch (error: any) {
            log.error('Error opening external URL:', error);
            return { success: false, error: error.message };
        }
    }
}

const settingsHandlers = new SettingsHandlers();
export { SettingsHandlers };
export default settingsHandlers;
