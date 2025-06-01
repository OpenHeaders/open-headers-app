/**
 * Standardized logger for renderer process
 * Format: [YYYY-MM-DD HH:MM:SS.mmm] [LEVEL] [Component] Message
 */

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
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 23);
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