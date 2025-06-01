/**
 * Standardized logger for main process
 * Format: [YYYY-MM-DD HH:MM:SS.mmm] [LEVEL] [Component] Message
 */

const log = require('electron-log');

// Configure electron-log format globally (only once)
// Use UTC timestamps for consistency across timezone changes
log.transports.console.format = '[{iso}] [{level}] {text}';
log.transports.file.format = '[{iso}] [{level}] {text}';

class MainLogger {
  constructor(component) {
    this.component = component;
    this.debugMode = process.env.DEBUG_MODE === 'true' || process.env.NODE_ENV === 'development';
  }

  formatMessage(message) {
    return `[${this.component}] ${message}`;
  }

  debug(message, data) {
    if (!this.debugMode) return;
    if (data !== undefined) {
      log.debug(this.formatMessage(message), data);
    } else {
      log.debug(this.formatMessage(message));
    }
  }

  info(message, data) {
    if (data !== undefined) {
      log.info(this.formatMessage(message), data);
    } else {
      log.info(this.formatMessage(message));
    }
  }

  warn(message, data) {
    if (data !== undefined) {
      log.warn(this.formatMessage(message), data);
    } else {
      log.warn(this.formatMessage(message));
    }
  }

  error(message, data) {
    if (data !== undefined) {
      log.error(this.formatMessage(message), data);
    } else {
      log.error(this.formatMessage(message));
    }
  }

  setDebugMode(enabled) {
    this.debugMode = enabled;
  }
}

// Factory function to create logger instances
function createLogger(component) {
  return new MainLogger(component);
}

// Export for use in main process
module.exports = { createLogger };