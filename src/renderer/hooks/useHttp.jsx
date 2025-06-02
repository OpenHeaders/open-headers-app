import { useCallback } from 'react';
const { createLogger } = require('../utils/logger');
const log = createLogger('useHttp');

/**
 * Custom hook for HTTP operations - Simplified version without refresh logic
 * All refresh management is now handled by RefreshManager
 */
export function useHttp() {
    /**
     * Parse JSON safely
     */
    const parseJSON = useCallback((text) => {
        try {
            return JSON.parse(text);
        } catch (error) {
            log.error('Error parsing JSON:', error);
            return null;
        }
    }, []);

    /**
     * Apply JSON filter to a response body with improved error handling
     */
    const applyJsonFilter = useCallback((body, jsonFilter) => {
        // Always normalize the filter object to ensure consistent behavior
        const normalizedFilter = {
            enabled: jsonFilter?.enabled === true, // Use strict equality check
            path: jsonFilter?.enabled === true ? (jsonFilter?.path || '') : '' // Only include path if enabled
        };

        // Log normalized filter for debugging
        log.debug('Applying JSON filter:',
            JSON.stringify(normalizedFilter),
            "to body:",
            typeof body === 'string' ? body.substring(0, 100) + '...' : body);

        // Immediately return the original body if filter is not properly configured
        if (!normalizedFilter.enabled || !normalizedFilter.path) {
            log.debug('JSON filter not enabled or no path specified, returning original body');
            return body;
        }

        try {
            // Ensure we're working with a parsed object
            let jsonObj;
            if (typeof body === 'string') {
                jsonObj = parseJSON(body);
                if (!jsonObj) {
                    log.error('Failed to parse JSON body');
                    return body;
                }
            } else {
                jsonObj = body;
            }

            // Check if this is an error response
            if (jsonObj.error) {
                log.debug('Detected error response, checking if we should bypass filter');
                log.debug('Error response details:', jsonObj);

                // Create a more user-friendly message for errors
                let errorMessage = `Error: ${jsonObj.error}`;
                if (jsonObj.error_description) {
                    errorMessage += ` - ${jsonObj.error_description}`;
                } else if (jsonObj.message) {
                    errorMessage += ` - ${jsonObj.message}`;
                }

                // Return the error message instead of trying to apply the filter
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
                const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);

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
    const substituteVariables = useCallback((text, variables, totpCode = null) => {
        if (!text) return text;

        let result = text;

        // First replace TOTP code if available
        if (totpCode) {
            result = result.replace(/_TOTP_CODE/g, totpCode);
        }

        // Then replace all variables
        if (Array.isArray(variables) && variables.length > 0) {
            variables.forEach(variable => {
                if (variable && variable.key && variable.value !== undefined) {
                    // Use regular expression with global flag for reliable replacement
                    const regex = new RegExp(variable.key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
                    result = result.replace(regex, variable.value);
                }
            });
        }

        return result;
    }, []);

    /**
     * Make HTTP request - Clean simplified version
     */
    const request = useCallback(async (
        sourceId,
        url,
        method = 'GET',
        requestOptions = {},
        jsonFilter = { enabled: false, path: '' }
    ) => {
        // Track retry attempts
        let retryAttempt = 0;
        const MAX_CLIENT_RETRIES = 3;  // Increased retries for better reliability

        const attemptRequest = async () => {
            try {
                // Create a normalized jsonFilter object
                const normalizedJsonFilter = {
                    enabled: jsonFilter?.enabled === true,
                    path: jsonFilter?.enabled === true ? (jsonFilter?.path || '') : ''
                };

                // Store variables array explicitly and make a deep copy
                const variables = Array.isArray(requestOptions.variables)
                    ? JSON.parse(JSON.stringify(requestOptions.variables))
                    : [];

                // Format options
                const formattedOptions = {
                    ...requestOptions,
                    headers: {},
                    queryParams: {}
                };

                // Handle TOTP if present
                let totpCode = null;
                if (requestOptions.totpSecret) {
                    try {
                        const normalizedSecret = requestOptions.totpSecret.replace(/\s/g, '').replace(/=/g, '');
                        totpCode = await window.generateTOTP(normalizedSecret, 30, 6, 0);
                        log.debug(`Generated TOTP code for source ${sourceId}: ${totpCode} at ${new Date().toISOString()}`);

                        if (!totpCode || totpCode === 'ERROR') {
                            log.error(`Failed to generate TOTP code for source ${sourceId}`);
                        }
                    } catch (totpError) {
                        log.error(`Error generating TOTP code: ${totpError.message}`);
                    }
                }

                // Perform variable substitution in URL
                let originalUrl = url;
                if (url.includes('_TOTP_CODE') || variables.length > 0) {
                    url = substituteVariables(url, variables, totpCode);
                }

                // Process headers from array format to object
                if (Array.isArray(requestOptions.headers)) {
                    requestOptions.headers.forEach(header => {
                        if (header && header.key) {
                            let headerValue = header.value || '';
                            // Apply variable substitution to header value
                            headerValue = substituteVariables(headerValue, variables, totpCode);
                            formattedOptions.headers[header.key] = headerValue;
                        }
                    });
                } else if (typeof requestOptions.headers === 'object' && requestOptions.headers !== null) {
                    Object.entries(requestOptions.headers).forEach(([key, value]) => {
                        let headerValue = value || '';
                        // Apply variable substitution to header value
                        headerValue = substituteVariables(headerValue, variables, totpCode);
                        formattedOptions.headers[key] = headerValue;
                    });
                }

                // Process query params from array format to object
                if (Array.isArray(requestOptions.queryParams)) {
                    requestOptions.queryParams.forEach(param => {
                        if (param && param.key) {
                            let paramValue = param.value || '';
                            // Apply variable substitution to param value
                            paramValue = substituteVariables(paramValue, variables, totpCode);
                            formattedOptions.queryParams[param.key] = paramValue;
                        }
                    });
                } else if (typeof requestOptions.queryParams === 'object' && requestOptions.queryParams !== null) {
                    Object.entries(requestOptions.queryParams).forEach(([key, value]) => {
                        let paramValue = value || '';
                        // Apply variable substitution to param value
                        paramValue = substituteVariables(paramValue, variables, totpCode);
                        formattedOptions.queryParams[key] = paramValue;
                    });
                }

                // Process body for variable substitution
                if (requestOptions.body) {
                    let bodyContent = requestOptions.body;
                    if (typeof bodyContent === 'string') {
                        // Apply variable substitution to body content
                        bodyContent = substituteVariables(bodyContent, variables, totpCode);
                        formattedOptions.body = bodyContent;
                    } else {
                        formattedOptions.body = requestOptions.body;
                    }
                }

                // Copy other request options
                formattedOptions.contentType = requestOptions.contentType || 'application/json';

                // Very important: preserve variables in the formatted options
                formattedOptions.variables = variables;

                // Make sure we don't include the TOTP secret in the actual request
                delete formattedOptions.totpSecret;

                // Log the actual request being made
                log.debug(`Making HTTP request to ${url} with options:`, {
                    method,
                    headers: formattedOptions.headers,
                    body: formattedOptions.body ? formattedOptions.body.substring(0, 100) + '...' : null
                });

                // Make request with retry tracking
                const responseJson = await window.electronAPI.makeHttpRequest(url, method, formattedOptions);

                // Process response
                const response = parseJSON(responseJson);
                if (!response) {
                    throw new Error('Invalid response format');
                }

                // Extract body and headers
                const bodyContent = response.body || '';
                const headers = response.headers || {};

                // Apply JSON filter if enabled - use normalized filter
                let finalContent = bodyContent;

                // Use the normalized filter object
                if (normalizedJsonFilter.enabled && normalizedJsonFilter.path && bodyContent) {
                    finalContent = applyJsonFilter(bodyContent, normalizedJsonFilter);

                    return {
                        content: finalContent,
                        originalResponse: bodyContent,
                        headers: headers,
                        rawResponse: responseJson,
                        filteredWith: normalizedJsonFilter.path,
                        isFiltered: true
                    };
                }

                return {
                    content: finalContent,
                    originalResponse: bodyContent,
                    headers: headers,
                    rawResponse: responseJson
                };
            } catch (error) {
                // Improved error handling with specific retry for network errors
                log.error(`HTTP request error (attempt ${retryAttempt + 1}):`, error);

                // Detect if this is a network error that could benefit from a retry
                const isRetryableError =
                    error.message.includes('ECONNRESET') ||
                    error.message.includes('ETIMEDOUT') ||
                    error.message.includes('ECONNREFUSED') ||
                    error.message.includes('socket hang up') ||
                    error.message.includes('network error') ||
                    error.message.includes('DNS resolution failed') ||
                    error.message.includes('Connection refused');

                // Check if we should retry
                if (isRetryableError && retryAttempt < MAX_CLIENT_RETRIES) {
                    retryAttempt++;
                    log.info(`Retrying request for source ${sourceId} (attempt ${retryAttempt + 1} of ${MAX_CLIENT_RETRIES + 1})`);

                    // Calculate exponential backoff delay with jitter
                    const backoffDelay = Math.min(
                        2000 * Math.pow(2, retryAttempt - 1) + Math.random() * 1000,
                        30000 // Max 30 seconds
                    );

                    log.debug(`Waiting ${Math.round(backoffDelay)}ms before retry`);

                    // Wait and retry
                    await new Promise(resolve => setTimeout(resolve, backoffDelay));
                    return attemptRequest(); // Recursive retry
                }

                // If we've exhausted retries or it's not a retryable error, throw
                throw error;
            }
        };

        // Start the request process with retry capability
        return attemptRequest();
    }, [parseJSON, applyJsonFilter, substituteVariables]);

    /**
     * Test HTTP request (used for UI testing)
     */
    const testRequest = useCallback(async (url, method, requestOptions, jsonFilter) => {
        try {
            // Store variables array explicitly and make a deep copy to avoid reference issues
            const variables = Array.isArray(requestOptions.variables)
                ? JSON.parse(JSON.stringify(requestOptions.variables))
                : [];

            // Format options
            const formattedOptions = {
                ...requestOptions,
                headers: {},
                queryParams: {}
            };

            // Handle TOTP if present
            let totpCode = null;
            if (requestOptions.totpSecret) {
                try {
                    const normalizedSecret = requestOptions.totpSecret.replace(/\s/g, '').replace(/=/g, '');
                    totpCode = await window.generateTOTP(normalizedSecret, 30, 6, 0);

                    if (!totpCode || totpCode === 'ERROR') {
                        log.error(`Failed to generate TOTP code for test request`);
                    }
                } catch (totpError) {
                    log.error(`Error generating TOTP code for test: ${totpError.message}`);
                }
            }

            // Perform variable substitution in URL
            let originalUrl = url;
            if (url.includes('_TOTP_CODE') || variables.length > 0) {
                url = substituteVariables(url, variables, totpCode);
            }

            // Process headers from array format to object
            if (Array.isArray(requestOptions.headers)) {
                requestOptions.headers.forEach(header => {
                    if (header && header.key) {
                        let headerValue = header.value || '';
                        // Apply variable substitution to header value
                        headerValue = substituteVariables(headerValue, variables, totpCode);
                        formattedOptions.headers[header.key] = headerValue;
                    }
                });
            } else if (typeof requestOptions.headers === 'object' && requestOptions.headers !== null) {
                Object.entries(requestOptions.headers).forEach(([key, value]) => {
                    let headerValue = value || '';
                    // Apply variable substitution to header value
                    headerValue = substituteVariables(headerValue, variables, totpCode);
                    formattedOptions.headers[key] = headerValue;
                });
            }

            // Process query params properly
            if (requestOptions.queryParams) {
                if (Array.isArray(requestOptions.queryParams)) {
                    requestOptions.queryParams.forEach(param => {
                        if (param && param.key) {
                            let paramValue = param.value || '';
                            // Apply variable substitution to param value
                            paramValue = substituteVariables(paramValue, variables, totpCode);
                            formattedOptions.queryParams[param.key] = paramValue;
                        }
                    });
                } else if (typeof requestOptions.queryParams === 'object' && requestOptions.queryParams !== null) {
                    Object.entries(requestOptions.queryParams).forEach(([key, value]) => {
                        let paramValue = value || '';
                        // Apply variable substitution to param value
                        paramValue = substituteVariables(paramValue, variables, totpCode);
                        formattedOptions.queryParams[key] = paramValue;
                    });
                }
            }

            // Process body for variable substitution
            if (requestOptions.body) {
                let bodyContent = requestOptions.body;
                if (typeof bodyContent === 'string') {
                    // Apply variable substitution to body content
                    bodyContent = substituteVariables(bodyContent, variables, totpCode);
                    formattedOptions.body = bodyContent;
                } else {
                    formattedOptions.body = requestOptions.body;
                }
            }

            // Copy other request options
            formattedOptions.contentType = requestOptions.contentType || 'application/json';

            // Very important: preserve variables in the formatted options for the request
            formattedOptions.variables = variables;

            // Make sure we don't include the TOTP secret in the actual request
            delete formattedOptions.totpSecret;

            const responseJson = await window.electronAPI.makeHttpRequest(url, method, formattedOptions);

            // Parse response to get body
            const response = parseJSON(responseJson);
            if (!response) {
                return responseJson;
            }

            const bodyContent = response.body || '';
            const headers = response.headers || {};

            // If no JSON filter is enabled, return raw response
            if (!jsonFilter || jsonFilter.enabled !== true || !jsonFilter.path) {
                return responseJson;
            }

            // Apply filter if enabled
            try {
                if (!bodyContent) {
                    return responseJson;
                }

                const filteredContent = applyJsonFilter(bodyContent, jsonFilter);

                // Create new response with filtered content, original body, and headers
                const filteredResponse = {
                    ...response,
                    body: filteredContent,
                    filteredWith: jsonFilter.path,
                    originalResponse: bodyContent,
                    headers: headers
                };

                return JSON.stringify(filteredResponse, null, 2);
            } catch (error) {
                log.error("Error filtering test response:", error);
                return responseJson;
            }
        } catch (error) {
            log.error("Test request error:", error);
            throw error;
        }
    }, [parseJSON, applyJsonFilter, substituteVariables]);

    return {
        request,
        testRequest,
        applyJsonFilter
    };
}