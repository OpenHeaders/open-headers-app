/**
 * GitInitializer - Handles Git service initialization and setup
 * Manages finding Git executable and setting up required directories
 */

const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const { createLogger } = require('../../../../utils/mainLogger');
const { GitExecutor } = require('./GitExecutor');

const log = createLogger('GitInitializer');

// Common Git executable paths
const COMMON_GIT_PATHS = [
  '/usr/bin/git',
  '/usr/local/bin/git',
  '/opt/homebrew/bin/git', // Apple Silicon Macs
  '/opt/local/bin/git', // MacPorts
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
];

class GitInitializer {
  constructor() {
    this.gitPath = null;
    this.initialized = false;
    this.tempDir = path.join(app.getPath('userData'), 'workspace-sync');
    this.sshDir = path.join(app.getPath('userData'), 'ssh-keys');
    this.executor = new GitExecutor();
  }

  /**
   * Initialize Git service
   * @returns {Promise<boolean>} - Whether initialization succeeded
   */
  async initialize() {
    try {
      await this.ensureDirectories();
      await this.findGitExecutable();
      
      if (!this.gitPath) {
        if (process.platform === 'win32' && app.isPackaged) {
          log.error('Portable Git not found in bundled resources');
        } else {
          log.info('Git not found. Installation can be triggered from the UI when needed.');
        }
      } else {
        this.executor.setGitPath(this.gitPath);
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      log.error('Git initialization failed:', error);
      throw error;
    }
  }


  /**
   * Find Git executable in system
   * @returns {Promise<string|null>} - Path to Git executable
   */
  async findGitExecutable() {
    // On Windows, prefer bundled portable Git for reliability
    if (process.platform === 'win32') {
      try {
        const portableGitPath = app.isPackaged 
          ? path.join(process.resourcesPath, 'git', 'bin', 'git.exe')
          : path.join(__dirname, '..', '..', '..', '..', 'build', 'portable', 'PortableGit', 'bin', 'git.exe');
        
        await fs.access(portableGitPath, fs.constants.X_OK);
        this.gitPath = portableGitPath;
        log.info('Using bundled portable Git:', this.gitPath);
        return this.gitPath;
      } catch (error) {
        log.debug('Bundled portable Git not found, checking system git');
      }
    }
    
    // Check if git is in PATH
    try {
      // Use child_process directly since executor might not have git path yet
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const command = process.platform === 'win32' ? 'where git' : 'which git';
      const { stdout } = await execAsync(command, { timeout: 5000 });
      
      if (stdout.trim()) {
        this.gitPath = stdout.trim().split('\n')[0];
        log.info('Found git in PATH:', this.gitPath);
        return this.gitPath;
      }
    } catch (error) {
      // Not in PATH, continue checking
    }
    
    // Check common paths
    for (const gitPath of COMMON_GIT_PATHS) {
      try {
        await fs.access(gitPath, fs.constants.X_OK);
        this.gitPath = gitPath;
        log.info('Found git at:', gitPath);
        return this.gitPath;
      } catch (error) {
        // Continue checking
      }
    }
    
    log.error('Git executable not found');
    return null;
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      await fs.mkdir(this.sshDir, { recursive: true });
      log.debug('Directories created successfully');
    } catch (error) {
      log.error('Failed to create directories:', error);
      throw error;
    }
  }

  /**
   * Get Git installation status
   * @returns {Object} - Git status information
   */
  getStatus() {
    return {
      gitPath: this.gitPath,
      isInstalled: !!this.gitPath,
      initialized: this.initialized,
      platform: process.platform,
      tempDir: this.tempDir,
      sshDir: this.sshDir
    };
  }

  /**
   * Get paths for workspace operations
   * @returns {Object} - Directory paths
   */
  getPaths() {
    return {
      tempDir: this.tempDir,
      sshDir: this.sshDir
    };
  }

  /**
   * Get configured Git executor
   * @returns {GitExecutor} - Git executor instance
   */
  getExecutor() {
    return this.executor;
  }
}

module.exports = GitInitializer;