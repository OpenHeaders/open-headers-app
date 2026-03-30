/**
 * GitSyncService - Main facade for Git operations
 * Orchestrates all Git-related functionality through modular components
 */

import fs from 'node:fs';
import path from 'node:path';
import { errorMessage, toError } from '../../../types/common';
import type { WorkspaceAuthData } from '../../../types/workspace';
import mainLogger from '../../../utils/mainLogger';
// Config modules
import { ConfigFileDetector } from '../ConfigFileDetector';
import { ConfigFileValidator } from '../config-file-validator';
// Legacy support
import { GitAutoInstaller } from '../git-auto-installer';
// Auth modules
import GitAuthenticator from './auth/GitAuthenticator';
import type { GitStatus } from './core/GitInitializer';
// Core modules
import GitInitializer from './core/GitInitializer';
import type { CommitOptions, CommitResult } from './operations/CommitManager';
import CommitManager from './operations/CommitManager';
import type { ConnectionTestOptions, ConnectionTestResult } from './operations/ConnectionTester';
import ConnectionTester from './operations/ConnectionTester';
import type { SyncOptions, SyncResult } from './operations/TeamWorkspaceSyncer';
// Operation modules
import TeamWorkspaceSyncer, { SYNC_STATUS } from './operations/TeamWorkspaceSyncer';
import type { BranchResult } from './repository/GitBranchManager';
import GitBranchManager from './repository/GitBranchManager';
// Repository modules
import GitRepositoryManager from './repository/GitRepositoryManager';
import SparseCheckoutManager from './repository/SparseCheckoutManager';
// Utility modules
import GitCleanupManager from './utils/GitCleanupManager';
import { GitErrorHandler } from './utils/GitErrorHandler';

const fsPromises = fs.promises;
const { createLogger } = mainLogger;

const log = createLogger('GitSyncService');

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
 * Called from:
 * - IPC handlers (gitHandlers.ts, workspaceHandlers.ts)
 * - WorkspaceSyncScheduler
 */
class GitSyncService {
  private initializer: GitInitializer;
  private executor: ReturnType<GitInitializer['getExecutor']> | null;
  private authManager: GitAuthenticator | null;
  private errorHandler: GitErrorHandler;
  private repositoryManager: GitRepositoryManager | null;
  private branchManager: GitBranchManager | null;
  private sparseCheckoutManager: SparseCheckoutManager | null;
  private commitManager: CommitManager | null;
  private cleanupManager: GitCleanupManager | null;
  private teamWorkspaceSyncer: TeamWorkspaceSyncer | null;
  private connectionTester: ConnectionTester | null;
  private configDetector: ConfigFileDetector;
  private configValidator: ConfigFileValidator;
  private gitAutoInstaller: GitAutoInstaller;
  private initialized: boolean;

