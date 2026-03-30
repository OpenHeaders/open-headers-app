import type { BrowserWindow as BrowserWindowType } from 'electron';
import electron from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { isVersionCompatible as checkVersionCompatible, DATA_FORMAT_VERSION } from '../../../config/version';
import { errorMessage } from '../../../types/common';
import type { EnvironmentSchema, EnvironmentVariable } from '../../../types/environment';
import type { AppSettings } from '../../../types/settings';
import mainLogger from '../../../utils/mainLogger';
import windowsFocusHelper from '../utils/windowsFocus';

const { app, BrowserWindow } = electron;
const { createLogger } = mainLogger;
const log = createLogger('ProtocolHandler');

/** Minified variable data in protocol payloads. */
interface MinifiedVarData {
  val?: string;
  s?: number;
}

/** Minified data from protocol URLs before expansion. */
interface ProtocolMinifiedData {
  /** Minified environments: short env name -> var name -> minified var data */
  e?: Record<string, Record<string, MinifiedVarData>>;
  /** Minified environment schema */
  es?: { e?: Record<string, { v?: Array<{ n: string; s?: number }> }> };
  /** Minified invite/env fields (wn, ru, b, cp, at, in, desc, etc.) */
  [key: string]: unknown;
}

/** Decoded protocol payload after decompression and expansion. */
interface ProtocolPayload {
  action: string;
  version?: string;
  data: ProtocolInviteData | ProtocolEnvironmentData;
  /** Minified action code (before expansion). */
  a?: string;
  /** Minified version (before expansion). */
  v?: string;
  /** Minified data (before expansion). */
  d?: ProtocolMinifiedData;
}

/** Team invite data as received from protocol URL (subset of TeamWorkspaceInvite). */
interface ProtocolInviteData {
  workspaceName: string;
  repoUrl: string;
  branch?: string;
  configPath?: string;
  authType?: string;
  inviterName?: string;
  description?: string;
}

/** Environment import data as received from protocol URL. */
interface ProtocolEnvironmentData {
  environments?: Record<string, Record<string, Partial<EnvironmentVariable>>>;
  environmentSchema?: EnvironmentSchema;
}

interface UrlValidationResult {
  valid: boolean;
  error?: string;
  urlObj?: URL;
  host?: string;
}

class ProtocolHandler {
  mainWindow: BrowserWindowType | null;
  rendererReady: boolean;
  pendingInvite: ProtocolInviteData | null;
  pendingEnvironmentImport: ProtocolEnvironmentData | null;

  constructor() {
    this.mainWindow = null;
    this.rendererReady = false;
    this.pendingInvite = null;
    this.pendingEnvironmentImport = null;
  }

  setMainWindow(window: BrowserWindowType) {
    this.mainWindow = window;
  }

  setRendererReady() {
    log.info('Renderer marked as ready for protocol messages');
    this.rendererReady = true;
    // Process any pending invites when renderer is ready
    if (this.mainWindow) {
      this.processPendingInvites();
    }
  }

  setupProtocol() {
    // Register protocol handler for openheaders://
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('openheaders', process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient('openheaders');
    }
  }

  validateProtocolUrl(url: string): UrlValidationResult {
    if (!url) {
      return { valid: false, error: 'URL must be a non-empty string' };
    }

    // Check if it starts with openheaders://
    if (!url.startsWith('openheaders://')) {
      return { valid: false, error: 'URL must start with openheaders://' };
    }

    try {
      const urlObj = new URL(url);

      // Ensure the protocol is correct
      if (urlObj.protocol !== 'openheaders:') {
        return { valid: false, error: 'Invalid protocol' };
      }

      // Ensure we have a host
      const host = urlObj.host || urlObj.hostname || '';
      if (!host) {
        return { valid: false, error: 'URL must have a host' };
      }

      // Normalize the host
      const normalizedHost = host.split('/')[0];

      // Only accept the unified format
      if (normalizedHost !== 'open') {
        return { valid: false, error: 'Invalid URL format. Expected: openheaders://open?payload=...' };
      }

      const params = new URLSearchParams(urlObj.search);
      // Check for any valid payload parameter
      if (!params.get('payload') && !params.get('g') && !params.get('d') && !params.get('b85')) {
        return { valid: false, error: 'Open URL must have a payload parameter (payload, g, d, or b85)' };
      }

      return { valid: true, urlObj, host: normalizedHost };
    } catch (error: unknown) {
      return { valid: false, error: `Invalid URL format: ${errorMessage(error)}` };
    }
  }

