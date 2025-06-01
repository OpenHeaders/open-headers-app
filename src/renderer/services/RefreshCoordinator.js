const { createLogger } = require('../utils/logger');
const log = createLogger('RefreshCoordinator');
const timeManager = require('./TimeManager');

/**
 * Coordinates refresh operations to prevent overlapping and conflicting operations.
 * Manages execution flow and ensures atomic operations.
 */
class RefreshCoordinator {
  constructor() {
    this.activeRefreshes = new Map(); // sourceId -> refresh promise
    this.refreshQueue = new Map(); // sourceId -> queue of pending refreshes
    this.globalLock = null;
    this.metrics = {
      totalRefreshes: 0,
      successfulRefreshes: 0,
      failedRefreshes: 0,
      skippedRefreshes: 0,
      averageRefreshTime: 0
    };
  }
  
  /**
   * Execute a refresh operation with coordination
   */
  async executeRefresh(sourceId, refreshFn, options = {}) {
    const {
      priority = 'normal',
      skipIfActive = true,
      timeout = 30000,
      reason = 'manual'
    } = options;
    
    // Convert sourceId to string to ensure consistency
    sourceId = String(sourceId);
    
    // Check if already refreshing
    if (this.activeRefreshes.has(sourceId)) {
      if (skipIfActive) {
        log.debug(`Skipping refresh for ${sourceId} - already active`);
        this.metrics.skippedRefreshes++;
        return { skipped: true, reason: 'already_active' };
      } else {
        // Queue the refresh
        return this.queueRefresh(sourceId, refreshFn, options);
      }
    }
    
    // Create refresh operation
    const refreshOperation = this.createRefreshOperation(sourceId, refreshFn, timeout, reason);
    
    // Store active refresh
    this.activeRefreshes.set(sourceId, refreshOperation);
    
    try {
      const result = await refreshOperation;
      this.metrics.successfulRefreshes++;
      return result;
    } catch (error) {
      this.metrics.failedRefreshes++;
      throw error;
    } finally {
      this.activeRefreshes.delete(sourceId);
      
      // Process queued refreshes
      await this.processQueue(sourceId);
    }
  }
  
