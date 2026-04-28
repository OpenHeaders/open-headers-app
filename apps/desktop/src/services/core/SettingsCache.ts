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
    // v4 is in maintenance mode: never auto-update by default, since the next
    // major (v5) is not backwards-compatible. Existing installs are migrated
    // to false in load() via MAINTENANCE_MODE_MIGRATION_KEY.
    autoUpdate: false,
    updateChannel: isRunningBeta ? 'beta' : 'production',
  };
}

// Settings key recording that the one-time v4-maintenance migration
// (force autoUpdate=false) has been applied for this install. Without this,
// existing users who previously enabled auto-update would keep silently
// jumping versions — including across the v4→v5 boundary.
const MAINTENANCE_MODE_MIGRATION_KEY = '_v4MaintenanceMigrated';

interface PersistedSettings extends Partial<AppSettings> {
  [MAINTENANCE_MODE_MIGRATION_KEY]?: boolean;
}

class SettingsCache {
  private settings: AppSettings | null = null;
  private _isFirstRun = false;
  private _maintenanceMigrated = false;

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
      const parsed = JSON.parse(data) as PersistedSettings;

      // One-time migration for existing installs: force autoUpdate=false so
      // v4 never silently jumps to a release that no longer exists for it.
      // Strip the migration marker before merging so it never lands in the
      // typed AppSettings object.
      const { [MAINTENANCE_MODE_MIGRATION_KEY]: alreadyMigrated, ...settingsOnly } = parsed;
      this.settings = { ...defaults, ...settingsOnly };
      this._maintenanceMigrated = true;
      if (!alreadyMigrated) {
        this.settings.autoUpdate = false;
        await this._writeToDisk();
        log.info('Applied v4 maintenance migration: autoUpdate forced to false');
      }
      this._isFirstRun = false;
      log.info('Settings loaded from disk');
    } catch {
      // File doesn't exist or is corrupted — first run. Defaults already
      // include autoUpdate=false, so the migration is effectively pre-applied
      // for new installs; persist the marker from the start.
      this._isFirstRun = true;
      this.settings = { ...defaults };
      this._maintenanceMigrated = true;
      await this._writeToDisk();
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
   * After persisting, pushes the full settings to all open renderer windows
   * so the UI stays in sync regardless of who initiated the change
   * (renderer, browser extension, tray, etc.).
   * Gracefully no-ops when zero windows are open (background-only mode).
   * Returns the full merged settings.
   */
  async save(updates: Partial<AppSettings>): Promise<AppSettings> {
    this.settings = { ...this.get(), ...updates };
    await this._writeToDisk();
    log.info('Settings saved to disk');
    this._pushToRenderers(this.settings);
    return this.settings;
  }

  /**
   * Persist current settings to disk, preserving the maintenance-migration
   * marker so the migration only runs once per install (otherwise every
   * normal save() would clobber the marker and re-trigger the migration).
   */
  private async _writeToDisk(): Promise<void> {
    if (!this.settings) return;
    const persisted: PersistedSettings = { ...this.settings };
    if (this._maintenanceMigrated) {
      persisted[MAINTENANCE_MODE_MIGRATION_KEY] = true;
    }
    await atomicWriter.writeJson(this.getSettingsPath(), persisted, { pretty: true });
  }

  /**
   * Push current settings to all open renderer windows.
   * No-ops when no windows exist (app running in background-only mode).
   */
  private _pushToRenderers(settings: AppSettings): void {
    try {
      const { BrowserWindow } = electron;
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('settings-changed', settings);
        }
      }
    } catch {
      // Non-critical — app may be shutting down or no windows exist
    }
  }
}

const settingsCache = new SettingsCache();

export { getDefaultSettings, SettingsCache, settingsCache };
export default settingsCache;
