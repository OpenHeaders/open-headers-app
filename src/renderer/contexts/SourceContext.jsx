// SourceContext.jsx - FIXED to prevent broadcasting status-only updates

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useFileSystem } from '../hooks/useFileSystem';
import { useHttp } from '../hooks/useHttp';
import { useEnv } from '../hooks/useEnv';
import { showMessage } from '../utils/messageUtil';
import refreshManager from '../services/RefreshManager';

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
    // Track sources that need to be added to RefreshManager after initialization
    const pendingRefreshSources = useRef([]);

    // FIXED: More granular broadcast control - track suppression per update
    const broadcastControl = useRef({
        updateCounter: 0,
        suppressedUpdates: new Set(), // Track which update IDs should be suppressed
        lastContentHash: new Map() // sourceId -> content hash
    });

    // Custom hooks for source types
    const fileSystem = useFileSystem();
    const http = useHttp();
    const env = useEnv();

    // Helper for updating source content
    // FIXED: Granular suppression tracking per update
    const updateSourceContent = useCallback((sourceId, content, additionalData = {}) => {
        // Check if component is still mounted before updating state
        if (!isMounted.current) {
            console.log(`Skipping update for source ${sourceId} - component is unmounted`);
            return;
        }

        // FIXED: Generate unique update ID for granular suppression tracking
        const updateId = ++broadcastControl.current.updateCounter;
        const isStatusOnly = additionalData.statusOnly === true;
        const isTimingOnlyUpdate = additionalData.updateTimingOnly === true && content === null;

        debugLog(`Updating content for source ${sourceId}${isStatusOnly ? ' (status only)' : ''}${isTimingOnlyUpdate ? ' (timing only)' : ''} [update #${updateId}]`);

        // Always mark as needing save for persistence
        needsSave.current = true;

        // Log additional data if present
        if (Object.keys(additionalData).length > 0) {
            console.log(`Additional data for source ${sourceId}:`,
                Object.keys(additionalData).map(key => key).join(', '));
        }

        // FIXED: Track which specific updates should be suppressed
        if (isStatusOnly) {
            broadcastControl.current.suppressedUpdates.add(updateId);
            console.log(`[SourceContext] Marking update #${updateId} for suppression (status-only update on source ${sourceId})`);
        }

        setSources(prev => {
            // Check if source exists
            const sourceExists = prev.some(s => s.sourceId === sourceId);

            if (!sourceExists) {
                debugLog(`Source ${sourceId} not found when updating content`);
                return prev;
            }

            return prev.map(source => {
                if (source.sourceId === sourceId) {
                    // Create updated source
                    const updatedSource = {
                        ...source,
                        // FIXED: Only update content if provided and not a status-only update
                        sourceContent: (content !== null && !isStatusOnly) ? content : source.sourceContent,
                        // FIXED: Store update ID for granular suppression checking
                        _lastUpdateId: updateId
                    };

                    // Merge additional data
                    Object.keys(additionalData).forEach(key => {
                        if (key === 'refreshOptions' && source.refreshOptions) {
                            // Merge refresh options properly
                            updatedSource.refreshOptions = {
                                ...source.refreshOptions,
                                ...additionalData.refreshOptions
                            };

                            console.log(`Updated refresh timing for source ${sourceId}:`, {
                                lastRefresh: updatedSource.refreshOptions.lastRefresh,
                                nextRefresh: updatedSource.refreshOptions.nextRefresh,
                                interval: updatedSource.refreshOptions.interval
                            });
                        } else if (key !== 'updateTimingOnly' && key !== 'forceUpdateContent' && key !== 'statusOnly' && key !== 'refreshStatus') {
                            // Copy other fields except control flags
                            updatedSource[key] = additionalData[key];
                        }
                    });

                    // FIXED: Track content changes for broadcast control - only for content updates
                    if (content !== null && !isStatusOnly) {
                        const contentHash = JSON.stringify(content);
                        const lastHash = broadcastControl.current.lastContentHash.get(sourceId);

                        broadcastControl.current.lastContentHash.set(sourceId, contentHash);

                        if (contentHash !== lastHash) {
                            console.log(`[SourceContext] Content actually changed for source ${sourceId}, allowing broadcast [update #${updateId}]`);
                        } else {
                            console.log(`[SourceContext] Content unchanged for source ${sourceId}, suppressing broadcast [update #${updateId}]`);
                            broadcastControl.current.suppressedUpdates.add(updateId);
                        }
                    }

                    return updatedSource;
                }
                return source;
            });
        });
    }, []);

    // FIXED: Check if specific update should be suppressed
    const shouldSuppressUpdate = useCallback((sourceId, source) => {
        const updateId = source?._lastUpdateId;

        if (!updateId) {
            return false; // No update ID, don't suppress
        }

        const shouldSuppress = broadcastControl.current.suppressedUpdates.has(updateId);

        if (shouldSuppress) {
            // Remove from suppressed set after checking (consume the suppression)
            broadcastControl.current.suppressedUpdates.delete(updateId);
            console.log(`[SourceContext] Suppressing broadcast for update #${updateId} on source ${sourceId}`);
        }

        return shouldSuppress;
    }, []);

    // FIXED: Expose granular suppression check to WebSocketContext
    const shouldSuppressBroadcast = useCallback((sources) => {
        // Check if any of the sources have updates that should be suppressed
        for (const source of sources) {
            if (shouldSuppressUpdate(source.sourceId, source)) {
                return true;
            }
        }
        return false;
    }, [shouldSuppressUpdate]);

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

    // Initialize RefreshManager and process pending sources
    useEffect(() => {
        if (initialized && !refreshManager.isInitialized) {
            debugLog('Initializing RefreshManager');
            refreshManager.initialize(http, updateSourceContent);

            // Process any pending sources
            if (pendingRefreshSources.current.length > 0) {
                debugLog(`Processing ${pendingRefreshSources.current.length} pending refresh sources`);

                pendingRefreshSources.current.forEach(source => {
                    refreshManager.addSource(source);
                    debugLog(`Added pending source ${source.sourceId} to RefreshManager`);
                });

                pendingRefreshSources.current = [];
            }
        }
    }, [initialized, http, updateSourceContent]);

    // Load sources - removed complex timing cleanup
    useEffect(() => {
        const loadSources = async () => {
            if (isLoading.current) return;

            try {
                debugLog('Loading sources from storage...');
                isLoading.current = true;

                const sourcesJson = await window.electronAPI.loadFromStorage('sources.json');
                debugLog(`Loaded sources JSON: ${sourcesJson ? 'data available' : 'null'}`);

                if (sourcesJson && isMounted.current) {
                    const loadedSources = JSON.parse(sourcesJson);
                    debugLog(`Loaded ${loadedSources.length} sources`);

                    validateSourceIds(loadedSources, 'initial load');

                    if (loadedSources.length > 0) {
                        const maxId = Math.max(...loadedSources.map(s => Number(s.sourceId) || 0));
                        highestIdRef.current = maxId;
                        setNextSourceId(maxId + 1);
                    }

                    const initializedSources = [];

                    for (const source of loadedSources) {
                        const validSourceId = Number(source.sourceId) || getUniqueSourceId();

                        const initializedSource = {
                            ...source,
                            sourceId: validSourceId,
                            sourceContent: source.sourceContent || 'Loading content...'
                        };

                        initializedSources.push(initializedSource);

                        // FIXED: Initialize content hash tracking
                        if (initializedSource.sourceContent) {
                            const contentHash = JSON.stringify(initializedSource.sourceContent);
                            broadcastControl.current.lastContentHash.set(validSourceId, contentHash);
                        }

                        // Initialize based on type
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
                            // Queue for RefreshManager - no complex timing logic
                            if (source.refreshOptions?.enabled && source.refreshOptions?.interval > 0) {
                                pendingRefreshSources.current.push(initializedSource);
                                debugLog(`Queued HTTP source ${validSourceId} for RefreshManager`);
                            }
                        }
                    }

                    validateSourceIds(initializedSources, 'after initialization');

                    if (isMounted.current) {
                        debugLog(`Setting initial sources state with ${initializedSources.length} sources`);
                        setSources(initializedSources);
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

        if (firstLoad.current) {
            loadSources();
        }

        return () => {
            isMounted.current = false;
            if (refreshManager.isInitialized) {
                refreshManager.destroy();
            }
        };
    }, []);

    // Helper function to clean up stale timing data from previous sessions
    const cleanupStaleTimingData = useCallback((source) => {
        if (source.sourceType !== 'http' || !source.refreshOptions) {
            return source;
        }

        const now = Date.now(); // Use regular timestamp, not high-res time
        const cleanedSource = { ...source };

        // Check if the nextRefresh time is from a previous session (more than 5 minutes old)
        if (source.refreshOptions.nextRefresh) {
            const timeDiff = now - source.refreshOptions.nextRefresh;

            // If nextRefresh is in the past by more than the refresh interval, it's stale
            const intervalMs = (source.refreshOptions.interval || 15) * 60 * 1000;
            const isStale = timeDiff > intervalMs;

            if (isStale) {
                debugLog(`Cleaning up stale timing data for source ${source.sourceId}`, {
                    oldNextRefresh: source.refreshOptions.nextRefresh,
                    timeDiffMinutes: Math.round(timeDiff / 60000),
                    intervalMinutes: source.refreshOptions.interval
                });

                // Remove stale timing data so RefreshManager can recalculate
                cleanedSource.refreshOptions = {
                    ...source.refreshOptions,
                    lastRefresh: null,
                    nextRefresh: null
                };
            }
        }

        return cleanedSource;
    }, []);

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

                // FIXED: Clean sources before saving (remove internal update tracking)
                const cleanedSources = sources.map(source => {
                    const { _lastUpdateId, ...cleanSource } = source;
                    return cleanSource;
                });

                await window.electronAPI.saveToStorage('sources.json', JSON.stringify(cleanedSources));
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

    // FIXED: Clean up broadcast control tracking when source is removed
    const removeSource = async (sourceId) => {
        try {
            const source = sources.find(s => s.sourceId === sourceId);
            if (!source) {
                debugLog(`Attempted to remove nonexistent source ${sourceId}`);
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

            // FIXED: Clean up broadcast control tracking
            broadcastControl.current.lastContentHash.delete(sourceId);

            // Clean up based on source type
            if (source.sourceType === 'file') {
                await fileSystem.unwatchFile(source.sourceId, source.sourcePath);
            }
            else if (source.sourceType === 'http') {
                // Remove from RefreshManager
                if (refreshManager.isInitialized) {
                    refreshManager.removeSource(sourceId);
                } else {
                    // Remove from pending sources if it's there
                    pendingRefreshSources.current = pendingRefreshSources.current.filter(s => s.sourceId !== sourceId);
                }
            }

            return true;
        } catch (error) {
            console.error('Error removing source:', error);
            if (isMounted.current) {
                showMessage('error', `Failed to remove source: ${error.message}`);
            }
            return false;
        }
    };

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

            const sourceId = getUniqueSourceId();
            debugLog(`Adding new source with ID ${sourceId}`);

            const newSource = {
                sourceId,
                ...sourceData,
                sourceContent: 'Loading content...'
            };

            // Add to state immediately
            if (isMounted.current) {
                setSources(prev => {
                    const updated = [...prev, newSource];
                    debugLog(`Source ${sourceId} added, total sources: ${updated.length}`);
                    return updated;
                });
                needsSave.current = true;
            }

            // Initialize based on type
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
                    // Make initial HTTP request
                    const result = await http.request(
                        sourceId,
                        sourceData.sourcePath,
                        sourceData.sourceMethod,
                        sourceData.requestOptions,
                        sourceData.jsonFilter
                    );

                    initialContent = result.content;

                    // Update with all available data
                    if (isMounted.current) {
                        const updateData = {
                            originalResponse: result.originalResponse,
                            headers: result.headers,
                            rawResponse: result.rawResponse
                        };

                        if (sourceData.jsonFilter?.enabled === true) {
                            updateData.isFiltered = true;
                            updateData.filteredWith = sourceData.jsonFilter.path;
                        }

                        updateSourceContent(sourceId, initialContent, updateData);
                    }

                    // Add to RefreshManager if refresh is enabled
                    if (sourceData.refreshOptions?.enabled && sourceData.refreshOptions?.interval > 0) {
                        const sourceForManager = {
                            ...newSource,
                            sourceContent: initialContent,
                            ...updateData
                        };

                        if (refreshManager.isInitialized) {
                            refreshManager.addSource(sourceForManager);
                            debugLog(`Added source ${sourceId} to RefreshManager`);
                        } else {
                            pendingRefreshSources.current.push(sourceForManager);
                            debugLog(`Queued source ${sourceId} for RefreshManager`);
                        }
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

            // Update content for non-HTTP sources
            if (sourceData.sourceType !== 'http' && isMounted.current) {
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

    // Update source
    const updateSource = async (sourceData) => {
        try {
            const sourceId = sourceData.sourceId;
            const source = sources.find(s => s.sourceId === sourceId);

            if (!source) {
                debugLog(`Source ${sourceId} not found when updating`);
                return false;
            }

            debugLog(`Updating source ${sourceId}`);

            // Clean JSON filter normalization
            const normalizedJsonFilter = {
                enabled: Boolean(sourceData.jsonFilter?.enabled),
                path: sourceData.jsonFilter?.enabled === true ? (sourceData.jsonFilter.path || '') : ''
            };

            // Update state
            if (isMounted.current) {
                setSources(prev => {
                    return prev.map(s => {
                        if (s.sourceId === sourceId) {
                            return {
                                ...s,
                                ...sourceData,
                                sourceContent: s.sourceContent, // Preserve existing content
                                jsonFilter: normalizedJsonFilter
                            };
                        }
                        return s;
                    });
                });
                needsSave.current = true;
            }

            // Update RefreshManager if HTTP source
            if (sourceData.sourceType === 'http') {
                const updatedSourceForManager = {
                    ...sourceData,
                    jsonFilter: normalizedJsonFilter
                };

                if (refreshManager.isInitialized) {
                    refreshManager.updateSource(updatedSourceForManager);
                }
            }

            return sourceData;
        } catch (error) {
            console.error('Error updating source:', error);
            if (isMounted.current) {
                showMessage('error', `Failed to update source: ${error.message}`);
            }
            return null;
        }
    };

    // Refresh source - delegate to RefreshManager
    const refreshSource = async (sourceId, updatedSource = null) => {
        try {
            const source = sources.find(s => s.sourceId === sourceId);
            if (!source) {
                debugLog(`Attempted to refresh nonexistent source ${sourceId}`);
                return false;
            }

            console.log('SourceContext: Starting refresh for source', sourceId);

            if (source.sourceType === 'http') {
                // Delegate to RefreshManager
                if (refreshManager.isInitialized) {
                    return await refreshManager.refreshSource(sourceId);
                } else {
                    debugLog(`RefreshManager not initialized, cannot refresh source ${sourceId}`);
                    return false;
                }
            } else if (source.sourceType === 'file') {
                // Handle file sources directly
                try {
                    const content = await fileSystem.readFile(source.sourcePath);
                    if (isMounted.current) {
                        updateSourceContent(sourceId, content);
                    }
                    return true;
                } catch (error) {
                    if (isMounted.current) {
                        updateSourceContent(sourceId, `Error: ${error.message}`);
                    }
                    return false;
                }
            } else if (source.sourceType === 'env') {
                // Handle environment variable sources
                try {
                    const content = await env.getVariable(source.sourcePath);
                    if (isMounted.current) {
                        updateSourceContent(sourceId, content);
                    }
                    return true;
                } catch (error) {
                    if (isMounted.current) {
                        updateSourceContent(sourceId, `Error: ${error.message}`);
                    }
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('Error refreshing source:', error);
            if (isMounted.current) {
                showMessage('error', `Failed to refresh source: ${error.message}`);
            }
            return false;
        }
    };

    // Update refresh options - delegated to RefreshManager
    const updateRefreshOptions = async (sourceId, options) => {
        try {
            const source = sources.find(s => s.sourceId === sourceId);
            if (!source || source.sourceType !== 'http') {
                console.error(`Source not found or not HTTP: ${sourceId}`);
                return false;
            }

            debugLog(`Updating refresh options for source ${sourceId}`, options);

            // Update local state
            if (isMounted.current) {
                setSources(prev => prev.map(s => {
                    if (s.sourceId === sourceId) {
                        return {
                            ...s,
                            refreshOptions: {
                                ...s.refreshOptions,
                                ...options,
                                // Remove refreshNow from storage
                                refreshNow: undefined
                            }
                        };
                    }
                    return s;
                }));
                needsSave.current = true;
            }

            // Update RefreshManager
            const updatedSource = {
                ...source,
                refreshOptions: {
                    ...source.refreshOptions,
                    ...options,
                    refreshNow: undefined
                }
            };

            if (refreshManager.isInitialized) {
                refreshManager.updateSource(updatedSource);
            }

            // Handle immediate refresh if requested
            if (options.refreshNow === true) {
                debugLog(`Performing immediate refresh for source ${sourceId}`);
                setTimeout(async () => {
                    try {
                        if (refreshManager.isInitialized) {
                            await refreshManager.refreshSource(sourceId);
                            debugLog(`Immediate refresh completed for source ${sourceId}`);
                        }
                    } catch (err) {
                        console.error(`Error during immediate refresh for source ${sourceId}:`, err);
                    }
                }, 500);
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

                // For HTTP sources, include refresh options
                if (source.sourceType === 'http') {
                    const now = Date.now();
                    const refreshOptions = source.refreshOptions || {};

                    // Log what we're exporting
                    if (refreshOptions.nextRefresh && refreshOptions.nextRefresh > now) {
                        const timeRemaining = Math.round((refreshOptions.nextRefresh - now) / 60000);
                        debugLog(`Exporting HTTP source with ${timeRemaining}min remaining until next refresh`);
                    }

                    // Include refresh settings
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
                        if (!exportedSource.requestOptions) {
                            exportedSource.requestOptions = {};
                        }
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

                    // Preserve TOTP secret if available
                    if (sourceData.requestOptions && sourceData.requestOptions.totpSecret) {
                        if (!cleanSourceData.requestOptions) {
                            cleanSourceData.requestOptions = {};
                        }
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
        forceSave,
        shouldSuppressBroadcast // FIXED: Expose granular broadcast control to WebSocketContext
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