/**
 * Standardized logger for main process
 * Format: [YYYY-MM-DD HH:MM:SS.mmm] [LEVEL] [Component] Message
 */

import log from 'electron-log';
import fs from 'fs';
import path from 'path';

// Configure electron-log format globally (only once)
// Use UTC timestamps for consistency across timezone changes
log.transports.console.format = '[{iso}] [{level}] {text}';
log.transports.file.format = '[{iso}] [{level}] {text}';

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

// Initialize log level from environment
let currentLevel: number = (process.env.DEBUG_MODE === 'true' || process.env.NODE_ENV === 'development')
    ? LOG_LEVELS.debug
    : LOG_LEVELS.info;

/**
 * Archive the current log file and start fresh.
 * Copies the current log to {name}.{ISO-timestamp}.log and clears the active file.
 */
function rotateLogFile(): void {
  try {
    const logFile = log.transports.file.getFile();
    const logPath = logFile.path;

    // Only rotate if the file has content
    try {
      const stats = fs.statSync(logPath);
      if (stats.size === 0) return;
    } catch (e) {
      return; // File doesn't exist yet
    }

    // Build archive path: main.2026-03-16T13-30-00-000Z.log
    const dir = path.dirname(logPath);
    const ext = path.extname(logPath);
    const base = path.basename(logPath, ext);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = path.join(dir, `${base}.${timestamp}${ext}`);

    fs.copyFileSync(logPath, archivePath);

    // Clear using electron-log's API if available, otherwise overwrite
    if (typeof logFile.clear === 'function') {
      logFile.clear();
    } else {
      fs.writeFileSync(logPath, '');
    }
  } catch (err) {
    // Never let rotation failure break logging
    console.error('Log rotation failed:', err);
  }
}

/**
 * Set the global log level for all main process loggers.
 * When the level actually changes, the current log file is archived and a fresh one starts.
 */
function setGlobalLogLevel(level: string, skipRotation?: boolean): void {
  if (isLogLevelName(level)) {
    if (!skipRotation && currentLevel !== LOG_LEVELS[level]) {
      rotateLogFile();
    }
    currentLevel = LOG_LEVELS[level];
    log.transports.file.level = level;
    log.transports.console.level = level;
  }
}

class MainLogger {
  component: string;

  constructor(component: string) {
    this.component = component;
  }

  formatMessage(message: string): string {
    return `[${this.component}] ${message}`;
  }

  debug(message: string, data?: unknown): void {
    if (LOG_LEVELS.debug > currentLevel) return;
    if (data !== undefined) {
      log.debug(this.formatMessage(message), data);
    } else {
      log.debug(this.formatMessage(message));
    }
  }

  info(message: string, data?: unknown): void {
    if (LOG_LEVELS.info > currentLevel) return;
    if (data !== undefined) {
      log.info(this.formatMessage(message), data);
    } else {
      log.info(this.formatMessage(message));
    }
  }

  warn(message: string, data?: unknown): void {
    if (LOG_LEVELS.warn > currentLevel) return;
    if (data !== undefined) {
      log.warn(this.formatMessage(message), data);
    } else {
      log.warn(this.formatMessage(message));
    }
  }

  error(message: string, data?: unknown): void {
    if (data !== undefined) {
      log.error(this.formatMessage(message), data);
    } else {
      log.error(this.formatMessage(message));
    }
  }

  setDebugMode(enabled: boolean): void {
    setGlobalLogLevel(enabled ? 'debug' : 'info', true);
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
export { createLogger, setGlobalLogLevel, getLogDirectory, MainLogger };
export default { createLogger, setGlobalLogLevel, getLogDirectory };
