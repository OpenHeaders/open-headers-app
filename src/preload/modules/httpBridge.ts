import electron from 'electron';
const { ipcRenderer } = electron;
import timeUtils from './timeUtils';
import log from './logger';
import type { HttpRequestOptions } from '../../types/http';

class HttpBridge {
    async makeHttpRequest(url: string, method: string, options: HttpRequestOptions): Promise<string> {
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
        } catch (error: unknown) {
            log.error(`[${requestId}] HTTP request failed:`, error);

            // Enhanced logging for common network errors
            const errorMessage = error instanceof Error ? error.message : '';
            if (errorMessage && (
                errorMessage.includes('ECONNRESET') ||
                errorMessage.includes('ETIMEDOUT') ||
                errorMessage.includes('ECONNREFUSED')
            )) {
                log.error(`[${requestId}] Network error detected: ${errorMessage}`);
            }

            throw error;
        }
    }
}

const httpBridge = new HttpBridge();
export { HttpBridge };
export default httpBridge;
