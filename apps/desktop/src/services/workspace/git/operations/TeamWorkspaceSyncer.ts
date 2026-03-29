/**
 * TeamWorkspaceSyncer - Business logic for syncing team workspaces
 * Handles both auto-sync and manual sync operations
 */

import path from 'path';
import fs from 'fs';
import mainLogger from '../../../../utils/mainLogger';
import type { GitExecutor } from '../core/GitExecutor';
import type { GitRepositoryManager, RepositoryStatus } from '../repository/GitRepositoryManager';
import type { Source } from '../../../../types/source';
import type { WorkspaceAuthData, CommitInfo } from '../../../../types/workspace';
import type { RulesCollection } from '../../../../types/rules';
import type { ProxyRule } from '../../../../types/proxy';
import type { EnvironmentSchema, EnvironmentMap } from '../../../../types/environment';
import type { GitBranchManager } from '../repository/GitBranchManager';
import type { CommitManager } from './CommitManager';
import type { ConfigFileValidator, ConfigPaths } from '../../config-file-validator';
import { glob } from 'glob';

const fsPromises = fs.promises;
const { createLogger } = mainLogger;

const log = createLogger('TeamWorkspaceSyncer');

/** Network/timeout errors that self-resolve — expected during Power Nap / brief network windows. */
function isTransientNetworkError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('ssl connection timeout') ||
      lower.includes('connection reset') ||
      lower.includes('connection refused') ||
      lower.includes('timed out') ||
      lower.includes('network is unreachable') ||
      lower.includes('could not resolve host') ||
      lower.includes('err_connection') ||
      lower.includes('unable to access');
}

// Sync status constants
const SYNC_STATUS = {
  UP_TO_DATE: 'up_to_date',
  NEEDS_PULL: 'needs_pull',
  NEEDS_PUSH: 'needs_push',
  CONFLICT: 'conflict',
  ERROR: 'error'
} as const;

type SyncStatusType = typeof SYNC_STATUS[keyof typeof SYNC_STATUS];

interface SyncDependencies {
  repositoryManager: GitRepositoryManager;
  branchManager: GitBranchManager;
  commitManager: CommitManager;
  configValidator: ConfigFileValidator;
  executor: GitExecutor;
}

interface SyncProgressInfo {
  phase: string;
  message: string;
}

interface SyncOptions {
  workspaceId: string;
  workspaceName?: string;
  repoDir?: string;
  branch: string;
  authType?: string;
  authData?: WorkspaceAuthData;
  autoResolve?: boolean;
  progressCallback?: (progress: SyncProgressInfo) => void;
  path?: string;
  url?: string;
}

/** Shape of the JSON config file on disk (external boundary). */
interface ConfigFileJson {
  sources?: Source[];
  rules?: RulesCollection;
  proxyRules?: ProxyRule[];
  environmentSchema?: EnvironmentSchema;
  environments?: EnvironmentMap;
}

interface WorkspaceConfigData {
  sources: Source[];
  rules: RulesCollection;
  proxyRules: ProxyRule[];
  environmentSchema?: EnvironmentSchema;
  environments?: EnvironmentMap;
}

interface SyncResult {
  success: boolean;
  status: SyncStatusType;
  message: string;
  changes?: boolean;
  data?: WorkspaceConfigData | null;
  pulled?: number;
  pushed?: number;
  configValid?: boolean;
  configErrors?: string[];
  error?: string;
  autoSync?: boolean;
  localChangesCommitted?: boolean;
  resolved?: boolean;
  requiresManualResolution?: boolean;
  ahead?: number;
  behind?: number;
  commitHash?: string;
  commitInfo?: CommitInfo;
}

/** Actionable sync status — always one of the four deterministic states.
 *  Infrastructure failures (network, auth) throw instead of returning here. */
interface SyncStatusResult {
  status: typeof SYNC_STATUS.UP_TO_DATE | typeof SYNC_STATUS.NEEDS_PULL | typeof SYNC_STATUS.NEEDS_PUSH | typeof SYNC_STATUS.CONFLICT;
  localCommit: string;
  remoteCommit: string;
  ahead?: number;
  behind?: number;
}

interface HandlePullOptions {
  repoDir: string;
  branch: string;
  authType: string;
  authData: WorkspaceAuthData;
  status: SyncStatusResult;
  progressCallback: (progress: SyncProgressInfo) => void;
  path?: string;
}

