// source-service.js - Main service for source management
const FileService = require('./file-service');
const EnvService = require('./env-service');
const HttpService = require('./http-service');
const SourceRepository = require('../repositories/source-repository');
const Source = require('../models/source');
const EventEmitter = require('events');

/**
 * Main service for managing sources
 */
class SourceService extends EventEmitter {
    constructor() {
        super(); // Call the EventEmitter constructor
        this.fileService = new FileService();
        this.envService = new EnvService();
        this.httpService = new HttpService();
        this.repository = new SourceRepository();
        this.sources = [];
        this.nextSourceId = 1;
        this.isInitialized = false;
        this.pendingUpdates = new Map(); // Track pending updates to prevent duplicates
    }

    /**
     * Initialize the service and load saved sources
     */
    async initialize() {
        try {
            if (this.isInitialized) {
                console.log('SourceService is already initialized');
                return true;
            }

            console.log('Initializing SourceService...');

            // Load sources from storage
            const savedSources = await this.repository.loadSources();
            console.log(`Loaded ${savedSources.length} source(s) from storage`);

            // Clear existing sources to prevent duplicates
            this.sources = [];

            // Add loaded sources
            for (const source of savedSources) {
                this.sources.push(source);
            }

            // Set the next source ID
            if (this.sources.length > 0) {
                const maxId = Math.max(...this.sources.map(src => src.sourceId));
                this.nextSourceId = maxId + 1;
                console.log(`Next source ID set to ${this.nextSourceId}`);
            }

            // Mark as initialized before watching to prevent duplicate events
            this.isInitialized = true;

            // Start watching all sources
            console.log(`Starting watches for ${this.sources.length} source(s)`);
            for (const source of this.sources) {
                await this.watchSource(source);
            }

            console.log('SourceService initialized successfully');

            // Emit event that sources have been loaded
            // This triggers the source controller to send sources to renderer
            process.nextTick(() => {
                this.emit('sources:loaded', this.sources);
                console.log('Emitted sources:loaded event');
            });

            return true;
        } catch (err) {
            console.error('Error initializing source service:', err);
            return false;
        }
    }

    /**
     * Get all sources
     * @returns {Source[]} Array of all sources
     */
    getAllSources() {
        return [...this.sources];
    }

