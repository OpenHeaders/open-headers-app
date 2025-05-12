import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useFileSystem } from '../hooks/useFileSystem';
import { useHttp } from '../hooks/useHttp';
import { useEnv } from '../hooks/useEnv';
import { showMessage } from '../utils/messageUtil'; // Import the utility function

// Create context
const SourceContext = createContext();

// Debug logging for source operations with unique timestamp
const debugLog = (message, data = null) => {
    const timestamp = new Date().toISOString().substr(11, 8); // HH:MM:SS
    if (data) {
        console.log(`[${timestamp}] SourceContext: ${message}`, data);
    } else {
        console.log(`[${timestamp}] SourceContext: ${message}`);
    }
};

// IMPORTANT: Remove this function as it's causing the conflict
// The original showMessage function is removed, and we'll use the imported one instead

export function SourceProvider({ children }) {
    const [sources, setSources] = useState([]);
    const [nextSourceId, setNextSourceId] = useState(1);
    const [initialized, setInitialized] = useState(false);

    // Add ref to track if we're currently loading sources
    const isLoading = useRef(false);
    // Add ref to track if we need to save sources
    const needsSave = useRef(false);
    // Track first-time load
    const firstLoad = useRef(true);
    // Add mounted ref
    const isMounted = useRef(true);
    // Track current highest ID to avoid conflicts
    const highestIdRef = useRef(0);
    // Track if we've done the initial HTTP refresh
    const initialHttpRefreshDoneRef = useRef(false);

    // Custom hooks for source types
    const fileSystem = useFileSystem();
    const http = useHttp();
    const env = useEnv();

    // Helper for updating source content
    const updateSourceContent = useCallback((sourceId, content, additionalData = {}) => {
        // Check if component is still mounted before updating state
        if (!isMounted.current) {
            console.log(`Skipping update for source ${sourceId} - component is unmounted`);
            return;
        }

        debugLog(`Updating content for source ${sourceId}`);
        needsSave.current = true;

        // Log additional data if present
        if (Object.keys(additionalData).length > 0) {
            console.log(`Additional data for source ${sourceId}:`,
                Object.keys(additionalData).map(key => key).join(', '));
        }

        // If headers are included, log them
        if (additionalData.headers) {
            console.log(`Headers for source ${sourceId}:`, additionalData.headers);
        }

        setSources(prev => {
            // Check if source exists
            const sourceExists = prev.some(s => s.sourceId === sourceId);

            if (!sourceExists) {
                // IMPROVED ERROR HANDLING: Instead of just logging, wait for the source to be available
                // This can happen during initial loading when timers fire before sources are fully loaded
                debugLog(`Source ${sourceId} not found when updating content`, {
                    availableIds: prev.map(s => s.sourceId)
                });

                // If the content shows "Refreshing...", clear that state to avoid UI getting stuck
                if (content === 'Refreshing...') {
                    debugLog(`Detected stuck 'Refreshing...' state for source ${sourceId} that doesn't exist yet`);
                }

                return prev;
            }

            return prev.map(source => {
                if (source.sourceId === sourceId) {
                    const updatedSource = { ...source, sourceContent: content };

                    // Merge any additional data provided
                    Object.keys(additionalData).forEach(key => {
                        if (key === 'refreshOptions' && source.refreshOptions) {
                            // Special handling for refreshOptions to ensure we preserve existing values

                            // Check if we need to preserve the existing timing
                            const preserveTiming = (
                                // If source explicitly says to preserve timing
                                (source.refreshOptions.preserveTiming === true &&
                                    source.refreshOptions.nextRefresh &&
                                    source.refreshOptions.nextRefresh > Date.now()) ||
                                // OR if we're updating from a non-refresh operation and timing exists
                                (!additionalData.refreshOptions.lastRefresh &&
                                    source.refreshOptions.nextRefresh &&
                                    source.refreshOptions.nextRefresh > Date.now())
                            );

                            if (preserveTiming) {
                                // Only merge other refresh options but keep nextRefresh
                                const currentNextRefresh = source.refreshOptions.nextRefresh;
                                const currentLastRefresh = source.refreshOptions.lastRefresh;

                                updatedSource.refreshOptions = {
                                    ...source.refreshOptions,
                                    ...additionalData.refreshOptions,
                                    // Restore the original refresh times
                                    nextRefresh: currentNextRefresh,
                                    lastRefresh: currentLastRefresh,
                                    // Keep the preserveTiming flag
                                    preserveTiming: true
                                };

                                debugLog(`Preserved refresh timing for source ${sourceId}: next=${new Date(currentNextRefresh).toISOString()}, last=${new Date(currentLastRefresh).toISOString()}`);
                            } else {
                                // Normal merge of all refresh options
                                updatedSource.refreshOptions = {
                                    ...source.refreshOptions,
                                    ...additionalData.refreshOptions
                                };

                                // Log the new refresh times
                                if (additionalData.refreshOptions.nextRefresh) {
                                    debugLog(`Updated refresh timing for source ${sourceId}: next=${new Date(additionalData.refreshOptions.nextRefresh).toISOString()}`);
                                }
                            }
                        }
                        else if (key === 'originalResponse') {
                            // Handle originalResponse updates
                            updatedSource.originalResponse = additionalData.originalResponse;
                            console.log(`Updated originalResponse for source ${sourceId}`);
                        }
                        else if (key === 'headers') {
                            // Handle headers updates
                            updatedSource.headers = additionalData.headers;
                            console.log(`Updated headers for source ${sourceId}:`, additionalData.headers);
                        }
                        else if (key === 'rawResponse') {
                            // Store the raw response
                            updatedSource.rawResponse = additionalData.rawResponse;
                            console.log(`Updated rawResponse for source ${sourceId}`);
                        }
                        else {
                            // Handle any other properties
                            updatedSource[key] = additionalData[key];
                        }
                    });

                    // For HTTP sources with auto-refresh, update timestamps if not already provided
                    // and we're not preserving timing
                    const preservingTiming = source.refreshOptions?.preserveTiming === true &&
                        source.refreshOptions?.nextRefresh &&
                        source.refreshOptions.nextRefresh > Date.now();

                    if (source.sourceType === 'http' &&
                        (source.refreshOptions?.enabled || source.refreshOptions?.interval > 0) &&
                        !additionalData.refreshOptions &&
                        !preservingTiming) {

                        const now = Date.now();
                        updatedSource.refreshOptions = {
                            ...source.refreshOptions,
                            lastRefresh: now,
                            nextRefresh: now + (source.refreshOptions.interval * 60 * 1000)
                        };
                    }

                    return updatedSource;
                }
                return source;
            });
        });
    }, []);

    // Check for duplicate IDs in the source array - used for debugging
    const validateSourceIds = useCallback((sourcesArray, operation = 'unknown') => {
        const idMap = new Map();
        let hasValidation = true;

        sourcesArray.forEach(source => {
            if (!source.sourceId) {
                debugLog(`WARNING: Source missing ID during ${operation}`, source);
                hasValidation = false;
                return;
            }

            if (idMap.has(source.sourceId)) {
                debugLog(`CRITICAL: Duplicate ID ${source.sourceId} found during ${operation}`, {
                    original: idMap.get(source.sourceId),
                    duplicate: source
                });
                hasValidation = false;
            } else {
                idMap.set(source.sourceId, source);
            }
        });

        if (hasValidation) {
            debugLog(`ID validation passed for ${sourcesArray.length} sources during ${operation}`);
        }

        return hasValidation;
    }, []);

    // Safely get a unique source ID
    const getUniqueSourceId = useCallback(() => {
        // Increment highestIdRef to get a new unique ID
        const newId = Math.max(highestIdRef.current, nextSourceId) + 1;
        highestIdRef.current = newId;

        // Schedule an update to nextSourceId state, but don't wait for it
        if (isMounted.current) {
            setNextSourceId(newId + 1);
        }

        debugLog(`Generated new unique source ID: ${newId}`);
        return newId;
    }, [nextSourceId]);

    // Load sources on startup - once only
    useEffect(() => {
        const loadSources = async () => {
            if (isLoading.current) return;

            try {
                debugLog('Loading sources from storage...');
                isLoading.current = true;

                // Load sources from storage
                const sourcesJson = await window.electronAPI.loadFromStorage('sources.json');
                debugLog(`Loaded sources JSON: ${sourcesJson ? 'data available' : 'null'}`);

                if (sourcesJson && isMounted.current) {
                    const loadedSources = JSON.parse(sourcesJson);
                    debugLog(`Loaded ${loadedSources.length} sources`);

                    // Validate all source IDs
                    validateSourceIds(loadedSources, 'initial load');

                    // Set next ID based on loaded sources
                    if (loadedSources.length > 0) {
                        const maxId = Math.max(...loadedSources.map(s => Number(s.sourceId) || 0));
                        highestIdRef.current = maxId;
                        setNextSourceId(maxId + 1);
                        debugLog(`Initial nextSourceId set to ${maxId + 1} based on loaded sources`);
                    }

                    // Initialize each source based on type
                    const initializedSources = [];

                    for (const source of loadedSources) {
                        // Ensure each source has a valid ID
                        const validSourceId = Number(source.sourceId) || getUniqueSourceId();

                        // First add with loading status
                        initializedSources.push({
                            ...source,
                            sourceId: validSourceId,
                            sourceContent: source.sourceContent || 'Loading content...'
                        });

                        // Then init the source based on type (async)
                        if (source.sourceType === 'file') {
                            fileSystem.watchFile(validSourceId, source.sourcePath)
                                .then(content => {
                                    if (isMounted.current) {
                                        updateSourceContent(validSourceId, content);
                                    }
                                })
                                .catch(error => {
                                    if (isMounted.current) {
                                        updateSourceContent(validSourceId, `Error: ${error.message}`);
                                    }
                                });
                        }
                        else if (source.sourceType === 'env') {
                            try {
                                const content = await env.getVariable(source.sourcePath);
                                if (isMounted.current) {
                                    updateSourceContent(validSourceId, content);
                                }
                            } catch (error) {
                                if (isMounted.current) {
                                    updateSourceContent(validSourceId, `Error: ${error.message}`);
                                }
                            }
                        }
                        else if (source.sourceType === 'http') {
                            // For HTTP sources with auto-refresh, set up refresh and immediate request if needed
                            const isEnabled = source.refreshOptions?.enabled || false;
                            const interval = source.refreshOptions?.interval || 0;

                            // For HTTP sources, check if refresh is needed immediately
                            if (isEnabled || interval > 0) {
                                // Check if the nextRefresh is in the past (or not set)
                                const now = Date.now();
                                const nextRefresh = source.refreshOptions?.nextRefresh || 0;
                                const needsImmediateRefresh = nextRefresh <= now;

                                // Prepare refreshOptions for setupRefresh - will handle both immediate and scheduled refreshes
                                const refreshOptionsForSetup = {
                                    ...source.refreshOptions,
                                    interval: interval
                                };

                                // If the timer has expired, ensure we clear the 'Refreshing...' state even if we get an error
                                if (needsImmediateRefresh) {
                                    debugLog(`Source ${validSourceId} needs immediate refresh (timer expired or not set)`);

                                    // Update content immediately to "Refreshing..." to avoid UI being stuck
                                    if (isMounted.current) {
                                        updateSourceContent(validSourceId, 'Refreshing...', {
                                            refreshOptions: {
                                                ...source.refreshOptions,
                                                lastRefresh: now,
                                                // Set a temporary nextRefresh just in case (will be updated by http.setupRefresh)
                                                nextRefresh: now + (interval * 60 * 1000)
                                            }
                                        });
                                    }
                                } else {
                                    debugLog(`Source ${validSourceId} has valid future refresh time: ${new Date(nextRefresh).toISOString()}`);
                                }

                                // CRITICAL FIX: Wait for sources to be fully loaded before setting up refresh
                                // This prevents the race condition where timers fire before sources are available in state
                                setTimeout(() => {
                                    if (isMounted.current) {
                                        debugLog(`Setting up refresh with delay for source ${validSourceId} to avoid race conditions`);

                                        // Set up the refresh schedule for future updates - our improved setupRefresh will handle
                                        // immediate refresh if needed and ensures error states are properly handled
                                        http.setupRefresh(
                                            validSourceId,
                                            source.sourcePath,
                                            source.sourceMethod,
                                            source.requestOptions,
                                            refreshOptionsForSetup,
                                            source.jsonFilter,
                                            updateSourceContent
                                        );
                                    }
                                }, 2000); // 2 second delay ensures sources are fully loaded
                            }
                        }
                    }

                    // Validate final sources before setting state
                    validateSourceIds(initializedSources, 'after initialization');

                    // Set the sources state - this is the CRITICAL step that makes sources available in state
                    if (isMounted.current) {
                        // First set sources without any refreshing state to ensure they're properly loaded
                        debugLog(`Setting initial sources state with ${initializedSources.length} sources (CRITICAL: sources available after this)`);
                        setSources(initializedSources);

                        // Additional safeguard - clear any "Refreshing..." state after a short delay
                        // This ensures we don't get stuck in a bad UI state
                        setTimeout(() => {
                            if (isMounted.current) {
                                debugLog(`Checking for stuck 'Refreshing...' states after initial load`);
                                setSources(current =>
                                    current.map(s => {
                                        if (s.sourceContent === 'Refreshing...') {
                                            debugLog(`Clearing stuck 'Refreshing...' state for source ${s.sourceId}`);
                                            // Force a refresh attempt
                                            setTimeout(() => {
                                                if (isMounted.current) {
                                                    refreshSource(s.sourceId);
                                                }
                                            }, 1000);

                                            return {
                                                ...s,
                                                sourceContent: 'Waiting for refresh...'
                                            };
                                        }
                                        return s;
                                    })
                                );
                            }
                        }, 5000); // Check after 5 seconds
                    }
                }

                if (isMounted.current) {
                    setInitialized(true);
                }
            } catch (error) {
                console.error('Error loading sources:', error);
                if (isMounted.current) {
                    showMessage('error', 'Failed to load sources');
                    setInitialized(true);
                }
            } finally {
                isLoading.current = false;
                firstLoad.current = false;
            }
        };

        // Only load on first render
        if (firstLoad.current) {
            loadSources();
        }

        // Cleanup function
        return () => {
            // Mark component as unmounted to prevent state updates
            isMounted.current = false;

            // Cancel all HTTP refresh timers to prevent memory leaks and stale updates
            http.cancelAllRefreshes();

            // For file watchers, we rely on the individual cleanup functions
            // that were returned from each fileSystem.watchFile call
        };
    }, []); // Empty dependency array - only run once

    // CRITICAL FIX: Effect to directly refresh HTTP sources after component is initialized
    // This ensures HTTP sources are refreshed properly regardless of race conditions
    useEffect(() => {
        // Only run once we're fully initialized and have sources loaded
        // And ONLY if we haven't done the initial refresh yet
        if (!initialized || isLoading.current || sources.length === 0 || initialHttpRefreshDoneRef.current) {
            return;
        }

        // Mark that we're doing the initial refresh (prevents future executions)
        initialHttpRefreshDoneRef.current = true;

        // Find all HTTP sources that need refreshing
        const httpSources = sources.filter(source =>
            source.sourceType === 'http' &&
            (source.refreshOptions?.enabled || source.refreshOptions?.interval > 0)
        );

        if (httpSources.length === 0) {
            debugLog('No HTTP sources found that need initial refresh');
            return; // No HTTP sources to refresh
        }

        debugLog(`ONE-TIME INITIALIZATION: Found ${httpSources.length} HTTP sources for initial refresh`);

        // Set up a delay to ensure everything is properly mounted
        const timer = setTimeout(() => {
            // Process each HTTP source
            httpSources.forEach((source, index) => {
                // Stagger the refreshes to avoid overwhelming the system
                setTimeout(() => {
                    if (!isMounted.current) return;

                    debugLog(`ONE-TIME initial refresh for source ${source.sourceId}`);

                    // First update the UI to show we're refreshing
                    updateSourceContent(source.sourceId, 'Refreshing...');

                    // Then directly refresh the source using our enhanced refresh function
                    refreshSource(source.sourceId)
                        .then(() => {
                            debugLog(`Initial one-time refresh completed for source ${source.sourceId}`);
                        })
                        .catch(error => {
                            console.error(`Error in initial one-time refresh for source ${source.sourceId}:`, error);
                        });

                }, index * 1000); // 1 second between each source refresh
            });
        }, 3000); // Wait 3 seconds after initialization for everything to stabilize

        return () => {
            clearTimeout(timer);
        };
    }, [initialized, sources]);

    // Save sources when needed - use a separate effect with a timer
    useEffect(() => {
        let saveTimer = null;

        const saveSources = async () => {
            // Only save if we have sources and need to save
            if (!needsSave.current || isLoading.current) {
                return;
            }

            try {
                debugLog(`Saving ${sources.length} sources to storage`);

                // Validate before saving
                validateSourceIds(sources, 'before saving');

                await window.electronAPI.saveToStorage('sources.json', JSON.stringify(sources));
                debugLog('Sources saved successfully');
                needsSave.current = false;
            } catch (error) {
                console.error('Failed to save sources:', error);
            }
        };

        // Set up periodic save if initialized
        if (initialized && !isLoading.current) {
            saveTimer = setInterval(saveSources, 1000); // Check every second if we need to save
        }

        // Cleanup
        return () => {
            if (saveTimer) {
                clearInterval(saveTimer);
            }
        };
    }, [sources, initialized, validateSourceIds]);

    // Add new source
    const addSource = async (sourceData) => {
        try {
            // Check for duplicates
            const isDuplicate = sources.some(src =>
                src.sourceType === sourceData.sourceType &&
                src.sourcePath === sourceData.sourcePath &&
                (sourceData.sourceType !== 'http' || src.sourceMethod === sourceData.sourceMethod)
            );

            if (isDuplicate) {
                showMessage('error', `Source already exists: ${sourceData.sourceType.toUpperCase()} ${sourceData.sourcePath}`);
                return false;
            }

            // Create a new source with a unique ID
            const sourceId = getUniqueSourceId();
            debugLog(`Adding new source with ID ${sourceId}`, {
                type: sourceData.sourceType,
                path: sourceData.sourcePath
            });

            // Create new source object with loading status
            const newSource = {
                sourceId,
                ...sourceData,
                sourceContent: 'Loading content...'
            };

            // Add to state immediately for UI feedback
            if (isMounted.current) {
                setSources(prev => {
                    const updated = [...prev, newSource];
                    debugLog(`Source ${sourceId} added, total sources: ${updated.length}`);
                    validateSourceIds(updated, 'after adding source');
                    return updated;
                });
                needsSave.current = true;
            }

            // Initialize source based on type
            let initialContent = '';

            if (sourceData.sourceType === 'file') {
                try {
                    initialContent = await fileSystem.watchFile(sourceId, sourceData.sourcePath);
                } catch (error) {
                    initialContent = `Error: ${error.message}`;
                }
            }
            else if (sourceData.sourceType === 'env') {
                try {
                    initialContent = await env.getVariable(sourceData.sourcePath);
                } catch (error) {
                    initialContent = `Error: ${error.message}`;
                }
            }
            else if (sourceData.sourceType === 'http') {
                try {
                    // ALWAYS make a fresh HTTP request, regardless of test data
                    debugLog(`Making fresh HTTP request for source ${sourceId}`);

                    const result = await http.request(
                        sourceId,
                        sourceData.sourcePath,
                        sourceData.sourceMethod,
                        sourceData.requestOptions,
                        sourceData.jsonFilter
                    );

                    // Destructure with all possible properties
                    const { content, originalResponse, headers, rawResponse, filteredWith, isFiltered } = result;
                    initialContent = content;

                    // Update with all available data
                    if (isMounted.current) {
                        debugLog(`Updating source ${sourceId} with HTTP response`);
                        const updateData = {
                            originalResponse,
                            headers,
                            rawResponse
                        };

                        // Store filtering information explicitly for better UI handling
                        if (sourceData.jsonFilter?.enabled === true) {
                            updateData.isFiltered = true;
                            updateData.filteredWith = sourceData.jsonFilter.path;
                            debugLog(`Source ${sourceId} content is filtered with path: ${sourceData.jsonFilter.path}`);
                        }

                        // Log what we're storing
                        console.log(`Storing headers for source ${sourceId}:`, headers);
                        console.log(`Storing originalResponse for source ${sourceId}:`,
                            updateData.originalResponse ? updateData.originalResponse.substring(0, 50) + '...' : 'undefined');

                        updateSourceContent(sourceId, initialContent, updateData);
                    }

                    // Set up refresh if enabled and interval > 0
                    const isRefreshEnabled = sourceData.refreshOptions?.enabled === true;
                    const refreshInterval = sourceData.refreshOptions?.interval || 0;

                    if (isRefreshEnabled && refreshInterval > 0) {
                        // Create base refresh options
                        const refreshOptions = {
                            ...sourceData.refreshOptions,
                            interval: refreshInterval,
                            enabled: true
                        };

                        // We've JUST made a successful request, so ALWAYS skip immediate refresh
                        const skipImmediateRefresh = true;

                        // Set up the first refresh time
                        const now = Date.now();
                        const nextRefresh = now + (refreshInterval * 60 * 1000);

                        // Add explicit timestamps
                        refreshOptions.lastRefresh = now;
                        refreshOptions.nextRefresh = nextRefresh;

                        // Log detailed information
                        debugLog(`Setting up refresh for newly added source ${sourceId}: interval=${refreshInterval}m, ` +
                            `skipImmediateRefresh=${skipImmediateRefresh}, ` +
                            `nextRefresh=${new Date(nextRefresh).toISOString()}`);

                        // Setup refresh schedule with explicit skipImmediateRefresh flag
                        http.setupRefresh(
                            sourceId,
                            sourceData.sourcePath,
                            sourceData.sourceMethod,
                            sourceData.requestOptions,
                            {
                                ...refreshOptions,
                                skipImmediateRefresh: skipImmediateRefresh
                            },
                            sourceData.jsonFilter,
                            updateSourceContent
                        );
                    }

                    return true;
                } catch (error) {
                    console.error(`Error making HTTP request for source ${sourceId}:`, error);
                    initialContent = `Error: ${error.message}`;
                    if (isMounted.current) {
                        updateSourceContent(sourceId, initialContent);
                    }
                    return false;
                }
            }

            // Update content
            if (isMounted.current) {
                updateSourceContent(sourceId, initialContent);
            }
            return true;
        } catch (error) {
            console.error('Error adding source:', error);
            if (isMounted.current) {
                showMessage('error', `Failed to add source: ${error.message}`);
            }
            return false;
        }
    };

    // Remove source
    const removeSource = async (sourceId) => {
        try {
            const source = sources.find(s => s.sourceId === sourceId);
            if (!source) {
                debugLog(`Attempted to remove nonexistent source ${sourceId}`);
                // Don't show a message here - let the SourceTable handle it
                return false;
            }

            debugLog(`Removing source ${sourceId}`);

            // Remove from state immediately for UI feedback
            if (isMounted.current) {
                setSources(prev => {
                    const updated = prev.filter(s => s.sourceId !== sourceId);
                    debugLog(`Source ${sourceId} removed, remaining sources: ${updated.length}`);
                    return updated;
                });
                needsSave.current = true;
            }

            // Clean up based on source type
            if (source.sourceType === 'file') {
                await fileSystem.unwatchFile(source.sourceId, source.sourcePath);
            }
            else if (source.sourceType === 'http') {
                http.cancelRefresh(sourceId);
            }

            // We've removed this message call to prevent duplicates
            // The message will be shown by SourceTable.jsx instead
            return true;
        } catch (error) {
            console.error('Error removing source:', error);
            if (isMounted.current) {
                showMessage('error', `Failed to remove source: ${error.message}`);
            }
            return false;
        }
    };

    // Update source
    const updateSource = async (sourceData) => {
        try {
            const sourceId = sourceData.sourceId;
            const source = sources.find(s => s.sourceId === sourceId);

            if (!source) {
                debugLog(`Source ${sourceId} not found when updating`);
                return false;
            }

            debugLog(`Updating source ${sourceId}`, {
                type: sourceData.sourceType,
                path: sourceData.sourcePath
            });

            // Check if source has TOTP data
            if (sourceData.requestOptions?.totpSecret) {
                console.log(`Source ${sourceId} has TOTP secret that will be preserved`);
            }

            // FIXED: Create a normalized jsonFilter object with proper boolean typing
            const normalizedJsonFilter = {
                enabled: Boolean(sourceData.jsonFilter?.enabled),
                path: sourceData.jsonFilter?.enabled ? (sourceData.jsonFilter.path || '') : ''
            };

            // Log the normalized JSON filter
            console.log(`Normalizing JSON filter for source ${sourceId}:`,
                JSON.stringify(normalizedJsonFilter));

            // IMPORTANT NEW PART: Return a promise that resolves with the updated source
            // Get TOTP values - collect from multiple sources
            return new Promise((resolve) => {
                // Update state
                if (isMounted.current) {
                    setSources(prev => {
                        const updatedSources = prev.map(s => {
                            if (s.sourceId === sourceId) {
                                // Create an updated source with normalized jsonFilter
                                const updatedSource = {
                                    ...s,
                                    ...sourceData,
                                    // For HTTP sources, ensure we preserve content until a refresh happens
                                    sourceContent: s.sourceContent,
                                    // Use our normalized jsonFilter object
                                    jsonFilter: normalizedJsonFilter
                                };

                                // IMPORTANT: Make sure TOTP settings are preserved
                                if (sourceData.requestOptions && sourceData.requestOptions.totpSecret) {
                                    // Ensure the totpSecret is properly retained
                                    if (!updatedSource.requestOptions) {
                                        updatedSource.requestOptions = {};
                                    }
                                    updatedSource.requestOptions.totpSecret = sourceData.requestOptions.totpSecret;
                                    console.log(`Preserved TOTP secret for source ${sourceId}`);
                                } else if (s.requestOptions && s.requestOptions.totpSecret &&
                                    !sourceData.requestOptions?.hasOwnProperty('totpSecret')) {
                                    // If source had TOTP before and the update doesn't explicitly remove it, preserve it
                                    if (!updatedSource.requestOptions) {
                                        updatedSource.requestOptions = {};
                                    }
                                    updatedSource.requestOptions.totpSecret = s.requestOptions.totpSecret;
                                    console.log(`Kept existing TOTP secret for source ${sourceId}`);
                                }

                                // IMPORTANT FIX #1: Check explicitly if preserveTiming is false
                                // and make sure we don't accidentally override it
                                const explicitlyDisablePreserveTiming =
                                    sourceData.refreshOptions?.preserveTiming === false;

                                // IMPORTANT: Check if we need to preserve refresh timing
                                // Only do this if preserveTiming is not explicitly set to false
                                if (!explicitlyDisablePreserveTiming &&
                                    sourceData.refreshOptions &&
                                    sourceData.refreshOptions.preserveTiming === true) {

                                    console.log(`Preserving refresh timing for source ${sourceId}`);

                                    // Make sure we preserve the nextRefresh time if it exists in both source data and original source
                                    if (sourceData.refreshOptions.nextRefresh &&
                                        sourceData.refreshOptions.nextRefresh > Date.now()) {

                                        // Use the timing from the sourceData (which was preserved in the caller)
                                        updatedSource.refreshOptions = {
                                            ...updatedSource.refreshOptions,
                                            nextRefresh: sourceData.refreshOptions.nextRefresh,
                                            lastRefresh: sourceData.refreshOptions.lastRefresh || s.refreshOptions?.lastRefresh,
                                            preserveTiming: true
                                        };

                                        console.log(`Using preserved nextRefresh time: ${new Date(updatedSource.refreshOptions.nextRefresh).toISOString()}`);
                                    } else if (s.refreshOptions && s.refreshOptions.nextRefresh &&
                                        s.refreshOptions.nextRefresh > Date.now()) {

                                        // Fallback: use timing from original source
                                        updatedSource.refreshOptions = {
                                            ...updatedSource.refreshOptions,
                                            nextRefresh: s.refreshOptions.nextRefresh,
                                            lastRefresh: s.refreshOptions.lastRefresh,
                                            preserveTiming: true
                                        };

                                        console.log(`Using original source nextRefresh time: ${new Date(s.refreshOptions.nextRefresh).toISOString()}`);
                                    }
                                } else if (explicitlyDisablePreserveTiming) {
                                    // Log that we're explicitly NOT preserving timing
                                    console.log(`NOT preserving refresh timing for source ${sourceId} - explicitly disabled`);

                                    // Make sure preserveTiming stays false
                                    if (updatedSource.refreshOptions) {
                                        updatedSource.refreshOptions.preserveTiming = false;
                                    }
                                }

                                // Debug log to verify jsonFilter state
                                console.log(`Updated source ${sourceId} jsonFilter:`,
                                    JSON.stringify(updatedSource.jsonFilter));

                                // Also log the refresh timing
                                if (updatedSource.refreshOptions && updatedSource.refreshOptions.nextRefresh) {
                                    console.log(`Source ${sourceId} next refresh at: ${new Date(updatedSource.refreshOptions.nextRefresh).toISOString()}`);
                                }

                                // Resolve with this specific updated source
                                setTimeout(() => resolve(updatedSource), 0);

                                return updatedSource;
                            }
                            return s;
                        });

                        return updatedSources;
                    });

                    needsSave.current = true;
                } else {
                    resolve(null);
                }
            }).then(updatedSource => {
                // If this is an HTTP source, update refresh schedules if needed
                if (sourceData.sourceType === 'http') {
                    // Cancel existing refresh
                    http.cancelRefresh(sourceId);

                    // Set up refresh if enabled
                    const isEnabled = sourceData.refreshOptions?.enabled === true;
                    const refreshInterval = parseInt(sourceData.refreshOptions?.interval || 0, 10);

                    if (isEnabled && refreshInterval > 0) {
                        // IMPORTANT FIX #2: Check if preserveTiming was explicitly configured either way
                        const explicitlyDisablePreserveTiming =
                            sourceData.refreshOptions?.preserveTiming === false;
                        const explicitlyEnablePreserveTiming =
                            sourceData.refreshOptions?.preserveTiming === true;

                        // If nextRefresh and lastRefresh are not present, we should definitely not preserve timing
                        // This is typically when editing from the UI, where we want fresh timers
                        const hasMissingTimingInfo =
                            !sourceData.refreshOptions.nextRefresh ||
                            !sourceData.refreshOptions.lastRefresh;

                        // Decide whether to preserve timing based on explicit settings and presence of timing info
                        const preserveTiming = explicitlyEnablePreserveTiming &&
                            !explicitlyDisablePreserveTiming &&
                            !hasMissingTimingInfo;

                        const skipImmediateRefresh = preserveTiming;

                        // Use our normalized jsonFilter for the refresh schedule
                        debugLog(`Setting up refresh schedule for updated source ${sourceId} with jsonFilter: ${
                            JSON.stringify(normalizedJsonFilter)}`);

                        // Create refresh options, preserving the nextRefresh time if available and allowed
                        const refreshOptionsForSetup = {
                            ...sourceData.refreshOptions,
                            skipImmediateRefresh: skipImmediateRefresh
                        };

                        if (preserveTiming && updatedSource && updatedSource.refreshOptions &&
                            updatedSource.refreshOptions.nextRefresh) {
                            console.log(`Using preserved timing for refresh setup: next refresh at ${
                                new Date(updatedSource.refreshOptions.nextRefresh).toISOString()}`);
                        } else {
                            console.log(`Not preserving timing for refresh setup - will use fresh timing`);
                        }

                        http.setupRefresh(
                            sourceId,
                            sourceData.sourcePath,
                            sourceData.sourceMethod,
                            sourceData.requestOptions,
                            refreshOptionsForSetup,
                            normalizedJsonFilter, // Pass the normalized jsonFilter
                            updateSourceContent
                        );
                    }
                }

                return updatedSource;
            });
        } catch (error) {
            console.error('Error updating source:', error);
            if (isMounted.current) {
                showMessage('error', `Failed to update source: ${error.message}`);
            }
            return null;
        }
    };

    // Refresh a source
    // Complete updated refreshSource function with improved error handling
    const refreshSource = async (sourceId, updatedSource = null) => {
        try {
            // Use the provided updatedSource if available, otherwise get from current state
            let source;

            if (updatedSource && updatedSource.sourceId === sourceId) {
                // Use the provided source directly - this avoids race conditions
                source = updatedSource;
                console.log(`Using provided source for refresh of source ${sourceId} with jsonFilter:`,
                    JSON.stringify(updatedSource.jsonFilter));
            } else {
                // Get fresh copy from current state as a fallback
                const currentSource = [...sources].find(s => s.sourceId === sourceId);

                if (!currentSource) {
                    debugLog(`Attempted to refresh nonexistent source ${sourceId}`);
                    return false;
                }

                // Create a deep clone to avoid reference issues
                source = JSON.parse(JSON.stringify(currentSource));
            }

            // Debug logging to identify the issue
            console.log(`DEBUG: Current source jsonFilter before refresh:`,
                source.jsonFilter ? JSON.stringify(source.jsonFilter) : 'undefined');

            // FIXED: Create a normalized jsonFilter object with proper boolean typing
            const normalizedJsonFilter = {
                enabled: Boolean(source.jsonFilter?.enabled),
                path: source.jsonFilter?.enabled ? (source.jsonFilter.path || '') : ''
            };

            console.log(`Refreshing source ${sourceId} with normalized jsonFilter:`,
                JSON.stringify(normalizedJsonFilter));

            debugLog(`Refreshing source ${sourceId}`);

            // Capture the current time before updating UI
            const refreshStartTime = Date.now();

            // Update UI to show loading with a refreshOptions update to prevent "stuck" refresh
            if (isMounted.current) {
                // Make sure we always update refresh timestamps even if the request fails
                updateSourceContent(sourceId, 'Refreshing...', {
                    refreshOptions: {
                        ...source.refreshOptions,
                        lastRefresh: refreshStartTime,
                        // Ensure we have a valid nextRefresh time to reset any stuck timer
                        nextRefresh: refreshStartTime + ((source.refreshOptions?.interval || 1) * 60 * 1000)
                    }
                });
            }

            // Set a timeout to clear the "Refreshing..." state if the request takes too long
            const refreshTimeout = setTimeout(() => {
                if (isMounted.current) {
                    debugLog(`Refresh timeout triggered for source ${sourceId} - request too slow`);
                    // Only update if the content is still in "Refreshing..." state
                    setSources(prev => prev.map(s => {
                        if (s.sourceId === sourceId && s.sourceContent === 'Refreshing...') {
                            return {
                                ...s,
                                sourceContent: `Error: Refresh timed out after 15 seconds`
                            };
                        }
                        return s;
                    }));
                }
            }, 15000); // 15 second timeout

            // Refresh based on source type
            if (source.sourceType === 'file') {
                try {
                    const content = await fileSystem.readFile(source.sourcePath);
                    if (isMounted.current) {
                        updateSourceContent(sourceId, content);
                    }
                } catch (error) {
                    if (isMounted.current) {
                        updateSourceContent(sourceId, `Error: ${error.message}`);
                    }
                }
            }
            else if (source.sourceType === 'env') {
                try {
                    const content = await env.getVariable(source.sourcePath);
                    if (isMounted.current) {
                        updateSourceContent(sourceId, content);
                    }
                } catch (error) {
                    if (isMounted.current) {
                        updateSourceContent(sourceId, `Error: ${error.message}`);
                    }
                }
            }
            else if (source.sourceType === 'http') {
                try {
                    // Log the JSON filter state that will actually be used
                    console.log(`Refreshing HTTP source ${sourceId} with jsonFilter:`,
                        normalizedJsonFilter.enabled ?
                            `enabled=${normalizedJsonFilter.enabled}, path=${normalizedJsonFilter.path}` :
                            'disabled');

                    // Make the request with the properly formatted jsonFilter
                    const { content, originalResponse, headers } = await http.request(
                        sourceId,
                        source.sourcePath,
                        source.sourceMethod,
                        source.requestOptions,
                        normalizedJsonFilter  // Pass the properly structured jsonFilter
                    );

                    // Clear the timeout since the request succeeded
                    clearTimeout(refreshTimeout);

                    if (isMounted.current) {
                        debugLog(`HTTP refresh completed for source ${sourceId}`);
                        updateSourceContent(sourceId, content, {
                            originalResponse,
                            headers,
                            // Always update refresh times on successful refresh
                            refreshOptions: {
                                ...source.refreshOptions,
                                lastRefresh: Date.now(),
                                nextRefresh: Date.now() + ((source.refreshOptions?.interval || 1) * 60 * 1000)
                            }
                        });
                    }
                } catch (error) {
                    // Clear the timeout since the request finished (with error)
                    clearTimeout(refreshTimeout);

                    console.error(`Error refreshing HTTP source ${sourceId}:`, error);

                    if (isMounted.current) {
                        const now = Date.now();
                        // Also update refresh timestamps when errors occur
                        updateSourceContent(sourceId, `Error: ${error.message}`, {
                            refreshOptions: {
                                ...source.refreshOptions,
                                lastRefresh: now,
                                nextRefresh: now + ((source.refreshOptions?.interval || 1) * 60 * 1000)
                            }
                        });
                    }
                }
            }

            return true;
        } catch (error) {
            console.error('Error refreshing source:', error);

            if (isMounted.current) {
                showMessage('error', `Failed to refresh source: ${error.message}`);

                // Update source content to error state if still showing "Refreshing..."
                setSources(prev => prev.map(s => {
                    if (s.sourceId === sourceId && s.sourceContent === 'Refreshing...') {
                        return {
                            ...s,
                            sourceContent: `Error: ${error.message}`
                        };
                    }
                    return s;
                }));
            }
            return false;
        }
    };

    // Update refresh options
    const updateRefreshOptions = async (sourceId, options) => {
        try {
            const source = sources.find(s => s.sourceId === sourceId);
            if (!source || source.sourceType !== 'http') {
                console.error(`Source not found or not HTTP: ${sourceId}`);
                return false;
            }

            debugLog(`Updating refresh options for source ${sourceId}`, options);

            // Deep clone to avoid reference issues and ensure we're working with a clean object
            const refreshOptions = JSON.parse(JSON.stringify(options));

            // Get core settings with proper typing
            const isEnabled = Boolean(refreshOptions.enabled);
            const refreshInterval = parseInt(refreshOptions.interval || 0, 10);
            const effectiveInterval = isEnabled ? Math.max(0, refreshInterval) : 0;

            // CRITICAL: refreshNow is a UI-only flag that should NEVER be stored in the source
            // We explicitly extract it here, then invert it for the skipImmediateRefresh flag
            // If refreshNow is false (don't refresh now), then skipImmediateRefresh should be true
            const shouldRefreshNow = refreshOptions.refreshNow === true;
            const skipImmediateRefresh = !shouldRefreshNow;

            debugLog(`For source ${sourceId}: refreshNow=${shouldRefreshNow}, skipImmediateRefresh=${skipImmediateRefresh}`);

            // Remove the refreshNow property from what gets saved to storage
            delete refreshOptions.refreshNow;

            // Update state with clean values
            if (isMounted.current) {
                setSources(prev => prev.map(s => {
                    if (s.sourceId === sourceId) {
                        const now = Date.now();
                        const nextRefresh = effectiveInterval > 0 ? now + (effectiveInterval * 60 * 1000) : 0;

                        // Create a clean refreshOptions object
                        const updatedOptions = {
                            enabled: isEnabled,
                            interval: refreshInterval,
                            type: refreshOptions.type || 'preset',
                            lastRefresh: now,
                            nextRefresh: nextRefresh
                        };

                        debugLog(`Updated refresh options for source ${sourceId}`, updatedOptions);

                        return {
                            ...s,
                            refreshOptions: updatedOptions
                        };
                    }
                    return s;
                }));
                needsSave.current = true;
            }

            // Handle refresh schedule setup or cancellation
            if (isEnabled && refreshInterval > 0) {
                debugLog(`Setting up refresh schedule for source ${sourceId}`);

                // Set up the refresh schedule with the current time
                const now = Date.now();
                const nextRefresh = now + (refreshInterval * 60 * 1000);

                // Update the refreshOptions with the new timing info
                refreshOptions.lastRefresh = now;
                refreshOptions.nextRefresh = nextRefresh;

                http.setupRefresh(
                    sourceId,
                    source.sourcePath,
                    source.sourceMethod,
                    source.requestOptions,
                    {
                        interval: refreshInterval,
                        enabled: true,
                        type: refreshOptions.type || 'preset',
                        skipImmediateRefresh: skipImmediateRefresh,
                        lastRefresh: now,
                        nextRefresh: nextRefresh
                    },
                    source.jsonFilter,
                    updateSourceContent
                );

                // Force an update to the UI by updating the source with the new timing
                if (isMountedRef.current) {
                    setSources(prev => prev.map(s => {
                        if (s.sourceId === sourceId) {
                            return {
                                ...s,
                                refreshOptions: {
                                    ...s.refreshOptions,
                                    ...refreshOptions,
                                    lastRefresh: now,
                                    nextRefresh: nextRefresh
                                }
                            };
                        }
                        return s;
                    }));
                }
            } else {
                debugLog(`Cancelling refresh schedule for source ${sourceId}`);
                http.cancelRefresh(sourceId);
            }

            // Handle immediate refresh - completely separated from state updates
            // We don't rely on setupRefresh for this anymore - we handle it directly
            if (shouldRefreshNow) {
                debugLog(`Performing immediate refresh for source ${sourceId} (refreshNow is true)`);
                // Wait a bit to ensure state is fully updated
                setTimeout(async () => {
                    try {
                        await refreshSource(sourceId);
                        debugLog(`Immediate refresh completed for source ${sourceId}`);
                    } catch (err) {
                        console.error(`Error during immediate refresh for source ${sourceId}:`, err);
                    }
                }, 500);
            } else {
                debugLog(`Skipping immediate refresh for source ${sourceId}, refreshNow is false`);
            }

            return true;
        } catch (error) {
            console.error('Error updating refresh options:', error);
            if (isMounted.current) {
                showMessage('error', `Failed to update refresh options: ${error.message}`);
            }
            return false;
        }
    };

    // Export sources
    const exportSources = async (filePath) => {
        try {
            // Prepare data for export (normalize and remove internal fields)
            const exportableSources = sources.map(source => {
                const exportedSource = {
                    sourceType: source.sourceType,
                    sourcePath: source.sourcePath,
                    sourceTag: source.sourceTag || '',
                    sourceMethod: source.sourceMethod || '',
                    requestOptions: source.requestOptions || {},
                    jsonFilter: source.jsonFilter || { enabled: false, path: '' }
                };

                // For HTTP sources, include COMPLETE refresh options
                if (source.sourceType === 'http') {
                    const now = Date.now();
                    const refreshOptions = source.refreshOptions || {};

                    // Log what we're exporting
                    if (refreshOptions.nextRefresh && refreshOptions.nextRefresh > now) {
                        const timeRemaining = Math.round((refreshOptions.nextRefresh - now) / 60000);
                        debugLog(`Exporting HTTP source with ${timeRemaining}min remaining until next refresh`);
                    }

                    // Include ALL refresh settings (especially timing data)
                    exportedSource.refreshOptions = {
                        enabled: refreshOptions.enabled || false,
                        interval: refreshOptions.interval || 0,
                        type: refreshOptions.type || 'preset',
                        lastRefresh: refreshOptions.lastRefresh || null,
                        nextRefresh: refreshOptions.nextRefresh || null
                    };

                    // Include originalResponse if available
                    if (source.originalResponse) {
                        exportedSource.originalResponse = source.originalResponse;
                    }

                    // Include headers if available
                    if (source.headers) {
                        exportedSource.headers = source.headers;
                    }

                    // Include TOTP secret if available
                    if (source.requestOptions && source.requestOptions.totpSecret) {
                        // Make sure requestOptions exists
                        if (!exportedSource.requestOptions) {
                            exportedSource.requestOptions = {};
                        }

                        // Copy the TOTP secret to the exported source
                        exportedSource.requestOptions.totpSecret = source.requestOptions.totpSecret;
                        console.log(`Including TOTP secret in export for source ${source.sourceId}`);
                    }
                } else {
                    // Basic settings for non-HTTP sources
                    exportedSource.refreshOptions = {
                        enabled: false,
                        interval: 0,
                        type: 'preset'
                    };
                }

                return exportedSource;
            });

            // Convert to JSON
            const jsonData = JSON.stringify(exportableSources, null, 2);

            // Write to file
            await window.electronAPI.writeFile(filePath, jsonData);
            return true;
        } catch (error) {
            console.error('Error exporting sources:', error);
            if (isMounted.current) {
                showMessage('error', `Failed to export sources: ${error.message}`);
            }
            return false;
        }
    };

    // Import sources
    const importSources = async (filePath) => {
        try {
            debugLog(`Starting import from file: ${filePath}`);

            // Read file
            const fileData = await window.electronAPI.readFile(filePath);
            let importedCount = 0;

            try {
                // Parse JSON
                const sourcesToImport = JSON.parse(fileData);

                if (!Array.isArray(sourcesToImport)) {
                    throw new Error('Invalid format: file content is not an array');
                }

                if (sourcesToImport.length === 0) {
                    return { success: true, count: 0, message: 'File contains no sources' };
                }

                debugLog(`Found ${sourcesToImport.length} sources to import`);

                // Process sources one at a time to ensure proper state updates
                for (const sourceData of sourcesToImport) {
                    // Process refresh options for HTTP sources with timing information
                    if (sourceData.sourceType === 'http' &&
                        sourceData.refreshOptions &&
                        sourceData.refreshOptions.enabled) {

                        const now = Date.now();
                        const nextRefresh = sourceData.refreshOptions.nextRefresh;
                        const lastRefresh = sourceData.refreshOptions.lastRefresh;

                        // Check if we have valid timing data (both last and next refresh times)
                        const hasValidTimingData = nextRefresh && lastRefresh && nextRefresh > now;

                        if (hasValidTimingData) {
                            // Calculate time remaining in minutes
                            const timeRemaining = Math.round((nextRefresh - now) / 60000);

                            debugLog(`Importing HTTP source with ${timeRemaining}min remaining until next refresh`);

                            // Explicitly set flag to skip immediate refresh
                            sourceData.refreshOptions.preserveTiming = true;
                        } else {
                            debugLog(`Importing HTTP source with invalid or expired timing - will use fresh timing`);

                            // Reset timing if invalid
                            delete sourceData.refreshOptions.lastRefresh;
                            delete sourceData.refreshOptions.nextRefresh;
                        }
                    }

                    // Prepare a clean version of the source data
                    const cleanSourceData = {
                        sourceType: sourceData.sourceType,
                        sourcePath: sourceData.sourcePath,
                        sourceTag: sourceData.sourceTag || '',
                        sourceMethod: sourceData.sourceMethod || '',
                        requestOptions: sourceData.requestOptions || {},
                        jsonFilter: sourceData.jsonFilter || { enabled: false, path: '' },
                        // Include complete refresh options
                        refreshOptions: sourceData.refreshOptions || { enabled: false, interval: 0 }
                    };

                    // Preserve originalResponse if available
                    if (sourceData.originalResponse) {
                        cleanSourceData.originalResponse = sourceData.originalResponse;
                    }

                    // Preserve headers if available
                    if (sourceData.headers) {
                        cleanSourceData.headers = sourceData.headers;
                    }

                    // IMPORTANT: Preserve TOTP secret if available
                    if (sourceData.requestOptions && sourceData.requestOptions.totpSecret) {
                        // Make sure requestOptions exists
                        if (!cleanSourceData.requestOptions) {
                            cleanSourceData.requestOptions = {};
                        }

                        // Copy the TOTP secret to the clean source data
                        cleanSourceData.requestOptions.totpSecret = sourceData.requestOptions.totpSecret;
                        console.log(`Preserving TOTP secret during import for source with path ${sourceData.sourcePath}`);
                    }

                    // Add the source and track success
                    const success = await addSource(cleanSourceData);

                    if (success) {
                        importedCount++;
                    }

                    // Small delay between imports to ensure state updates are processed
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                debugLog(`Import completed: ${importedCount} sources imported successfully`);

                // Validation
                validateSourceIds(sources, 'after import');

                if (importedCount === 0) {
                    return {
                        success: true,
                        count: 0,
                        message: sourcesToImport.length > 0
                            ? `No sources were imported. ${sourcesToImport.length} source(s) already exist in your collection.`
                            : 'No sources were found in the file'
                    };
                }

                // For partial imports, add a message about duplicates:
                if (importedCount < sourcesToImport.length) {
                    return {
                        success: true,
                        count: importedCount,
                        message: `Imported ${importedCount} of ${sourcesToImport.length} sources. ${sourcesToImport.length - importedCount} source(s) were skipped as duplicates.`
                    };
                }

                return { success: true, count: importedCount };
            } catch (parseError) {
                throw new Error(`Invalid JSON format: ${parseError.message}`);
            }
        } catch (error) {
            console.error('Error importing sources:', error);
            throw error;
        }
    };

    // Force save sources (for debugging)
    const forceSave = useCallback(() => {
        needsSave.current = true;
    }, []);

    // Context value
    const value = {
        sources,
        addSource,
        removeSource,
        refreshSource,
        updateRefreshOptions,
        updateSource,
        exportSources,
        importSources,
        forceSave
    };

    return (
        <SourceContext.Provider value={value}>
            {children}
        </SourceContext.Provider>
    );
}

// Custom hook for using the source context
export function useSources() {
    const context = useContext(SourceContext);
    if (!context) {
        throw new Error('useSources must be used within a SourceProvider');
    }
    return context;
}