interface HandlePushOptions {
  repoDir: string;
  branch: string;
  authType: string;
  authData: WorkspaceAuthData;
  status: SyncStatusResult;
  progressCallback: (progress: SyncProgressInfo) => void;
}

interface HandleConflictOptions {
  repoDir: string;
  branch: string;
  authType: string;
  authData: WorkspaceAuthData & { env?: NodeJS.ProcessEnv };
  status: SyncStatusResult;
  autoResolve: boolean;
  progressCallback: (progress: SyncProgressInfo) => void;
}

interface SyncStats {
  branch?: string;
  hasLocalChanges?: boolean;
  lastCommit?: RepositoryStatus['lastCommit'];
  lastSync?: Date | null;
  changes?: RepositoryStatus['changes'];
  error?: string;
}

class TeamWorkspaceSyncer {
  private repositoryManager: GitRepositoryManager;
  private commitManager: CommitManager;
  private configValidator: ConfigFileValidator;
  private executor: GitExecutor;

  constructor(dependencies: SyncDependencies) {
    this.repositoryManager = dependencies.repositoryManager;
    this.commitManager = dependencies.commitManager;
    this.configValidator = dependencies.configValidator;
    this.executor = dependencies.executor;
  }

  /**
   * Sync workspace with remote repository
   */
  async syncWorkspace(options: SyncOptions & { repoDir: string }): Promise<SyncResult> {
    const {
      workspaceId,
      workspaceName,
      repoDir,
      branch,
      authType = 'none',
      authData = {},
      autoResolve = false,
      progressCallback = () => {}
    } = options;

    log.info(`Syncing workspace: ${workspaceName} (${workspaceId})`);

    try {
      // Step 1: Check sync status
      progressCallback({
        phase: 'status',
        message: 'Checking sync status...'
      });

      const status = await this.checkSyncStatus(repoDir, branch);

      // Step 2: Handle sync scenario
      let result: SyncResult;

      if (status.status === SYNC_STATUS.UP_TO_DATE) {
        const configData = await this.loadWorkspaceConfig(repoDir, options.path || 'config/');
        result = {
          success: true,
          status: status.status,
          message: 'Workspace is up to date',
          changes: false,
          data: configData
        };
      } else {
        switch (status.status) {
          case SYNC_STATUS.NEEDS_PULL:
            result = await this.handlePull({
              repoDir, branch, authType, authData,
              status, progressCallback, path: options.path
            });
            break;

          case SYNC_STATUS.NEEDS_PUSH:
            result = await this.handlePush({
              repoDir, branch, authType, authData,
              status, progressCallback
            });
            break;

          case SYNC_STATUS.CONFLICT:
            result = await this.handleConflict({
              repoDir, branch, authType, authData,
              status, autoResolve, progressCallback
            });
            break;

          default: {
            const _exhaustive: never = status.status;
            throw new Error(`Unhandled sync status: ${_exhaustive}`);
          }
        }
      }

      // Step 3: Enrich successful results with HEAD commit info.
      // Done here once rather than in each handler so every current and future
      // success path automatically provides commit context to the scheduler/UI.
      if (result.success) {
        const headInfo = await this.getHeadCommitInfo(repoDir);
        result.commitHash = headInfo.commitHash;
        result.commitInfo = headInfo;
      }

      return result;

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (isTransientNetworkError(errMsg)) {
        log.warn(`Sync skipped (transient network issue): ${errMsg}`);
      } else {
        log.error('Sync failed:', error);
      }
      return {
        success: false,
        status: SYNC_STATUS.ERROR,
        message: errMsg,
        error: errMsg
      };
    }
  }

  /**
   * Perform auto-sync for workspace
   */
  async autoSync(options: SyncOptions & { repoDir: string; commitChanges?: boolean }): Promise<SyncResult> {
    const {
      workspaceId,
      repoDir,
      commitChanges = true,
      progressCallback = () => {}
    } = options;

    log.info(`Auto-syncing workspace: ${workspaceId}`);

    try {
      // Step 1: Check for local changes
      const hasLocalChanges = await this.hasLocalChanges(repoDir);

      if (hasLocalChanges && commitChanges) {
        progressCallback({
          phase: 'commit',
          message: 'Committing local changes...'
        });

        // Auto-commit local changes
        await this.commitManager.autoCommit({
          repoDir,
          message: `Auto-sync: Update configuration (${new Date().toISOString()})`
        });
      }

      // Step 2: Perform sync
      const syncResult = await this.syncWorkspace({
        ...options,
        autoResolve: true // Auto-resolve conflicts in auto-sync
      });

      return {
        ...syncResult,
        autoSync: true,
        localChangesCommitted: hasLocalChanges && commitChanges
      };

    } catch (error) {
      log.error('Auto-sync failed:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        status: SYNC_STATUS.ERROR,
        message: `Auto-sync failed: ${errMsg}`,
        error: errMsg,
        autoSync: true
      };
    }
  }

