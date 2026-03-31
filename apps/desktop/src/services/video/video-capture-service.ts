import fs from 'node:fs';
import path from 'node:path';
import type { BrowserDisplayInfo, DisplayContext } from '@openheaders/core';
import { errorMessage } from '@openheaders/core';
import type { BrowserWindow as BrowserWindowType, DesktopCapturerSource, Display, IpcMainEvent } from 'electron';
import electron from 'electron';
import atomicWriter from '@/utils/atomicFileWriter';
import mainLogger from '@/utils/mainLogger';

const { desktopCapturer, BrowserWindow, ipcMain, screen: electronScreen } = electron;
const { createLogger } = mainLogger;

const fsPromises = fs.promises;
const log = createLogger('VideoCaptureService');

interface RecordingOptions {
  recordingId: string;
  url: string;
  title: string;
  windowId?: string;
  tabId?: string;
  displayInfo?: DisplayContext;
  videoQuality?: string;
}

interface RecordingInfo {
  recordingId: string;
  sourceId: string;
  url: string;
  title: string;
  tabId?: string;
  windowId?: string;
  startTime: number;
  recordingDir: string;
  status: string;
  state?: string;
  endTime?: number;
  duration?: number;
  videoPath?: string;
}

interface RecordingResult {
  success: boolean;
  error?: string;
  videoPath?: string;
}

interface RendererOptions {
  sourceId: string;
  captureType: string;
  recordingId: string;
  recordingDir: string;
  url: string;
  title: string;
  videoQuality: string;
  responseChannel?: string;
}

interface CaptureSource {
  id: string;
  name: string;
  captureType?: string;
}

/**
 * Service for capturing video recordings of browser windows
 */
class VideoCaptureService {
  activeRecordings: Map<string, RecordingInfo> = new Map();
  appDataPath: string | null = null;
  recordingsPath: string | null = null;

  /**
   * Initialize the video capture service
   */
  async initialize(appDataPath: string): Promise<void> {
    this.appDataPath = appDataPath;
    this.recordingsPath = path.join(appDataPath, 'recordings');

    // Ensure recordings directory exists
    await fsPromises.mkdir(this.recordingsPath, { recursive: true });

    log.info('Video capture service initialized');
  }

