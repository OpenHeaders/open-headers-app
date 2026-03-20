import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { showMessage } from '../../utils';
import { createLogger, setGlobalLogLevel } from '../../utils/error-handling/logger';
import type { AppSettings } from '../../../types/settings';

const log = createLogger('SettingsContext');

export type Settings = AppSettings;

interface SettingsContextValue {
  settings: Settings;
  loading: boolean;
  saveSettings: (newSettings: Partial<Settings>) => Promise<boolean>;
  showMainWindow: () => void;
  hideMainWindow: () => void;
}

// Create context
export const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

// Default settings
const defaultSettings: AppSettings = {
    launchAtLogin: true,
    hideOnLaunch: true,
    showDockIcon: true,
    showStatusBarIcon: true,
    theme: 'auto',
    autoStartProxy: true,
    proxyCacheEnabled: true,
    videoRecording: false,
    videoQuality: 'high',
    autoHighlightTableEntries: false,
    autoScrollTableEntries: false,
    compactMode: false,
    tutorialMode: true,
    developerMode: false,
    recordingHotkey: 'CommandOrControl+Shift+E',
    recordingHotkeyEnabled: true,
    logLevel: 'info'
};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<Settings>(defaultSettings);
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
                const loaded = await window.electronAPI.getSettings();
                const storedSettings: AppSettings = { ...defaultSettings, ...loaded };
                if (isMounted.current) {
                    setSettings(storedSettings);
                    if (storedSettings.logLevel) {
                        setGlobalLogLevel(storedSettings.logLevel);
                    }
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
    const saveSettings = async (newSettings: Partial<Settings>): Promise<boolean> => {
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

                // Apply log level to renderer logger
                if (settingsToSave.logLevel) {
                    setGlobalLogLevel(settingsToSave.logLevel);
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
        } catch (error: unknown) {
            log.error('Error saving settings:', error);
            if (isMounted.current) {
                showMessage('error', `Error saving settings: ${error instanceof Error ? error.message : String(error)}`);
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
    const value: SettingsContextValue = {
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
export function useSettings(): SettingsContextValue {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}
