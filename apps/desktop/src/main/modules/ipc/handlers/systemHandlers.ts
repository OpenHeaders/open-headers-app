import child_process from 'node:child_process';
import path from 'node:path';
import util from 'node:util';
import { errorMessage } from '@openheaders/core';
import electron from 'electron';
import timeManager from '@/services/core/TimeManager';
import type { IpcInvokeEvent } from '@/types/common';
import mainLogger from '@/utils/mainLogger';

const { app, systemPreferences, shell } = electron;
const { createLogger, getLogDirectory } = mainLogger;
const log = createLogger('SystemHandlers');
const execAsync = util.promisify(child_process.exec);

interface TimezoneResult {
  timezone: string | null;
  offset: number;
  method: string;
}

// Cache for timezone - it rarely changes, no need to spawn PowerShell every time
let cachedTimezone: TimezoneResult | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 300000; // 5 minutes cache

class SystemHandlers {
  async handleGetSystemTimezone() {
    // Return cached value if still valid
    const now = Date.now();
    if (cachedTimezone && now - cacheTimestamp < CACHE_DURATION) {
      return cachedTimezone;
    }

    let timezone: string | null = null;
    let method = 'unknown';

    try {
      if (process.platform === 'darwin') {
        try {
          const { stdout } = await execAsync('readlink /etc/localtime', { timeout: 3000 });
          const match = stdout.trim().match(/zoneinfo\/(.+)$/);
          if (match) {
            timezone = match[1];
            method = 'readlink';
          }
        } catch (_e) {
          // Silently continue to fallback methods
        }
      } else if (process.platform === 'linux') {
        try {
          const { stdout } = await execAsync('readlink /etc/localtime', { timeout: 3000 });
          const match = stdout.trim().match(/zoneinfo\/(.+)$/);
          if (match) {
            timezone = match[1];
            method = 'readlink';
          }
        } catch {
          // Try alternative method for distributions without symlinks
          try {
            const { stdout } = await execAsync('cat /etc/timezone', { timeout: 3000 });
            timezone = stdout.trim();
            method = 'etc_timezone';
          } catch {
            // Silently continue to fallback
          }
        }
      } else if (process.platform === 'win32') {
        // Use JavaScript Intl API first - it's instant and doesn't spawn processes
        // This avoids the PowerShell process accumulation issue on Windows
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (timezone) {
          method = 'intl_api';
        } else {
          // Fallback to PowerShell only if Intl API fails (very rare)
          try {
            const { stdout } = await execAsync(
              'powershell -NoProfile -NonInteractive -Command "Get-TimeZone | Select-Object -ExpandProperty Id"',
              { timeout: 5000, windowsHide: true },
            );
            // Map Windows timezone IDs to IANA standard
            timezone = this.mapWindowsToIANA(stdout.trim());
            method = 'powershell';
          } catch {
            // Silently continue to fallback
          }
        }
      }
    } catch (error) {
      log.error('Error getting system timezone:', error);
      method = 'error_fallback';
    }

    // Use JavaScript API as final fallback
    if (!timezone) {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      method = 'intl_fallback';
    }

    const offset = timeManager.getDate().getTimezoneOffset();

    const result = {
      timezone,
      offset,
      method,
    };

    // Cache the result
    cachedTimezone = result;
    cacheTimestamp = now;

    return result;
  }

