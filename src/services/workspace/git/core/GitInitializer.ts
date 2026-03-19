/**
 * GitInitializer - Handles Git service initialization and setup
 * Manages finding Git executable and setting up required directories
 */

import fs from 'fs';
import path from 'path';
import electron from 'electron';
import child_process from 'child_process';
import util from 'util';
import mainLogger from '../../../../utils/mainLogger';
import { GitExecutor } from './GitExecutor';

const { app } = electron;
const fsPromises = fs.promises;
const { exec } = child_process;
const { promisify } = util;
const execAsync = promisify(exec);
const { createLogger } = mainLogger;

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

interface GitPaths {
  tempDir: string;
  sshDir: string;
}

interface GitStatus {
  gitPath: string | null;
  isInstalled: boolean;
  initialized: boolean;
  platform: NodeJS.Platform;
  tempDir: string;
  sshDir: string;
}

class GitInitializer {
  private gitPath: string | null;
  private initialized: boolean;
  private tempDir: string;
  private sshDir: string;
  private executor: GitExecutor;

  constructor() {
    this.gitPath = null;
    this.initialized = false;
    let userDataPath: string;
    try {
      userDataPath = app.getPath('userData');
    } catch (e) {
      userDataPath = '';
    }
    this.tempDir = path.join(userDataPath, 'workspace-sync');
    this.sshDir = path.join(userDataPath, 'ssh-keys');
    this.executor = new GitExecutor();
  }

  /**
   * Initialize Git service
   */
  async initialize(): Promise<boolean> {
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
   */
  async findGitExecutable(): Promise<string | null> {
    // On Windows, prefer bundled portable Git for reliability
    if (process.platform === 'win32') {
      try {
        const portableGitPath = app.isPackaged
          ? path.join(process.resourcesPath, 'git', 'bin', 'git.exe')
          : path.join(__dirname, '..', '..', 'build', 'portable', 'PortableGit', 'bin', 'git.exe');

        await fsPromises.access(portableGitPath, (fs.constants as any).X_OK);
        this.gitPath = portableGitPath;
        log.info('Using bundled portable Git:', this.gitPath);
        return this.gitPath;
      } catch (error) {
        log.debug('Bundled portable Git not found, checking system git');
      }
    }

    // Check if git is in PATH
    try {
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
        await fsPromises.access(gitPath, (fs.constants as any).X_OK);
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
  async ensureDirectories(): Promise<void> {
    try {
      await fsPromises.mkdir(this.tempDir, { recursive: true });
      await fsPromises.mkdir(this.sshDir, { recursive: true });
      log.debug('Directories created successfully');
    } catch (error) {
      log.error('Failed to create directories:', error);
      throw error;
    }
  }

  /**
   * Get Git installation status
   */
  getStatus(): GitStatus {
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
   */
  getPaths(): GitPaths {
    return {
      tempDir: this.tempDir,
      sshDir: this.sshDir
    };
  }

  /**
   * Get configured Git executor
   */
  getExecutor(): GitExecutor {
    return this.executor;
  }
}

export { GitInitializer, COMMON_GIT_PATHS };
export type { GitPaths, GitStatus };
export default GitInitializer;