  constructor() {
    this.initializer = new GitInitializer();
    this.executor = null;
    this.authManager = null;
    this.errorHandler = new GitErrorHandler();

    this.repositoryManager = null;
    this.branchManager = null;
    this.sparseCheckoutManager = null;
    this.commitManager = null;
    this.cleanupManager = null;

    this.teamWorkspaceSyncer = null;
    this.connectionTester = null;

    this.configDetector = new ConfigFileDetector();
    this.configValidator = new ConfigFileValidator();

    this.gitAutoInstaller = new GitAutoInstaller();

    this.initialized = false;
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      log.info('Initializing GitSyncService');

      await this.initializer.initialize();

      const paths = this.initializer.getPaths();
      this.executor = this.initializer.getExecutor();
      this.authManager = new GitAuthenticator(paths.sshDir);

      this.repositoryManager = new GitRepositoryManager(this.executor, this.authManager);
      this.branchManager = new GitBranchManager(this.executor);
      this.sparseCheckoutManager = new SparseCheckoutManager(this.executor);
      this.commitManager = new CommitManager(this.executor);
      this.cleanupManager = new GitCleanupManager(paths);

      const dependencies = {
        executor: this.executor,
        authManager: this.authManager,
        repositoryManager: this.repositoryManager,
        branchManager: this.branchManager,
        sparseCheckoutManager: this.sparseCheckoutManager,
        commitManager: this.commitManager,
        configDetector: this.configDetector,
        configValidator: this.configValidator,
      };

      this.teamWorkspaceSyncer = new TeamWorkspaceSyncer(dependencies);
      this.connectionTester = new ConnectionTester(dependencies);

      this.cleanupManager.schedulePeriodicCleanup(24);

      this.initialized = true;
      log.info('GitSyncService initialized successfully');
    } catch (error) {
      log.error('GitSyncService initialization failed:', error);
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // ── Git status ────────────────────────────────────────────────

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
        error: errorMessage(error),
      };
    }
  }

  // ── Connection testing ────────────────────────────────────────

  async testConnection(options: ConnectionTestOptions): Promise<ConnectionTestResult> {
    await this.ensureInitialized();

    try {
      return await this.connectionTester!.testConnection(options);
    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), { operation: 'testConnection', ...options });
      return { success: false, accessible: false, error: handled.message };
    }
  }

  // ── Sync ──────────────────────────────────────────────────────

  async syncWorkspace(options: SyncOptions): Promise<SyncResult> {
    await this.ensureInitialized();

    try {
      const repoDir = this.getWorkspaceRepoDir(options.workspaceId);

      const repoExists = await fsPromises.access(path.join(repoDir, '.git')).then(
        () => true,
        () => false,
      );

      if (!repoExists) {
        log.info(`Repository not found for workspace ${options.workspaceId}, cloning...`);

        const cloneResult = await this.repositoryManager!.cloneRepository({
          url: options.url!,
          targetDir: repoDir,
          branch: options.branch || 'main',
          authType: options.authType || 'none',
          authData: options.authData || {},
          depth: 10,
        });

        if (!cloneResult.success) {
          throw new Error(`Failed to clone repository: ${cloneResult.error || 'Unknown error'}`);
        }
      }

      return await this.teamWorkspaceSyncer!.syncWorkspace({ ...options, repoDir });
    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), {
        operation: 'syncWorkspace',
        ...options,
      });
      return {
        success: false,
        status: SYNC_STATUS.ERROR,
        message: handled.message,
        error: handled.message,
      };
    }
  }

  // ── Commit configuration ──────────────────────────────────────

  async commitConfiguration(options: CommitConfigurationOptions): Promise<CommitResult> {
    await this.ensureInitialized();

    try {
      if (options.url && options.files) {
        const tempDir = path.join(this.initializer.getPaths().tempDir, `commit-${Date.now()}`);
        await fsPromises.mkdir(tempDir, { recursive: true });

        try {
          const targetBranch = options.branch || 'main';
          let needsNewBranch = false;

          try {
            const { stdout } = await this.executor!.execute(`ls-remote --heads "${options.url}" "${targetBranch}"`, {
              timeout: 15000,
            });
            needsNewBranch = !stdout.trim();
          } catch (error) {
            log.warn('Failed to check branch existence, will try to clone anyway:', error);
          }

          let cloneResult: { success: boolean; error?: string };
          if (needsNewBranch) {
            log.info(`Branch '${targetBranch}' not found, cloning default branch`);
            cloneResult = await this.repositoryManager!.cloneRepository({
              url: options.url,
              targetDir: tempDir,
              authType: options.authType || 'none',
              authData: options.authData || {},
              depth: 0,
            });
          } else {
            cloneResult = await this.repositoryManager!.cloneRepository({
              url: options.url,
              targetDir: tempDir,
              branch: targetBranch,
              authType: options.authType || 'none',
              authData: options.authData || {},
              depth: 1,
            });
          }

          if (!cloneResult.success) {
            throw new Error(cloneResult.error || 'Failed to clone repository');
          }

          if (needsNewBranch) {
            log.info(`Creating new branch '${targetBranch}'`);
            await this.branchManager!.createBranch(tempDir, targetBranch);
          }

          const files: Record<string, string> = {};
          const basePath = options.path || '';

          for (const [filename, content] of Object.entries(options.files)) {
            const filePath = path.join(basePath, filename);
            files[filePath] = content;
          }

          const commitResult = await this.commitManager!.commitConfiguration({
            repoDir: tempDir,
            files,
            message: options.message,
            author: options.author,
            email: options.email,
          });

          const pushResult = await this.repositoryManager!.pushRepository({
            repoDir: tempDir,
            branch: targetBranch,
            authType: options.authType || 'none',
            authData: options.authData || {},
            setUpstream: needsNewBranch,
          });

          if (!pushResult.success) {
            throw new Error(pushResult.error || 'Failed to push changes');
          }

          setTimeout(() => {
            this.cleanupManager!.cleanupDirectory(tempDir).catch((err) => {
              log.error('Failed to cleanup temp directory:', err);
            });
          }, 5000);

          return commitResult;
        } catch (error) {
          await this.cleanupManager!.cleanupDirectory(tempDir).catch(() => {});
          throw error;
        }
      }

      if (!options.repoDir) {
        throw new Error('repoDir is required for backend commit format');
      }
      return await this.commitManager!.commitConfiguration({ ...options, repoDir: options.repoDir });
    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), {
        operation: 'commitConfiguration',
        ...options,
      });
      throw new Error(handled.message);
    }
  }

  // ── Branch operations ─────────────────────────────────────────

  async createBranch(options: { repoDir: string; branchName: string; baseBranch?: string }): Promise<BranchResult> {
    await this.ensureInitialized();

    try {
      const { repoDir, branchName, baseBranch } = options;
      return await this.branchManager!.createBranch(repoDir, branchName, baseBranch);
    } catch (error) {
      const handled = this.errorHandler.handle(toError(error), {
        operation: 'createBranch',
        ...options,
      });
      throw new Error(handled.message);
    }
  }

  async checkWritePermissions(options: WritePermissionOptions): Promise<WritePermissionResult> {
    await this.ensureInitialized();

    try {
      const { url, branch = 'main', authType = 'none', authData = {} } = options;

      const testBranch = `test-write-${Date.now()}`;
      const tempDir = path.join(this.initializer.getPaths().tempDir, `test-${Date.now()}`);

      try {
        await this.repositoryManager!.cloneRepository({
          url,
          targetDir: tempDir,
          branch,
          authType,
          authData,
          depth: 1,
        });

        await this.branchManager!.createBranch(tempDir, testBranch);

        await this.repositoryManager!.pushRepository({
          repoDir: tempDir,
          branch: testBranch,
          authType,
          authData,
        });

        await this.executor!.execute(`push origin --delete ${testBranch}`, { cwd: tempDir }).catch(() => {});

        return {
          success: true,
          hasWriteAccess: true,
        };
      } finally {
        await this.cleanupManager!.cleanupDirectory(tempDir);
      }
    } catch (error) {
      if (
        errorMessage(error).includes('permission') ||
        errorMessage(error).includes('forbidden') ||
        errorMessage(error).includes('unauthorized')
      ) {
        return {
          success: true,
          hasWriteAccess: false,
          message: 'Read-only access',
        };
      }

      const handled = this.errorHandler.handle(toError(error), {
        operation: 'checkWritePermissions',
        ...options,
      });
      throw new Error(handled.message);
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────

  async cleanupRepository(gitUrl: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const tempDir = this.initializer.getPaths().tempDir;

      const files = await fsPromises.readdir(tempDir);
      for (const file of files) {
        if (file.includes('workspace-') || file.includes('test-')) {
          const dirPath = path.join(tempDir, file);
          try {
            const gitConfigPath = path.join(dirPath, '.git', 'config');
            const configExists = await fsPromises
              .access(gitConfigPath)
              .then(() => true)
              .catch(() => false);

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

  // ── Git installation ──────────────────────────────────────────

  async installGit(onProgress: (message: string) => void): Promise<boolean> {
    this.gitAutoInstaller.setProgressCallback(onProgress);
    try {
      return await this.gitAutoInstaller.ensureGitInstalled();
    } finally {
      this.gitAutoInstaller.setProgressCallback(null);
    }
  }

  // ── Private helpers ───────────────────────────────────────────

  private getWorkspaceRepoDir(workspaceId: string): string {
    return path.join(this.initializer.getPaths().tempDir, `workspace-${workspaceId}`);
  }
}

export { GitSyncService };
export default GitSyncService;
