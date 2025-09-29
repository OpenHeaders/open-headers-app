const timeUtils = require('./timeUtils');

const logger = {
    formatTimestamp: () => {
        const now = timeUtils.newDate();
        return now.toISOString().replace('T', ' ').substring(0, 23) + 'Z';
    },
    
    info: (message, data) => {
        const timestamp = logger.formatTimestamp();
        if (data !== undefined) {
            console.log(`[${timestamp}] [INFO] [Preload] ${message}`, data);
        } else {
            console.log(`[${timestamp}] [INFO] [Preload] ${message}`);
        }
    },
    
    error: (message, data) => {
        const timestamp = logger.formatTimestamp();
        if (data !== undefined) {
            console.error(`[${timestamp}] [ERROR] [Preload] ${message}`, data);
        } else {
            console.error(`[${timestamp}] [ERROR] [Preload] ${message}`);
        }
    },
    
    debug: (message, data) => {
        // Safe environment check for preload context
        const isDebug = (typeof process !== 'undefined' && process.env && 
                        (process.env.DEBUG_MODE === 'true' || process.env.NODE_ENV === 'development'));
        if (!isDebug) return;
        
        const timestamp = logger.formatTimestamp();
        if (data !== undefined) {
            console.debug(`[${timestamp}] [DEBUG] [Preload] ${message}`, data);
        } else {
            console.debug(`[${timestamp}] [DEBUG] [Preload] ${message}`);
        }
    }
};

module.exports = logger;