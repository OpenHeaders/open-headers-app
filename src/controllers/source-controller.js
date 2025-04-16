// source-controller.js - Controller for source-related IPC events
const { ipcMain, dialog } = require('electron');
const Source = require('../models/source');

/**
 * Controller for handling source-related IPC events
 */
class SourceController {
    /**
     * Create a new SourceController
     * @param {BrowserWindow} window - The main browser window
     * @param {SourceService} sourceService - The source service
     */
    constructor(window, sourceService) {
        this.window = window;
        this.sourceService = sourceService;
        this.hasRendererInitialized = false;

        // Register IPC handlers
        this._registerIpcHandlers();

        // Register for source service events if available
        if (this.sourceService && typeof this.sourceService.on === 'function') {
            this._registerServiceEvents();
        } else {
            console.error('SourceService missing or does not support events');
        }
    }

    /**
     * Check if the source service has a method
     * @private
     * @param {string} methodName - The method to check for
     * @returns {boolean} - Whether the method exists
     */
    _hasServiceMethod(methodName) {
        return this.sourceService && typeof this.sourceService[methodName] === 'function';
    }

    /**
     * Register IPC event handlers
     * @private
     */
    _registerIpcHandlers() {
        try {
            // File dialog
            ipcMain.handle('openFileDialog', this._handleOpenFileDialog.bind(this));

            ipcMain.handle('updateRefreshOptions', this._handleUpdateRefreshOptions.bind(this));

            // HTTP request testing
            ipcMain.handle('testHttpRequest', this._handleTestHttpRequest.bind(this));

            // Source management
            ipcMain.handle('newSourceWatch', this._handleNewSourceWatch.bind(this));
            ipcMain.handle('removeSourceWatch', this._handleRemoveSourceWatch.bind(this));
            ipcMain.handle('refreshHttpSource', this._handleRefreshHttpSource.bind(this));
            ipcMain.on('updateSources', this._handleUpdateSources.bind(this));

            console.log('IPC handlers registered successfully');
        } catch (error) {
            console.error('Error registering IPC handlers:', error);
        }
    }

    /**
     * Register for source service events
     * @private
     */
    _registerServiceEvents() {
        try {
            this.sourceService.on('source:updated', (sourceId, content) => {
                if (this.window && !this.window.isDestroyed()) {
                    this.window.webContents.send('sourceContentUpdated', sourceId, content);
                }
            });

            this.sourceService.on('source:refreshOptionsUpdated', (sourceId, refreshOptions) => {
                if (this.window && !this.window.isDestroyed()) {
                    this.window.webContents.send('refreshOptionsUpdated', sourceId, refreshOptions);
                }
            });

            // Listen for sources:loaded event from the service
            this.sourceService.on('sources:loaded', (sources) => {
                console.log('Sources loaded event received');
                this._sendSourcesToRenderer();
            });

            // Listen for refresh completion event (even when content hasn't changed)
            this.sourceService.on('source:refreshed', (sourceId, content) => {
                if (this.window && !this.window.isDestroyed()) {
                    console.log(`Refresh completed for source ${sourceId}, notifying renderer`);
                    this.window.webContents.send('sourceRefreshCompleted', sourceId, content);
                }
            });

            console.log('Source service events registered');
        } catch (error) {
            console.error('Error registering source service events:', error);
        }
    }

    /**
     * Send sources to the renderer process
     * @private
     */
    _sendSourcesToRenderer() {
        if (this.window && !this.window.isDestroyed() && this._hasServiceMethod('getAllSources')) {
            const sources = this.sourceService.getAllSources();
            console.log(`Sending ${sources.length} source(s) to renderer`);

            if (this.window.webContents.isLoading()) {
                console.log('Window still loading, waiting for did-finish-load event');
                return;
            }

            this.window.webContents.send('initialSources', sources);
            this.hasRendererInitialized = true;
        }
    }

    /**
     * Handle the updateRefreshOptions IPC event
     * @private
     */
    async _handleUpdateRefreshOptions(event, sourceId, refreshOptions) {
        try {
            console.log(`Update refresh options requested for ID ${sourceId}`, refreshOptions);

            if (!this._hasServiceMethod('updateRefreshOptions')) {
                throw new Error('updateRefreshOptions method not available');
            }

            return await this.sourceService.updateRefreshOptions(sourceId, refreshOptions);
        } catch (err) {
            console.error('Error updating refresh options:', err);
            return false;
        }
    }

    /**
     * Handle the openFileDialog IPC event
     * @private
     */
    async _handleOpenFileDialog() {
        try {
            const result = await dialog.showOpenDialog(this.window, {
                properties: ['openFile'],
            });
            if (!result.canceled && result.filePaths?.length) {
                return result.filePaths[0];
            }
            return null;
        } catch (error) {
            console.error('Error handling openFileDialog:', error);
            return null;
        }
    }

