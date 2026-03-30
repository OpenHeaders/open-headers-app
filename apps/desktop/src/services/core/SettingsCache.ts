/**
 * SettingsCache — Single source of truth for application settings.
 *
 * Loaded once during main-process startup (before window creation).
 * All consumers read from the in-memory cache; writes update cache + disk atomically.
 * Eliminates the 3-4 redundant settings.json reads that previously occurred during startup.
 */

import fs from 'node:fs';
import path from 'node:path';
import electron from 'electron';
import type { AppSettings } from '@/types/settings';
import atomicWriter from '@/utils/atomicFileWriter';
import mainLogger from '@/utils/mainLogger';

const { app } = electron;
const { createLogger } = mainLogger;
const log = createLogger('SettingsCache');

/**
 * Compute default settings at runtime.
 *
 * Most defaults are static, but updateChannel depends on which binary the
 * user is running: a beta build defaults to the beta channel so the
 * settings UI matches reality. Called during load() when Electron's
 * app.getVersion() is available.
 */
function getDefaultSettings(): AppSettings {
  const isRunningBeta = app.getVersion().includes('-beta.');
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
    recordingHotkeyEnabled: false,
    logLevel: 'info',
    autoUpdate: true,
    updateChannel: isRunningBeta ? 'beta' : 'production',
  };
}

class SettingsCache {
  private settings: AppSettings | null = null;
  private _isFirstRun = false;

  private getSettingsPath(): string {
    return path.join(app.getPath('userData'), 'settings.json');
  }

  /**
   * Load settings from disk once. Must be called before get().
   * If settings.json doesn't exist, creates it with defaults (first run).
   */
  async load(): Promise<AppSettings> {
    if (this.settings) return this.settings;

    const settingsPath = this.getSettingsPath();
    const defaults = getDefaultSettings();

    try {
      await fs.promises.access(settingsPath);
      const data = await fs.promises.readFile(settingsPath, 'utf8');
      const parsed = JSON.parse(data) as Partial<AppSettings>;
      this.settings = { ...defaults, ...parsed };
      this._isFirstRun = false;
      log.info('Settings loaded from disk');
    } catch {
      // File doesn't exist or is corrupted — first run
      this._isFirstRun = true;
      this.settings = { ...defaults };
      await atomicWriter.writeJson(settingsPath, this.settings, { pretty: true });
      log.info('First run detected, created default settings');
    }

    return this.settings;
  }

  /**
   * Synchronous getter — only callable after load() completes.
   */
  get(): AppSettings {
    if (!this.settings) {
      throw new Error('SettingsCache.get() called before load() — this is a startup sequencing bug');
    }
    return this.settings;
  }

  /**
   * Whether this is the first time the app has ever run (no settings.json existed).
   */
  isFirstRun(): boolean {
    return this._isFirstRun;
  }

  /**
   * Merge updates into the cache and persist to disk atomically.
   * Returns the full merged settings.
   */
  async save(updates: Partial<AppSettings>): Promise<AppSettings> {
    this.settings = { ...this.get(), ...updates };
    const settingsPath = this.getSettingsPath();
    await atomicWriter.writeJson(settingsPath, this.settings, { pretty: true });
    log.info('Settings saved to disk');
    return this.settings;
  }
}

const settingsCache = new SettingsCache();

export { getDefaultSettings, SettingsCache, settingsCache };
export default settingsCache;
