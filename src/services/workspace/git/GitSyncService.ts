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

// Auth modules
import GitAuthenticator from './auth/GitAuthenticator';

// Repository modules
import GitRepositoryManager from './repository/GitRepositoryManager';
import GitBranchManager from './repository/GitBranchManager';
import SparseCheckoutManager from './repository/SparseCheckoutManager';

// Operation modules
import TeamWorkspaceCreator from './operations/TeamWorkspaceCreator';
import TeamWorkspaceSyncer from './operations/TeamWorkspaceSyncer';
import ConnectionTester from './operations/ConnectionTester';
import CommitManager from './operations/CommitManager';

// Utility modules
import GitCleanupManager from './utils/GitCleanupManager';
import { GitErrorHandler } from './utils/GitErrorHandler';

// Config modules
const { ConfigFileDetector } = require('../ConfigFileDetector');
const { ConfigFileValidator } = require('../config-file-validator');

// Legacy support
const { GitAutoInstaller } = require('../git-auto-installer');

const fsPromises = fs.promises;
const { createLogger } = mainLogger;

const log = createLogger('GitSyncService');

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
  private executor: any;
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
  private configDetector: any;
  private configValidator: any;
  private gitAutoInstaller: any;
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
      this.initializationError = error as Error;
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
  async getGitStatus(): Promise<any> {
    try {
      return this.initializer.getStatus();
    } catch (error) {
      return {
        gitPath: null,
        isInstalled: false,
        initialized: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Test connection to a Git repository
   */
  async testConnection(options: any): Promise<any> {
    await this.ensureInitialized();

    try {
      return await this.connectionTester!.testConnection(options);
    } catch (error) {
      return this.errorHandler.handle(error as Error, { operation: 'testConnection', ...options });
    }
  }

  /**
   * Create a new team workspace
   * @public Called from IPC handlers
   */
  async createTeamWorkspace(options: any): Promise<any> {
    await this.ensureInitialized();

    try {
      // Validate options
      this.teamWorkspaceCreator!.validateOptions(options);

      // Add temp directory from initializer
      options.tempDir = this.initializer.getPaths().tempDir;

      // Create workspace
      const result = await this.teamWorkspaceCreator!.createTeamWorkspace(options);

      // Schedule cleanup of temp directory
      setTimeout(() => {
        this.cleanupManager!.cleanupTempFiles().catch(err => {
          log.error('Failed to cleanup temp files:', err);
        });
      }, 5 * 60 * 1000); // 5 minutes

      return result;

    } catch (error) {
      const handled = this.errorHandler.handle(error as Error, {
        operation: 'createTeamWorkspace',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Create workspace from invitation
   */
  async createFromInvitation(options: any): Promise<any> {
    await this.ensureInitialized();

    try {
      // Add temp directory
      options.tempDir = this.initializer.getPaths().tempDir;

      return await this.teamWorkspaceCreator!.createFromInvitation(options);

    } catch (error) {
      const handled = this.errorHandler.handle(error as Error, {
        operation: 'createFromInvitation',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Sync team workspace
   */
  async syncWorkspace(options: any): Promise<any> {
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
          url: options.url,
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
      const handled = this.errorHandler.handle(error as Error, {
        operation: 'syncWorkspace',
        ...options
      });
      return {
        success: false,
        error: handled.message,
        recovery: handled.recovery
      };
    }
  }

  /**
   * Auto-sync team workspace
   */
  async autoSyncWorkspace(options: any): Promise<any> {
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
      const handled = this.errorHandler.handle(error as Error, {
        operation: 'autoSyncWorkspace',
        ...options
      });
      return {
        success: false,
        error: handled.message,
        autoSync: true
      };
    }
  }

  /**
   * Clone repository
   */
  async cloneRepository(options: any): Promise<any> {
    await this.ensureInitialized();

    try {
      return await this.repositoryManager!.cloneRepository(options);
    } catch (error) {
      const handled = this.errorHandler.handle(error as Error, {
        operation: 'cloneRepository',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Pull repository changes
   */
  async pullRepository(options: any): Promise<any> {
    await this.ensureInitialized();

    try {
      return await this.repositoryManager!.pullRepository(options);
    } catch (error) {
      const handled = this.errorHandler.handle(error as Error, {
        operation: 'pullRepository',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Push repository changes
   */
  async pushRepository(options: any): Promise<any> {
    await this.ensureInitialized();

    try {
      return await this.repositoryManager!.pushRepository(options);
    } catch (error) {
      const handled = this.errorHandler.handle(error as Error, {
        operation: 'pushRepository',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Commit configuration changes
   */
  async commitConfiguration(options: any): Promise<any> {
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
            const { stdout } = await this.executor.execute(
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
            files[filePath] = content as string;
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
      return await this.commitManager!.commitConfiguration(options);

    } catch (error) {
      const handled = this.errorHandler.handle(error as Error, {
        operation: 'commitConfiguration',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Get repository status
   */
  async getRepositoryStatus(repoDir: string): Promise<any> {
    await this.ensureInitialized();

    try {
      return await this.repositoryManager!.getStatus(repoDir);
    } catch (error) {
      const handled = this.errorHandler.handle(error as Error, {
        operation: 'getRepositoryStatus',
        repoDir
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Get sync status
   */
  async getSyncStatus(options: any): Promise<any> {
    await this.ensureInitialized();

    try {
      return await this.teamWorkspaceSyncer!.checkSyncStatus(
        options.repoDir,
        options.branch
      );
    } catch (error) {
      return {
        status: 'error',
        error: (error as Error).message
      };
    }
  }

  /**
   * Detect configuration files
   */
  async detectConfigFiles(repoDir: string): Promise<any[]> {
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
  async validateConfiguration(configPaths: any, repoDir: string): Promise<any> {
    try {
      return await this.configValidator.validateAll(configPaths, repoDir);
    } catch (error) {
      return {
        valid: false,
        errors: [(error as Error).message]
      };
    }
  }

  /**
   * Perform cleanup
   */
  async performCleanup(options: any = {}): Promise<any> {
    await this.ensureInitialized();

    try {
      return await this.cleanupManager!.performCleanup(options);
    } catch (error) {
      log.error('Cleanup failed:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(): Promise<any> {
    await this.ensureInitialized();

    try {
      return await this.cleanupManager!.getCleanupStats();
    } catch (error) {
      return {
        error: (error as Error).message
      };
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
  getInstallationInfo(): any {
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
  async createBranch(options: any): Promise<any> {
    await this.ensureInitialized();

    try {
      const { repoDir, branchName, baseBranch } = options;
      return await this.branchManager!.createBranch(repoDir, branchName, baseBranch);
    } catch (error) {
      const handled = this.errorHandler.handle(error as Error, {
        operation: 'createBranch',
        ...options
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Check write permissions for repository
   */
  async checkWritePermissions(options: any): Promise<any> {
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
        await this.executor.execute(
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
      if ((error as Error).message.includes('permission') ||
          (error as Error).message.includes('forbidden') ||
          (error as Error).message.includes('unauthorized')) {
        return {
          success: true,
          hasWriteAccess: false,
          message: 'Read-only access'
        };
      }

      const handled = this.errorHandler.handle(error as Error, {
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
}

// Export the class (not a singleton) to match original behavior
export { GitSyncService };
export default GitSyncService;