    /**
     * Create a new source
     * @param {string} sourceType - Type of source ('file', 'env', 'http')
     * @param {string} sourcePath - Path, variable name, or URL
     * @param {string} sourceTag - Optional tag
     * @param {string} sourceMethod - HTTP method (for HTTP sources)
     * @param {Object} requestOptions - HTTP request options (headers, queryParams, body)
     * @param {Object} refreshOptions - Refresh options for HTTP sources (interval in minutes)
     * @param {Object} jsonFilter - JSON filter options { enabled, path }
     * @param {string} initialContent - Initial content if available
     * @returns {Promise<Source>} The created source
     */
    async createSource(sourceType, sourcePath, sourceTag, sourceMethod = '', requestOptions = {}, refreshOptions = {}, jsonFilter = { enabled: false, path: '' }, initialContent = '') {
        try {
            // Check for duplicate sources to prevent duplicates
            const existingSource = this.sources.find(src =>
                src.sourceType === sourceType &&
                src.sourcePath === sourcePath &&
                (sourceType !== 'http' || src.sourceMethod === sourceMethod)
            );

            if (existingSource) {
                console.log(`Source already exists with ID ${existingSource.sourceId}, skipping creation`);
                return existingSource;
            }

            const sourceId = this.nextSourceId++;
            console.log(`Creating new source with ID ${sourceId} (${sourceType}: ${sourcePath})`);
            console.log(`JSON Filter: ${jsonFilter ? `${jsonFilter.enabled ? 'Enabled' : 'Disabled'} - Path: ${jsonFilter.path}` : 'None'}`);

            // For HTTP sources, prepare refresh options
            let finalRefreshOptions = {};
            if (sourceType === 'http' && refreshOptions) {
                finalRefreshOptions = {
                    interval: refreshOptions.interval || 0,
                    lastRefresh: Date.now(),
                    nextRefresh: refreshOptions.interval > 0 ? Date.now() + (refreshOptions.interval * 60 * 1000) : 0
                };
            }

            // Use provided initial content if available, otherwise use loading placeholder
            const contentToUse = initialContent || 'Loading content...';

            const newSource = new Source({
                sourceId,
                sourceType,
                sourcePath,
                sourceTag,
                sourceMethod,
                sourceContent: contentToUse,
                originalJson: '', // Will be set after HTTP request if applicable
                requestOptions,
                refreshOptions: finalRefreshOptions,
                jsonFilter  // Store jsonFilter at root level, not in requestOptions
            });

            this.sources.push(newSource);
            console.log(`Added source to collection, now have ${this.sources.length} source(s)`);

            // This is different from watchSource for existing sources
            // For new sources, we always want to make the initial request
            if (sourceType === 'http') {
                try {
                    console.log(`Making initial HTTP request for new source ${sourceId}`);

                    // Create onUpdate callback for HTTP service
                    const onUpdate = (sourceId, content, originalJson) => {
                        console.log(`onUpdate called with content (${content ? content.length : 0} chars) and originalJson (${originalJson ? originalJson.length : 0} chars)`);
                        this.updateSourceContent(sourceId, content, originalJson);
                    };

                    // Make the initial HTTP request using watchHttp
                    const httpResult = await this.httpService.watchHttp(
                        sourcePath,
                        sourceMethod,
                        sourceId,
                        requestOptions,
                        { ...finalRefreshOptions, onUpdate },
                        jsonFilter
                    );

                    // Log what we got back for debugging
                    console.log(`HTTP request result received:`, {
                        contentPresent: httpResult && httpResult.content ? true : false,
                        contentLength: httpResult && httpResult.content ? httpResult.content.length : 0,
                        originalJsonPresent: httpResult && httpResult.originalJson ? true : false,
                        originalJsonLength: httpResult && httpResult.originalJson ? httpResult.originalJson.length : 0
                    });

                    if (httpResult && httpResult.content) {
                        // Make sure we have the originalJson
                        const originalJson = httpResult.originalJson || '';
                        console.log(`Updating source with content (${httpResult.content.length} chars) and originalJson (${originalJson.length} chars)`);

                        // First update the content using the source method
                        newSource.updateContent(httpResult.content, originalJson);

                        // CRITICAL: Then directly set the originalJson property to ensure it's stored
                        newSource.originalJson = originalJson;
                        console.log(`Directly set originalJson (${originalJson.length} chars) on new source`);

                        // Log the source object to verify the originalJson is set
                        console.log(`Source object originalJson length: ${newSource.originalJson ? newSource.originalJson.length : 0}`);

                        // Save the updated source with originalJson to storage
                        await this.saveSources();
                        console.log(`Saved source with originalJson to storage`);

                        // Also notify the UI about the update
                        onUpdate(sourceId, httpResult.content, originalJson);
                    }
                } catch (error) {
                    console.error(`Error making initial HTTP request for new source ${sourceId}:`, error);
                    newSource.sourceContent = `Error: ${error.message}`;

                    // Save the updated source to storage even on error
                    await this.saveSources();
                }
            } else {
                // For non-HTTP sources, use watch mechanism
                await this.watchSource(newSource);
            }

            return newSource;
        } catch (err) {
            console.error('Error creating source:', err);
            throw err;
        }
    }

