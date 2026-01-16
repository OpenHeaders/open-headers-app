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

const { createLogger } = require('../../../../utils/mainLogger');
const atomicWriter = require('../../../../utils/atomicFileWriter');

const log = createLogger('EnvironmentSyncUtils');

// Constants
const ENV_FILE_READ_MAX_RETRIES = 3;
const ENV_FILE_READ_RETRY_DELAY = 500; // Base delay between retries in ms

/**
 * Count the number of non-empty environment variable values
 * Used to detect if we're about to lose data during sync
 * @param {Object} environments - Environment object with structure {envName: {varName: {value: string}}}
 * @returns {number} - Count of variables with non-empty values
 */
function countNonEmptyEnvValues(environments) {
  let count = 0;
  if (!environments || typeof environments !== 'object') return 0;

  for (const envVars of Object.values(environments)) {
    if (typeof envVars === 'object' && envVars !== null) {
      for (const varData of Object.values(envVars)) {
        const value = typeof varData === 'object' && varData !== null
          ? varData.value
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
 *
 * Uses atomicWriter.readFile() which:
 * - Waits for any active writes to complete (coordinates with write queue)
 * - Acquires file lock before reading
 * - Returns null if file doesn't exist (ENOENT)
 * - Throws for other errors
 *
 * This function adds retry logic on top for transient errors (EBUSY, EIO, EAGAIN, etc.)
 *
 * @param {string} filePath - Path to the file
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} retryDelay - Base delay between retries in ms (increases with each retry)
 * @returns {Promise<{exists: boolean, content: string|null}>} - Object with exists flag and content
 */
async function readFileWithAtomicWriter(filePath, maxRetries = ENV_FILE_READ_MAX_RETRIES, retryDelay = ENV_FILE_READ_RETRY_DELAY) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // atomicWriter.readFile():
      // - Returns file content (string) if file exists
      // - Returns null if file doesn't exist (ENOENT)
      // - Throws for other errors (EBUSY, EIO, permission errors, etc.)
      const content = await atomicWriter.readFile(filePath);

      if (content === null) {
        // File doesn't exist - this is OK, not an error
        return { exists: false, content: null };
      }

      // File exists and was read successfully
      return { exists: true, content };

    } catch (error) {
      lastError = error;

      // For transient errors (EBUSY, EIO, EAGAIN, etc.), retry with exponential backoff
      if (attempt < maxRetries) {
        log.warn(`Retry ${attempt}/${maxRetries} reading ${filePath} via atomicWriter: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }

  // All retries exhausted - throw the last error
  throw lastError;
}

/**
 * Create a backup of a file before potentially destructive operations
 * @param {Object} fs - fs.promises module
 * @param {string} filePath - Path to the file to backup
 * @returns {Promise<string|null>} - Path to backup file, or null if no backup needed/created
 */
async function createBackupIfNeeded(fs, filePath) {
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
    if (error.code === 'ENOENT') {
      // File doesn't exist, no backup needed
      return null;
    }
    log.warn(`Failed to create backup of ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Clean up old backup files, keeping only the most recent ones
 * @param {Object} fs - fs.promises module
 * @param {string} workspacePath - Path to workspace directory
 * @param {Object} path - path module
 * @param {number} maxBackups - Maximum number of backups to keep per file type
 */
async function cleanupOldBackups(fs, workspacePath, path, maxBackups = 3) {
  try {
    const files = await fs.readdir(workspacePath);
    const backupFiles = files.filter(f => f.includes('.backup-'));

    // Group by original file name
    const backupGroups = {};
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
            await fs.unlink(path.join(workspacePath, backup));
            log.debug(`Deleted old backup: ${backup}`);
          } catch (e) {
            // Ignore deletion errors
          }
        }
      }
    }
  } catch (error) {
    // Ignore cleanup errors
    log.debug(`Backup cleanup skipped: ${error.message}`);
  }
}

/**
 * Extract value and isSecret from variable data in either string or object format
 * @param {unknown} varData - Variable data (can be string or {value, isSecret} object)
 * @returns {{value: string, isSecret: boolean, hasNonEmptyValue: boolean}}
 */
function extractVarData(varData) {
  let value = '';
  let isSecret = false;

  if (typeof varData === 'string') {
    value = varData;
  } else if (varData && typeof varData === 'object') {
    value = varData.value !== undefined ? varData.value : '';
    isSecret = varData.isSecret || false;
  }

  const hasNonEmptyValue = value !== '' && value !== null && value !== undefined;

  return { value, isSecret, hasNonEmptyValue };
}

/**
 * Validate if environment data write is safe (won't cause data loss)
 * @param {number} existingValueCount - Number of values in existing file
 * @param {number} newValueCount - Number of values in new data
 * @returns {{safe: boolean, lossPercentage: number, shouldBackup: boolean, shouldBlock: boolean}}
 */
function validateEnvironmentWrite(existingValueCount, newValueCount) {
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

module.exports = {
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
