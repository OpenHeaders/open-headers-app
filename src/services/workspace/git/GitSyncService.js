/**
 * GitSyncService - Main facade for Git operations
 * Orchestrates all Git-related functionality through modular components
 */

/* eslint-disable no-unused-vars */

const path = require('path');
const { createLogger } = require('../../../utils/mainLogger');

// Core modules
const GitInitializer = require('./core/GitInitializer');

// Auth modules
const GitAuthenticator = require('./auth/GitAuthenticator');

// Repository modules
const GitRepositoryManager = require('./repository/GitRepositoryManager');
const GitBranchManager = require('./repository/GitBranchManager');
const SparseCheckoutManager = require('./repository/SparseCheckoutManager');

// Operation modules
const TeamWorkspaceCreator = require('./operations/TeamWorkspaceCreator');
const TeamWorkspaceSyncer = require('./operations/TeamWorkspaceSyncer');
const ConnectionTester = require('./operations/ConnectionTester');
const CommitManager = require('./operations/CommitManager');

// Utility modules
const GitCleanupManager = require('./utils/GitCleanupManager');
const { GitErrorHandler } = require('./utils/GitErrorHandler');

// Config modules
const ConfigFileDetector = require('../ConfigFileDetector');
const ConfigFileValidator = require('../config-file-validator');

