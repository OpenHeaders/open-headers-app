/**
 * GitCleanupManager - Handles cleanup operations for Git repositories and resources
 * Manages removal of temporary files, old repositories, and SSH keys
 */

import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { errorMessage } from '@/types/common';
import mainLogger from '@/utils/mainLogger';

const fsPromises = fs.promises;
const { exec } = child_process;
const { createLogger } = mainLogger;

const log = createLogger('GitCleanupManager');

// Constants for cleanup policies
const CLEANUP_POLICIES = {
  TEMP_FILE_AGE: 24 * 60 * 60 * 1000, // 24 hours
  OLD_REPO_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days
  SSH_KEY_AGE: 30 * 24 * 60 * 60 * 1000, // 30 days
  MAX_TEMP_SIZE: 1024 * 1024 * 1024, // 1GB
};

interface CleanupPaths {
  tempDir: string;
  sshDir: string;
}

interface CleanupResult {
  cleaned: number;
  freed: number;
  errors: string[];
}

interface SSHCleanupResult {
  cleaned: number;
  errors: string[];
}

interface FullCleanupResult {
  tempFiles: CleanupResult;
  oldRepos: CleanupResult;
  sshKeys: SSHCleanupResult;
  errors: string[];
  success?: boolean;
  totalFreed?: number;
}

interface CleanupStats {
  tempDir: {
    path: string;
    size: number;
    fileCount: number;
    oldFileCount: number;
  };
  sshDir: {
    path: string;
    keyCount: number;
    oldKeyCount: number;
  };
  totalSize: number;
}

class GitCleanupManager {
  private tempDir: string;
  private sshDir: string;

  constructor(paths: CleanupPaths) {
    this.tempDir = paths.tempDir;
    this.sshDir = paths.sshDir;
  }

  /**
   * Perform full cleanup
   */
  async performCleanup(
    options: { cleanTemp?: boolean; cleanOldRepos?: boolean; cleanSSHKeys?: boolean; force?: boolean } = {},
  ): Promise<FullCleanupResult> {
    const { cleanTemp = true, cleanOldRepos = true, cleanSSHKeys = true, force = false } = options;

    log.info('Starting cleanup operation');

    const results: FullCleanupResult = {
      tempFiles: { cleaned: 0, freed: 0, errors: [] },
      oldRepos: { cleaned: 0, freed: 0, errors: [] },
      sshKeys: { cleaned: 0, errors: [] },
      errors: [],
    };

    try {
      if (cleanTemp) {
        const tempResult = await this.cleanupTempFiles(force);
        results.tempFiles = tempResult;
      }

      if (cleanOldRepos) {
        const repoResult = await this.cleanupOldRepositories(force);
        results.oldRepos = repoResult;
      }

      if (cleanSSHKeys) {
        const sshResult = await this.cleanupOldSSHKeys(force);
        results.sshKeys = sshResult;
      }

      results.success = true;
      results.totalFreed = results.tempFiles.freed + results.oldRepos.freed;
    } catch (error) {
      log.error('Cleanup operation failed:', error);
      results.success = false;
      results.errors.push(errorMessage(error));
    }

    log.info('Cleanup completed:', results);
    return results;
  }

  /**
   * Cleanup temporary files
   */
  async cleanupTempFiles(force = false): Promise<CleanupResult> {
    log.info('Cleaning up temporary files');

    const result: CleanupResult = {
      cleaned: 0,
      freed: 0,
      errors: [],
    };

    try {
      const files = await fsPromises.readdir(this.tempDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);

        try {
          const stats = await fsPromises.stat(filePath);
          const age = now - stats.mtime.getTime();

          // Clean if old enough or forced
          if (force || age > CLEANUP_POLICIES.TEMP_FILE_AGE) {
            const size = await this.getDirectorySize(filePath);

            if (stats.isDirectory()) {
              await fsPromises.rm(filePath, { recursive: true, force: true });
            } else {
              await fsPromises.unlink(filePath);
            }

            result.cleaned++;
            result.freed += size;
            log.debug(`Cleaned: ${file} (${this.formatSize(size)})`);
          }
        } catch (error) {
          log.error(`Failed to clean ${file}:`, error);
          result.errors.push(`${file}: ${errorMessage(error)}`);
        }
      }
    } catch (error) {
      log.error('Failed to read temp directory:', error);
      result.errors.push(errorMessage(error));
    }

