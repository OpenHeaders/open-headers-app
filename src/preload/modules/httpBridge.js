const { ipcRenderer } = require('electron');
const timeUtils = require('./timeUtils');
const log = require('./logger');

class HttpBridge {
    async makeHttpRequest(url, method, options) {
        const requestId = timeUtils.now().toString(36) + Math.random().toString(36).substring(2, 5);

        try {
            if (!options.connectionOptions) {
                options.connectionOptions = {
                    keepAlive: true,
                    timeout: 30000,
                    requestId: requestId
                };
            }

            const result = await ipcRenderer.invoke('makeHttpRequest', url, method, options);
            return result;
        } catch (error) {
            log.error(`[${requestId}] HTTP request failed:`, error);

            // Enhanced logging for common network errors
            if (error.message && (
                error.message.includes('ECONNRESET') ||
                error.message.includes('ETIMEDOUT') ||
                error.message.includes('ECONNREFUSED')
            )) {
                log.error(`[${requestId}] Network error detected: ${error.message}`);

            }

            throw error;
        }
    }
}

module.exports = new HttpBridge();