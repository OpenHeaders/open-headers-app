// file-service.js - Service for file sources
const fs = require('fs');
const chokidar = require('chokidar');
const appConfig = require('../config/app-config');

/**
 * Service for handling file-based sources
 */
class FileService {
    constructor() {
        // Map of file paths to their watchers and associated source IDs
        // filePath -> { watcher, sourceIds[] }
        this.watchersByFile = new Map();
        this.pendingCallbacks = new Map();
    }

    /**
     * Watch a file for changes
     * @param {string} filePath - Path to the file
     * @param {number} sourceId - ID of the source
     * @param {Function} onUpdate - Callback for content updates
     * @returns {Promise<string>} Initial file content
     */
    async watchFile(filePath, sourceId, onUpdate) {
        console.log(`Setting up watch for file: ${filePath}`);

        // Check if we already have a pending callback for this source
        const pendingKey = `${sourceId}:${filePath}`;
        if (this.pendingCallbacks.has(pendingKey)) {
            console.log(`Already have a pending callback for ${pendingKey}, skipping duplicate`);
            return '';
        }

        // If not already watching this file, create a watcher
        if (!this.watchersByFile.has(filePath)) {
            try {
                console.log(`Creating new watcher for file: ${filePath}`);

                const watcher = chokidar.watch(filePath, {
                    ignoreInitial: true,
                    persistent: true,
                    usePolling: appConfig.fileWatch.usePolling,
                    interval: appConfig.fileWatch.interval,
                });

                this.watchersByFile.set(filePath, {
                    watcher,
                    sourceIds: [sourceId],
                });

                // When file changes, read + notify
                watcher.on('change', async (changedPath) => {
                    console.log('File changed:', changedPath);
                    try {
                        const data = await fs.promises.readFile(changedPath, 'utf8');
                        console.log(`Read ${data.length} characters from changed file`);
                        this._notifyUpdates(changedPath, data, onUpdate);
                    } catch (err) {
                        console.error('Error reading file after change:', err);
                        // Notify with error message so UI shows something
                        this._notifyUpdates(changedPath, `Error reading file: ${err.message}`, onUpdate);
                    }
                });

                watcher.on('error', (err) => {
                    console.error('Watcher error:', err);
                });

                console.log(`Watcher created successfully for file: ${filePath}`);
            } catch (err) {
                console.error(`Error creating watcher for file ${filePath}:`, err);
            }
        } else {
            const entry = this.watchersByFile.get(filePath);
            if (!entry.sourceIds.includes(sourceId)) {
                entry.sourceIds.push(sourceId);
                console.log(`Added source ID ${sourceId} to existing watcher for file: ${filePath}`);
            }
        }

        // Read content immediately upon watch
        try {
            console.log(`Reading initial content from file: ${filePath}`);

            // Mark this callback as pending
            this.pendingCallbacks.set(pendingKey, true);

            // Verify the file exists first
            if (!fs.existsSync(filePath)) {
                console.error(`File not found: ${filePath}`);
                this.pendingCallbacks.delete(pendingKey);
                return `File not found: ${filePath}`;
            }

            const data = await fs.promises.readFile(filePath, 'utf8');
            console.log(`Read ${data.length} characters from file initially`);

            // Remove from pending callbacks
            this.pendingCallbacks.delete(pendingKey);

            // Call the update callback immediately with the initial content
            onUpdate(sourceId, data);
            console.log(`Called update with initial content for source ${sourceId}`);

            return data;
        } catch (err) {
            console.error(`Error reading file initially: ${filePath}`, err);
            this.pendingCallbacks.delete(pendingKey);
            return `Error reading file: ${err.message}`;
        }
    }

    /**
     * Remove a file watch
     * @param {number} sourceId - ID of the source
     * @param {string} filePath - Path to the file
     */
    async removeWatch(sourceId, filePath) {
        console.log(`Removing watch for source ${sourceId}, file: ${filePath}`);

        // Clear any pending callbacks
        const pendingKey = `${sourceId}:${filePath}`;
        this.pendingCallbacks.delete(pendingKey);

        const entry = this.watchersByFile.get(filePath);
        if (!entry) {
            console.log(`No watcher found for file: ${filePath}`);
            return;
        }

        entry.sourceIds = entry.sourceIds.filter(id => id !== sourceId);
        console.log(`Removed source ${sourceId} from watcher for file: ${filePath}`);

        if (entry.sourceIds.length === 0) {
            try {
                await entry.watcher.close();
                this.watchersByFile.delete(filePath);
                console.log(`Watcher closed for file "${filePath}".`);
            } catch (err) {
                console.error(`Error closing watcher for file ${filePath}:`, err);
            }
        }
    }

    /**
     * Dispose of all file watchers
     */
    async dispose() {
        console.log('Disposing all file watchers');

        // Clear all pending callbacks
        this.pendingCallbacks.clear();

        for (const [filePath, { watcher }] of this.watchersByFile.entries()) {
            try {
                await watcher.close();
                console.log(`Watcher closed for file "${filePath}".`);
            } catch (err) {
                console.error(`Error closing watcher for file ${filePath}:`, err);
            }
        }
        this.watchersByFile.clear();
        console.log('All file watchers disposed');
    }

    /**
     * Notify all sources for a file about content updates
     * @private
     * @param {string} filePath - Path to the file
     * @param {string} data - New file content
     * @param {Function} onUpdate - Callback for content updates
     */
    _notifyUpdates(filePath, data, onUpdate) {
        const entry = this.watchersByFile.get(filePath);
        if (!entry) {
            console.log(`No watcher entry found for file: ${filePath}`);
            return;
        }

        // Notify about the update for each source ID
        for (const sourceId of entry.sourceIds) {
            console.log(`Notifying source ${sourceId} about content update for file: ${filePath}`);
            onUpdate(sourceId, data);
        }
    }
}

module.exports = FileService;