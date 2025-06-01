/**
 * TimeManager for main process
 * Simplified version without renderer-specific features
 */
class MainTimeManager {
  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Get current timestamp - replacement for Date.now()
   */
  now() {
    return Date.now();
  }

  /**
   * Get current Date object - replacement for new Date()
   */
  getDate(timestamp = null) {
    return timestamp ? new Date(timestamp) : new Date();
  }

  /**
   * Get monotonic time for measuring durations
   */
  getMonotonicTime() {
    // In main process, use process.hrtime for high resolution
    const [seconds, nanoseconds] = process.hrtime();
    return seconds * 1000 + nanoseconds / 1000000;
  }

  /**
   * Format timestamp for consistent logging
   */
  formatTimestamp(timestamp = null) {
    const date = timestamp ? new Date(timestamp) : new Date();
    return date.toISOString();
  }
}

// Export singleton instance
module.exports = new MainTimeManager();