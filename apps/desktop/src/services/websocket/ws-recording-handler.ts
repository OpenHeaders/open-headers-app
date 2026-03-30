/**
 * WebSocket Recording Handler
 * Manages video recording lifecycle and workflow save from browser extensions
 */

import electron from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { errorMessage } from '../../types/common';
import type { RecordingMetadata } from '../../types/recording';
import type { AppSettings } from '../../types/settings';
import atomicWriter from '../../utils/atomicFileWriter';
import mainLogger from '../../utils/mainLogger';
import type { PreprocessorData } from './utils/recordingPreprocessor';
import { preprocessRecordingForSave } from './utils/recordingPreprocessor';

const { createLogger } = mainLogger;
const log = createLogger('WSRecordingHandler');

interface RecordingHandlerDeps {
  appDataPath: string | null;
  _broadcastToAll(message: string): number;
}

interface FocusNavigation {
  tab?: string;
  subTab?: string;
  action?: string;
  itemId?: string;
}

interface DisplayInfo {
  currentDisplay?: {
    id: string | number;
    name?: string;
    bounds: { left: number; top: number; width: number; height: number };
  };
  allDisplays?: Array<{
    id: string | number;
    name?: string;
    bounds: { left: number; top: number; width: number; height: number };
  }>;
  windowPosition?: { x: number; y: number };
}

interface RecordingOptions {
  recordingId: string;
  url: string;
  title: string;
  windowId?: string;
  tabId?: string;
  timestamp?: number;
  displayInfo?: DisplayInfo;
}

interface VideoCaptureServiceLike {
  initialize(appDataPath: string | null): Promise<void>;
  startRecording(options: RecordingOptions): Promise<{ success: boolean; error?: string }>;
  stopRecording(recordingId: string): Promise<{ success: boolean; error?: string }>;
  updateRecordingState(recordingId: string, state: string): Promise<void>;
}

interface ProcessingNotificationMeta {
  url: string;
  timestamp: number;
  eventCount: number;
}

interface SavedRecordingMetadata {
  id: string;
  timestamp: number;
  url: string;
  duration: number;
  eventCount: number;
  size: number;
  originalSize: number;
  source: string;
  metadata: RecordingMetadata | undefined;
  hasVideo: boolean;
  hasProcessedVersion: boolean;
  hasOriginalVersion: boolean;
}

interface SaveRecordingResult {
  success: boolean;
  recordId?: string;
  metadata?: SavedRecordingMetadata;
  error?: string;
}

interface StartSyncRecordingData {
  recordingId: string;
  url: string;
  title: string;
  windowId?: string;
  tabId?: string;
  timestamp?: number;
  displayInfo?: DisplayInfo;
}

interface StopSyncRecordingData {
  recordingId: string;
}

interface RecordingStateSyncData {
  recordingId: string;
  state: string;
}

interface SaveRecordingMessageData {
  type: string;
  recording: PreprocessorData;
}

class WSRecordingHandler {
  wsService: RecordingHandlerDeps;
  videoCaptureService: VideoCaptureServiceLike | null;

  /** Callback to focus the app window. Set by ws-service after construction. */
  onFocusApp: ((navigation: FocusNavigation) => void) | null = null;

  /** Callback to send IPC to renderer windows. Set by ws-service after construction. */
  onNotifyRenderers: ((channel: string, data: unknown) => void) | null = null;

  /** Callback to read a setting value. Set by ws-service after construction.
   *  Falls back to defaults when not wired (e.g., in tests). */
  onReadSetting: (<K extends keyof AppSettings>(key: K) => AppSettings[K]) | null = null;

  constructor(wsService: RecordingHandlerDeps) {
    this.wsService = wsService;
    this.videoCaptureService = null;
  }

