import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { showMessage } from '../../utils'; // Import the utility
import { createLogger } from '../../utils/error-handling/logger';

const log = createLogger('SettingsContext');

// Create context
export const SettingsContext = createContext();

// Default settings
const defaultSettings = {
    launchAtLogin: true,
    hideOnLaunch: true,
    showDockIcon: true,
    showStatusBarIcon: true,
    theme: 'auto', // auto, light, dark
    autoStartProxy: true,
    proxyCacheEnabled: true,
    videoRecording: false,
    videoQuality: 'high', // standard, high, ultra
    autoHighlightTableEntries: false,
    autoScrollTableEntries: false,
    compactMode: false,
    tutorialMode: true,
    developerMode: false,
    recordingHotkey: 'CommandOrControl+Shift+E'
};

export function SettingsProvider({ children }) {
    const [settings, setSettings] = useState(defaultSettings);
    const [loading, setLoading] = useState(true);
    // Add mounted ref
    const isMounted = useRef(true);

    useEffect(() => {
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Load settings on component mount
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const storedSettings = await window.electronAPI.getSettings();
                if (isMounted.current) {
                    setSettings(storedSettings);
                    setLoading(false);
                }
            } catch (error) {
                log.error('Error loading settings:', error);
                if (isMounted.current) {
                    showMessage('error', 'Failed to load settings, using defaults');
                    setLoading(false);
                }
            }
        };

        loadSettings();
    }, []);

    // Save settings
    const saveSettings = async (newSettings) => {
        try {
            setLoading(true);

            // Prepare settings object (merge with defaults to ensure all fields)
            const settingsToSave = {
                ...defaultSettings,
                ...newSettings
            };

            // Save to main process
            const result = await window.electronAPI.saveSettings(settingsToSave);

            if (result.success) {
                // Update local state
                if (isMounted.current) {
                    setSettings(settingsToSave);
                }

                // Apply auto-launch setting
                await window.electronAPI.setAutoLaunch(settingsToSave.launchAtLogin);

                return true;
            } else {
                if (isMounted.current) {
                    showMessage('error', `Failed to save settings: ${result.message}`);
                }
                return false;
            }
        } catch (error) {
            log.error('Error saving settings:', error);
            if (isMounted.current) {
                showMessage('error', `Error saving settings: ${error.message}`);
            }
            return false;
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    };

    // Show/hide main window
    const showMainWindow = () => {
        window.electronAPI.showMainWindow();
    };

    const hideMainWindow = () => {
        window.electronAPI.hideMainWindow();
    };

    // Context value
    const value = {
        settings,
        loading,
        saveSettings,
        showMainWindow,
        hideMainWindow
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
}

// Custom hook for using the settings context
export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}