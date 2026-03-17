/**
 * AutoSaveManager - Handles auto-save functionality with conflict prevention
 */
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('AutoSaveManager');

class AutoSaveManager {
  constructor() {
    this.saveTimers = {};
    this.autoSaveInterval = null;
    this.isDirty = {
      sources: false,
      rules: false,
      proxyRules: false
    };
    this.isSaving = false;
    this.saveQueue = [];
    this.workspaceSwitching = false;
  }

  /**
   * Mark data as dirty
   */
  markDirty(dataType) {
    if (dataType in this.isDirty) {
      this.isDirty[dataType] = true;
    }
  }

  /**
   * Mark data as clean
   */
  markClean(dataType) {
    if (dataType in this.isDirty) {
      this.isDirty[dataType] = false;
    }
  }

  /**
   * Check if any data is dirty
   */
  hasDirtyData() {
    return Object.values(this.isDirty).some(dirty => dirty);
  }

  /**
   * Schedule auto-save with conflict prevention
   */
  scheduleAutoSave(saveCallback) {
    // Don't schedule if workspace is switching
    if (this.workspaceSwitching) {
      log.debug('Skipping auto-save during workspace switch');
      return;
    }

    // Clear existing timer
    if (this.saveTimers.global) {
      clearTimeout(this.saveTimers.global);
    }
    
    // Schedule new save in 1 second
    this.saveTimers.global = setTimeout(async () => {
      // Check again if workspace is switching
      if (this.workspaceSwitching) {
        log.debug('Cancelled auto-save due to workspace switch');
        return;
      }

      // Prevent concurrent saves
      if (this.isSaving) {
        log.debug('Save already in progress, queueing');
        this.saveQueue.push(saveCallback);
        return;
      }

      try {
        this.isSaving = true;
        await saveCallback();
      } catch (error) {
        log.error('Auto-save failed:', error);
      } finally {
        this.isSaving = false;
        
        // Process queued saves
        if (this.saveQueue.length > 0 && !this.workspaceSwitching) {
          const nextSave = this.saveQueue.shift();
          this.scheduleAutoSave(nextSave);
        }
      }
    }, 1000);
  }

  /**
   * Start auto-save interval with conflict prevention
   */
  startAutoSave(saveCallback, intervalMs = 5000) {
    // Clear any existing interval
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    
    // Check for dirty data periodically
    this.autoSaveInterval = setInterval(async () => {
      if (this.hasDirtyData() && !this.workspaceSwitching && !this.isSaving) {
        try {
          this.isSaving = true;
          await saveCallback();
        } catch (error) {
          log.error('Periodic auto-save failed:', error);
        } finally {
          this.isSaving = false;
        }
      }
    }, intervalMs);
  }

  /**
   * Stop auto-save
   */
  stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    
    // Clear all save timers
    Object.values(this.saveTimers).forEach(timer => clearTimeout(timer));
    this.saveTimers = {};
  }

  /**
   * Get dirty state
   */
  getDirtyState() {
    return { ...this.isDirty };
  }

  /**
   * Reset dirty state
   */
  resetDirtyState() {
    this.isDirty = {
      sources: false,
      rules: false,
      proxyRules: false
    };
  }

  /**
   * Set workspace switching state
   */
  setWorkspaceSwitching(isSwitching) {
    this.workspaceSwitching = isSwitching;
    if (isSwitching) {
      // Clear any pending saves
      if (this.saveTimers.global) {
        clearTimeout(this.saveTimers.global);
        this.saveTimers.global = null;
      }
      // Clear save queue
      this.saveQueue = [];
    }
  }

  /**
   * Wait for any active saves to complete
   */
  async waitForSaves() {
    const maxWait = 5000;
    const startTime = Date.now();
    
    while (this.isSaving && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (this.isSaving) {
      log.warn('Save operation timed out after 5 seconds');
    }
  }
}

module.exports = AutoSaveManager;