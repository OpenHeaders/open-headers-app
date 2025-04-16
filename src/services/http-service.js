// http-service.js - Service for HTTP request sources
const http = require('http');
const https = require('https');
const appConfig = require('../config/app-config');
const querystring = require('querystring');
const nodeUtils = require('../utils/node-utils');

/**
 * Service for handling HTTP request based sources
 */
class HttpService {
    constructor() {
        // Map of HTTP requests to their associated source IDs and options
        // `${method}:${url}` -> { sourceIds[], refreshTimers{} }
        this.sourcesByHttp = new Map();

        // Map of refresh timers by source ID
        this.refreshTimers = new Map();
    }

    /**
     * Ensures a URL has a protocol prefix
     * @param {string} inputUrl - The input URL
     * @returns {string} - URL with protocol
     */
    _ensureProtocol(inputUrl) {
        if (!inputUrl) return '';

        // Check if URL already has a protocol
        if (inputUrl.match(/^https?:\/\//i)) {
            return inputUrl;
        }

        // Default to HTTPS
        return `https://${inputUrl}`;
    }

    /**
     * Watch an HTTP request
     * @param {string} requestUrl - URL for the request
     * @param {string} method - HTTP method
     * @param {number} sourceId - ID of the source
     * @param {Object} options - Additional request options (headers, queryParams, body)
     * @param {Object} refreshOptions - Refresh options
     * @param {Object} jsonFilter - JSON filter options
     * @returns {Promise<{content: string, originalJson: string}>} Initial HTTP response body and original JSON
     */
    async watchHttp(requestUrl, method, sourceId, options = {}, refreshOptions = {}, jsonFilter = { enabled: false, path: '' }) {
        try {
            console.log(`Setting up HTTP watch for source ${sourceId}, URL: ${requestUrl}, method: ${method}`);

            // Ensure URL has protocol
            const normalizedUrl = this._ensureProtocol(requestUrl);
            const key = `${method}:${normalizedUrl}`;

            // Setup source tracking
            if (!this.sourcesByHttp.has(key)) {
                this.sourcesByHttp.set(key, [{
                    sourceId,
                    options,
                    refreshOptions,
                    jsonFilter
                }]);
                console.log(`Created new HTTP watch entry for ${key}`);
            } else {
                const sourceEntries = this.sourcesByHttp.get(key);
                const existingIndex = sourceEntries.findIndex(entry => entry.sourceId === sourceId);

                if (existingIndex >= 0) {
                    // Update existing entry with new options
                    const existingEntry = sourceEntries[existingIndex];
                    existingEntry.options = options;
                    existingEntry.refreshOptions = refreshOptions;
                    existingEntry.jsonFilter = jsonFilter;
                    console.log(`Updated existing HTTP watch for source ${sourceId}`);
                } else {
                    // Add new entry
                    sourceEntries.push({
                        sourceId,
                        options,
                        refreshOptions,
                        jsonFilter
                    });
                    console.log(`Added source ${sourceId} to existing HTTP watch for ${key}`);
                }
            }

            // Schedule auto-refresh if needed
            this._scheduleRefresh(sourceId, normalizedUrl, method, options, refreshOptions);

            /// Make a request immediately and get the content
            console.log(`Making initial HTTP request for source ${sourceId} to ${normalizedUrl}`);
            const responseJson = await this.makeRequest(normalizedUrl, method, options);
            console.log(`Initial HTTP response for source ${sourceId}:`, responseJson);

            // Parse the response
            let parsedResponse;
            try {
                parsedResponse = JSON.parse(responseJson);
            } catch (err) {
                console.error(`Error parsing HTTP response for source ${sourceId}:`, err);
                // If we can't parse the JSON, use the raw response
                return {
                    content: responseJson,
                    originalJson: responseJson  // Use the same raw response as originalJson
                };
            }

            // Get the body content from the response
            const bodyContent = parsedResponse.body || '';

            // Store the entire original JSON body as originalJson
            // This is the raw JSON string from the response body, not the parsed object
            const originalJson = bodyContent;

            console.log(`Stored original JSON (${originalJson.length} chars)`);

            // If there's a JSON filter, apply it to get the filtered content
            let finalContent = bodyContent;
            if (jsonFilter.enabled && jsonFilter.path && bodyContent) {
                console.log(`Applying JSON filter with path: ${jsonFilter.path}`);
                finalContent = this._applyJsonFilter(bodyContent, jsonFilter);
                console.log(`Filtered content (${finalContent.length} chars): ${finalContent.substring(0, 100)}${finalContent.length > 100 ? '...' : ''}`);
            }

            // Return both the filtered content and the original JSON
            console.log(`Returning content (${finalContent.length} chars) and originalJson (${originalJson.length} chars)`);
            return {
                content: finalContent,
                originalJson: originalJson
            };
        } catch (err) {
            console.error(`Error in watchHttp for source ${sourceId}:`, err);
            return {
                content: `Error: ${err.message}`,
                originalJson: ''
            };
        }
    }

    /**
     * Remove an HTTP request watch
     * @param {number} sourceId - ID of the source
     * @param {string} requestUrl - URL for the request
     * @param {string} method - HTTP method
     */
    removeWatch(sourceId, requestUrl, method) {
        const normalizedUrl = this._ensureProtocol(requestUrl);
        const key = `${method}:${normalizedUrl}`;
        const sourceEntries = this.sourcesByHttp.get(key);
        if (!sourceEntries) return;

        const updatedEntries = sourceEntries.filter(entry => entry.sourceId !== sourceId);

        if (updatedEntries.length === 0) {
            this.sourcesByHttp.delete(key);
        } else {
            this.sourcesByHttp.set(key, updatedEntries);
        }

        // Clear any scheduled refresh
        this._clearRefreshTimer(sourceId);
    }

    /**
     * Set up an HTTP watch without making an initial request
     * @param {string} requestUrl - URL for the request
     * @param {string} method - HTTP method
     * @param {number} sourceId - ID of the source
     * @param {Object} options - Additional request options (headers, queryParams, body)
     * @param {Object} refreshOptions - Refresh options
     * @param {Object} jsonFilter - JSON filter options { enabled, path }
     * @param {Function} onUpdate - Callback for content updates
     */
    setupHttpWatch(requestUrl, method, sourceId, options = {}, refreshOptions = {}, jsonFilter = { enabled: false, path: '' }, onUpdate) {
        try {
            console.log(`Setting up HTTP watch for source ${sourceId}, URL: ${requestUrl}, method: ${method} (without initial request)`);

            // Ensure URL has protocol
            const normalizedUrl = this._ensureProtocol(requestUrl);
            const key = `${method}:${normalizedUrl}`;

            // Add onUpdate callback to refresh options if not already present
            const updatedRefreshOptions = {
                ...refreshOptions
            };

            // Only add onUpdate if it's not already present
            if (typeof updatedRefreshOptions.onUpdate !== 'function') {
                updatedRefreshOptions.onUpdate = onUpdate;
            }

            // Check if timer is expired (this info comes from SourceService)
            const refreshExpired = updatedRefreshOptions.refreshExpired === true;
            if (refreshExpired) {
                console.log(`Setting up HTTP watch for source ${sourceId} with expired refresh timer`);
            }

            // Log refresh options
            if (updatedRefreshOptions.interval > 0 && updatedRefreshOptions.nextRefresh) {
                console.log(`HTTP watch for source ${sourceId} has refresh interval ${updatedRefreshOptions.interval}m, next refresh at ${new Date(updatedRefreshOptions.nextRefresh).toLocaleTimeString()}`);
            }

            // Setup source tracking
            if (!this.sourcesByHttp.has(key)) {
                this.sourcesByHttp.set(key, [{
                    sourceId,
                    options,
                    refreshOptions: updatedRefreshOptions,
                    jsonFilter
                }]);
                console.log(`Created new HTTP watch entry for ${key}`);
            } else {
                const sourceEntries = this.sourcesByHttp.get(key);
                const existingIndex = sourceEntries.findIndex(entry => entry.sourceId === sourceId);

                if (existingIndex >= 0) {
                    // Update existing entry with new options but preserve refresh schedule
                    const existingEntry = sourceEntries[existingIndex];

                    existingEntry.options = options;
                    existingEntry.jsonFilter = jsonFilter;
                    existingEntry.refreshOptions = updatedRefreshOptions;

                    console.log(`Updated existing HTTP watch for source ${sourceId}`);
                } else {
                    // Add new entry
                    sourceEntries.push({
                        sourceId,
                        options,
                        refreshOptions: updatedRefreshOptions,
                        jsonFilter
                    });
                    console.log(`Added source ${sourceId} to existing HTTP watch for ${key}`);
                }
            }

            // Schedule auto-refresh if needed
            if (updatedRefreshOptions && updatedRefreshOptions.interval > 0) {
                this._scheduleRefresh(sourceId, normalizedUrl, method, options, updatedRefreshOptions);
            }
        } catch (err) {
            console.error(`Error in setupHttpWatch for source ${sourceId}:`, err);
        }
    }

    /**
     * Update refresh options for a source
     * @param {number} sourceId - ID of the source
     * @param {string} requestUrl - URL for the request
     * @param {string} method - HTTP method
     * @param {Object} options - Request options
     * @param {Object} refreshOptions - New refresh options
     */
    updateRefreshOptions(sourceId, requestUrl, method, options, refreshOptions) {
        const normalizedUrl = this._ensureProtocol(requestUrl);
        const key = `${method}:${normalizedUrl}`;
        const sourceEntries = this.sourcesByHttp.get(key);

        if (!sourceEntries) return;

        const entry = sourceEntries.find(e => e.sourceId === sourceId);
        if (entry) {
            entry.refreshOptions = refreshOptions;
            entry.options = options; // Update options too

            // Re-schedule refresh
            this._clearRefreshTimer(sourceId);
            this._scheduleRefresh(sourceId, normalizedUrl, method, options, refreshOptions);
        }
    }

    /**
     * Apply JSON filter to a response body
     * @private
     * @param {string} body - Response body
     * @param {Object} jsonFilter - Filter configuration { enabled, path }
     * @returns {string} - Filtered or original body
     */
    _applyJsonFilter(body, jsonFilter) {
        // Skip if filter is not enabled or no path specified
        if (!jsonFilter || !jsonFilter.enabled || !jsonFilter.path) {
            return body;
        }

        try {
            // Parse the body as JSON
            let jsonObj;
            try {
                jsonObj = JSON.parse(body);
            } catch (e) {
                console.error('Cannot apply JSON filter: response is not valid JSON');
                return body; // Return original if not JSON
            }

            // Extract the path components (remove 'root.' prefix if present)
            const path = jsonFilter.path.startsWith('root.')
                ? jsonFilter.path.substring(5)
                : jsonFilter.path;

            // Empty path means return the whole object
            if (!path) {
                return body;
            }

            // Navigate through the path components
            const parts = path.split('.');
            let current = jsonObj;

            for (const part of parts) {
                // Check for array index notation: property[index]
                const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);

                if (arrayMatch) {
                    const [_, propName, index] = arrayMatch;

                    // Check if property exists
                    if (current[propName] === undefined) {
                        console.log(`Property '${propName}' not found in JSON`);
                        return `Path '${jsonFilter.path}' not found (property '${propName}' is missing)`;
                    }

                    // Check if property is an array
                    if (!Array.isArray(current[propName])) {
                        console.log(`Property '${propName}' is not an array`);
                        return `Path '${jsonFilter.path}' is invalid ('${propName}' is not an array)`;
                    }

                    // Check if index is in bounds
                    const idx = parseInt(index, 10);
                    if (idx >= current[propName].length) {
                        console.log(`Index ${idx} out of bounds for array '${propName}'`);
                        return `Path '${jsonFilter.path}' is invalid (index ${idx} out of bounds)`;
                    }

                    current = current[propName][idx];
                } else {
                    // Regular property access
                    if (current[part] === undefined) {
                        console.log(`Property '${part}' not found in JSON`);
                        return `Path '${jsonFilter.path}' not found (property '${part}' is missing)`;
                    }
                    current = current[part];
                }
            }

            // Convert the result to string based on type
            if (typeof current === 'object' && current !== null) {
                return JSON.stringify(current, null, 2);
            } else {
                return String(current);
            }
        } catch (error) {
            console.error('Error applying JSON filter:', error);
            return `Error applying filter: ${error.message}`;
        }
    }

