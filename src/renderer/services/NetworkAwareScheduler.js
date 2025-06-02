const { createLogger } = require('../utils/logger');
const timeManager = require('./TimeManager');
const log = createLogger('NetworkAwareScheduler');

/**
 * Handles network-aware scheduling of refresh operations.
 * Separates scheduling logic from refresh execution.
 * Integrated with TimeManager for robust time handling.
 */
class NetworkAwareScheduler {
  constructor() {
    this.schedules = new Map(); // sourceId -> schedule info
    this.overdueCheckInterval = null;
    this.refreshCallback = null;
    this.networkOfflineTime = null; // Track when network went offline
    this.lastNetworkState = { isOnline: true }; // Track last known network state
    this.lastNetworkQuality = 'good'; // Track last known network quality
    this.networkChangeDebounceTimer = null; // Debounce rapid network changes
    this.isDestroyed = false; // Track if instance has been destroyed
    this.activeRefreshes = new Set(); // Track sourceIds of active refresh operations
    this.overdueCheckInProgress = false; // Prevent overlapping overdue checks
    this.timeEventUnsubscribe = null; // TimeManager event listener cleanup
    this.masterTimer = null; // Single timer for all scheduling
    this.MASTER_TIMER_INTERVAL = 1000; // Check every second
  }
  
  /**
   * Initialize the scheduler with a callback for refresh execution
   */
  async initialize(refreshCallback) {
    this.refreshCallback = refreshCallback;
    
    // Initialize TimeManager
    await timeManager.initialize();
    
    // Subscribe to time events
    this.timeEventUnsubscribe = timeManager.addListener((events) => {
      this.handleTimeEvents(events);
    });
    
    // Start master timer instead of individual timers
    this.startMasterTimer();
    
    // Start periodic overdue check
    this.startOverdueCheck();
    
    log.info('NetworkAwareScheduler initialized with TimeManager integration');
  }
  
  /**
   * Handle time events from TimeManager
   */
  handleTimeEvents(events) {
    log.info('Time events detected', { count: events.length });
    
    for (const event of events) {
      switch (event.type) {
        case timeManager.EventType.TIME_JUMP_FORWARD:
        case timeManager.EventType.TIME_JUMP_BACKWARD:
          log.warn(`Time jump detected: ${event.type}`, { delta: event.delta });
          this.handleTimeJump();
          break;
          
        case timeManager.EventType.TIMEZONE_CHANGE:
          log.info('Timezone changed', { from: event.from, to: event.to });
          this.handleTimezoneChange();
          break;
          
        case timeManager.EventType.DST_CHANGE:
          log.info('DST change detected', { offsetChange: event.offsetChange });
          this.handleDSTChange();
          break;
          
        case timeManager.EventType.SYSTEM_WAKE:
          log.info('System wake detected by TimeManager');
          this.checkOverdueSources('system_wake').catch(err => {
            log.error('Error checking overdue sources after system wake:', err);
          });
          break;
          
        case timeManager.EventType.CLOCK_DRIFT:
          // Small drifts are handled by regular scheduling
          log.debug('Clock drift detected', { drift: event.drift });
          break;
      }
    }
  }
  
  /**
   * Handle time jump (forward or backward)
   */
  handleTimeJump() {
    // Recalculate all schedules
    const now = timeManager.now();
    
    for (const [sourceId, schedule] of this.schedules) {
      // Recalculate next refresh based on current time
      if (schedule.lastRefresh) {
        const timeSinceLastRefresh = now - schedule.lastRefresh;
        
        // If negative (time went backward), treat as if just refreshed
        if (timeSinceLastRefresh < 0) {
          schedule.lastRefresh = now;
          schedule.nextRefresh = now + schedule.intervalMs;
        } else if (timeSinceLastRefresh > schedule.intervalMs) {
          // Overdue - refresh soon
          schedule.nextRefresh = now + Math.random() * 5000; // 0-5s jitter
        } else {
          // Normal case - maintain interval
          schedule.nextRefresh = schedule.lastRefresh + schedule.intervalMs;
        }
      }
    }
    
    // Check for overdue sources
    this.checkOverdueSources('time_jump').catch(err => {
      log.error('Error checking overdue sources after time jump:', err);
    });
  }
  