    /**
     * Handle the testHttpRequest IPC event
     * @private
     */
    async _handleTestHttpRequest(event, requestUrl, method, requestOptions) {
        try {
            if (!this._hasServiceMethod('testHttpRequest')) {
                throw new Error('testHttpRequest method not available');
            }
            return await this.sourceService.testHttpRequest(requestUrl, method, requestOptions);
        } catch (err) {
            console.error('Error testing HTTP request:', err);
            throw err; // Re-throw to propagate to renderer
        }
    }

    /**
     * Handle the newSourceWatch IPC event
     * @private
     */
    async _handleNewSourceWatch(event, sourceId, sourceType, sourcePath, sourceTag, sourceMethod, requestOptions, refreshOptions, jsonFilter, initialContent) {
        try {
            console.log(`New source watch requested for ID ${sourceId} (${sourceType}: ${sourcePath})`);
            console.log(`Initial content provided: ${initialContent ? `Yes (${initialContent.length} chars)` : 'No'}`);
            console.log(`JSON Filter: ${jsonFilter ? `${jsonFilter.enabled ? 'Enabled' : 'Disabled'} - Path: ${jsonFilter.path}` : 'None'}`);

            // Check if required methods exist
            if (!this._hasServiceMethod('getAllSources') ||
                !this._hasServiceMethod('createSource') ||
                !this._hasServiceMethod('watchSource')) {
                throw new Error('Required source service methods not available');
            }

            // Check if we need to create a new source or if it already exists
            const existingSource = this.sourceService.getAllSources()
                .find(src => src.sourceId === sourceId);

            if (!existingSource) {
                // Create a new source
                console.log(`Creating new source with ID ${sourceId}, initial content: ${initialContent ? 'provided' : 'not provided'}`);
                await this.sourceService.createSource(
                    sourceType,
                    sourcePath,
                    sourceTag,
                    sourceMethod,
                    requestOptions,
                    refreshOptions,
                    jsonFilter, // Pass jsonFilter as separate parameter
                    initialContent
                );
            } else {
                // Just start watching an existing source
                console.log(`Source ${sourceId} already exists, just watching`);
                await this.sourceService.watchSource(existingSource);
            }

            return true;
        } catch (err) {
            console.error('Error creating source watch:', err);
            return false;
        }
    }

    /**
     * Handle the removeSourceWatch IPC event
     * @private
     */
    async _handleRemoveSourceWatch(event, sourceId) {
        try {
            console.log(`Remove source watch requested for ID ${sourceId}`);

            if (!this._hasServiceMethod('removeSource')) {
                throw new Error('removeSource method not available');
            }

            return await this.sourceService.removeSource(sourceId);
        } catch (err) {
            console.error('Error removing source watch:', err);
            return false;
        }
    }

    /**
     * Handle the refreshHttpSource IPC event
     * @private
     */
    async _handleRefreshHttpSource(event, sourceId) {
        try {
            console.log(`Refresh HTTP source requested for ID ${sourceId}`);

            if (!this._hasServiceMethod('refreshSource')) {
                throw new Error('refreshSource method not available');
            }

            return await this.sourceService.refreshSource(sourceId);
        } catch (err) {
            console.error('Error refreshing HTTP source:', err);
            return false;
        }
    }

    /**
     * Handle the updateSources IPC event
     * @private
     */
    async _handleUpdateSources(event, sources) {
        try {
            console.log(`Update sources requested with ${sources.length} source(s)`);

            if (!this._hasServiceMethod('saveSources')) {
                throw new Error('saveSources method not available');
            }

            // First get existing sources to preserve fields that might not be in the renderer
            const existingSources = this.sourceService.sources;

            // Create a map of existing sources by ID for quick lookup
            const existingSourcesMap = new Map();
            existingSources.forEach(src => {
                existingSourcesMap.set(src.sourceId, src);
            });

            // Replace all sources with the new set from the renderer
            // BUT preserve fields like originalJson from existing sources
            this.sourceService.sources = sources.map(src => {
                // Check if this source already exists
                const existingSource = existingSourcesMap.get(src.sourceId);

                // Merge data from existing source if it exists
                const mergedData = {
                    sourceId: src.sourceId,
                    sourceType: src.sourceType,
                    sourcePath: src.sourcePath,
                    sourceTag: src.sourceTag || '',
                    sourceMethod: src.sourceMethod || '',
                    sourceContent: src.sourceContent || '',

                    // IMPORTANT: Preserve originalJson from existing source if available
                    originalJson: (existingSource && existingSource.originalJson) || src.originalJson || '',

                    requestOptions: src.requestOptions || {},
                    refreshOptions: src.refreshOptions || {},
                    jsonFilter: src.jsonFilter || {enabled: false, path: ''}
                };

                // If we're preserving original JSON, log it
                if (existingSource && existingSource.originalJson &&
                    existingSource.originalJson.length > 0) {
                    console.log(`Preserved originalJson (${existingSource.originalJson.length} chars) for source ${src.sourceId}`);
                }

                return new Source(mergedData);
            });

            console.log(`Replaced sources in service, now have ${this.sourceService.sources.length} source(s)`);

            // Verify originalJson values are preserved
            this.sourceService.sources.forEach(src => {
                if (src.sourceType === 'http') {
                    console.log(`After replacement, source ${src.sourceId} has originalJson length: ${src.originalJson ? src.originalJson.length : 0} chars`);
                }
            });

            // Save to storage
            await this.sourceService.saveSources();
            console.log('Sources saved to storage');

            return true;
        } catch (err) {
            console.error('Error updating sources:', err);
            return false;
        }
    }

