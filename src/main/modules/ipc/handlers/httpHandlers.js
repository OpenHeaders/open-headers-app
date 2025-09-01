const { net } = require('electron');
const querystring = require('querystring');
const { createLogger } = require('../../../../utils/mainLogger');
const networkService = require('../../../../services/network/NetworkService');
const timeManager = require('../../../../services/core/TimeManager');

const log = createLogger('HttpHandlers');

class HttpHandlers {
    constructor() {
        // Bind methods to ensure context is preserved
        this.handleMakeHttpRequest = this.handleMakeHttpRequest.bind(this);
        this.processFormData = this.processFormData.bind(this);
    }

    async handleMakeHttpRequest(_, url, method, options = {}) {
        // Adapt request behavior based on current network conditions
        const networkState = networkService ? networkService.getState() : { isOnline: true };
        log.debug('handleMakeHttpRequest starting with network state:', {
            isOnline: networkState.isOnline,
            quality: networkState.networkQuality,
            requestUrl: url
        });

        // Disable HTTP-level retries by default since circuit breaker handles retry logic
        // Only enable retries if explicitly requested (which should be rare)
        const MAX_RETRIES = options.enableRetries ? (networkState.networkQuality === 'poor' ? 3 : 2) : 0;
        const RETRY_DELAY = networkState.networkQuality === 'poor' ? 1000 : 500;
        
        if (MAX_RETRIES === 0) {
            log.debug(`HTTP retries disabled for request to ${url} (handled by circuit breaker)`);
        } else {
            log.info(`HTTP retries explicitly enabled for request to ${url} (max: ${MAX_RETRIES})`);
        }

        // Store reference to this for use in nested functions
        const self = this;

        // Exponential backoff with jitter to avoid thundering herd
        const performRequest = async (retryCount = 0) => {
            return new Promise((resolve, reject) => {
                try {
                    const parsedUrl = new URL(url);

                    if (options.queryParams) {
                        Object.entries(options.queryParams).forEach(([key, value]) => {
                            if (value !== undefined && value !== null) {
                                parsedUrl.searchParams.append(key, value);
                            }
                        });
                    }

                    // Generate unique request ID for tracking across retries
                    const requestId = (options.connectionOptions && options.connectionOptions.requestId) ||
                        (timeManager.now().toString(36) + Math.random().toString(36).slice(2, 7));

                    const request = net.request({
                        method: method || 'GET',
                        url: parsedUrl.toString(),
                        redirect: 'follow'
                    });

                    // Dynamic timeout adjustment based on network conditions
                    let timeoutMs = options.connectionOptions?.timeout || 15000;
                    if (networkState.networkQuality === 'poor') {
                        timeoutMs = Math.min(timeoutMs * 2, 60000);
                    }

                    let timeoutId = null;

                    timeoutId = setTimeout(() => {
                        request.abort();
                        log.error(`[${requestId}] Request timed out after ${timeoutMs}ms (network: ${networkState.networkQuality})`);

                        // Retry with exponential backoff if conditions allow
                        if (retryCount < MAX_RETRIES && networkState.isOnline) {
                            const delay = Math.min(
                                RETRY_DELAY * Math.pow(2, retryCount) + Math.random() * 1000,
                                10000
                            );

                            log.info(`[${requestId}] Retrying due to timeout in ${Math.round(delay)}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

                            setTimeout(() => {
                                performRequest(retryCount + 1)
                                    .then(resolve)
                                    .catch(reject);
                            }, delay);
                        } else {
                            reject(new Error(`Request timed out after ${timeoutMs}ms`));
                        }
                    }, timeoutMs);

                    if (options.headers) {
                        Object.entries(options.headers).forEach(([key, value]) => {
                            request.setHeader(key, value);
                        });
                    }

                    request.setHeader('User-Agent', `OpenHeaders/${require('electron').app.getVersion()}`);

                    log.info(`[${requestId}] Making HTTP ${method} request to ${parsedUrl.href} (attempt ${retryCount + 1}/${MAX_RETRIES + 1}, network: ${networkState.networkQuality})`);

                    let responseData = '';
                    let statusCode = 0;

                    request.on('response', (response) => {
                        if (timeoutId) {
                            clearTimeout(timeoutId);
                            timeoutId = null;
                        }

                        statusCode = response.statusCode;
                        const responseHeaders = response.headers;

                        response.on('data', (chunk) => {
                            responseData += chunk.toString();
                        });

                        response.on('end', () => {
                            log.info(`[${requestId}] HTTP response received: ${statusCode}`);

                            // Retry transient server errors with backoff
                            if (statusCode >= 500 && retryCount < MAX_RETRIES) {
                                log.info(`[${requestId}] Server error ${statusCode} received, will retry`);

                                const delay = Math.min(
                                    RETRY_DELAY * Math.pow(2, retryCount) + Math.random() * 1000,
                                    10000
                                );

                                log.info(`[${requestId}] Retrying in ${Math.round(delay)}ms`);

                                setTimeout(() => {
                                    performRequest(retryCount + 1)
                                        .then(resolve)
                                        .catch(reject);
                                }, delay);
                            } else {
                                // Include current network state in response for client context
                                const freshNetworkState = networkService ? networkService.getState() : networkState;
                                log.debug('HTTP request succeeded, network state for response:', {
                                    isOnline: freshNetworkState.isOnline,
                                    quality: freshNetworkState.networkQuality,
                                    wasOnlineAtStart: networkState.isOnline
                                });
                                const formattedResponse = {
                                    statusCode: statusCode,
                                    headers: responseHeaders,
                                    body: responseData,
                                    networkContext: freshNetworkState
                                };

                                resolve(JSON.stringify(formattedResponse));
                            }
                        });
                    });

                    // Handle errors
                    request.on('error', (error) => {
                        // Clear timeout on error
                        if (timeoutId) {
                            clearTimeout(timeoutId);
                            timeoutId = null;
                        }

                        log.error(`[${requestId}] HTTP request error (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error);

                        // Improved error detection
                        const isRetryableError =
                            error.code === 'ECONNRESET' ||
                            error.code === 'ETIMEDOUT' ||
                            error.code === 'ECONNREFUSED' ||
                            error.code === 'ENOTFOUND' ||
                            error.code === 'ECONNABORTED' ||
                            error.code === 'ENETUNREACH' ||
                            error.code === 'EHOSTUNREACH' ||
                            (error.message && (
                                error.message.includes('net::ERR_CONNECTION_RESET') ||
                                error.message.includes('net::ERR_CONNECTION_TIMED_OUT') ||
                                error.message.includes('net::ERR_CONNECTION_REFUSED') ||
                                error.message.includes('net::ERR_NAME_NOT_RESOLVED') ||
                                error.message.includes('net::ERR_NETWORK_CHANGED') ||
                                error.message.includes('net::ERR_CONNECTION_ABORTED') ||
                                error.message.includes('net::ERR_EMPTY_RESPONSE')
                            ));

                        const isCertificateError =
                            (error.message && error.message.includes('net::ERR_CERT_'));

                        if (isCertificateError) {
                            log.error(`[${requestId}] Certificate error - not retrying`);
                            reject(new Error(`Certificate validation failed: ${error.message}`));
                        }
                        else if (isRetryableError && retryCount < MAX_RETRIES && networkState.isOnline) {
                            const delay = Math.min(
                                RETRY_DELAY * Math.pow(2, retryCount) + Math.random() * 1000,
                                10000
                            );

                            log.info(`[${requestId}] Retrying due to network error in ${Math.round(delay)}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

                            setTimeout(() => {
                                performRequest(retryCount + 1)
                                    .then(resolve)
                                    .catch(reject);
                            }, delay);
                        } else {
                            // Max retries reached or non-retryable error
                            log.error(`[${requestId}] Error not retryable or max retries reached`);
                            reject(error);
                        }
                    });

                    // Process request body for methods that support it
                    if (['POST', 'PUT', 'PATCH'].includes(method) && options.body) {
                        let requestBody = options.body;

                        // Transform body based on content type
                        if (options.contentType === 'application/x-www-form-urlencoded') {
                            requestBody = self.processFormData(options.body, requestId);
                            request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
                        }
                        else if (options.contentType === 'application/json') {
                            if (typeof options.body !== 'string') {
                                requestBody = JSON.stringify(options.body);
                            }
                            request.setHeader('Content-Type', 'application/json');
                        }
                        else if (options.contentType) {
                            request.setHeader('Content-Type', options.contentType);
                        }

                        if (typeof requestBody === 'string') {
                            requestBody = Buffer.from(requestBody);
                        }

                        request.write(requestBody);
                    }

                    request.end();

                } catch (error) {
                    log.error('Error preparing HTTP request:', error);
                    reject(error);
                }
            });
        };

        return performRequest();
    }

    processFormData(body, requestId) {
        let formData = {};

        if (typeof body === 'string') {
            // Parse various form data string formats
            if (body.includes('=') && body.includes('&')) {
                return body;
            }
            else if (body.includes('=') && body.includes('\n')) {
                return body.split('\n')
                    .filter(line => line.trim() !== '' && line.includes('='))
                    .join('&');
            }
            else if (body.includes(':')) {
                const lines = body.split('\n');
                lines.forEach(line => {
                    line = line.trim();
                    if (line === '') return;

                    if (line.includes(':"')) {
                        const colonPos = line.indexOf(':');
                        const key = line.substring(0, colonPos).trim();
                        formData[key] = line.substring(colonPos + 2, line.lastIndexOf('"'));
                    }
                    else if (line.includes(':')) {
                        const parts = line.split(':');
                        if (parts.length >= 2) {
                            const key = parts[0].trim();
                            formData[key] = parts.slice(1).join(':').trim();
                        }
                    }
                });

                const result = querystring.stringify(formData);
                log.info(`[${requestId}] Form data parsed with ${Object.keys(formData).length} fields`);
                return result;
            }
        }
        else if (typeof body === 'object' && body !== null) {
            return querystring.stringify(body);
        }

        return body;
    }
}

module.exports = new HttpHandlers();