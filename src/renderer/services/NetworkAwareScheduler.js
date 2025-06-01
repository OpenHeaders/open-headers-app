const { createLogger } = require('../utils/logger');
const log = createLogger('NetworkAwareScheduler');

/**
 * Handles network-aware scheduling of refresh operations.
 * Separates scheduling logic from refresh execution.
 */
class NetworkAwareScheduler {
  constructor() {
    this.schedules = new Map(); // sourceId -> schedule info
    this.timers = new Map(); // sourceId -> timer
    this.overdueCheckInterval = null;
    this.refreshCallback = null;
    this.networkOfflineTime = null; // Track when network went offline
    this.lastNetworkState = { isOnline: true }; // Track last known network state
    this.lastNetworkQuality = 'good'; // Track last known network quality
    this.networkChangeDebounceTimer = null; // Debounce rapid network changes
  }
  
  /**
   * Initialize the scheduler with a callback for refresh execution
   */
  initialize(refreshCallback) {
    this.refreshCallback = refreshCallback;
    
    // Start periodic overdue check
    this.startOverdueCheck();
    
    log.debug('Initialized');
  }
  
  /**
   * Schedule a source for refresh
   */
  async scheduleSource(source) {
    if (!source.sourceId || source.sourceType !== 'http') {
      return;
    }
    
    const intervalMs = this.parseInterval(source.refreshOptions?.interval);
    if (!intervalMs) {
      this.unscheduleSource(source.sourceId);
      return;
    }
    
    const schedule = {
      sourceId: source.sourceId,
      intervalMs,
      lastRefresh: source.refreshOptions?.lastRefresh ? new Date(source.refreshOptions.lastRefresh).getTime() : null,
      nextRefresh: null,
      retryCount: 0,
      maxRetries: 3,
      backoffFactor: 2,
      scheduledWhileOffline: false // Track if initially scheduled while offline
    };
    
    this.schedules.set(source.sourceId, schedule);
    await this.calculateNextRefresh(source.sourceId);
    this.setTimer(source.sourceId);
    
    // Check if source is already overdue
    const now = Date.now();
    const isOverdue = schedule.lastRefresh && (now - schedule.lastRefresh) > intervalMs;
    
    if (isOverdue) {
      const overdueBy = now - (schedule.lastRefresh + intervalMs);
      log.info(`Scheduled overdue source ${source.sourceId} - overdue by ${Math.round(overdueBy / 1000)}s, will refresh immediately`);
    } else {
      log.info(`Scheduled source ${source.sourceId} with interval ${intervalMs}ms (${source.refreshOptions?.interval} minutes)`);
    }
  }
  
  /**
   * Unschedule a source
   */
  unscheduleSource(sourceId) {
    this.clearTimer(sourceId);
    this.schedules.delete(sourceId);
    log.debug(`Unscheduled source ${sourceId}`);
  }
  
