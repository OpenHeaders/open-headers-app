import electron from 'electron';
import path from 'path';
import fs from 'fs';
import mainLogger from '../../utils/mainLogger';
import atomicWriter from '../../utils/atomicFileWriter';
import {
  countNonEmptyEnvValues,
  readFileWithAtomicWriter,
  createBackupIfNeeded,
  cleanupOldBackups,
  validateEnvironmentWrite,
  ENV_FILE_READ_MAX_RETRIES
} from './git/utils/EnvironmentSyncUtils';

const { createLogger } = mainLogger;
const log = createLogger('WorkspaceSyncScheduler');

import { DATA_FORMAT_VERSION } from '../../config/version';
import type { Source } from '../../types/source';
import type { Workspace, WorkspaceAuthData, WorkspaceSyncStatus, CommitInfo } from '../../types/workspace';
import type { RulesCollection } from '../../types/rules';
import type { ProxyRule } from '../../types/proxy';
import type { EnvironmentMap, EnvironmentSchema, EnvironmentsFile } from '../../types/environment';
import type { RulesStorage } from '../../types/rules';
import webSocketService from '../websocket/ws-service';
import proxyService from '../proxy/ProxyService';

// Constants
const DEFAULT_SYNC_INTERVAL = 60 * 60 * 1000; // 1 hour
const DEFAULT_GIT_BRANCH = 'main';
const DEFAULT_CONFIG_PATH = 'config/open-headers.json';
const DEFAULT_AUTH_TYPE = 'none';
const SHUTDOWN_TIMEOUT = 30000; // 30 seconds
const SHUTDOWN_POLL_INTERVAL = 500; // 0.5 seconds
const MAX_OFFLINE_DURATION = 30 * 60 * 1000; // 30 minutes before forcing retry
const GIT_CONNECTIVITY_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const RESUME_SYNC_DELAY = 5000; // 5 seconds delay after network recovery to let system stabilize

interface NetworkState {
  isOnline: boolean;
}

interface NetworkService {
  on(event: string, handler: (event: NetworkStateChange) => void): void;
  getState(): NetworkState;
}

interface NetworkStateChange {
  newState: NetworkState;
  oldState: NetworkState;
}

interface SyncConfig {
  workspaceId: string;
  workspaceName: string;
  url: string | undefined;
  branch: string;
  path: string;
  authType: string;
  authData: WorkspaceAuthData;
}

interface SyncResult {
  success: boolean;
  error?: string;
  data?: SyncData;
  commitHash?: string;
  commitInfo?: CommitInfo;
}

interface SyncData {
  sources?: Source[];
  rules?: RulesCollection;
  proxyRules?: ProxyRule[];
  environments?: EnvironmentMap;
  environmentSchema?: EnvironmentSchema;
}

interface GitSyncService {
  getGitStatus(): Promise<{ isInstalled: boolean; version?: string; error?: string }>;
  syncWorkspace(config: SyncConfig): Promise<SyncResult>;
  testConnection(config: { url?: string; branch?: string; authType?: string; authData?: WorkspaceAuthData }): Promise<{ success: boolean; error?: string }>;
}

interface WorkspaceSettingsService {
  getWorkspaces(): Promise<Workspace[]>;
  updateWorkspace(workspaceId: string, workspace: Partial<Workspace>): Promise<Workspace>;
  updateSyncStatus(workspaceId: string, status: WorkspaceSyncStatus): Promise<void>;
}

interface SyncStatus {
  scheduled: boolean;
  syncing: boolean;
  lastSync: number | null;
}

interface SchedulerOptions {
  broadcaster?: BroadcasterFn | null;
}

/** Union of all data shapes broadcast to renderer windows. */
interface WorkspaceBroadcastBase {
  workspaceId: string;
  timestamp?: number;
}

interface SyncCompletedBroadcast extends WorkspaceBroadcastBase {
  success: boolean;
  error?: string;
  commitInfo?: CommitInfo;
  hasChanges?: boolean;
}

interface SyncStatusBroadcast extends WorkspaceBroadcastBase {
  syncing: boolean;
  hasChanges: boolean;
}

interface SyncWarningBroadcast extends WorkspaceBroadcastBase {
  warning: string;
}

interface DataUpdatedBroadcast extends WorkspaceBroadcastBase {
  hasChanges: boolean;
}

/** Simple notification with just workspaceId + timestamp (e.g. environments-structure-changed). */
interface WorkspaceNotificationBroadcast extends WorkspaceBroadcastBase {
  timestamp: number;
}

type WorkspaceBroadcastData =
  | SyncCompletedBroadcast
  | SyncStatusBroadcast
  | SyncWarningBroadcast
  | DataUpdatedBroadcast
  | WorkspaceNotificationBroadcast;

type BroadcasterFn = (channel: string, data: WorkspaceBroadcastData) => void;

/**
 * Helper to broadcast message to all renderer windows
 * Can be injected for testing or different environments
 */
function broadcastToRenderers(channel: string, data: WorkspaceBroadcastData, broadcaster: BroadcasterFn | null = null): void {
  if (broadcaster) {
    broadcaster(channel, data);
    return;
  }

  // Default Electron implementation
  const { BrowserWindow } = electron;
  BrowserWindow.getAllWindows().forEach((window) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, data);
    }
  });
}

/**
 * WorkspaceSyncScheduler - Manages automatic syncing of Git-based workspaces
 *
 * Features:
 * - Automatically syncs Git workspaces at configurable intervals (default: 1 hour)
 * - Respects autoSync setting per workspace
 * - Handles workspace switching
 * - Network-aware (pauses during offline state)
 * - Prevents concurrent syncs
 */
