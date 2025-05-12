import { useCallback, useRef, useEffect } from 'react';

/**
 * Custom hook for HTTP operations
 */
export function useHttp() {
    // Track active refresh timers
    const refreshTimers = useRef(new Map());

    // Clean up timers on unmount
    useEffect(() => {
        return () => {
            // Clear all timers when component unmounts
            const timerCount = refreshTimers.current.size;
            if (timerCount > 0) {
                console.log(`Cleaning up ${timerCount} refresh timers on useHttp unmount`);

                for (const [sourceId, timer] of refreshTimers.current.entries()) {
                    clearTimeout(timer);
                    clearInterval(timer);
                    console.log(`Cleaned up timer for source ${sourceId}`);
                }

                refreshTimers.current.clear();
            }
        };
    }, []);

    /**
     * Parse JSON safely
     */
    const parseJSON = useCallback((text) => {
        try {
            return JSON.parse(text);
        } catch (error) {
            console.error('Error parsing JSON:', error);
            return null;
        }
    }, []);

    /**
     * Apply JSON filter to a response body with improved error handling
     */
    const applyJsonFilter = useCallback((body, jsonFilter) => {
        // FIXED: Always normalize the filter object to ensure consistent behavior
        const normalizedFilter = {
            enabled: jsonFilter?.enabled === true, // Use strict equality check
            path: jsonFilter?.enabled === true ? (jsonFilter?.path || '') : '' // Only include path if enabled
        };

        // Log normalized filter for debugging
        console.log("Applying JSON filter:",
            JSON.stringify(normalizedFilter),
            "to body:",
            typeof body === 'string' ? body.substring(0, 100) + '...' : body);

        // Immediately return the original body if filter is not properly configured
        if (!normalizedFilter.enabled || !normalizedFilter.path) {
            console.log("JSON filter not enabled or no path specified, returning original body");
            return body;
        }

        try {
            // Ensure we're working with a parsed object
            let jsonObj;
            if (typeof body === 'string') {
                jsonObj = parseJSON(body);
                if (!jsonObj) {
                    console.error("Failed to parse JSON body");
                    return body;
                }
            } else {
                jsonObj = body;
            }

            // IMPROVED: First check if this is an error response
            if (jsonObj.error) {
                console.log("Detected error response, checking if we should bypass filter");

                // Create a more user-friendly message for errors
                let errorMessage = `Error: ${jsonObj.error}`;
                if (jsonObj.error_description) {
                    errorMessage += ` - ${jsonObj.error_description}`;
                } else if (jsonObj.message) {
                    errorMessage += ` - ${jsonObj.message}`;
                }

                // Return the error message instead of trying to apply the filter
                console.log("Returning user-friendly error message instead of applying filter");
                return errorMessage;
            }

            // Extract path (remove 'root.' prefix if present)
            const path = normalizedFilter.path.startsWith('root.')
                ? normalizedFilter.path.substring(5)
                : normalizedFilter.path;

            if (!path) {
                console.log("Empty path after removing 'root.' prefix, returning original body");
                return body;
            }

            // Navigate through path parts
            const parts = path.split('.');
            let current = jsonObj;

            console.log("Path parts:", parts);

            for (const part of parts) {
                // Check for array notation: property[index]
                const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);

                if (arrayMatch) {
                    const [_, propName, index] = arrayMatch;
                    console.log(`Processing array part: ${propName}[${index}]`);

                    if (current[propName] === undefined) {
                        // IMPROVED: Better error message format
                        console.error(`Path '${normalizedFilter.path}' not found (property '${propName}' is missing)`);
                        return `The field "${path}" was not found in the response.`;
                    }

                    if (!Array.isArray(current[propName])) {
                        // IMPROVED: Better error message format
                        console.error(`Path '${normalizedFilter.path}' is invalid ('${propName}' is not an array)`);
                        return `The field "${propName}" exists but is not an array.`;
                    }

                    const idx = parseInt(index, 10);
                    if (idx >= current[propName].length) {
                        // IMPROVED: Better error message format
                        console.error(`Path '${normalizedFilter.path}' is invalid (index ${idx} out of bounds)`);
                        return `The array index [${idx}] is out of bounds.`;
                    }

                    current = current[propName][idx];
                } else {
                    console.log(`Processing object part: ${part}`);
                    if (current[part] === undefined) {
                        // IMPROVED: Better error message format and more user-friendly
                        console.error(`Path '${normalizedFilter.path}' not found (property '${part}' is missing)`);
                        return `The field "${part}" was not found in the response.`;
                    }
                    current = current[part];
                }
            }

            console.log("Final filtered value:", current);

            // Format result based on type
            if (typeof current === 'object' && current !== null) {
                return JSON.stringify(current, null, 2);
            } else {
                return String(current);
            }
        } catch (error) {
            console.error('Error applying JSON filter:', error);
            // IMPROVED: More user-friendly error message
            return `Could not filter response: ${error.message}`;
        }
    }, [parseJSON]);

    const substituteVariables = (text, variables, totpCode = null) => {
        if (!text) return text;

        let result = text;

        console.log(`Starting substitution on: '${text}'`);
        console.log(`With variables: ${JSON.stringify(variables)}`);

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
                    console.log(`Substituted ${variable.key} with ${variable.value}`);
                }
            });
        }

        console.log(`Final result after substitution: '${result}'`);
        return result;
    };


    /**
     * Make HTTP request - Clean refactored version
     */
    const request = useCallback(async (
        sourceId,
        url,
        method = 'GET',
        requestOptions = {},
        jsonFilter = { enabled: false, path: '' }
    ) => {
        try {
            // Create a normalized jsonFilter object
            const normalizedJsonFilter = {
                enabled: jsonFilter?.enabled === true,
                path: jsonFilter?.enabled === true ? (jsonFilter?.path || '') : ''
            };

            console.log("Making HTTP request:", {
                sourceId,
                url,
                method,
                requestOptions: {
                    ...requestOptions,
                    headers: requestOptions.headers ? "headers present" : "no headers",
                    queryParams: requestOptions.queryParams ? "params present" : "no params",
                    totpSecret: requestOptions.totpSecret ? "present" : "not present",
                    variables: requestOptions.variables ? `${requestOptions.variables.length} variables` : "no variables"
                },
                jsonFilter: JSON.stringify(normalizedJsonFilter)
            });

            // Store variables array explicitly and make a deep copy
            const variables = Array.isArray(requestOptions.variables)
                ? JSON.parse(JSON.stringify(requestOptions.variables))
                : [];

            console.log(`Source ${sourceId} has ${variables.length} variables for substitution`);

            // CRITICAL DEBUGGING: Log the actual variables array content
            console.log("VARIABLES DETAILS for request:");
            console.log("Original variables from requestOptions:", JSON.stringify(requestOptions.variables));
            console.log("Extracted variables array:", JSON.stringify(variables));
            variables.forEach((v, i) => console.log(`Variable ${i}: ${v.key} = ${v.value}`));

            // Format options
            const formattedOptions = {
                ...requestOptions,
                headers: {},
                queryParams: {}
            };

            // Handle TOTP if present
            let totpCode = null;
            if (requestOptions.totpSecret) {
                console.log(`Source ${sourceId} has TOTP secret, generating TOTP code`);

                try {
                    const normalizedSecret = requestOptions.totpSecret.replace(/\s/g, '').replace(/=/g, '');
                    totpCode = await window.generateTOTP(normalizedSecret, 30, 6, 0);

                    if (totpCode && totpCode !== 'ERROR') {
                        console.log(`Generated TOTP code for source ${sourceId}: ${totpCode}`);
                    } else {
                        console.error(`Failed to generate TOTP code for source ${sourceId}`);
                    }
                } catch (totpError) {
                    console.error(`Error generating TOTP code: ${totpError.message}`);
                }
            }

            // Perform variable substitution in URL
            let originalUrl = url;
            if (url.includes('_TOTP_CODE') || variables.length > 0) {
                console.log(`URL before substitution: ${url}`);
                url = substituteVariables(url, variables, totpCode);
                console.log(`URL after substitution: ${url}`);

                if (url !== originalUrl) {
                    console.log(`Variable substitution performed in URL for source ${sourceId}`);
                }
            }

            // Process headers from array format to object
            if (Array.isArray(requestOptions.headers)) {
                console.log("Processing headers array:", requestOptions.headers);
                requestOptions.headers.forEach(header => {
                    if (header && header.key) {
                        let headerValue = header.value || '';
                        console.log(`Header before substitution: ${header.key} = ${headerValue}`);
                        // Apply variable substitution to header value
                        headerValue = substituteVariables(headerValue, variables, totpCode);
                        console.log(`Header after substitution: ${header.key} = ${headerValue}`);
                        formattedOptions.headers[header.key] = headerValue;
                        console.log(`Added header: ${header.key} = ${formattedOptions.headers[header.key]}`);
                    }
                });
            } else if (typeof requestOptions.headers === 'object' && requestOptions.headers !== null) {
                Object.entries(requestOptions.headers).forEach(([key, value]) => {
                    let headerValue = value || '';
                    console.log(`Header before substitution: ${key} = ${headerValue}`);
                    // Apply variable substitution to header value
                    headerValue = substituteVariables(headerValue, variables, totpCode);
                    console.log(`Header after substitution: ${key} = ${headerValue}`);
                    formattedOptions.headers[key] = headerValue;
                });
                console.log("Headers already in object format:", formattedOptions.headers);
            }

            // Process query params from array format to object
            if (Array.isArray(requestOptions.queryParams)) {
                console.log("Processing query params array:", requestOptions.queryParams);
                requestOptions.queryParams.forEach(param => {
                    if (param && param.key) {
                        let paramValue = param.value || '';
                        console.log(`Query param before substitution: ${param.key} = ${paramValue}`);
                        // Apply variable substitution to param value
                        paramValue = substituteVariables(paramValue, variables, totpCode);
                        console.log(`Query param after substitution: ${param.key} = ${paramValue}`);
                        formattedOptions.queryParams[param.key] = paramValue;
                        console.log(`Added query param: ${param.key} = ${paramValue}`);
                    }
                });
            } else if (typeof requestOptions.queryParams === 'object' && requestOptions.queryParams !== null) {
                Object.entries(requestOptions.queryParams).forEach(([key, value]) => {
                    let paramValue = value || '';
                    console.log(`Query param before substitution: ${key} = ${paramValue}`);
                    // Apply variable substitution to param value
                    paramValue = substituteVariables(paramValue, variables, totpCode);
                    console.log(`Query param after substitution: ${key} = ${paramValue}`);
                    formattedOptions.queryParams[key] = paramValue;
                });
            }

            // Process body for variable substitution
            if (requestOptions.body) {
                let bodyContent = requestOptions.body;
                if (typeof bodyContent === 'string') {
                    console.log(`Body before substitution: ${bodyContent.substring(0, 50)}...`);
                    // Apply variable substitution to body content
                    bodyContent = substituteVariables(bodyContent, variables, totpCode);
                    console.log(`Body after substitution: ${bodyContent.substring(0, 50)}...`);
                    formattedOptions.body = bodyContent;
                    console.log(`Variable substitution in request body for source ${sourceId}`);
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

            console.log("Formatted request options:", {
                ...formattedOptions,
                headers: Object.keys(formattedOptions.headers).length > 0 ? "headers present" : "no headers",
                queryParams: Object.keys(formattedOptions.queryParams).length > 0 ? "params present" : "no params",
                body: formattedOptions.body ? "body present" : "no body"
            });

            // Make request
            const responseJson = await window.electronAPI.makeHttpRequest(url, method, formattedOptions);
            console.log("Raw response:", responseJson.substring(0, 200) + "...");

            // Process response as before
            const response = parseJSON(responseJson);
            if (!response) {
                throw new Error('Invalid response format');
            }

            // Extract body and headers
            const bodyContent = response.body || '';
            const headers = response.headers || {};
            console.log("Body content (original):", bodyContent ? bodyContent.substring(0, 200) + "..." : "empty");
            console.log("Headers received:", headers);

            // Apply JSON filter if enabled - use normalized filter
            let finalContent = bodyContent;

            // Use the normalized filter object
            if (normalizedJsonFilter.enabled && normalizedJsonFilter.path && bodyContent) {
                console.log(`Applying JSON filter with path: ${normalizedJsonFilter.path}`);
                finalContent = applyJsonFilter(bodyContent, normalizedJsonFilter);
                console.log("Filtered content:", finalContent ? finalContent.substring(0, 200) + "..." : "empty");

                return {
                    content: finalContent,
                    originalResponse: bodyContent,
                    headers: headers,
                    rawResponse: responseJson,
                    filteredWith: normalizedJsonFilter.path,
                    isFiltered: true
                };
            } else {
                // Log why we're not filtering
                if (!normalizedJsonFilter.enabled) {
                    console.log(`JSON filtering disabled: normalizedJsonFilter.enabled is false`);
                } else if (!normalizedJsonFilter.path) {
                    console.log("JSON filtering disabled: normalizedJsonFilter.path is empty");
                } else if (!bodyContent) {
                    console.log("JSON filtering disabled: response body is empty");
                } else {
                    console.log("JSON filtering disabled for unknown reason");
                }
                console.log("Using original content without filtering");
            }

            // Use originalResponse instead of originalJson
            return {
                content: finalContent,
                originalResponse: bodyContent,
                headers: headers,
                rawResponse: responseJson
            };
        } catch (error) {
            console.error("HTTP request error:", error);
            throw error;
        }
    }, [parseJSON, applyJsonFilter]);

    /**
     * Test HTTP request (used for UI testing)
     */
    const testRequest = useCallback(async (url, method, requestOptions, jsonFilter) => {
        try {
            // Store variables array explicitly and make a deep copy to avoid reference issues
            const variables = Array.isArray(requestOptions.variables)
                ? JSON.parse(JSON.stringify(requestOptions.variables))
                : [];

            console.log("Testing HTTP request:", {
                url,
                method,
                requestOptions: {
                    ...requestOptions,
                    headers: requestOptions.headers ? "headers present" : "no headers",
                    queryParams: Object.keys(requestOptions.queryParams || {}).length > 0 ? "params present" : "no params",
                    totpSecret: requestOptions.totpSecret ? "present" : "not present",
                    variables: variables.length > 0 ? `${variables.length} variables` : "no variables"
                },
                jsonFilter
            });

            // CRITICAL DEBUGGING: Log the actual variables array content
            console.log("VARIABLES DETAILS:");
            console.log("Original variables from requestOptions:", JSON.stringify(requestOptions.variables));
            console.log("Extracted variables array:", JSON.stringify(variables));
            console.log("Variable array length:", variables.length);
            variables.forEach((v, i) => console.log(`Variable ${i}: ${v.key} = ${v.value}`));

            // Format options
            const formattedOptions = {
                ...requestOptions,
                headers: {},
                queryParams: {}
            };

            // Handle TOTP if present
            let totpCode = null;
            if (requestOptions.totpSecret) {
                console.log("TOTP secret found in test request, generating TOTP code");

                try {
                    const normalizedSecret = requestOptions.totpSecret.replace(/\s/g, '').replace(/=/g, '');
                    totpCode = await window.generateTOTP(normalizedSecret, 30, 6, 0);

                    if (totpCode && totpCode !== 'ERROR') {
                        console.log(`Generated TOTP code for test request: ${totpCode}`);
                    } else {
                        console.error(`Failed to generate TOTP code for test request`);
                    }
                } catch (totpError) {
                    console.error(`Error generating TOTP code for test: ${totpError.message}`);
                }
            }

            // Perform variable substitution in URL
            let originalUrl = url;
            if (url.includes('_TOTP_CODE') || variables.length > 0) {
                console.log(`URL before substitution: ${url}`);
                url = substituteVariables(url, variables, totpCode);
                console.log(`URL after substitution: ${url}`);

                if (url !== originalUrl) {
                    console.log(`Variable substitution performed in test URL`);
                }
            }

            // Process headers from array format to object
            if (Array.isArray(requestOptions.headers)) {
                console.log("Processing headers for test request:", requestOptions.headers);
                requestOptions.headers.forEach(header => {
                    if (header && header.key) {
                        let headerValue = header.value || '';
                        console.log(`Header before substitution: ${header.key} = ${headerValue}`);
                        // Apply variable substitution to header value
                        headerValue = substituteVariables(headerValue, variables, totpCode);
                        console.log(`Header after substitution: ${header.key} = ${headerValue}`);
                        formattedOptions.headers[header.key] = headerValue;
                        console.log(`Added test header: ${header.key} = ${formattedOptions.headers[header.key]}`);
                    }
                });
            } else if (typeof requestOptions.headers === 'object' && requestOptions.headers !== null) {
                Object.entries(requestOptions.headers).forEach(([key, value]) => {
                    let headerValue = value || '';
                    console.log(`Header before substitution: ${key} = ${headerValue}`);
                    // Apply variable substitution to header value
                    headerValue = substituteVariables(headerValue, variables, totpCode);
                    console.log(`Header after substitution: ${key} = ${headerValue}`);
                    formattedOptions.headers[key] = headerValue;
                });
                console.log("Test headers already in object format:", formattedOptions.headers);
            }

            // Process query params properly
            if (requestOptions.queryParams) {
                if (Array.isArray(requestOptions.queryParams)) {
                    console.log("Processing query params array for test request:", requestOptions.queryParams);
                    console.log("Available variables for substitution:", JSON.stringify(variables));

                    requestOptions.queryParams.forEach(param => {
                        if (param && param.key) {
                            let paramValue = param.value || '';
                            console.log(`Before substitution: param ${param.key} = ${paramValue}`);

                            // Apply variable substitution to param value
                            paramValue = substituteVariables(paramValue, variables, totpCode);

                            console.log(`After substitution: param ${param.key} = ${paramValue}`);
                            formattedOptions.queryParams[param.key] = paramValue;
                            console.log(`Added test query param: ${param.key} = ${paramValue}`);
                        }
                    });
                } else if (typeof requestOptions.queryParams === 'object' && requestOptions.queryParams !== null) {
                    console.log("Processing query params object for test request:", requestOptions.queryParams);
                    console.log("Available variables for substitution:", JSON.stringify(variables));

                    Object.entries(requestOptions.queryParams).forEach(([key, value]) => {
                        let paramValue = value || '';
                        console.log(`Before substitution: param ${key} = ${paramValue}`);

                        // Apply variable substitution to param value
                        paramValue = substituteVariables(paramValue, variables, totpCode);

                        console.log(`After substitution: param ${key} = ${paramValue}`);
                        formattedOptions.queryParams[key] = paramValue;
                    });
                }
            }

            // Process body for variable substitution
            if (requestOptions.body) {
                let bodyContent = requestOptions.body;
                if (typeof bodyContent === 'string') {
                    console.log(`Body before substitution: ${bodyContent.substring(0, 50)}...`);
                    // Apply variable substitution to body content
                    bodyContent = substituteVariables(bodyContent, variables, totpCode);
                    console.log(`Body after substitution: ${bodyContent.substring(0, 50)}...`);
                    formattedOptions.body = bodyContent;
                    console.log(`Variable substitution in test request body`);
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

            console.log("Formatted test request options:", {
                ...formattedOptions,
                headers: Object.keys(formattedOptions.headers).length > 0 ? "headers present" : "no headers",
                queryParams: Object.keys(formattedOptions.queryParams).length > 0 ? "params present" : "no params",
                body: formattedOptions.body ? "body present" : "no body"
            });

            const responseJson = await window.electronAPI.makeHttpRequest(url, method, formattedOptions);
            console.log("Test response:", responseJson.substring(0, 200) + "...");

            // Parse response to get body
            const response = parseJSON(responseJson);
            if (!response) {
                return responseJson;
            }

            const bodyContent = response.body || '';
            const headers = response.headers || {};
            console.log("Body content (test):", bodyContent ? bodyContent.substring(0, 200) + "..." : "empty");
            console.log("Headers received (test):", headers);

            // If no JSON filter is enabled, return raw response
            if (!jsonFilter || jsonFilter.enabled !== true || !jsonFilter.path) {
                console.log("No JSON filter applied to test request");
                return responseJson;
            }

            // Apply filter if enabled
            try {
                console.log("Applying JSON filter to test response");

                if (!bodyContent) {
                    return responseJson;
                }

                const filteredContent = applyJsonFilter(bodyContent, jsonFilter);
                console.log("Filtered test content:", filteredContent);

                // Create new response with filtered content, original body, and headers
                const filteredResponse = {
                    ...response,
                    body: filteredContent,
                    filteredWith: jsonFilter.path,
                    originalResponse: bodyContent,  // Changed from originalBody to originalResponse for consistency
                    headers: headers
                };

                return JSON.stringify(filteredResponse, null, 2);
            } catch (error) {
                console.error("Error filtering test response:", error);
                return responseJson;
            }
        } catch (error) {
            console.error("Test request error:", error);
            throw error;
        }
    }, [parseJSON, applyJsonFilter]);
    /**
     * Cancel a refresh timer and ensure all resources are properly cleaned up
     * Returns true if a timer was found and cancelled, false otherwise
     */
    const cancelRefresh = useCallback((sourceId) => {
        // Get the timer reference from our map
        const timer = refreshTimers.current.get(sourceId);

        if (timer) {
            // Clear both timeout and interval to be safe
            // This ensures we catch all timer types
            clearTimeout(timer);
            clearInterval(timer);

            // Remove from our map
            refreshTimers.current.delete(sourceId);

            console.log(`Cancelled refresh timer for source ${sourceId}`);
            return true;
        } else {
            console.log(`No active timer found for source ${sourceId}`);
            return false;
        }
    }, []);

    /**
     * Helper function to cancel all refresh timers
     * Useful for component unmount or app shutdown
     */
    const cancelAllRefreshes = useCallback(() => {
        const timerCount = refreshTimers.current.size;

        if (timerCount > 0) {
            console.log(`Cancelling all ${timerCount} active refresh timers`);

            // Clear all timers
            for (const [sourceId, timer] of refreshTimers.current.entries()) {
                clearTimeout(timer);
                clearInterval(timer);
                console.log(`Cancelled timer for source ${sourceId}`);
            }

            // Clear the map
            refreshTimers.current.clear();
            return timerCount;
        }

        return 0;
    }, []);

    /**
     * Set up auto-refresh for HTTP sources
     */
    const setupRefresh = useCallback((
        sourceId,
        url,
        method,
        requestOptions,
        refreshOptions,
        jsonFilter,
        onUpdate
    ) => {
        // Cancel any existing refresh
        cancelRefresh(sourceId);

        // Only proceed if interval > 0
        if (!refreshOptions || refreshOptions.interval <= 0) {
            console.log(`Skipping refresh setup for source ${sourceId} - interval is zero or not specified`);
            return;
        }

        console.log(`Setting up refresh for source ${sourceId} with interval ${refreshOptions.interval} minutes`);

        const now = Date.now();
        const intervalMs = refreshOptions.interval * 60 * 1000;

        // Determine when next refresh should happen
        let nextRefresh = refreshOptions.nextRefresh;

        // IMPORTANT FIX #3: Check if preserveTiming is explicitly disabled first
        const explicitlyDisablePreserveTiming = refreshOptions.preserveTiming === false;

        // If preserveTiming is explicitly disabled, we should NOT preserve timing
        if (explicitlyDisablePreserveTiming) {
            // Force a fresh timing calculation
            nextRefresh = now + intervalMs;
            console.log(`Source ${sourceId} requires fresh timing because preserveTiming=false - next refresh in ${Math.round(intervalMs / 1000)} seconds`);
        }
        // Otherwise, continue with normal logic
        else {
            // If we should NOT refresh immediately, set nextRefresh to future time
            // This check prevents the immediate refresh when setting up a refresh
            const skipImmediateRefresh = refreshOptions.skipImmediateRefresh === true;

            // Check for preserveTiming flag - this takes precedence over skipImmediateRefresh
            const preserveTiming = refreshOptions.preserveTiming === true;

            // IMPORTANT NEW FIX: Check if this request uses TOTP authentication
            // If TOTP is used, we should always skip immediate refresh to avoid TOTP reuse
            const hasTOTPAuth = requestOptions && requestOptions.totpSecret &&
                (requestOptions.body?.includes('_TOTP_CODE') ||
                    url.includes('_TOTP_CODE') ||
                    Object.values(requestOptions.headers || {}).some(val =>
                        typeof val === 'string' && val.includes('_TOTP_CODE')
                    ));

            // Force skipImmediateRefresh if using TOTP
            const shouldSkipImmediate = skipImmediateRefresh || hasTOTPAuth;

            if (hasTOTPAuth) {
                console.log(`Source ${sourceId} uses TOTP authentication - forcing skip of immediate refresh to prevent TOTP reuse`);
            }

            console.log(`Source ${sourceId} configuration: skipImmediateRefresh=${shouldSkipImmediate}, preserveTiming=${preserveTiming}`);

            // Check if we have a valid nextRefresh time
            const hasValidNextRefresh = nextRefresh && nextRefresh > now;

            if (!hasValidNextRefresh) {
                if (shouldSkipImmediate || preserveTiming) {
                    // If we should skip the immediate refresh, schedule for future
                    nextRefresh = now + intervalMs;
                    console.log(`Source ${sourceId} immediate refresh skipped - next refresh in ${Math.round(intervalMs / 1000)} seconds`);
                } else {
                    // Schedule immediate refresh
                    nextRefresh = now;
                    console.log(`Source ${sourceId} needs immediate refresh - scheduling now`);
                }
            } else {
                // We have a valid future time for nextRefresh
                console.log(`Source ${sourceId} has valid nextRefresh time: ${new Date(nextRefresh).toISOString()}`);
                const timeUntilNextRefresh = Math.round((nextRefresh - now) / 1000);
                console.log(`Source ${sourceId} will refresh in ${timeUntilNextRefresh} seconds (${Math.round(timeUntilNextRefresh/60)} minutes)`);
            }
        }

        // IMPORTANT: Handle case when the nextRefresh time is in the past
        if (nextRefresh <= now) {
            console.log(`Source ${sourceId} nextRefresh time (${new Date(nextRefresh).toISOString()}) is in the past, performing immediate refresh...`);

            // Add a small delay before executing the refresh to ensure the component is fully mounted
            // This helps prevent race conditions during app startup
            const timer = setTimeout(() => {
                console.log(`Executing delayed immediate refresh for source ${sourceId}`);
                executeRefresh();
            }, 1000); // 1 second delay

            refreshTimers.current.set(sourceId, timer);
        } else {
            // Set up a timer for future refresh
            const timeUntilRefresh = nextRefresh - now;
            console.log(`Source ${sourceId} next refresh in ${Math.round(timeUntilRefresh / 1000)} seconds`);

            // Set up initial timer (single execution)
            const timer = setTimeout(executeRefresh, timeUntilRefresh);
            refreshTimers.current.set(sourceId, timer);
        }

        // Function to execute a refresh and then set up a regular interval
        async function executeRefresh() {
            try {
                console.log(`Executing refresh for source ${sourceId}`);

                // Store a flag to identify if this is a recurring interval
                let isRecurringInterval = false;

                // Perform refresh
                const { content, originalResponse, headers } = await request(
                    sourceId,
                    url,
                    method,
                    requestOptions,
                    jsonFilter
                );

                // Update content and set up next refresh time
                if (onUpdate) {
                    const updatedTimestamp = Date.now();
                    const nextRefreshTime = updatedTimestamp + intervalMs;

                    onUpdate(sourceId, content, {
                        originalResponse,
                        headers,
                        refreshOptions: {
                            ...refreshOptions,
                            lastRefresh: updatedTimestamp,
                            nextRefresh: nextRefreshTime,
                            // Remove preserveTiming flag after the first refresh
                            preserveTiming: false
                        }
                    });

                    // Set up regular interval if not already
                    if (!isRecurringInterval) {
                        isRecurringInterval = true;

                        // Clear any existing timer for this source
                        cancelRefresh(sourceId);

                        // Set up new interval timer
                        const regularTimer = setInterval(executeRecurringRefresh, intervalMs);
                        refreshTimers.current.set(sourceId, regularTimer);

                        console.log(`Set up recurring refresh interval for source ${sourceId} every ${refreshOptions.interval} minutes`);
                    }
                }
            } catch (error) {
                console.error(`Error during refresh for source ${sourceId}:`, error);
                if (onUpdate) {
                    // Always update refresh timestamps even on error to prevent getting stuck
                    const errorTimestamp = Date.now();
                    onUpdate(sourceId, `Error: ${error.message}`, {
                        refreshOptions: {
                            ...refreshOptions,
                            lastRefresh: errorTimestamp,
                            nextRefresh: errorTimestamp + intervalMs,
                            preserveTiming: false
                        }
                    });

                    // Set up regular interval timer even after error
                    cancelRefresh(sourceId);
                    const regularTimer = setInterval(executeRecurringRefresh, intervalMs);
                    refreshTimers.current.set(sourceId, regularTimer);

                    console.log(`Set up recurring refresh interval after error for source ${sourceId}`);
                }
            }
        }

        // Separate function for recurring refresh to avoid nesting callbacks
        async function executeRecurringRefresh() {
            try {
                console.log(`Executing scheduled refresh for source ${sourceId}`);
                const { content, originalResponse, headers } = await request(
                    sourceId,
                    url,
                    method,
                    requestOptions,
                    jsonFilter
                );

                if (onUpdate) {
                    const updatedTimestamp = Date.now();
                    const nextRefreshTime = updatedTimestamp + intervalMs;

                    onUpdate(sourceId, content, {
                        originalResponse,
                        headers,
                        refreshOptions: {
                            ...refreshOptions,
                            lastRefresh: updatedTimestamp,
                            nextRefresh: nextRefreshTime,
                            preserveTiming: false
                        }
                    });
                }
            } catch (error) {
                console.error(`Error during scheduled refresh for source ${sourceId}:`, error);
                if (onUpdate) {
                    // Always update refresh timestamps even on error to prevent getting stuck
                    const errorTimestamp = Date.now();
                    onUpdate(sourceId, `Error: ${error.message}`, {
                        refreshOptions: {
                            ...refreshOptions,
                            lastRefresh: errorTimestamp,
                            nextRefresh: errorTimestamp + intervalMs,
                            preserveTiming: false
                        }
                    });
                }
            }
        }

        return () => cancelRefresh(sourceId);
    }, [request, cancelRefresh]);

    return {
        request,
        setupRefresh,
        cancelRefresh,
        cancelAllRefreshes,
        testRequest,
        applyJsonFilter
    };
}