    /**
     * Watch a source based on its type
     * @param {Source} source - The source to watch
     */
    async watchSource(source) {
        try {
            console.log(`Setting up watch for source ${source.sourceId} (${source.sourceType}: ${source.sourcePath})`);

            const onUpdate = (sourceId, content) => {
                this.updateSourceContent(sourceId, content);
            };

            let initialContent = '';

            switch (source.sourceType) {
                case 'file':
                    initialContent = await this.fileService.watchFile(
                        source.sourcePath,
                        source.sourceId,
                        onUpdate
                    );
                    break;

                case 'env':
                    initialContent = this.envService.watchEnv(
                        source.sourcePath,
                        source.sourceId
                    );

                    // Immediately set the content and save to storage
                    if (initialContent) {
                        console.log(`Setting initial content for ENV variable ${source.sourcePath}: ${initialContent.substring(0, 30)}${initialContent.length > 30 ? '...' : ''}`);

                        // Update the source object with this content
                        source.sourceContent = initialContent;

                        // Save the updated sources immediately to ensure content is in storage
                        await this.saveSources();

                        // Emit the updated event after a slight delay to ensure UI is ready
                        setTimeout(() => {
                            onUpdate(source.sourceId, initialContent);
                        }, 100);
                    }
                    break;

                case 'http':
                    console.log(`HTTP source ${source.sourceId} - checking if we should make a request...`);

                    // Check if auto-refresh is enabled
                    const hasAutoRefresh = source.refreshOptions &&
                        source.refreshOptions.interval > 0;

                    console.log(`HTTP source ${source.sourceId} - auto-refresh enabled: ${hasAutoRefresh}`);

                    // Check if the refresh time has already passed
                    const now = Date.now();
                    const refreshExpired = hasAutoRefresh &&
                        source.refreshOptions.nextRefresh &&
                        source.refreshOptions.nextRefresh <= now;

                    // For HTTP sources, pass refresh options with the onUpdate callback
                    const refreshOptions = {
                        ...source.refreshOptions,
                        onUpdate // Add the onUpdate callback for the HttpService to use during auto-refresh
                    };

                    // Use setupHttpWatch instead of watchHttp to avoid making the request
                    console.log(`Setting up HTTP watch for source ${source.sourceId} without initial request`);

                    if (refreshExpired) {
                        // The refresh time has already passed
                        console.log(`HTTP source ${source.sourceId} - refresh time has expired, will be refreshed by HTTP service`);

                        // Let the HTTP service handle the immediate refresh
                        // We'll add a flag to indicate the refresh timer is expired
                        this.httpService.setupHttpWatch(
                            source.sourcePath,
                            source.sourceMethod,
                            source.sourceId,
                            source.requestOptions,
                            {
                                ...refreshOptions,
                                refreshExpired: true // Add flag to indicate expired timer
                            },
                            source.jsonFilter,
                            onUpdate
                        );
                    } else {
                        // Normal setup without immediate refresh
                        this.httpService.setupHttpWatch(
                            source.sourcePath,
                            source.sourceMethod,
                            source.sourceId,
                            source.requestOptions,
                            refreshOptions,
                            source.jsonFilter,
                            onUpdate
                        );
                    }

                    // Log info about refresh schedule
                    if (hasAutoRefresh && source.refreshOptions.nextRefresh) {
                        const timeUntilRefresh = Math.max(0, source.refreshOptions.nextRefresh - now);
                        const minutesUntilRefresh = Math.floor(timeUntilRefresh / (60 * 1000));
                        const secondsUntilRefresh = Math.floor((timeUntilRefresh % (60 * 1000)) / 1000);

                        if (timeUntilRefresh <= 0) {
                            console.log(`HTTP source ${source.sourceId} - refresh time has passed, next refresh should happen immediately`);
                        } else {
                            console.log(`HTTP source ${source.sourceId} - next refresh in ${minutesUntilRefresh}m ${secondsUntilRefresh}s at ${new Date(source.refreshOptions.nextRefresh).toLocaleTimeString()}`);
                        }
                    }

                    break;
            }

            console.log(`Watch established for source ${source.sourceId}`);

        } catch (err) {
            console.error(`Error watching source ${source.sourceId}:`, err);
        }
    }

    /**
     * Update refresh options for an HTTP source
     * @param {number} sourceId - ID of the source to update
     * @param {Object} refreshOptions - New refresh options {interval}
     * @returns {Promise<boolean>} Success status
     */
    async updateRefreshOptions(sourceId, refreshOptions) {
        try {
            console.log(`Updating refresh options for source ${sourceId}:`, refreshOptions);

            const source = this.sources.find(src => src.sourceId === sourceId);
            if (!source) {
                console.log(`Source ${sourceId} not found, cannot update refresh options`);
                return false;
            }

            if (source.sourceType !== 'http') {
                console.log(`Source ${sourceId} is not HTTP type, refresh options not applicable`);
                return false;
            }

            // Update the source's refresh options
            source.refreshOptions = {
                interval: refreshOptions.interval || 0,
                lastRefresh: Date.now(),
                nextRefresh: refreshOptions.interval > 0 ? Date.now() + (refreshOptions.interval * 60 * 1000) : 0
            };

            // Update the HTTP service's refresh timer
            const onUpdate = (sourceId, content) => {
                this.updateSourceContent(sourceId, content);
            };

            // Update refresh options with callback
            const updatedRefreshOptions = {
                ...source.refreshOptions,
                onUpdate
            };

            this.httpService.updateRefreshOptions(
                sourceId,
                source.sourcePath,
                source.sourceMethod,
                source.requestOptions,
                updatedRefreshOptions
            );

            // Save the updated sources
            await this.repository.saveSources(this.sources);
            console.log(`Refresh options updated for source ${sourceId}`);

            // Emit an event to notify renderers
            this.emit('source:refreshOptionsUpdated', sourceId, source.refreshOptions);

            return true;
        } catch (err) {
            console.error(`Error updating refresh options for source ${sourceId}:`, err);
            return false;
        }
    }

