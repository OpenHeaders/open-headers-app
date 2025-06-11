import { useCallback } from 'react';
import { useTotpState } from '../contexts/TotpContext';
const { createLogger } = require('../utils/logger');
const timeManager = require('../services/TimeManager');
const { ErrorClassifier } = require('../utils/ErrorClassification');
const { circuitBreakerManager } = require('../utils/CircuitBreaker');
const log = createLogger('useHttp');

/**
 * Improved HTTP hook with error classification and circuit breaker
 */
export function useHttp() {
    // Use TOTP context
    const { recordTotpUsage } = useTotpState();
    
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
                if (jsonObj.error_description) {
                    errorMessage += ` - ${jsonObj.error_description}`;
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
        const encoded = Object.entries(formData)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
        
        return encoded;
    }, []);

    /**
     * Make HTTP request with improved error handling and circuit breaker
     */
    const request = useCallback(async (
        sourceId,
        url,
        method = 'GET',
        requestOptions = {},
        jsonFilter = { enabled: false, path: '' }
    ) => {
        // Normalize sourceId to string
        sourceId = String(sourceId);
        
        // Use circuit breaker for this source
        const circuitBreaker = circuitBreakerManager.getBreaker(`request-${sourceId}`, {
            failureThreshold: 5,
            resetTimeout: 60000
        });

        return circuitBreaker.execute(async () => {
            let retryAttempt = 0;

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

                            if (!totpCode || totpCode === 'ERROR') {
                                throw new Error('Failed to generate TOTP code');
                            }

                            // Record TOTP usage
                            recordTotpUsage(sourceId, requestOptions.totpSecret, totpCode);
                        } catch (totpError) {
                            log.error(`Error generating TOTP code: ${totpError.message}`);
                            throw totpError;
                        }
                    }

                    // Perform variable substitution in URL
                    if (url.includes('_TOTP_CODE') || variables.length > 0) {
                        url = substituteVariables(url, variables, totpCode);
                    }

                    // Process headers from array format to object
                    if (Array.isArray(requestOptions.headers)) {
                        requestOptions.headers.forEach(header => {
                            if (header && header.key) {
                                let headerValue = header.value || '';
                                headerValue = substituteVariables(headerValue, variables, totpCode);
                                formattedOptions.headers[header.key] = headerValue;
                            }
                        });
                    } else if (typeof requestOptions.headers === 'object' && requestOptions.headers !== null) {
                        Object.entries(requestOptions.headers).forEach(([key, value]) => {
                            let headerValue = value || '';
                            headerValue = substituteVariables(headerValue, variables, totpCode);
                            formattedOptions.headers[key] = headerValue;
                        });
                    }

                    // Process query params from array format to object
                    if (Array.isArray(requestOptions.queryParams)) {
                        requestOptions.queryParams.forEach(param => {
                            if (param && param.key) {
                                let paramValue = param.value || '';
                                paramValue = substituteVariables(paramValue, variables, totpCode);
                                formattedOptions.queryParams[param.key] = paramValue;
                            }
                        });
                    } else if (typeof requestOptions.queryParams === 'object' && requestOptions.queryParams !== null) {
                        Object.entries(requestOptions.queryParams).forEach(([key, value]) => {
                            let paramValue = value || '';
                            paramValue = substituteVariables(paramValue, variables, totpCode);
                            formattedOptions.queryParams[key] = paramValue;
                        });
                    }

                    // Process body for variable substitution
                    if (requestOptions.body) {
                        let bodyContent = requestOptions.body;
                        if (typeof bodyContent === 'string') {
                            bodyContent = substituteVariables(bodyContent, variables, totpCode);
                            
                            // Convert colon-separated format to URL-encoded format for form data
                            if (requestOptions.contentType === 'application/x-www-form-urlencoded' && bodyContent.includes(':')) {
                                bodyContent = convertBodyToUrlEncoded(bodyContent);
                            }
                            
                            formattedOptions.body = bodyContent;
                        } else {
                            formattedOptions.body = requestOptions.body;
                        }
                    }

                    // Copy other request options
                    formattedOptions.contentType = requestOptions.contentType || 'application/json';
                    formattedOptions.variables = variables;

                    // Make sure we don't include the TOTP secret in the actual request
                    delete formattedOptions.totpSecret;

                    // Log the request being made (without sensitive data)
                    log.debug(`Making HTTP request: ${method} ${url}`);

                    // Make request
                    const responseJson = await window.electronAPI.makeHttpRequest(url, method, formattedOptions);

                    // Process response
                    const response = parseJSON(responseJson);
                    if (!response) {
                        throw new Error('Invalid response format');
                    }

                    // Check if we got an HTTP error status
                    if (response.statusCode && response.statusCode >= 400) {
                        const error = new Error(`HTTP ${response.statusCode} error`);
                        error.statusCode = response.statusCode;
                        error.response = response;
                        throw error;
                    }

                    // Extract body and headers
                    const bodyContent = response.body || '';
                    const headers = response.headers || {};

                    // Apply JSON filter if enabled
                    let finalContent = bodyContent;

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
                    log.error(`HTTP request error (attempt ${retryAttempt + 1}):`, error);

                    // Use error classifier to determine retry strategy
                    const retryStrategy = ErrorClassifier.getRetryStrategy(
                        error,
                        error.statusCode || null,
                        retryAttempt + 1
                    );

                    if (retryStrategy.shouldRetry) {
                        retryAttempt++;
                        log.info(`Retrying request for source ${sourceId}`, {
                            attempt: retryAttempt + 1,
                            maxAttempts: retryStrategy.maxAttempts,
                            delay: retryStrategy.delay,
                            reason: retryStrategy.reason
                        });

                        // Wait with intelligent backoff
                        await new Promise(resolve => setTimeout(resolve, retryStrategy.delay));
                        return attemptRequest(); // Recursive retry
                    }

                    // If we've exhausted retries or it's not retryable, throw with context
                    const enhancedError = new Error(
                        `Request failed: ${error.message} (${retryStrategy.reason})`
                    );
                    enhancedError.originalError = error;
                    enhancedError.retryStrategy = retryStrategy;
                    enhancedError.statusCode = error.statusCode;
                    
                    throw enhancedError;
                }
            };

            // Start the request process
            return attemptRequest();
        });
    }, [parseJSON, applyJsonFilter, substituteVariables, recordTotpUsage, convertBodyToUrlEncoded]);

    /**
     * Test HTTP request (used for UI testing)
     */
    const testRequest = useCallback(async (url, method, requestOptions, jsonFilter, sourceId = null) => {
        try {
            // Normalize sourceId
            const effectiveSourceId = sourceId ? String(sourceId) : `test-${Date.now()}`;
            
            // Use the main request method but catch errors for better UI display
            const result = await request(effectiveSourceId, url, method, requestOptions, jsonFilter);
            
            // Convert result back to JSON string for UI display
            return JSON.stringify({
                statusCode: 200,
                body: result.content,
                headers: result.headers,
                originalResponse: result.originalResponse,
                filteredWith: result.filteredWith
            }, null, 2);
        } catch (error) {
            log.error("Test request error:", error);
            
            // Return error in a format the UI can display
            return JSON.stringify({
                error: error.message,
                statusCode: error.statusCode || 0,
                retryStrategy: error.retryStrategy,
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