class WorkspaceSyncScheduler {
  private gitSyncService: GitSyncService;
  private workspaceSettingsService: WorkspaceSettingsService;
  private networkService: NetworkService;
  private broadcaster: BroadcasterFn | null;

  // State
  private syncTimers: Map<string, ReturnType<typeof setInterval>>;
  private syncInProgress: Map<string, boolean>;
  private lastSyncTime: Map<string, number>;
  private syncInterval: number;

  // Current active workspace
  private activeWorkspaceId: string | null;
  private activeWorkspace: Workspace | null;

  // Network offline tracking
  private networkOfflineTime: number | null;
  private lastGitConnectivityCheck: Map<string, number>;
  private gitConnectivityCache: Map<string, boolean>;

  constructor(
    gitSyncService: GitSyncService,
    workspaceSettingsService: WorkspaceSettingsService,
    networkService: NetworkService,
    options: SchedulerOptions = {}
  ) {
    this.gitSyncService = gitSyncService;
    this.workspaceSettingsService = workspaceSettingsService;
    this.networkService = networkService;
    this.broadcaster = options.broadcaster ?? null;

    // State
    this.syncTimers = new Map();
    this.syncInProgress = new Map();
    this.lastSyncTime = new Map();
    this.syncInterval = DEFAULT_SYNC_INTERVAL;

    // Current active workspace
    this.activeWorkspaceId = null;
    this.activeWorkspace = null;

    // Network offline tracking
    this.networkOfflineTime = null;
    this.lastGitConnectivityCheck = new Map();
    this.gitConnectivityCache = new Map();

    log.info('WorkspaceSyncScheduler initialized');
  }

  /**
   * Initialize the scheduler
   */
  async initialize(): Promise<void> {
    // Listen for network state changes
    this.networkService.on('stateChanged', (event: NetworkStateChange) => {
      if (!event.newState.isOnline && event.oldState.isOnline) {
        log.info('Network went offline, recording offline time');
        this.networkOfflineTime = Date.now();
        // Don't pause syncs immediately - let them fail naturally
      } else if (event.newState.isOnline && !event.oldState.isOnline) {
        log.info('Network restored, resuming sync schedules');
        this.networkOfflineTime = null;
        this.resumeAllSyncs();
      }
    });
  }

  /**
   * Handle workspace update (e.g., autoSync toggled)
   */
  async onWorkspaceUpdated(workspaceId: string, workspace: Workspace): Promise<void> {
    log.info(`Workspace ${workspaceId} updated, autoSync: ${workspace.autoSync}`);

    // Update workspace in settings service to keep it in sync
    try {
      await this.workspaceSettingsService.updateWorkspace(workspaceId, workspace);
    } catch (error) {
      log.error('Failed to update workspace in settings service:', error);
    }

    // If this is the active workspace, handle auto-sync changes
    if (this.activeWorkspaceId === workspaceId) {
      // Stop existing sync
      this.stopSync(workspaceId);

      // Update workspace reference
      this.activeWorkspace = workspace;

      // Restart sync if autoSync is enabled
      if ((workspace.type === 'git' || workspace.type === 'team') && workspace.autoSync !== false) {
        log.info(`Restarting auto-sync for workspace ${workspaceId}`);
        this.startSync(workspaceId, workspace);
      } else {
        log.info(`Auto-sync disabled for workspace ${workspaceId}`);
      }
    }
  }

  /**
   * Handle workspace switch
   */
  async onWorkspaceSwitch(workspaceId: string): Promise<void> {
    log.info(`Workspace switched to: ${workspaceId}`);

    // Stop sync for previous workspace
    if (this.activeWorkspaceId) {
      this.stopSync(this.activeWorkspaceId);
    }

    // Load new workspace configuration
    try {
      const workspaces = await this.workspaceSettingsService.getWorkspaces();
      const workspace = workspaces.find(w => w.id === workspaceId);

      if (!workspace) {
        log.warn(`Workspace ${workspaceId} not found`);
        return;
      }

      this.activeWorkspaceId = workspaceId;
      this.activeWorkspace = workspace;

      // Start sync if it's a Git workspace with autoSync enabled
      if ((workspace.type === 'git' || workspace.type === 'team') && workspace.autoSync !== false) {
        this.startSync(workspaceId, workspace);
      } else {
        log.info(`Workspace ${workspaceId} is not a Git workspace or has autoSync disabled`);
      }
    } catch (error) {
      log.error('Error handling workspace switch:', error);
    }
  }

  /**
   * Start automatic sync for a workspace
   */
  startSync(workspaceId: string, workspace: Workspace): void {
    // Check if already syncing
    if (this.syncTimers.has(workspaceId)) {
      log.debug(`Sync already scheduled for workspace ${workspaceId}`);
      return;
    }

    // Check network state
    if (!this.networkService.getState().isOnline) {
      log.info(`Network is offline, deferring sync schedule for workspace ${workspaceId}`);
      return;
    }

    log.info(`Starting auto-sync for workspace ${workspaceId} (${workspace.name})`);

    // Perform initial sync
    this.performSync(workspaceId, workspace).catch(error => {
      log.error(`Initial sync failed for workspace ${workspaceId}:`, error);
    });

    // Schedule periodic syncs
    const timerId = setInterval(() => {
      this.performSync(workspaceId, workspace).catch(error => {
        log.error(`Periodic sync failed for workspace ${workspaceId}:`, error);
      });
    }, this.syncInterval);

    this.syncTimers.set(workspaceId, timerId);
  }