    /**
     * Get refresh information for all sources
     * @returns {Object} Map of sourceId to refresh information
     */
    getRefreshInfo() {
        if (this.httpService && typeof this.httpService.getRefreshInfo === 'function') {
            return this.httpService.getRefreshInfo();
        }
        return {};
    }

    /**
     * Test an HTTP request
     * @param {string} requestUrl - URL for the request
     * @param {string} method - HTTP method
     * @param {Object} requestOptions - HTTP request options
     * @returns {Promise<string>} HTTP response
     */
    async testHttpRequest(requestUrl, method, requestOptions = {}) {
        try {
            console.log("Testing HTTP request to:", requestUrl);

            // Extract jsonFilter if provided in requestOptions
            const jsonFilter = requestOptions.jsonFilter || { enabled: false, path: '' };
            console.log("JSON filter for test request:", jsonFilter);

            // Get the raw response first
            const response = await this.httpService.makeRequest(requestUrl, method, requestOptions);
            console.log("Test HTTP response received:", response);

            // If JSON filter is enabled, parse and apply the filter
            if (jsonFilter.enabled && jsonFilter.path) {
                try {
                    // Parse the response to get the body
                    const parsedResponse = JSON.parse(response);
                    const body = parsedResponse.body || '';

                    if (body) {
                        // Apply the filter
                        console.log(`Applying JSON filter with path: ${jsonFilter.path}`);
                        const filteredBody = this.httpService._applyJsonFilter(body, jsonFilter);

                        // Create a new response object with the filtered body
                        const filteredResponse = {
                            ...parsedResponse,
                            body: filteredBody,
                            filteredWith: jsonFilter.path // Add info about the filter used
                        };

                        return JSON.stringify(filteredResponse, null, 2);
                    }
                } catch (err) {
                    console.error("Error applying JSON filter during test:", err);
                    // If filtering fails, return the original response
                }
            }

            return response;
        } catch (err) {
            console.error('Error testing HTTP request:', err);
            throw err;
        }
    }

    /**
     * Remove a source
     * @param {number} sourceId - ID of the source to remove
     * @returns {Promise<boolean>} Success status
     */
    async removeSource(sourceId) {
        try {
            console.log(`Removing source ${sourceId}`);

            const source = this.sources.find(src => src.sourceId === sourceId);
            if (!source) {
                console.log(`Source ${sourceId} not found, nothing to remove`);
                return false;
            }

            // Stop watching based on source type
            switch (source.sourceType) {
                case 'file':
                    await this.fileService.removeWatch(sourceId, source.sourcePath);
                    break;

                case 'env':
                    this.envService.removeWatch(sourceId, source.sourcePath);
                    break;

                case 'http':
                    this.httpService.removeWatch(sourceId, source.sourcePath, source.sourceMethod);
                    break;
            }

            // Remove from sources array
            const previousCount = this.sources.length;
            this.sources = this.sources.filter(src => src.sourceId !== sourceId);
            console.log(`Removed source from collection, now have ${this.sources.length} source(s) (was ${previousCount})`);

            // Save updated sources
            await this.repository.saveSources(this.sources);
            console.log('Updated sources saved to storage');

            // Emit removed event
            this.emit('source:removed', sourceId);
            console.log(`Emitted source:removed event for ID ${sourceId}`);

            return true;
        } catch (err) {
            console.error(`Error removing source ${sourceId}:`, err);
            return false;
        }
    }

