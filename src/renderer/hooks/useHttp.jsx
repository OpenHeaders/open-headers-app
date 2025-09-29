// In useHttp.jsx, update the imports and hook usage:

import { useCallback } from 'react';
import { useTotpState, useEnvironments } from '../contexts';
const { createLogger } = require('../utils/error-handling/logger');
const log = createLogger('useHttp');

/**
 * HTTP hook with environment variable support and error handling
 */
export function useHttp() {
    // Use TOTP context
    const { recordTotpUsage, getCooldownSeconds } = useTotpState();
    // Use Environment context - GET environmentsReady and waitForEnvironments
    const {
        resolveTemplate,
        resolveObjectTemplate,
        environmentsReady,
        waitForEnvironments
    } = useEnvironments();

    /**
     * Parse JSON safely with better error messages
     */
    const parseJSON = useCallback((text) => {
        try {
            return JSON.parse(text);
        } catch (error) {
            log.error('Error parsing JSON:', error);
            log.debug('Failed JSON content:', text?.substring(0, 200));
            return null;
        }
    }, []);

    /**
     * Apply JSON filter to a response body with improved error handling
     */
    const applyJsonFilter = useCallback((body, jsonFilter) => {
        // Always normalize the filter object to ensure consistent behavior
        const normalizedFilter = {
            enabled: jsonFilter?.enabled === true,
            path: jsonFilter?.enabled === true ? (jsonFilter?.path || '') : ''
        };

        log.debug('Applying JSON filter:', JSON.stringify(normalizedFilter));

        // Immediately return the original body if filter is not properly configured
        if (!normalizedFilter.enabled || !normalizedFilter.path) {
            return body;
        }

        try {
            // Ensure we're working with a parsed object
            let jsonObj;
            if (typeof body === 'string') {
                jsonObj = parseJSON(body);
                if (!jsonObj) {
                    return body;
                }
            } else {
                jsonObj = body;
            }

            // Check if this is an error response
            if (jsonObj.error) {
                // Create a more user-friendly message for errors
                let errorMessage = `Error: ${jsonObj.error}`;
                if (jsonObj['error_description']) {
                    errorMessage += ` - ${jsonObj['error_description']}`;
                } else if (jsonObj.message) {
                    errorMessage += ` - ${jsonObj.message}`;
                }
                return errorMessage;
            }

            // Extract path (remove 'root.' prefix if present)
            const path = normalizedFilter.path.startsWith('root.')
                ? normalizedFilter.path.substring(5)
                : normalizedFilter.path;

            if (!path) {
                return body;
            }

            // Navigate through path parts
            const parts = path.split('.');
            let current = jsonObj;

            for (const part of parts) {
                // Check for array notation: property[index]
                const arrayMatch = part.match(/^(\w+)\[(\d+)]$/);

                if (arrayMatch) {
                    const [_, propName, index] = arrayMatch;

                    if (current[propName] === undefined) {
                        return `The field "${path}" was not found in the response.`;
                    }

                    if (!Array.isArray(current[propName])) {
                        return `The field "${propName}" exists but is not an array.`;
                    }

                    const idx = parseInt(index, 10);
                    if (idx >= current[propName].length) {
                        return `The array index [${idx}] is out of bounds.`;
                    }

                    current = current[propName][idx];
                } else {
                    if (current[part] === undefined) {
                        return `The field "${part}" was not found in the response.`;
                    }
                    current = current[part];
                }
            }

            // Format result based on type
            if (typeof current === 'object' && current !== null) {
                return JSON.stringify(current, null, 2);
            } else {
                return String(current);
            }
        } catch (error) {
            log.error('Error applying JSON filter:', error);
            return `Could not filter response: ${error.message}`;
        }
    }, [parseJSON]);

    /**
     * Substitute variables in text
     */
    const substituteVariables = useCallback((text, totpCode = null) => {
        if (!text) return text;

        let result = text;

        // First replace environment variables {{VAR_NAME}}
        // The resolveTemplate function will handle checking if environments are ready
        result = resolveTemplate(result);

        // Then replace TOTP code if available
        if (totpCode) {
            result = result.replace(/\[\[TOTP_CODE]]/g, totpCode);
        }

        return result;
    }, [resolveTemplate]);

    /**
     * Convert colon-separated body format to URL-encoded format
     */
    const convertBodyToUrlEncoded = useCallback((bodyContent) => {
        const formData = {};
        const lines = bodyContent.split('\n');

        lines.forEach(line => {
            line = line.trim();
            if (line === '') return;

            const colonIndex = line.indexOf(':');
            if (colonIndex > -1) {
                const key = line.substring(0, colonIndex).trim();
                const value = line.substring(colonIndex + 1).trim();
                if (key) {
                    formData[key] = value;
                }
            }
        });

        // Convert to URL-encoded format
        return Object.entries(formData)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
            .join('&');
    }, []);

    /**
     * Make HTTP request with improved error handling and circuit breaker
     */
    const request = useCallback(async (
        sourceId,
        url,
        method = 'GET',
        requestOptions = {},
        jsonFilter = { enabled: false, path: '' },
        progressCallback = null
    ) => {
        // Normalize sourceId to string
        sourceId = String(sourceId);

        // Always wait for environments to be ready before making requests
        // This prevents the race condition where environments aren't loaded yet
        if (!environmentsReady) {
            log.info('[useHttp] Waiting for environments to be ready...');
            const ready = await waitForEnvironments(10000); // 10 second timeout
            if (!ready) {
                log.error('[useHttp] Environments failed to load after timeout');
                throw new Error('Environments failed to load. Please check your environment configuration.');
            }
            log.info('[useHttp] Environments are now ready');
        }

        // Circuit breaker is now handled in RefreshManager with AdaptiveCircuitBreaker
        // We don't use it here to avoid double circuit breaker logic
        const executeRequest = async () => {
            const requestStartTime = Date.now();
            
            // Call initial progress callback immediately to show "Connecting..."
            if (progressCallback) {
                log.debug(`[useHttp] INITIAL progress callback: (0, 0) - Connecting`);
                progressCallback(0, 0); // Special case: 0,0 means "Connecting..."
            }

            // Create a normalized jsonFilter object (we'll substitute variables after TOTP generation)
            const normalizedJsonFilter = {
                enabled: jsonFilter?.enabled === true,
                path: jsonFilter?.enabled === true ? (jsonFilter?.path || '') : ''
            };

            // Format options
            const formattedOptions = {
                ...requestOptions,
                headers: {},
                queryParams: {}
            };

            // Handle TOTP if present
            let totpCode = null;
            if (requestOptions.totpSecret) {
                log.debug(`[useHttp] TOTP secret found for source ${sourceId}, checking cooldown`);
                // Check TOTP cooldown first - but only check actual cooldown, not testing state
                const cooldownSeconds = getCooldownSeconds(sourceId);
                if (cooldownSeconds > 0) {
                    log.debug(`[useHttp] TOTP cooldown active for ${sourceId}: ${cooldownSeconds} seconds`);
                    const error = new Error(`TOTP cooldown active. Please wait ${cooldownSeconds} seconds before making another request.`);
                    error.isCooldownError = true;
                    error.cooldownSeconds = cooldownSeconds;
                    throw error;
                }
                
                // Substitute variables in TOTP secret
                let substitutedSecret = substituteVariables(requestOptions.totpSecret, null);
                const normalizedSecret = substitutedSecret.replace(/\s/g, '').replace(/=/g, '');
                totpCode = await window.generateTOTP(normalizedSecret, 30, 6, 0);
                log.debug(`[useHttp] TOTP code generated for ${sourceId}: ${totpCode ? totpCode.substring(0, 3) + '***' : 'ERROR'}`);

                if (!totpCode || totpCode === 'ERROR') {
                    throw new Error('Failed to generate TOTP code');
                }

                // Record TOTP usage
                recordTotpUsage(sourceId, requestOptions.totpSecret, totpCode);
            }

            // Substitute variables in JSON filter path after TOTP generation
            if (normalizedJsonFilter.enabled && normalizedJsonFilter.path) {
                normalizedJsonFilter.path = substituteVariables(normalizedJsonFilter.path, totpCode);
                log.debug('JSON filter path after variable substitution:', normalizedJsonFilter.path);
            }

            // Perform variable substitution in URL (always do this for global variables)
            // Commenting out spammy debug logs
            // log.debug(`[useHttp] Substituting URL: ${url}`);
            let substitutedUrl = substituteVariables(url, totpCode);
            // log.debug(`[useHttp] Substituted URL: ${substitutedUrl}`);

            // Validate the substituted URL
            if (!substitutedUrl || substitutedUrl === 'https://' || substitutedUrl === 'http://') {
                throw new Error(`Invalid URL after variable substitution: "${substitutedUrl}". Please check that all environment variables (like {{API_URL}}) are defined in your active environment.`);
            }

            // Process headers from array format to object
            if (Array.isArray(requestOptions.headers)) {
                requestOptions.headers.forEach(header => {
                    if (header && header.key) {
                        let headerValue = header.value || '';
                        headerValue = substituteVariables(headerValue, totpCode);
                        formattedOptions.headers[header.key] = headerValue;
                    }
                });
            } else if (typeof requestOptions.headers === 'object' && requestOptions.headers !== null) {
                Object.entries(requestOptions.headers).forEach(([key, value]) => {
                    let headerValue = value || '';
                    headerValue = substituteVariables(headerValue, totpCode);
                    formattedOptions.headers[key] = headerValue;
                });
            }

            // Process query params from array format to object
            if (Array.isArray(requestOptions.queryParams)) {
                requestOptions.queryParams.forEach(param => {
                    if (param && param.key) {
                        let paramValue = param.value || '';
                        paramValue = substituteVariables(paramValue, totpCode);
                        formattedOptions.queryParams[param.key] = paramValue;
                    }
                });
            } else if (typeof requestOptions.queryParams === 'object' && requestOptions.queryParams !== null) {
                Object.entries(requestOptions.queryParams).forEach(([key, value]) => {
                    let paramValue = value || '';
                    paramValue = substituteVariables(paramValue, totpCode);
                    formattedOptions.queryParams[key] = paramValue;
                });
            }

            // Process body for variable substitution
            if (requestOptions.body) {
                let bodyContent = requestOptions.body;
                if (typeof bodyContent === 'string') {
                    bodyContent = substituteVariables(bodyContent, totpCode);

                    // Convert colon-separated format to URL-encoded format for form data
                    if (requestOptions.contentType === 'application/x-www-form-urlencoded' && bodyContent.includes(':')) {
                        bodyContent = convertBodyToUrlEncoded(bodyContent);
                    }

                    formattedOptions.body = bodyContent;
                } else if (typeof bodyContent === 'object') {
                    // Resolve environment variables in object bodies (JSON)
                    bodyContent = resolveObjectTemplate(bodyContent);

                    // Then apply local variables and TOTP
                    const bodyStr = JSON.stringify(bodyContent);
                    formattedOptions.body = substituteVariables(bodyStr, totpCode);
                } else {
                    formattedOptions.body = requestOptions.body;
                }
            }

            // Copy other request options
            formattedOptions.contentType = requestOptions.contentType || 'application/json';
            
            // HTTP retries are now disabled by default in httpHandlers
            // Circuit breaker handles all retry logic at the application level

            // Make sure we don't include the TOTP secret in the actual request
            delete formattedOptions.totpSecret;

            // Log the request being made (without sensitive data)
            log.debug(`Making HTTP request: ${method} ${substitutedUrl}`);
            log.debug(`Request options:`, JSON.stringify(formattedOptions, null, 2));

            // Make request
            const responseJson = await window.electronAPI.makeHttpRequest(substitutedUrl, method, formattedOptions);

            // Process response
            log.debug('Raw response from main process:', responseJson);
            const response = parseJSON(responseJson);
            if (!response) {
                throw new Error('Invalid response format');
            }
            log.debug('Parsed response:', response);

            // Don't throw error for HTTP error status codes in test mode
            // We want to show the actual response in the UI
            const isTestRequest = sourceId.startsWith('test-');
            if (!isTestRequest && response.statusCode && response.statusCode >= 400) {
                const error = new Error(`HTTP ${response.statusCode} error`);
                error.statusCode = response.statusCode;
                error.response = response;
                throw error;
            }

            // Extract body and headers
            const bodyContent = response.body || '';
            const headers = response.headers || {};

            log.debug('Extracted body content:', bodyContent);
            log.debug('Body content type:', typeof bodyContent);

            // Apply JSON filter if enabled
            let finalContent = bodyContent;
            const requestDuration = Date.now() - requestStartTime;

            if (normalizedJsonFilter.enabled && normalizedJsonFilter.path && bodyContent) {
                finalContent = applyJsonFilter(bodyContent, normalizedJsonFilter);

                return {
                    content: finalContent,
                    originalResponse: bodyContent,
                    headers: headers,
                    rawResponse: responseJson,
                    filteredWith: normalizedJsonFilter.path,
                    isFiltered: true,
                    duration: requestDuration
                };
            }

            return {
                content: finalContent,
                originalResponse: bodyContent,
                headers: headers,
                rawResponse: responseJson,
                duration: requestDuration
            };
        };
        
        // Execute the request
        return executeRequest();
    }, [parseJSON, applyJsonFilter, substituteVariables, recordTotpUsage, convertBodyToUrlEncoded, resolveObjectTemplate, environmentsReady, waitForEnvironments]);

    /**
     * Test HTTP request (used for UI testing)
     */
    const testRequest = useCallback(async (url, method, requestOptions, jsonFilter, sourceId = null, progressCallback = null) => {
        try {
            // Normalize sourceId - always use test- prefix for test requests
            const effectiveSourceId = sourceId ? `test-${sourceId}` : `test-${Date.now()}`;

            // Add timeout for test requests (30 seconds)
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Request timed out after 30 seconds')), 30000);
            });

            // Use the main request method but catch errors for better UI display
            const result = await Promise.race([
                request(effectiveSourceId, url, method, requestOptions, jsonFilter, progressCallback),
                timeoutPromise
            ]);

            log.debug('Test request result:', result);

            // Parse the raw response to get the actual status code
            let statusCode = 200;
            let responseData;
            try {
                responseData = JSON.parse(result.rawResponse);
                statusCode = responseData.statusCode || 200;
            } catch (e) {
                // If parsing fails, use default
                responseData = { statusCode: 200 };
            }

            // Convert result back to JSON string for UI display
            return JSON.stringify({
                statusCode: statusCode,
                body: result.content || responseData.body || '',
                headers: result.headers || responseData.headers || {},
                originalResponse: result.originalResponse,
                filteredWith: result.filteredWith,
                duration: result.duration
            }, null, 2);
        } catch (error) {
            log.error("Test request error:", error);

            // Check if error has response data (from HTTP errors)
            if (error.response) {
                return JSON.stringify({
                    statusCode: error.response.statusCode || error.statusCode || 0,
                    body: error.response.body || '',
                    headers: error.response.headers || {},
                    error: error.message,
                    details: error.originalError?.message
                }, null, 2);
            }

            // Return error in a format the UI can display
            return JSON.stringify({
                error: error.message,
                statusCode: error.statusCode || 0,
                details: error.originalError?.message
            }, null, 2);
        }
    }, [request]);

    return {
        request,
        testRequest,
        applyJsonFilter
    };
}