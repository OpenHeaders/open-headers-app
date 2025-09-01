const { dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { createLogger } = require('../../../../utils/mainLogger');
const atomicWriter = require('../../../../utils/atomicFileWriter');
const windowManager = require('../../window/windowManager');
const appLifecycle = require('../../app/lifecycle');

const log = createLogger('FileHandlers');

class FileHandlers {
    async handleOpenFileDialog() {
        try {
            const mainWindow = windowManager.getMainWindow();
            const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openFile']
            });
            return result.canceled ? null : result.filePaths[0];
        } catch (error) {
            log.error('Error in open file dialog:', error);
            throw error;
        }
    }

    async handleSaveFileDialog(_, options = {}) {
        try {
            const mainWindow = windowManager.getMainWindow();
            const result = await dialog.showSaveDialog(mainWindow, options);
            return result.canceled ? null : result.filePath;
        } catch (error) {
            log.error('Error in save file dialog:', error);
            throw error;
        }
    }

    async handleReadFile(_, filePath, encoding = 'utf8') {
        try {
            // Return binary data for null/'buffer' encoding, otherwise use specified encoding
            if (encoding === null || encoding === 'buffer') {
                return fs.promises.readFile(filePath);
            }
            return fs.promises.readFile(filePath, encoding);
        } catch (error) {
            log.error('Error reading file:', error);
            throw error;
        }
    }

    async handleWriteFile(_, filePath, content) {
        try {
            // Handle both binary (Buffer) and text content
            if (Buffer.isBuffer(content)) {
                // For binary content, use regular fs since atomicWriter is for text
                // Binary files like videos should use streaming anyway
                return fs.promises.writeFile(filePath, content);
            } else {
                // For text content, check if it's JSON
                if (filePath.endsWith('.json')) {
                    try {
                        const data = JSON.parse(content);
                        return atomicWriter.writeJson(filePath, data, { pretty: true });
                    } catch (parseError) {
                        // Not valid JSON, write as plain text
                        return atomicWriter.writeFile(filePath, content);
                    }
                } else {
                    // Non-JSON text file
                    return atomicWriter.writeFile(filePath, content);
                }
            }
        } catch (error) {
            log.error('Error writing file:', error);
            throw error;
        }
    }

    async handleWatchFile(_, sourceId, filePath) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const fileWatchers = appLifecycle.getFileWatchers();

            // Set up file watcher with polling for cross-platform compatibility
            if (!fileWatchers.has(filePath)) {
                const watcher = chokidar.watch(filePath, {
                    persistent: true,
                    usePolling: true,
                    interval: 300
                });

                watcher.on('change', async (changedPath) => {
                    try {
                        const newContent = await fs.promises.readFile(changedPath, 'utf8');
                        windowManager.sendToWindow('fileChanged', sourceId, newContent);
                    } catch (err) {
                        log.error('Error reading changed file:', err);
                    }
                });

                fileWatchers.set(filePath, watcher);
                log.info(`File watch set up for ${filePath}`);
            }

            return content;
        } catch (err) {
            log.error('Error setting up file watch:', err);
            throw err;
        }
    }

    async handleUnwatchFile(_, filePath) {
        try {
            const fileWatchers = appLifecycle.getFileWatchers();
            if (fileWatchers.has(filePath)) {
                const watcher = fileWatchers.get(filePath);
                await watcher.close();
                fileWatchers.delete(filePath);
                log.info(`File watch removed for ${filePath}`);
                return true;
            }
            return false;
        } catch (error) {
            log.error('Error unwatching file:', error);
            throw error;
        }
    }

    handleGetEnvVariable(_, name) {
        try {
            return process.env[name] || `Environment variable '${name}' is not set`;
        } catch (error) {
            log.error('Error getting environment variable:', error);
            throw error;
        }
    }

    handleGetAppPath() {
        return app.getPath('userData');
    }

    async handleOpenRecordFile(_, filePath) {
        try {
            return await fs.promises.readFile(filePath, 'utf8');
        } catch (error) {
            log.error('Error opening record file:', error);
            throw error;
        }
    }

    async handleGetResourcePath(_, filename) {
        try {
            // Check production app resources directory
            const resourcePath = path.join(process.resourcesPath, 'app', 'resources', filename);
            if (fs.existsSync(resourcePath)) {
                return resourcePath;
            }

            // Check development resources directory
            const appPath = path.join(__dirname, '..', '..', '..', '..', 'resources', filename);
            if (fs.existsSync(appPath)) {
                return appPath;
            }

            // Special handling for rrweb player resources
            if (filename.includes('lib/rrweb-player')) {
                const rrwebPath = path.join(__dirname, 'renderer', filename);
                if (fs.existsSync(rrwebPath)) {
                    return rrwebPath;
                }
            }
        } catch (error) {
            log.error('Error getting resource path:', error);
            throw error;
        }

        log.error(`Resource not found: ${filename}`);
        throw new Error(`Resource not found: ${filename}`);
    }
}

module.exports = new FileHandlers();