    /**
     * Refresh a specific source by ID
     * @param {number} sourceId - ID of the source to refresh
     * @returns {Promise<boolean>} Success status
     */
    async refreshSource(sourceId) {
        try {
            console.log(`Manual refresh requested for source ${sourceId}`);

            const source = this.sources.find(src => src.sourceId === sourceId);
            if (!source) {
                console.log(`Source ${sourceId} not found, cannot refresh`);
                return false;
            }

            if (source.sourceType !== 'http') {
                console.log(`Source ${sourceId} is not HTTP type, refresh not applicable`);
                return false;
            }

            // Create callback for the content update that also handles originalJson
            const onUpdate = (sourceId, content, originalJson) => {
                console.log(`Refresh callback with content (${content ? content.length : 0} chars) and originalJson (${originalJson ? originalJson.length : 0} chars)`);
                this.updateSourceContent(sourceId, content, originalJson);
            };

            // Use the HTTP service to refresh the source
            await this.httpService.refreshSource(
                source.sourcePath,
                source.sourceMethod,
                onUpdate
            );

            // Emit a specific event for refresh completion, even if content might not have changed
            this.emit('source:refreshed', sourceId, source.sourceContent);
            console.log(`Emitted source:refreshed event for ID ${sourceId}`);

            return true;
        } catch (err) {
            console.error(`Error refreshing source ${sourceId}:`, err);
            return false;
        }
    }

    /**
     * Check if an update is pending for a source
     * @private
     */
    _isUpdatePending(sourceId, content) {
        const pendingKey = `${sourceId}:${content.length}`;
        if (this.pendingUpdates.has(pendingKey)) {
            return true;
        }

        // Add to pending updates
        this.pendingUpdates.set(pendingKey, Date.now());

        // Remove after 1 second
        setTimeout(() => {
            this.pendingUpdates.delete(pendingKey);
        }, 1000);

        return false;
    }

    /**
     * Update a source's content
     * @param {number} sourceId - ID of the source to update
     * @param {string} content - New content
     * @param {string} originalJson - Original JSON response (for HTTP sources)
     */
    updateSourceContent(sourceId, content, originalJson = null) {
        try {
            const source = this.sources.find(src => src.sourceId === sourceId);
            if (!source) {
                console.log(`Source ${sourceId} not found, cannot update content`);
                return;
            }

            // Ensure content is not empty/undefined
            if (content === undefined || content === null) {
                console.log(`Received empty content for source ${sourceId}, using placeholder`);
                content = 'No content available';
            }

            // Check for duplicate updates
            if (this._isUpdatePending(sourceId, content)) {
                console.log(`Duplicate update detected for source ${sourceId}, skipping`);
                return;
            }

            // Compare the content for meaningful changes
            const contentChanged = source.sourceContent !== content;

            if (!contentChanged) {
                console.log(`Content for source ${sourceId} unchanged, but emitting update event anyway for UI refresh`);
            } else {
                console.log(`Updating content for source ${sourceId} (${content.length} characters): ${content.substring(0, 30)}${content.length > 30 ? '...' : ''}`);
            }

            // Store the original content for logging
            const originalContent = source.sourceContent;

            // Update the content using the updateContent method
            source.updateContent(content, originalJson);

            // Additional direct set of originalJson to ensure it's properly stored
            // This is a safeguard in case the updateContent method doesn't handle it correctly
            if (originalJson !== null) {
                console.log(`Setting originalJson directly for source ${sourceId} (${originalJson.length} chars)`);
                source.originalJson = originalJson;
            }

            // Save to storage immediately after content update
            this.saveSources().then(() => {
                console.log(`Content for source ${sourceId} saved to storage`);
            }).catch(err => {
                console.error(`Error saving updated content for source ${sourceId}:`, err);
            });

            // Always emit the updated event, even if content hasn't changed
            // This ensures the UI refreshes with the latest content
            this.emit('source:updated', sourceId, content);
            console.log(`Emitted source:updated event for ID ${sourceId}`);

            // Log the change for debugging
            if (contentChanged) {
                console.log(`Source ${sourceId} content changed from "${originalContent.substring(0, 30)}${originalContent.length > 30 ? '...' : ''}" to "${content.substring(0, 30)}${content.length > 30 ? '...' : ''}"`);
            }

            // Log original JSON for debugging
            if (originalJson) {
                console.log(`Stored original JSON for source ${sourceId} (${originalJson.length} chars)`);
            }
        } catch (err) {
            console.error(`Error updating source content for ${sourceId}:`, err);
        }
    }

    /**
     * Save all current sources to storage
     * @returns {Promise<boolean>} Success status
     */
    async saveSources() {
        try {
            console.log(`Saving ${this.sources.length} source(s) to storage`);
            return await this.repository.saveSources(this.sources);
        } catch (err) {
            console.error('Error saving sources:', err);
            return false;
        }
    }

    /**
     * Clean up resources used by the service
     */
    async dispose() {
        try {
            console.log('Disposing SourceService resources');
            await this.fileService.dispose();
            this.envService.dispose();
            this.httpService.dispose();
            this.isInitialized = false;
            console.log('SourceService disposed successfully');
        } catch (err) {
            console.error('Error disposing source service:', err);
        }
    }

