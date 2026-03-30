/**
 * Standardized logger for main process
 *
 * Output format: YYYY-MM-DDTHH:MM:SS.mmmZ LEVEL [Component] message
 *
 * Log levels (each includes all levels above it):
 * - error: Operation failures and exceptions
 * - warn:  Anomalies, retries, and fallbacks
 * - info:  Operational events and state changes
 * - debug: Detailed internals for troubleshooting
 */

import log from 'electron-log';
import path from 'node:path';

// Configure electron-log to output only our pre-formatted text
log.transports.console.format = '{text}';
log.transports.file.format = '{text}';

type LogLevelName = 'error' | 'warn' | 'info' | 'debug';

const VALID_LOG_LEVELS: ReadonlySet<string> = new Set<LogLevelName>(['error', 'warn', 'info', 'debug']);
function isLogLevelName(level: string): level is LogLevelName {
  return VALID_LOG_LEVELS.has(level);
}

interface LogLevels {
  error: 0;
  warn: 1;
  info: 2;
  debug: 3;
  [key: string]: number;
}

const LOG_LEVELS: LogLevels = { error: 0, warn: 1, info: 2, debug: 3 };

const LEVEL_LABELS: Record<LogLevelName, string> = {
  error: 'ERROR',
  warn: 'WARN ',
  info: 'INFO ',
  debug: 'DEBUG',
};

// No padding — compact format

// Initialize log level — defaults to info until settings override via setGlobalLogLevel
let currentLevel: number = LOG_LEVELS.info;

/**
 * Set the global log level for all main process loggers.
 */
function setGlobalLogLevel(level: string): void {
  if (isLogLevelName(level)) {
    currentLevel = LOG_LEVELS[level];
    log.transports.file.level = level;
    log.transports.console.level = level;
  }
}

function formatPrefix(level: LogLevelName, component: string): string {
  return `${new Date().toISOString()} ${LEVEL_LABELS[level]} [${component}]`;
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

class MainLogger {
  component: string;

  constructor(component: string) {
    this.component = component;
  }

  debug(message: string, data?: unknown): void {
    if (LOG_LEVELS.debug > currentLevel) return;
    const prefix = formatPrefix('debug', this.component);
    if (data !== undefined) {
      log.debug(prefix, message, formatData(data));
    } else {
      log.debug(prefix, message);
    }
  }

  info(message: string, data?: unknown): void {
    if (LOG_LEVELS.info > currentLevel) return;
    const prefix = formatPrefix('info', this.component);
    if (data !== undefined) {
      log.info(prefix, message, formatData(data));
    } else {
      log.info(prefix, message);
    }
  }

  warn(message: string, data?: unknown): void {
    if (LOG_LEVELS.warn > currentLevel) return;
    const prefix = formatPrefix('warn', this.component);
    if (data !== undefined) {
      log.warn(prefix, message, formatData(data));
    } else {
      log.warn(prefix, message);
    }
  }

  error(message: string, data?: unknown): void {
    const prefix = formatPrefix('error', this.component);
    if (data !== undefined) {
      log.error(prefix, message, formatData(data));
    } else {
      log.error(prefix, message);
    }
  }

  setDebugMode(enabled: boolean): void {
    setGlobalLogLevel(enabled ? 'debug' : 'info');
  }
}

// Factory function to create logger instances
function createLogger(component: string): MainLogger {
  return new MainLogger(component);
}

/**
 * Get the directory where electron-log writes log files
 */
function getLogDirectory(): string {
  return path.dirname(log.transports.file.getFile().path);
}

// Export for use in main process
export { createLogger, getLogDirectory, MainLogger, setGlobalLogLevel };
export default { createLogger, setGlobalLogLevel, getLogDirectory };
