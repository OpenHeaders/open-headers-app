import { useCallback } from 'react';

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
            console.error('Error parsing JSON:', error);
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

            // Check if this is an error response
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
                        console.error(`Path '${normalizedFilter.path}' not found (property '${propName}' is missing)`);
                        return `The field "${path}" was not found in the response.`;
                    }

                    if (!Array.isArray(current[propName])) {
                        console.error(`Path '${normalizedFilter.path}' is invalid ('${propName}' is not an array)`);
                        return `The field "${propName}" exists but is not an array.`;
                    }

                    const idx = parseInt(index, 10);
                    if (idx >= current[propName].length) {
                        console.error(`Path '${normalizedFilter.path}' is invalid (index ${idx} out of bounds)`);
                        return `The array index [${idx}] is out of bounds.`;
                    }

                    current = current[propName][idx];
                } else {
                    console.log(`Processing object part: ${part}`);
                    if (current[part] === undefined) {
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
            return `Could not filter response: ${error.message}`;
        }
    }, [parseJSON]);

    /**
     * Substitute variables in text
     */
    const substituteVariables = useCallback((text, variables, totpCode = null) => {
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
                    jsonFilter: JSON.stringify(normalizedJsonFilter),
                    retryAttempt: retryAttempt
                });

                // Store variables array explicitly and make a deep copy
                const variables = Array.isArray(requestOptions.variables)
                    ? JSON.parse(JSON.stringify(requestOptions.variables))
                    : [];

                console.log(`Source ${sourceId} has ${variables.length} variables for substitution`);

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
                console.log("Full requestOptions from form:", JSON.stringify(requestOptions || {}, null, 2));
                console.log("Query params from form:", requestOptions?.queryParams);

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
                console.log("Query params after formatting:", formattedOptions.queryParams);

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

                // Make request with retry tracking
                console.log(`Making HTTP request for source ${sourceId} (attempt ${retryAttempt + 1})`);
                const responseJson = await window.electronAPI.makeHttpRequest(url, method, formattedOptions);
                console.log("Raw response:", responseJson.substring(0, 200) + "...");

                // Process response
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

                return {
                    content: finalContent,
                    originalResponse: bodyContent,
                    headers: headers,
                    rawResponse: responseJson
                };
            } catch (error) {
                // Improved error handling with specific retry for network errors
                console.error(`HTTP request error (attempt ${retryAttempt + 1}):`, error);

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
                    console.log(`Retrying request for source ${sourceId} (attempt ${retryAttempt + 1} of ${MAX_CLIENT_RETRIES + 1})`);

                    // Calculate exponential backoff delay with jitter
                    const backoffDelay = Math.min(
                        2000 * Math.pow(2, retryAttempt - 1) + Math.random() * 1000,
                        30000 // Max 30 seconds
                    );

                    console.log(`Waiting ${Math.round(backoffDelay)}ms before retry`);

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
                    originalResponse: bodyContent,
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
    }, [parseJSON, applyJsonFilter, substituteVariables]);

    return {
        request,
        testRequest,
        applyJsonFilter
    };
}