    /**
     * Schedule a refresh for a source
     * @private
     * @param {number} sourceId - ID of the source
     * @param {string} requestUrl - URL for the request
     * @param {string} method - HTTP method
     * @param {Object} options - Request options
     * @param {Object} refreshOptions - Refresh options
     */
    _scheduleRefresh(sourceId, requestUrl, method, options, refreshOptions) {
        // Clear any existing timer first
        this._clearRefreshTimer(sourceId);

        // Only schedule if interval is > 0
        if (!refreshOptions || !refreshOptions.interval || refreshOptions.interval <= 0) {
            console.log(`No refresh scheduled for source ${sourceId}, interval not set or is 0`);
            return;
        }

        // Get the current time
        const now = Date.now();

        // Determine if we should use the existing nextRefresh time or calculate a new one
        let nextRefreshTime;
        let initialDelay;
        let needsImmediateRefresh = false;

        // Check if refreshOptions has the refreshExpired flag from watchSource
        const refreshExpired = refreshOptions.refreshExpired === true;

        // Use existing nextRefresh time if it's in the future
        if (refreshOptions.nextRefresh && refreshOptions.nextRefresh > now) {
            nextRefreshTime = refreshOptions.nextRefresh;
            initialDelay = nextRefreshTime - now;
            console.log(`Using existing refresh schedule for source ${sourceId}, next refresh at ${new Date(nextRefreshTime).toLocaleTimeString()}`);
            console.log(`Initial delay until refresh: ${Math.round(initialDelay/1000)}s`);
        } else if (refreshExpired || (refreshOptions.nextRefresh && refreshOptions.nextRefresh <= now)) {
            // The refresh time has already passed, so schedule an immediate refresh
            console.log(`Refresh time has passed for source ${sourceId}, scheduling immediate refresh`);
            nextRefreshTime = now + 1000; // Refresh in 1 second
            initialDelay = 1000;
            needsImmediateRefresh = true;
        } else {
            // Calculate a new refresh time starting from now
            const intervalMs = refreshOptions.interval * 60 * 1000; // Convert minutes to ms
            nextRefreshTime = now + intervalMs;
            initialDelay = intervalMs;
            console.log(`Created new schedule for source ${sourceId}, next refresh at ${new Date(nextRefreshTime).toLocaleTimeString()}`);
        }

        // Store the timer reference and next refresh time before creating the timer
        // This ensures the timer info is available immediately
        this.refreshTimers.set(sourceId, {
            nextRefresh: nextRefreshTime
        });

        // Create a timer for auto-refresh with the calculated delay
        const timer = setTimeout(async () => {
            console.log(`Auto-refreshing source ${sourceId}`);
            try {
                // Get the callback from the refresh options
                const onUpdate = refreshOptions.onUpdate;
                if (typeof onUpdate === 'function') {
                    // Perform the refresh
                    await this.refreshSource(requestUrl, method, onUpdate);

                    // After refreshing, setup the next regular interval
                    console.log(`Setting up regular interval refresh for source ${sourceId}`);
                    const regularTimer = setInterval(async () => {
                        console.log(`Regular interval refresh for source ${sourceId}`);
                        try {
                            if (typeof onUpdate === 'function') {
                                await this.refreshSource(requestUrl, method, onUpdate);
                            }
                        } catch (error) {
                            console.error(`Error during auto-refresh for source ${sourceId}:`, error);
                        }
                    }, refreshOptions.interval * 60 * 1000);

                    // Store the new timer
                    this.refreshTimers.set(sourceId, {
                        timer: regularTimer,
                        nextRefresh: Date.now() + (refreshOptions.interval * 60 * 1000)
                    });
                }
            } catch (error) {
                console.error(`Error during auto-refresh for source ${sourceId}:`, error);
            }
        }, initialDelay);

        // Update the timer reference in the refresh timers map
        const timerInfo = this.refreshTimers.get(sourceId);
        if (timerInfo) {
            timerInfo.timer = timer;
        } else {
            this.refreshTimers.set(sourceId, {
                timer,
                nextRefresh: nextRefreshTime
            });
        }

        // If we need an immediate refresh (because the scheduled time has passed),
        // log a clearer message
        if (needsImmediateRefresh) {
            console.log(`Source ${sourceId} will refresh in 1 second due to expired schedule`);
        }
    }

