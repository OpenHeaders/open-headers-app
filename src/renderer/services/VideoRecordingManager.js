/**
 * Video Recording Manager for handling native WebM recording in renderer process
 */
class VideoRecordingManager {
    constructor() {
        this.activeRecordings = new Map();
        this.settings = null;
        this.initializeListeners();
        this.loadSettings().catch(error => {
            console.error('[VideoRecordingManager] Failed to load settings on init:', error);
        });
    }

    /**
     * Load settings from storage
     */
    async loadSettings() {
        try {
            this.settings = await window.electronAPI.getSettings();
        } catch (error) {
            console.error('[VideoRecordingManager] Failed to load settings:', error);
            // Use defaults if settings fail to load
            this.settings = { videoRecording: false, videoQuality: 'high' };
        }
    }

    /**
     * Initialize IPC listeners
     */
    initializeListeners() {
        // Listen for start recording command
        window.electronAPI.onStartVideoRecording(async (data) => {
            console.log('[VideoRecordingManager] Received start recording request:', data);
            const result = await this.startRecording(data);
            
            // Send result back to main process
            window.electronAPI.sendVideoRecordingStarted(data.responseChannel, result);
        });

        // Listen for stop recording command
        window.electronAPI.onStopVideoRecording(async (data) => {
            console.log('[VideoRecordingManager] Received stop recording request:', data);
            const result = await this.stopRecording(data.recordingId);
            
            // Send result back to main process
            window.electronAPI.sendVideoRecordingStopped(data.responseChannel, result);
        });
    }