  /**
   * Start recording a window
   */
  async startRecording(options: RecordingOptions): Promise<RecordingResult> {
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
      const recordingDir = path.join(this.recordingsPath!, recordingId);
      await fsPromises.mkdir(recordingDir, { recursive: true });

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
        videoQuality,
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
          status: 'recording',
        });

        log.info(`Started recording ${recordingId} for window: ${title}`);
      }

      return result;
    } catch (error: unknown) {
      log.error('Error starting recording:', error);
      return { success: false, error: errorMessage(error) };
    }
  }

  /**
   * Stop recording
   */
  async stopRecording(recordingId: string): Promise<RecordingResult> {
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
    } catch (error: unknown) {
      log.error('Error stopping recording:', error);
      return { success: false, error: errorMessage(error) };
    }
  }

  /**
   * Update recording state
   */
  async updateRecordingState(recordingId: string, state: string): Promise<void> {
    const recording = this.activeRecordings.get(recordingId);
    if (recording) {
      recording.state = state;
      log.info(`Updated recording ${recordingId} state to: ${state}`);
    }
  }

  /**
   * Find target window by URL and title
   */
  async findTargetWindow(url: string, title: string, displayInfo?: DisplayContext): Promise<CaptureSource | null> {
    try {
      // Get both screen and window sources - SCREEN FIRST for priority
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 },
      });

      // ALWAYS use screen capture when available - it has no offset issues
      const screenSources = sources.filter((s: DesktopCapturerSource) => s.id.startsWith('screen:'));
      log.info(
        `Available screen sources: ${screenSources.map((s: DesktopCapturerSource) => `${s.id}: ${s.name}`).join(', ')}`,
      );

      let selectedScreen: CaptureSource | null = null;

      // If we have display info from the browser, use it to select the correct screen
      if (displayInfo?.currentDisplay) {
        const displays = electronScreen.getAllDisplays();

        const browserCurrentDisplay = displayInfo.currentDisplay;
        const browserAllDisplays = displayInfo.allDisplays || [];

        log.info(`Browser detected ${browserAllDisplays.length} display(s)`);
        log.info(`Browser window is on display: ${browserCurrentDisplay.name || browserCurrentDisplay.id}`);
        log.info(`Display bounds: ${JSON.stringify(browserCurrentDisplay.bounds)}`);
        log.info(`Window position: ${JSON.stringify(displayInfo.windowPosition)}`);

        // Log all browser displays for debugging
        browserAllDisplays.forEach((d: BrowserDisplayInfo, i: number) => {
          log.info(
            `Browser display ${i}: ${d.name || d.id} at (${d.bounds.left}, ${d.bounds.top}) size ${d.bounds.width}x${d.bounds.height}`,
          );
        });

        // Log all Electron displays
        displays.forEach((d: Display, i: number) => {
          log.info(
            `Electron display ${i}: ID=${d.id} at (${d.bounds.x}, ${d.bounds.y}) size ${d.bounds.width}x${d.bounds.height}`,
          );
        });

        // Match the browser's current display with Electron's displays
        let targetDisplay: Display | null = null;
        let bestMatchScore = Infinity;

        for (const display of displays) {
          // Calculate match score based on bounds similarity
          const xDiff = Math.abs(display.bounds.x - browserCurrentDisplay.bounds.left);
          const yDiff = Math.abs(display.bounds.y - browserCurrentDisplay.bounds.top);
          const widthDiff = Math.abs(display.bounds.width - browserCurrentDisplay.bounds.width);
          const heightDiff = Math.abs(display.bounds.height - browserCurrentDisplay.bounds.height);

          // Lower score is better (0 = perfect match)
          const matchScore = xDiff + yDiff + widthDiff / 10 + heightDiff / 10;

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
          log.info(
            `Best match: Electron display ID=${targetDisplay.id} at (${targetDisplay.bounds.x}, ${targetDisplay.bounds.y})`,
          );
        } else {
          log.warn('No matching Electron display found for browser display');
        }

        // If we found the target display, match it to a screen source
        if (targetDisplay) {
          // Try to match by display ID in screen source
          selectedScreen =
            screenSources.find((source: DesktopCapturerSource) => {
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
            }) || null;

          // If no direct ID match, try matching by display index
          if (!selectedScreen) {
            const displayIndex = displays.indexOf(targetDisplay);
            log.info(`Display index in array: ${displayIndex}`);

            // Try matching by index position
            selectedScreen = screenSources[displayIndex] || null;
            if (selectedScreen) {
              log.info(`Selected screen by array index: ${selectedScreen.id} (${selectedScreen.name})`);
            }
          }

          if (selectedScreen) {
            log.info(
              `Final selection: ${selectedScreen.id} (${selectedScreen.name}) for display at (${targetDisplay.bounds.x}, ${targetDisplay.bounds.y})`,
            );
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
        log.info(`Using fallback - first available screen: ${selectedScreen!.id} (${selectedScreen!.name})`);
      }

      if (selectedScreen) {
        log.info(`Using screen capture for best quality: ${selectedScreen.name} (${selectedScreen.id})`);
        selectedScreen.captureType = 'screen';
        return selectedScreen;
      }

      // Only fall back to window capture if absolutely no screens available
      log.warn('No screen sources available, falling back to window capture');

      const urlDomain = new URL(url).hostname;
      let targetWindow: CaptureSource | null = null;
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
        if (
          sourceName.includes('chrome') ||
          sourceName.includes('firefox') ||
          sourceName.includes('edge') ||
          sourceName.includes('safari')
        ) {
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
   */
  async startRecordingInRenderer(window: BrowserWindowType, options: RendererOptions): Promise<RecordingResult> {
    return new Promise((resolve) => {
      // Generate a unique channel for this recording
      const responseChannel = `video-recording-started-${options.recordingId}`;

      // Listen for response
      ipcMain.once(responseChannel, (_event: IpcMainEvent, result: RecordingResult) => {
        resolve(result);
      });

      // Send start command to renderer
      if (window && !window.isDestroyed()) {
        window.webContents.send('start-video-recording', {
          ...options,
          responseChannel,
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
   */
  async stopRecordingInRenderer(window: BrowserWindowType, recordingId: string): Promise<RecordingResult> {
    return new Promise((resolve) => {
      // Generate a unique channel for this recording
      const responseChannel = `video-recording-stopped-${recordingId}`;

      // Listen for response
      ipcMain.once(responseChannel, (_event: IpcMainEvent, result: RecordingResult) => {
        resolve(result);
      });

      // Send stop command to renderer
      if (window && !window.isDestroyed()) {
        window.webContents.send('stop-video-recording', {
          recordingId,
          responseChannel,
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
   */
  async saveRecordingMetadata(recording: RecordingInfo): Promise<void> {
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
      hasAudio: false,
    };

    await atomicWriter.writeJson(metadataPath, metadata, { pretty: true });

    // Also update the main recording metadata to indicate video is available
    try {
      const mainMetaPath = path.join(recording.recordingDir, '..', `${recording.recordingId}.meta.json`);
      const metaExists = await this.fileExists(mainMetaPath);
      if (metaExists) {
        const mainMeta = JSON.parse(await fsPromises.readFile(mainMetaPath, 'utf8'));
        mainMeta.hasVideo = true;
        mainMeta.videoFormat = 'webm';
        mainMeta.videoPath = path.relative(path.dirname(mainMetaPath), recording.videoPath!);
        await atomicWriter.writeJson(mainMetaPath, mainMeta, { pretty: true });
      }
    } catch (error) {
      log.error('Error updating main metadata:', error);
    }

    log.info(`Saved video metadata for ${recording.recordingId}`);

    // Notify renderer that recording metadata was updated
    try {
      const allWindows = BrowserWindow.getAllWindows();
      allWindows.forEach((win: BrowserWindowType) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('recording-metadata-updated', {
            recordingId: recording.recordingId,
            hasVideo: true,
          });
        }
      });
    } catch (error) {
      log.error('Failed to notify renderer of metadata update:', error);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all active recordings
   */
  getActiveRecordings(): RecordingInfo[] {
    return Array.from(this.activeRecordings.values());
  }

}

export { VideoCaptureService };
export default VideoCaptureService;
