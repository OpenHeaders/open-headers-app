/**
 * Standardized logger for renderer process
 * Format: [YYYY-MM-DD HH:MM:SS.mmm] [LEVEL] [Component] Message
 */

// Lazy-load timeManager to avoid circular dependencies
let timeManager = null;
function getTimeManager() {
  if (!timeManager && typeof require !== 'undefined') {
    try {
      timeManager = require('../services/TimeManager');
    } catch (e) {
      // TimeManager not available yet, use Date directly
    }
  }
  return timeManager;
}

class Logger {
  constructor(component) {
    this.component = component;
    // In renderer process, we can't access process.env directly
    // Debug mode will be controlled via settings or determined by the app
    this.debugMode = false;
    
    // Check if we're in development mode through electronAPI
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isDevelopment) {
      this.debugMode = true;
    }
  }

  formatMessage(level, message, data) {
    const tm = getTimeManager();
    const now = tm ? tm.getDate() : new Date();
    // Use UTC ISO format for consistent timestamps across timezone changes
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 23) + 'Z';
    const prefix = `[${timestamp}] [${level}] [${this.component}]`;
    
    if (data !== undefined) {
      return { prefix, message, data };
    }
    return { prefix, message };
  }

  log(level, message, data) {
    const formatted = this.formatMessage(level, message, data);
    
    if (data !== undefined) {
      console.log(formatted.prefix, formatted.message, formatted.data);
    } else {
      console.log(formatted.prefix, formatted.message);
    }
  }

  debug(message, data) {
    if (!this.debugMode) return;
    this.log('DEBUG', message, data);
  }

  info(message, data) {
    this.log('INFO', message, data);
  }

  warn(message, data) {
    const formatted = this.formatMessage('WARN', message, data);
    if (data !== undefined) {
      console.warn(formatted.prefix, formatted.message, formatted.data);
    } else {
      console.warn(formatted.prefix, formatted.message);
    }
  }

  error(message, data) {
    const formatted = this.formatMessage('ERROR', message, data);
    if (data !== undefined) {
      console.error(formatted.prefix, formatted.message, formatted.data);
    } else {
      console.error(formatted.prefix, formatted.message);
    }
  }

  setDebugMode(enabled) {
    this.debugMode = enabled;
  }
}

// Factory function to create logger instances
function createLogger(component) {
  return new Logger(component);
}

// Export for use in renderer process
module.exports = { createLogger };