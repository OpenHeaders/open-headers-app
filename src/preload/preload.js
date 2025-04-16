// preload.js - Expose specific Electron APIs to the renderer process
const { contextBridge, ipcRenderer } = require('electron');

// Expose selected APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Event handlers
     */
    onInitialSources: (callback) => {
        ipcRenderer.on('initialSources', (event, sources) => {
            callback(sources);
        });
    },
    onSourceContentUpdated: (callback) => {
        ipcRenderer.on('sourceContentUpdated', (event, sourceId, content) => {
            console.log(`preload: Received content update for source ${sourceId} (${content ? content.length : 0} chars)`);
            callback(sourceId, content);
        });
    },

    onSourceRefreshCompleted: (callback) => {
        ipcRenderer.on('sourceRefreshCompleted', (event, sourceId, content) => {
            console.log(`preload: Refresh completed for source ${sourceId} (${content ? content.length : 0} chars)`);
            callback(sourceId, content);
        });
    },

    onRefreshOptionsUpdated: (callback) => {
        ipcRenderer.on('refreshOptionsUpdated', (event, sourceId, refreshOptions) => {
            callback(sourceId, refreshOptions);
        });
    },

    // File operations
    openFileDialog: async () => ipcRenderer.invoke('openFileDialog'),
    saveFileDialog: async (options) => ipcRenderer.invoke('saveFileDialog', options),

    // Import/Export operations
    exportSources: async (filePath) => ipcRenderer.invoke('exportSources', filePath),
    importSources: async (filePath) => ipcRenderer.invoke('importSources', filePath),

    // Add this event handler
    onSourcesImported: (callback) => {
        ipcRenderer.on('sourcesImported', (event, count) => {
            callback(count);
        });
    },

    /**
     * HTTP operations
     */
    testHttpRequest: async (url, method, requestOptions) => {
        console.log("Calling testHttpRequest with:", { url, method, requestOptions });
        return ipcRenderer.invoke('testHttpRequest', url, method, requestOptions);
    },

    /**
     * Source operations
     */
    newSourceWatch: async (sourceId, sourceType, sourcePath, sourceTag, sourceMethod, requestOptions, refreshOptions, jsonFilter, initialContent) => {
        console.log("Calling newSourceWatch with:", {
            sourceId,
            sourceType,
            sourcePath,
            sourceTag,
            sourceMethod,
            requestOptions,
            refreshOptions,
            jsonFilter, // Added as separate parameter
            initialContent: initialContent ? "Content provided" : "No content"
        });
        return ipcRenderer.invoke(
            'newSourceWatch',
            sourceId,
            sourceType,
            sourcePath,
            sourceTag,
            sourceMethod,
            requestOptions,
            refreshOptions,
            jsonFilter, // Added as separate parameter
            initialContent
        );
    },
    removeSourceWatch: async (sourceId) =>
        ipcRenderer.invoke('removeSourceWatch', sourceId),
    refreshHttpSource: async (sourceId) =>
        ipcRenderer.invoke('refreshHttpSource', sourceId),
    updateSources: (sources) => {
        ipcRenderer.send('updateSources', sources);
    },
    updateRefreshOptions: async (sourceId, refreshOptions) => {
        console.log("Calling updateRefreshOptions with:", { sourceId, refreshOptions });
        return ipcRenderer.invoke('updateRefreshOptions', sourceId, refreshOptions);
    },

    /**
     * Settings API
     */
    getSettings: async () => {
        try {
            return await ipcRenderer.invoke('getSettings');
        } catch (error) {
            console.error('Error getting settings:', error);
            // Return default settings if there's an error
            return {
                launchAtLogin: false,
                hideOnLaunch: false,
                showDockIcon: true,
                showStatusBarIcon: true
            };
        }
    },
    saveSettings: async (settings) => {
        try {
            return await ipcRenderer.invoke('saveSettings', settings);
        } catch (error) {
            console.error('Error saving settings:', error);
            return { success: false, message: error.message };
        }
    },

    // Tray-related events
    onShowApp: (callback) => {
        ipcRenderer.on('showApp', () => {
            callback();
        });
    },
    minimizeToTray: () => ipcRenderer.send('minimizeToTray')
});