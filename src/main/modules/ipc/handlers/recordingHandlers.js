const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('../../../../utils/mainLogger');
const atomicWriter = require('../../../../utils/atomicFileWriter');
const windowManager = require('../../window/windowManager');
const { preprocessRecordingForSave } = require('../../../../services/websocket/utils/recordingPreprocessor');

const log = createLogger('RecordingHandlers');

class RecordingHandlers {
    async handleLoadRecordings() {
        try {
            const recordingsPath = path.join(app.getPath('userData'), 'recordings');
            
            // Ensure directory exists
            await fs.promises.mkdir(recordingsPath, { recursive: true });
            
            // Get all recording metadata files
            const files = await fs.promises.readdir(recordingsPath);
            const recordings = [];
            
            for (const file of files) {
                if (file.endsWith('.meta.json')) {
                    try {
                        const metaPath = path.join(recordingsPath, file);
                        const metaData = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
                        
                        // Check if video exists for this recording
                        if (metaData.hasVideo === undefined) {
                            const recordingDir = path.join(recordingsPath, metaData.id);
                            const videoPath = path.join(recordingDir, 'video.webm');
                            const videoMetaPath = path.join(recordingDir, 'video-metadata.json');
                            
                            try {
                                await fs.promises.access(videoPath);
                                await fs.promises.access(videoMetaPath);
                                metaData.hasVideo = true;
                            } catch (error) {
                                metaData.hasVideo = false;
                            }
                        }
                        
                        // Check if processed version exists
                        if (metaData.hasProcessedVersion === undefined) {
                            const recordingDir = path.join(recordingsPath, metaData.id);
                            const processedPath = path.join(recordingDir, 'record-processed.json');
                            
                            try {
                                await fs.promises.access(processedPath);
                                metaData.hasProcessedVersion = true;
                            } catch (error) {
                                metaData.hasProcessedVersion = false;
                            }
                        }
                        
                        recordings.push(metaData);
                    } catch (error) {
                        log.error(`Error reading recording metadata ${file}:`, error);
                    }
                }
            }
            
            // Sort by timestamp (newest first)
            recordings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            return recordings;
        } catch (error) {
            log.error('Error loading recordings:', error);
            throw error;
        }
    }

    async handleLoadRecording(_, recordId) {
        try {
            const recordingsPath = path.join(app.getPath('userData'), 'recordings');
            const recordDir = path.join(recordingsPath, recordId);
            const processedPath = path.join(recordDir, 'record-processed.json');
            
            // Always load processed version (no backward compatibility)
            log.info(`Loading recording ${recordId}`);
            const recordData = await fs.promises.readFile(processedPath, 'utf8');
            return JSON.parse(recordData);
        } catch (error) {
            log.error(`Error loading recording ${recordId}:`, error);
            throw error;
        }
    }

    async handleSaveRecording(_, recordData) {
        try {
            const recordingsPath = path.join(app.getPath('userData'), 'recordings');
            await fs.promises.mkdir(recordingsPath, { recursive: true });
            
            const recordId = recordData.record.metadata.recordId || 
                            `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Create subdirectory for this recording
            const recordingDir = path.join(recordingsPath, recordId);
            await fs.promises.mkdir(recordingDir, { recursive: true });
            
            // TODO: This method is used for direct saves from the app.
            // Should preprocess the recording before saving.
            const recordPath = path.join(recordingDir, 'record-processed.json');
            await atomicWriter.writeJson(recordPath, recordData);
            
            // Save metadata separately for quick listing
            const metadata = {
                id: recordId,
                timestamp: recordData.record.metadata.timestamp || Date.now(),
                url: recordData.record.metadata.url || recordData.record.metadata.initialUrl || 'Unknown',
                duration: recordData.record.metadata.duration || 0,
                eventCount: recordData.record.events?.length || 0,
                size: Buffer.byteLength(JSON.stringify(recordData)),
                source: recordData.source || 'extension',
                hasVideo: false, // Initially false, will be updated when video recording completes
                tag: recordData.tag || null,
                description: recordData.description || null,
                metadata: recordData.record.metadata
            };
            
            const metaPath = path.join(recordingsPath, `${recordId}.meta.json`);
            await atomicWriter.writeJson(metaPath, metadata, { pretty: true });
            
            // Notify renderer that a new recording was received
            windowManager.sendToWindow('recording-received', metadata);
            
            return { success: true, recordId, metadata };
        } catch (error) {
            log.error('Error saving recording:', error);
            throw error;
        }
    }

    async handleSaveUploadedRecording(_, recordData) {
        try {
            const recordingsPath = path.join(app.getPath('userData'), 'recordings');
            await fs.promises.mkdir(recordingsPath, { recursive: true });
            
            const recordId = recordData.record?.metadata?.recordId || 
                            `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Notify UI that recording is being processed
            windowManager.sendToWindow('recording-processing', {
                id: recordId,
                status: 'processing',
                timestamp: recordData.record?.metadata?.timestamp || Date.now(),
                url: recordData.record?.metadata?.url || 'Unknown',
                eventCount: recordData.record?.events?.length || 0,
                duration: recordData.record?.metadata?.duration || 0,
                size: 0,
                source: 'upload',
                hasVideo: false,
                hasProcessedVersion: false
            });
            
            // Create subdirectory for this recording
            const recordingDir = path.join(recordingsPath, recordId);
            await fs.promises.mkdir(recordingDir, { recursive: true });
            
            // Notify progress with event count
            windowManager.sendToWindow('recording-progress', {
                recordId,
                stage: 'preprocessing',
                progress: 10,
                details: {
                    eventCount: recordData.record?.events?.length || 0
                }
            });
            
            // Get proxy status to check if it's running
            let proxyPort = null;
            try {
                const proxyService = require('../../../../services/proxy/ProxyService');
                if (proxyService && proxyService.isRunning) {
                    proxyPort = proxyService.port;
                    log.info(`Proxy is running on port ${proxyPort}, will prefetch resources`);
                } else {
                    log.info('Proxy is not running, skipping resource prefetch');
                }
            } catch (error) {
                log.warn('Could not check proxy status:', error.message);
            }
            
            // Create progress callback for prefetching
            const onPrefetchProgress = (stage, progress, details) => {
                if (stage === 'prefetching') {
                    // Map prefetch progress from 0-100 to 25-75 in overall progress
                    const overallProgress = 25 + Math.round(progress * 0.5);
                    windowManager.sendToWindow('recording-progress', {
                        recordId,
                        stage: 'prefetching',
                        progress: overallProgress,
                        details
                    });
                }
            };
            
            // Preprocess the uploaded recording
            log.info(`Preprocessing uploaded recording ${recordId}`);
            const processedRecordingData = await preprocessRecordingForSave(recordData, {
                proxyPort,
                onProgress: onPrefetchProgress
            });
            
            // Notify saving progress
            windowManager.sendToWindow('recording-progress', {
                recordId,
                stage: 'saving',
                progress: 85
            });
            
            const recordPath = path.join(recordingDir, 'record-processed.json');
            await atomicWriter.writeJson(recordPath, processedRecordingData);
            
            // Save metadata separately for quick listing
            const metadata = {
                id: recordId,
                timestamp: recordData.record?.metadata?.timestamp || Date.now(),
                url: recordData.record?.metadata?.url || 'Unknown',
                duration: recordData.record?.metadata?.duration || 0,
                eventCount: recordData.record?.events?.length || 0,
                size: Buffer.byteLength(JSON.stringify(processedRecordingData)),
                source: 'upload',
                hasVideo: false, // Uploaded recordings don't have video by default
                hasProcessedVersion: true,
                tag: recordData.tag || null,
                description: recordData.description || null,
                metadata: recordData.record?.metadata
            };
            
            const metaPath = path.join(recordingsPath, `${recordId}.meta.json`);
            await atomicWriter.writeJson(metaPath, metadata, { pretty: true });
            
            // Notify completion
            windowManager.sendToWindow('recording-progress', {
                recordId,
                stage: 'complete',
                progress: 100
            });
            
            // Notify renderer that a new recording was received
            windowManager.sendToWindow('recording-received', metadata);
            
            log.info(`Uploaded recording saved with ID: ${recordId}`);
            return { success: true, recordId };
        } catch (error) {
            log.error('Error saving uploaded recording:', error);
            throw error;
        }
    }