  /** Read a setting, falling back to built-in defaults when callback not wired. */
  private _readSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
    if (this.onReadSetting) return this.onReadSetting(key);
    // Fallback defaults for when callback is not wired (startup / tests)
    const defaults: Partial<AppSettings> = {
      videoRecording: false,
      recordingHotkey: 'CommandOrControl+Shift+E',
      recordingHotkeyEnabled: true,
    };
    return defaults[key] as AppSettings[K];
  }

  /** Send an IPC message to all renderer windows. No-ops when no windows exist. */
  private _notifyRenderers(channel: string, data: unknown): void {
    if (this.onNotifyRenderers) {
      this.onNotifyRenderers(channel, data);
      return;
    }
    // Fallback: direct BrowserWindow access (matches pre-existing behavior)
    try {
      const { BrowserWindow } = electron;
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(channel, data);
      }
    } catch {
      /* non-critical */
    }
  }

  /**
   * Initialize video capture service
   */
  async initializeVideoCaptureService(): Promise<void> {
    try {
      const { VideoCaptureService } = await import('../video/video-capture-service');
      this.videoCaptureService = new VideoCaptureService();
      await this.videoCaptureService!.initialize(this.wsService.appDataPath);
      log.info('Video capture service initialized');
    } catch (error) {
      log.error('Failed to initialize video capture service:', error);
      // Non-critical error - continue without video capture
    }
  }

  /**
   * Send video recording state to specific client
   */
  async sendVideoRecordingState(ws: WebSocket): Promise<void> {
    try {
      const videoRecordingEnabled = this._readSetting('videoRecording') || false;

      const message = JSON.stringify({
        type: 'videoRecordingStateChanged',
        enabled: videoRecordingEnabled,
      });

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        log.debug('Sent video recording state to client:', videoRecordingEnabled);
      }
    } catch (error) {
      log.error('Error sending video recording state:', error);
    }
  }

  /**
   * Broadcast video recording state to all connected clients
   */
  broadcastVideoRecordingState(enabled: boolean): void {
    const message = JSON.stringify({
      type: 'videoRecordingStateChanged',
      enabled: enabled,
    });

    const clientCount = this.wsService._broadcastToAll(message);
    log.info(`Broadcast video recording state (${enabled}) to ${clientCount} client(s)`);
  }

  /**
   * Send recording hotkey to client
   */
  async sendRecordingHotkey(ws: WebSocket): Promise<void> {
    try {
      const recordingHotkey = this._readSetting('recordingHotkey') || 'CommandOrControl+Shift+E';
      const recordingHotkeyEnabled = this._readSetting('recordingHotkeyEnabled') ?? true;

      ws.send(
        JSON.stringify({
          type: 'recordingHotkeyResponse',
          hotkey: recordingHotkey,
          enabled: recordingHotkeyEnabled,
        }),
      );

      log.debug(`Sent recording hotkey to client: ${recordingHotkey}, enabled: ${recordingHotkeyEnabled}`);
    } catch (error) {
      log.error('Failed to send recording hotkey:', error);
    }
  }

  /**
   * Broadcast recording hotkey change to all connected extensions
   */
  broadcastRecordingHotkeyChange(hotkey: string, enabled?: boolean): void {
    try {
      const message = JSON.stringify({
        type: 'recordingHotkeyChanged',
        hotkey: hotkey,
        enabled: enabled !== undefined ? enabled : true,
      });

      const clientCount = this.wsService._broadcastToAll(message);
      log.info(`Broadcasted recording hotkey change to ${clientCount} extensions:`, hotkey);
    } catch (error) {
      log.error('Failed to broadcast recording hotkey change:', error);
    }
  }

  /**
   * Notify UI that a recording is being processed
   */
  notifyRecordingProcessing(recordId: string, metadata: ProcessingNotificationMeta): void {
    try {
      this._notifyRenderers('recording-processing', {
        id: recordId,
        status: 'processing',
        timestamp: metadata.timestamp,
        url: metadata.url,
        eventCount: metadata.eventCount,
        duration: 0,
        size: 0,
        source: 'extension',
        hasVideo: false,
        hasProcessedVersion: false,
      });
    } catch (error) {
      log.error('Failed to notify recording processing:', error);
    }
  }

  /**
   * Notify UI of recording processing progress
   */
  notifyRecordingProgress(
    recordId: string,
    stage: string,
    progress: number,
    details: { eventCount?: number } = {},
  ): void {
    try {
      this._notifyRenderers('recording-progress', { recordId, stage, progress, details });
    } catch (error) {
      log.error('Failed to notify recording progress:', error);
    }
  }

  /**
   * Handle save recording from browser extension
   */
  async handleSaveRecording(recordingData: PreprocessorData): Promise<SaveRecordingResult> {
    try {
      const { app } = electron;
      const fsPromises = fs.promises;

      const recordingsPath = path.join(app.getPath('userData'), 'recordings');
      await fsPromises.mkdir(recordingsPath, { recursive: true });

      const originalRecordId = recordingData.record?.metadata?.recordId;
      const recordId = originalRecordId || `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      log.info(`Saving recording - Using ID: ${recordId}, Original ID: ${originalRecordId}`);

      this.notifyRecordingProgress(recordId, 'preprocessing', 0, {
        eventCount: recordingData.record?.events?.length || 0,
      });

      if (recordingData.record?.metadata) {
        recordingData.record.metadata.recordId = recordId;
      }

      const recordingDir = path.join(recordingsPath, recordId);
      await fsPromises.mkdir(recordingDir, { recursive: true });

      let processedRecordingData: PreprocessorData;
      let hasProcessedVersion = false;

      try {
        log.info(`Preprocessing recording ${recordId} for optimized playback`);
        this.notifyRecordingProgress(recordId, 'preprocessing', 10, {
          eventCount: recordingData.record?.events?.length || 0,
        });

        let proxyPort: number | null = null;
        try {
          const { default: proxyService } = await import('../proxy/ProxyService');
          if (proxyService?.isRunning) {
            proxyPort = proxyService.port;
            log.info(`Proxy is running on port ${proxyPort}, will prefetch resources`);
            const proxyStatus = proxyService.getStatus();
            log.info(
              `Proxy has ${proxyStatus.rulesCount} header rules and ${proxyStatus.sourcesCount} sources configured`,
            );
          } else {
            log.info('Proxy is not running, skipping resource prefetch');
          }
        } catch (error: unknown) {
          log.warn('Could not check proxy status:', errorMessage(error));
        }

        const onProgress = (stage: string, progress: number, details?: { eventCount?: number }) => {
          if (stage === 'preprocessing') {
            const overallProgress = 10 + Math.round(progress * 0.15);
            this.notifyRecordingProgress(recordId, 'preprocessing', overallProgress, {
              eventCount: recordingData.record?.events?.length || 0,
              ...details,
            });
          } else if (stage === 'prefetching') {
            const overallProgress = 25 + Math.round(progress * 0.5);
            this.notifyRecordingProgress(recordId, 'prefetching', overallProgress, details);
          }
        };

        processedRecordingData = await preprocessRecordingForSave(recordingData, {
          proxyPort,
          onProgress,
        });
        hasProcessedVersion = true;

        this.notifyRecordingProgress(recordId, 'saving', 75, {
          eventCount: recordingData.record?.events?.length || 0,
        });
        log.info(`Successfully preprocessed recording ${recordId}`);
      } catch (preprocessError: unknown) {
        log.error('Failed to preprocess recording:', preprocessError);
        this.notifyRecordingProgress(recordId, 'error', 0);
        throw new Error(`Preprocessing failed: ${errorMessage(preprocessError)}`);
      }

      this.notifyRecordingProgress(recordId, 'saving', 80);

      const originalPath = path.join(recordingDir, 'record-original.json');
      await atomicWriter.writeJson(originalPath, recordingData);
      log.info(`Saved original recording ${recordId}`);

      this.notifyRecordingProgress(recordId, 'saving', 85);

      const recordPath = path.join(recordingDir, 'record-processed.json');
      await atomicWriter.writeJson(recordPath, processedRecordingData);
      log.info(`Saved processed recording ${recordId}`);

      this.notifyRecordingProgress(recordId, 'saving', 90);

      let hasVideo = false;
      const videoMetaPath = path.join(recordingsPath, recordId, 'video-metadata.json');
      try {
        await fsPromises.access(videoMetaPath);
        hasVideo = true;
        log.info(`Found existing video recording for ${recordId}`);
      } catch (_error) {
        // No video metadata found
      }

      const metadata: SavedRecordingMetadata = {
        id: recordId,
        timestamp: recordingData.record?.metadata?.timestamp || Date.now(),
        url: recordingData.record?.metadata?.url || 'Unknown',
        duration: recordingData.record?.metadata?.duration || 0,
        eventCount: recordingData.record?.events?.length || 0,
        size: Buffer.byteLength(JSON.stringify(processedRecordingData)),
        originalSize: Buffer.byteLength(JSON.stringify(recordingData)),
        source: 'extension',
        metadata: recordingData.record?.metadata,
        hasVideo: hasVideo,
        hasProcessedVersion: hasProcessedVersion,
        hasOriginalVersion: true,
      };

      const metaPath = path.join(recordingsPath, `${recordId}.meta.json`);
      await atomicWriter.writeJson(metaPath, metadata, { pretty: true });

      this.notifyRecordingProgress(recordId, 'complete', 100);

      try {
        this._notifyRenderers('recording-received', metadata);
      } catch (error) {
        log.error('Failed to notify renderer:', error);
      }

      this.notifyRecordingProgress(recordId, 'complete', 100);

      log.info(`Recording saved successfully with ID: ${recordId}`);
      return { success: true, recordId: recordId, metadata };
    } catch (error: unknown) {
      log.error('Error saving recording:', error);
      return { success: false, error: errorMessage(error) };
    }
  }

  /**
   * Handle start sync recording request
   */
  async handleStartSyncRecording(ws: WebSocket, data: StartSyncRecordingData): Promise<void> {
    try {
      const videoRecordingEnabled = this._readSetting('videoRecording') || false;

      if (!videoRecordingEnabled) {
        log.info('Video recording is disabled in settings, skipping video capture');
        this._sendVideoRecordingStatus(ws, data.recordingId, 'disabled', 'Video recording is disabled in settings');
        return;
      }

      if (!this.videoCaptureService) {
        log.warn('Video capture service not available');
        this._sendVideoRecordingStatus(ws, data.recordingId, 'error', 'Video capture service not initialized');
        return;
      }

      const result = await this.videoCaptureService.startRecording({
        recordingId: data.recordingId,
        url: data.url,
        title: data.title,
        windowId: data.windowId,
        tabId: data.tabId,
        timestamp: data.timestamp,
        displayInfo: data.displayInfo,
      });

      if (result.success) {
        log.info(`Started video recording for ${data.recordingId}`);
        this._sendVideoRecordingStatus(ws, data.recordingId, 'started');
      } else {
        log.error(`Failed to start video recording: ${result.error}`);
        this._sendVideoRecordingStatus(ws, data.recordingId, 'error', result.error);
      }
    } catch (error: unknown) {
      log.error('Error handling start sync recording:', error);
      this._sendVideoRecordingStatus(ws, data.recordingId, 'error', errorMessage(error));
    }
  }

  /**
   * Handle stop sync recording request
   */
  async handleStopSyncRecording(ws: WebSocket, data: StopSyncRecordingData): Promise<void> {
    try {
      const videoRecordingEnabled = this._readSetting('videoRecording') || false;

      if (!videoRecordingEnabled) {
        log.info('Video recording is disabled in settings, ignoring stop request');
        return;
      }

      if (!this.videoCaptureService) {
        log.warn('Video capture service not available');
        return;
      }

      const result = await this.videoCaptureService.stopRecording(data.recordingId);

      if (result.success) {
        log.info(`Stopped video recording for ${data.recordingId}`);
        this._sendVideoRecordingStatus(ws, data.recordingId, 'stopped');
      } else {
        log.error(`Failed to stop video recording: ${result.error}`);
        this._sendVideoRecordingStatus(ws, data.recordingId, 'error', result.error);
      }
    } catch (error: unknown) {
      log.error('Error handling stop sync recording:', error);
      this._sendVideoRecordingStatus(ws, data.recordingId, 'error', errorMessage(error));
    }
  }

  /**
   * Handle recording state synchronization
   */
  async handleRecordingStateSync(_ws: WebSocket, data: RecordingStateSyncData): Promise<void> {
    try {
      if (!this.videoCaptureService) {
        return;
      }
      await this.videoCaptureService.updateRecordingState(data.recordingId, data.state);
      log.info(`Updated recording state for ${data.recordingId}: ${data.state}`);
    } catch (error) {
      log.error('Error handling recording state sync:', error);
    }
  }

  /**
   * Handle a saveRecording/saveWorkflow message from the extension
   * Preprocesses record ID, focuses app, notifies UI, saves, and responds
   */
  handleSaveRecordingMessage(ws: WebSocket, data: SaveRecordingMessageData): void {
    log.info(`Received ${data.type} request from extension`);

    // Ensure consistent record ID
    if (!data.recording?.record?.metadata?.recordId) {
      const generatedId = `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      if (!data.recording.record) data.recording.record = { events: [] };
      if (!data.recording.record.metadata) data.recording.record.metadata = { startTime: Date.now() };
      data.recording.record.metadata.recordId = generatedId;
      log.info(`Generated record ID: ${generatedId}`);
    }

    const recordId = data.recording.record.metadata?.recordId ?? '';

    log.info('Immediately navigating to records tab for:', recordId);
    if (this.onFocusApp) {
      this.onFocusApp({
        tab: 'record-viewer',
        action: 'highlight',
        itemId: recordId,
      });
    }

    this.notifyRecordingProcessing(recordId, {
      url: data.recording.record.metadata?.url || 'Unknown',
      timestamp: data.recording.record.metadata?.timestamp || Date.now(),
      eventCount: data.recording.record.events?.length || 0,
    });

    this.handleSaveRecording(data.recording)
      .then((result) => {
        log.info('Workflow saved successfully:', result.recordId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'saveRecordingResponse',
              success: true,
              recordId: result.recordId,
            }),
          );
        }
      })
      .catch((error: Error) => {
        log.error('Error handling save workflow:', error);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'saveRecordingResponse',
              success: false,
              error: error.message,
            }),
          );
        }
      });
  }

  /**
   * Send video recording status to client
   */
  _sendVideoRecordingStatus(
    ws: WebSocket,
    recordingId: string,
    status: string,
    error: string | null | undefined = null,
  ): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const message = {
        type: 'videoRecordingStatus',
        data: {
          recordingId,
          status,
          error,
        },
      };
      ws.send(JSON.stringify(message));
    }
  }
}

export type { RecordingStateSyncData, SaveRecordingMessageData, StartSyncRecordingData, StopSyncRecordingData };
export { WSRecordingHandler };
export default WSRecordingHandler;
