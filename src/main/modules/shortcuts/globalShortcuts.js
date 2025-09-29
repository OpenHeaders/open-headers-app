const { globalShortcut } = require('electron');
const { createLogger } = require('../../../utils/mainLogger');
const path = require('path');
const fs = require('fs').promises;

const log = createLogger('GlobalShortcuts');

class GlobalShortcuts {
    constructor() {
        this.currentHotkey = null;
    }

    /**
     * Initialize global shortcuts
     */
    async initialize(app) {
        try {
            // Load settings to get the current hotkey
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');
            let settings = {};
            
            try {
                const settingsData = await fs.readFile(settingsPath, 'utf8');
                settings = JSON.parse(settingsData);
            } catch (error) {
                // Settings file might not exist yet
                log.debug('Settings file not found, using default hotkey');
            }

            // Check if hotkey is enabled (default to true for backward compatibility)
            const isEnabled = settings.recordingHotkeyEnabled !== undefined ? settings.recordingHotkeyEnabled : true;
            
            if (isEnabled) {
                const hotkey = settings.recordingHotkey || 'CommandOrControl+Shift+E';
                this.registerRecordingHotkey(hotkey);
            } else {
                log.info('Recording hotkey is disabled in settings');
            }
        } catch (error) {
            log.error('Failed to initialize global shortcuts:', error);
        }
    }

    /**
     * Register the recording hotkey
     */
    registerRecordingHotkey(hotkey) {
        try {
            // Unregister previous hotkey if exists
            if (this.currentHotkey) {
                globalShortcut.unregister(this.currentHotkey);
                log.info(`Unregistered previous hotkey: ${this.currentHotkey}`);
            }

            // Register new hotkey
            const success = globalShortcut.register(hotkey, () => {
                this.handleRecordingHotkey();
            });

            if (success) {
                this.currentHotkey = hotkey;
                log.info(`Registered global recording hotkey: ${hotkey}`);
            } else {
                log.error(`Failed to register global recording hotkey: ${hotkey}`);
            }
        } catch (error) {
            log.error('Error registering recording hotkey:', error);
        }
    }

    /**
     * Handle recording hotkey press
     */
    async handleRecordingHotkey() {
        try {
            log.info('Recording hotkey pressed');
            
            // Send message to WebSocket service to notify extension
            const webSocketService = require('../../../services/websocket/ws-service');
            
            // Check if WebSocket is connected
            if (!webSocketService.isConnected()) {
                log.warn('No browser extension connected, cannot handle hotkey press');
                // Could show a notification to the user here
                return;
            }

            // Send hotkey press event to extension
            // Extension will handle the toggle logic based on current recording state
            log.info('Sending recordingHotkeyPressed to browser extension');
            webSocketService.sendToBrowserExtension({
                type: 'recordingHotkeyPressed'
            });
        } catch (error) {
            log.error('Error handling recording hotkey:', error);
        }
    }

    /**
     * Update hotkey when settings change
     */
    async updateHotkey(newHotkey) {
        if (newHotkey && newHotkey !== this.currentHotkey) {
            log.info(`Updating recording hotkey from ${this.currentHotkey} to ${newHotkey}`);
            this.registerRecordingHotkey(newHotkey);
        }
    }

    /**
     * Update hotkey enabled state when settings change
     */
    async updateHotkeyEnabled(isEnabled, hotkey) {
        if (isEnabled) {
            // Register the hotkey if it's not already registered
            if (!this.currentHotkey) {
                const hotkeyToUse = hotkey || 'CommandOrControl+Shift+E';
                log.info(`Enabling recording hotkey: ${hotkeyToUse}`);
                this.registerRecordingHotkey(hotkeyToUse);
            }
        } else {
            // Unregister the hotkey if it's currently registered
            if (this.currentHotkey) {
                log.info(`Disabling recording hotkey: ${this.currentHotkey}`);
                globalShortcut.unregister(this.currentHotkey);
                this.currentHotkey = null;
            }
        }
    }

    /**
     * Temporarily disable the recording hotkey (used when editing)
     */
    disableHotkey() {
        if (this.currentHotkey) {
            globalShortcut.unregister(this.currentHotkey);
            log.info(`Temporarily disabled recording hotkey: ${this.currentHotkey}`);
        }
    }

    /**
     * Re-enable the recording hotkey after editing
     */
    enableHotkey() {
        if (this.currentHotkey) {
            const success = globalShortcut.register(this.currentHotkey, () => {
                this.handleRecordingHotkey();
            });
            
            if (success) {
                log.info(`Re-enabled recording hotkey: ${this.currentHotkey}`);
            } else {
                log.error(`Failed to re-enable recording hotkey: ${this.currentHotkey}`);
            }
        }
    }

    /**
     * Cleanup on app quit
     */
    cleanup() {
        if (this.currentHotkey) {
            globalShortcut.unregister(this.currentHotkey);
            log.info('Unregistered global shortcuts');
        }
    }
}

module.exports = new GlobalShortcuts();