  /**
   * Stop automatic sync for a workspace
   */
  stopSync(workspaceId: string): void {
    const timerId = this.syncTimers.get(workspaceId);
    if (timerId) {
      clearInterval(timerId);
      this.syncTimers.delete(workspaceId);
      log.info(`Stopped auto-sync for workspace ${workspaceId}`);
    }
  }

  /**
   * Perform sync for a workspace
   */
  async performSync(workspaceId: string, workspace: Workspace): Promise<void> {
    // Check if sync is already in progress
    if (this.syncInProgress.get(workspaceId)) {
      log.debug(`Sync already in progress for workspace ${workspaceId}, skipping`);
      return;
    }

    const now = Date.now();
    const networkState = this.networkService.getState();

    // Check if we should force retry despite offline state
    let shouldForceRetry = false;
    if (!networkState.isOnline && this.networkOfflineTime) {
      const offlineDuration = now - this.networkOfflineTime;
      if (offlineDuration > MAX_OFFLINE_DURATION) {
        log.info(`Network offline for ${Math.round(offlineDuration / 1000 / 60)}min, attempting Git connectivity check`);

        // Check if we can actually reach the Git server
        const gitReachable = await this.checkGitConnectivity(workspaceId, workspace);
        if (gitReachable) {
          log.info(`Git server is reachable despite network offline state, forcing sync`);
          shouldForceRetry = true;
        } else {
          log.debug(`Git server not reachable, skipping sync for workspace ${workspaceId}`);
          return;
        }
      } else {
        log.debug(`Network offline for ${Math.round(offlineDuration / 1000)}s, waiting before retry`);
        return;
      }
    }

    // Skip network check if forcing retry
    if (!shouldForceRetry && !networkState.isOnline) {
      log.debug(`Network is offline, skipping sync for workspace ${workspaceId}`);
      return;
    }

    // Check if Git is available
    const gitStatus = await this.gitSyncService.getGitStatus();
    if (!gitStatus.isInstalled) {
      log.warn('Git is not installed, skipping sync');
      return;
    }

    log.info(`Starting sync for workspace ${workspaceId} (${workspace.name})`);
    this.syncInProgress.set(workspaceId, true);

    try {
      const startTime = Date.now();

      // Prepare sync configuration
      const syncConfig: SyncConfig = {
        workspaceId: workspaceId,
        workspaceName: workspace.name,
        url: workspace.gitUrl,
        branch: workspace.gitBranch || DEFAULT_GIT_BRANCH,
        path: workspace.gitPath || DEFAULT_CONFIG_PATH,
        authType: workspace.authType || DEFAULT_AUTH_TYPE,
        authData: workspace.authData ?? {}
      };

      // Perform the sync
      const result = await this.gitSyncService.syncWorkspace(syncConfig);

      if (result.success) {
        const duration = Date.now() - startTime;
        this.lastSyncTime.set(workspaceId, Date.now());

        log.info(`Successfully synced workspace ${workspaceId} in ${duration}ms`);

        // Import the synced configuration data
        let hasChanges = false;
        if (result.data) {
          log.info(`Sync result contains data:`, {
            hasData: !!result.data,
            dataKeys: result.data ? Object.keys(result.data) : [],
            hasSources: result.data ? !!result.data.sources : false,
            sourceCount: result.data && result.data.sources ? result.data.sources.length : 0
          });

          // Check if anything actually changed by comparing with existing data
          hasChanges = await this.checkForDataChanges(workspaceId, result.data);

          // Import data in the main process for background operation.
          // Only broadcast to browser extensions when data actually changed --
          // avoids redundant WS messages on every periodic sync.
          await this.importSyncedData(workspaceId, result.data, { broadcastToExtensions: hasChanges });

          // Only notify renderer if there were actual changes
          if (hasChanges) {
            // Also notify renderer if available for UI updates
            broadcastToRenderers('workspace-data-updated', {
              workspaceId,
              timestamp: Date.now(),
              hasChanges: true
            }, this.broadcaster);
          } else {
            log.info(`No changes detected for workspace ${workspaceId}, skipping UI refresh`);
            // Still notify that sync completed but without changes
            broadcastToRenderers('workspace-sync-status', {
              workspaceId,
              syncing: false,
              hasChanges: false
            }, this.broadcaster);
          }
        } else {
          log.warn(`Sync succeeded but no data was returned for workspace ${workspaceId}`);
        }

        // Emit sync success event
        broadcastToRenderers('workspace-sync-completed', {
          workspaceId,
          success: true,
          timestamp: Date.now(),
          commitInfo: result.commitInfo,
          hasChanges: hasChanges
        }, this.broadcaster);

        // Update sync status only if there were changes or it's the first sync
        const shouldUpdateStatus = hasChanges || !this.lastSyncTime.has(workspaceId);
        if (shouldUpdateStatus) {
          await this.updateSyncStatus(workspaceId, {
            syncing: false,
            lastSync: new Date().toISOString(),
            error: null,
            lastCommit: result.commitHash,
            commitInfo: result.commitInfo
          });
        } else {
          // Just update syncing status without changing lastSync time
          await this.updateSyncStatus(workspaceId, {
            syncing: false,
            error: null
          });
        }
      } else {
        // Handle sync failure
        const error = new Error(result.error || 'Sync failed');
        await this.handleSyncError(workspaceId, error);
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.handleSyncError(workspaceId, err);
    } finally {
      this.syncInProgress.set(workspaceId, false);
    }
  }

  /**
   * Handle sync error with consistent error reporting
   */
  async handleSyncError(workspaceId: string, error: Error): Promise<void> {
    log.error(`Failed to sync workspace ${workspaceId}:`, error);

    // Emit sync error event
    broadcastToRenderers('workspace-sync-completed', {
      workspaceId,
      success: false,
      error: error.message,
      timestamp: Date.now()
    }, this.broadcaster);

    // Update sync status with error
    await this.updateSyncStatus(workspaceId, {
      syncing: false,
      error: error.message
    });
  }

  /**
   * Check if we can connect to a specific Git repository
   */
  async checkGitConnectivity(workspaceId: string, workspace: Workspace): Promise<boolean> {
    const now = Date.now();
    const lastCheck = this.lastGitConnectivityCheck.get(workspaceId) ?? 0;

    // Use cached result if checked recently
    if (now - lastCheck < GIT_CONNECTIVITY_CHECK_INTERVAL) {
      const cached = this.gitConnectivityCache.get(workspaceId);
      if (cached !== undefined) {
        log.debug(`Using cached Git connectivity result for ${workspaceId}: ${cached}`);
        return cached;
      }
    }

    try {
      log.info(`Checking Git connectivity for workspace ${workspaceId} to ${workspace.gitUrl}`);

      const config = {
        url: workspace.gitUrl,
        branch: workspace.gitBranch || DEFAULT_GIT_BRANCH,
        authType: workspace.authType || DEFAULT_AUTH_TYPE,
        authData: workspace.authData ?? {}
      };

      // Use a shorter timeout for connectivity check
      const result = await Promise.race([
        this.gitSyncService.testConnection(config),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Git connectivity check timeout')), 15000)
        )
      ]);

      const isReachable = result.success === true;

      // Cache the result
      this.lastGitConnectivityCheck.set(workspaceId, now);
      this.gitConnectivityCache.set(workspaceId, isReachable);

      log.info(`Git connectivity check for ${workspaceId}: ${isReachable ? 'SUCCESS' : 'FAILED'}`);
      return isReachable;

    } catch (error) {
      log.error(`Git connectivity check failed for ${workspaceId}:`, error);

      // Cache the negative result
      this.lastGitConnectivityCheck.set(workspaceId, now);
      this.gitConnectivityCache.set(workspaceId, false);

      return false;
    }
  }

