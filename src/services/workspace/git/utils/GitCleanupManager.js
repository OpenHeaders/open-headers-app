/**
 * GitCleanupManager - Handles cleanup operations for Git repositories and resources
 * Manages removal of temporary files, old repositories, and SSH keys
 */

const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../../../../utils/mainLogger');

const log = createLogger('GitCleanupManager');

// Constants for cleanup policies
const CLEANUP_POLICIES = {
  TEMP_FILE_AGE: 24 * 60 * 60 * 1000, // 24 hours
  OLD_REPO_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days
  SSH_KEY_AGE: 30 * 24 * 60 * 60 * 1000, // 30 days
  MAX_TEMP_SIZE: 1024 * 1024 * 1024, // 1GB
};

class GitCleanupManager {
  constructor(paths) {
    this.tempDir = paths.tempDir;
    this.sshDir = paths.sshDir;
  }

  /**
   * Perform full cleanup
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} - Cleanup result
   */
  async performCleanup(options = {}) {
    const {
      cleanTemp = true,
      cleanOldRepos = true,
      cleanSSHKeys = true,
      force = false
    } = options;

    log.info('Starting cleanup operation');

    const results = {
      tempFiles: { cleaned: 0, freed: 0 },
      oldRepos: { cleaned: 0, freed: 0 },
      sshKeys: { cleaned: 0 },
      errors: []
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
      results.errors.push(error.message);
    }

    log.info('Cleanup completed:', results);
    return results;
  }

