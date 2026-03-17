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

import mainLogger from '../../../../utils/mainLogger.js';
import atomicWriter from '../../../../utils/atomicFileWriter.js';

const { createLogger } = mainLogger;

const log = createLogger('EnvironmentSyncUtils');

// Constants
const ENV_FILE_READ_MAX_RETRIES = 3;
const ENV_FILE_READ_RETRY_DELAY = 500; // Base delay between retries in ms

interface VarData {
  value?: string;
  isSecret?: boolean;
  [key: string]: any;
}

interface ExtractedVarData {
  value: string;
  isSecret: boolean;
  hasNonEmptyValue: boolean;
}

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
function countNonEmptyEnvValues(environments: Record<string, Record<string, VarData | string>> | null | undefined): number {
  let count = 0;
  if (!environments || typeof environments !== 'object') return 0;

  for (const envVars of Object.values(environments)) {
    if (typeof envVars === 'object' && envVars !== null) {
      for (const varData of Object.values(envVars)) {
        const value = typeof varData === 'object' && varData !== null
          ? (varData as VarData).value
          : varData;
        if (value !== '' && value !== null && value !== undefined) {
          count++;
        }
      }
    }
  }
  return count;
}

/**
 * Read a file with retry logic for transient errors using atomicWriter for proper coordination
 */
async function readFileWithAtomicWriter(filePath: string, maxRetries = ENV_FILE_READ_MAX_RETRIES, retryDelay = ENV_FILE_READ_RETRY_DELAY): Promise<ReadFileResult> {
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
      lastError = error as Error;

      // For transient errors (EBUSY, EIO, EAGAIN, etc.), retry with exponential backoff
      if (attempt < maxRetries) {
        log.warn(`Retry ${attempt}/${maxRetries} reading ${filePath} via atomicWriter: ${(error as Error).message}`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
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
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist, no backup needed
      return null;
    }
    log.warn(`Failed to create backup of ${filePath}: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Clean up old backup files, keeping only the most recent ones
 */
async function cleanupOldBackups(fs: FsPromises, workspacePath: string, pathModule: PathModule, maxBackups = 3): Promise<void> {
  try {
    const files = await fs.readdir(workspacePath);
    const backupFiles = files.filter(f => f.includes('.backup-'));

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
          } catch (e) {
            // Ignore deletion errors
          }
        }
      }
    }
  } catch (error) {
    // Ignore cleanup errors
    log.debug(`Backup cleanup skipped: ${(error as Error).message}`);
  }
}

/**
 * Extract value and isSecret from variable data in either string or object format
 */
function extractVarData(varData: unknown): ExtractedVarData {
  let value = '';
  let isSecret = false;

  if (typeof varData === 'string') {
    value = varData;
  } else if (varData && typeof varData === 'object') {
    value = (varData as VarData).value !== undefined ? (varData as VarData).value! : '';
    isSecret = (varData as VarData).isSecret || false;
  }

  const hasNonEmptyValue = value !== '' && value !== null && value !== undefined;

  return { value, isSecret, hasNonEmptyValue };
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
    shouldBlock: false
  };
}

export {
  // Constants
  ENV_FILE_READ_MAX_RETRIES,
  ENV_FILE_READ_RETRY_DELAY,

  // Functions
  countNonEmptyEnvValues,
  readFileWithAtomicWriter,
  createBackupIfNeeded,
  cleanupOldBackups,
  extractVarData,
  validateEnvironmentWrite
};

export type { VarData, ExtractedVarData, ReadFileResult, WriteValidation };
