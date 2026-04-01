import type React from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { showMessage } from '@/renderer/utils';
import { createLogger, setGlobalLogLevel } from '@/renderer/utils/error-handling/logger';
import type { AppSettings } from '@/types/settings';

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
  recordingHotkeyEnabled: false,
  logLevel: 'info',
  autoUpdate: true,
  updateChannel: 'production',
};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // Initialize from synchronous startup data — no async IPC needed for first render.
  // window.startupData is injected by the preload script before React mounts.
  const initialSettings: AppSettings = {
    ...defaultSettings,
    ...(window.startupData?.settings ?? {}),
  };

  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [loading, setLoading] = useState(false); // Not loading — settings are already available
  const isMounted = useRef(true);

  // Apply log level from startup data — initialSettings is derived from
  // window.startupData which is set once before React mounts, so it's
  // effectively a constant.
  // biome-ignore lint/correctness/useExhaustiveDependencies: initialSettings is derived from window.startupData (set once before mount)
  useEffect(() => {
    if (initialSettings.logLevel) {
      setGlobalLogLevel(initialSettings.logLevel);
    }
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Subscribe to settings changes pushed from the main process.
  // This handles mutations from ANY source (browser extension, tray, etc.)
  // so the renderer always reflects the true state from SettingsCache.
  useEffect(() => {
    const cleanup = window.electronAPI.onSettingsChanged((updated) => {
      if (!isMounted.current) return;
      log.debug('Settings changed (push from main):', updated);
      setSettings(updated);
      if (updated.logLevel) {
        setGlobalLogLevel(updated.logLevel);
      }
    });
    return cleanup;
  }, []);

  // Save settings — sends only the partial to main process (source of truth).
  // Main merges with its own state, persists, and returns the full merged result.
  const saveSettings = async (newSettings: Partial<Settings>): Promise<boolean> => {
    try {
      setLoading(true);

      // Send only the partial update — main process merges with its truth
      const result = await window.electronAPI.saveSettings(newSettings);

      if (result.success) {
        // Hydrate local state from main's merged result
        const mergedSettings = result.settings ?? { ...settings, ...newSettings };
        if (isMounted.current) {
          setSettings(mergedSettings);
        }

        // Apply log level to renderer logger
        if (mergedSettings.logLevel) {
          setGlobalLogLevel(mergedSettings.logLevel);
        }

        // Apply auto-launch setting if it was changed
        if ('launchAtLogin' in newSettings) {
          await window.electronAPI.setAutoLaunch(mergedSettings.launchAtLogin);
        }

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
    hideMainWindow,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

// Custom hook for using the settings context
export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
