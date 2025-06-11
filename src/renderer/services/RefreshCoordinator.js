const { createLogger } = require('../utils/logger');
const log = createLogger('RefreshCoordinator');
const timeManager = require('./TimeManager');
const { ConcurrentMap, ConcurrentSet, Mutex } = require('../utils/ConcurrencyControl');

/**
 * Improved RefreshCoordinator with proper queue limits and concurrency control
 */
class RefreshCoordinator {
  constructor() {
    // Thread-safe data structures
    this.activeRefreshes = new ConcurrentMap('activeRefreshes');
    this.refreshQueue = new ConcurrentMap('refreshQueue');
    this.queueMutex = new Mutex('queue');
    
    // Configuration
    this.MAX_QUEUE_SIZE = 100; // Prevent unbounded queue growth
    this.MAX_CONCURRENT_BATCH = 10; // Maximum concurrent batch operations
    
    // Metrics with proper initialization
    this.metrics = {
      totalRefreshes: 0,
      successfulRefreshes: 0,
      failedRefreshes: 0,
      skippedRefreshes: 0,
      droppedFromQueue: 0,
      averageRefreshTime: 0,
      totalRefreshTime: 0
    };
  }
  
  /**
   * Normalize sourceId to string
   */
  static normalizeSourceId(sourceId) {
    if (sourceId === null || sourceId === undefined) {
      throw new Error('Invalid sourceId: null or undefined');
    }
    return String(sourceId);
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
    
    // Normalize sourceId
    sourceId = RefreshCoordinator.normalizeSourceId(sourceId);
    
    // Check if already refreshing
    if (await this.activeRefreshes.has(sourceId)) {
      if (skipIfActive) {
        log.debug(`Skipping refresh for ${sourceId} - already active`);
        this.metrics.skippedRefreshes++;
        return { skipped: true, reason: 'already_active' };
      } else {
        // Queue the refresh with size limit check
        return this.queueRefresh(sourceId, refreshFn, options);
      }
    }
    
    // Create refresh operation
    const refreshOperation = this.createRefreshOperation(sourceId, refreshFn, timeout, reason);
    
    // Store active refresh
    await this.activeRefreshes.set(sourceId, {
      startTime: timeManager.now(),
      reason,
      priority
    });
    
    try {
      const result = await refreshOperation;
      this.metrics.successfulRefreshes++;
      return result;
    } catch (error) {
      this.metrics.failedRefreshes++;
      throw error;
    } finally {
      await this.activeRefreshes.delete(sourceId);
      
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
    
    // Add timeout with proper cleanup
    const timeoutPromise = new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Refresh timeout after ${timeout}ms`));
      }, timeout);
      
      // Clean up timeout when refresh completes
      refreshPromise.finally(() => clearTimeout(timeoutId));
    });
    
    this.metrics.totalRefreshes++;
    
    return Promise.race([refreshPromise, timeoutPromise]);
  }
  
  /**
   * Queue a refresh operation with size limits
   */
  async queueRefresh(sourceId, refreshFn, options) {
    // Normalize sourceId
    sourceId = RefreshCoordinator.normalizeSourceId(sourceId);
    
    return this.queueMutex.withLock(async () => {
      let queue = await this.refreshQueue.get(sourceId);
      if (!queue) {
        queue = [];
      }
      
      // Check queue size limit
      if (queue.length >= this.MAX_QUEUE_SIZE) {
        log.warn(`Queue full for ${sourceId}, dropping oldest request`);
        const dropped = queue.shift();
        if (dropped) {
          dropped.reject(new Error('Dropped from queue - queue full'));
          this.metrics.droppedFromQueue++;
        }
      }
      
      return new Promise((resolve, reject) => {
        queue.push({
          refreshFn,
          options,
          resolve,
          reject,
          timestamp: timeManager.now()
        });
        
        this.refreshQueue.set(sourceId, queue);
        
        log.debug(`Queued refresh for ${sourceId}, queue size: ${queue.length}`);
      });
    });
  }
  
  /**
   * Process queued refreshes for a source
   */
  async processQueue(sourceId) {
    // Normalize sourceId
    sourceId = RefreshCoordinator.normalizeSourceId(sourceId);
    
    const next = await this.queueMutex.withLock(async () => {
      const queue = await this.refreshQueue.get(sourceId);
      if (!queue || queue.length === 0) return null;
      
      // Get next queued refresh
      const next = queue.shift();
      
      if (queue.length === 0) {
        await this.refreshQueue.delete(sourceId);
      } else {
        await this.refreshQueue.set(sourceId, queue);
      }
      
      return next;
    });
    
    if (!next) return;
    
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
    
    // Limit concurrent operations
    const effectiveMaxConcurrent = Math.min(maxConcurrent, this.MAX_CONCURRENT_BATCH);
    
    log.info(`Starting batch refresh for ${refreshOperations.length} sources (max concurrent: ${effectiveMaxConcurrent})`);
    
    const results = [];
    const chunks = this.chunkArray(refreshOperations, effectiveMaxConcurrent);
    
    for (const chunk of chunks) {
      const promises = chunk.map(({ sourceId, refreshFn }) => {
        const normalizedId = RefreshCoordinator.normalizeSourceId(sourceId);
        
        return this.executeRefresh(normalizedId, refreshFn, { priority, skipIfActive: false })
          .catch(error => {
            if (!continueOnError) throw error;
            return { success: false, error: error.message, sourceId: normalizedId };
          });
      });
      
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
   * Cancel active refresh for a source
   */
  async cancelRefresh(sourceId) {
    // Normalize sourceId
    sourceId = RefreshCoordinator.normalizeSourceId(sourceId);
    
    const activeRefresh = await this.activeRefreshes.get(sourceId);
    if (activeRefresh) {
      log.warn(`Cannot cancel active refresh for ${sourceId} - will complete`);
      return false;
    }
    
    // Clear from queue
    const queueCleared = await this.queueMutex.withLock(async () => {
      const queue = await this.refreshQueue.get(sourceId);
      if (!queue || queue.length === 0) return false;
      
      queue.forEach(item => {
        item.reject(new Error('Refresh cancelled'));
      });
      
      await this.refreshQueue.delete(sourceId);
      log.info(`Cancelled ${queue.length} queued refreshes for ${sourceId}`);
      return true;
    });
    
    return queueCleared;
  }
  
  /**
   * Cancel all active and queued refreshes
   */
  async cancelAll() {
    // Cancel all queued refreshes
    const allQueues = await this.refreshQueue.entries();
    
    for (const [sourceId, queue] of allQueues) {
      if (queue && queue.length > 0) {
        queue.forEach(item => {
          item.reject(new Error('All refreshes cancelled'));
        });
      }
    }
    
    await this.refreshQueue.clear();
    
    // Note active refreshes
    const activeCount = await this.activeRefreshes.size();
    if (activeCount > 0) {
      log.warn(`${activeCount} active refreshes will complete`);
    }
    
    log.info('Cancelled all queued refreshes');
  }
  
  /**
   * Check if a source is currently refreshing
   */
  async isRefreshing(sourceId) {
    // Normalize sourceId
    sourceId = RefreshCoordinator.normalizeSourceId(sourceId);
    return this.activeRefreshes.has(sourceId);
  }
  
  /**
   * Get active refresh count
   */
  async getActiveCount() {
    return this.activeRefreshes.size();
  }
  
  /**
   * Get queued refresh count
   */
  async getQueuedCount() {
    const allQueues = await this.refreshQueue.entries();
    let total = 0;
    
    for (const [, queue] of allQueues) {
      if (queue) {
        total += queue.length;
      }
    }
    
    return total;
  }
  
  /**
   * Update metrics with new refresh duration
   */
  updateMetrics(duration) {
    this.metrics.totalRefreshTime += duration;
    this.metrics.averageRefreshTime = 
      this.metrics.totalRefreshTime / (this.metrics.successfulRefreshes || 1);
  }
  
  /**
   * Get coordinator metrics
   */
  async getMetrics() {
    return {
      ...this.metrics,
      activeRefreshes: await this.activeRefreshes.size(),
      queuedRefreshes: await this.getQueuedCount()
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
      droppedFromQueue: 0,
      averageRefreshTime: 0,
      totalRefreshTime: 0
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
  async destroy() {
    // Cancel all operations
    await this.cancelAll();
    
    // Wait for active operations to complete
    const activeCount = await this.activeRefreshes.size();
    if (activeCount > 0) {
      log.info(`Waiting for ${activeCount} active refreshes to complete`);
      // Give them time to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Clear all data
    await this.activeRefreshes.clear();
    await this.refreshQueue.clear();
    
    // Reset metrics
    this.resetMetrics();
    
    log.debug('RefreshCoordinator destroyed');
  }
}

module.exports = RefreshCoordinator;