  /**
   * Calculate next refresh time based on network conditions
   */
  async calculateNextRefresh(sourceId, networkState = null) {
    const schedule = this.schedules.get(sourceId);
    if (!schedule) return;
    
    const now = Date.now();
    let delay = schedule.intervalMs;
    
    // Get current network state if not provided
    if (!networkState) {
      networkState = await window.electronAPI.getNetworkState();
    }
    
    // Adjust delay based on network conditions
    if (!networkState.isOnline) {
      // When offline, calculate next refresh time but don't set timer
      // This preserves the schedule for when network returns
      const baseTime = schedule.lastRefresh || now;
      schedule.nextRefresh = baseTime + delay;
      
      // Mark if this is initial scheduling while offline
      if (!this.timers.has(sourceId) && !schedule.scheduledWhileOffline) {
        schedule.scheduledWhileOffline = true;
        log.info(`Source ${sourceId} initially scheduled while offline`);
      }
      
      // Source will refresh when network returns
      return schedule.nextRefresh;
    }
    
    // Note: Quality multipliers are NOT applied to regular scheduled refreshes
    // Users expect exact intervals as configured (e.g., exactly 1 minute)
    // Multipliers are only used for retry backoff scenarios
    
    // Apply retry backoff if needed
    if (schedule.retryCount > 0) {
      // Apply quality multiplier for retries
      const qualityMultiplier = this.getQualityMultiplier(networkState.networkQuality);
      const backoffDelay = delay * Math.pow(schedule.backoffFactor, schedule.retryCount) * qualityMultiplier;
      
      delay = Math.min(backoffDelay, delay * 10); // Cap at 10x normal interval
      
      log.debug(`Retry backoff for ${sourceId} - count: ${schedule.retryCount}, quality: ${networkState.networkQuality}, delay: ${Math.round(delay/1000)}s`);
    }
    
    // Special handling for overdue sources when coming back online
    if (schedule.lastRefresh) {
      const timeSinceLastRefresh = now - schedule.lastRefresh;
      const isOverdue = timeSinceLastRefresh > schedule.intervalMs;
      
      if (isOverdue) {
        // Check if this is during initial scheduling or was scheduled while offline
        const isInitialSchedule = !this.timers.has(sourceId) || schedule.scheduledWhileOffline;
        
        if (isInitialSchedule) {
          // For initial schedule of overdue source, refresh immediately
          schedule.nextRefresh = now + 100; // 100ms delay to allow UI to settle
          log.debug(`Source ${sourceId} is overdue ${schedule.scheduledWhileOffline ? '(was offline)' : '(initial load)'}, scheduling immediate refresh`);
          
          // Clear the offline flag
          schedule.scheduledWhileOffline = false;
        } else {
          // For network recovery or other cases, add jitter to avoid thundering herd
          const jitter = Math.random() * 5000; // 0-5 seconds random jitter
          schedule.nextRefresh = now + 1000 + jitter; // 1-6 seconds from now
          log.debug(`Source ${sourceId} is overdue, scheduling soon with jitter`);
        }
        return schedule.nextRefresh;
      }
    }
    
    // Clear offline flag if source is not overdue
    schedule.scheduledWhileOffline = false;
    
    // Calculate from last refresh or now
    const baseTime = schedule.lastRefresh || now;
    schedule.nextRefresh = baseTime + delay;
    
    // Ensure next refresh is in the future
    if (schedule.nextRefresh <= now) {
      schedule.nextRefresh = now + Math.min(delay, 5000); // Min 5 second delay
    }
    
    return schedule.nextRefresh;
  }
  
  /**
   * Set or update timer for a source
   */
  setTimer(sourceId) {
    const schedule = this.schedules.get(sourceId);
    if (!schedule || !schedule.nextRefresh) {
      log.warn(`Cannot set timer for source ${sourceId} - no schedule or nextRefresh`);
      return;
    }
    
    // Clear existing timer
    this.clearTimer(sourceId);
    
    const now = Date.now();
    const delay = Math.max(0, schedule.nextRefresh - now);
    
    const timer = setTimeout(() => {
      this.triggerRefresh(sourceId);
    }, delay);
    
    this.timers.set(sourceId, timer);
    
    log.debug(`Timer set for source ${sourceId}, will refresh in ${Math.round(delay/1000)}s`);
  }
  