  /**
   * Handle timezone change
   */
  handleTimezoneChange() {
    // Timezone changes don't affect UTC timestamps, but user expectations might change
    // Log for debugging but no action needed for absolute time scheduling
    const timeInfo = timeManager.getCurrentTimeInfo();
    log.info('Current time info after timezone change', timeInfo);
    
    // Optionally trigger immediate check for sources that might appear overdue to user
    this.checkOverdueSources('timezone_change').catch(err => {
      log.error('Error checking sources after timezone change:', err);
    });
  }
  
  /**
   * Handle DST change
   */
  handleDSTChange() {
    // Similar to timezone change - UTC times remain valid
    // This is mainly for logging and debugging
    const timeInfo = timeManager.getCurrentTimeInfo();
    log.info('Current time info after DST change', timeInfo);
  }
  
  /**
   * Start master timer for checking all schedules
   */
  startMasterTimer() {
    if (this.masterTimer) return;
    
    this.masterTimer = setInterval(() => {
      if (this.isDestroyed) {
        this.stopMasterTimer();
        return;
      }
      
      this.checkSchedules();
    }, this.MASTER_TIMER_INTERVAL);
    
    log.info('Master timer started - checking schedules every second');
  }
  
  /**
   * Stop master timer
   */
  stopMasterTimer() {
    if (this.masterTimer) {
      clearInterval(this.masterTimer);
      this.masterTimer = null;
    }
  }
  
  /**
   * Check all schedules and trigger refreshes as needed
   */
  checkSchedules() {
    const now = timeManager.now();
    
    for (const [sourceId, schedule] of this.schedules) {
      // Skip if no next refresh time or if offline
      if (!schedule.nextRefresh || !this.lastNetworkState.isOnline) {
        continue;
      }
      
      // Check if it's time to refresh (with 500ms grace period)
      if (now >= schedule.nextRefresh - 500) {
        // Skip if already refreshing
        if (this.activeRefreshes.has(sourceId)) {
          continue;
        }
        
        // Trigger refresh
        try {
          this.triggerRefresh(sourceId, 'scheduled').catch(err => {
            log.error(`Error triggering scheduled refresh for ${sourceId}:`, err);
          });
        } catch (err) {
          log.error(`Synchronous error triggering scheduled refresh for ${sourceId}:`, err);
        }
      }
    }
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
      log.debug(`Source ${source.sourceId} already scheduled, updating schedule`, {
        existingLastRefresh: existingSchedule.lastRefresh,
        existingNextRefresh: existingSchedule.nextRefresh,
        existingHasBeenScheduled: existingSchedule.hasBeenScheduled,
        newInterval: intervalMs
      });
    }
    
    const schedule = {
      sourceId: String(source.sourceId), // Ensure sourceId is always a string
      intervalMs,
      // When updating an existing schedule, preserve its lastRefresh time
      // This prevents the source from being incorrectly marked as "never refreshed"
      lastRefresh: existingSchedule?.lastRefresh || 
                   (source.refreshOptions?.lastRefresh ? timeManager.getDate(source.refreshOptions.lastRefresh).getTime() : null),
      nextRefresh: existingSchedule?.nextRefresh || null, // Preserve next refresh if updating
      retryCount: existingSchedule?.retryCount || 0, // Preserve retry count
      maxRetries: 3,
      backoffFactor: 2,
      scheduledWhileOffline: existingSchedule?.scheduledWhileOffline || false, // Preserve offline state
      hasBeenScheduled: true, // If we're updating, it has been scheduled
      failureCount: existingSchedule?.failureCount || 0, // Preserve failure count
      maxConsecutiveFailures: 10, // Stop trying after 10 consecutive failures
      // Wall-clock alignment options
      alignToMinute: source.refreshOptions?.alignToMinute || false,
      alignToHour: source.refreshOptions?.alignToHour || false,
      alignToDay: source.refreshOptions?.alignToDay || false
    };
    
    // Store the old interval before updating the schedule
    const oldIntervalMs = existingSchedule?.intervalMs;
    const intervalChanged = existingSchedule && oldIntervalMs !== intervalMs;
    
    this.schedules.set(source.sourceId, schedule);
    
    // Log the new schedule state for debugging
    if (existingSchedule) {
      log.debug(`Updated schedule for source ${source.sourceId}`, {
        lastRefresh: schedule.lastRefresh,
        hasBeenScheduled: schedule.hasBeenScheduled,
        intervalMs: schedule.intervalMs,
        oldIntervalMs: oldIntervalMs,
        intervalChanged: intervalChanged
      });
    }
    