  /**
   * Check workspace sync status.
   *
   * Returns one of four actionable statuses. Throws on infrastructure
   * failures (network, auth, timeout) — callers handle errors via catch.
   */
  async checkSyncStatus(repoDir: string, branch: string): Promise<SyncStatusResult> {
    // Fetch latest from remote (without merging)
    // Retry logic for newly created branches
    let fetchAttempts = 0;
    const maxAttempts = 3;
    const retryDelay = 2000; // 2 seconds

    while (fetchAttempts < maxAttempts) {
      try {
        await this.executor.execute(
          `fetch origin ${branch}`,
          { cwd: repoDir, timeout: 15000 }
        );
        break; // Success, exit retry loop
      } catch (fetchError) {
        fetchAttempts++;
        if (fetchError instanceof Error && fetchError.message.includes("couldn't find remote ref") && fetchAttempts < maxAttempts) {
          log.warn(`Branch ${branch} not found on remote (attempt ${fetchAttempts}/${maxAttempts}), retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          throw fetchError;
        }
      }
    }

    // Get local and remote commit hashes
    const { stdout: localCommit } = await this.executor.execute(
      'rev-parse HEAD',
      { cwd: repoDir }
    );

    const { stdout: remoteCommit } = await this.executor.execute(
      `rev-parse origin/${branch}`,
      { cwd: repoDir }
    );

    const localHash = localCommit.trim();
    const remoteHash = remoteCommit.trim();

    // Check if commits are the same
    if (localHash === remoteHash) {
      return {
        status: SYNC_STATUS.UP_TO_DATE,
        localCommit: localHash,
        remoteCommit: remoteHash
      };
    }

    // Check merge base
    const { stdout: mergeBase } = await this.executor.execute(
      `merge-base HEAD origin/${branch}`,
      { cwd: repoDir }
    );

    const baseHash = mergeBase.trim();

    // Determine sync status
    if (baseHash === localHash) {
      // Local is behind remote
      return {
        status: SYNC_STATUS.NEEDS_PULL,
        localCommit: localHash,
        remoteCommit: remoteHash,
        behind: await this.getCommitCount(repoDir, `HEAD..origin/${branch}`)
      };
    } else if (baseHash === remoteHash) {
      // Local is ahead of remote
      return {
        status: SYNC_STATUS.NEEDS_PUSH,
        localCommit: localHash,
        remoteCommit: remoteHash,
        ahead: await this.getCommitCount(repoDir, `origin/${branch}..HEAD`)
      };
    } else {
      // Diverged - potential conflict
      return {
        status: SYNC_STATUS.CONFLICT,
        localCommit: localHash,
        remoteCommit: remoteHash,
        ahead: await this.getCommitCount(repoDir, `origin/${branch}..HEAD`),
        behind: await this.getCommitCount(repoDir, `HEAD..origin/${branch}`)
      };
    }
  }

  /**
   * Handle pull operation
   */
  async handlePull(options: HandlePullOptions): Promise<SyncResult> {
    const { repoDir, branch, authType, authData, status, progressCallback } = options;

    progressCallback({
      phase: 'pull',
      message: `Pulling ${status.behind} new commits...`
    });

    const pullResult = await this.repositoryManager.pullRepository({
      repoDir,
      branch,
      authType,
      authData,
    });

    // Validate configuration after pull
    progressCallback({
      phase: 'validate',
      message: 'Validating updated configuration...'
    });

    const validation = await this.validateWorkspaceConfig(repoDir);

    // Load configuration data after pull
    const configData = await this.loadWorkspaceConfig(repoDir, options.path || 'config/');

    return {
      success: pullResult.success,
      status: SYNC_STATUS.UP_TO_DATE,
      message: pullResult.message || 'Pull completed',
      changes: true,
      pulled: status.behind,
      configValid: validation.valid,
      configErrors: validation.errors,
      data: configData
    };
  }

  /**
   * Handle push operation
   */
  async handlePush(options: HandlePushOptions): Promise<SyncResult> {
    const { repoDir, branch, authType, authData, status, progressCallback } = options;

    progressCallback({
      phase: 'push',
      message: `Pushing ${status.ahead} commits...`
    });

    const pushResult = await this.repositoryManager.pushRepository({
      repoDir,
      branch,
      authType,
      authData,
    });

    return {
      success: pushResult.success,
      status: SYNC_STATUS.UP_TO_DATE,
      message: pushResult.message || 'Push completed',
      changes: true,
      pushed: status.ahead
    };
  }

  /**
   * Handle conflict resolution.
   *
   * Guarantees the repo is in a clean state on exit regardless of outcome.
   * If rebase fails, aborts it and restores any stashed changes so the next
   * sync attempt starts from a known-good state.
   */
  async handleConflict(options: HandleConflictOptions): Promise<SyncResult> {
    const {
      repoDir,
      branch,
      authType,
      authData,
      status,
      autoResolve,
      progressCallback
    } = options;

    log.warn(`Conflict detected: ${status.ahead} ahead, ${status.behind} behind`);

    if (!autoResolve) {
      return {
        success: false,
        status: SYNC_STATUS.CONFLICT,
        message: 'Manual conflict resolution required',
        ahead: status.ahead,
        behind: status.behind,
        requiresManualResolution: true
      };
    }

    // Auto-resolve by rebasing local changes on top of remote
    progressCallback({
      phase: 'resolve',
      message: 'Auto-resolving conflicts...'
    });

    let stashed = false;

    try {
      // Stash local changes if any
      const hasChanges = await this.hasLocalChanges(repoDir);

      if (hasChanges) {
        await this.executor.execute('stash push -m "Auto-sync stash"', {
          cwd: repoDir
        });
        stashed = true;
      }

      // Pull with rebase
      await this.executor.execute(`pull --rebase origin ${branch}`, {
        cwd: repoDir,
        env: authData.env ?? process.env,
        timeout: 60000
      });

      // Restore stashed changes
      if (stashed) {
        try {
          await this.executor.execute('stash pop', { cwd: repoDir });
        } catch (popError) {
          // Stash pop failed — local changes conflict with the rebased code.
          // The rebase itself succeeded, so the repo has the latest remote
          // changes. But the user's local modifications are still in the stash
          // and need manual resolution. Do NOT push — the local changes
          // aren't integrated yet.
          log.error('Stash pop failed after successful rebase — local changes need manual resolution:', popError);
          return {
            success: false,
            status: SYNC_STATUS.CONFLICT,
            message: 'Rebase succeeded but local changes conflict with updated code. Your changes are preserved in git stash.',
            changes: true,
            resolved: false,
            requiresManualResolution: true
          };
        }
      }

      // Push rebased changes (only reached if stash pop succeeded or nothing was stashed)
      await this.repositoryManager.pushRepository({
        repoDir,
        branch,
        authType,
        authData,
      });

      return {
        success: true,
        status: SYNC_STATUS.UP_TO_DATE,
        message: 'Conflicts resolved automatically',
        changes: true,
        resolved: true
      };

    } catch (error) {
      log.error('Auto-resolve failed, restoring repo to clean state:', error);

      // Abort any in-progress rebase to restore the repo to pre-rebase state
      await this.executor.execute('rebase --abort', { cwd: repoDir })
          .catch(abortErr => log.debug('rebase --abort (may be no-op):', abortErr));

      // Restore stashed changes if we stashed them
      if (stashed) {
        await this.executor.execute('stash pop', { cwd: repoDir })
            .catch(popErr => log.warn('Failed to restore stash after abort:', popErr));
      }

      return {
        success: false,
        status: SYNC_STATUS.CONFLICT,
        message: `Auto-resolve failed: ${error instanceof Error ? error.message : String(error)}`,
        requiresManualResolution: true
      };
    }
  }

  /**
   * Check if repository has local changes
   */
  async hasLocalChanges(repoDir: string): Promise<boolean> {
    try {
      const { stdout } = await this.executor.execute(
        'status --porcelain',
        { cwd: repoDir }
      );
      return stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get commit count between refs
   */
  async getCommitCount(repoDir: string, range: string): Promise<number> {
    try {
      const { stdout } = await this.executor.execute(
        `rev-list --count ${range}`,
        { cwd: repoDir }
      );
      return parseInt(stdout.trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Read HEAD commit info (hash, message, author, date).
   * Called once per successful sync so the scheduler and renderer always have
   * up-to-date commit context regardless of which sync path ran.
   */
  async getHeadCommitInfo(repoDir: string): Promise<CommitInfo> {
    try {
      const { stdout } = await this.executor.execute(
        'log -1 --pretty=format:%H%n%s%n%an%n%aI',
        { cwd: repoDir }
      );
      const [commitHash, message, author, date] = stdout.trim().split('\n');
      return { commitHash, message, author, date };
    } catch (error) {
      log.warn('Failed to read HEAD commit info:', error);
      return {};
    }
  }

  /**
   * Validate workspace configuration
   */
  async validateWorkspaceConfig(repoDir: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      // Find workspace metadata
      const metadataPath = await this.findMetadataFile(repoDir);

      if (!metadataPath) {
        return {
          valid: false,
          errors: ['Workspace metadata not found']
        };
      }

      const metadata = await this.configValidator.loadJson(metadataPath);
      const configPaths: ConfigPaths = {};

      if (metadata) {
        for (const [key, relativePath] of Object.entries(metadata.configPaths ?? {})) {
          configPaths[key] = path.join(repoDir, relativePath);
        }
      }

      return await this.configValidator.validateAll(configPaths, repoDir);

    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Find workspace metadata file
   */
  async findMetadataFile(repoDir: string): Promise<string | null> {
    const possiblePaths = [
      '.openheaders/workspaces/*/metadata.json',
      '.config/openheaders/workspaces/*/metadata.json',
      'workspaces/*/metadata.json'
    ];

    for (const pattern of possiblePaths) {
      try {
        const files = await glob(pattern, { cwd: repoDir });

        if (files.length > 0) {
          return path.join(repoDir, files[0]);
        }
      } catch (error) {
        // Continue checking
      }
    }

    return null;
  }

  /**
   * Get sync statistics
   */
  async getSyncStats(repoDir: string): Promise<SyncStats> {
    try {
      const status = await this.repositoryManager.getStatus(repoDir);
      const lastSync = await this.getLastSyncTime(repoDir);

      return {
        branch: status.branch,
        hasLocalChanges: status.hasChanges,
        lastCommit: status.lastCommit,
        lastSync,
        changes: status.changes
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get last sync time from git log
   */
  async getLastSyncTime(repoDir: string): Promise<Date | null> {
    try {
      const { stdout } = await this.executor.execute(
        'log -1 --grep="sync" --pretty=format:"%at"',
        { cwd: repoDir }
      );

      if (stdout.trim()) {
        return new Date(parseInt(stdout.trim()) * 1000);
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Load workspace configuration from repository
   */
  async loadWorkspaceConfig(repoDir: string, configPath: string): Promise<WorkspaceConfigData | null> {
    try {
      log.info(`Loading workspace config from ${repoDir}/${configPath}`);

      // Look for config files in the specified path
      const possibleFiles = [
        'open-headers-config.json',
        'open-headers.json',
        'config.json',
        'openheaders.json'
      ];

      let configData: ConfigFileJson | null = null;

      // First check the config path directly
      const configDir = path.join(repoDir, configPath);

      for (const filename of possibleFiles) {
        const filePath = path.join(configDir, filename);
        try {
          const content = await fsPromises.readFile(filePath, 'utf8');
          configData = JSON.parse(content) as ConfigFileJson;
          log.info(`Found config file: ${filePath}`);
          break;
        } catch (error) {
          // File doesn't exist or is invalid, continue
        }
      }

      if (!configData) {
        log.warn(`No configuration file found in ${configDir}`);
        return null;
      }

      const rules = configData.rules ?? { header: [], request: [], response: [] };
      const result: WorkspaceConfigData = {
        sources: configData.sources ?? [],
        rules,
        proxyRules: configData.proxyRules ?? [],
        environmentSchema: configData.environmentSchema,
        environments: configData.environments,
      };

      const totalRules = rules.header.length + rules.request.length + rules.response.length;
      log.info(`Loaded config with ${result.sources.length} sources, ${totalRules} rules, ${result.proxyRules.length} proxy rules`);

      return result;

    } catch (error) {
      log.error('Failed to load workspace config:', error);
      return null;
    }
  }
}

export { TeamWorkspaceSyncer, SYNC_STATUS, isTransientNetworkError };
export type { SyncDependencies, SyncOptions, SyncResult, SyncStatusResult, SyncStatusType, SyncProgressInfo, WorkspaceConfigData };
export default TeamWorkspaceSyncer;