  /**
   * Clear timer for a source
   */
  clearTimer(sourceId) {
    const timer = this.timers.get(sourceId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sourceId);
    }
  }
  
  /**
   * Trigger refresh for a source
   */
  async triggerRefresh(sourceId, reason = 'scheduled') {
    const schedule = this.schedules.get(sourceId);
    if (!schedule) {
      log.warn(`No schedule found for source ${sourceId} when triggering refresh`);
      return;
    }
    
    log.info(`Triggering refresh for source ${sourceId}, reason: ${reason}`);
    
    try {
      if (this.refreshCallback) {
        await this.refreshCallback(sourceId, { reason });
      } else {
        log.error(`No refresh callback set!`);
      }
      
      // Reset retry count on success
      schedule.retryCount = 0;
    } catch (error) {
      log.error(`Refresh failed for source ${sourceId}:`, error);
      
      // Increment retry count
      schedule.retryCount = Math.min(schedule.retryCount + 1, schedule.maxRetries);
    }
    
    // Reschedule for next refresh
    await this.calculateNextRefresh(sourceId);
    this.setTimer(sourceId);
  }
  
  /**
   * Update last refresh time for a source
   */
  updateLastRefresh(sourceId, timestamp = Date.now()) {
    const schedule = this.schedules.get(sourceId);
    if (schedule) {
      schedule.lastRefresh = timestamp;
      schedule.retryCount = 0; // Reset retry count on successful refresh
      // Don't await here to avoid blocking
      this.calculateNextRefresh(sourceId).then(() => {
        this.setTimer(sourceId);
      });
    }
  }
  
  /**
   * Handle network state change
   */
  async handleNetworkChange(networkState) {
    // Clear any existing debounce timer
    if (this.networkChangeDebounceTimer) {
      clearTimeout(this.networkChangeDebounceTimer);
      this.networkChangeDebounceTimer = null;
    }
    
    const wasOffline = !this.lastNetworkState.isOnline;
    const isNowOnline = networkState.isOnline;
    const vpnChanged = this.lastNetworkState.vpnActive !== networkState.vpnActive;
    const qualityChanged = this.lastNetworkState.networkQuality !== networkState.networkQuality;
    
    // Log significant changes (online/offline, VPN, or quality changes)
    if (wasOffline !== !isNowOnline || vpnChanged || qualityChanged) {
      log.info('Network state change', {
        online: networkState.isOnline,
        quality: networkState.networkQuality,
        vpn: networkState.vpnActive
      });
    }
    
    // Update last known state
    this.lastNetworkState = networkState;
    
    // If going offline, debounce to avoid duplicate logs
    if (!networkState.isOnline) {
      // Debounce offline handling to prevent duplicate logs
      this.networkChangeDebounceTimer = setTimeout(() => {
        log.info('Network went offline, clearing all timers');
        this.networkOfflineTime = Date.now();
        this.lastNetworkQuality = 'offline';
        for (const sourceId of this.timers.keys()) {
          this.clearTimer(sourceId);
        }
      }, 500); // 500ms debounce to handle multiple rapid state changes
      return;
    }
    
    // If we weren't offline before, don't adjust timers
    // Users expect exact intervals regardless of network quality or VPN changes
    if (!wasOffline) {
      // Network state changed but not recovering from offline - no action needed
      
      this.lastNetworkQuality = networkState.networkQuality || 'good';
      return;
    }
    
    // Network is online after being offline - handle recovery
    const offlineDuration = this.networkOfflineTime ? Date.now() - this.networkOfflineTime : 0;
    log.info('Network recovered from offline', {
      offlineDuration: offlineDuration ? `${Math.round(offlineDuration / 1000)}s` : 'unknown'
    });
    
    // Reset offline time
    this.networkOfflineTime = null;
    
    // Update quality on recovery
    this.lastNetworkQuality = networkState.networkQuality || 'good';
    
    // Check for sources that were scheduled while offline
    const sourcesScheduledOffline = [];
    for (const [sourceId, schedule] of this.schedules) {
      if (schedule.scheduledWhileOffline) {
        sourcesScheduledOffline.push({ sourceId, schedule });
        // Source was scheduled while offline
      }
    }
    
    // Handle sources scheduled while offline immediately
    if (sourcesScheduledOffline.length > 0) {
      log.debug(`Processing ${sourcesScheduledOffline.length} sources scheduled while offline`);
      for (const { sourceId, schedule } of sourcesScheduledOffline) {
        // Recalculate with online state to trigger immediate refresh if overdue
        await this.calculateNextRefresh(sourceId, networkState);
        this.setTimer(sourceId);
      }
    }
    
    // First, identify all overdue sources (excluding never-refreshed ones)
    const overdueSources = this.getOverdueSources(0, false); // No buffer, exclude never-refreshed
    const overdueCount = overdueSources.length;
    
    if (overdueCount > 0) {
      log.info(`Found ${overdueCount} overdue sources during network recovery`);
      
      // Sort by how overdue they are (most overdue first)
      overdueSources.sort((a, b) => {
        // Never refreshed sources go first
        if (a.neverRefreshed && !b.neverRefreshed) return -1;
        if (!a.neverRefreshed && b.neverRefreshed) return 1;
        if (a.neverRefreshed && b.neverRefreshed) return 0;
        
        // Then sort by how overdue they are
        return (b.overdueBy || 0) - (a.overdueBy || 0);
      });
      
      // Stagger the overdue refreshes to avoid overwhelming the server
      const staggerDelay = Math.min(5000, 30000 / overdueCount); // 5 seconds max per source
      
      for (let i = 0; i < overdueSources.length; i++) {
        const { sourceId } = overdueSources[i];
        const delay = i * staggerDelay;
        
        setTimeout(() => {
          this.triggerRefresh(sourceId, 'network_recovery_overdue');
        }, delay);
      }
      
      // For sources that were overdue, reset their next refresh time after the catch-up
      // This prevents them from immediately triggering again
      const catchUpTime = overdueCount * staggerDelay;
      setTimeout(() => {
        // Reset schedules after overdue catch-up
        for (const { sourceId } of overdueSources) {
          const schedule = this.schedules.get(sourceId);
          if (schedule) {
            // Set lastRefresh to now to restart the regular schedule
            schedule.lastRefresh = Date.now();
            this.calculateNextRefresh(sourceId, networkState).then(() => {
              this.setTimer(sourceId);
            });
          }
        }
      }, catchUpTime + 5000); // Add 5 seconds buffer after all overdue refreshes
    }
    
    // For sources that are not overdue and were not scheduled offline, just recalculate and set timers
    for (const [sourceId, schedule] of this.schedules) {
      const isOverdue = overdueSources.some(o => o.sourceId === sourceId);
      const wasScheduledOffline = sourcesScheduledOffline.some(s => s.sourceId === sourceId);
      
      if (!isOverdue && !wasScheduledOffline) {
        await this.calculateNextRefresh(sourceId, networkState);
        this.setTimer(sourceId);
      }
    }
  }
  
  /**
   * Get overdue sources
   * @param {number} bufferMs - Buffer time in milliseconds before considering overdue
   * @param {boolean} includeNeverRefreshed - Whether to include sources that have never been refreshed
   */
  getOverdueSources(bufferMs = 60000, includeNeverRefreshed = true) {
    const now = Date.now();
    const overdue = [];
    
    for (const [sourceId, schedule] of this.schedules) {
      if (!schedule.lastRefresh) {
        // Never refreshed
        if (includeNeverRefreshed) {
          overdue.push({
            sourceId,
            overdueBy: null,
            neverRefreshed: true,
            priority: 1 // Highest priority
          });
        }
      } else {
        // Calculate expected refresh time based on last refresh + interval
        const expectedRefreshTime = schedule.lastRefresh + schedule.intervalMs;
        const overdueBy = now - expectedRefreshTime;
        
        // Source is overdue if current time exceeds expected time by buffer
        if (overdueBy > bufferMs) {
          overdue.push({
            sourceId,
            overdueBy,
            lastRefresh: schedule.lastRefresh,
            intervalMs: schedule.intervalMs,
            expectedRefreshTime,
            priority: Math.min(10, Math.floor(overdueBy / schedule.intervalMs) + 2) // Higher priority for more overdue
          });
        }
      }
    }
    
    return overdue;
  }
  
  /**
   * Check and refresh overdue sources
   */
  async checkOverdueSources(reason = 'overdue_check') {
    const networkState = await window.electronAPI.getNetworkState();
    
    if (!networkState.isOnline) {
      return; // Skip check when offline
    }
    
    const overdueSources = this.getOverdueSources();
    
    if (overdueSources.length > 0) {
      log.info(`Found ${overdueSources.length} overdue sources (reason: ${reason})`);
      
      // Sort by priority (highest priority first)
      overdueSources.sort((a, b) => a.priority - b.priority);
      
      // For periodic checks, limit the number of concurrent refreshes
      const maxConcurrent = reason === 'periodic_check' ? 2 : overdueSources.length;
      
      // Trigger refresh for each overdue source with staggering
      for (let i = 0; i < Math.min(maxConcurrent, overdueSources.length); i++) {
        const { sourceId, overdueBy, neverRefreshed } = overdueSources[i];
        
        log.info(`NetworkAwareScheduler: Refreshing overdue source ${sourceId}`, {
          neverRefreshed,
          overdueBy: overdueBy ? `${Math.round(overdueBy / 1000)}s` : 'never'
        });
        
        // Don't await here to allow concurrent refreshes
        this.triggerRefresh(sourceId, reason).catch(err => {
          log.error(`Failed to refresh overdue source ${sourceId}:`, err);
        });
        
        // Small delay between triggers to avoid overwhelming
        if (i < maxConcurrent - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
  }
  
  /**
   * Start periodic overdue check
   */
  startOverdueCheck() {
    // Check every 30 seconds
    this.overdueCheckInterval = setInterval(() => {
      this.checkOverdueSources('periodic_check').catch(err => {
        log.error('Error in periodic overdue check:', err);
      });
    }, 30000);
  }
  
  /**
   * Stop periodic overdue check
   */
  stopOverdueCheck() {
    if (this.overdueCheckInterval) {
      clearInterval(this.overdueCheckInterval);
      this.overdueCheckInterval = null;
    }
  }
  
  /**
   * Get quality multiplier for retry backoff calculations
   * Note: This is ONLY used for retry scenarios, not regular scheduled refreshes
   */
  getQualityMultiplier(quality) {
    const qualityMultipliers = {
      excellent: 1.0,   // No additional delay
      good: 1.0,        // No additional delay
      fair: 1.1,        // 10% additional delay for retries
      moderate: 1.3,    // 30% additional delay for retries
      poor: 1.5         // 50% additional delay for retries
    };
    return qualityMultipliers[quality] || 1.0;
  }
  
  /**
   * Parse refresh interval to milliseconds
   * Handles both number (minutes) and string formats
   */
  parseInterval(interval) {
    if (!interval || interval === 'never') return null;
    
    // If interval is a number, treat it as minutes
    if (typeof interval === 'number') {
      return interval * 60 * 1000; // Convert minutes to milliseconds
    }
    
    // If it's a string, parse it
    const match = interval.toString().match(/^(\d+)\s*(second|minute|hour|day)s?$/i);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const multipliers = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000
    };
    
    return value * multipliers[unit];
  }
  
  /**
   * Get scheduler statistics
   */
  getStatistics() {
    const stats = {
      totalScheduled: this.schedules.size,
      activeTimers: this.timers.size,
      overdueCount: this.getOverdueSources().length,
      schedules: []
    };
    
    for (const [sourceId, schedule] of this.schedules) {
      stats.schedules.push({
        sourceId,
        intervalMs: schedule.intervalMs,
        lastRefresh: schedule.lastRefresh,
        nextRefresh: schedule.nextRefresh,
        retryCount: schedule.retryCount,
        isOverdue: this.isSourceOverdue(sourceId)
      });
    }
    
    return stats;
  }
  
  /**
   * Clean up scheduler resources
   */
  destroy() {
    // Clear all timers
    for (const sourceId of this.timers.keys()) {
      this.clearTimer(sourceId);
    }
    
    // Clear overdue check interval
    this.stopOverdueCheck();
    
    // Clear network change debounce timer
    if (this.networkChangeDebounceTimer) {
      clearTimeout(this.networkChangeDebounceTimer);
      this.networkChangeDebounceTimer = null;
    }
    
    // Clear all schedules
    this.schedules.clear();
  }
  
  /**
   * Check if a source is overdue
   */
  isSourceOverdue(sourceId, bufferMs = 60000) {
    const schedule = this.schedules.get(sourceId);
    if (!schedule) return false;
    
    if (!schedule.lastRefresh) return true;
    
    const now = Date.now();
    const expectedRefreshTime = schedule.lastRefresh + schedule.intervalMs;
    return (now - expectedRefreshTime) > bufferMs;
  }
  
}

module.exports = NetworkAwareScheduler;