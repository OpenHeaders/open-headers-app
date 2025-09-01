const { desktopCapturer, BrowserWindow } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../../utils/mainLogger');
const atomicWriter = require('../../utils/atomicFileWriter');

const log = createLogger('VideoCaptureService');

/**
 * Service for capturing video recordings of browser windows
 */
class VideoCaptureService {
    constructor() {
        this.activeRecordings = new Map();
        this.appDataPath = null;
        this.recordingsPath = null;
    }

    /**
     * Initialize the video capture service
     * @param {string} appDataPath - Application data path
     */
    async initialize(appDataPath) {
        this.appDataPath = appDataPath;
        this.recordingsPath = path.join(appDataPath, 'recordings');
        
        // Ensure recordings directory exists
        await fs.mkdir(this.recordingsPath, { recursive: true });
        
        log.info('Video capture service initialized');
    }

    /**
     * Start recording a window
     * @param {Object} options - Recording options
     * @returns {Object} Result object
     */
    async startRecording(options) {
        const { recordingId, url, title, windowId, tabId, displayInfo, videoQuality = 'high' } = options;

        try {
            // Check if already recording
            if (this.activeRecordings.has(recordingId)) {
                return { success: false, error: 'Recording already in progress' };
            }

            // Find the target window/screen - pass displayInfo from browser
            const targetSource = await this.findTargetWindow(url, title, displayInfo);
            if (!targetSource) {
                return { success: false, error: 'Could not find target window' };
            }

            // Create recording directory
            const recordingDir = path.join(this.recordingsPath, recordingId);
            await fs.mkdir(recordingDir, { recursive: true });

            // Get the window for MediaRecorder
            const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            
            // Execute recording in renderer process
            const result = await this.startRecordingInRenderer(mainWindow, {
                sourceId: targetSource.id,
                captureType: targetSource.captureType || 'window',
                recordingId,
                recordingDir,
                url,
                title,
                videoQuality
            });

            if (result.success) {
                // Store recording info
                this.activeRecordings.set(recordingId, {
                    recordingId,
                    sourceId: targetSource.id,
                    url,
                    title,
                    tabId,
                    windowId,
                    startTime: Date.now(),
                    recordingDir,
                    status: 'recording'
                });

                log.info(`Started recording ${recordingId} for window: ${title}`);
            }

            return result;
        } catch (error) {
            log.error('Error starting recording:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Stop recording
     * @param {string} recordingId - Recording ID
     * @returns {Object} Result object
     */
    async stopRecording(recordingId) {
        try {
            const recording = this.activeRecordings.get(recordingId);
            if (!recording) {
                return { success: false, error: 'Recording not found' };
            }

            // Get the window
            const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            
            // Stop recording in renderer
            const result = await this.stopRecordingInRenderer(mainWindow, recordingId);

            if (result.success) {
                // Update recording info
                recording.status = 'stopped';
                recording.endTime = Date.now();
                recording.duration = recording.endTime - recording.startTime;
                recording.videoPath = result.videoPath;

                // Save metadata
                await this.saveRecordingMetadata(recording);

                // Remove from active recordings
                this.activeRecordings.delete(recordingId);

                log.info(`Stopped recording ${recordingId}`);
            }

            return result;
        } catch (error) {
            log.error('Error stopping recording:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update recording state
     * @param {string} recordingId - Recording ID
     * @param {string} state - New state
     */
    async updateRecordingState(recordingId, state) {
        const recording = this.activeRecordings.get(recordingId);
        if (recording) {
            recording.state = state;
            log.info(`Updated recording ${recordingId} state to: ${state}`);
        }
    }

    /**
     * Find target window by URL and title
     * @param {string} url - Window URL
     * @param {string} title - Window title
     * @param {Object} displayInfo - Display info from browser extension
     * @returns {Object} Source object or null
     */
    async findTargetWindow(url, title, displayInfo) {
        try {
            // Get both screen and window sources - SCREEN FIRST for priority
            const sources = await desktopCapturer.getSources({ 
                types: ['screen', 'window'],
                thumbnailSize: { width: 150, height: 150 }
            });

            // ALWAYS use screen capture when available - it has no offset issues
            const screenSources = sources.filter(s => s.id.startsWith('screen:'));
            log.info(`Available screen sources: ${screenSources.map(s => `${s.id}: ${s.name}`).join(', ')}`);
            
            let selectedScreen = null;
            
            // If we have display info from the browser, use it to select the correct screen
            if (displayInfo && displayInfo.currentDisplay) {
                const { screen } = require('electron');
                const displays = screen.getAllDisplays();
                
                const browserCurrentDisplay = displayInfo.currentDisplay;
                const browserAllDisplays = displayInfo.allDisplays || [];
                
                log.info(`Browser detected ${browserAllDisplays.length} display(s)`);
                log.info(`Browser window is on display: ${browserCurrentDisplay.name || browserCurrentDisplay.id}`);
                log.info(`Display bounds: ${JSON.stringify(browserCurrentDisplay.bounds)}`);
                log.info(`Window position: ${JSON.stringify(displayInfo.windowPosition)}`);
                
                // Log all browser displays for debugging
                browserAllDisplays.forEach((d, i) => {
                    log.info(`Browser display ${i}: ${d.name || d.id} at (${d.bounds.left}, ${d.bounds.top}) size ${d.bounds.width}x${d.bounds.height}`);
                });
                
                // Log all Electron displays
                displays.forEach((d, i) => {
                    log.info(`Electron display ${i}: ID=${d.id} at (${d.bounds.x}, ${d.bounds.y}) size ${d.bounds.width}x${d.bounds.height}`);
                });
                
                // Match the browser's current display with Electron's displays
                let targetDisplay = null;
                let bestMatchScore = Infinity;
                
                for (const display of displays) {
                    // Calculate match score based on bounds similarity
                    const xDiff = Math.abs(display.bounds.x - browserCurrentDisplay.bounds.left);
                    const yDiff = Math.abs(display.bounds.y - browserCurrentDisplay.bounds.top);
                    const widthDiff = Math.abs(display.bounds.width - browserCurrentDisplay.bounds.width);
                    const heightDiff = Math.abs(display.bounds.height - browserCurrentDisplay.bounds.height);
                    
                    // Lower score is better (0 = perfect match)
                    const matchScore = xDiff + yDiff + (widthDiff / 10) + (heightDiff / 10);
                    
                    // Consider it a match if differences are reasonable
                    if (xDiff < 100 && yDiff < 100 && widthDiff < 200 && heightDiff < 200) {
                        if (matchScore < bestMatchScore) {
                            targetDisplay = display;
                            bestMatchScore = matchScore;
                            log.info(`Found match candidate: Electron display ID=${display.id} with score ${matchScore}`);
                        }
                    }
                }
                
                if (targetDisplay) {
                    log.info(`Best match: Electron display ID=${targetDisplay.id} at (${targetDisplay.bounds.x}, ${targetDisplay.bounds.y})`);
                } else {
                    log.warn('No matching Electron display found for browser display');
                }
                
                // If we found the target display, match it to a screen source
                if (targetDisplay) {
                    // Try to match by display ID in screen source
                    selectedScreen = screenSources.find(source => {
                        const idParts = source.id.split(':');
                        if (idParts.length >= 3) {
                            const sourceDisplayId = idParts[1];
                            
                            // Direct ID match
                            if (sourceDisplayId === targetDisplay.id.toString()) {
                                log.info(`Matched screen source by display ID: ${source.id} for display ${targetDisplay.id}`);
                                return true;
                            }
                            
                            // Try extracting numeric ID from browser display info
                            const browserDisplayNumeric = browserCurrentDisplay.id.toString().match(/\d+/);
                            if (browserDisplayNumeric && sourceDisplayId === browserDisplayNumeric[0]) {
                                log.info(`Matched screen source by extracted display number: ${source.id}`);
                                return true;
                            }
                        }
                        return false;
                    });
                    
                    // If no direct ID match, try matching by display index
                    if (!selectedScreen) {
                        const displayIndex = displays.indexOf(targetDisplay);
                        log.info(`Display index in array: ${displayIndex}`);
                        
                        // Try matching by index position
                        selectedScreen = screenSources[displayIndex];
                        if (selectedScreen) {
                            log.info(`Selected screen by array index: ${selectedScreen.id} (${selectedScreen.name})`);
                        }
                    }
                    
                    if (selectedScreen) {
                        log.info(`Final selection: ${selectedScreen.id} (${selectedScreen.name}) for display at (${targetDisplay.bounds.x}, ${targetDisplay.bounds.y})`);
                    } else {
                        log.warn('Could not match display to screen source, will use fallback');
                    }
                } else {
                    log.warn('Could not match browser display to any Electron display');
                }
            }
            
            // Fallback: Use first available screen if no match found
            if (!selectedScreen && screenSources.length > 0) {
                selectedScreen = screenSources[0];
                log.info(`Using fallback - first available screen: ${selectedScreen.id} (${selectedScreen.name})`);
            }
            
            if (selectedScreen) {
                log.info(`Using screen capture for best quality: ${selectedScreen.name} (${selectedScreen.id})`);
                selectedScreen.captureType = 'screen';
                return selectedScreen;
            }
            
            // Only fall back to window capture if absolutely no screens available
            log.warn('No screen sources available, falling back to window capture');
            
            const urlDomain = new URL(url).hostname;
            let targetWindow = null;
            let bestScore = 0;

            // Find the best matching window
            for (const source of sources) {
                if (!source.id.startsWith('window:')) continue;

                const sourceName = source.name.toLowerCase();
                const titleLower = title.toLowerCase();
                let score = 0;

                // Check for URL domain match
                if (sourceName.includes(urlDomain)) {
                    score += 10;
                }

                // Check for title match
                if (sourceName.includes(titleLower)) {
                    score += 5;
                }

                // Check for browser indicators
                if (sourceName.includes('chrome') || sourceName.includes('firefox') || 
                    sourceName.includes('edge') || sourceName.includes('safari')) {
                    score += 2;
                }

                if (score > bestScore) {
                    bestScore = score;
                    targetWindow = source;
                }
            }

            // If we still ended up here, use the window capture
            if (targetWindow && bestScore >= 5) {
                log.warn(`No screen capture available, using window: ${targetWindow.name} (may have offset issues)`);
                targetWindow.captureType = 'window';
                return targetWindow;
            }

            log.error('Could not find any suitable capture source');
            return null;
        } catch (error) {
            log.error('Error finding target window:', error);
            return null;
        }
    }

    /**
     * Start recording in renderer process
     * @param {BrowserWindow} window - Electron window
     * @param {Object} options - Recording options
     * @returns {Promise<Object>} Result
     */
    async startRecordingInRenderer(window, options) {
        return new Promise((resolve) => {
            // Generate a unique channel for this recording
            const responseChannel = `video-recording-started-${options.recordingId}`;
            
            // Listen for response
            const { ipcMain } = require('electron');
            ipcMain.once(responseChannel, (event, result) => {
                resolve(result);
            });

            // Send start command to renderer
            if (window && window.webContents) {
                window.webContents.send('start-video-recording', {
                    ...options,
                    responseChannel
                });
            } else {
                resolve({ success: false, error: 'Window not available' });
                return;
            }

            // Timeout after 10 seconds
            setTimeout(() => {
                resolve({ success: false, error: 'Recording start timeout' });
            }, 10000);
        });
    }

    /**
     * Stop recording in renderer process
     * @param {BrowserWindow} window - Electron window
     * @param {string} recordingId - Recording ID
     * @returns {Promise<Object>} Result
     */
    async stopRecordingInRenderer(window, recordingId) {
        return new Promise((resolve) => {
            // Generate a unique channel for this recording
            const responseChannel = `video-recording-stopped-${recordingId}`;
            
            // Listen for response
            const { ipcMain } = require('electron');
            ipcMain.once(responseChannel, (event, result) => {
                resolve(result);
            });

            // Send stop command to renderer
            if (window && window.webContents) {
                window.webContents.send('stop-video-recording', {
                    recordingId,
                    responseChannel
                });
            } else {
                resolve({ success: false, error: 'Window not available' });
                return;
            }

            // Timeout after 10 seconds
            setTimeout(() => {
                resolve({ success: false, error: 'Recording stop timeout' });
            }, 10000);
        });
    }

    /**
     * Save recording metadata
     * @param {Object} recording - Recording info
     */
    async saveRecordingMetadata(recording) {
        const metadataPath = path.join(recording.recordingDir, 'video-metadata.json');
        const metadata = {
            recordingId: recording.recordingId,
            url: recording.url,
            title: recording.title,
            startTime: recording.startTime,
            endTime: recording.endTime,
            duration: recording.duration,
            videoPath: recording.videoPath,
            format: 'webm',
            hasAudio: false
        };

        await atomicWriter.writeJson(metadataPath, metadata, { pretty: true });
        
        // Also update the main recording metadata to indicate video is available
        try {
            const mainMetaPath = path.join(recording.recordingDir, '..', `${recording.recordingId}.meta.json`);
            const metaExists = await this.fileExists(mainMetaPath);
            if (metaExists) {
                const mainMeta = JSON.parse(await fs.readFile(mainMetaPath, 'utf8'));
                mainMeta.hasVideo = true;
                mainMeta.videoFormat = 'webm';
                mainMeta.videoPath = path.relative(path.dirname(mainMetaPath), recording.videoPath);
                await atomicWriter.writeJson(mainMetaPath, mainMeta, { pretty: true });
            }
        } catch (error) {
            log.error('Error updating main metadata:', error);
        }
        
        log.info(`Saved video metadata for ${recording.recordingId}`);
        
        // Notify renderer that recording metadata was updated
        try {
            const allWindows = BrowserWindow.getAllWindows();
            allWindows.forEach(window => {
                if (window && !window.isDestroyed()) {
                    window.webContents.send('recording-metadata-updated', {
                        recordingId: recording.recordingId,
                        hasVideo: true
                    });
                }
            });
        } catch (error) {
            log.error('Failed to notify renderer of metadata update:', error);
        }
    }

    /**
     * Check if file exists
     * @param {string} path - File path
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

    /**
     * Get all active recordings
     * @returns {Array} Active recordings
     */
    getActiveRecordings() {
        return Array.from(this.activeRecordings.values());
    }

    /**
     * Clean up any orphaned recordings on startup
     */
    async cleanupOrphanedRecordings() {
        // This would check for incomplete recordings and clean them up
        // Implementation depends on specific requirements
        log.info('Cleanup orphaned recordings - not implemented yet');
    }
}

module.exports = VideoCaptureService;