const { createLogger } = require('../utils/logger');
const log = createLogger('TimeManager');

/**
 * TimeManager - Centralized service for robust time handling
 * 
 * Handles:
 * - System time changes (manual, NTP sync)
 * - Timezone changes
 * - DST transitions
 * - System sleep/wake
 * - Monotonic time tracking
 * - Wall-clock aligned scheduling
 */
class TimeManager {
  constructor() {
    // Core state
    this.listeners = new Set();
    this.checkInterval = null;
    this.isDestroyed = false;
    
    // Time tracking
    this.lastWallTime = Date.now();
    this.lastMonotonicTime = performance.now();
    this.lastTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.lastTimezoneOffset = new Date().getTimezoneOffset();
    
    // Detection thresholds
    this.TIME_JUMP_THRESHOLD = 5000; // 5 seconds
    this.CHECK_INTERVAL = 1000; // Check every second
    this.MONOTONIC_DRIFT_THRESHOLD = 2000; // 2 seconds drift tolerance
    
    // Event types
    this.EventType = {
      TIME_JUMP_FORWARD: 'time_jump_forward',
      TIME_JUMP_BACKWARD: 'time_jump_backward',
      TIMEZONE_CHANGE: 'timezone_change',
      DST_CHANGE: 'dst_change',
      SYSTEM_WAKE: 'system_wake',
      CLOCK_DRIFT: 'clock_drift'
    };
    
    // Statistics
    this.stats = {
      timeJumps: 0,
      timezoneChanges: 0,
      dstChanges: 0,
      systemWakes: 0,
      startTime: Date.now()
    };
  }
  
  /**
   * Initialize the time manager
   */
  async initialize() {
    if (this.checkInterval) return;
    
    // Get initial system timezone
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getSystemTimezone) {
      try {
        const systemTz = await window.electronAPI.getSystemTimezone();
        this.lastTimezone = systemTz.timezone;
        this.lastTimezoneOffset = systemTz.offset;
        log.info(`Initial timezone from system: ${systemTz.timezone} (offset: ${systemTz.offset}, method: ${systemTz.method})`);
      } catch (error) {
        log.error('Failed to get initial system timezone:', error);
      }
    }
    
    // Start monitoring
    this.startMonitoring();
    
    // Listen for system events if available
    if (typeof window !== 'undefined' && window.electronAPI) {
      if (window.electronAPI.onSystemResume) {
        window.electronAPI.onSystemResume(() => this.handleSystemWake());
      }
    }
    
    log.info(`TimeManager initialized - timezone: ${this.lastTimezone}, offset: ${this.lastTimezoneOffset}`);
    
