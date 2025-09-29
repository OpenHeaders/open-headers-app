/**
 * Atomic File Writer - Ensures safe file operations with no data corruption
 * 
 * Features:
 * - Atomic writes using temp files + rename
 * - File locking to prevent concurrent writes
 * - Write queue to serialize operations
 * - Automatic retry with exponential backoff
 * - JSON validation before writes
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger } = require('./mainLogger');

const log = createLogger('AtomicFileWriter');

class AtomicFileWriter {
  constructor() {
    // Track active write operations per file
    this.writeQueues = new Map();
    this.lockFiles = new Map();
    
    // Clean up stale lock files on startup (runs async in background)
    this.cleanupStaleLocks().catch(err => {
      log.debug('Stale lock cleanup error (non-critical):', err.message);
    });
  }

  /**
   * Clean up stale lock files from previous sessions
   */
  async cleanupStaleLocks() {
    try {
      // This runs async in background, don't await
      const { app } = require('electron');
      if (!app || !app.getPath) return; // Not in Electron context
      
      const userDataPath = app.getPath('userData');
      const walkDir = async (dir) => {
        try {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.lock')) {
              const lockPath = path.join(dir, entry.name);
              try {
                const stats = await fs.promises.stat(lockPath);
                // Remove lock files older than 1 hour (likely stale)
                if (Date.now() - stats.mtime.getTime() > 3600000) {
                  await fs.promises.unlink(lockPath);
                  log.debug(`Removed stale lock file: ${lockPath}`);
                }
              } catch (err) {
                // Ignore errors
              }
            } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
              // Recursively clean subdirectories
              await walkDir(path.join(dir, entry.name));
            }
          }
        } catch (err) {
          // Ignore errors during cleanup
        }
      };
      
      walkDir(userDataPath).catch(() => {});
    } catch (err) {
      // Ignore errors - this is best effort cleanup
    }
  }

  /**
   * Write data atomically to a file
   * @param {string} filePath - Full path to the file
   * @param {string|Buffer} content - Content to write (string or Buffer)
   * @param {object} options - Write options
   * @returns {Promise<void>}
   */
  async writeFile(filePath, content, options = {}) {
    const { 
      validateJson = false, 
      maxRetries = 3, 
      retryDelay = 100 
    } = options;

    // Validate JSON if requested
    if (validateJson) {
      if (Buffer.isBuffer(content)) {
        throw new Error('Cannot validate JSON for Buffer content');
      }
      try {
        JSON.parse(content);
      } catch (error) {
        throw new Error(`Invalid JSON content: ${error.message}`);
      }
    }

    // Queue the write operation for this file
    return this.queueWrite(filePath, async () => {
      let lastError;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          await this.performAtomicWrite(filePath, content);
          return;
        } catch (error) {
          lastError = error;
          log.warn(`Write attempt ${attempt + 1} failed for ${filePath}:`, error.message);
          
          if (attempt < maxRetries - 1) {
            // Exponential backoff
            const delay = retryDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      throw lastError || new Error('All write attempts failed');
    });
  }

  /**
   * Queue write operations for a specific file
   * @param {string} filePath - File path
   * @param {Function} writeOperation - Write operation to queue
   * @returns {Promise}
   */
  async queueWrite(filePath, writeOperation) {
    // Get or create queue for this file
    if (!this.writeQueues.has(filePath)) {
      this.writeQueues.set(filePath, Promise.resolve());
    }

    // Chain the new write operation
    const queue = this.writeQueues.get(filePath);
    const newQueue = queue
      .then(() => writeOperation())
      .catch(error => {
        log.error(`Write failed for ${filePath}:`, error);
        throw error;
      })
      .finally(() => {
        // Clean up queue if this was the last operation
        if (this.writeQueues.get(filePath) === newQueue) {
          this.writeQueues.delete(filePath);
        }
      });

    this.writeQueues.set(filePath, newQueue);
    return newQueue;
  }

  /**
   * Perform the actual atomic write
   * @param {string} filePath - Target file path
   * @param {string|Buffer} content - Content to write
   * @returns {Promise<void>}
   */
  async performAtomicWrite(filePath, content) {
    const dir = path.dirname(filePath);
    // Use process.pid to make temp files unique per process
    const tempFileName = `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    const tempPath = path.join(dir, tempFileName);
    const lockPath = `${filePath}.lock`;

    try {
      // Ensure directory exists
      await fs.promises.mkdir(dir, { recursive: true });

      // Acquire lock
      await this.acquireLock(lockPath);

      try {
        // Write to temp file - handle both string and Buffer content
        if (Buffer.isBuffer(content)) {
          await fs.promises.writeFile(tempPath, content, { flag: 'w' });
        } else {
          await fs.promises.writeFile(tempPath, content, { encoding: 'utf8', flag: 'w' });
        }

        // Sync to disk (important for atomicity)
        // Different approach for different platforms
        if (process.platform === 'win32') {
          // Windows-specific: Use a different approach
          try {
            // On Windows, we can't always sync, but the rename is still atomic
            // Adding a small delay helps ensure write is complete
            await new Promise(resolve => setTimeout(resolve, 10));
          } catch (syncError) {
            log.debug(`Windows file sync skipped: ${syncError.message}`);
          }
        } else {
          // Unix-like systems (macOS, Linux)
          try {
            const fd = await fs.promises.open(tempPath, 'r');
            await fd.sync();
            await fd.close();
          } catch (syncError) {
            // Fallback if sync fails
            log.debug(`Could not sync file to disk: ${syncError.message}`);
          }
        }

        // Handle platform-specific rename behavior
        if (process.platform === 'win32') {
          // Windows: Delete target file first if it exists (rename doesn't overwrite)
          // Try multiple times in case file is momentarily in use
          for (let i = 0; i < 3; i++) {
            try {
              await fs.promises.unlink(filePath);
              break; // Successfully deleted
            } catch (unlinkError) {
              if (unlinkError.code === 'ENOENT') {
                // File doesn't exist, that's fine
                break;
              } else if (unlinkError.code === 'EBUSY' || unlinkError.code === 'EACCES') {
                // File is in use, wait and retry
                await new Promise(resolve => setTimeout(resolve, 50 * (i + 1)));
              } else {
                log.debug(`Could not remove existing file on Windows: ${unlinkError.message}`);
                break;
              }
            }
          }
        }

        // Atomic rename (atomic on POSIX, best-effort on Windows)
        await fs.promises.rename(tempPath, filePath);

        log.debug(`Atomic write completed: ${filePath}`);
      } finally {
        // Release lock
        await this.releaseLock(lockPath);
      }
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.promises.unlink(tempPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      throw error;
    }
  }

  /**
   * Acquire a file lock (cross-platform)
   * @param {string} lockPath - Path to lock file
   * @param {number} maxWaitTime - Maximum time to wait for lock in ms (default: 5000)
   * @returns {Promise<void>}
   */
  async acquireLock(lockPath, maxWaitTime = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Try to create lock file exclusively
        // 'wx' flag: write exclusive (fails if file exists)
        // Works on Windows, macOS, and Linux
        const fd = await fs.promises.open(lockPath, 'wx');
        await fd.close();
        this.lockFiles.set(lockPath, true);
        return;
      } catch (error) {
        if (error.code === 'EEXIST') {
          // Lock exists, wait and retry
          await new Promise(resolve => setTimeout(resolve, 50));
        } else if (error.code === 'EPERM' && process.platform === 'win32') {
          // Windows permission error - file might be locked by another process
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          throw error;
        }
      }
    }
    
    // Timeout - force acquire by removing stale lock
    log.warn(`Lock timeout for ${lockPath}, forcing acquisition`);
    try {
      await fs.promises.unlink(lockPath);
    } catch (error) {
      // Ignore if lock was already removed
      if (error.code !== 'ENOENT') {
        log.debug(`Could not remove stale lock: ${error.message}`);
      }
    }
    
    // Try one more time with a small delay
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      const fd = await fs.promises.open(lockPath, 'wx');
      await fd.close();
      this.lockFiles.set(lockPath, true);
    } catch (finalError) {
      // If still failing, proceed without lock (best effort)
      log.warn(`Could not acquire lock for ${lockPath}, proceeding without lock`);
      this.lockFiles.set(lockPath, true);
    }
  }

  /**
   * Release a file lock
   * @param {string} lockPath - Path to lock file
   * @returns {Promise<void>}
   */
  async releaseLock(lockPath) {
    if (!this.lockFiles.has(lockPath)) {
      return;
    }

    try {
      await fs.promises.unlink(lockPath);
      this.lockFiles.delete(lockPath);
    } catch (error) {
      // Ignore if lock was already removed
      log.debug(`Failed to remove lock ${lockPath}:`, error.message);
    }
  }

  /**
   * Clean up all locks (call on app shutdown)
   */
  async cleanup() {
    const locks = Array.from(this.lockFiles.keys());
    for (const lockPath of locks) {
      await this.releaseLock(lockPath);
    }
  }

  /**
   * Read file with lock support
   * @param {string} filePath - File to read
   * @returns {Promise<string>}
   */
  async readFile(filePath) {
    const lockPath = `${filePath}.lock`;
    
    // Wait for any active writes to complete
    if (this.writeQueues.has(filePath)) {
      await this.writeQueues.get(filePath).catch(() => {});
    }

    try {
      // Acquire read lock
      await this.acquireLock(lockPath);
      
      try {
        return await fs.promises.readFile(filePath, 'utf8');
      } finally {
        await this.releaseLock(lockPath);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Write JSON data atomically
   * @param {string} filePath - Target file path
   * @param {any} data - Data to serialize as JSON
   * @param {object} options - Write options
   * @returns {Promise<void>}
   */
  async writeJson(filePath, data, options = {}) {
    const { pretty = true, ...writeOptions } = options;
    const content = pretty 
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);
    
    return this.writeFile(filePath, content, {
      ...writeOptions,
      validateJson: true
    });
  }

  /**
   * Read and parse JSON file
   * @param {string} filePath - File to read
   * @returns {Promise<any>}
   */
  async readJson(filePath) {
    const content = await this.readFile(filePath);
    if (content === null) {
      return null;
    }
    
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
    }
  }
}

// Create singleton instance
const atomicWriter = new AtomicFileWriter();

// Clean up on process exit
process.on('exit', () => {
  atomicWriter.cleanup().catch(() => {});
});

process.on('SIGINT', () => {
  atomicWriter.cleanup().then(() => process.exit(0)).catch(() => process.exit(1));
});

process.on('SIGTERM', () => {
  atomicWriter.cleanup().then(() => process.exit(0)).catch(() => process.exit(1));
});

module.exports = atomicWriter;