  /**
   * Check if synced data has any changes compared to existing data
   */
  async checkForDataChanges(workspaceId: string, newData: SyncData): Promise<boolean> {
    try {
      const { app } = electron;
      const fsPromises = fs.promises;
      const userDataPath = app.getPath('userData');
      const workspacePath = path.join(userDataPath, 'workspaces', workspaceId);

      // Check sources changes
      if (newData.sources) {
        try {
          const sourcesPath = path.join(workspacePath, 'sources.json');
          const existingData = await fsPromises.readFile(sourcesPath, 'utf8');
          const existingSources: Source[] = JSON.parse(existingData);

          // Compare sources (ignore dynamic fields like sourceContent, originalResponse, refresh timings, etc.)
          const normalizeSource = (source: Source) => ({
            sourceType: source.sourceType,
            sourcePath: source.sourcePath,
            sourceMethod: source.sourceMethod,
            sourceTag: source.sourceTag,
            requestOptions: source.requestOptions,
            jsonFilter: source.jsonFilter,
            refreshOptions: source.refreshOptions ? {
              enabled: source.refreshOptions.enabled,
              type: source.refreshOptions.type,
              interval: source.refreshOptions.interval
              // Exclude lastRefresh, nextRefresh as these are local execution state
            } : undefined,
            // Only include sourceId if it exists in both (for matching)
            sourceId: source.sourceId
          });

          const normalizedExisting = existingSources.map(normalizeSource);
          const normalizedNew = newData.sources.map(normalizeSource);

          if (JSON.stringify(normalizedExisting) !== JSON.stringify(normalizedNew)) {
            log.info('Sources have changed');
            return true;
          }
        } catch (error) {
          // File doesn't exist or error reading, consider it a change
          return true;
        }
      }

      // Check rules changes
      if (newData.rules) {
        try {
          const rulesPath = path.join(workspacePath, 'rules.json');
          const existingData = await fsPromises.readFile(rulesPath, 'utf8');
          const existingRules: Partial<RulesStorage> = JSON.parse(existingData);

          if (JSON.stringify(existingRules.rules) !== JSON.stringify(newData.rules)) {
            log.info('Rules have changed');
            return true;
          }
        } catch (error) {
          return true;
        }
      }

      // Check proxy rules changes
      if (newData.proxyRules) {
        try {
          const proxyPath = path.join(workspacePath, 'proxy-rules.json');
          const existingData = await fsPromises.readFile(proxyPath, 'utf8');
          const existingProxy: ProxyRule[] = JSON.parse(existingData);

          if (JSON.stringify(existingProxy) !== JSON.stringify(newData.proxyRules)) {
            log.info('Proxy rules have changed');
            return true;
          }
        } catch (error) {
          return true;
        }
      }

      // Check environment schema changes (structure only, not values)
      if (newData.environments || newData.environmentSchema) {
        try {
          const envPath = path.join(workspacePath, 'environments.json');
          const existingData = await fsPromises.readFile(envPath, 'utf8');
          const existingEnv: Partial<EnvironmentsFile> = JSON.parse(existingData);

          // Extract environment names and variable names (not values)
          const getEnvStructure = (envData: EnvironmentMap): Record<string, string[]> => {
            const structure: Record<string, string[]> = {};
            for (const [envName, vars] of Object.entries(envData)) {
              structure[envName] = Object.keys(vars).sort();
            }
            return structure;
          };

          const existingStructure = getEnvStructure(existingEnv.environments ?? {});

          let newStructure: Record<string, string[]> | undefined;
          if (newData.environments) {
            newStructure = getEnvStructure(newData.environments);
          } else if (newData.environmentSchema?.environments) {
            // Convert schema to structure
            newStructure = {};
            for (const [envName, envSchema] of Object.entries(newData.environmentSchema.environments)) {
              const varNames: string[] = [];
              if (envSchema.variables && Array.isArray(envSchema.variables)) {
                for (const varDef of envSchema.variables) {
                  if (varDef.name) {
                    varNames.push(varDef.name);
                  }
                }
              }
              newStructure[envName] = varNames.sort();
            }
          }

          if (JSON.stringify(existingStructure) !== JSON.stringify(newStructure)) {
            log.info('Environment structure has changed');
            return true;
          }
        } catch (error) {
          return true;
        }
      }

      // No changes detected
      return false;

    } catch (error) {
      log.error('Error checking for data changes:', error);
      // On error, assume there are changes to be safe
      return true;
    }
  }

