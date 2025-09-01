const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const AutoLaunch = require('auto-launch');
const { createLogger } = require('../../../../utils/mainLogger');
const atomicWriter = require('../../../../utils/atomicFileWriter');
const trayManager = require('../../tray/trayManager');
const webSocketService = require('../../../../services/websocket/ws-service');

const log = createLogger('SettingsHandlers');

class SettingsHandlers {
    async handleSaveSettings(_, settings) {
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
        } catch (err) {
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
                    recordingHotkey: 'CommandOrControl+Shift+E'
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

    async handleSetAutoLaunch(_, enable) {
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
        } catch (err) {
            log.error('Error setting auto launch:', err);
            return { success: false, message: err.message };
        }
    }

    async handleOpenExternal(_, url) {
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
        } catch (error) {
            log.error('Error opening external URL:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new SettingsHandlers();