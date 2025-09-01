const { dialog, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const FFmpegManager = require('./ffmpeg-manager');
const VideoConverter = require('./video-converter');
const { createLogger } = require('../../utils/mainLogger');

const log = createLogger('VideoExportManager');

/**
 * Video Export Manager for handling export dialog and conversion
 */
class VideoExportManager {
    constructor() {
        this.ffmpegManager = new FFmpegManager();
        this.initializeHandlers();
    }

    /**
     * Initialize IPC handlers
     */
    initializeHandlers() {
        // Handle export video request
        ipcMain.handle('export-video', async (event, recordingPath) => {
            return this.showExportDialog(recordingPath);
        });

        // Handle FFmpeg check
        ipcMain.handle('check-ffmpeg', async () => {
            return this.ffmpegManager.checkFFmpeg();
        });

        // Handle FFmpeg download
        ipcMain.handle('download-ffmpeg', async (event) => {
            const sender = event.sender;
            
            try {
                // Send initial downloading status
                sender.send('ffmpeg-install-status', { phase: 'downloading' });
                
                const result = await this.ffmpegManager.downloadFFmpeg((progress) => {
                    // Send progress with both percent and size information
                    sender.send('ffmpeg-download-progress', progress);
                }, (phase) => {
                    // Send phase updates
                    sender.send('ffmpeg-install-status', { phase });
                });
                return { success: true, path: result };
            } catch (error) {
                log.error('FFmpeg download failed:', error);
                return { success: false, error: error.message };
            }
        });

        // Handle video conversion
        ipcMain.handle('convert-video', async (event, inputPath, outputPath) => {
            const sender = event.sender;
            
            try {
                // Ensure FFmpeg is available before converting
                const ffmpegStatus = await this.ffmpegManager.checkFFmpeg();
                if (!ffmpegStatus.available) {
                    throw new Error('FFmpeg not available');
                }
                
                const ffmpegPath = this.ffmpegManager.getFFmpegPath();
                log.info('Using FFmpeg for conversion:', ffmpegPath);
                
                const converter = new VideoConverter(ffmpegPath);
                const result = await converter.convertToMP4(inputPath, outputPath, (progress) => {
                    sender.send('video-conversion-progress', progress);
                });
                return result;
            } catch (error) {
                log.error('Video conversion failed:', error);
                return { success: false, error: error.message };
            }
        });
    }

    /**
     * Show export dialog and handle user choice
     * @param {string} recordingPath Path to the recording
     * @returns {Object} Export result
     */
    async showExportDialog(recordingPath) {
        const window = BrowserWindow.getFocusedWindow();
        
        // Check if video file exists
        const videoPath = path.join(recordingPath, 'video.webm');
        const videoExists = await this.fileExists(videoPath);
        
        if (!videoExists) {
            dialog.showErrorBox(
                'No Video Available',
                'This recording does not have a video file. Only rrweb data is available.'
            );
            return { success: false, error: 'No video file' };
        }

        // Show format selection dialog
        const result = await dialog.showMessageBox(window, {
            type: 'question',
            title: 'Export Video Recording',
            message: 'Choose export format:',
            detail: 'WebM: Native format, instant export, smaller file size\nMP4: Universal compatibility, works in all chat apps',
            buttons: ['Export as MP4', 'Export as WebM', 'Cancel'],
            defaultId: 0,
            cancelId: 2
        });

        if (result.response === 2) {
            // User cancelled
            return { success: false, cancelled: true };
        }

        if (result.response === 1) {
            // Export as WebM
            return this.exportWebM(videoPath);
        }

        // Export as MP4
        return this.exportMP4(videoPath);
    }

    /**
     * Export video as WebM
     * @param {string} videoPath Source video path
     * @returns {Object} Export result
     */
    async exportWebM(videoPath) {
        try {
            const result = await dialog.showSaveDialog({
                title: 'Save Video',
                defaultPath: `recording_${Date.now()}.webm`,
                filters: [
                    { name: 'WebM Video', extensions: ['webm'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (result.canceled) {
                return { success: false, cancelled: true };
            }

            // Copy file to destination
            await fs.copyFile(videoPath, result.filePath);
            
            // Show in file manager
            shell.showItemInFolder(result.filePath);
            
            return { success: true, path: result.filePath, format: 'webm' };
        } catch (error) {
            log.error('Error exporting WebM:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Export video as MP4
     * @param {string} videoPath Source video path
     * @returns {Object} Export result
     */
    async exportMP4(videoPath) {
        try {
            // Check FFmpeg availability
            const ffmpegStatus = await this.ffmpegManager.checkFFmpeg();
            
            if (!ffmpegStatus.available) {
                // Show installation dialog
                const installChoice = await this.showFFmpegInstallDialog();
                
                if (installChoice !== 'install') {
                    // Fall back to WebM export
                    return this.exportWebM(videoPath);
                }
                
                // Install FFmpeg
                const installResult = await this.installFFmpegWithProgress();
                if (!installResult.success) {
                    return installResult;
                }
            }

            // Show save dialog
            const result = await dialog.showSaveDialog({
                title: 'Save Video',
                defaultPath: `recording_${Date.now()}.mp4`,
                filters: [
                    { name: 'MP4 Video', extensions: ['mp4'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (result.canceled) {
                return { success: false, cancelled: true };
            }

            // Convert to MP4
            const convertResult = await this.convertToMP4WithProgress(videoPath, result.filePath);
            
            if (convertResult.success) {
                // Show in file manager
                shell.showItemInFolder(result.filePath);
            }
            
            return convertResult;
        } catch (error) {
            log.error('Error exporting MP4:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Show FFmpeg installation dialog
     * @returns {string} User choice
     */
    async showFFmpegInstallDialog() {
        const result = await dialog.showMessageBox({
            type: 'question',
            title: 'MP4 Export Requires FFmpeg',
            message: 'To export videos as MP4, FFmpeg needs to be installed.',
            detail: 'FFmpeg is a free, open-source tool for video conversion. It will be downloaded automatically (~25MB) and stored in the app folder.',
            buttons: ['Install FFmpeg', 'Export as WebM Instead'],
            defaultId: 0,
            cancelId: 1
        });

        return result.response === 0 ? 'install' : 'webm';
    }

    /**
     * Install FFmpeg with progress window
     * @returns {Object} Installation result
     */
    async installFFmpegWithProgress() {
        // Create progress window
        const progressWindow = new BrowserWindow({
            width: 400,
            height: 200,
            modal: true,
            parent: BrowserWindow.getFocusedWindow(),
            frame: false,
            resizable: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../preload.js')
            }
        });

        // Load progress HTML
        const progressHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        margin: 0;
                        padding: 20px;
                        background: #f0f0f0;
                        user-select: none;
                    }
                    .container {
                        background: white;
                        border-radius: 8px;
                        padding: 30px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    h2 {
                        margin: 0 0 20px 0;
                        color: #333;
                        font-size: 18px;
                    }
                    .progress-bar {
                        width: 100%;
                        height: 20px;
                        background: #e0e0e0;
                        border-radius: 10px;
                        overflow: hidden;
                    }
                    .progress-fill {
                        height: 100%;
                        background: #4CAF50;
                        width: 0%;
                        transition: width 0.3s ease;
                    }
                    .status {
                        margin-top: 15px;
                        color: #666;
                        font-size: 14px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>Downloading FFmpeg...</h2>
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress"></div>
                    </div>
                    <div class="status" id="status">Preparing download...</div>
                </div>
                <script>
                    window.electronAPI.onFFmpegDownloadProgress((progress) => {
                        document.getElementById('progress').style.width = progress.percent + '%';
                        document.getElementById('status').textContent = 
                            \`Downloaded \${Math.round(progress.downloaded / 1024 / 1024)}MB of \${Math.round(progress.total / 1024 / 1024)}MB\`;
                    });
                </script>
            </body>
            </html>
        `;

        await progressWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(progressHtml)}`);
        progressWindow.show();

        try {
            // Add progress listener
            ipcMain.on('ffmpeg-download-progress', (event, progress) => {
                if (!progressWindow.isDestroyed()) {
                    progressWindow.webContents.send('ffmpeg-download-progress', progress);
                }
            });

            await this.ffmpegManager.downloadFFmpeg((progress) => {
                if (!progressWindow.isDestroyed()) {
                    progressWindow.webContents.send('ffmpeg-download-progress', progress);
                }
            }, (phase) => {
                if (!progressWindow.isDestroyed()) {
                    // Update the progress window content based on phase
                    if (phase === 'extracting') {
                        progressWindow.webContents.executeJavaScript(`
                            document.querySelector('h2').textContent = 'Extracting FFmpeg...';
                            document.getElementById('status').textContent = 'Extracting files...';
                            document.getElementById('progress').style.width = '100%';
                        `);
                    } else if (phase === 'verifying') {
                        progressWindow.webContents.executeJavaScript(`
                            document.querySelector('h2').textContent = 'Verifying FFmpeg...';
                            document.getElementById('status').textContent = 'Verifying installation...';
                        `);
                    }
                }
            });

            progressWindow.close();
            
            dialog.showMessageBox({
                type: 'info',
                title: 'FFmpeg Installed',
                message: 'FFmpeg has been installed successfully.',
                buttons: ['OK']
            });
            
            return { success: true };
        } catch (error) {
            if (!progressWindow.isDestroyed()) {
                progressWindow.close();
            }
            
            dialog.showErrorBox(
                'Installation Failed',
                `Failed to install FFmpeg: ${error.message}\n\nYou can still export as WebM.`
            );
            
            return { success: false, error: error.message };
        }
    }

    /**
     * Convert to MP4 with progress window
     * @param {string} inputPath Input video path
     * @param {string} outputPath Output video path
     * @returns {Object} Conversion result
     */
    async convertToMP4WithProgress(inputPath, outputPath) {
        // Create progress window
        const progressWindow = new BrowserWindow({
            width: 400,
            height: 200,
            modal: true,
            parent: BrowserWindow.getFocusedWindow(),
            frame: false,
            resizable: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../preload.js')
            }
        });

        // Load conversion progress HTML
        const progressHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        margin: 0;
                        padding: 20px;
                        background: #f0f0f0;
                        user-select: none;
                    }
                    .container {
                        background: white;
                        border-radius: 8px;
                        padding: 30px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    h2 {
                        margin: 0 0 20px 0;
                        color: #333;
                        font-size: 18px;
                    }
                    .progress-bar {
                        width: 100%;
                        height: 20px;
                        background: #e0e0e0;
                        border-radius: 10px;
                        overflow: hidden;
                    }
                    .progress-fill {
                        height: 100%;
                        background: #2196F3;
                        width: 0%;
                        transition: width 0.3s ease;
                    }
                    .status {
                        margin-top: 15px;
                        color: #666;
                        font-size: 14px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>Converting to MP4...</h2>
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress"></div>
                    </div>
                    <div class="status" id="status">Starting conversion...</div>
                </div>
                <script>
                    window.electronAPI.onVideoConversionProgress((progress) => {
                        document.getElementById('progress').style.width = progress.percent + '%';
                        document.getElementById('status').textContent = 
                            \`Converting... \${progress.percent}% complete\`;
                    });
                </script>
            </body>
            </html>
        `;

        await progressWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(progressHtml)}`);
        progressWindow.show();

        try {
            const converter = new VideoConverter(this.ffmpegManager.getFFmpegPath());
            const result = await converter.convertToMP4(inputPath, outputPath, (progress) => {
                if (!progressWindow.isDestroyed()) {
                    progressWindow.webContents.send('video-conversion-progress', progress);
                }
            });

            progressWindow.close();
            return result;
        } catch (error) {
            if (!progressWindow.isDestroyed()) {
                progressWindow.close();
            }
            
            dialog.showErrorBox(
                'Conversion Failed',
                `Failed to convert video: ${error.message}`
            );
            
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if file exists
     * @param {string} filePath File path
     * @returns {boolean} True if exists
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = new VideoExportManager();