    async handleDeleteRecording(_, recordId) {
        try {
            const recordingsPath = path.join(app.getPath('userData'), 'recordings');
            
            // Delete the recording directory
            const recordingDir = path.join(recordingsPath, recordId);
            await fs.promises.rm(recordingDir, { recursive: true, force: true });
            
            // Delete the metadata file
            const metaPath = path.join(recordingsPath, `${recordId}.meta.json`);
            await fs.promises.unlink(metaPath).catch(err => {
                if (err.code !== 'ENOENT') throw err;
            });
            
            // Notify all windows that a recording was deleted
            const windows = BrowserWindow.getAllWindows();
            windows.forEach((window) => {
                window.webContents.send('recording-deleted', { recordId });
            });
            
            return { success: true };
        } catch (error) {
            log.error(`Error deleting recording ${recordId}:`, error);
            throw error;
        }
    }

    async handleDownloadRecording(_, record) {
        try {
            const { dialog } = require('electron');
            const recordingsPath = path.join(app.getPath('userData'), 'recordings');
            const recordPath = path.join(recordingsPath, record.id, 'record-processed.json');
            
            // Check if record exists
            if (!fs.existsSync(recordPath)) {
                throw new Error(`Recording ${record.id} not found`);
            }
            
            // Show save dialog
            const result = await dialog.showSaveDialog({
                title: 'Save Recording',
                defaultPath: `${record.id}.json`,
                filters: [
                    { name: 'JSON files', extensions: ['json'] },
                    { name: 'All files', extensions: ['*'] }
                ]
            });
            
            if (!result.canceled && result.filePath) {
                // Copy file to selected location
                await fs.promises.copyFile(recordPath, result.filePath);
                log.info(`Recording ${record.id} downloaded to ${result.filePath}`);
                return { success: true, path: result.filePath };
            }
            
            return { success: false, canceled: true };
        } catch (error) {
            log.error(`Error downloading recording ${record.id}:`, error);
            throw error;
        }
    }

    async handleUpdateRecordingMetadata(_, { recordId, updates }) {
        try {
            const recordingsPath = path.join(app.getPath('userData'), 'recordings');
            const metaPath = path.join(recordingsPath, `${recordId}.meta.json`);
            
            // Check if metadata file exists
            if (!fs.existsSync(metaPath)) {
                throw new Error(`Recording metadata for ${recordId} not found`);
            }
            
            // Read existing metadata
            const existingMetadata = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
            
            // Update only the fields provided
            const updatedMetadata = {
                ...existingMetadata,
                ...updates,
                lastModified: Date.now()
            };
            
            // Save updated metadata
            await atomicWriter.writeJson(metaPath, updatedMetadata, { pretty: true });
            
            // Notify renderer about the update
            windowManager.sendToWindow('recording-metadata-updated', {
                recordId,
                metadata: updatedMetadata
            });
            
            log.info(`Updated metadata for recording ${recordId}:`, updates);
            return { success: true, metadata: updatedMetadata };
        } catch (error) {
            log.error(`Error updating recording metadata for ${recordId}:`, error);
            throw error;
        }
    }
}

module.exports = new RecordingHandlers();