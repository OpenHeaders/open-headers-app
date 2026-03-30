/**
 * Video Recording Manager for handling native WebM recording in renderer process
 */
class VideoRecordingManager {
  activeRecordings: Map<
    string,
    {
      recordingId: string;
      mediaRecorder: MediaRecorder;
      stream: MediaStream;
      chunks: Blob[];
      startTime: number;
      url?: string;
      title?: string;
      recordingDir: string;
      bitrate: number;
      quality: string;
      resolution: string;
      captureType: string;
    }
  >;
  settings: { videoRecording?: boolean; videoQuality?: string } | null;

  constructor() {
    this.activeRecordings = new Map();
    this.settings = null;
    this.initializeListeners();
    this.loadSettings().catch((error) => {
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
      const result = await this.startRecording(
        data as {
          sourceId?: string;
          captureType?: string;
          recordingId: string;
          recordingDir: string;
          url?: string;
          title?: string;
        },
      );

      // Send result back to main process
      window.electronAPI.sendVideoRecordingStarted(String(data.responseChannel), result);
    });

    // Listen for stop recording command
    window.electronAPI.onStopVideoRecording(async (data) => {
      console.log('[VideoRecordingManager] Received stop recording request:', data);
      const result = await this.stopRecording(String(data.recordingId));

      // Send result back to main process
      window.electronAPI.sendVideoRecordingStopped(
        String(data.responseChannel),
        result as { success: boolean; error?: string },
      );
    });
  }

  /**
   * Start recording a window/screen
   * @param {Object} options Recording options
   * @returns {Object} Result object
   */
  async startRecording(options: {
    sourceId?: string;
    captureType?: string;
    recordingId: string;
    recordingDir: string;
    url?: string;
    title?: string;
  }) {
    const { sourceId, captureType, recordingId, recordingDir, url, title } = options;

    try {
      // Reload settings to get latest values
      await this.loadSettings();

      // Check if video recording is enabled
      if (!this.settings?.videoRecording) {
        console.log('[VideoRecordingManager] Video recording is disabled in settings');
        return { success: false, error: 'Video recording is disabled' };
      }

      // Check if already recording
      if (this.activeRecordings.has(recordingId)) {
        return { success: false, error: 'Recording already in progress' };
      }

      // Use quality from settings
      const videoQuality = (this.settings?.videoQuality as string | undefined) || 'high';

      // Get the video stream without forcing dimensions
      // This will capture at the native resolution of the source
      const stream = await (
        navigator.mediaDevices.getUserMedia as (constraints: {
          video: {
            mandatory: {
              chromeMediaSource: string;
              chromeMediaSourceId: string;
              minFrameRate?: number;
              maxFrameRate?: number;
            };
          };
          audio: boolean;
        }) => Promise<MediaStream>
      )({
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId ?? '',
            // Don't force dimensions - let it use native resolution
            minFrameRate: 30,
            maxFrameRate: 60,
          },
        },
        audio: false, // No audio recording
      });

      // Apply cropping constraints to remove black bars
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack?.applyConstraints) {
        try {
          // Get current capabilities
          const capabilities = videoTrack.getCapabilities();
          const settings = videoTrack.getSettings();

          console.log('[VideoRecordingManager] Video capabilities:', capabilities);
          console.log('[VideoRecordingManager] Current settings:', settings);

          // Try to apply cropping if supported
          if (capabilities.aspectRatio) {
            await videoTrack.applyConstraints({
              aspectRatio: { ideal: 16 / 9 },
              width: { ideal: settings.width },
              height: { ideal: settings.height },
            });
          }
        } catch (error) {
          console.warn('[VideoRecordingManager] Could not apply video constraints:', error);
        }
      }

      // Enhanced video quality presets with higher bitrates for crisper video
      const qualityPresets = {
        standard: 5000000, // 5 Mbps (was 2.5)
        high: 10000000, // 10 Mbps (was 5)
        ultra: 20000000, // 20 Mbps (was 8)
      };

      const bitrate = qualityPresets[videoQuality as keyof typeof qualityPresets] || qualityPresets.high;
      console.log(`[VideoRecordingManager] Using video quality: ${videoQuality} (${bitrate / 1000000} Mbps)`);

      // Log final video track settings after constraints
      const finalVideoTrack = stream.getVideoTracks()[0];
      const videoSettings = finalVideoTrack.getSettings();
      console.log(`[VideoRecordingManager] Final video track settings:`, {
        width: videoSettings.width,
        height: videoSettings.height,
        frameRate: videoSettings.frameRate,
        resolution: `${videoSettings.width}x${videoSettings.height}`,
        aspectRatio: videoSettings.aspectRatio,
      });

      // Use the highest quality codec available with quality hints
      let mimeType = 'video/webm;codecs=vp8'; // fallback
      const _mimeOptions = [];

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
      } as MediaRecorderOptions);

      const chunks: Blob[] = [];

      // Handle data available
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      // Handle recording stop (cleanup only - actual save happens in stopRecording)
      mediaRecorder.onstop = () => {
        // Clean up
        stream.getTracks().forEach((track) => { track.stop(); });
      };

      // Handle errors
      mediaRecorder.onerror = (event) => {
        console.error('[VideoRecordingManager] MediaRecorder error:', event);
        stream.getTracks().forEach((track) => { track.stop(); });
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
        captureType: captureType || 'window',
      });

      console.log(`[VideoRecordingManager] Started recording ${recordingId}`);
      return { success: true };
    } catch (error) {
      console.error('[VideoRecordingManager] Error starting recording:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Stop recording
   * @param {string} recordingId Recording ID
   * @returns {Object} Result object
   */
  async stopRecording(recordingId: string) {
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
              resolution: recording.resolution,
            });

            // Get recording directory from the stored info
            const recordingInfo = this.activeRecordings.get(recordingId);
            const recordingDir = recordingInfo?.recordingDir;
            const videoPath = `${recordingDir}/video.webm`;

            // Save video file - ensure it's written as binary
            await window.electronAPI.writeFile(videoPath, buffer);

            console.log(`[VideoRecordingManager] Video saved to: ${videoPath}`);

            // Clean up
            stream.getTracks().forEach((track: MediaStreamTrack) => { track.stop(); });

            // Remove from active recordings
            this.activeRecordings.delete(recordingId);

            resolve({
              success: true,
              videoPath,
              duration: Date.now() - recording.startTime,
            });
          } catch (error) {
            console.error('[VideoRecordingManager] Error saving video:', error);
            resolve({ success: false, error: error instanceof Error ? error.message : String(error) });
          }
        };

        // Stop recording
        mediaRecorder.stop();
      });
    } catch (error) {
      console.error('[VideoRecordingManager] Error stopping recording:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
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
    return await Promise.all(recordingIds.map((id) => this.stopRecording(id)));
  }
}

// Create singleton instance
const videoRecordingManager = new VideoRecordingManager();

// Attach to window for debugging/console access if needed
if (
  typeof window !== 'undefined' &&
  (window as Window & { videoRecordingManager?: VideoRecordingManager }).videoRecordingManager === undefined
) {
  (window as Window & { videoRecordingManager?: VideoRecordingManager }).videoRecordingManager = videoRecordingManager;
}

// Service runs automatically via side-effect import - no export needed