    /**
     * Register IPC event handlers
     * @private
     */
    _registerIpcHandlers() {
        try {
            // File dialog
            ipcMain.handle('openFileDialog', this._handleOpenFileDialog.bind(this));

            // Add these new handlers for import/export
            ipcMain.handle('saveFileDialog', this._handleSaveFileDialog.bind(this));
            ipcMain.handle('exportSources', this._handleExportSources.bind(this));
            ipcMain.handle('importSources', this._handleImportSources.bind(this));

            // HTTP request testing
            ipcMain.handle('testHttpRequest', this._handleTestHttpRequest.bind(this));

            // Refresh options
            ipcMain.handle('updateRefreshOptions', this._handleUpdateRefreshOptions.bind(this));

            // Source management
            ipcMain.handle('newSourceWatch', this._handleNewSourceWatch.bind(this));
            ipcMain.handle('removeSourceWatch', this._handleRemoveSourceWatch.bind(this));
            ipcMain.handle('refreshHttpSource', this._handleRefreshHttpSource.bind(this));
            ipcMain.on('updateSources', this._handleUpdateSources.bind(this));

            console.log('IPC handlers registered successfully');
        } catch (error) {
            console.error('Error registering IPC handlers:', error);
        }
    }

    /**
     * Handle the saveFileDialog IPC event
     * @private
     */
    async _handleSaveFileDialog(event, options = {}) {
        try {
            const defaultOptions = {
                title: 'Save File',
                buttonLabel: 'Save',
                filters: [
                    { name: 'JSON Files', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            };

            // Merge default options with provided options
            const dialogOptions = { ...defaultOptions, ...options };

            const result = await dialog.showSaveDialog(this.window, dialogOptions);
            if (result.canceled) {
                return null;
            }

            return result.filePath;
        } catch (error) {
            console.error('Error handling saveFileDialog:', error);
            return null;
        }
    }

    /**
     * Handle the exportSources IPC event
     * @private
     */
    async _handleExportSources(event, filePath) {
        try {
            console.log(`Export sources requested to path: ${filePath}`);

            if (!this._hasServiceMethod('exportSources')) {
                throw new Error('exportSources method not available');
            }

            const success = await this.sourceService.exportSources(filePath);

            if (success) {
                console.log(`Successfully exported sources to ${filePath}`);
                return { success: true, message: `Successfully exported sources to ${filePath}` };
            } else {
                throw new Error(`Failed to export sources to ${filePath}`);
            }
        } catch (err) {
            console.error('Error exporting sources:', err);
            return { success: false, message: err.message };
        }
    }

    /**
     * Handle the importSources IPC event
     * @private
     */
    async _handleImportSources(event, filePath) {
        try {
            console.log(`Import sources requested from path: ${filePath}`);

            if (!this._hasServiceMethod('importSourcesFromFile')) {
                throw new Error('importSourcesFromFile method not available');
            }

            const importedSources = await this.sourceService.importSourcesFromFile(filePath);

            if (importedSources && importedSources.length > 0) {
                console.log(`Successfully imported ${importedSources.length} source(s)`);

                // Notify renderer about imported sources
                if (this.window && !this.window.isDestroyed()) {
                    this.window.webContents.send('sourcesImported', importedSources.length);
                }

                return {
                    success: true,
                    message: `Successfully imported ${importedSources.length} source(s)`,
                    count: importedSources.length
                };
            } else {
                return {
                    success: true,
                    message: 'No sources were imported',
                    count: 0
                };
            }
        } catch (err) {
            console.error('Error importing sources:', err);
            return { success: false, message: err.message, count: 0 };
        }
    }
}

module.exports = SourceController;