  /**
   * Import synced configuration data into workspace
   * This runs in the main process to support background syncing
   */
  async importSyncedData(workspaceId: string, data: SyncData, options: { broadcastToExtensions?: boolean } = {}): Promise<void> {
    const { broadcastToExtensions = true } = options;
    try {
      const { app } = electron;
      const fsPromises = fs.promises;
      const userDataPath = app.getPath('userData');
      const workspacePath = path.join(userDataPath, 'workspaces', workspaceId);

      // Ensure workspace directory exists
      await fsPromises.mkdir(workspacePath, { recursive: true });

      // Track merged sources so the WebSocket broadcast (below) uses
      // sources WITH local execution data (sourceContent, etc.) instead of
      // the raw Git config sources which lack it.
      let mergedSources: Source[] | null = null;

      // Import sources - merge with existing to preserve local execution data
      if (data.sources && Array.isArray(data.sources)) {
        const sourcesPath = path.join(workspacePath, 'sources.json');

        // Load existing sources to preserve local execution data
        let existingSources: Source[] = [];
        try {
          const existingData = await fsPromises.readFile(sourcesPath, 'utf8');
          existingSources = JSON.parse(existingData);
        } catch (error) {
          // No existing sources, that's fine
        }

        // Create a map of existing sources by ID for quick lookup
        const existingSourcesMap = new Map<string, Source>();
        for (const source of existingSources) {
          if (source.sourceId) {
            existingSourcesMap.set(source.sourceId, source);
          }
        }

        // Merge sources - use remote config but preserve local execution data
        mergedSources = data.sources.map((remoteSource): Source => {
          const existingSource = existingSourcesMap.get(remoteSource.sourceId);

          if (existingSource) {
            // Preserve local execution data
            return {
              ...remoteSource,
              // Preserve local execution state
              sourceContent: existingSource.sourceContent ?? '',
              originalResponse: existingSource.originalResponse ?? '{}',
              isFiltered: existingSource.isFiltered,
              filteredWith: existingSource.filteredWith,
              activationState: existingSource.activationState ?? remoteSource.activationState,
              missingDependencies: existingSource.missingDependencies ?? [],
              // Preserve refresh timing but take enabled/interval from remote
              refreshOptions: remoteSource.refreshOptions
                ? {
                    ...remoteSource.refreshOptions,
                    lastRefresh: existingSource.refreshOptions?.lastRefresh ?? null,
                    nextRefresh: existingSource.refreshOptions?.nextRefresh ?? null
                  }
                : existingSource.refreshOptions,
              // Preserve other local metadata
              createdAt: existingSource.createdAt ?? remoteSource.createdAt,
              updatedAt: existingSource.updatedAt ?? remoteSource.updatedAt
            };
          }

          // New source from remote
          return remoteSource;
        });

        await atomicWriter.writeJson(sourcesPath, mergedSources, { pretty: true });
        log.info(`Imported ${data.sources.length} sources for workspace ${workspaceId} (preserved local execution data)`);
      }

      // Import rules with proper structure
      if (data.rules) {
        const rulesStorage = {
          version: DATA_FORMAT_VERSION,
          rules: data.rules,
          metadata: {
            lastUpdated: new Date().toISOString(),
            totalRules: (data.rules.header?.length ?? 0) + (data.rules.request?.length ?? 0) + (data.rules.response?.length ?? 0)
          }
        };

        const rulesPath = path.join(workspacePath, 'rules.json');
        await atomicWriter.writeJson(rulesPath, rulesStorage, { pretty: true });
        log.info(`Imported ${rulesStorage.metadata.totalRules} rules for workspace ${workspaceId}`);
      }

      // Import proxy rules
      if (data.proxyRules && Array.isArray(data.proxyRules)) {
        const proxyPath = path.join(workspacePath, 'proxy-rules.json');
        await atomicWriter.writeJson(proxyPath, data.proxyRules, { pretty: true });
        log.info(`Imported ${data.proxyRules.length} proxy rules for workspace ${workspaceId}`);
      }

      // Import environments - handle both formats properly
      let environmentsToImport: EnvironmentMap | null = null;

      // Load existing environments using atomicWriter for proper coordination with any concurrent writes
      // CRITICAL: We must distinguish between "file doesn't exist" (OK) and "file read failed" (ABORT)
      let existingEnvironments: EnvironmentMap = {};
      let existingActiveEnvironment: string | null = null;
      let existingEnvFileExists: boolean | undefined;
      let existingEnvLoadFailed = false;
      let existingEnvValueCount = 0;

      const envPath = path.join(workspacePath, 'environments.json');

      try {
        // Use atomicWriter.readFile() via our retry wrapper for:
        // - Coordination with write queue (waits for any active writes to complete)
        // - File locking to prevent read during write
        // - Retry logic for transient errors (EBUSY, EIO, EAGAIN, etc.)
        const readResult = await readFileWithAtomicWriter(envPath);

        existingEnvFileExists = readResult.exists;

        if (readResult.exists && readResult.content) {
          // File exists and was read successfully - parse it
          const parsed: Partial<EnvironmentsFile> = JSON.parse(readResult.content);

          if (parsed.environments) {
            existingEnvironments = parsed.environments;
            existingEnvValueCount = countNonEmptyEnvValues(existingEnvironments);
          }

          // IMPORTANT: Preserve the active environment selection
          if (parsed.activeEnvironment) {
            existingActiveEnvironment = parsed.activeEnvironment;
          }

          log.info(`Loaded existing environments for workspace ${workspaceId} via atomicWriter:`, {
            environmentCount: Object.keys(existingEnvironments).length,
            variablesWithValues: existingEnvValueCount,
            activeEnvironment: existingActiveEnvironment
          });
        } else {
          // File doesn't exist - this is OK for new workspaces
          log.info(`No existing environments file for workspace ${workspaceId}, will create new one`);
        }

      } catch (readError: unknown) {
        // CRITICAL: Failed to read file after retries (file exists but can't be read)
        // This could be a transient error - we should NOT proceed and risk losing data
        existingEnvLoadFailed = true;
        existingEnvFileExists = true; // Assume file exists if we got an error (not ENOENT)
        const readErrMsg = readError instanceof Error ? readError.message : String(readError);
        log.error(`CRITICAL: Failed to read existing environments for workspace ${workspaceId} after ${ENV_FILE_READ_MAX_RETRIES} retries:`, readError);
        log.error(`Aborting environment import to prevent potential data loss. Error: ${readErrMsg}`);
      }

      // If we failed to load existing environments, skip environment import entirely
      if (existingEnvLoadFailed) {
        log.warn(`Skipping environment import for workspace ${workspaceId} - existing file could not be read`);
        // Broadcast warning to UI
        broadcastToRenderers('workspace-sync-warning', {
          workspaceId,
          warning: 'Environment sync skipped due to file read error. Your local environment values are preserved.',
          timestamp: Date.now()
        }, this.broadcaster);
        // Continue with other imports (sources, rules, proxy) but skip environments
        // Don't set environmentsToImport, so the write block will be skipped
      }

      // Only proceed with environment import if we either:
      // 1. Successfully loaded existing environments, OR
      // 2. The file doesn't exist (new workspace)
      if (!existingEnvLoadFailed) {
        // Check for environments in different formats
        if (data.environments && typeof data.environments === 'object' && !data.environmentSchema) {
          // Direct environments object with actual values - merge with existing
          environmentsToImport = { ...existingEnvironments };

          // Override with values from Git (this allows sharing some values while keeping others local)
          for (const [envName, envVars] of Object.entries(data.environments)) {
            if (!environmentsToImport[envName]) {
              environmentsToImport[envName] = {};
            }

            // Merge variables, with Git values taking precedence ONLY if they have non-empty values
            for (const [varName, varData] of Object.entries(envVars)) {
              const existingVar = environmentsToImport[envName][varName];

              if (varData.value) {
                // Git has a non-empty value, use it
                environmentsToImport[envName][varName] = varData;
              } else if (!existingVar) {
                // Variable doesn't exist locally, create it with empty value
                environmentsToImport[envName][varName] = { value: '', isSecret: varData.isSecret };
              }
              // Otherwise, preserve existing local value (DO NOTHING)
            }
          }
        } else if (data.environmentSchema && data.environmentSchema.environments) {
          // Environment schema format - NEVER overwrite existing values with empty ones

          // Start with existing environments to preserve local values
          environmentsToImport = { ...existingEnvironments };

          // Process schema to update environment structure
          for (const [envName, envSchema] of Object.entries(data.environmentSchema.environments)) {
            // Ensure environment exists
            if (!environmentsToImport[envName]) {
              environmentsToImport[envName] = {};
            }

            // Process variables from schema
            if (envSchema.variables && Array.isArray(envSchema.variables)) {
              for (const varDef of envSchema.variables) {
                if (varDef.name) {
                  // Check if variable already exists locally
                  if (!environmentsToImport[envName][varDef.name]) {
                    // Variable doesn't exist locally, create it with empty value
                    environmentsToImport[envName][varDef.name] = {
                      value: '',
                      isSecret: varDef.isSecret ?? false
                    };
                  } else {
                    // Variable exists locally - ALWAYS preserve its value
                    // Only update isSecret flag from schema if needed
                    const existingVar = environmentsToImport[envName][varDef.name];

                    if (existingVar.value) {
                      log.debug(`Preserving existing value for ${envName}.${varDef.name} during Git sync`);
                    }

                    environmentsToImport[envName][varDef.name] = {
                      value: existingVar.value,
                      isSecret: varDef.isSecret !== undefined ? varDef.isSecret : existingVar.isSecret
                    };
                  }
                }
              }
            }
          }

          // Now check if the same data object also contains environments with actual values
          // (this is the case when env file has both schema AND values)
          if (data.environments) {
            // We have actual values from Git, but ONLY use non-empty ones
            for (const [envName, envVars] of Object.entries(data.environments)) {
              if (!environmentsToImport[envName]) {
                // New environment with values, add it
                environmentsToImport[envName] = envVars;
              } else {
                // Environment exists, merge variables CAREFULLY
                for (const [varName, varData] of Object.entries(envVars)) {
                  if (varData.value) {
                    // Git has a non-empty value, use it
                    environmentsToImport[envName][varName] = varData;
                  } else if (!environmentsToImport[envName][varName]) {
                    // Variable doesn't exist locally, add it with empty value
                    environmentsToImport[envName][varName] = { value: '', isSecret: varData.isSecret };
                  }
                  // If Git value is empty and local value exists, preserve local value (do nothing)
                }
              }
            }
          }
        }
      } // End of if (!existingEnvLoadFailed)

      if (environmentsToImport) {
        // VALIDATION: Check if we're about to lose data
        const newValueCount = countNonEmptyEnvValues(environmentsToImport);
        const validation = validateEnvironmentWrite(existingEnvValueCount, newValueCount);

        // Log potential data loss
        if (!validation.safe || validation.shouldBackup) {
          log.warn(`Potential data loss detected for workspace ${workspaceId}:`, {
            existingValues: existingEnvValueCount,
            newValues: newValueCount,
            lossPercentage: `${validation.lossPercentage}%`,
            shouldBackup: validation.shouldBackup,
            shouldBlock: validation.shouldBlock
          });
        }

        // Create backup if significant data loss detected
        if (validation.shouldBackup && existingEnvFileExists) {
          log.warn(`Creating backup before potentially destructive environment sync (${validation.lossPercentage}% value loss)`);
          await createBackupIfNeeded(fs.promises, envPath);
        }

        // Block write if it would result in complete data loss
        if (validation.shouldBlock) {
          log.error(`BLOCKED: Refusing to write environments with 0 values when existing file had ${existingEnvValueCount} values`);
          log.error(`This appears to be a data corruption scenario. Skipping environment write for workspace ${workspaceId}`);
          broadcastToRenderers('workspace-sync-warning', {
            workspaceId,
            warning: 'Environment sync blocked: Would have deleted all values. Your local data is preserved.',
            timestamp: Date.now()
          }, this.broadcaster);
          // Skip the write
        } else {
          // Safe to proceed with write
          // Create the proper environments.json structure
          const environmentsData = {
            environments: environmentsToImport,
            // CRITICAL: Preserve the user's active environment selection!
            // Only use first environment if there's no existing selection
            activeEnvironment: existingActiveEnvironment || Object.keys(environmentsToImport)[0] || 'Default'
          };

          await atomicWriter.writeJson(envPath, environmentsData, { pretty: true });

          // Cleanup old backups (keep only 3 most recent)
          await cleanupOldBackups(fs.promises, workspacePath, path, 3);

          const envCount = Object.keys(environmentsToImport).length;
          let varCount = 0;
          for (const env of Object.values(environmentsToImport)) {
            varCount += Object.keys(env).length;
          }

          log.info(`Imported ${envCount} environment(s) with ${varCount} variables for workspace ${workspaceId}`);

          // Log details about what was preserved vs created
          let preservedCount = 0;
          let emptyCount = 0;
          for (const env of Object.values(environmentsToImport)) {
            for (const varData of Object.values(env)) {
              if (varData.value) {
                preservedCount++;
              } else {
                emptyCount++;
              }
            }
          }
          if (preservedCount > 0) {
            log.info(`Environment sync: ${preservedCount} variables with values preserved, ${emptyCount} empty variables`);
          }

          // If this is the active workspace, notify renderer to reload environments
          // This is important for initial sync after workspace creation
          broadcastToRenderers('environments-structure-changed', {
            workspaceId,
            timestamp: Date.now()
          }, this.broadcaster);
        } // End of else block (safe to write)
      } // End of if (environmentsToImport)

      // Notify WebSocket service to update browser extensions.
      // Skip when nothing changed to avoid redundant messages on every periodic sync.
      if (broadcastToExtensions) {
        // webSocketService is imported at module level
        if (webSocketService && webSocketService.updateSources) {
          // Update sources -- use mergedSources (which preserves local sourceContent)
          // instead of data.sources (raw Git config without execution data).
          if (mergedSources) {
            webSocketService.updateSources(mergedSources);
          }

          // Update rules
          if (data.rules) {
            webSocketService.updateSources({
              type: 'rules-update',
              data: {
                version: DATA_FORMAT_VERSION,
                rules: data.rules,
                metadata: {
                  totalRules: (data.rules.header?.length ?? 0) + (data.rules.request?.length ?? 0) + (data.rules.response?.length ?? 0),
                  lastUpdated: new Date().toISOString()
                }
              }
            });
          }
        }
      }

      // Reload proxy rules if they were imported
      if (data.proxyRules && Array.isArray(data.proxyRules) && data.proxyRules.length > 0) {
        // proxyService is imported at module level
        // Only reload if this is the current workspace
        if (proxyService.ruleStore && proxyService.ruleStore.currentWorkspaceId === workspaceId) {
          await proxyService.ruleStore.load();
          log.info(`Reloaded ${proxyService.ruleStore.getRules().length} proxy rules after sync for workspace ${workspaceId}`);
        }
      }

    } catch (error) {
      log.error(`Failed to import synced data for workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Update sync status in workspace settings
   */
  async updateSyncStatus(workspaceId: string, status: WorkspaceSyncStatus): Promise<void> {
    try {
      await this.workspaceSettingsService.updateSyncStatus(workspaceId, status);
    } catch (error) {
      log.error('Failed to update sync status:', error);
    }
  }

  /**
   * Resume all sync schedules (e.g., when network comes back online or system resumes from sleep)
   *
   * IMPORTANT: We add a delay before syncing to let the system stabilize after:
   * - Network recovery (WiFi reconnection, VPN reconnection)
   * - System resume from sleep/hibernate
   * - Network interface changes
   *
   * This prevents race conditions where file system or network might be in an
   * inconsistent state immediately after these events.
   */
  async resumeAllSyncs(): Promise<void> {
    // Clear offline time
    this.networkOfflineTime = null;

    // Clear Git connectivity cache to force fresh checks
    this.gitConnectivityCache.clear();
    this.lastGitConnectivityCheck.clear();

    // Only resume sync for the active workspace
    if (this.activeWorkspaceId && this.activeWorkspace) {
      if ((this.activeWorkspace.type === 'git' || this.activeWorkspace.type === 'team') && this.activeWorkspace.autoSync !== false) {
        log.info(`Scheduling sync for active workspace ${this.activeWorkspaceId} after ${RESUME_SYNC_DELAY}ms delay`);

        // Add a delay to let the system stabilize after network recovery/sleep resume
        // This is critical to prevent race conditions with file system operations
        setTimeout(async () => {
          try {
            // Double-check we're still online before syncing
            const networkState = this.networkService.getState();
            if (!networkState.isOnline) {
              log.info(`Network went offline again, skipping deferred sync for ${this.activeWorkspaceId}`);
              return;
            }

            // Verify the workspace is still active (user might have switched)
            if (!this.activeWorkspaceId || !this.activeWorkspace) {
              log.info(`No active workspace after delay, skipping deferred sync`);
              return;
            }

            log.info(`Performing deferred sync for workspace ${this.activeWorkspaceId} after network recovery`);
            await this.performSync(this.activeWorkspaceId, this.activeWorkspace);

          } catch (error) {
            log.error(`Failed to sync workspace ${this.activeWorkspaceId} after network recovery:`, error);
          }
        }, RESUME_SYNC_DELAY);
      }
    }
  }

  /**
   * Manually trigger sync for a workspace
   */
  async manualSync(workspaceId: string): Promise<{ success: boolean; error?: string }> {
    const workspaces = await this.workspaceSettingsService.getWorkspaces();
    const workspace = workspaces.find(w => w.id === workspaceId);

    if (!workspace) {
      const error = `Workspace ${workspaceId} not found`;
      log.error(`Manual sync failed for workspace ${workspaceId}:`, error);
      return { success: false, error };
    }

    if (workspace.type !== 'git' && workspace.type !== 'team') {
      const error = 'Only Git/Team workspaces can be synced';
      log.error(`Manual sync failed for workspace ${workspaceId}:`, error);
      return { success: false, error };
    }

    try {
      await this.performSync(workspaceId, workspace);
      return { success: true };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error(`Manual sync failed for workspace ${workspaceId}:`, error);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Get sync status for all workspaces
   */
  getSyncStatus(): Record<string, SyncStatus> {
    const status: Record<string, SyncStatus> = {};

    for (const [workspaceId] of this.syncTimers) {
      status[workspaceId] = {
        scheduled: true,
        syncing: this.syncInProgress.get(workspaceId) ?? false,
        lastSync: this.lastSyncTime.get(workspaceId) ?? null
      };
    }

    return status;
  }

  /**
   * Shutdown the scheduler
   */
  async shutdown(): Promise<void> {
    log.info('Shutting down WorkspaceSyncScheduler');

    // Stop all sync timers
    for (const [, timerId] of this.syncTimers) {
      clearInterval(timerId);
    }
    this.syncTimers.clear();

    // Wait for any in-progress syncs to complete
    const inProgressSyncs = Array.from(this.syncInProgress.entries())
      .filter(([, inProgress]) => inProgress)
      .map(([workspaceId]) => workspaceId);

    if (inProgressSyncs.length > 0) {
      log.info(`Waiting for ${inProgressSyncs.length} syncs to complete...`);

      // Wait up to 30 seconds for syncs to complete
      const maxWaitTime = SHUTDOWN_TIMEOUT;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        const stillInProgress = inProgressSyncs.filter(id => this.syncInProgress.get(id));
        if (stillInProgress.length === 0) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, SHUTDOWN_POLL_INTERVAL));
      }
    }

    log.info('WorkspaceSyncScheduler shutdown complete');
  }
}

export {
  WorkspaceSyncScheduler,
  broadcastToRenderers,
  DEFAULT_SYNC_INTERVAL,
  DEFAULT_GIT_BRANCH,
  DEFAULT_CONFIG_PATH,
  DEFAULT_AUTH_TYPE,
  SHUTDOWN_TIMEOUT,
  MAX_OFFLINE_DURATION,
  GIT_CONNECTIVITY_CHECK_INTERVAL,
  RESUME_SYNC_DELAY,
  Workspace,
  SyncConfig,
  SyncResult,
  SyncData,
  SyncStatus,
  SchedulerOptions,
  NetworkService,
  GitSyncService,
  WorkspaceSettingsService as WorkspaceSettingsServiceInterface
};
export default WorkspaceSyncScheduler;