  /**
   * Cleanup temporary files
   * @param {boolean} force - Force cleanup regardless of age
   * @returns {Promise<Object>} - Cleanup result
   */
  async cleanupTempFiles(force = false) {
    log.info('Cleaning up temporary files');

    const result = {
      cleaned: 0,
      freed: 0,
      errors: []
    };

    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        
        try {
          const stats = await fs.stat(filePath);
          const age = now - stats.mtime.getTime();

          // Clean if old enough or forced
          if (force || age > CLEANUP_POLICIES.TEMP_FILE_AGE) {
            const size = await this.getDirectorySize(filePath);
            
            if (stats.isDirectory()) {
              await fs.rm(filePath, { recursive: true, force: true });
            } else {
              await fs.unlink(filePath);
            }

            result.cleaned++;
            result.freed += size;
            log.debug(`Cleaned: ${file} (${this.formatSize(size)})`);
          }
        } catch (error) {
          log.error(`Failed to clean ${file}:`, error);
          result.errors.push(`${file}: ${error.message}`);
        }
      }

    } catch (error) {
      log.error('Failed to read temp directory:', error);
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Cleanup old repositories
   * @param {boolean} force - Force cleanup regardless of age
   * @returns {Promise<Object>} - Cleanup result
   */
  async cleanupOldRepositories(force = false) {
    log.info('Cleaning up old repositories');

    const result = {
      cleaned: 0,
      freed: 0,
      errors: []
    };

    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();

      for (const file of files) {
        if (!file.startsWith('workspace-')) continue;

        const repoPath = path.join(this.tempDir, file);
        
        try {
          const stats = await fs.stat(repoPath);
          
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
          result.errors.push(`${file}: ${error.message}`);
        }
      }

    } catch (error) {
      log.error('Failed to cleanup repositories:', error);
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Cleanup old SSH keys
   * @param {boolean} force - Force cleanup regardless of age
   * @returns {Promise<Object>} - Cleanup result
   */
  async cleanupOldSSHKeys(force = false) {
    log.info('Cleaning up old SSH keys');

    const result = {
      cleaned: 0,
      errors: []
    };

    try {
      const files = await fs.readdir(this.sshDir);
      const now = Date.now();

      for (const file of files) {
        if (!file.startsWith('git-ssh-key-')) continue;

        const keyPath = path.join(this.sshDir, file);
        
        try {
          const stats = await fs.stat(keyPath);
          const age = now - stats.mtime.getTime();

          // Clean if old enough or forced
          if (force || age > CLEANUP_POLICIES.SSH_KEY_AGE) {
            await fs.unlink(keyPath);
            result.cleaned++;
            log.debug(`Cleaned SSH key: ${file}`);

            // Also remove associated files (.pub, config)
            const associatedFiles = [`${keyPath}.pub`, `${keyPath}-config`];
            for (const associated of associatedFiles) {
              try {
                await fs.unlink(associated);
                result.cleaned++;
              } catch (error) {
                // Ignore if file doesn't exist
              }
            }
          }
        } catch (error) {
          log.error(`Failed to clean SSH key ${file}:`, error);
          result.errors.push(`${file}: ${error.message}`);
        }
      }

    } catch (error) {
      log.error('Failed to cleanup SSH keys:', error);
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Remove a repository directory
   * @param {string} repoPath - Repository path
   */
  async removeRepository(repoPath) {
    try {
      // First try to clean git locks if any
      await this.cleanGitLocks(repoPath);
      
      // Remove the repository
      await fs.rm(repoPath, { recursive: true, force: true });
    } catch (error) {
      log.error(`Failed to remove repository ${repoPath}:`, error);
      
      // Try harder on Windows
      if (process.platform === 'win32') {
        try {
          const { exec } = require('child_process');
          await new Promise((resolve, reject) => {
            exec(`rmdir /s /q "${repoPath}"`, (error) => {
              if (error) reject(error);
              else resolve();
            });
          });
        } catch (winError) {
          throw error; // Throw original error
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Clean Git lock files
   * @param {string} repoPath - Repository path
   */
  async cleanGitLocks(repoPath) {
    const gitDir = path.join(repoPath, '.git');
    const lockFiles = ['index.lock', 'HEAD.lock', 'config.lock'];

    for (const lockFile of lockFiles) {
      const lockPath = path.join(gitDir, lockFile);
      try {
        await fs.unlink(lockPath);
        log.debug(`Removed lock file: ${lockFile}`);
      } catch (error) {
        // Ignore if file doesn't exist
      }
    }
  }

  /**
   * Get directory size recursively
   * @param {string} dirPath - Directory path
   * @returns {Promise<number>} - Size in bytes
   */
  async getDirectorySize(dirPath) {
    let size = 0;

    try {
      const stats = await fs.stat(dirPath);
      
      if (stats.isFile()) {
        return stats.size;
      }

      if (stats.isDirectory()) {
        const files = await fs.readdir(dirPath);
        
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          size += await this.getDirectorySize(filePath);
        }
      }
    } catch (error) {
      // Ignore errors for individual files
    }

    return size;
  }

  /**
   * Get cleanup statistics
   * @returns {Promise<Object>} - Cleanup statistics
   */
  async getCleanupStats() {
    const stats = {
      tempDir: {
        path: this.tempDir,
        size: 0,
        fileCount: 0,
        oldFileCount: 0
      },
      sshDir: {
        path: this.sshDir,
        keyCount: 0,
        oldKeyCount: 0
      },
      totalSize: 0
    };

    try {
      // Temp directory stats
      const tempFiles = await fs.readdir(this.tempDir);
      const now = Date.now();
      
      for (const file of tempFiles) {
        const filePath = path.join(this.tempDir, file);
        const fileStats = await fs.stat(filePath);
        const size = await this.getDirectorySize(filePath);
        
        stats.tempDir.size += size;
        stats.tempDir.fileCount++;
        
        if (now - fileStats.mtime.getTime() > CLEANUP_POLICIES.TEMP_FILE_AGE) {
          stats.tempDir.oldFileCount++;
        }
      }

      // SSH directory stats
      const sshFiles = await fs.readdir(this.sshDir);
      
      for (const file of sshFiles) {
        if (file.startsWith('git-ssh-key-')) {
          stats.sshDir.keyCount++;
          
          const keyPath = path.join(this.sshDir, file);
          const keyStats = await fs.stat(keyPath);
          
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
   * @returns {Promise<boolean>} - Whether cleanup is needed
   */
  async isCleanupNeeded() {
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
    } catch (error) {
      return false;
    }
  }

  /**
   * Format size for display
   * @param {number} bytes - Size in bytes
   * @returns {string} - Formatted size
   */
  formatSize(bytes) {
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
   * @param {number} intervalHours - Cleanup interval in hours
   * @returns {Function} - Function to stop the scheduled cleanup
   */
  schedulePeriodicCleanup(intervalHours = 24) {
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
   * @param {string} dir - Directory to cleanup
   */
  async cleanupDirectory(dir) {
    return this.removeRepository(dir);
  }
}

module.exports = GitCleanupManager;