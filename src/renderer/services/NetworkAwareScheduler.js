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
    this.isDestroyed = false; // Track if instance has been destroyed
    this.activeRefreshes = new Set(); // Track active refresh operations
    this.lastTimeCheck = Date.now(); // Track last time check for detecting time jumps
    this.timeCheckInterval = null; // Interval for checking time jumps
    this.overdueCheckInProgress = false; // Prevent overlapping overdue checks
  }
  
  /**
   * Initialize the scheduler with a callback for refresh execution
   */
  initialize(refreshCallback) {
    this.refreshCallback = refreshCallback;
    
    // Start periodic overdue check
    this.startOverdueCheck();
    
    // Start time jump detection
    this.startTimeJumpDetection();
    
    log.debug('Initialized');
  }
  
  /**
   * Schedule a source for refresh
   */
  async scheduleSource(source) {
    if (!source.sourceId || source.sourceType !== 'http') {
      return;
    }
    
    // Validate and convert sourceId to string
    if (source.sourceId === undefined || source.sourceId === null || source.sourceId === '') {
      log.error(`Invalid sourceId: undefined, null, or empty`);
      return;
    }
    
    // Convert sourceId to string if it's not already
    if (typeof source.sourceId !== 'string') {
      log.debug(`Converting sourceId from ${typeof source.sourceId} to string:`, source.sourceId);
      source.sourceId = String(source.sourceId);
    }
    
    const intervalMs = this.parseInterval(source.refreshOptions?.interval);
    if (!intervalMs) {
      this.unscheduleSource(source.sourceId);
      return;
    }
    
    // Validate interval limits (minimum 10 seconds, maximum 24 hours)
    if (intervalMs < 10000) {
      log.warn(`Interval too short for source ${source.sourceId}: ${intervalMs}ms, minimum is 10 seconds`);
      return;
    }
    if (intervalMs > 24 * 60 * 60 * 1000 || intervalMs > Number.MAX_SAFE_INTEGER / 2) {
      log.warn(`Interval too long for source ${source.sourceId}: ${intervalMs}ms, maximum is 24 hours`);
      return;
    }
    
    // Check if already scheduled to prevent duplicates
    const existingSchedule = this.schedules.get(source.sourceId);
    if (existingSchedule) {
      log.debug(`Source ${source.sourceId} already scheduled, updating schedule`);
    }
    
    const schedule = {
      sourceId: String(source.sourceId), // Ensure sourceId is always a string
      intervalMs,
      lastRefresh: source.refreshOptions?.lastRefresh ? new Date(source.refreshOptions.lastRefresh).getTime() : null,
      nextRefresh: null,
      retryCount: 0,
      maxRetries: 3,
      backoffFactor: 2,
      scheduledWhileOffline: false, // Track if initially scheduled while offline
      failureCount: 0, // Track consecutive failures
      maxConsecutiveFailures: 10 // Stop trying after 10 consecutive failures
    };
    
    this.schedules.set(source.sourceId, schedule);
    const networkState = await window.electronAPI.getNetworkState();
    await this.calculateNextRefresh(source.sourceId, networkState);
    this.setTimer(source.sourceId);
    
    // Check if source is already overdue
    const now = Date.now();
    const isOverdue = schedule.lastRefresh && (now - schedule.lastRefresh) > intervalMs;
    
    if (isOverdue) {
      const overdueBy = now - (schedule.lastRefresh + intervalMs);
      if (!networkState.isOnline) {
        log.info(`Source ${source.sourceId} is overdue by ${Math.round(overdueBy / 1000)}s but network is offline - will refresh when network returns`);
      } else {
        log.info(`Scheduled overdue source ${source.sourceId} - overdue by ${Math.round(overdueBy / 1000)}s, will refresh immediately`);
      }
    } else {
      log.info(`Scheduled source ${source.sourceId} with interval ${intervalMs}ms (${source.refreshOptions?.interval} minutes)`);
    }
  }
  
  /**
   * Unschedule a source
   */
  unscheduleSource(sourceId) {
    sourceId = String(sourceId); // Ensure sourceId is a string
    this.clearTimer(sourceId);
    this.schedules.delete(sourceId);
    log.debug(`Unscheduled source ${sourceId}`);
  }
  
  /**
   * Calculate next refresh time based on network conditions
   */
  async calculateNextRefresh(sourceId, networkState = null) {
    sourceId = String(sourceId); // Ensure sourceId is a string
    const schedule = this.schedules.get(sourceId);
    if (!schedule) return;
    
    const now = Date.now();
    let delay = schedule.intervalMs;
    
    // Get current network state if not provided
    if (!networkState) {
      networkState = await window.electronAPI.getNetworkState();
    }
    
    // Store network state for later use
    schedule.lastNetworkState = networkState.isOnline;
    
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
    sourceId = String(sourceId); // Ensure sourceId is a string
    const schedule = this.schedules.get(sourceId);
    if (!schedule || !schedule.nextRefresh) {
      log.warn(`Cannot set timer for source ${sourceId} - no schedule or nextRefresh`);
      return;
    }
    
    // Don't set timers when offline
    if (schedule.lastNetworkState === false) {
      log.debug(`Skipping timer for source ${sourceId} - network is offline`);
      return;
    }
    
    // Clear existing timer first to prevent duplicates
    this.clearTimer(sourceId);
    
    const now = Date.now();
    const delay = Math.max(100, schedule.nextRefresh - now); // Minimum 100ms delay to prevent immediate firing
    
    // Prevent setting timers for extremely long delays
    if (delay > 24 * 60 * 60 * 1000) { // 24 hours
      log.warn(`Timer delay too long for source ${sourceId}: ${delay}ms, capping at 24 hours`);
      return;
    }
    
    // Capture sourceId in closure to ensure it's available when timer fires
    const capturedSourceId = sourceId;
    const timer = setTimeout(() => {
      // Remove timer from map when it fires
      this.timers.delete(capturedSourceId);
      // Double-check both timer and schedule still exist
      if (!this.isDestroyed && this.schedules.has(capturedSourceId)) {
        this.triggerRefresh(capturedSourceId).catch(err => {
          log.error(`Error in scheduled refresh for ${capturedSourceId}:`, err);
        });
      }
    }, delay);
    
    this.timers.set(sourceId, timer);
    
    log.debug(`Timer set for source ${sourceId}, will refresh in ${Math.round(delay/1000)}s`);
  }
  
  /**
   * Clear timer for a source
   */
  clearTimer(sourceId) {
    sourceId = String(sourceId); // Ensure sourceId is a string
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
    sourceId = String(sourceId); // Ensure sourceId is a string
    
    // Prevent operations after destruction
    if (this.isDestroyed) {
      log.debug(`Scheduler destroyed, skipping refresh for ${sourceId}`);
      return;
    }
    
    const schedule = this.schedules.get(sourceId);
    if (!schedule) {
      log.warn(`No schedule found for source ${sourceId} when triggering refresh`);
      return;
    }
    
    // Check if source has exceeded max consecutive failures
    if (schedule.failureCount >= schedule.maxConsecutiveFailures) {
      log.warn(`Source ${sourceId} has failed ${schedule.failureCount} times consecutively, unscheduling`);
      this.unscheduleSource(sourceId);
      return;
    }
    
    // Track this refresh operation with proper error handling
    let refreshPromise;
    try {
      refreshPromise = this._performRefresh(sourceId, reason);
      this.activeRefreshes.add(refreshPromise);
      
      await refreshPromise;
    } catch (error) {
      log.error(`Error in triggerRefresh for ${sourceId}:`, error);
      // Don't re-throw - we've logged it and callers may not handle it
    } finally {
      if (refreshPromise) {
        this.activeRefreshes.delete(refreshPromise);
      }
    }
  }
  
  async _performRefresh(sourceId, reason) {
    // Double-check schedule still exists (race condition protection)
    const schedule = this.schedules.get(sourceId);
    if (!schedule) {
      log.debug(`Schedule not found for ${sourceId} during refresh, likely deleted`);
      return;
    }
    
    log.info(`Triggering refresh for source ${sourceId}, reason: ${reason}`);
    
    let refreshFailed = false;
    let networkStateBeforeRefresh = await window.electronAPI.getNetworkState();
    
    try {
      if (this.refreshCallback) {
        // Validate callback result structure
        const result = await this.refreshCallback(sourceId, { reason });
        
        // Check if the refresh actually succeeded
        if (result && typeof result === 'object' && result.success === false) {
          refreshFailed = true;
          
          // Check if it's a network error
          const isNetworkError = result.error && (
            result.error.includes('ERR_INTERNET_DISCONNECTED') ||
            result.error.includes('ECONNREFUSED') ||
            result.error.includes('ETIMEDOUT') ||
            result.error.includes('network') ||
            result.error.includes('offline')
          );
          
          if (isNetworkError) {
            log.debug(`Refresh failed due to network error for source ${sourceId}`);
            // Clear the scheduledWhileOffline flag to prevent rapid retries
            schedule.scheduledWhileOffline = false;
            // Don't count network errors towards failure limit
          } else {
            // Non-network error, increment counts
            schedule.failureCount++;
            schedule.retryCount = Math.min(schedule.retryCount + 1, schedule.maxRetries);
          }
        } else if (result && result.success !== false) {
          // Treat as success if not explicitly false
          schedule.retryCount = 0;
          schedule.failureCount = 0;
          schedule.scheduledWhileOffline = false;
        } else {
          // Invalid result format
          log.warn(`Invalid refresh result format for ${sourceId}:`, result);
          refreshFailed = true;
          schedule.failureCount++;
        }
      } else {
        log.error(`No refresh callback set!`);
        refreshFailed = true;
        schedule.failureCount++;
      }
    } catch (error) {
      log.error(`Refresh failed for source ${sourceId}:`, error);
      refreshFailed = true;
      schedule.failureCount++;
      
      // Increment retry count
      schedule.retryCount = Math.min(schedule.retryCount + 1, schedule.maxRetries);
    }
    
    // Get fresh network state after refresh
    const networkStateAfterRefresh = await window.electronAPI.getNetworkState();
    
    // Don't reschedule immediately if we're offline and the refresh failed
    if (!networkStateAfterRefresh.isOnline && refreshFailed) {
      log.debug(`Not rescheduling source ${sourceId} - offline and refresh failed`);
      return;
    }
    
    // Check if network state changed during refresh
    if (networkStateBeforeRefresh.isOnline !== networkStateAfterRefresh.isOnline) {
      log.debug(`Network state changed during refresh of ${sourceId}, using updated state`);
    }
    
    // Reschedule for next refresh
    await this.calculateNextRefresh(sourceId, networkStateAfterRefresh);
    this.setTimer(sourceId);
  }
  
  /**
   * Update last refresh time for a source
   */
  updateLastRefresh(sourceId, timestamp = Date.now()) {
    sourceId = String(sourceId); // Ensure sourceId is a string
    const schedule = this.schedules.get(sourceId);
    if (schedule) {
      // Validate timestamp is reasonable (not in future, not too old)
      const now = Date.now();
      if (timestamp > now + 60000) { // More than 1 minute in future
        log.warn(`Invalid timestamp for ${sourceId}: ${timestamp} is in the future`);
        timestamp = now;
      } else if (timestamp < now - 365 * 24 * 60 * 60 * 1000) { // More than 1 year old
        log.warn(`Invalid timestamp for ${sourceId}: ${timestamp} is too old`);
        timestamp = now;
      }
      
      schedule.lastRefresh = timestamp;
      schedule.retryCount = 0; // Reset retry count on successful refresh
      schedule.failureCount = 0; // Reset failure count on successful refresh
      
      // Don't await here to avoid blocking, but track the operation
      this.calculateNextRefresh(sourceId).then(() => {
        // Check if source still exists before setting timer
        if (this.schedules.has(sourceId)) {
          this.setTimer(sourceId);
        }
      }).catch(err => {
        log.error(`Error recalculating refresh time for ${sourceId}:`, err);
      });
    }
  }
  
  /**
   * Handle network state change
   */
  async handleNetworkChange(networkState) {
    // Prevent operations if destroyed
    if (this.isDestroyed) {
      return;
    }
    
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
      // Only set up the timer if we weren't already offline
      if (wasOffline) {
        // Already offline, no need to clear timers again
        return;
      }
      
      // Debounce offline handling to prevent duplicate logs
      this.networkChangeDebounceTimer = setTimeout(() => {
        // Double-check we're still offline and have timers to clear
        if (!this.lastNetworkState.isOnline && this.timers.size > 0) {
          log.info('Network went offline, clearing all timers');
          this.networkOfflineTime = Date.now();
          this.lastNetworkQuality = 'offline';
          for (const sourceId of this.timers.keys()) {
            this.clearTimer(sourceId);
          }
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
    const processedSourceIds = new Set();
    
    for (const [sourceId, schedule] of this.schedules) {
      if (schedule.scheduledWhileOffline) {
        sourcesScheduledOffline.push({ sourceId, schedule });
        processedSourceIds.add(sourceId);
      }
    }
    
    // Handle sources scheduled while offline immediately
    if (sourcesScheduledOffline.length > 0) {
      log.debug(`Processing ${sourcesScheduledOffline.length} sources scheduled while offline`);
      for (const { sourceId, schedule } of sourcesScheduledOffline) {
        // Clear the flag first to prevent loops
        schedule.scheduledWhileOffline = false;
        // Recalculate with online state to trigger immediate refresh if overdue
        await this.calculateNextRefresh(sourceId, networkState);
        this.setTimer(sourceId);
      }
    }
    
    // First, identify all overdue sources (excluding never-refreshed ones and already processed ones)
    const allOverdueSources = this.getOverdueSources(0, false); // No buffer, exclude never-refreshed
    const overdueSources = allOverdueSources.filter(source => !processedSourceIds.has(source.sourceId));
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
      const baseDelay = 1000; // 1 second base delay
      const maxDelay = 5000; // 5 seconds max
      const staggerDelay = Math.min(maxDelay, Math.max(baseDelay, 30000 / overdueCount)); // Between 1-5 seconds per source
      
      for (let i = 0; i < overdueSources.length; i++) {
        const { sourceId } = overdueSources[i];
        const delay = i * staggerDelay;
        
        // Set timeout for staggered refresh
        setTimeout(() => {
          // Check if source still exists before triggering
          if (this.schedules.has(sourceId)) {
            this.triggerRefresh(sourceId, 'network_recovery_overdue').catch(err => {
              log.error(`Error refreshing overdue source ${sourceId} during network recovery:`, err);
            });
          }
        }, delay);
      }
      
      // For sources that were overdue, wait for catch-up to complete
      // Don't modify lastRefresh as it would skip legitimate refreshes
      const catchUpTime = overdueCount * staggerDelay;
      
      // After catch-up, ensure sources are properly scheduled
      setTimeout(() => {
        log.debug('Overdue catch-up complete, ensuring proper scheduling');
        // Don't modify lastRefresh, just ensure timers are set properly
        for (const { sourceId } of overdueSources) {
          if (this.schedules.has(sourceId)) {
            // Timer should already be set by triggerRefresh completion
            // This is just a safety check
            if (!this.timers.has(sourceId)) {
              this.calculateNextRefresh(sourceId, networkState).then(() => {
                this.setTimer(sourceId);
              }).catch(err => {
                log.error(`Error rescheduling source ${sourceId} after catch-up:`, err);
              });
            }
          }
        }
      }, catchUpTime + 5000); // Add 5 seconds buffer after all overdue refreshes
    }
    
    // For sources that are not overdue and were not scheduled offline, just recalculate and set timers
    // Create snapshot to avoid concurrent modification
    const remainingSourceIds = Array.from(this.schedules.keys()).filter(sourceId => {
      const isOverdue = overdueSources.some(o => o.sourceId === sourceId);
      const wasScheduledOffline = sourcesScheduledOffline.some(s => s.sourceId === sourceId);
      return !isOverdue && !wasScheduledOffline;
    });
    
    for (const sourceId of remainingSourceIds) {
      if (this.schedules.has(sourceId)) {
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
    // Prevent overlapping checks for periodic checks
    if (reason === 'periodic_check' && this.overdueCheckInProgress) {
      log.debug('Overdue check already in progress, skipping');
      return;
    }
    
    this.overdueCheckInProgress = true;
    
    try {
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
    } finally {
      this.overdueCheckInProgress = false;
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
   * Start time jump detection
   */
  startTimeJumpDetection() {
    // Check every 5 seconds for time jumps
    this.timeCheckInterval = setInterval(() => {
      // Check if destroyed
      if (this.isDestroyed) {
        this.stopTimeJumpDetection();
        return;
      }
      
      const now = Date.now();
      const actualInterval = now - this.lastTimeCheck;
      
      // Only check for time jumps if we have a previous check time
      if (this.lastTimeCheck > 0) {
        // Consider it a time jump if the actual interval is significantly different
        // from what we'd expect (5 seconds +/- reasonable tolerance)
        // Allow for system sleep/wake and high CPU load scenarios
        const expectedInterval = 5000;
        const tolerance = 10000; // 10 seconds tolerance for system sleep/load
        const minExpected = expectedInterval - 1000; // Allow 1s early
        const maxExpected = expectedInterval + tolerance;
        
        // Only treat as time jump if interval is way outside expected range
        // and it's not just a system sleep/wake (which we handle separately)
        if (actualInterval < minExpected || actualInterval > 60000) { // More than 1 minute = likely time jump
          log.warn(`System time jump detected: actual interval ${Math.round(actualInterval / 1000)}s (expected ~5s)`);
          this.handleTimeJump().catch(err => {
            log.error('Error handling time jump:', err);
          });
        } else if (actualInterval > maxExpected) {
          // This is likely just system sleep/wake, not a time jump
          log.debug(`System wake/resume detected: interval ${Math.round(actualInterval / 1000)}s`);
        }
      }
      
      this.lastTimeCheck = now;
    }, 5000);
  }
  
  /**
   * Stop time jump detection
   */
  stopTimeJumpDetection() {
    if (this.timeCheckInterval) {
      clearInterval(this.timeCheckInterval);
      this.timeCheckInterval = null;
    }
  }
  
  /**
   * Handle system time jump
   */
  async handleTimeJump() {
    log.info('Handling system time jump, recalculating all schedules');
    
    // Clear all existing timers
    for (const sourceId of this.timers.keys()) {
      this.clearTimer(sourceId);
    }
    
    // Get current network state
    const networkState = await window.electronAPI.getNetworkState();
    
    // Recalculate and reset all schedules
    for (const [sourceId] of this.schedules) {
      await this.calculateNextRefresh(sourceId, networkState);
      this.setTimer(sourceId);
    }
    
    // Check for overdue sources
    await this.checkOverdueSources('time_jump');
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
      // Validate number is reasonable
      if (!isFinite(interval) || interval <= 0 || interval > 1440) { // Max 24 hours in minutes
        log.warn(`Invalid interval number: ${interval}`);
        return null;
      }
      return interval * 60 * 1000; // Convert minutes to milliseconds
    }
    
    // If it's a string, parse it
    const match = interval.toString().match(/^(\d+)\s*(second|minute|hour|day)s?$/i);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    if (!isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) {
      log.warn(`Invalid interval value: ${value}`);
      return null;
    }
    
    const unit = match[2].toLowerCase();
    
    const multipliers = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000
    };
    
    const result = value * multipliers[unit];
    
    // Final validation
    if (result > 24 * 60 * 60 * 1000 || result < 0) {
      log.warn(`Calculated interval out of bounds: ${result}ms`);
      return null;
    }
    
    return result;
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
  async destroy() {
    // Mark as destroyed to prevent new operations
    this.isDestroyed = true;
    
    // Clear all timers
    for (const sourceId of this.timers.keys()) {
      this.clearTimer(sourceId);
    }
    
    // Clear overdue check interval
    this.stopOverdueCheck();
    
    // Stop time jump detection
    this.stopTimeJumpDetection();
    
    // Clear network change debounce timer
    if (this.networkChangeDebounceTimer) {
      clearTimeout(this.networkChangeDebounceTimer);
      this.networkChangeDebounceTimer = null;
    }
    
    // Wait for active refreshes to complete (with timeout)
    if (this.activeRefreshes.size > 0) {
      log.info(`Waiting for ${this.activeRefreshes.size} active refreshes to complete`);
      const timeout = new Promise(resolve => setTimeout(resolve, 5000)); // 5 second timeout
      const activeRefreshPromises = Array.from(this.activeRefreshes);
      try {
        await Promise.race([
          Promise.all(activeRefreshPromises),
          timeout
        ]);
      } catch (err) {
        log.error('Error waiting for active refreshes:', err);
      }
    }
    
    // Clear all schedules
    this.schedules.clear();
    this.activeRefreshes.clear();
    
    // Clear callback references
    this.refreshCallback = null;
    
    log.debug('Scheduler destroyed');
  }
  
  /**
   * Check if a source is overdue
   */
  isSourceOverdue(sourceId, bufferMs = 60000) {
    sourceId = String(sourceId); // Ensure sourceId is a string
    const schedule = this.schedules.get(sourceId);
    if (!schedule) return false;
    
    if (!schedule.lastRefresh) return true;
    
    const now = Date.now();
    const expectedRefreshTime = schedule.lastRefresh + schedule.intervalMs;
    return (now - expectedRefreshTime) > bufferMs;
  }
  
}

module.exports = NetworkAwareScheduler;