  handleProtocolUrl(url: string) {
    try {
      log.info(`Handling protocol URL (${url?.length ?? 0} chars)`);

      // Validate the URL first
      const validation = this.validateProtocolUrl(url);
      if (!validation.valid) {
        log.error('Invalid protocol URL:', validation.error);
        this.handleProtocolError(validation.error!);
        return;
      }

      // Parse the URL
      const urlObj = validation.urlObj!;
      const params = new URLSearchParams(urlObj.search);

      log.debug(`URL details — host: ${urlObj.host}, params: ${Array.from(params.keys()).join(', ')}`);

      // Check for different compression types
      let payload = params.get('payload');
      let compressionType = 'gzip'; // default

      if (!payload) {
        // Check for other compression type parameters
        if (params.get('g')) {
          payload = params.get('g');
          compressionType = 'gzip';
        } else if (params.get('d')) {
          payload = params.get('d');
          compressionType = 'deflate';
        } else if (params.get('b85')) {
          payload = params.get('b85');
          compressionType = 'base85';
        } else {
          throw new Error('No payload parameter found');
        }
      }

      // Handle unified open format
      this.handleUnifiedProtocol(payload!, compressionType);
    } catch (error: unknown) {
      log.error('Error handling protocol URL:', error);
      this.handleProtocolError(`Failed to handle URL: ${errorMessage(error)}`);
    }
  }

  handleUnifiedProtocol(payloadParam: string, compressionType = 'gzip') {
    try {
      log.info('Handling unified protocol with payload parameter');

      if (!payloadParam) {
        throw new Error('Missing payload parameter');
      }

      let decodedPayload: ProtocolPayload;

      try {
        let decompressed: Buffer;

        if (compressionType === 'base85') {
          // Decode base85 first
          const base85Decoded = this.base85Decode(payloadParam);
          // Then decompress (assuming gzip)
          decompressed = zlib.gunzipSync(base85Decoded);
        } else if (compressionType === 'deflate') {
          const compressed = Buffer.from(payloadParam, 'base64url');
          decompressed = zlib.inflateSync(compressed);
        } else {
          // Default to gzip
          const compressed = Buffer.from(payloadParam, 'base64url');
          decompressed = zlib.gunzipSync(compressed);
        }

        decodedPayload = JSON.parse(decompressed.toString('utf8')) as ProtocolPayload;
        log.info(`Successfully decompressed payload using ${compressionType}`);
      } catch (compressionError: unknown) {
        log.warn('Compression decoding failed:', errorMessage(compressionError));
        // Fallback to regular base64 decoding for backward compatibility
        try {
          decodedPayload = JSON.parse(atob(payloadParam)) as ProtocolPayload;
          log.info('Using uncompressed payload (legacy format)');
        } catch (_base64Error) {
          throw new Error('Failed to decode payload: invalid format');
        }
      }

      // Expand ultra-optimized payloads
      decodedPayload = this.expandOptimizedPayload(decodedPayload);

      log.info('Decoded payload:', {
        action: decodedPayload.action,
        version: decodedPayload.version,
      });

      // Validate version (optional - for future compatibility)
      if (decodedPayload.version && !this.isVersionCompatible(decodedPayload.version)) {
        log.warn(`Protocol version mismatch. Expected: 3.x.x, Got: ${decodedPayload.version}`);
      }

      // Validate required fields
      if (!decodedPayload.action) {
        throw new Error('Payload must contain an action field');
      }

      if (!decodedPayload.data) {
        throw new Error('Payload must contain a data field');
      }

      // Route based on action
      switch (decodedPayload.action) {
        case 'team-invite':
          log.info('Processing team workspace invite');
          this.processTeamWorkspaceInvite(decodedPayload.data as ProtocolInviteData);
          break;

        case 'environment-import':
          log.info('Processing environment config import');
          this.processEnvironmentConfigImport(decodedPayload.data as ProtocolEnvironmentData);
          break;

        default:
          log.error('Unknown action:', decodedPayload.action);
          this.handleProtocolError(`Unknown action: ${decodedPayload.action}`);
      }
    } catch (error: unknown) {
      log.error('Error handling unified protocol:', error);
      this.handleProtocolError(`Failed to process payload: ${errorMessage(error)}`);
    }
  }