  mapWindowsToIANA(windowsId: string): string {
    const mapping: Record<string, string> = {
      'Pacific Standard Time': 'America/Los_Angeles',
      'Mountain Standard Time': 'America/Denver',
      'Central Standard Time': 'America/Chicago',
      'Eastern Standard Time': 'America/New_York',
      'GMT Standard Time': 'Europe/London',
      'Central European Standard Time': 'Europe/Berlin',
      'E. Europe Standard Time': 'Europe/Bucharest',
      'Turkey Standard Time': 'Europe/Istanbul',
      'China Standard Time': 'Asia/Shanghai',
      'Tokyo Standard Time': 'Asia/Tokyo',
      'India Standard Time': 'Asia/Kolkata',
      'Arabian Standard Time': 'Asia/Dubai',
      'Atlantic Standard Time': 'Atlantic/Canary',
      'W. Europe Standard Time': 'Europe/Paris',
      'Romance Standard Time': 'Europe/Paris',
      'Central Europe Standard Time': 'Europe/Warsaw',
      'Russian Standard Time': 'Europe/Moscow',
      'SA Pacific Standard Time': 'America/Bogota',
      'Argentina Standard Time': 'America/Buenos_Aires',
      'Brasilia Standard Time': 'America/Sao_Paulo',
      'Canada Central Standard Time': 'America/Regina',
      'Mexico Standard Time': 'America/Mexico_City',
      'Venezuela Standard Time': 'America/Caracas',
      'SA Eastern Standard Time': 'America/Cayenne',
      'Newfoundland Standard Time': 'America/St_Johns',
      'Greenland Standard Time': 'America/Godthab',
      'Azores Standard Time': 'Atlantic/Azores',
      'Cape Verde Standard Time': 'Atlantic/Cape_Verde',
      'Morocco Standard Time': 'Africa/Casablanca',
      UTC: 'UTC',
      'British Summer Time': 'Europe/London',
      'Egypt Standard Time': 'Africa/Cairo',
      'South Africa Standard Time': 'Africa/Johannesburg',
      'Israel Standard Time': 'Asia/Jerusalem',
      'Jordan Standard Time': 'Asia/Amman',
      'Middle East Standard Time': 'Asia/Beirut',
      'Syria Standard Time': 'Asia/Damascus',
      'West Asia Standard Time': 'Asia/Karachi',
      'Afghanistan Standard Time': 'Asia/Kabul',
      'Pakistan Standard Time': 'Asia/Karachi',
      'Sri Lanka Standard Time': 'Asia/Colombo',
      'Myanmar Standard Time': 'Asia/Yangon',
      'SE Asia Standard Time': 'Asia/Bangkok',
      'Singapore Standard Time': 'Asia/Singapore',
      'Taipei Standard Time': 'Asia/Taipei',
      'W. Australia Standard Time': 'Australia/Perth',
      'Korea Standard Time': 'Asia/Seoul',
      'Cen. Australia Standard Time': 'Australia/Adelaide',
      'AUS Eastern Standard Time': 'Australia/Sydney',
      'Tasmania Standard Time': 'Australia/Hobart',
      'Vladivostok Standard Time': 'Asia/Vladivostok',
      'West Pacific Standard Time': 'Pacific/Port_Moresby',
      'Central Pacific Standard Time': 'Pacific/Guadalcanal',
      'Fiji Standard Time': 'Pacific/Fiji',
      'New Zealand Standard Time': 'Pacific/Auckland',
      'Tonga Standard Time': 'Pacific/Tongatapu',
      'Samoa Standard Time': 'Pacific/Apia',
      'Hawaiian Standard Time': 'Pacific/Honolulu',
      'Alaskan Standard Time': 'America/Anchorage',
      'Pacific Standard Time (Mexico)': 'America/Tijuana',
      'Mountain Standard Time (Mexico)': 'America/Chihuahua',
      'Central Standard Time (Mexico)': 'America/Mexico_City',
      'Eastern Standard Time (Mexico)': 'America/Cancun',
      'US Mountain Standard Time': 'America/Phoenix',
      'Central America Standard Time': 'America/Guatemala',
      'US Eastern Standard Time': 'America/Indiana/Indianapolis',
      'Paraguay Standard Time': 'America/Asuncion',
      'Montevideo Standard Time': 'America/Montevideo',
      'Magallanes Standard Time': 'America/Punta_Arenas',
      'Cuba Standard Time': 'America/Havana',
      'Haiti Standard Time': 'America/Port-au-Prince',
      'Turks And Caicos Standard Time': 'America/Grand_Turk',
      'Sao Tome Standard Time': 'Africa/Sao_Tome',
      'Libya Standard Time': 'Africa/Tripoli',
      'Namibia Standard Time': 'Africa/Windhoek',
      'Mauritius Standard Time': 'Indian/Mauritius',
      'Georgian Standard Time': 'Asia/Tbilisi',
      'Caucasus Standard Time': 'Asia/Yerevan',
      'Iran Standard Time': 'Asia/Tehran',
      'Ekaterinburg Standard Time': 'Asia/Yekaterinburg',
      'Omsk Standard Time': 'Asia/Omsk',
      'Bangladesh Standard Time': 'Asia/Dhaka',
      'Nepal Standard Time': 'Asia/Kathmandu',
      'North Asia Standard Time': 'Asia/Krasnoyarsk',
      'N. Central Asia Standard Time': 'Asia/Novosibirsk',
      'North Asia East Standard Time': 'Asia/Irkutsk',
      'Ulaanbaatar Standard Time': 'Asia/Ulaanbaatar',
      'Yakutsk Standard Time': 'Asia/Yakutsk',
      'Sakhalin Standard Time': 'Asia/Sakhalin',
      'Magadan Standard Time': 'Asia/Magadan',
      'Kamchatka Standard Time': 'Asia/Kamchatka',
      'Norfolk Standard Time': 'Pacific/Norfolk',
      'Lord Howe Standard Time': 'Australia/Lord_Howe',
      'Easter Island Standard Time': 'Pacific/Easter',
      'Marquesas Standard Time': 'Pacific/Marquesas',
      'Tahiti Standard Time': 'Pacific/Tahiti',
      'Line Islands Standard Time': 'Pacific/Kiritimati',
      'Chatham Islands Standard Time': 'Pacific/Chatham',
    };

    return mapping[windowsId] || windowsId;
  }

