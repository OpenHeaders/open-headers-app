/**
 * GitSyncService - Main facade for Git operations
 * Orchestrates all Git-related functionality through modular components
 */

/* eslint-disable no-unused-vars */

import path from 'path';
import fs from 'fs';
import os from 'os';
import mainLogger from '../../../utils/mainLogger';

// Core modules
import GitInitializer from './core/GitInitializer';
import type { GitPaths, GitStatus } from './core/GitInitializer';
import type { GitExecutor } from './core/GitExecutor';

// Auth modules
import GitAuthenticator from './auth/GitAuthenticator';

// Repository modules
import GitRepositoryManager from './repository/GitRepositoryManager';
import type { CloneOptions, PullOptions, PushOptions, OperationResult, RepositoryStatus } from './repository/GitRepositoryManager';
import GitBranchManager from './repository/GitBranchManager';
import type { BranchResult } from './repository/GitBranchManager';
import SparseCheckoutManager from './repository/SparseCheckoutManager';

// Operation modules
import TeamWorkspaceCreator from './operations/TeamWorkspaceCreator';
import type { CreateOptions, InvitationOptions, CreateResult } from './operations/TeamWorkspaceCreator';
import TeamWorkspaceSyncer, { SYNC_STATUS } from './operations/TeamWorkspaceSyncer';
import type { SyncOptions, SyncResult, SyncStatusResult } from './operations/TeamWorkspaceSyncer';
import ConnectionTester from './operations/ConnectionTester';
import type { ConnectionTestOptions, ConnectionTestResult } from './operations/ConnectionTester';
import CommitManager from './operations/CommitManager';
import type { CommitOptions, CommitResult } from './operations/CommitManager';

// Utility modules
import GitCleanupManager from './utils/GitCleanupManager';
import type { FullCleanupResult, CleanupStats } from './utils/GitCleanupManager';
import { GitErrorHandler } from './utils/GitErrorHandler';
import type { WorkspaceAuthData } from '../../../types/workspace';

// Config modules
import { ConfigFileDetector } from '../ConfigFileDetector';
import type { DetectedFile } from '../ConfigFileDetector';
import { ConfigFileValidator } from '../config-file-validator';
import type { ValidationResult, ConfigPaths } from '../config-file-validator';
import { toError, errorMessage } from '../../../types/common';

// Legacy support
import { GitAutoInstaller } from '../git-auto-installer';

const fsPromises = fs.promises;
const { createLogger } = mainLogger;

const log = createLogger('GitSyncService');

interface InstallationInfo {
  platform: NodeJS.Platform;
  downloadUrl: string;
  instructions: string;
}

interface CommitConfigurationOptions extends Partial<CommitOptions> {
  url?: string;
  branch?: string;
  path?: string;
  files?: Record<string, string>;
  authType?: string;
  authData?: WorkspaceAuthData;
  author?: string;
  email?: string;
  message?: string;
}

interface WritePermissionOptions {
  url: string;
  branch?: string;
  authType?: string;
  authData?: WorkspaceAuthData;
}

interface WritePermissionResult {
  success: boolean;
  hasWriteAccess: boolean;
  message?: string;
}

/**
 * GitSyncService - Main facade for Git operations
 *
 * This service is exported as a singleton and its methods are called from:
 * - IPC handlers (gitHandlers.js, workspaceHandlers.js)
 * - WorkspaceSyncScheduler
 * - Other services
 *
 * Methods that appear "unused" are actually part of the public API.
 * @public
 */
class GitSyncService {
  private initializer: GitInitializer;
  private executor: GitExecutor | null;
  private authManager: GitAuthenticator | null;
  private errorHandler: GitErrorHandler;
  private repositoryManager: GitRepositoryManager | null;
  private branchManager: GitBranchManager | null;
  private sparseCheckoutManager: SparseCheckoutManager | null;
  private commitManager: CommitManager | null;
  private cleanupManager: GitCleanupManager | null;
  private teamWorkspaceCreator: TeamWorkspaceCreator | null;
  private teamWorkspaceSyncer: TeamWorkspaceSyncer | null;
  private connectionTester: ConnectionTester | null;
  private configDetector: ConfigFileDetector;
  private configValidator: ConfigFileValidator;
  private gitAutoInstaller: GitAutoInstaller;
  private initialized: boolean;
  private initializationError: Error | null;