    /**
     * Clear a refresh timer for a source
     * @private
     * @param {number} sourceId - ID of the source
     */
    _clearRefreshTimer(sourceId) {
        const timerInfo = this.refreshTimers.get(sourceId);
        if (timerInfo && timerInfo.timer) {
            console.log(`Clearing refresh timer for source ${sourceId}`);
            clearInterval(timerInfo.timer);
            this.refreshTimers.delete(sourceId);
        }
    }

    /**
     * Process TOTP variables in request data
     * @private
     * @param {Object} data - The data to process
     * @param {Object} variables - The variables for TOTP generation
     * @returns {Object} - The processed data
     */
    _processTOTPVariables(data, variables = {}) {
        if (!data) return data;

        // Helper function to process a string
        const processString = (str) => {
            if (typeof str !== 'string') return str;

            // Use the common processTemplate function if available
            if (typeof processTemplate === 'function') {
                return processTemplate(str, variables);
            }

            // Fallback implementation if processTemplate is not available
            return str.replace(/_TOTP_CODE(?:\(([^)]+)\))?/g, (match, params) => {
                // Implementation details would go here, similar to processTemplate
                // For backend implementation, we'd need a TOTP generator
                return 'TOTP_PLACEHOLDER';
            });
        };

        // Process different types of data
        if (typeof data === 'string') {
            return processString(data);
        } else if (Array.isArray(data)) {
            return data.map(item => this._processTOTPVariables(item, variables));
        } else if (typeof data === 'object' && data !== null) {
            const result = {};
            for (const key in data) {
                result[key] = this._processTOTPVariables(data[key], variables);
            }
            return result;
        }