  handleShowItemInFolder(_: IpcInvokeEvent, filePath: string) {
    if (filePath && typeof filePath === 'string') {
      shell.showItemInFolder(filePath);
    }
  }

  async handleOpenAppPath(_: IpcInvokeEvent, pathKey: string) {
    try {
      const pathMap: Record<string, string> = {
        logs: getLogDirectory(),
        userData: app.getPath('userData'),
        settings: path.join(app.getPath('userData'), 'settings.json'),
      };

      const targetPath = pathMap[pathKey];
      if (!targetPath) {
        return { success: false, error: `Unknown path key: ${pathKey}` };
      }

      if (pathKey === 'settings') {
        shell.showItemInFolder(targetPath);
      } else {
        const errorMessage = await shell.openPath(targetPath);
        if (errorMessage) {
          return { success: false, error: errorMessage };
        }
      }

      return { success: true };
    } catch (error: unknown) {
      log.error('Error opening app path:', error);
      return { success: false, error: errorMessage(error) };
    }
  }

  async handleCheckScreenRecordingPermission() {
    try {
      // Screen recording permissions only required on macOS
      if (process.platform === 'darwin') {
        // Don't call any APIs that might trigger permission dialogs
        // Just return that we need to check later
        return {
          success: true,
          hasPermission: null, // Will check when actually needed
          platform: process.platform,
        };
      }

      return {
        success: true,
        hasPermission: true,
        platform: process.platform,
      };
    } catch (error: unknown) {
      log.error('Error checking screen recording permission:', error);
      return {
        success: false,
        error: errorMessage(error),
        platform: process.platform,
      };
    }
  }

  async handleRequestScreenRecordingPermission() {
    try {
      if (process.platform === 'darwin') {
        // Check current permission status
        const currentStatus = systemPreferences.getMediaAccessStatus('screen');
        log.info('Current screen recording permission status:', currentStatus);

        if (currentStatus === 'granted') {
          return {
            success: true,
            hasPermission: true,
            platform: process.platform,
          };
        }

        // Permission not granted, try to request it
        const { desktopCapturer } = await import('electron');

        try {
          // This will trigger permission dialog if not previously granted
          const sources = await desktopCapturer.getSources({
            types: ['window', 'screen'],
            thumbnailSize: { width: 1, height: 1 },
          });

          log.info('DesktopCapturer sources retrieved:', sources.length);

          // Check permission status again after the attempt
          const hasPermission = systemPreferences.getMediaAccessStatus('screen') === 'granted';

          // Direct user to System Preferences if permission still denied
          if (!hasPermission) {
            try {
              await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
            } catch (openError) {
              log.error('Failed to open System Preferences:', openError);
            }
          }

          return {
            success: true,
            hasPermission,
            platform: process.platform,
            needsManualGrant: !hasPermission,
          };
        } catch (captureError) {
          log.error('Error during screen capture attempt:', captureError);

          // Fallback: direct user to System Preferences
          try {
            await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
          } catch (openError) {
            log.error('Failed to open System Preferences:', openError);
          }

          return {
            success: true,
            hasPermission: false,
            platform: process.platform,
            needsManualGrant: true,
          };
        }
      }

      return {
        success: true,
        hasPermission: true,
        platform: process.platform,
      };
    } catch (error: unknown) {
      log.error('Error requesting screen recording permission:', error);
      return {
        success: false,
        error: errorMessage(error),
        platform: process.platform,
      };
    }
  }
}

const systemHandlers = new SystemHandlers();

export { SystemHandlers };
export default systemHandlers;