    // Updated exportSources method with fs import
    /**
     * Export all sources to a JSON file
     * @param {string} filePath - Path to save the exported sources
     * @returns {Promise<boolean>} Success status
     */
    async exportSources(filePath) {
        try {
            // Require fs module here to avoid "fs is not defined" error
            const fs = require('fs');

            console.log(`Exporting ${this.sources.length} source(s) to ${filePath}`);

            // Get all sources with only the necessary fields for portability
            const exportableSources = this.sources.map(source => ({
                sourceType: source.sourceType,
                sourcePath: source.sourcePath,
                sourceTag: source.sourceTag || '',
                sourceMethod: source.sourceMethod || '',
                requestOptions: source.requestOptions || {},
                refreshOptions: {
                    interval: source.refreshOptions ? source.refreshOptions.interval : 0
                },
                jsonFilter: source.jsonFilter || { enabled: false, path: '' }
            }));

            // Format the JSON with indentation for readability
            const jsonData = JSON.stringify(exportableSources, null, 2);

            // Write to file
            await fs.promises.writeFile(filePath, jsonData, 'utf8');
            console.log(`Successfully exported ${exportableSources.length} source(s) to ${filePath}`);
            return true;
        } catch (err) {
            console.error('Error exporting sources:', err);
            return false;
        }
    }

    /**
     * Import a single source from exported data
     * @param {Object} sourceData - Source data to import
     * @returns {Promise<Source>} The imported source object
     */
    async importSource(sourceData) {
        try {
            // Validate required fields
            if (!sourceData.sourceType || !sourceData.sourcePath) {
                throw new Error('Invalid source data: missing required fields');
            }

            console.log(`Importing source: ${sourceData.sourceType}:${sourceData.sourcePath}`);

            // Check if this source already exists (avoid duplicates)
            const existingSource = this.sources.find(src =>
                src.sourceType === sourceData.sourceType &&
                src.sourcePath === sourceData.sourcePath &&
                (sourceData.sourceType !== 'http' || src.sourceMethod === sourceData.sourceMethod)
            );

            if (existingSource) {
                console.log(`Source already exists with ID ${existingSource.sourceId}, skipping import`);
                return existingSource;
            }

            // Create the source through the regular method
            const newSource = await this.createSource(
                sourceData.sourceType,
                sourceData.sourcePath,
                sourceData.sourceTag || '',
                sourceData.sourceMethod || '',
                sourceData.requestOptions || {},
                sourceData.refreshOptions || { interval: 0 },
                sourceData.jsonFilter || { enabled: false, path: '' }
            );

            console.log(`Successfully imported source with ID ${newSource.sourceId}`);
            return newSource;
        } catch (err) {
            console.error('Error importing source:', err);
            throw err;
        }
    }

    /**
     * Import sources from a JSON file
     * @param {string} filePath - Path to the file containing exported sources
     * @returns {Promise<Array<Source>>} Array of imported sources
     */
    async importSourcesFromFile(filePath) {
        try {
            // Require fs module here
            const fs = require('fs');

            console.log(`Importing sources from file: ${filePath}`);

            // Read and parse the file
            const fileData = await fs.promises.readFile(filePath, 'utf8');
            let sourcesToImport;

            try {
                sourcesToImport = JSON.parse(fileData);
            } catch (parseError) {
                throw new Error(`Invalid JSON format: ${parseError.message}`);
            }

            if (!Array.isArray(sourcesToImport)) {
                throw new Error('Invalid format: file content is not an array');
            }

            console.log(`Found ${sourcesToImport.length} source(s) to import`);

            // Import each source
            const importedSources = [];
            for (const sourceData of sourcesToImport) {
                try {
                    const importedSource = await this.importSource(sourceData);
                    importedSources.push(importedSource);
                } catch (importError) {
                    console.error(`Error importing source: ${importError.message}`);
                }
            }

            // Save all sources to persist changes
            await this.saveSources();

            console.log(`Successfully imported ${importedSources.length} out of ${sourcesToImport.length} source(s)`);

            // Emit event that sources have been updated
            this.emit('sources:loaded', this.sources);

            return importedSources;
        } catch (err) {
            console.error('Error importing sources from file:', err);
            throw err;
        }
    }
}

module.exports = SourceService;