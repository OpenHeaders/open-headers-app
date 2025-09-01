/**
 * TeamWorkspaceSyncer - Business logic for syncing team workspaces
 * Handles both auto-sync and manual sync operations
 */

const path = require('path');
const { createLogger } = require('../../../../utils/mainLogger');

const log = createLogger('TeamWorkspaceSyncer');

// Sync status constants
const SYNC_STATUS = {
  UP_TO_DATE: 'up_to_date',
  NEEDS_PULL: 'needs_pull',
  NEEDS_PUSH: 'needs_push',
  CONFLICT: 'conflict',
  ERROR: 'error'
};

class TeamWorkspaceSyncer {
  constructor(dependencies) {
    this.repositoryManager = dependencies.repositoryManager;
    this.branchManager = dependencies.branchManager;
    this.commitManager = dependencies.commitManager;
    this.configValidator = dependencies.configValidator;
    this.executor = dependencies.executor;
  }

  /**
   * Sync workspace with remote repository
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} - Sync result
   */
  async syncWorkspace(options) {
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
      
      if (status.status === SYNC_STATUS.UP_TO_DATE) {
        // Load configuration data even when up to date
        const configData = await this.loadWorkspaceConfig(repoDir, options.path || 'config/');
        
        return {
          success: true,
          status: status.status,
          message: 'Workspace is up to date',
          changes: false,
          data: configData
        };
      }

      // Step 2: Handle different sync scenarios
      switch (status.status) {
        case SYNC_STATUS.NEEDS_PULL:
          return await this.handlePull({
            repoDir,
            branch,
            authType,
            authData,
            status,
            progressCallback,
            path: options.path
          });

        case SYNC_STATUS.NEEDS_PUSH:
          return await this.handlePush({
            repoDir,
            branch,
            authType,
            authData,
            status,
            progressCallback
          });

        case SYNC_STATUS.CONFLICT:
          return await this.handleConflict({
            repoDir,
            branch,
            authType,
            authData,
            status,
            autoResolve,
            progressCallback
          });

        default:
          throw new Error(`Unknown sync status: ${status.status}`);
      }

    } catch (error) {
      log.error('Sync failed:', error);
      return {
        success: false,
        status: SYNC_STATUS.ERROR,
        message: error.message,
        error
      };
    }
  }

  /**
   * Perform auto-sync for workspace
   * @param {Object} options - Auto-sync options
   * @returns {Promise<Object>} - Auto-sync result
   */
  async autoSync(options) {
    const {
      workspaceId,
      repoDir,
      branch,
      authType = 'none',
      authData = {},
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
      return {
        success: false,
        status: SYNC_STATUS.ERROR,
        message: `Auto-sync failed: ${error.message}`,
        error,
        autoSync: true
      };
    }
  }

  /**
   * Check workspace sync status
   * @param {string} repoDir - Repository directory
   * @param {string} branch - Branch name
   * @returns {Promise<Object>} - Sync status
   */
  async checkSyncStatus(repoDir, branch) {
    try {
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
          if (fetchError.message.includes("couldn't find remote ref") && fetchAttempts < maxAttempts) {
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

    } catch (error) {
      log.error('Failed to check sync status:', error);
      return {
        status: SYNC_STATUS.ERROR,
        error: error.message
      };
    }
  }

  /**
   * Handle pull operation
   * @param {Object} options - Pull options
   * @returns {Promise<Object>} - Pull result
   */
  async handlePull(options) {
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
      progressCallback
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
      message: pullResult.message,
      changes: true,
      pulled: status.behind,
      configValid: validation.valid,
      configErrors: validation.errors,
      data: configData
    };
  }

  /**
   * Handle push operation
   * @param {Object} options - Push options
   * @returns {Promise<Object>} - Push result
   */
  async handlePush(options) {
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
      progressCallback
    });

    return {
      success: pushResult.success,
      status: SYNC_STATUS.UP_TO_DATE,
      message: pushResult.message,
      changes: true,
      pushed: status.ahead
    };
  }

  /**
   * Handle conflict resolution
   * @param {Object} options - Conflict options
   * @returns {Promise<Object>} - Resolution result
   */
  async handleConflict(options) {
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

    try {
      // Stash local changes if any
      const hasChanges = await this.hasLocalChanges(repoDir);
      let stashed = false;

      if (hasChanges) {
        await this.executor.execute('stash push -m "Auto-sync stash"', {
          cwd: repoDir
        });
        stashed = true;
      }

      // Pull with rebase
      await this.executor.execute(`pull --rebase origin ${branch}`, {
        cwd: repoDir,
        env: authData.env || process.env,
        timeout: 60000
      });

      // Restore stashed changes
      if (stashed) {
        try {
          await this.executor.execute('stash pop', { cwd: repoDir });
        } catch (error) {
          log.warn('Failed to restore stashed changes:', error);
        }
      }

      // Push rebased changes
      const pushResult = await this.repositoryManager.pushRepository({
        repoDir,
        branch,
        authType,
        authData,
        progressCallback
      });

      return {
        success: true,
        status: SYNC_STATUS.UP_TO_DATE,
        message: 'Conflicts resolved automatically',
        changes: true,
        resolved: true
      };

    } catch (error) {
      log.error('Auto-resolve failed:', error);
      return {
        success: false,
        status: SYNC_STATUS.CONFLICT,
        message: `Auto-resolve failed: ${error.message}`,
        requiresManualResolution: true
      };
    }
  }

  /**
   * Check if repository has local changes
   * @param {string} repoDir - Repository directory
   * @returns {Promise<boolean>} - Whether there are local changes
   */
  async hasLocalChanges(repoDir) {
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
   * @param {string} repoDir - Repository directory
   * @param {string} range - Git range (e.g., "HEAD..origin/main")
   * @returns {Promise<number>} - Commit count
   */
  async getCommitCount(repoDir, range) {
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
   * Validate workspace configuration
   * @param {string} repoDir - Repository directory
   * @returns {Promise<Object>} - Validation result
   */
  async validateWorkspaceConfig(repoDir) {
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
      const configPaths = {};

      for (const [key, relativePath] of Object.entries(metadata.configPaths || {})) {
        configPaths[key] = path.join(repoDir, relativePath);
      }

      return await this.configValidator.validateAll(configPaths, repoDir);

    } catch (error) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Find workspace metadata file
   * @param {string} repoDir - Repository directory
   * @returns {Promise<string|null>} - Path to metadata file
   */
  async findMetadataFile(repoDir) {
    const fs = require('fs').promises;
    const possiblePaths = [
      '.openheaders/workspaces/*/metadata.json',
      '.config/openheaders/workspaces/*/metadata.json',
      'workspaces/*/metadata.json'
    ];

    for (const pattern of possiblePaths) {
      try {
        const glob = require('glob');
        const files = await new Promise((resolve, reject) => {
          glob(pattern, { cwd: repoDir }, (err, files) => {
            if (err) reject(err);
            else resolve(files);
          });
        });

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
   * @param {string} repoDir - Repository directory
   * @returns {Promise<Object>} - Sync statistics
   */
  async getSyncStats(repoDir) {
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
        error: error.message
      };
    }
  }

  /**
   * Get last sync time from git log
   * @param {string} repoDir - Repository directory
   * @returns {Promise<Date|null>} - Last sync date
   */
  async getLastSyncTime(repoDir) {
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
   * @param {string} repoDir - Repository directory
   * @param {string} configPath - Path to config files within repo
   * @returns {Promise<Object>} - Configuration data
   */
  async loadWorkspaceConfig(repoDir, configPath) {
    const fs = require('fs').promises;
    
    try {
      log.info(`Loading workspace config from ${repoDir}/${configPath}`);
      
      // Look for config files in the specified path
      const possibleFiles = [
        'open-headers-config.json',
        'open-headers.json',
        'config.json',
        'openheaders.json'
      ];
      
      let configData = null;
      let configFile = null;
      
      // First check the config path directly
      const configDir = path.join(repoDir, configPath);
      
      for (const filename of possibleFiles) {
        const filePath = path.join(configDir, filename);
        try {
          const content = await fs.readFile(filePath, 'utf8');
          configData = JSON.parse(content);
          configFile = filePath;
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
      
      // Extract relevant data for import
      const result = {
        sources: configData.sources || [],
        rules: configData.rules || {},
        proxyRules: configData.proxyRules || []
      };
      
      // Handle environment schema
      if (configData.environmentSchema) {
        result.environmentSchema = configData.environmentSchema;
      }
      
      // Handle environments (values)
      if (configData.environments) {
        result.environments = configData.environments;
      }
      
      log.info(`Loaded config with ${result.sources?.length || 0} sources, ${Object.keys(result.rules || {}).length} rule types, ${result.proxyRules?.length || 0} proxy rules`);
      
      return result;
      
    } catch (error) {
      log.error('Failed to load workspace config:', error);
      return null;
    }
  }
}

module.exports = TeamWorkspaceSyncer;