  base85Decode(str: string): Buffer {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~';
    const alphabetMap: Record<string, number> = {};
    for (let i = 0; i < alphabet.length; i++) {
      alphabetMap[alphabet[i]] = i;
    }

    const result: number[] = [];
    for (let i = 0; i < str.length; i += 5) {
      const chunk = str.slice(i, Math.min(i + 5, str.length));
      let value = 0;

      for (let j = 0; j < chunk.length; j++) {
        value = value * 85 + alphabetMap[chunk[j]];
      }

      // Convert to bytes
      const bytes: number[] = [];
      for (let j = 3; j >= 0; j--) {
        if (chunk.length >= j + 2) {
          bytes.unshift(value & 0xff);
          value >>= 8;
        }
      }

      result.push(...bytes);
    }

    return Buffer.from(result);
  }

  expandOptimizedPayload(payload: ProtocolPayload): ProtocolPayload {
    // Expand ultra-optimized action codes
    if (payload.a === 'ei') {
      payload.action = 'environment-import';
    } else if (payload.a === 'ti') {
      payload.action = 'team-invite';
    }

    // Expand version
    if (payload.v === '3') {
      payload.version = DATA_FORMAT_VERSION;
    }

    // Expand data from minified 'd' field
    if (payload.d) {
      const data = payload.d;
      delete payload.d;

      const expanded: ProtocolMinifiedData = { ...data };

      // Expand environment names
      const minifiedEnvs = data.e;
      if (minifiedEnvs) {
        const environments: Record<string, Record<string, Partial<EnvironmentVariable>>> = {};
        Object.entries(minifiedEnvs).forEach(([shortName, vars]) => {
          const fullName =
            shortName === 'dev'
              ? 'development'
              : shortName === 'prod'
                ? 'production'
                : shortName === 'stg'
                  ? 'staging'
                  : shortName;

          environments[fullName] = {};

          Object.entries(vars).forEach(([varName, varData]) => {
            const expandedVar: Partial<EnvironmentVariable> = {};

            if (varData.val !== undefined) {
              expandedVar.value = varData.val;
            }

            if (varData.s === 1) {
              expandedVar.isSecret = true;
            }

            environments[fullName][varName] = expandedVar;
          });
        });
        expanded.environments = environments;
        delete expanded.e;
      }

      // Expand environment schema
      const minifiedSchema = data.es;
      if (minifiedSchema?.e) {
        const environmentSchema: EnvironmentSchema = {
          environments: {},
        };

        Object.entries(minifiedSchema.e).forEach(([shortName, envData]) => {
          const fullName =
            shortName === 'dev'
              ? 'development'
              : shortName === 'prod'
                ? 'production'
                : shortName === 'stg'
                  ? 'staging'
                  : shortName;

          if (envData.v) {
            environmentSchema.environments[fullName] = {
              variables: envData.v.map((v) => ({
                name: v.n,
                isSecret: v.s === 1,
              })),
            };
          }
        });
        expanded.environmentSchema = environmentSchema;
        delete expanded.es;
      }

      // Expand team invite fields
      const fieldMap: Record<string, string> = {
        wn: 'workspaceName',
        ru: 'repoUrl',
        b: 'branch',
        cp: 'configPath',
        at: 'authType',
        in: 'inviterName',
        desc: 'description',
      };

      for (const [short, full] of Object.entries(fieldMap)) {
        if (expanded[short] !== undefined) {
          expanded[full] = expanded[short];
          delete expanded[short];
        }
      }

      payload.data = expanded as ProtocolInviteData | ProtocolEnvironmentData;
    }

    // Remove the minified action field
    if (payload.a) {
      delete payload.a;
    }

    // Remove the minified version field
    if (payload.v) {
      delete payload.v;
    }

    return payload;
  }

