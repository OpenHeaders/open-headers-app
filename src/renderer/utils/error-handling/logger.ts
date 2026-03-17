/**
 * Standardized logger for renderer process
 * Format: [YYYY-MM-DD HH:MM:SS.mmm] [LEVEL] [Component] Message
 */

// Lazy-load timeManager to avoid circular dependencies
let _timeManager: { getDate: (ts?: number | null) => Date } | null = null;
let _timeManagerLoading = false;
function getTimeManager() {
  if (!_timeManager && !_timeManagerLoading) {
    _timeManagerLoading = true;
    import('../../services/TimeManager').then(mod => {
      _timeManager = mod.default;
    }).catch(() => {
      // TimeManager not available yet, use Date directly
    }).finally(() => {
      _timeManagerLoading = false;
    });
  }
  return _timeManager;
}

const LOG_LEVELS: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };

// Initialize log level
let currentLevel = LOG_LEVELS.info;
try {
  if (typeof window !== 'undefined' && (window as any).electronAPI && (window as any).electronAPI.isDevelopment) {
    currentLevel = LOG_LEVELS.debug;
  }
} catch (e) {
  // electronAPI not available yet
}

/**
 * Set the global log level for all renderer loggers
 * @param {string} level - One of 'error', 'warn', 'info', 'debug'
 */
export function setGlobalLogLevel(level: string) {
  if (LOG_LEVELS[level] !== undefined) {
    currentLevel = LOG_LEVELS[level];
  }
}

class Logger {
  component: string;

  constructor(component: string) {
    this.component = component;
  }

  formatMessage(level: string, message: string, data?: unknown) {
    const tm = getTimeManager();
    const now = tm ? tm.getDate() : new Date();
    // Use UTC ISO format for consistent timestamps across timezone changes
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 23) + 'Z';
    const prefix = `[${timestamp}] [${level}] [${this.component}]`;

    if (data !== undefined) {
      return { prefix, message, data };
    }
    return { prefix, message, data: undefined };
  }

  log(level: string, message: string, data?: unknown) {
    const formatted = this.formatMessage(level, message, data);

    if (data !== undefined) {
      console.log(formatted.prefix, formatted.message, formatted.data);
    } else {
      console.log(formatted.prefix, formatted.message);
    }
  }

  debug(message: string, data?: unknown) {
    if (LOG_LEVELS.debug > currentLevel) return;
    this.log('DEBUG', message, data);
  }

  info(message: string, data?: unknown) {
    if (LOG_LEVELS.info > currentLevel) return;
    this.log('INFO', message, data);
  }

  warn(message: string, data?: unknown) {
    if (LOG_LEVELS.warn > currentLevel) return;
    const formatted = this.formatMessage('WARN', message, data);
    if (data !== undefined) {
      console.warn(formatted.prefix, formatted.message, formatted.data);
    } else {
      console.warn(formatted.prefix, formatted.message);
    }
  }

  error(message: string, data?: unknown) {
    const formatted = this.formatMessage('ERROR', message, data);
    if (data !== undefined) {
      console.error(formatted.prefix, formatted.message, formatted.data);
    } else {
      console.error(formatted.prefix, formatted.message);
    }
  }

  setDebugMode(enabled: boolean) {
    setGlobalLogLevel(enabled ? 'debug' : 'info');
  }
}

// Factory function to create logger instances
export function createLogger(component: string) {
  return new Logger(component);
}

// ESM exports above.