  constructor() {
    // Initialize core components
    this.initializer = new GitInitializer();
    this.executor = null; // Set after initialization
    this.authManager = null;
    this.errorHandler = new GitErrorHandler();

    // Initialize operation components (set after initialization)
    this.repositoryManager = null;
    this.branchManager = null;
    this.sparseCheckoutManager = null;
    this.commitManager = null;
    this.cleanupManager = null;

    // Initialize business logic components
    this.teamWorkspaceCreator = null;
    this.teamWorkspaceSyncer = null;
    this.connectionTester = null;

    // Config components
    this.configDetector = new ConfigFileDetector();
    this.configValidator = new ConfigFileValidator();

    // Legacy support
    this.gitAutoInstaller = new GitAutoInstaller();

    // State
    this.initialized = false;
    this.initializationError = null;
  }

  /**
   * Initialize the Git sync service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      log.info('Initializing GitSyncService');

      // Initialize Git
      await this.initializer.initialize();

      // Get paths
      const paths = this.initializer.getPaths();

      // Set up executor
      this.executor = this.initializer.getExecutor();

      // Initialize auth manager
      this.authManager = new GitAuthenticator(paths.sshDir);

      // Initialize repository components
      this.repositoryManager = new GitRepositoryManager(this.executor, this.authManager);
      this.branchManager = new GitBranchManager(this.executor);
      this.sparseCheckoutManager = new SparseCheckoutManager(this.executor);
      this.commitManager = new CommitManager(this.executor);

      // Initialize cleanup manager
      this.cleanupManager = new GitCleanupManager(paths);

      // Initialize business logic components with dependencies
      const dependencies = {
        executor: this.executor,
        authManager: this.authManager,
        repositoryManager: this.repositoryManager,
        branchManager: this.branchManager,
        sparseCheckoutManager: this.sparseCheckoutManager,
        commitManager: this.commitManager,
        configDetector: this.configDetector,
        configValidator: this.configValidator
      };

      this.teamWorkspaceCreator = new TeamWorkspaceCreator(dependencies);
      this.teamWorkspaceSyncer = new TeamWorkspaceSyncer(dependencies);
      this.connectionTester = new ConnectionTester(dependencies);

      // Schedule periodic cleanup
      this.cleanupManager.schedulePeriodicCleanup(24); // Every 24 hours

      this.initialized = true;
      log.info('GitSyncService initialized successfully');

    } catch (error) {
      this.initializationError = toError(error);
      log.error('GitSyncService initialization failed:', error);
      throw error;
    }
  }

  /**
   * Ensure service is initialized
   * @private
   */
  async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get Git installation status
   */
  async getGitStatus(): Promise<GitStatus & { error?: string }> {
    try {
      return this.initializer.getStatus();
    } catch (error) {
      return {
        gitPath: null,
        isInstalled: false,
        initialized: false,
        platform: process.platform,
        tempDir: '',
        sshDir: '',
        error: errorMessage(error)
      };
    }
  }

