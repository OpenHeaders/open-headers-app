const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('../../../../utils/mainLogger');
const atomicWriter = require('../../../../utils/atomicFileWriter');

const log = createLogger('StorageHandlers');

class StorageHandlers {
    async handleSaveToStorage(_, filename, content) {
        try {
            const userDataPath = app.getPath('userData');
            const fullPath = path.join(userDataPath, filename);
            
            log.info(`Saving to storage (atomic): ${fullPath}`);
            
            // Determine if this is JSON data
            const isJson = filename.endsWith('.json');
            
            if (isJson) {
                // Validate and write JSON atomically
                try {
                    const data = JSON.parse(content);
                    await atomicWriter.writeJson(fullPath, data, { pretty: true });
                } catch (parseError) {
                    log.error(`Invalid JSON for ${filename}:`, parseError);
                    // Fallback to regular atomic write if JSON parsing fails
                    // This maintains backward compatibility
                    await atomicWriter.writeFile(fullPath, content);
                }
            } else {
                // Write non-JSON files atomically
                await atomicWriter.writeFile(fullPath, content);
            }
            
            log.debug(`Successfully saved ${filename} atomically`);
            return;
        } catch (error) {
            log.error('Error saving to storage:', error);
            throw error;
        }
    }

    async handleDeleteFromStorage(_, filename) {
        try {
            const userDataPath = app.getPath('userData');
            const storagePath = path.join(userDataPath, filename);
            
            await fs.promises.access(storagePath);
            await fs.promises.unlink(storagePath);
            log.info(`Deleted from storage: ${storagePath}`);
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                log.debug(`File not found for deletion: ${filename}`);
                return true;
            }
            log.error('Error deleting from storage:', error);
            throw error;
        }
    }

    async handleDeleteDirectory(_, dirPath) {
        try {
            const userDataPath = app.getPath('userData');
            const fullPath = path.join(userDataPath, dirPath);
            
            await fs.promises.access(fullPath);
            await fs.promises.rm(fullPath, { recursive: true, force: true });
            log.info(`Deleted directory: ${fullPath}`);
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                log.debug(`Directory not found for deletion: ${dirPath}`);
                return true;
            }
            log.error('Error deleting directory:', error);
            throw error;
        }
    }

    async handleLoadFromStorage(_, filename) {
        try {
            const userDataPath = app.getPath('userData');
            const storagePath = path.join(userDataPath, filename);
            
            log.info(`Loading from storage (atomic): ${storagePath}`);
            
            // Use atomic read to ensure we don't read partially written files
            const content = await atomicWriter.readFile(storagePath);
            
            if (content === null) {
                log.info(`Storage file not found: ${filename}`);
                return null;
            }
            
            // Validate JSON if it's a JSON file
            if (filename.endsWith('.json')) {
                try {
                    JSON.parse(content);
                } catch (parseError) {
                    log.error(`Corrupted JSON in ${filename}:`, parseError);
                    // Return null for corrupted files rather than crashing
                    return null;
                }
            }
            
            return content;
        } catch (err) {
            if (err.code === 'ENOENT') {
                log.info(`Storage file not found: ${filename}`);
                return null;
            }
            log.error('Error loading from storage:', err);
            throw err;
        }
    }
}

module.exports = new StorageHandlers();