// Legacy support
const GitAutoInstaller = require('../git-auto-installer');

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
   * @returns {Promise<void>}
   */
  async initialize() {
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
      this.initializationError = error;
      log.error('GitSyncService initialization failed:', error);
      throw error;
    }
  }

  /**
   * Ensure service is initialized
   * @private
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get Git installation status
   * @returns {Promise<Object>} - Git status
   */
  async getGitStatus() {
    try {
      return this.initializer.getStatus();
    } catch (error) {
      return {
        gitPath: null,
        isInstalled: false,
        initialized: false,
        error: error.message
      };
    }
  }

  /**
   * Test connection to a Git repository
   * @param {Object} options - Connection test options
   * @returns {Promise<Object>} - Test result
   */
  async testConnection(options) {
    await this.ensureInitialized();
    
    try {
      return await this.connectionTester.testConnection(options);
    } catch (error) {
      return this.errorHandler.handle(error, { operation: 'testConnection', ...options });
    }
  }

  /**
   * Create a new team workspace
   * @param {Object} options - Creation options
   * @returns {Promise<Object>} - Creation result
   * @public Called from IPC handlers
   */
  async createTeamWorkspace(options) {
    await this.ensureInitialized();
    
    try {
      // Validate options
      this.teamWorkspaceCreator.validateOptions(options);
      
      // Add temp directory from initializer
      options.tempDir = this.initializer.getPaths().tempDir;
      
      // Create workspace
      const result = await this.teamWorkspaceCreator.createTeamWorkspace(options);
      
      // Schedule cleanup of temp directory
      setTimeout(() => {
        this.cleanupManager.cleanupTempFiles().catch(err => {
          log.error('Failed to cleanup temp files:', err);
        });
      }, 5 * 60 * 1000); // 5 minutes
      
      return result;
      
    } catch (error) {
      const handled = this.errorHandler.handle(error, { 
        operation: 'createTeamWorkspace', 
        ...options 
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Create workspace from invitation
   * @param {Object} options - Invitation options
   * @returns {Promise<Object>} - Join result
   */
  async createFromInvitation(options) {
    await this.ensureInitialized();
    
    try {
      // Add temp directory
      options.tempDir = this.initializer.getPaths().tempDir;
      
      return await this.teamWorkspaceCreator.createFromInvitation(options);
      
    } catch (error) {
      const handled = this.errorHandler.handle(error, { 
        operation: 'createFromInvitation', 
        ...options 
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Sync team workspace
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} - Sync result
   */
  async syncWorkspace(options) {
    await this.ensureInitialized();
    
    try {
      // Determine repository directory for the workspace
      const repoDir = this.getWorkspaceRepoDir(options.workspaceId);
      
      // Check if repository exists, if not clone it first
      const fs = require('fs').promises;
      let repoExists = false;
      try {
        const gitDir = path.join(repoDir, '.git');
        await fs.access(gitDir);
        repoExists = true;
      } catch (error) {
        // Repository doesn't exist
        repoExists = false;
      }
      
      if (!repoExists) {
        log.info(`Repository not found for workspace ${options.workspaceId}, cloning...`);
        
        // Clone the repository first
        const cloneResult = await this.repositoryManager.cloneRepository({
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
      
      return await this.teamWorkspaceSyncer.syncWorkspace(syncOptions);
    } catch (error) {
      const handled = this.errorHandler.handle(error, { 
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
   * @param {Object} options - Auto-sync options
   * @returns {Promise<Object>} - Auto-sync result
   */
  async autoSyncWorkspace(options) {
    await this.ensureInitialized();
    
    try {
      // Determine repository directory for the workspace
      const repoDir = this.getWorkspaceRepoDir(options.workspaceId);
      
      // Add repoDir to options
      const syncOptions = {
        ...options,
        repoDir
      };
      
      return await this.teamWorkspaceSyncer.autoSync(syncOptions);
    } catch (error) {
      const handled = this.errorHandler.handle(error, { 
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
   * @param {Object} options - Clone options
   * @returns {Promise<Object>} - Clone result
   */
  async cloneRepository(options) {
    await this.ensureInitialized();
    
    try {
      return await this.repositoryManager.cloneRepository(options);
    } catch (error) {
      const handled = this.errorHandler.handle(error, { 
        operation: 'cloneRepository', 
        ...options 
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Pull repository changes
   * @param {Object} options - Pull options
   * @returns {Promise<Object>} - Pull result
   */
  async pullRepository(options) {
    await this.ensureInitialized();
    
    try {
      return await this.repositoryManager.pullRepository(options);
    } catch (error) {
      const handled = this.errorHandler.handle(error, { 
        operation: 'pullRepository', 
        ...options 
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Push repository changes
   * @param {Object} options - Push options
   * @returns {Promise<Object>} - Push result
   */
  async pushRepository(options) {
    await this.ensureInitialized();
    
    try {
      return await this.repositoryManager.pushRepository(options);
    } catch (error) {
      const handled = this.errorHandler.handle(error, { 
        operation: 'pushRepository', 
        ...options 
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Commit configuration changes
   * @param {Object} options - Commit options
   * @returns {Promise<Object>} - Commit result
   */
  async commitConfiguration(options) {
    await this.ensureInitialized();
    
    try {
      // Handle frontend format (url, branch, path, files)
      if (options.url && options.files) {
        const path = require('path');
        const fs = require('fs').promises;
        const os = require('os');
        
        // Create a temporary directory for the operation
        const tempDir = path.join(this.initializer.getPaths().tempDir, `commit-${Date.now()}`);
        await fs.mkdir(tempDir, { recursive: true });
        
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
            cloneResult = await this.repositoryManager.cloneRepository({
              url: options.url,
              targetDir: tempDir,
              // Don't specify branch - let it clone the default
              authType: options.authType || 'none',
              authData: options.authData || {},
              depth: 0 // Get full history to create new branch
            });
          } else {
            // Clone specific branch if it exists
            cloneResult = await this.repositoryManager.cloneRepository({
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
            await this.branchManager.createBranch(tempDir, targetBranch);
          }
          
          // Prepare files with proper paths
          const files = {};
          const basePath = options.path || '';
          
          for (const [filename, content] of Object.entries(options.files)) {
            const filePath = path.join(basePath, filename);
            files[filePath] = content;
          }
          
          // Commit using the unified API
          const commitResult = await this.commitManager.commitConfiguration({
            repoDir: tempDir,
            files,
            message: options.message,
            author: options.author,
            email: options.email
          });
          
          // Push changes
          const pushResult = await this.repositoryManager.pushRepository({
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
            this.cleanupManager.cleanupDirectory(tempDir).catch(err => {
              log.error('Failed to cleanup temp directory:', err);
            });
          }, 5000);
          
          return commitResult;
          
        } catch (error) {
          // Immediate cleanup on error
          await this.cleanupManager.cleanupDirectory(tempDir).catch(() => {});
          throw error;
        }
      }
      
      // Handle backend format (already has repoDir)
      return await this.commitManager.commitConfiguration(options);
      
    } catch (error) {
      const handled = this.errorHandler.handle(error, { 
        operation: 'commitConfiguration', 
        ...options 
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Get repository status
   * @param {string} repoDir - Repository directory
   * @returns {Promise<Object>} - Repository status
   */
  async getRepositoryStatus(repoDir) {
    await this.ensureInitialized();
    
    try {
      return await this.repositoryManager.getStatus(repoDir);
    } catch (error) {
      const handled = this.errorHandler.handle(error, { 
        operation: 'getRepositoryStatus', 
        repoDir 
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Get sync status
   * @param {Object} options - Status options
   * @returns {Promise<Object>} - Sync status
   */
  async getSyncStatus(options) {
    await this.ensureInitialized();
    
    try {
      return await this.teamWorkspaceSyncer.checkSyncStatus(
        options.repoDir, 
        options.branch
      );
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Detect configuration files
   * @param {string} repoDir - Repository directory
   * @returns {Promise<Object[]>} - Detected config files
   */
  async detectConfigFiles(repoDir) {
    try {
      return await this.configDetector.detectConfigFiles(repoDir);
    } catch (error) {
      log.error('Failed to detect config files:', error);
      return [];
    }
  }

  /**
   * Validate configuration
   * @param {Object} configPaths - Configuration file paths
   * @param {string} repoDir - Repository directory
   * @returns {Promise<Object>} - Validation result
   */
  async validateConfiguration(configPaths, repoDir) {
    try {
      return await this.configValidator.validateAll(configPaths, repoDir);
    } catch (error) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Perform cleanup
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} - Cleanup result
   */
  async performCleanup(options = {}) {
    await this.ensureInitialized();
    
    try {
      return await this.cleanupManager.performCleanup(options);
    } catch (error) {
      log.error('Cleanup failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get cleanup statistics
   * @returns {Promise<Object>} - Cleanup stats
   */
  async getCleanupStats() {
    await this.ensureInitialized();
    
    try {
      return await this.cleanupManager.getCleanupStats();
    } catch (error) {
      return {
        error: error.message
      };
    }
  }

  /**
   * Cleanup specific workspace
   * @param {string} workspaceId - Workspace ID
   * @param {string} tempDir - Temporary directory
   * @returns {Promise<void>}
   */
  async cleanupWorkspace(workspaceId, tempDir) {
    if (!tempDir) return;
    
    try {
      await this.cleanupManager.cleanupDirectory(tempDir);
    } catch (error) {
      log.error(`Failed to cleanup workspace ${workspaceId}:`, error);
    }
  }

  /**
   * Handle installation prompt (for UI)
   * @returns {Object} - Installation info
   */
  getInstallationInfo() {
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
  getGitDownloadUrl() {
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
  getInstallInstructions() {
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
   * @param {Object} options - Branch creation options
   * @returns {Promise<Object>} - Branch creation result
   */
  async createBranch(options) {
    await this.ensureInitialized();
    
    try {
      const { repoDir, branchName, baseBranch } = options;
      return await this.branchManager.createBranch(repoDir, branchName, baseBranch);
    } catch (error) {
      const handled = this.errorHandler.handle(error, { 
        operation: 'createBranch', 
        ...options 
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Check write permissions for repository
   * @param {Object} options - Permission check options
   * @returns {Promise<Object>} - Permission check result
   */
  async checkWritePermissions(options) {
    await this.ensureInitialized();
    
    try {
      const { url, branch = 'main', authType = 'none', authData = {} } = options;
      
      // Test by trying to push an empty commit to a test branch
      const testBranch = `test-write-${Date.now()}`;
      const tempDir = path.join(this.initializer.getPaths().tempDir, `test-${Date.now()}`);
      
      try {
        // Clone repository
        await this.repositoryManager.cloneRepository({
          url,
          targetDir: tempDir,
          branch,
          authType,
          authData,
          depth: 1
        });
        
        // Create test branch
        await this.branchManager.createBranch(tempDir, testBranch);
        
        // Try to push test branch
        await this.repositoryManager.pushRepository({
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
        await this.cleanupManager.cleanupDirectory(tempDir);
      }
      
    } catch (error) {
      // Check if it's a permission error
      if (error.message.includes('permission') || 
          error.message.includes('forbidden') ||
          error.message.includes('unauthorized')) {
        return {
          success: true,
          hasWriteAccess: false,
          message: 'Read-only access'
        };
      }
      
      const handled = this.errorHandler.handle(error, { 
        operation: 'checkWritePermissions', 
        ...options 
      });
      throw new Error(handled.message);
    }
  }

  /**
   * Get the repository directory for a workspace
   * @param {string} workspaceId - Workspace ID
   * @returns {string} - Repository directory path
   * @private
   */
  getWorkspaceRepoDir(workspaceId) {
    // Use a consistent directory name based on workspace ID
    // This ensures the repository persists across app restarts
    return path.join(this.initializer.getPaths().tempDir, `workspace-${workspaceId}`);
  }

  /**
   * Cleanup a specific repository
   * @param {string} gitUrl - Repository URL to cleanup
   * @returns {Promise<void>}
   */
  async cleanupRepository(gitUrl) {
    await this.ensureInitialized();
    
    try {
      // Find and remove any temporary directories for this repository
      const tempDir = this.initializer.getPaths().tempDir;
      const fs = require('fs').promises;
      
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        if (file.includes('workspace-') || file.includes('test-')) {
          const dirPath = path.join(tempDir, file);
          try {
            // Check if this directory is for the given repository
            const gitConfigPath = path.join(dirPath, '.git', 'config');
            const configExists = await fs.access(gitConfigPath).then(() => true).catch(() => false);
            
            if (configExists) {
              const config = await fs.readFile(gitConfigPath, 'utf8');
              if (config.includes(gitUrl)) {
                await this.cleanupManager.cleanupDirectory(dirPath);
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
module.exports = GitSyncService;