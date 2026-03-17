import electron from 'electron';
import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import mainLogger from '../../../../utils/mainLogger';
import atomicWriter from '../../../../utils/atomicFileWriter';
import windowManager from '../../window/windowManager';
import appLifecycle from '../../app/lifecycle';

const { dialog, app } = electron;
const { createLogger } = mainLogger;
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

    async handleSaveFileDialog(_: any, options: any = {}) {
        try {
            const mainWindow = windowManager.getMainWindow();
            const result = await dialog.showSaveDialog(mainWindow, options);
            return result.canceled ? null : result.filePath;
        } catch (error) {
            log.error('Error in save file dialog:', error);
            throw error;
        }
    }

    async handleReadFile(_: any, filePath: string, encoding: string | null = 'utf8') {
        try {
            // Return binary data for null/'buffer' encoding, otherwise use specified encoding
            if (encoding === null || encoding === 'buffer') {
                return fs.promises.readFile(filePath);
            }
            return fs.promises.readFile(filePath, encoding as BufferEncoding);
        } catch (error) {
            log.error('Error reading file:', error);
            throw error;
        }
    }

    async handleWriteFile(_: any, filePath: string, content: any) {
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

    async handleWatchFile(_: any, sourceId: string, filePath: string) {
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

                watcher.on('change', async (changedPath: string) => {
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

    async handleUnwatchFile(_: any, filePath: string) {
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

    handleGetEnvVariable(_: any, name: string) {
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

    async handleOpenRecordFile(_: any, filePath: string) {
        try {
            return await fs.promises.readFile(filePath, 'utf8');
        } catch (error) {
            log.error('Error opening record file:', error);
            throw error;
        }
    }

    async handleGetResourcePath(_: any, filename: string) {
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

const fileHandlers = new FileHandlers();
export { FileHandlers };
export default fileHandlers;
