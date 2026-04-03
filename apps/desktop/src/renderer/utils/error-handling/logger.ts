/**
 * Standardized logger for renderer process
 *
 * Output format: YYYY-MM-DDTHH:MM:SS.mmmZ LEVEL [Component] message
 *
 * Log levels (each includes all levels above it):
 * - error: Operation failures and exceptions
 * - warn:  Anomalies, retries, and fallbacks
 * - info:  Operational events and state changes
 * - debug: Detailed internals for troubleshooting
 */

// Lazy-load timeManager to avoid circular dependencies
let _timeManager: { getDate: (ts?: number | null) => Date } | null = null;
let _timeManagerLoading = false;
function getTimeManager() {
  if (!_timeManager && !_timeManagerLoading) {
    _timeManagerLoading = true;
    import('../../services/TimeManager')
      .then((mod) => {
        _timeManager = mod.default;
      })
      .catch(() => {
        // TimeManager not available yet, use Date directly
      })
      .finally(() => {
        _timeManagerLoading = false;
      });
  }
  return _timeManager;
}

type LogLevelName = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };

const LEVEL_LABELS: Record<LogLevelName, string> = {
  error: 'ERROR',
  warn: 'WARN ',
  info: 'INFO ',
  debug: 'DEBUG',
};

// Initialize log level — defaults to info until settings override via setGlobalLogLevel
let currentLevel = LOG_LEVELS.info;

/**
 * Set the global log level for all renderer loggers
 * @param {string} level - One of 'error', 'warn', 'info', 'debug'
 */
export function setGlobalLogLevel(level: string) {
  if (LOG_LEVELS[level] !== undefined) {
    currentLevel = LOG_LEVELS[level];
  }
}

function formatPrefix(level: LogLevelName, component: string): string {
  const tm = getTimeManager();
  const now = tm ? tm.getDate() : new Date();
  return `${now.toISOString()} ${LEVEL_LABELS[level]} [${component}]`;
}

function formatData(data: unknown): string {
  if (data === null || data === undefined) return String(data);
  if (data instanceof Error) return `${data.name}: ${data.message}`;
  if (typeof data === 'object') {
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }
  return String(data);
}

class Logger {
  component: string;

  constructor(component: string) {
    this.component = component;
  }

  debug(message: string, data?: unknown) {
    if (LOG_LEVELS.debug > currentLevel) return;
    const prefix = formatPrefix('debug', this.component);
    if (data !== undefined) {
      console.log(prefix, message, formatData(data));
    } else {
      console.log(prefix, message);
    }
  }

  info(message: string, data?: unknown) {
    if (LOG_LEVELS.info > currentLevel) return;
    const prefix = formatPrefix('info', this.component);
    if (data !== undefined) {
      console.log(prefix, message, formatData(data));
    } else {
      console.log(prefix, message);
    }
  }

  warn(message: string, data?: unknown) {
    if (LOG_LEVELS.warn > currentLevel) return;
    const prefix = formatPrefix('warn', this.component);
    if (data !== undefined) {
      console.warn(prefix, message, formatData(data));
    } else {
      console.warn(prefix, message);
    }
  }

  error(message: string, data?: unknown) {
    const prefix = formatPrefix('error', this.component);
    if (data !== undefined) {
      console.error(prefix, message, formatData(data));
    } else {
      console.error(prefix, message);
    }
  }
}

// Factory function to create logger instances
export function createLogger(component: string) {
  return new Logger(component);
}