    return result;
  }

  /**
   * Cleanup old repositories
   */
  async cleanupOldRepositories(force = false): Promise<CleanupResult> {
    log.info('Cleaning up old repositories');

    const result: CleanupResult = {
      cleaned: 0,
      freed: 0,
      errors: [],
    };

    try {
      const files = await fsPromises.readdir(this.tempDir);
      const now = Date.now();

      for (const file of files) {
        if (!file.startsWith('workspace-')) continue;

        const repoPath = path.join(this.tempDir, file);

        try {
          const stats = await fsPromises.stat(repoPath);

          if (stats.isDirectory()) {
            const age = now - stats.mtime.getTime();

            // Check if it's an old repository
            if (force || age > CLEANUP_POLICIES.OLD_REPO_AGE) {
              const size = await this.getDirectorySize(repoPath);

              // Remove repository
              await this.removeRepository(repoPath);

              result.cleaned++;
              result.freed += size;
              log.debug(`Cleaned repository: ${file} (${this.formatSize(size)})`);
            }
          }
        } catch (error) {
          log.error(`Failed to clean repository ${file}:`, error);
          result.errors.push(`${file}: ${errorMessage(error)}`);
        }
      }
    } catch (error) {
      log.error('Failed to cleanup repositories:', error);
      result.errors.push(errorMessage(error));
    }

    return result;
  }

  /**
   * Cleanup old SSH keys
   */
  async cleanupOldSSHKeys(force = false): Promise<SSHCleanupResult> {
    log.info('Cleaning up old SSH keys');

    const result: SSHCleanupResult = {
      cleaned: 0,
      errors: [],
    };

    try {
      const files = await fsPromises.readdir(this.sshDir);
      const now = Date.now();

      for (const file of files) {
        if (!file.startsWith('git-ssh-key-')) continue;

        const keyPath = path.join(this.sshDir, file);

        try {
          const stats = await fsPromises.stat(keyPath);
          const age = now - stats.mtime.getTime();

          // Clean if old enough or forced
          if (force || age > CLEANUP_POLICIES.SSH_KEY_AGE) {
            await fsPromises.unlink(keyPath);
            result.cleaned++;
            log.debug(`Cleaned SSH key: ${file}`);

            // Also remove associated files (.pub, config)
            const associatedFiles = [`${keyPath}.pub`, `${keyPath}-config`];
            for (const associated of associatedFiles) {
              try {
                await fsPromises.unlink(associated);
                result.cleaned++;
              } catch (_error) {
                // Ignore if file doesn't exist
              }
            }
          }
        } catch (error) {
          log.error(`Failed to clean SSH key ${file}:`, error);
          result.errors.push(`${file}: ${errorMessage(error)}`);
        }
      }
    } catch (error) {
      log.error('Failed to cleanup SSH keys:', error);
      result.errors.push(errorMessage(error));
    }

    return result;
  }

  /**
   * Remove a repository directory
   */
  async removeRepository(repoPath: string): Promise<void> {
    try {
      // First try to clean git locks if any
      await this.cleanGitLocks(repoPath);

      // Remove the repository
      await fsPromises.rm(repoPath, { recursive: true, force: true });
    } catch (error) {
      log.error(`Failed to remove repository ${repoPath}:`, error);

      // Try harder on Windows
      if (process.platform === 'win32') {
        try {
          await new Promise<void>((resolve, reject) => {
            exec(`rmdir /s /q "${repoPath}"`, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        } catch (_winError) {
          throw error; // Throw original error
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Clean Git lock files
   */
  async cleanGitLocks(repoPath: string): Promise<void> {
    const gitDir = path.join(repoPath, '.git');
    const lockFiles = ['index.lock', 'HEAD.lock', 'config.lock'];

    for (const lockFile of lockFiles) {
      const lockPath = path.join(gitDir, lockFile);
      try {
        await fsPromises.unlink(lockPath);
        log.debug(`Removed lock file: ${lockFile}`);
      } catch (_error) {
        // Ignore if file doesn't exist
      }
    }
  }

  /**
   * Get directory size recursively
   */
  async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;

    try {
      const stats = await fsPromises.stat(dirPath);

      if (stats.isFile()) {
        return stats.size;
      }

      if (stats.isDirectory()) {
        const files = await fsPromises.readdir(dirPath);

        for (const file of files) {
          const filePath = path.join(dirPath, file);
          size += await this.getDirectorySize(filePath);
        }
      }
    } catch (_error) {
      // Ignore errors for individual files
    }

    return size;
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(): Promise<CleanupStats> {
    const stats: CleanupStats = {
      tempDir: {
        path: this.tempDir,
        size: 0,
        fileCount: 0,
        oldFileCount: 0,
      },
      sshDir: {
        path: this.sshDir,
        keyCount: 0,
        oldKeyCount: 0,
      },
      totalSize: 0,
    };

    try {
      // Temp directory stats
      const tempFiles = await fsPromises.readdir(this.tempDir);
      const now = Date.now();

      for (const file of tempFiles) {
        const filePath = path.join(this.tempDir, file);
        const fileStats = await fsPromises.stat(filePath);
        const size = await this.getDirectorySize(filePath);

        stats.tempDir.size += size;
        stats.tempDir.fileCount++;

        if (now - fileStats.mtime.getTime() > CLEANUP_POLICIES.TEMP_FILE_AGE) {
          stats.tempDir.oldFileCount++;
        }
      }

      // SSH directory stats
      const sshFiles = await fsPromises.readdir(this.sshDir);

      for (const file of sshFiles) {
        if (file.startsWith('git-ssh-key-')) {
          stats.sshDir.keyCount++;

          const keyPath = path.join(this.sshDir, file);
          const keyStats = await fsPromises.stat(keyPath);

          if (now - keyStats.mtime.getTime() > CLEANUP_POLICIES.SSH_KEY_AGE) {
            stats.sshDir.oldKeyCount++;
          }
        }
      }

      stats.totalSize = stats.tempDir.size;
    } catch (error) {
      log.error('Failed to get cleanup statistics:', error);
    }

    return stats;
  }

  /**
   * Check if cleanup is needed
   */
  async isCleanupNeeded(): Promise<boolean> {
    try {
      const stats = await this.getCleanupStats();

      // Cleanup needed if:
      // - Total size exceeds limit
      // - Too many old files
      // - Too many old SSH keys
      return (
        stats.totalSize > CLEANUP_POLICIES.MAX_TEMP_SIZE ||
        stats.tempDir.oldFileCount > 10 ||
        stats.sshDir.oldKeyCount > 5
      );
    } catch (_error) {
      return false;
    }
  }

  /**
   * Format size for display
   */
  formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Schedule periodic cleanup
   */
  schedulePeriodicCleanup(intervalHours = 24): () => void {
    log.info(`Scheduling cleanup every ${intervalHours} hours`);

    const performCleanup = async () => {
      try {
        const needed = await this.isCleanupNeeded();
        if (needed) {
          log.info('Cleanup needed, performing cleanup');
          await this.performCleanup();
        }
      } catch (error) {
        log.error('Scheduled cleanup failed:', error);
      }
    };

    // Perform initial cleanup
    performCleanup();

    // Schedule periodic cleanup
    const interval = setInterval(performCleanup, intervalHours * 60 * 60 * 1000);

    // Return function to stop cleanup
    return () => {
      clearInterval(interval);
      log.info('Stopped periodic cleanup');
    };
  }

  /**
   * Cleanup a single directory
   */
  async cleanupDirectory(dir: string): Promise<void> {
    return this.removeRepository(dir);
  }
}

export type { CleanupPaths, CleanupResult, CleanupStats, FullCleanupResult, SSHCleanupResult };
export { CLEANUP_POLICIES, GitCleanupManager };
export default GitCleanupManager;