  /**
   * Create a refresh operation with timeout
   */
  createRefreshOperation(sourceId, refreshFn, timeout, reason) {
    const startTime = timeManager.now();
    
    const refreshPromise = refreshFn(sourceId)
      .then(result => {
        const duration = timeManager.now() - startTime;
        this.updateMetrics(duration);
        
        log.debug(`Refresh completed for ${sourceId} in ${duration}ms`);
        
        return {
          success: true,
          result,
          duration,
          timestamp: timeManager.now()
        };
      })
      .catch(error => {
        const duration = timeManager.now() - startTime;
        
        log.error(`Refresh failed for ${sourceId}`, {
          error: error.message,
          duration,
          reason
        });
        
        return {
          success: false,
          error: error.message,
          duration,
          timestamp: timeManager.now()
        };
      });
    
    // Add timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Refresh timeout after ${timeout}ms`));
      }, timeout);
    });
    
    this.metrics.totalRefreshes++;
    
    return Promise.race([refreshPromise, timeoutPromise]);
  }
  
  /**
   * Queue a refresh operation
   */
  async queueRefresh(sourceId, refreshFn, options) {
    // Convert sourceId to string to ensure consistency
    sourceId = String(sourceId);
    
    if (!this.refreshQueue.has(sourceId)) {
      this.refreshQueue.set(sourceId, []);
    }
    
    const queue = this.refreshQueue.get(sourceId);
    
    return new Promise((resolve, reject) => {
      queue.push({
        refreshFn,
        options,
        resolve,
        reject,
        timestamp: timeManager.now()
      });
      
      log.debug(`Queued refresh for ${sourceId}, queue size: ${queue.length}`);
    });
  }
  
  /**
   * Process queued refreshes for a source
   */
  async processQueue(sourceId) {
    // Convert sourceId to string to ensure consistency
    sourceId = String(sourceId);
    const queue = this.refreshQueue.get(sourceId);
    if (!queue || queue.length === 0) return;
    
    // Get next queued refresh
    const next = queue.shift();
    
    if (queue.length === 0) {
      this.refreshQueue.delete(sourceId);
    }
    
    // Execute queued refresh
    try {
      const result = await this.executeRefresh(
        sourceId,
        next.refreshFn,
        next.options
      );
      next.resolve(result);
    } catch (error) {
      next.reject(error);
    }
  }
  
  /**
   * Execute multiple refreshes with coordination
   */
  async executeBatch(refreshOperations, options = {}) {
    const {
      maxConcurrent = 5,
      continueOnError = true,
      priority = 'high'
    } = options;
    
    log.info(`Starting batch refresh for ${refreshOperations.length} sources`);
    
    const results = [];
    const chunks = this.chunkArray(refreshOperations, maxConcurrent);
    
    for (const chunk of chunks) {
      const promises = chunk.map(({ sourceId, refreshFn }) =>
        this.executeRefresh(sourceId, refreshFn, { priority, skipIfActive: false })
          .catch(error => {
            if (!continueOnError) throw error;
            return { success: false, error: error.message, sourceId };
          })
      );
      
      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }
    
    log.info(`Batch refresh completed`, {
      total: refreshOperations.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });
    
    return results;
  }
  
  /**
   * Acquire a global lock for critical operations
   */
  async acquireGlobalLock(operation, timeout = 5000) {
    if (this.globalLock) {
      log.warn(`Global lock already held by ${this.globalLock.operation}`);
      
      // Wait for lock with timeout
      const startTime = timeManager.now();
      while (this.globalLock && (timeManager.now() - startTime) < timeout) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (this.globalLock) {
        throw new Error(`Failed to acquire global lock after ${timeout}ms`);
      }
    }
    
    this.globalLock = {
      operation,
      timestamp: timeManager.now()
    };
    
    log.debug(`Global lock acquired for ${operation}`);
    
    return {
      release: () => {
        if (this.globalLock && this.globalLock.operation === operation) {
          this.globalLock = null;
          log.debug(`Global lock released for ${operation}`);
        }
      }
    };
  }
  
  /**
   * Cancel active refresh for a source
   */
  cancelRefresh(sourceId) {
    // Convert sourceId to string to ensure consistency
    sourceId = String(sourceId);
    const activeRefresh = this.activeRefreshes.get(sourceId);
    if (activeRefresh) {
      // Note: We can't actually cancel the promise, but we can track it
      log.warn(`Cannot cancel active refresh for ${sourceId} - will be ignored`);
      return false;
    }
    
    // Clear from queue
    if (this.refreshQueue.has(sourceId)) {
      const queue = this.refreshQueue.get(sourceId);
      queue.forEach(item => {
        item.reject(new Error('Refresh cancelled'));
      });
      this.refreshQueue.delete(sourceId);
      
      log.info(`Cancelled ${queue.length} queued refreshes for ${sourceId}`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Cancel all active and queued refreshes
   */
  cancelAll() {
    // Cancel all queued refreshes
    for (const [sourceId, queue] of this.refreshQueue) {
      queue.forEach(item => {
        item.reject(new Error('All refreshes cancelled'));
      });
    }
    this.refreshQueue.clear();
    
    // Note active refreshes
    const activeCount = this.activeRefreshes.size;
    if (activeCount > 0) {
      log.warn(`${activeCount} active refreshes will complete`);
    }
    
    log.info('Cancelled all queued refreshes');
  }
  
  /**
   * Check if a source is currently refreshing
   */
  isRefreshing(sourceId) {
    // Convert sourceId to string to ensure consistency
    sourceId = String(sourceId);
    return this.activeRefreshes.has(sourceId);
  }
  
  /**
   * Get active refresh count
   */
  getActiveCount() {
    return this.activeRefreshes.size;
  }
  
  /**
   * Get queued refresh count
   */
  getQueuedCount() {
    let total = 0;
    for (const queue of this.refreshQueue.values()) {
      total += queue.length;
    }
    return total;
  }
  
  /**
   * Update metrics with new refresh duration
   */
  updateMetrics(duration) {
    const totalDuration = this.metrics.averageRefreshTime * this.metrics.successfulRefreshes;
    this.metrics.averageRefreshTime = (totalDuration + duration) / (this.metrics.successfulRefreshes + 1);
  }
  
  /**
   * Get coordinator metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeRefreshes: this.activeRefreshes.size,
      queuedRefreshes: this.getQueuedCount(),
      globalLockHeld: !!this.globalLock
    };
  }
  
  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRefreshes: 0,
      successfulRefreshes: 0,
      failedRefreshes: 0,
      skippedRefreshes: 0,
      averageRefreshTime: 0
    };
  }
  
  /**
   * Chunk array into smaller arrays
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  /**
   * Cleanup and destroy
   */
  destroy() {
    this.cancelAll();
    this.activeRefreshes.clear();
    this.refreshQueue.clear();
    this.globalLock = null;
    this.resetMetrics();
    
    log.debug('Destroyed');
  }
}

module.exports = RefreshCoordinator;