  isVersionCompatible(version: string): boolean {
    // Use centralized version compatibility check
    return checkVersionCompatible(version);
  }

  processTeamWorkspaceInvite(inviteData: ProtocolInviteData) {
    // Basic validation
    if (!inviteData.workspaceName || !inviteData.repoUrl) {
      log.error('Invalid invite data structure:', inviteData);
      this.handleProtocolError('Invalid invite data: missing required fields');
      return;
    }

    log.info('Processing team workspace invite:', {
      workspaceName: inviteData.workspaceName,
      repoUrl: inviteData.repoUrl,
      inviterName: inviteData.inviterName,
    });

    // Get main window - use stored reference or find existing
    const mainWindow = this.mainWindow || BrowserWindow.getAllWindows()[0];
    if (!mainWindow) {
      // If no window exists, we need to create one
      // This will be handled by the main process initialization
      log.info('No window available, invite will be processed after window creation');
      this.pendingInvite = inviteData;
      return;
    }

    // Show and focus the window
    this.showAndFocusWindow(mainWindow);

    // Check if renderer is ready
    if (!this.rendererReady) {
      log.info('Renderer not ready yet, storing invite as pending');
      this.pendingInvite = inviteData;
      return;
    }

    // Check if window is still loading
    if (mainWindow.webContents.isLoading()) {
      log.info('Window is still loading, waiting for it to be ready');
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('process-team-workspace-invite', inviteData);
        log.info('Sent team workspace invite to renderer after window load');
      });
    } else {
      // Send invite data to renderer for processing
      mainWindow.webContents.send('process-team-workspace-invite', inviteData);
      log.info('Sent team workspace invite to renderer');
    }
  }

  processEnvironmentConfigImport(envData: ProtocolEnvironmentData) {
    // Basic validation
    if (!envData.environmentSchema && !envData.environments) {
      log.error('Invalid environment data structure:', envData);
      this.handleProtocolError('Invalid environment data: must contain schema or environments');
      return;
    }

    log.info('Processing environment config import:', {
      hasSchema: !!envData.environmentSchema,
      hasValues: !!envData.environments,
      environmentCount: envData.environments ? Object.keys(envData.environments).length : 0,
    });

    // Get main window - use stored reference or find existing
    const mainWindow = this.mainWindow || BrowserWindow.getAllWindows()[0];
    if (!mainWindow) {
      // If no window exists, we need to create one
      log.info('No window available, environment import will be processed after window creation');
      this.pendingEnvironmentImport = envData;
      return;
    }

    // Show and focus the window
    this.showAndFocusWindow(mainWindow);

    // Check if renderer is ready
    if (!this.rendererReady) {
      log.info('Renderer not ready yet, storing environment import as pending');
      this.pendingEnvironmentImport = envData;
      return;
    }

    // Ensure the window is ready before sending the event
    if (mainWindow.webContents.isLoading()) {
      log.info('Window is still loading, waiting for it to be ready');
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('process-environment-config-import', envData);
        log.info('Sent environment config import to renderer after window load');
      });
    } else {
      // Send environment data to renderer for processing
      mainWindow.webContents.send('process-environment-config-import', envData);
      log.info('Sent environment config import to renderer');
    }
  }

  showAndFocusWindow(window: BrowserWindowType) {
    windowsFocusHelper.focusWindow(window);
  }

  /**
   * Check if dock should be shown based on user settings
   */
  shouldShowDock(): boolean {
    try {
      const settingsPath = path.join(app.getPath('userData'), 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const settingsData = fs.readFileSync(settingsPath, 'utf8');
        const settings = JSON.parse(settingsData) as Partial<AppSettings>;
        // Default to true if setting doesn't exist
        return settings.showDockIcon !== false;
      }
    } catch (error: unknown) {
      log.debug('Could not read dock settings:', errorMessage(error));
    }
    // Default to showing dock if we can't read settings
    return true;
  }

  handleProtocolError(message: string) {
    // Show error to user if window is available
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send('show-error-message', {
        title: 'Protocol Error',
        message: message,
      });
    }
  }

  // Method to handle pending invites after window creation
  processPendingInvite(mainWindow: BrowserWindowType) {
    if (this.pendingInvite && mainWindow) {
      log.info('Processing pending team workspace invite');
      mainWindow.webContents.send('process-team-workspace-invite', this.pendingInvite);
      this.pendingInvite = null;
    }

    if (this.pendingEnvironmentImport && mainWindow) {
      log.info('Processing pending environment config import');
      mainWindow.webContents.send('process-environment-config-import', this.pendingEnvironmentImport);
      this.pendingEnvironmentImport = null;
    }
  }

  // Process any pending invites - called when renderer is ready
  processPendingInvites() {
    const win = this.mainWindow;
    if (!win) return;

    // Show the window — protocol actions require user interaction
    if (this.pendingInvite || this.pendingEnvironmentImport) {
      this.showAndFocusWindow(win);
    }

    if (this.pendingInvite) {
      log.info('Processing pending team workspace invite from setRendererReady');
      const invite = this.pendingInvite;
      if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', () => {
          win.webContents.send('process-team-workspace-invite', invite);
        });
      } else {
        win.webContents.send('process-team-workspace-invite', invite);
      }
      this.pendingInvite = null;
    }

    if (this.pendingEnvironmentImport) {
      log.info('Processing pending environment config import from setRendererReady');
      const envImport = this.pendingEnvironmentImport;
      if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', () => {
          win.webContents.send('process-environment-config-import', envImport);
        });
      } else {
        win.webContents.send('process-environment-config-import', envImport);
      }
      this.pendingEnvironmentImport = null;
    }
  }

  setupProtocolHandlers() {
    // macOS protocol URL handling
    app.on('open-url', (event: Electron.Event, url: string) => {
      event.preventDefault();
      log.info('Received protocol URL on macOS:', url);

      // Bring application to foreground
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        const window = windows[0];
        this.showAndFocusWindow(window);
        // Respect user's dock visibility setting — dock API is macOS-only
        if (app.dock && this.shouldShowDock()) {
          app.dock.show().catch((error: unknown) => {
            log.debug('Error showing dock:', errorMessage(error));
          });
        }
      }

      this.handleProtocolUrl(url);
    });

    // Prevent multiple instances and handle protocol URLs from new instances
    app.on('second-instance', (_event: Electron.Event, commandLine: string[], workingDirectory: string) => {
      log.info('Second instance detected with args:', commandLine);
      log.info('Working directory:', workingDirectory);

      // Focus existing window instead of creating new instance
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        const window = windows[0];
        this.showAndFocusWindow(window);

        // Extract and handle any protocol URLs from command line
        let protocolUrl: string | null = null;
        for (const arg of commandLine) {
          if (arg.startsWith('openheaders://')) {
            protocolUrl = arg;
            break;
          }
          // Sometimes Windows passes the URL without the protocol prefix
          if (arg.includes('open?')) {
            // Try to reconstruct the URL
            if (!arg.startsWith('openheaders://')) {
              protocolUrl = `openheaders://${arg}`;
            } else {
              protocolUrl = arg;
            }
            break;
          }
        }

        if (protocolUrl) {
          log.info('Extracted protocol URL from command line:', protocolUrl);

          // Validate the URL before processing
          const validation = this.validateProtocolUrl(protocolUrl);
          if (!validation.valid) {
            log.error('Invalid protocol URL extracted from command line:', validation.error);
            this.handleProtocolError(validation.error!);
            return;
          }

          // Add a small delay to ensure the window is ready
          setTimeout(() => {
            this.handleProtocolUrl(protocolUrl!);
          }, 500);
        } else {
          log.warn('No protocol URL found in command line arguments');
          log.debug('Command line arguments:', commandLine);
        }
      }
    });
  }
}

const protocolHandler = new ProtocolHandler();

export { ProtocolHandler };
export default protocolHandler;
