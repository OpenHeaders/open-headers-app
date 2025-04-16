// source-repository.js - Repository for source data persistence
const fs = require('fs');
const Source = require('../models/source');
const appConfig = require('../config/app-config');

/**
 * Repository for managing source data persistence
 */
class SourceRepository {
    constructor() {
        this.filePath = appConfig.storage.sourcesFile;
        console.log(`SourceRepository initialized with path: ${this.filePath}`);

        // Create storage directory if it doesn't exist
        this._ensureStorageDirectory();
    }

    /**
     * Ensure the storage directory exists
     * @private
     */
    _ensureStorageDirectory() {
        try {
            const dirPath = require('path').dirname(this.filePath);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                console.log(`Created storage directory: ${dirPath}`);
            }
        } catch (err) {
            console.error('Error ensuring storage directory exists:', err);
        }
    }

    /**
     * Save sources to disk
     * @param {Source[]} sources - Array of sources to save
     * @returns {Promise<boolean>}
     */
    async saveSources(sources) {
        try {
            // Debug each source before saving
            console.log(`About to save ${sources.length} source(s) to disk`);

            // Check for originalJson content in each source
            sources.forEach(source => {
                if (source.sourceType === 'http') {
                    console.log(`Source ${source.sourceId} - originalJson length: ${source.originalJson ? source.originalJson.length : 0} chars`);

                    // If originalJson is missing but we have sourceContent, create a note
                    if (!source.originalJson && source.sourceContent) {
                        console.warn(`Source ${source.sourceId} has content but no originalJson`);
                    }
                }
            });

            // Create a deep copy of each source to ensure all properties are included
            const sourcesToSave = sources.map(source => {
                // First get the source's own serialization
                const serialized = source.toJSON();

                // Double-check that originalJson is included
                if (source.sourceType === 'http' && !serialized.originalJson && source.originalJson) {
                    console.log(`Fixing missing originalJson in serialized source ${source.sourceId}`);
                    serialized.originalJson = source.originalJson;
                }

                return serialized;
            });

            // Log the stringified output for debugging
            const data = JSON.stringify(sourcesToSave, null, 2);
            console.log(`Serialized ${sourcesToSave.length} source(s), data length: ${data.length} chars`);

            // Check if originalJson is in the stringified output
            if (sources.some(src => src.sourceType === 'http' && src.originalJson) &&
                !data.includes('"originalJson":')) {
                console.warn(`WARNING: originalJson might be missing from serialized data`);
            }

            await fs.promises.writeFile(this.filePath, data, 'utf8');
            console.log(`Saved ${sources.length} source(s) to disk at ${this.filePath}`);
            return true;
        } catch (err) {
            console.error('Error saving sources to disk:', err);
            return false;
        }
    }

    /**
     * Load sources from disk
     * @returns {Promise<Source[]>} Array of source objects
     */
    async loadSources() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = await fs.promises.readFile(this.filePath, 'utf8');

                // Handle empty file case
                if (!data || data.trim() === '') {
                    console.log('Sources file exists but is empty');
                    return [];
                }

                const parsedData = JSON.parse(data);
                const sources = parsedData.map(item => Source.fromJSON(item));
                console.log(`Loaded ${sources.length} source(s) from disk at ${this.filePath}`);
                return sources;
            } else {
                console.log(`Sources file not found at ${this.filePath}, returning empty array`);
                return [];
            }
        } catch (err) {
            console.error('Error loading sources from disk:', err);
            // Create an empty file to prevent future errors
            try {
                await fs.promises.writeFile(this.filePath, '[]', 'utf8');
                console.log(`Created empty sources file at ${this.filePath}`);
            } catch (writeErr) {
                console.error('Error creating empty sources file:', writeErr);
            }
            return [];
        }
    }
}

module.exports = SourceRepository;