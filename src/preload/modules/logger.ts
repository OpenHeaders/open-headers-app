import timeUtils from './timeUtils';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_LABELS: Record<LogLevel, string> = {
    error: 'ERROR',
    warn: 'WARN ',
    info: 'INFO ',
    debug: 'DEBUG',
};

const MODULE = 'Preload';

function formatPrefix(level: LogLevel): string {
    return `${timeUtils.newDate().toISOString()} ${LEVEL_LABELS[level]} [${MODULE}]`;
}

function formatData(data: unknown): string {
    if (data === null || data === undefined) return String(data);
    if (data instanceof Error) return `${data.name}: ${data.message}`;
    if (typeof data === 'object') {
        try { return JSON.stringify(data); }
        catch { return String(data); }
    }
    return String(data);
}

const logger = {
    info: (message: string, data?: unknown): void => {
        const prefix = formatPrefix('info');
        if (data !== undefined) {
            console.log(prefix, message, formatData(data));
        } else {
            console.log(prefix, message);
        }
    },

    warn: (message: string, data?: unknown): void => {
        const prefix = formatPrefix('warn');
        if (data !== undefined) {
            console.warn(prefix, message, formatData(data));
        } else {
            console.warn(prefix, message);
        }
    },

    error: (message: string, data?: unknown): void => {
        const prefix = formatPrefix('error');
        if (data !== undefined) {
            console.error(prefix, message, formatData(data));
        } else {
            console.error(prefix, message);
        }
    },

    debug: (message: string, data?: unknown): void => {
        // Safe environment check for preload context
        const isDebug = (typeof process !== 'undefined' && process.env &&
                        (process.env.DEBUG_MODE === 'true' || process.env.NODE_ENV === 'development'));
        if (!isDebug) return;

        const prefix = formatPrefix('debug');
        if (data !== undefined) {
            console.debug(prefix, message, formatData(data));
        } else {
            console.debug(prefix, message);
        }
    }
};

export default logger;