  /**
   * Test connection to a Git repository
   */
  async testConnection(options: ConnectionTestOptions): Promise<ConnectionTestResult> {
    await this.ensureInitialized();

    try {
      return await this.connectionTester!.testConnection(options);
    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), { operation: 'testConnection', ...options });
      return { success: false, accessible: false, error: handled.message };
    }
  }

  /**
   * Create a new team workspace
   * @public Called from IPC handlers
   */
  async createTeamWorkspace(options: Omit<CreateOptions, 'tempDir'>): Promise<CreateResult> {
    await this.ensureInitialized();

    try {
      // Add temp directory from initializer
      const fullOptions: CreateOptions = {
        ...options,
        tempDir: this.initializer.getPaths().tempDir
      };

      // Validate options
      this.teamWorkspaceCreator!.validateOptions(fullOptions);

      // Create workspace
      const result = await this.teamWorkspaceCreator!.createTeamWorkspace(fullOptions);

      // Schedule cleanup of temp directory
      setTimeout(() => {
        this.cleanupManager!.cleanupTempFiles().catch(err => {
          log.error('Failed to cleanup temp files:', err);
        });
      }, 5 * 60 * 1000); // 5 minutes

      return result;

    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), {
        operation: 'createTeamWorkspace',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Create workspace from invitation
   */
  async createFromInvitation(options: Omit<InvitationOptions, 'tempDir'>): Promise<CreateResult> {
    await this.ensureInitialized();

    try {
      const fullOptions: InvitationOptions = {
        ...options,
        tempDir: this.initializer.getPaths().tempDir
      };

      return await this.teamWorkspaceCreator!.createFromInvitation(fullOptions);

    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), {
        operation: 'createFromInvitation',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Sync team workspace
   */
  async syncWorkspace(options: SyncOptions): Promise<SyncResult> {
    await this.ensureInitialized();

    try {
      // Determine repository directory for the workspace
      const repoDir = this.getWorkspaceRepoDir(options.workspaceId);

      // Check if repository exists, if not clone it first
      let repoExists = false;
      try {
        const gitDir = path.join(repoDir, '.git');
        await fsPromises.access(gitDir);
        repoExists = true;
      } catch (error) {
        // Repository doesn't exist
        repoExists = false;
      }

      if (!repoExists) {
        log.info(`Repository not found for workspace ${options.workspaceId}, cloning...`);

        // Clone the repository first
        const cloneResult = await this.repositoryManager!.cloneRepository({
          url: options.url!,
          targetDir: repoDir,
          branch: options.branch || 'main',
          authType: options.authType || 'none',
          authData: options.authData || {},
          depth: 10 // Shallow clone for efficiency
        });

        if (!cloneResult.success) {
          throw new Error(`Failed to clone repository: ${cloneResult.error || 'Unknown error'}`);
        }
      }

      // Add repoDir to options
      const syncOptions = {
        ...options,
        repoDir
      };

      return await this.teamWorkspaceSyncer!.syncWorkspace(syncOptions);
    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), {
        operation: 'syncWorkspace',
        ...options
      });
      return {
        success: false,
        status: SYNC_STATUS.ERROR,
        message: handled.message,
        error: handled.message,
      };
    }
  }

  /**
   * Auto-sync team workspace
   */
  async autoSyncWorkspace(options: SyncOptions & { commitChanges?: boolean }): Promise<SyncResult> {
    await this.ensureInitialized();

    try {
      // Determine repository directory for the workspace
      const repoDir = this.getWorkspaceRepoDir(options.workspaceId);

      // Add repoDir to options
      const syncOptions = {
        ...options,
        repoDir
      };

      return await this.teamWorkspaceSyncer!.autoSync(syncOptions);
    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), {
        operation: 'autoSyncWorkspace',
        ...options
      });
      return {
        success: false,
        status: SYNC_STATUS.ERROR,
        message: handled.message,
        error: handled.message,
        autoSync: true
      };
    }
  }

  /**
   * Clone repository
   */
  async cloneRepository(options: CloneOptions): Promise<OperationResult> {
    await this.ensureInitialized();

    try {
      return await this.repositoryManager!.cloneRepository(options);
    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), {
        operation: 'cloneRepository',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Pull repository changes
   */
  async pullRepository(options: PullOptions): Promise<OperationResult> {
    await this.ensureInitialized();

    try {
      return await this.repositoryManager!.pullRepository(options);
    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), {
        operation: 'pullRepository',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Push repository changes
   */
  async pushRepository(options: PushOptions): Promise<OperationResult> {
    await this.ensureInitialized();

    try {
      return await this.repositoryManager!.pushRepository(options);
    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), {
        operation: 'pushRepository',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Commit configuration changes
   */
  async commitConfiguration(options: CommitConfigurationOptions): Promise<CommitResult> {
    await this.ensureInitialized();

    try {
      // Handle frontend format (url, branch, path, files)
      if (options.url && options.files) {
        // Create a temporary directory for the operation
        const tempDir = path.join(this.initializer.getPaths().tempDir, `commit-${Date.now()}`);
        await fsPromises.mkdir(tempDir, { recursive: true });

        try {
          // First check if the branch exists
          let targetBranch = options.branch || 'main';
          let needsNewBranch = false;

          try {
            // Try to check if branch exists using ls-remote
            const { stdout } = await this.executor!.execute(
              `ls-remote --heads "${options.url}" "${targetBranch}"`,
              { timeout: 15000 }
            );
            needsNewBranch = !stdout.trim();
          } catch (error) {
            log.warn('Failed to check branch existence, will try to clone anyway:', error);
          }

          // Clone the repository
          let cloneResult;
          if (needsNewBranch) {
            // Clone default branch if target branch doesn't exist
            log.info(`Branch '${targetBranch}' not found, cloning default branch`);
            cloneResult = await this.repositoryManager!.cloneRepository({
              url: options.url,
              targetDir: tempDir,
              // Don't specify branch - let it clone the default
              authType: options.authType || 'none',
              authData: options.authData || {},
              depth: 0 // Get full history to create new branch
            });
          } else {
            // Clone specific branch if it exists
            cloneResult = await this.repositoryManager!.cloneRepository({
              url: options.url,
              targetDir: tempDir,
              branch: targetBranch,
              authType: options.authType || 'none',
              authData: options.authData || {},
              depth: 1
            });
          }

          if (!cloneResult.success) {
            throw new Error(cloneResult.error || 'Failed to clone repository');
          }

          // Create new branch if needed
          if (needsNewBranch) {
            log.info(`Creating new branch '${targetBranch}'`);
            await this.branchManager!.createBranch(tempDir, targetBranch);
          }

          // Prepare files with proper paths
          const files: Record<string, string> = {};
          const basePath = options.path || '';

          for (const [filename, content] of Object.entries(options.files)) {
            const filePath = path.join(basePath, filename);
            files[filePath] = content;
          }

          // Commit using the unified API
          const commitResult = await this.commitManager!.commitConfiguration({
            repoDir: tempDir,
            files,
            message: options.message,
            author: options.author,
            email: options.email
          });

          // Push changes
          const pushResult = await this.repositoryManager!.pushRepository({
            repoDir: tempDir,
            branch: targetBranch,
            authType: options.authType || 'none',
            authData: options.authData || {},
            setUpstream: needsNewBranch // Set upstream if it's a new branch
          });

          if (!pushResult.success) {
            throw new Error(pushResult.error || 'Failed to push changes');
          }

          // Schedule cleanup
          setTimeout(() => {
            this.cleanupManager!.cleanupDirectory(tempDir).catch(err => {
              log.error('Failed to cleanup temp directory:', err);
            });
          }, 5000);

          return commitResult;

        } catch (error) {
          // Immediate cleanup on error
          await this.cleanupManager!.cleanupDirectory(tempDir).catch(() => {});
          throw error;
        }
      }

      // Handle backend format (already has repoDir)
      if (!options.repoDir) {
        throw new Error('repoDir is required for backend commit format');
      }
      return await this.commitManager!.commitConfiguration({ ...options, repoDir: options.repoDir });

    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), {
        operation: 'commitConfiguration',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Get repository status
   */
  async getRepositoryStatus(repoDir: string): Promise<RepositoryStatus> {
    await this.ensureInitialized();

    try {
      return await this.repositoryManager!.getStatus(repoDir);
    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), {
        operation: 'getRepositoryStatus',
        repoDir
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Get sync status
   */
  async getSyncStatus(options: { repoDir: string; branch: string }): Promise<SyncStatusResult> {
    await this.ensureInitialized();

    try {
      return await this.teamWorkspaceSyncer!.checkSyncStatus(
        options.repoDir,
        options.branch
      );
    } catch (error) {
      return {
        status: SYNC_STATUS.ERROR,
        error: errorMessage(error)
      };
    }
  }

  /**
   * Detect configuration files
   */
  async detectConfigFiles(repoDir: string): Promise<DetectedFile[]> {
    try {
      return await this.configDetector.detectConfigFiles(repoDir);
    } catch (error) {
      log.error('Failed to detect config files:', error);
      return [];
    }
  }

  /**
   * Validate configuration
   */
  async validateConfiguration(configPaths: ConfigPaths, repoDir: string): Promise<ValidationResult> {
    try {
      return await this.configValidator.validateAll(configPaths, repoDir);
    } catch (error) {
      return {
        valid: false,
        errors: [errorMessage(error)]
      };
    }
  }

  /**
   * Perform cleanup
   */
  async performCleanup(options: { cleanTemp?: boolean; cleanOldRepos?: boolean; cleanSSHKeys?: boolean; force?: boolean } = {}): Promise<FullCleanupResult | { success: false; error: string }> {
    await this.ensureInitialized();

    try {
      return await this.cleanupManager!.performCleanup(options);
    } catch (error) {
      log.error('Cleanup failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(): Promise<CleanupStats | { error: string }> {
    await this.ensureInitialized();

    try {
      return await this.cleanupManager!.getCleanupStats();
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }

  /**
   * Cleanup specific workspace
   */
  async cleanupWorkspace(workspaceId: string, tempDir: string | null): Promise<void> {
    if (!tempDir) return;

    try {
      await this.cleanupManager!.cleanupDirectory(tempDir);
    } catch (error) {
      log.error(`Failed to cleanup workspace ${workspaceId}:`, error);
    }
  }

  /**
   * Handle installation prompt (for UI)
   */
  getInstallationInfo(): InstallationInfo {
    return {
      platform: process.platform,
      downloadUrl: this.getGitDownloadUrl(),
      instructions: this.getInstallInstructions()
    };
  }

  /**
   * Get Git download URL for platform
   * @private
   */
  private getGitDownloadUrl(): string {
    const platform = process.platform;

    switch (platform) {
      case 'win32':
        return 'https://git-scm.com/download/win';
      case 'darwin':
        return 'https://git-scm.com/download/mac';
      case 'linux':
        return 'https://git-scm.com/download/linux';
      default:
        return 'https://git-scm.com/downloads';
    }
  }

  /**
   * Get install instructions for platform
   * @private
   */
  private getInstallInstructions(): string {
    const platform = process.platform;

    switch (platform) {
      case 'win32':
        return 'Download and run the installer. Make sure to select "Add Git to PATH" during installation.';
      case 'darwin':
        return 'Install via Homebrew: brew install git\nOr download the installer from the link above.';
      case 'linux':
        return 'Install via package manager:\nUbuntu/Debian: sudo apt-get install git\nFedora: sudo dnf install git\nArch: sudo pacman -S git';
      default:
        return 'Please install Git for your operating system.';
    }
  }

  /**
   * Create a new branch in repository
   */
  async createBranch(options: { repoDir: string; branchName: string; baseBranch?: string }): Promise<BranchResult> {
    await this.ensureInitialized();

    try {
      const { repoDir, branchName, baseBranch } = options;
      return await this.branchManager!.createBranch(repoDir, branchName, baseBranch);
    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), {
        operation: 'createBranch',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Check write permissions for repository
   */
  async checkWritePermissions(options: WritePermissionOptions): Promise<WritePermissionResult> {
    await this.ensureInitialized();

    try {
      const { url, branch = 'main', authType = 'none', authData = {} } = options;

      // Test by trying to push an empty commit to a test branch
      const testBranch = `test-write-${Date.now()}`;
      const tempDir = path.join(this.initializer.getPaths().tempDir, `test-${Date.now()}`);

      try {
        // Clone repository
        await this.repositoryManager!.cloneRepository({
          url,
          targetDir: tempDir,
          branch,
          authType,
          authData,
          depth: 1
        });

        // Create test branch
        await this.branchManager!.createBranch(tempDir, testBranch);

        // Try to push test branch
        await this.repositoryManager!.pushRepository({
          repoDir: tempDir,
          branch: testBranch,
          authType,
          authData
        });

        // If we got here, we have write permissions
        // Clean up test branch on remote
        await this.executor!.execute(
          `push origin --delete ${testBranch}`,
          { cwd: tempDir }
        ).catch(() => {}); // Ignore cleanup errors

        return {
          success: true,
          hasWriteAccess: true
        };

      } finally {
        // Clean up temp directory
        await this.cleanupManager!.cleanupDirectory(tempDir);
      }

    } catch (error) {
      // Check if it's a permission error
      if (errorMessage(error).includes('permission') ||
          errorMessage(error).includes('forbidden') ||
          errorMessage(error).includes('unauthorized')) {
        return {
          success: true,
          hasWriteAccess: false,
          message: 'Read-only access'
        };
      }

      const handled = this.errorHandler.handle(toError(error), {
        operation: 'checkWritePermissions',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Get the repository directory for a workspace
   * @private
   */
  private getWorkspaceRepoDir(workspaceId: string): string {
    return path.join(this.initializer.getPaths().tempDir, `workspace-${workspaceId}`);
  }

  /**
   * Cleanup a specific repository
   */
  async cleanupRepository(gitUrl: string): Promise<void> {
    await this.ensureInitialized();

    try {
      // Find and remove any temporary directories for this repository
      const tempDir = this.initializer.getPaths().tempDir;

      const files = await fsPromises.readdir(tempDir);
      for (const file of files) {
        if (file.includes('workspace-') || file.includes('test-')) {
          const dirPath = path.join(tempDir, file);
          try {
            // Check if this directory is for the given repository
            const gitConfigPath = path.join(dirPath, '.git', 'config');
            const configExists = await fsPromises.access(gitConfigPath).then(() => true).catch(() => false);

            if (configExists) {
              const config = await fsPromises.readFile(gitConfigPath, 'utf8');
              if (config.includes(gitUrl)) {
                await this.cleanupManager!.cleanupDirectory(dirPath);
                log.info(`Cleaned up repository directory: ${dirPath}`);
              }
            }
          } catch (error) {
            log.error(`Failed to check/cleanup directory ${dirPath}:`, error);
          }
        }
      }
    } catch (error) {
      log.error('Failed to cleanup repository:', error);
      throw error;
    }
  }

  async installGit(onProgress: (message: string) => void): Promise<boolean> {
    this.gitAutoInstaller.setProgressCallback(onProgress);
    try {
      return await this.gitAutoInstaller.ensureGitInstalled();
    } finally {
      this.gitAutoInstaller.setProgressCallback(null);
    }
  }
}

// Export the class (not a singleton) to match original behavior
export { GitSyncService };
export default GitSyncService;
