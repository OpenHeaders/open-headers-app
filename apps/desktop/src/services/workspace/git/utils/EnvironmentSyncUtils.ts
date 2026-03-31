/**
 * Environment Sync Utilities
 *
 * Helper functions for safe environment variable synchronization.
 * These utilities ensure data integrity during Git sync operations by:
 * - Coordinating reads with the atomic file writer
 * - Providing retry logic for transient errors
 * - Detecting potential data loss before writes
 * - Managing automatic backups
 */

import { errorMessage, toError } from '@openheaders/core';
import { toErrno } from '@/types/common';
import type { EnvironmentMap } from '@/types/environment';
import atomicWriter from '@/utils/atomicFileWriter';
import mainLogger from '@/utils/mainLogger';

const { createLogger } = mainLogger;

const log = createLogger('EnvironmentSyncUtils');

// Constants
const ENV_FILE_READ_MAX_RETRIES = 3;
const ENV_FILE_READ_RETRY_DELAY = 500; // Base delay between retries in ms

interface ReadFileResult {
  exists: boolean;
  content: string | null;
}

interface WriteValidation {
  safe: boolean;
  lossPercentage: number;
  shouldBackup: boolean;
  shouldBlock: boolean;
}

interface FsPromises {
  access: (path: string) => Promise<void>;
  copyFile: (src: string, dest: string) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
  unlink: (path: string) => Promise<void>;
}

interface PathModule {
  join: (...paths: string[]) => string;
}

/**
 * Count the number of non-empty environment variable values
 * Used to detect if we're about to lose data during sync
 */
function countNonEmptyEnvValues(environments: EnvironmentMap | null | undefined): number {
  let count = 0;
  if (!environments) return 0;

  for (const envVars of Object.values(environments)) {
    for (const varData of Object.values(envVars)) {
      if (varData.value) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Read a file with retry logic for transient errors using atomicWriter for proper coordination
 */
async function readFileWithAtomicWriter(
  filePath: string,
  maxRetries = ENV_FILE_READ_MAX_RETRIES,
  retryDelay = ENV_FILE_READ_RETRY_DELAY,
): Promise<ReadFileResult> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const content = await atomicWriter.readFile(filePath);

      if (content === null) {
        // File doesn't exist - this is OK, not an error
        return { exists: false, content: null };
      }

      // File exists and was read successfully
      return { exists: true, content };
    } catch (error) {
      lastError = toError(error);

      // For transient errors (EBUSY, EIO, EAGAIN, etc.), retry with exponential backoff
      if (attempt < maxRetries) {
        log.warn(`Retry ${attempt}/${maxRetries} reading ${filePath} via atomicWriter: ${errorMessage(error)}`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }

  // All retries exhausted - throw the last error
  throw lastError;
}

/**
 * Create a backup of a file before potentially destructive operations
 */
async function createBackupIfNeeded(fs: FsPromises, filePath: string): Promise<string | null> {
  try {
    // Check if file exists
    await fs.access(filePath);

    // Create backup with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup-${timestamp}`;
    await fs.copyFile(filePath, backupPath);

    log.info(`Created backup: ${backupPath}`);
    return backupPath;
  } catch (error) {
    if (toErrno(error).code === 'ENOENT') {
      // File doesn't exist, no backup needed
      return null;
    }
    log.warn(`Failed to create backup of ${filePath}: ${errorMessage(error)}`);
    return null;
  }
}

/**
 * Clean up old backup files, keeping only the most recent ones
 */
async function cleanupOldBackups(
  fs: FsPromises,
  workspacePath: string,
  pathModule: PathModule,
  maxBackups = 3,
): Promise<void> {
  try {
    const files = await fs.readdir(workspacePath);
    const backupFiles = files.filter((f) => f.includes('.backup-'));

    // Group by original file name
    const backupGroups: Record<string, string[]> = {};
    for (const backup of backupFiles) {
      const baseName = backup.split('.backup-')[0];
      if (!backupGroups[baseName]) {
        backupGroups[baseName] = [];
      }
      backupGroups[baseName].push(backup);
    }

    // For each group, delete old backups
    for (const [, backups] of Object.entries(backupGroups)) {
      if (backups.length > maxBackups) {
        // Sort by timestamp (newest first) and delete oldest
        backups.sort().reverse();
        const toDelete = backups.slice(maxBackups);
        for (const backup of toDelete) {
          try {
            await fs.unlink(pathModule.join(workspacePath, backup));
            log.debug(`Deleted old backup: ${backup}`);
          } catch (_e) {
            // Ignore deletion errors
          }
        }
      }
    }
  } catch (error) {
    // Ignore cleanup errors
    log.debug(`Backup cleanup skipped: ${errorMessage(error)}`);
  }
}

/**
 * Validate if environment data write is safe (won't cause data loss)
 */
function validateEnvironmentWrite(existingValueCount: number, newValueCount: number): WriteValidation {
  // No existing values - always safe to write
  if (existingValueCount === 0) {
    return { safe: true, lossPercentage: 0, shouldBackup: false, shouldBlock: false };
  }

  // Would result in zero values - BLOCK
  if (newValueCount === 0) {
    return { safe: false, lossPercentage: 100, shouldBackup: true, shouldBlock: true };
  }

  // Calculate loss percentage
  const valueLoss = existingValueCount - newValueCount;
  const lossPercentage = valueLoss > 0 ? Math.round((valueLoss / existingValueCount) * 100) : 0;

  return {
    safe: lossPercentage < 50,
    lossPercentage,
    shouldBackup: lossPercentage > 50,
    shouldBlock: false,
  };
}

export type { ReadFileResult, WriteValidation };
export {
  cleanupOldBackups,
  // Functions
  countNonEmptyEnvValues,
  createBackupIfNeeded,
  // Constants
  ENV_FILE_READ_MAX_RETRIES,
  ENV_FILE_READ_RETRY_DELAY,
  readFileWithAtomicWriter,
  validateEnvironmentWrite,
};