    /**
     * Start recording a window/screen
     * @param {Object} options Recording options
     * @returns {Object} Result object
     */
    async startRecording(options) {
        const { sourceId, captureType, recordingId, recordingDir, url, title } = options;

        try {
            // Reload settings to get latest values
            await this.loadSettings();
            
            // Check if video recording is enabled
            if (!this.settings.videoRecording) {
                console.log('[VideoRecordingManager] Video recording is disabled in settings');
                return { success: false, error: 'Video recording is disabled' };
            }

            // Check if already recording
            if (this.activeRecordings.has(recordingId)) {
                return { success: false, error: 'Recording already in progress' };
            }

            // Use quality from settings
            const videoQuality = this.settings.videoQuality || 'high';

            // Get the video stream without forcing dimensions
            // This will capture at the native resolution of the source
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        // Don't force dimensions - let it use native resolution
                        minFrameRate: 30,
                        maxFrameRate: 60
                    }
                },
                audio: false // No audio recording
            });

            // Apply cropping constraints to remove black bars
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack && videoTrack.applyConstraints) {
                try {
                    // Get current capabilities
                    const capabilities = videoTrack.getCapabilities();
                    const settings = videoTrack.getSettings();
                    
                    console.log('[VideoRecordingManager] Video capabilities:', capabilities);
                    console.log('[VideoRecordingManager] Current settings:', settings);

                    // Try to apply cropping if supported
                    if (capabilities.aspectRatio) {
                        await videoTrack.applyConstraints({
                            aspectRatio: { ideal: 16/9 },
                            width: { ideal: settings.width },
                            height: { ideal: settings.height }
                        });
                    }
                } catch (error) {
                    console.warn('[VideoRecordingManager] Could not apply video constraints:', error);
                }
            }

            // Enhanced video quality presets with higher bitrates for crisper video
            const qualityPresets = {
                standard: 5000000,   // 5 Mbps (was 2.5)
                high: 10000000,      // 10 Mbps (was 5)
                ultra: 20000000      // 20 Mbps (was 8)
            };

            const bitrate = qualityPresets[videoQuality] || qualityPresets.high;
            console.log(`[VideoRecordingManager] Using video quality: ${videoQuality} (${bitrate / 1000000} Mbps)`);

            // Log final video track settings after constraints
            const finalVideoTrack = stream.getVideoTracks()[0];
            const videoSettings = finalVideoTrack.getSettings();
            console.log(`[VideoRecordingManager] Final video track settings:`, {
                width: videoSettings.width,
                height: videoSettings.height,
                frameRate: videoSettings.frameRate,
                resolution: `${videoSettings.width}x${videoSettings.height}`,
                aspectRatio: videoSettings.aspectRatio
            });

            // Use the highest quality codec available with quality hints
            let mimeType = 'video/webm;codecs=vp8'; // fallback
            let mimeOptions = [];
            
            // Try VP9 with high quality profile first (best quality)
            if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                mimeType = 'video/webm;codecs=vp9';
                // Try to use VP9 profile 2 for better quality (10-bit color)
                if (MediaRecorder.isTypeSupported('video/webm;codecs="vp09.02.10.10"')) {
                    mimeType = 'video/webm;codecs="vp09.02.10.10"';
                }
            }
            // Also check for AV1 (even better but less support)
            else if (MediaRecorder.isTypeSupported('video/webm;codecs=av01')) {
                mimeType = 'video/webm;codecs=av01';
            }

            console.log(`[VideoRecordingManager] Using codec: ${mimeType}`);

            // Create MediaRecorder with enhanced options for quality
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: bitrate,
                // Note: Don't use bitsPerSecond when audio: false, it causes audio bitrate warnings
                // Some browsers support these experimental options
                videoConstraints: {
                    mandatory: {
                        // Force high quality encoding
                        googCpuOveruseDetection: false, // Don't reduce quality for CPU
                        googScreencastMinBitrate: Math.floor(bitrate * 0.8), // Min 80% of target
                    }
                }
            });

            const chunks = [];

            // Handle data available
            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    chunks.push(event.data);
                }
            };

            // Handle recording stop (cleanup only - actual save happens in stopRecording)
            mediaRecorder.onstop = () => {
                // Clean up
                stream.getTracks().forEach(track => track.stop());
            };

            // Handle errors
            mediaRecorder.onerror = (event) => {
                console.error('[VideoRecordingManager] MediaRecorder error:', event);
                stream.getTracks().forEach(track => track.stop());
            };

            // Start recording
            mediaRecorder.start(1000); // Collect data every second

            // Store recording info
            this.activeRecordings.set(recordingId, {
                recordingId,
                mediaRecorder,
                stream,
                chunks,
                startTime: Date.now(),
                url,
                title,
                recordingDir,
                bitrate,
                quality: videoQuality,
                resolution: `${videoSettings.width}x${videoSettings.height}`,
                captureType: captureType || 'window'
            });

            console.log(`[VideoRecordingManager] Started recording ${recordingId}`);
            return { success: true };

        } catch (error) {
            console.error('[VideoRecordingManager] Error starting recording:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Stop recording
     * @param {string} recordingId Recording ID
     * @returns {Object} Result object
     */
    async stopRecording(recordingId) {
        try {
            const recording = this.activeRecordings.get(recordingId);
            if (!recording) {
                return { success: false, error: 'Recording not found' };
            }

            const { mediaRecorder, stream, chunks } = recording;

            // Stop the media recorder
            return new Promise((resolve) => {
                mediaRecorder.onstop = async () => {
                    try {
                        // Create blob from chunks
                        const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
                        
                        // Convert blob to buffer
                        const arrayBuffer = await blob.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);
                        
                        // Calculate actual bitrate from file size and duration
                        const durationSeconds = (Date.now() - recording.startTime) / 1000;
                        const fileSizeMB = blob.size / (1024 * 1024);
                        const actualBitrateMbps = (blob.size * 8) / (durationSeconds * 1000000);
                        
                        console.log(`[VideoRecordingManager] Video stats:`, {
                            blobSize: `${blob.size} bytes (${fileSizeMB.toFixed(2)} MB)`,
                            bufferSize: `${buffer.length} bytes`,
                            duration: `${durationSeconds.toFixed(1)} seconds`,
                            actualBitrate: `${actualBitrateMbps.toFixed(2)} Mbps`,
                            targetBitrate: `${recording.bitrate / 1000000} Mbps`,
                            quality: recording.quality,
                            resolution: recording.resolution
                        });
                        
                        // Get recording directory from the stored info
                        const recordingInfo = this.activeRecordings.get(recordingId);
                        const recordingDir = recordingInfo.recordingDir;
                        const videoPath = `${recordingDir}/video.webm`;
                        
                        // Save video file - ensure it's written as binary
                        await window.electronAPI.writeFile(videoPath, buffer);
                        
                        console.log(`[VideoRecordingManager] Video saved to: ${videoPath}`);
                        
                        // Clean up
                        stream.getTracks().forEach(track => track.stop());
                        
                        // Remove from active recordings
                        this.activeRecordings.delete(recordingId);
                        
                        resolve({ 
                            success: true, 
                            videoPath,
                            duration: Date.now() - recording.startTime
                        });
                    } catch (error) {
                        console.error('[VideoRecordingManager] Error saving video:', error);
                        resolve({ success: false, error: error.message });
                    }
                };

                // Stop recording
                mediaRecorder.stop();
            });

        } catch (error) {
            console.error('[VideoRecordingManager] Error stopping recording:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get all active recordings
     * @returns {Array} Active recording IDs
     */
    getActiveRecordings() {
        return Array.from(this.activeRecordings.keys());
    }

    /**
     * Stop all active recordings
     * @returns {Promise<Array>} Results of stopping all recordings
     */
    async stopAllRecordings() {
        const recordingIds = this.getActiveRecordings();
        return await Promise.all(
            recordingIds.map(id => this.stopRecording(id))
        );
    }
}

// Create singleton instance
const videoRecordingManager = new VideoRecordingManager();

// Attach to window for debugging/console access if needed
if (typeof window !== 'undefined' && window.videoRecordingManager === undefined) {
    window.videoRecordingManager = videoRecordingManager;
}

// Service runs automatically via side-effect import - no export needed