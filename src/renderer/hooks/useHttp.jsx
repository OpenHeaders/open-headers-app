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
            for (const timer of refreshTimers.current.values()) {
                clearTimeout(timer);
                clearInterval(timer);
            }
            refreshTimers.current.clear();
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
     * Apply JSON filter to a response body
     */
    const applyJsonFilter = useCallback((body, jsonFilter) => {
        // Log for debugging
        console.log("Applying JSON filter:", jsonFilter, "to body:", typeof body === 'string' ? body.substring(0, 100) + '...' : body);

        if (!jsonFilter || !jsonFilter.enabled || !jsonFilter.path) {
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

            // Extract path (remove 'root.' prefix if present)
            const path = jsonFilter.path.startsWith('root.')
                ? jsonFilter.path.substring(5)
                : jsonFilter.path;

            if (!path) return body;

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
                        return `Path '${jsonFilter.path}' not found (property '${propName}' is missing)`;
                    }

                    if (!Array.isArray(current[propName])) {
                        return `Path '${jsonFilter.path}' is invalid ('${propName}' is not an array)`;
                    }

                    const idx = parseInt(index, 10);
                    if (idx >= current[propName].length) {
                        return `Path '${jsonFilter.path}' is invalid (index ${idx} out of bounds)`;
                    }

                    current = current[propName][idx];
                } else {
                    console.log(`Processing object part: ${part}`);
                    if (current[part] === undefined) {
                        return `Path '${jsonFilter.path}' not found (property '${part}' is missing)`;
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
            return `Error applying filter: ${error.message}`;
        }
    }, [parseJSON]);

    /**
     * Make HTTP request
     */
    const request = useCallback(async (
        sourceId,
        url,
        method = 'GET',
        requestOptions = {},
        jsonFilter = { enabled: false, path: '' }
    ) => {
        try {
            console.log("Making HTTP request:", {
                sourceId,
                url,
                method,
                requestOptions: {
                    ...requestOptions,
                    headers: requestOptions.headers || [],
                    queryParams: requestOptions.queryParams || []
                },
                jsonFilter
            });

            // Ensure headers are properly formatted
            const formattedOptions = {
                ...requestOptions,
                headers: {},
                queryParams: {}
            };

            // Process headers from array format to object
            if (Array.isArray(requestOptions.headers)) {
                console.log("Processing headers array:", requestOptions.headers);
                requestOptions.headers.forEach(header => {
                    if (header && header.key) {
                        formattedOptions.headers[header.key] = header.value || '';
                        console.log(`Added header: ${header.key} = ${formattedOptions.headers[header.key]}`);
                    }
                });
            } else if (typeof requestOptions.headers === 'object' && requestOptions.headers !== null) {
                // Headers are already in object format
                formattedOptions.headers = requestOptions.headers;
                console.log("Headers already in object format:", formattedOptions.headers);
            }

            // Process query params from array format to object
            if (Array.isArray(requestOptions.queryParams)) {
                requestOptions.queryParams.forEach(param => {
                    if (param && param.key) {
                        formattedOptions.queryParams[param.key] = param.value || '';
                    }
                });
            }

            console.log("Formatted request options:", formattedOptions);

            // Make request
            const responseJson = await window.electronAPI.makeHttpRequest(url, method, formattedOptions);
            console.log("Raw response:", responseJson.substring(0, 200) + "...");

            // Parse response
            const response = parseJSON(responseJson);
            if (!response) {
                throw new Error('Invalid response format');
            }

            // Extract body
            const bodyContent = response.body || '';
            console.log("Body content (original):", bodyContent ? bodyContent.substring(0, 200) + "..." : "empty");

            // Apply JSON filter if enabled
            let finalContent = bodyContent;
            if (jsonFilter && jsonFilter.enabled && jsonFilter.path && bodyContent) {
                console.log("Applying JSON filter to response body");
                finalContent = applyJsonFilter(bodyContent, jsonFilter);
                console.log("Filtered content:", finalContent ? finalContent.substring(0, 200) + "..." : "empty");
            }

            return {
                content: finalContent,
                originalJson: bodyContent
            };
        } catch (error) {
            console.error("HTTP request error:", error);
            throw error;
        }
    }, [parseJSON, applyJsonFilter]);

    /**
     * Set up auto-refresh for HTTP sources - This is the updated version of the function in useHttp.jsx
     */
    /**
     * Set up auto-refresh for HTTP sources - This is the updated version of the function in useHttp.jsx
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
            return;
        }

        console.log(`Setting up refresh for source ${sourceId} with interval ${refreshOptions.interval} minutes`);

        const now = Date.now();
        const intervalMs = refreshOptions.interval * 60 * 1000;

        // Determine when next refresh should happen
        let nextRefresh = refreshOptions.nextRefresh;

        // If we should NOT refresh immediately, set nextRefresh to future time
        // This check prevents the immediate refresh when setting up a refresh
        const skipImmediateRefresh = refreshOptions.skipImmediateRefresh === true;

        console.log(`Source ${sourceId} skipImmediateRefresh: ${skipImmediateRefresh}`);

        // Check for invalid or expired nextRefresh time
        if (!nextRefresh || nextRefresh <= now) {
            if (skipImmediateRefresh) {
                // If we should skip the immediate refresh, schedule for future
                nextRefresh = now + intervalMs;
                console.log(`Source ${sourceId} immediate refresh skipped - next refresh in ${Math.round(intervalMs / 1000)} seconds`);
            } else {
                // Schedule immediate refresh
                nextRefresh = now;
                console.log(`Source ${sourceId} needs immediate refresh - scheduling now`);
            }
        }

        const timeUntilRefresh = Math.max(0, nextRefresh - now);

        console.log(`Source ${sourceId} next refresh in ${Math.round(timeUntilRefresh / 1000)} seconds`);

        // Set up initial timer
        const timer = setTimeout(async () => {
            try {
                console.log(`Executing refresh for source ${sourceId}`);
                // Perform refresh
                const { content, originalJson } = await request(
                    sourceId,
                    url,
                    method,
                    requestOptions,
                    jsonFilter
                );

                // Update content
                if (onUpdate) {
                    // Include the next refresh time in the update
                    const updatedTimestamp = Date.now();
                    const nextRefreshTime = updatedTimestamp + intervalMs;

                    onUpdate(sourceId, content, {
                        originalJson,
                        refreshOptions: {
                            ...refreshOptions,
                            lastRefresh: updatedTimestamp,
                            nextRefresh: nextRefreshTime
                        }
                    });
                }

                // Set up regular interval
                const regularTimer = setInterval(async () => {
                    try {
                        console.log(`Executing scheduled refresh for source ${sourceId}`);
                        const { content, originalJson } = await request(
                            sourceId,
                            url,
                            method,
                            requestOptions,
                            jsonFilter
                        );

                        if (onUpdate) {
                            // Include the next refresh time in the update
                            const updatedTimestamp = Date.now();
                            const nextRefreshTime = updatedTimestamp + intervalMs;

                            onUpdate(sourceId, content, {
                                originalJson,
                                refreshOptions: {
                                    ...refreshOptions,
                                    lastRefresh: updatedTimestamp,
                                    nextRefresh: nextRefreshTime
                                }
                            });
                        }
                    } catch (error) {
                        console.error(`Error during auto-refresh for source ${sourceId}:`, error);
                        if (onUpdate) {
                            onUpdate(sourceId, `Error: ${error.message}`);
                        }
                    }
                }, intervalMs);

                // Store new timer
                refreshTimers.current.set(sourceId, regularTimer);
            } catch (error) {
                console.error(`Error during initial refresh for source ${sourceId}:`, error);
                if (onUpdate) {
                    onUpdate(sourceId, `Error: ${error.message}`);

                    // Even if there was an error, we need to update the refresh timestamps
                    // to prevent getting stuck in a loop
                    onUpdate(sourceId, `Error: ${error.message}`, {
                        refreshOptions: {
                            ...refreshOptions,
                            lastRefresh: Date.now(),
                            nextRefresh: Date.now() + intervalMs
                        }
                    });
                }
            }
        }, timeUntilRefresh);

        // Store timer reference
        refreshTimers.current.set(sourceId, timer);

        return () => cancelRefresh(sourceId);
    }, [request, cancelRefresh]);

    /**
     * Cancel a refresh timer
     */
    const cancelRefresh = useCallback((sourceId) => {
        const timer = refreshTimers.current.get(sourceId);
        if (timer) {
            clearTimeout(timer);
            clearInterval(timer);
            refreshTimers.current.delete(sourceId);
            console.log(`Cancelled refresh timer for source ${sourceId}`);
            return true;
        }
        return false;
    }, []);

    /**
     * Test HTTP request (used for UI testing)
     */
    const testRequest = useCallback(async (url, method, requestOptions, jsonFilter) => {
        try {
            console.log("Testing HTTP request:", {
                url,
                method,
                requestOptions,
                jsonFilter
            });

            // Ensure headers are properly formatted
            const formattedOptions = {
                ...requestOptions,
                headers: {},
                queryParams: {}
            };

            // Process headers from array format to object
            if (Array.isArray(requestOptions.headers)) {
                console.log("Processing headers for test request:", requestOptions.headers);
                requestOptions.headers.forEach(header => {
                    if (header && header.key) {
                        formattedOptions.headers[header.key] = header.value || '';
                        console.log(`Added test header: ${header.key} = ${formattedOptions.headers[header.key]}`);
                    }
                });
            } else if (typeof requestOptions.headers === 'object' && requestOptions.headers !== null) {
                // Headers are already in object format
                formattedOptions.headers = requestOptions.headers;
                console.log("Test headers already in object format:", formattedOptions.headers);
            }

            // Process query params from array format to object
            if (Array.isArray(requestOptions.queryParams)) {
                requestOptions.queryParams.forEach(param => {
                    if (param && param.key) {
                        formattedOptions.queryParams[param.key] = param.value || '';
                    }
                });
            }

            console.log("Formatted test request options:", formattedOptions);

            const responseJson = await window.electronAPI.makeHttpRequest(url, method, formattedOptions);
            console.log("Test response:", responseJson.substring(0, 200) + "...");

            // Parse response to get body
            const response = parseJSON(responseJson);
            if (!response) {
                return responseJson;
            }

            const bodyContent = response.body || '';
            console.log("Body content (test):", bodyContent ? bodyContent.substring(0, 200) + "..." : "empty");

            // If no JSON filter, return raw response
            if (!jsonFilter || !jsonFilter.enabled || !jsonFilter.path) {
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

                // Create new response with filtered content and original body
                const filteredResponse = {
                    ...response,
                    body: filteredContent,
                    filteredWith: jsonFilter.path,
                    originalBody: bodyContent // Add originalBody to preserve it for display
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

    return {
        request,
        setupRefresh,
        cancelRefresh,
        testRequest,
        applyJsonFilter
    };
}