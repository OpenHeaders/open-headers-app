import type { OperationResult } from '@openheaders/core';
import { errorMessage } from '@openheaders/core';
import AutoLaunch from 'auto-launch';
import electron from 'electron';
import trayManager from '@/main/modules/tray/trayManager';
import settingsCache from '@/services/core/SettingsCache';
import webSocketService from '@/services/websocket/ws-service';
import type { IpcInvokeEvent } from '@/types/common';
import type { AppSettings } from '@/types/settings';
import mainLogger from '@/utils/mainLogger';

const { app, shell } = electron;
const { createLogger } = mainLogger;
const log = createLogger('SettingsHandlers');

class SettingsHandlers {
  async handleSaveSettings(_: IpcInvokeEvent | null, settings: Partial<AppSettings>) {
    try {
      // Ensure ALL boolean settings are properly typed
      type BooleanKey = {
        [K in keyof AppSettings]-?: NonNullable<AppSettings[K]> extends boolean ? K : never;
      }[keyof AppSettings];
      const booleanSettings: BooleanKey[] = [
        'hideOnLaunch',
        'showStatusBarIcon',
        'showDockIcon',
        'launchAtLogin',
        'tutorialMode',
        'autoStartProxy',
        'proxyCacheEnabled',
        'autoHighlightTableEntries',
        'autoScrollTableEntries',
        'compactMode',
        'developerMode',
        'videoRecording',
        'pendingVideoRecording',
        'autoUpdate',
      ];

      const mutableSettings = { ...settings };
      for (const key of booleanSettings) {
        if (key in mutableSettings) {
          mutableSettings[key] = Boolean(mutableSettings[key]);
        }
      }

      // Save through SettingsCache — updates in-memory cache + persists to disk
      await settingsCache.save(mutableSettings);

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
            !!mutableSettings.recordingHotkeyEnabled,
            mutableSettings.recordingHotkey || 'CommandOrControl+Shift+E',
          );
        }

        // Broadcast the hotkey change to all connected extensions
        webSocketService.broadcastRecordingHotkeyChange(
          mutableSettings.recordingHotkey || 'CommandOrControl+Shift+E',
          'recordingHotkeyEnabled' in mutableSettings ? !!mutableSettings.recordingHotkeyEnabled : true,
        );
      }

      // Apply update settings if changed
      if ('autoUpdate' in mutableSettings || 'updateChannel' in mutableSettings) {
        const autoUpdaterManager = (await import('../../updater/autoUpdater')).default;
        autoUpdaterManager.applyUpdateSettings(settingsCache.get());
      }

      return { success: true };
    } catch (err: unknown) {
      log.error('Error saving settings:', err);
      return { success: false, message: errorMessage(err) };
    }
  }

  async handleGetSettings(): Promise<AppSettings> {
    // SettingsCache is always loaded before the window is created,
    // so get() is guaranteed to have data here.
    return settingsCache.get();
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
        isHidden: true,
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
        'addons.mozilla.org',
      ];

      const isAllowed = allowedDomains.some(
        (domain) => validUrl.hostname === domain || validUrl.hostname.endsWith(`.${domain}`),
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
