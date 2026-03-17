/**
 * Standardized logger for renderer process
 * Format: [YYYY-MM-DD HH:MM:SS.mmm] [LEVEL] [Component] Message
 */

// Lazy-load timeManager to avoid circular dependencies
let timeManager = null;
function getTimeManager() {
  if (!timeManager && typeof require !== 'undefined') {
    try {
      timeManager = require('../../services/TimeManager');
    } catch (e) {
      // TimeManager not available yet, use Date directly
    }
  }
  return timeManager;
}

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

// Initialize log level
let currentLevel = LOG_LEVELS.info;
try {
  if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isDevelopment) {
    currentLevel = LOG_LEVELS.debug;
  }
} catch (e) {
  // electronAPI not available yet
}

/**
 * Set the global log level for all renderer loggers
 * @param {string} level - One of 'error', 'warn', 'info', 'debug'
 */
function setGlobalLogLevel(level) {
  if (LOG_LEVELS[level] !== undefined) {
    currentLevel = LOG_LEVELS[level];
  }
}

class Logger {
  constructor(component) {
    this.component = component;
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
    if (LOG_LEVELS.debug > currentLevel) return;
    this.log('DEBUG', message, data);
  }

  info(message, data) {
    if (LOG_LEVELS.info > currentLevel) return;
    this.log('INFO', message, data);
  }

  warn(message, data) {
    if (LOG_LEVELS.warn > currentLevel) return;
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
    setGlobalLogLevel(enabled ? 'debug' : 'info');
  }
}

// Factory function to create logger instances
function createLogger(component) {
  return new Logger(component);
}

// Export for use in renderer process
module.exports = { createLogger, setGlobalLogLevel };