    const networkState = await window.electronAPI.getNetworkState();
    await this.calculateNextRefresh(source.sourceId, networkState, oldIntervalMs);
    // Note: No individual timer needed - master timer handles all schedules
    
    // Check if source is already overdue
    const now = timeManager.now();
    const isOverdue = schedule.lastRefresh && (now - schedule.lastRefresh) > intervalMs;
    
    if (isOverdue) {
      const overdueBy = now - (schedule.lastRefresh + intervalMs);
      // If interval changed, check if it was overdue with OLD interval
      if (intervalChanged && oldIntervalMs) {
        const wasOverdueWithOldInterval = (now - schedule.lastRefresh) > oldIntervalMs;
        if (!wasOverdueWithOldInterval) {
          log.info(`Source ${source.sourceId} appears overdue with new interval (${intervalMs}ms) but was not overdue with old interval (${oldIntervalMs}ms) - will use new interval starting from now`);
        } else if (!networkState.isOnline) {
          log.info(`Source ${source.sourceId} was overdue with old interval by ${Math.round(overdueBy / 1000)}s but network is offline - will refresh when network returns`);
        } else {
          log.info(`Source ${source.sourceId} was already overdue with old interval - overdue by ${Math.round(overdueBy / 1000)}s, will refresh immediately`);
        }
      } else if (!networkState.isOnline) {
        log.info(`Source ${source.sourceId} is overdue by ${Math.round(overdueBy / 1000)}s but network is offline - will refresh when network returns`);
      } else {
        log.info(`Scheduled overdue source ${source.sourceId} - overdue by ${Math.round(overdueBy / 1000)}s, will refresh immediately`);
      }
    } else {
      const alignmentInfo = (schedule.alignToDay ? 'day-aligned' : 
                           schedule.alignToHour ? 'hour-aligned' : 
                           schedule.alignToMinute ? 'minute-aligned' : 'interval-based');
      log.info(`Scheduled source ${source.sourceId} with interval ${intervalMs}ms (${source.refreshOptions?.interval} minutes, ${alignmentInfo})`);
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
   * Calculate next refresh time based on network conditions and alignment options
   * @param {string} sourceId - The source ID
   * @param {object} networkState - The network state (optional)
   * @param {number} oldIntervalMs - The previous interval in ms (optional, used when interval changes)
   */
  async calculateNextRefresh(sourceId, networkState = null, oldIntervalMs = null) {
    sourceId = String(sourceId); // Ensure sourceId is a string
    const schedule = this.schedules.get(sourceId);
    if (!schedule) return;
    
    const now = timeManager.now();
    let delay = schedule.intervalMs;
    
    // Get current network state if not provided
    if (!networkState) {
      networkState = await window.electronAPI.getNetworkState();
    }
    
    // Store network state for later use
    schedule.lastNetworkState = networkState.isOnline;
    
    // Adjust delay based on network conditions
    if (!networkState.isOnline) {
      // When offline, calculate next refresh time but master timer won't trigger it
      // This preserves the schedule for when network returns
      const baseTime = schedule.lastRefresh || now;
      
      // Use wall-clock alignment if configured
      if (schedule.alignToMinute || schedule.alignToHour || schedule.alignToDay) {
        schedule.nextRefresh = timeManager.getNextAlignedTime(delay, baseTime, {
          alignToMinute: schedule.alignToMinute,
          alignToHour: schedule.alignToHour,
          alignToDay: schedule.alignToDay
        });
      } else {
        schedule.nextRefresh = baseTime + delay;
      }
      
      // Mark if this is initial scheduling while offline
      if (!schedule.scheduledWhileOffline) {
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
        const isInitialSchedule = !schedule.hasBeenScheduled || schedule.scheduledWhileOffline;
        
        // IMPORTANT: When updating a schedule (e.g., changing interval), we should NOT
        // treat it as overdue just because the time since last refresh exceeds the NEW interval.
        // The user expects the new interval to start from NOW, not retroactively.
        // Only treat as overdue if it was already overdue with the OLD interval.
        if (oldIntervalMs !== null && oldIntervalMs !== schedule.intervalMs) {
          // Interval has changed - check if it was overdue with the OLD interval
          const wasOverdueWithOldInterval = timeSinceLastRefresh > oldIntervalMs;
          if (!wasOverdueWithOldInterval) {
            // Not overdue with old interval, so start fresh with new interval
            log.debug(`Source ${sourceId} interval changed from ${oldIntervalMs}ms to ${schedule.intervalMs}ms - starting new interval from now`);
            // Don't treat as overdue - fall through to normal scheduling below
          } else if (isInitialSchedule) {
            // Was already overdue with old interval and is initial schedule
            schedule.nextRefresh = now + 100; // 100ms delay to allow UI to settle
            log.debug(`Source ${sourceId} was already overdue with old interval, scheduling immediate refresh`);
            schedule.scheduledWhileOffline = false;
            schedule.hasBeenScheduled = true;
            return schedule.nextRefresh;
          }
        } else if (isInitialSchedule) {
          // For initial schedule of overdue source (no interval change), refresh immediately
          schedule.nextRefresh = now + 100; // 100ms delay to allow UI to settle
          log.debug(`Source ${sourceId} is overdue ${schedule.scheduledWhileOffline ? '(was offline)' : '(initial load)'}, scheduling immediate refresh`);
          
          // Clear the offline flag and mark as scheduled
          schedule.scheduledWhileOffline = false;
          schedule.hasBeenScheduled = true;
          return schedule.nextRefresh;
        } else {
          // For network recovery or other cases, add jitter to avoid thundering herd
          const jitter = Math.random() * 5000; // 0-5 seconds random jitter
          schedule.nextRefresh = now + 1000 + jitter; // 1-6 seconds from now
          log.debug(`Source ${sourceId} is overdue, scheduling soon with jitter`);
          return schedule.nextRefresh;
        }
      }
    }
    
    // Clear offline flag if source is not overdue
    schedule.scheduledWhileOffline = false;
    
    // Calculate from last refresh or now
    // If interval has changed, always calculate from now (user expects new interval to start now)
    const intervalHasChanged = oldIntervalMs !== null && oldIntervalMs !== schedule.intervalMs;
    const baseTime = intervalHasChanged ? now : (schedule.lastRefresh || now);
    
    if (intervalHasChanged) {
      log.info(`Source ${sourceId} interval changed - calculating next refresh from current time`);
    }
    
    // Use wall-clock alignment if configured
    if (schedule.alignToMinute || schedule.alignToHour || schedule.alignToDay) {
      schedule.nextRefresh = timeManager.getNextAlignedTime(delay, baseTime, {
        alignToMinute: schedule.alignToMinute,
        alignToHour: schedule.alignToHour,
        alignToDay: schedule.alignToDay
      });
    } else {
      // Standard interval-based scheduling
      schedule.nextRefresh = baseTime + delay;
      
      // Ensure next refresh is in the future
      if (schedule.nextRefresh <= now) {
        schedule.nextRefresh = now + Math.min(delay, 5000); // Min 5 second delay
      }
    }
    
    return schedule.nextRefresh;
  }
  
  /**
   * Set or update timer for a source
   * @deprecated Using master timer instead of individual timers
   */
  setTimer(sourceId) {
    // No-op - master timer handles all scheduling
    // Kept for backward compatibility
  }
  
  /**
   * Clear timer for a source
   * @deprecated Using master timer instead of individual timers
   */
  clearTimer(sourceId) {
    // No-op - master timer handles all scheduling
    // Kept for backward compatibility
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
    
    // Track this refresh operation
    this.activeRefreshes.add(sourceId);
    
    // Calculate next refresh time BEFORE the refresh starts
    // This ensures consistent intervals regardless of refresh duration
    if (reason === 'scheduled' && schedule.lastRefresh) {
      const now = timeManager.now();
      
      // Use wall-clock alignment if configured
      if (schedule.alignToMinute || schedule.alignToHour || schedule.alignToDay) {
        // For wall-clock aligned sources, use TimeManager to calculate next aligned time
        const baseTime = schedule.nextRefresh || (schedule.lastRefresh + schedule.intervalMs);
        schedule.nextRefresh = timeManager.getNextAlignedTime(schedule.intervalMs, baseTime, {
          alignToMinute: schedule.alignToMinute,
          alignToHour: schedule.alignToHour,
          alignToDay: schedule.alignToDay
        });
        
        // Ensure next refresh is in the future
        if (schedule.nextRefresh <= now) {
          schedule.nextRefresh = timeManager.getNextAlignedTime(schedule.intervalMs, now, {
            alignToMinute: schedule.alignToMinute,
            alignToHour: schedule.alignToHour,
            alignToDay: schedule.alignToDay
          });
        }
      } else {
        // For interval-based scheduling, calculate from the expected refresh time
        const expectedRefreshTime = schedule.nextRefresh || (schedule.lastRefresh + schedule.intervalMs);
        schedule.nextRefresh = expectedRefreshTime + schedule.intervalMs;
        
        // Ensure next refresh is in the future
        if (schedule.nextRefresh <= now) {
          schedule.nextRefresh = now + schedule.intervalMs;
        }
      }
      
      log.debug(`Pre-calculated next refresh for ${sourceId}: ${timeManager.getDate(schedule.nextRefresh).toISOString()}`);
    }
    
    try {
      await this._performRefresh(sourceId, reason);
    } catch (error) {
      log.error(`Error in triggerRefresh for ${sourceId}:`, error);
      // Don't re-throw - we've logged it and callers may not handle it
    } finally {
      this.activeRefreshes.delete(sourceId);
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
    
    // Only recalculate next refresh time if:
    // 1. This was not a scheduled refresh (manual, overdue, etc.)
    // 2. The refresh failed (need retry scheduling)
    // 3. The next refresh time wasn't already set
    if (reason !== 'scheduled' || refreshFailed || !schedule.nextRefresh) {
      // Recalculate for non-scheduled refreshes, failures, or if no next time set
      await this.calculateNextRefresh(sourceId, networkStateAfterRefresh, null);
    }
  }
  
  /**
   * Update last refresh time for a source
   */
  updateLastRefresh(sourceId, timestamp = null, forceRecalculate = false) {
    sourceId = String(sourceId); // Ensure sourceId is a string
    const schedule = this.schedules.get(sourceId);
    if (schedule) {
      // Validate timestamp is reasonable (not in future, not too old)
      const now = timeManager.now();
      if (!timestamp) {
        timestamp = now;
      }
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
      schedule.hasBeenScheduled = true; // Mark as having been scheduled
      
      // Recalculate if:
      // 1. forceRecalculate is true (e.g., after manual refresh following a save)
      // 2. next refresh time is not set or is in the past
      if (forceRecalculate || !schedule.nextRefresh || schedule.nextRefresh <= now) {
        // Don't await here to avoid blocking
        this.calculateNextRefresh(sourceId, null, null).catch(err => {
          log.error(`Error recalculating refresh time for ${sourceId}:`, err);
        });
      }
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
        // Double-check we're still offline
        if (!this.lastNetworkState.isOnline) {
          log.info('Network went offline, pausing refresh scheduling');
          this.networkOfflineTime = timeManager.now();
          this.lastNetworkQuality = 'offline';
          // Master timer will skip offline sources automatically
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
    const offlineDuration = this.networkOfflineTime ? timeManager.now() - this.networkOfflineTime : 0;
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
        await this.calculateNextRefresh(sourceId, networkState, null);
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
            // Recalculate next refresh time if needed
            this.calculateNextRefresh(sourceId, networkState, null).catch(err => {
              log.error(`Error rescheduling source ${sourceId} after catch-up:`, err);
            });
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
        await this.calculateNextRefresh(sourceId, networkState, null);
      }
    }
  }
  
  /**
   * Get overdue sources
   * @param {number} bufferMs - Buffer time in milliseconds before considering overdue
   * @param {boolean} includeNeverRefreshed - Whether to include sources that have never been refreshed
   */
  getOverdueSources(bufferMs = 60000, includeNeverRefreshed = true) {
    const now = timeManager.now();
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
      activeRefreshes: this.activeRefreshes.size,
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
    
    // Stop master timer
    this.stopMasterTimer();
    
    // Clear overdue check interval
    this.stopOverdueCheck();
    
    // Unsubscribe from TimeManager events
    if (this.timeEventUnsubscribe) {
      this.timeEventUnsubscribe();
      this.timeEventUnsubscribe = null;
    }
    
    // Clear network change debounce timer
    if (this.networkChangeDebounceTimer) {
      clearTimeout(this.networkChangeDebounceTimer);
      this.networkChangeDebounceTimer = null;
    }
    
    // Wait for active refreshes to complete (with timeout)
    if (this.activeRefreshes.size > 0) {
      log.info(`Active refresh operations in progress: ${Array.from(this.activeRefreshes).join(', ')}`);
      // Give ongoing refreshes a chance to complete
      const timeout = new Promise(resolve => setTimeout(resolve, 5000)); // 5 second timeout
      await timeout;
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
    
    const now = timeManager.now();
    const expectedRefreshTime = schedule.lastRefresh + schedule.intervalMs;
    return (now - expectedRefreshTime) > bufferMs;
  }
  
}

module.exports = NetworkAwareScheduler;