    // Log timezone detection info
    log.info('TimeManager using system-level timezone detection for accurate timezone changes');
  }
  
  /**
   * Start time monitoring
   */
  startMonitoring() {
    this.checkInterval = setInterval(async () => {
      if (this.isDestroyed) {
        this.stopMonitoring();
        return;
      }
      
      try {
        await this.checkTime();
      } catch (error) {
        log.error('Error in time check:', error);
      }
    }, this.CHECK_INTERVAL);
  }
  
  /**
   * Stop time monitoring
   */
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
  
  /**
   * Main time check routine
   */
  async checkTime() {
    const now = Date.now();
    const monotonic = performance.now();
    
    // Get timezone info from system instead of cached JavaScript runtime
    let currentTimezone, currentOffset;
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getSystemTimezone) {
      try {
        const systemTz = await window.electronAPI.getSystemTimezone();
        currentTimezone = systemTz.timezone;
        currentOffset = systemTz.offset;
        
        // Log if we're using a non-cached method
        if (systemTz.method !== 'intl_fallback' && systemTz.method !== 'error_fallback') {
          log.debug(`Timezone detected via ${systemTz.method}: ${currentTimezone}`);
        }
      } catch (error) {
        log.error('Failed to get system timezone:', error);
        // Fallback to JavaScript's cached values
        currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        currentOffset = new Date().getTimezoneOffset();
      }
    } else {
      // Fallback for non-Electron environments
      currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      currentOffset = new Date().getTimezoneOffset();
    }
    
    // Calculate expected wall time based on monotonic time
    const monotonicDelta = monotonic - this.lastMonotonicTime;
    const expectedWallTime = this.lastWallTime + monotonicDelta;
    const wallTimeDelta = now - expectedWallTime;
    
    // Detect various time anomalies
    const events = [];
    
    // 1. Time jump detection
    if (Math.abs(wallTimeDelta) > this.TIME_JUMP_THRESHOLD) {
      if (wallTimeDelta > 0) {
        // Time jumped forward
        events.push({
          type: this.EventType.TIME_JUMP_FORWARD,
          delta: wallTimeDelta,
          from: this.lastWallTime,
          to: now
        });
        this.stats.timeJumps++;
      } else {
        // Time jumped backward
        events.push({
          type: this.EventType.TIME_JUMP_BACKWARD,
          delta: Math.abs(wallTimeDelta),
          from: this.lastWallTime,
          to: now
        });
        this.stats.timeJumps++;
      }
    }
    
    // 2. System wake detection (large monotonic jump)
    if (monotonicDelta > 30000) { // More than 30 seconds
      events.push({
        type: this.EventType.SYSTEM_WAKE,
        sleepDuration: monotonicDelta
      });
      this.stats.systemWakes++;
    }
    
    // 3. Timezone change detection
    if (currentTimezone !== this.lastTimezone) {
      events.push({
        type: this.EventType.TIMEZONE_CHANGE,
        from: this.lastTimezone,
        to: currentTimezone,
        offsetChange: currentOffset - this.lastTimezoneOffset
      });
      this.stats.timezoneChanges++;
    }
    
    // 4. DST change detection (offset changed but timezone didn't)
    if (currentOffset !== this.lastTimezoneOffset && currentTimezone === this.lastTimezone) {
      events.push({
        type: this.EventType.DST_CHANGE,
        offsetChange: currentOffset - this.lastTimezoneOffset,
        timezone: currentTimezone
      });
      this.stats.dstChanges++;
    }
    
    // 5. Clock drift detection (small but consistent drift)
    if (Math.abs(wallTimeDelta) > 100 && Math.abs(wallTimeDelta) < this.TIME_JUMP_THRESHOLD) {
      // Small drift that might accumulate
      events.push({
        type: this.EventType.CLOCK_DRIFT,
        drift: wallTimeDelta
      });
    }
    
    // Update tracking state
    this.lastWallTime = now;
    this.lastMonotonicTime = monotonic;
    this.lastTimezone = currentTimezone;
    this.lastTimezoneOffset = currentOffset;
    
    // Notify listeners of events
    if (events.length > 0) {
      this.notifyListeners(events);
    }
  }
  
  /**
   * Handle system wake event
   */
  handleSystemWake() {
    log.info('System wake detected by OS event');
    
    // Reset time tracking to current values
    this.lastWallTime = Date.now();
    this.lastMonotonicTime = performance.now();
    
    // Notify listeners
    this.notifyListeners([{
      type: this.EventType.SYSTEM_WAKE,
      source: 'os_event'
    }]);
  }
  
  /**
   * Register a time event listener
   */
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  
  /**
   * Notify all listeners of time events
   */
  notifyListeners(events) {
    for (const event of events) {
      log.info(`Time event detected: ${event.type}`, event);
    }
    
    for (const listener of this.listeners) {
      try {
        listener(events);
      } catch (error) {
        log.error('Error in time event listener:', error);
      }
    }
  }
  
  /**
   * Get current time info
   */
  async getCurrentTimeInfo() {
    const now = Date.now();
    let timezone, offset;
    
    // Try to get system timezone first
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getSystemTimezone) {
      try {
        const systemTz = await window.electronAPI.getSystemTimezone();
        timezone = systemTz.timezone;
        offset = systemTz.offset;
      } catch (error) {
        // Fallback to cached values
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        offset = new Date().getTimezoneOffset();
      }
    } else {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      offset = new Date().getTimezoneOffset();
    }
    
    return {
      timestamp: now,
      timezone,
      timezoneOffset: offset,
      isDST: this.isDST(now),
      wallClock: new Date(now).toISOString(),
      localTime: new Date(now).toLocaleString()
    };
  }
  
  /**
   * Check if date is in DST (approximation)
   */
  isDST(timestamp = Date.now()) {
    const date = new Date(timestamp);
    const jan = new Date(date.getFullYear(), 0, 1);
    const jul = new Date(date.getFullYear(), 6, 1);
    const janOffset = jan.getTimezoneOffset();
    const julOffset = jul.getTimezoneOffset();
    const currentOffset = date.getTimezoneOffset();
    
    // If current offset matches the smaller offset, we're in DST
    return currentOffset === Math.min(janOffset, julOffset);
  }
  
  /**
   * Calculate next wall-clock aligned time
   * @param {number} intervalMs - Interval in milliseconds
   * @param {number} lastRun - Last run timestamp
   * @param {Object} options - Alignment options
   */
  getNextAlignedTime(intervalMs, lastRun = null, options = {}) {
    const {
      alignToMinute = false,
      alignToHour = false,
      alignToDay = false
    } = options;
    
    const now = Date.now();
    const date = new Date(now);
    
    // If no alignment requested, use simple interval
    if (!alignToMinute && !alignToHour && !alignToDay) {
      return lastRun ? lastRun + intervalMs : now + intervalMs;
    }
    
    // Calculate aligned time
    if (alignToDay) {
      // Align to start of day
      date.setHours(0, 0, 0, 0);
      date.setTime(date.getTime() + intervalMs);
    } else if (alignToHour) {
      // Align to start of hour
      date.setMinutes(0, 0, 0);
      date.setTime(date.getTime() + intervalMs);
    } else if (alignToMinute) {
      // Align to start of minute
      date.setSeconds(0, 0);
      date.setTime(date.getTime() + intervalMs);
    }
    
    // Ensure time is in future
    while (date.getTime() <= now) {
      date.setTime(date.getTime() + intervalMs);
    }
    
    return date.getTime();
  }
  
  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime,
      currentTimezone: this.lastTimezone,
      currentOffset: this.lastTimezoneOffset
    };
  }
  
  /**
   * Cleanup
   */
  destroy() {
    this.isDestroyed = true;
    this.stopMonitoring();
    this.listeners.clear();
    log.info('TimeManager destroyed');
  }
}

// Export singleton instance
module.exports = new TimeManager();