        return data;
    }

    /**
     * Make an HTTP request with TOTP support and retry logic
     * @param {string} requestUrl - URL for the request
     * @param {string} method - HTTP method
     * @param {Object} options - Additional request options
     * @param {number} retryCount - Number of retry attempts (default: 1)
     * @returns {Promise<string>} HTTP response
     */
    async makeRequest(requestUrl, method, options = {}, retryCount = 1) {
        try {
            return await new Promise((resolve, reject) => {
                try {
                    // Extract TOTP secret
                    const totpSecret = options.totpSecret || '';

                    // Process TOTP variables if needed
                    let processedUrl = requestUrl;
                    let processedOptions = { ...options };

                    // Only process if there's a TOTP secret and the request contains TOTP placeholders
                    if (totpSecret) {
                        // Check if any part of the request contains TOTP placeholders
                        const containsTOTP =
                            (typeof requestUrl === 'string' && requestUrl.includes('_TOTP_CODE')) ||
                            JSON.stringify(options).includes('_TOTP_CODE');

                        if (containsTOTP) {
                            console.log('Request contains TOTP placeholders, processing...');

                            // Process URL
                            if (typeof requestUrl === 'string' && requestUrl.includes('_TOTP_CODE')) {
                                processedUrl = nodeUtils.processTemplate(requestUrl, { TOTP_SECRET: totpSecret });
                                console.log('Processed URL with TOTP substitution');
                            }

                            // Process options (headers, body, queryParams)
                            processedOptions = nodeUtils.processTOTPVariables({ ...options }, { TOTP_SECRET: totpSecret });

                            console.log('TOTP placeholders processed for request');
                        }
                    }

                    // Continue with the original makeRequest logic using processed values

                    // Ensure URL has protocol
                    const normalizedUrl = this._ensureProtocol(processedUrl);

                    // Parse the URL
                    const parsedUrl = new URL(normalizedUrl);

                    // Apply query parameters if provided
                    if (processedOptions.queryParams && typeof processedOptions.queryParams === 'object') {
                        Object.entries(processedOptions.queryParams).forEach(([key, value]) => {
                            if (value !== undefined && value !== null) {
                                parsedUrl.searchParams.append(key, value);
                            }
                        });
                    }

                    // Prepare request headers
                    const headers = {
                        'User-Agent': appConfig.httpDefaults.userAgent
                    };

                    // Add custom headers if provided
                    if (processedOptions.headers && typeof processedOptions.headers === 'object') {
                        Object.entries(processedOptions.headers).forEach(([key, value]) => {
                            if (value !== undefined && value !== null) {
                                headers[key] = value;
                            }
                        });
                    }

                    // Prepare request body if applicable
                    let requestBody = null;
                    if (['POST', 'PUT', 'PATCH'].includes(method) && processedOptions.body) {
                        if (processedOptions.contentType === 'application/json') {
                            requestBody = JSON.stringify(processedOptions.body);
                            headers['Content-Type'] = 'application/json';
                        } else if (processedOptions.contentType === 'application/x-www-form-urlencoded') {
                            requestBody = querystring.stringify(processedOptions.body);
                            headers['Content-Type'] = 'application/x-www-form-urlencoded';
                        }

                        // Add content length header
                        if (requestBody) {
                            headers['Content-Length'] = Buffer.byteLength(requestBody);
                        }
                    }

                    const requestOptions = {
                        hostname: parsedUrl.hostname,
                        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                        path: parsedUrl.pathname + parsedUrl.search,
                        method: method || 'GET',
                        headers: headers,
                        timeout: appConfig.httpDefaults.timeout
                    };

                    console.log('Making HTTP request to:', parsedUrl.toString());
                    console.log('Request options:', JSON.stringify(requestOptions));
                    if (requestBody) {
                        console.log('Request body:', requestBody);
                    }

                    const requester = parsedUrl.protocol === 'https:' ? https : http;

                    const req = requester.request(requestOptions, (res) => {
                        let data = '';

                        res.on('data', (chunk) => {
                            data += chunk;
                        });

                        res.on('end', () => {
                            // Create response object with metadata and raw body content
                            const responseObj = {
                                statusCode: res.statusCode,
                                body: data
                            };

                            // For UI display purposes, we return the structured response
                            console.log(`Response received with status: ${res.statusCode}`);
                            console.log(`Response body preview: ${data.substring(0, 100)}${data.length > 100 ? '...' : ''}`);

                            if (res.statusCode >= 200 && res.statusCode < 300) {
                                resolve(JSON.stringify(responseObj, null, 2));
                            } else {
                                // For error status codes, still return a structured response
                                responseObj.error = `HTTP Error: ${res.statusCode}`;
                                resolve(JSON.stringify(responseObj, null, 2));
                            }
                        });
                    });

                    req.on('error', (error) => {
                        console.error('HTTP request error:', error);
                        reject(error);
                    });

                    req.on('timeout', () => {
                        console.error('HTTP request timeout');
                        req.destroy();
                        reject(new Error(`Request timeout after ${appConfig.httpDefaults.timeout}ms`));
                    });

                    // Send the body if there is one
                    if (requestBody) {
                        req.write(requestBody);
                    }

                    req.end();
                } catch (error) {
                    console.error('Error in makeRequest:', error);
                    reject(error);
                }
            });
        } catch (error) {
            // Implement retry logic for ECONNRESET and other connection errors
            if ((error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') && retryCount > 0) {
                console.log(`Connection error: ${error.code}, retrying (${retryCount} attempts left)...`);

                // Wait a short time before retrying (500ms)
                await new Promise(resolve => setTimeout(resolve, 500));

                // Retry the request with one less retry attempt
                console.log('Retrying request...');
                return this.makeRequest(requestUrl, method, options, retryCount - 1);
            }

            // If no more retries or different error, rethrow
            throw error;
        }
    }

    /**
     * Refresh a specific HTTP source
     * @param {string} requestUrl - URL for the request
     * @param {string} method - HTTP method
     * @param {Function} onUpdate - Callback for content updates
     */
    async refreshSource(requestUrl, method, onUpdate) {
        const normalizedUrl = this._ensureProtocol(requestUrl);
        const key = `${method}:${normalizedUrl}`;
        const sourceEntries = this.sourcesByHttp.get(key);
        if (!sourceEntries) return;

        for (const { sourceId, options, refreshOptions, jsonFilter } of sourceEntries) {
            try {
                console.log(`Refreshing HTTP source ${sourceId}`);
                const responseJson = await this.makeRequest(normalizedUrl, method, options);
                console.log(`Refreshed HTTP source ${sourceId}, response received`);

                // Parse the response
                let parsedResponse;
                try {
                    parsedResponse = JSON.parse(responseJson);
                } catch (err) {
                    console.error('Error parsing HTTP response for refresh:', err);
                    // If we can't parse the JSON, use the raw response
                    onUpdate(sourceId, responseJson, responseJson);
                    continue;
                }

                // Get the body content from the response
                const bodyContent = parsedResponse.body || '';

                // Store the entire original body as originalJson
                const originalJson = bodyContent;

                console.log(`Stored original JSON (${originalJson.length} chars) during refresh`);

                // If there's a JSON filter, apply it to get the filtered content
                let finalContent = bodyContent;
                if (jsonFilter.enabled && jsonFilter.path && bodyContent) {
                    console.log(`Applying JSON filter with path: ${jsonFilter.path}`);
                    finalContent = this._applyJsonFilter(bodyContent, jsonFilter);
                    console.log(`Filtered content (${finalContent.length} chars): ${finalContent.substring(0, 100)}${finalContent.length > 100 ? '...' : ''}`);
                }

                // Call the update callback with the filtered content and original JSON
                console.log(`Calling update callback with content (${finalContent.length} chars) and originalJson (${originalJson.length} chars)`);
                onUpdate(sourceId, finalContent, originalJson);

                // Update next refresh time in timer info
                if (refreshOptions && refreshOptions.interval > 0) {
                    const timerInfo = this.refreshTimers.get(sourceId);
                    if (timerInfo) {
                        // Reset the nextRefresh time to the current time plus the interval
                        const now = Date.now();
                        timerInfo.nextRefresh = now + (refreshOptions.interval * 60 * 1000);
                        console.log(`Updated next refresh time for source ${sourceId} to ${new Date(timerInfo.nextRefresh).toLocaleTimeString()}`);
                    }
                }
            } catch (err) {
                console.error('Error refreshing HTTP request:', err);
                const errorMsg = `Error: ${err.message}`;
                onUpdate(sourceId, errorMsg, '');
            }
        }
    }

    /**
     * Get information about scheduled refreshes
     * @returns {Object} Map of sourceId to next refresh time
     */
    getRefreshInfo() {
        const refreshInfo = {};
        for (const [sourceId, timerInfo] of this.refreshTimers.entries()) {
            refreshInfo[sourceId] = {
                nextRefresh: timerInfo.nextRefresh,
                timeRemaining: timerInfo.nextRefresh - Date.now()
            };
        }
        return refreshInfo;
    }

    /**
     * Dispose of all HTTP watches
     */
    dispose() {
        // Clear all refresh timers
        for (const [sourceId, timerInfo] of this.refreshTimers.entries()) {
            if (timerInfo && timerInfo.timer) {
                clearInterval(timerInfo.timer);
            }
        }
        this.refreshTimers.clear();
        this.sourcesByHttp.clear();
        console.log('Disposed all HTTP watches and refresh timers');
    }

}

module.exports = HttpService;