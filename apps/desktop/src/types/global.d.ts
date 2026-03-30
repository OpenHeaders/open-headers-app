/**
 * Global type declarations for the renderer process.
 *
 * Extends the Window interface with:
 * - electronAPI: the preload bridge exposed via contextBridge
 * - generateTOTP: TOTP generator exposed via contextBridge
 */

import type { Source, SourceRequestOptions } from './source';
import type { AppSettings } from './settings';
import type { NetworkInterfaceInfo } from 'node:os';
import type { HttpRequestSpec, HttpRequestResult, TotpCooldownInfo } from './http';
import type { ProxyRule, CacheStats, CacheEntry } from './proxy';
import type { HeaderRule } from './rules';
import type {
  Workspace,
  WorkspaceAuthData,
  CommitInfo,
  TeamWorkspaceInvite,
  WorkspaceDataUpdatedData,
  WorkspaceSyncCompletedData,
  CliWorkspaceJoinedData,
} from './workspace';
import type { EnvironmentMap, EnvironmentSchema, EnvironmentConfigData } from './environment';
import type { RecordingData } from '@/services/websocket/utils/recordingPreprocessor';
import type { RefreshStatusInfo, StatusChangedPayload, ScheduleUpdatedPayload } from './source-refresh';
import type { WorkspaceStateAPI } from '@/preload/api/workspaceStateAPI';

declare global {
  /** Network state data sent via IPC from main process */
  interface NetworkStateSyncData {
    state: {
      isOnline: boolean;
      networkQuality?: string;
    };
  }

  /** Source activation event detail */
  interface SourceActivatedDetail {
    sourceId: string;
    source: Source;
  }

  /** Custom DOM events used in the renderer */
  interface WindowEventMap {
    'source-activated': CustomEvent<SourceActivatedDetail>;
  }

  // --- Event data types for IPC callbacks ---

  /** Navigation data sent to renderer */
  interface NavigationData {
    tab: string;
    action?: string;
    itemId?: string;
    sourceId?: string;
  }

  /** Recording metadata returned from loadRecordings / events */
  interface RecordingMetadataEvent {
    id: string;
    timestamp: number | string;
    url: string;
    duration: number;
    eventCount: number;
    size: number;
    source: string;
    hasVideo: boolean;
    hasProcessedVersion?: boolean;
    tag?: string | null;
    description?: string | null;
    originalSize?: number;
    metadata?: SourceRequestOptions;
    hasOriginalVersion?: boolean;
  }

  /** Recording progress event data */
  interface RecordingProgressEvent {
    recordId: string;
    stage: string;
    progress: number;
    details?: { eventCount?: number };
  }

  /** Recording processing notification */
  interface RecordingProcessingEvent {
    id: string;
    status: string;
    timestamp: number;
    url: string;
    eventCount: number;
    duration: number;
    size: number;
    source: string;
    hasVideo: boolean;
    hasProcessedVersion: boolean;
  }

  /** Video recording events */
  interface VideoRecordingEvent {
    recordingId: string;
    recordingDir?: string;
    responseChannel?: string;
    sourceId?: string;
    captureType?: string;
    url?: string;
    title?: string;
    success?: boolean;
    error?: string;
    path?: string;
  }

  /** Video conversion progress */
  interface VideoConversionProgressEvent {
    percent: number;
    currentTime?: number;
    duration?: number;
    eta?: number;
  }

  /** FFmpeg download progress */
  interface FFmpegDownloadProgressEvent {
    percent: number;
    transferred?: number;
    downloaded?: number;
    total?: number;
  }

  /** FFmpeg install status */
  interface FFmpegInstallStatusEvent {
    phase: string;
    error?: string;
  }

  /** Git progress event data */
  interface GitProgressEvent {
    update?: { step: string; status: string; details?: string; progress?: number; message?: string };
    summary?: Array<string | { step: string; status: string; details?: string; progress?: number }>;
    message?: string;
    data?: { message?: string; step?: string; phase?: string; progress?: number };
  }

  /** Environment change event data */
  interface EnvironmentChangeEvent {
    workspaceId?: string;
    timestamp?: number;
    environment?: string;
    variables?: Record<string, string>;
  }

  /** WebSocket connection status event */
  interface WsConnectionStatusEvent {
    totalConnections: number;
    browserCounts: Record<string, number>;
  }

  /** Update info event */
  interface UpdateInfoEvent {
    version: string;
    releaseDate?: string;
    releaseNotes?: string;
    files?: Array<{ url: string; size?: number }>;
    path?: string;
    sha512?: string;
  }

  /** Update progress event */
  interface UpdateProgressEvent {
    bytesPerSecond: number;
    percent: number;
    total: number;
    transferred: number;
  }

  /** Protocol/invite processing event data */
  interface ProtocolProcessingEvent {
    url?: string;
    data?: string;
    type?: string;
  }

  /** File dialog options (subset of Electron's OpenDialogOptions/SaveDialogOptions) */
  interface FileDialogOptions {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    properties?: string[];
    buttonLabel?: string;
    message?: string;
  }

  /** Recording metadata update request */
  interface RecordingMetadataUpdateRequest {
    recordId: string;
    updates: {
      tag?: { name: string; url: string } | string | null;
      description?: string | null;
      url?: string;
    };
  }

  /** CLI API log entry */
  interface CliApiLogEntry {
    timestamp: number;
    method: string;
    path: string;
    statusCode: number;
    userAgent?: string | null;
    remoteAddress?: string;
    duration?: number;
    errorMessage?: string | null;
    clientProcess?: string | null;
    bodySummary?: Record<string, unknown> | unknown[] | null;
  }

  interface ElectronAPI {
    // Platform info
    platform: string;
    isDevelopment: boolean;

    // File operations
    openFileDialog: (options?: FileDialogOptions) => Promise<string | null>;
    saveFileDialog: (options: FileDialogOptions) => Promise<string | null>;
    readFile: (filePath: string, encoding?: string) => Promise<string | Buffer>;
    writeFile: (filePath: string, content: string | Buffer) => Promise<void>;
    watchFile: (sourceId: string, filePath: string) => Promise<string>;
    unwatchFile: (filePath: string) => Promise<boolean>;
    getAppPath: () => Promise<string>;
    getEnvVariable: (name: string) => Promise<string>;

    // Storage
    saveToStorage: (filename: string, content: string) => Promise<void>;
    loadFromStorage: (filename: string) => Promise<string | null>;
    deleteDirectory: (dirPath: string) => Promise<{ success: boolean; error?: string }>;

    // Settings
    saveSettings: (
      settings: Record<string, string | boolean | number | null | undefined>,
    ) => Promise<{ success: boolean; message?: string }>;
    getSettings: () => Promise<Partial<AppSettings>>;
    setAutoLaunch: (enable: boolean) => Promise<{ success: boolean; message?: string }>;
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;

    // System
    getSystemTimezone: () => Promise<{ timezone: string; offset: number; method: string }>;
    getAppVersion: () => Promise<string>;
    showItemInFolder: (filePath: string) => Promise<void>;
    openAppPath: (pathKey: string) => Promise<{ success: boolean; error?: string }>;
    requestScreenRecordingPermission: () => Promise<{
      success: boolean;
      hasPermission?: boolean;
      platform: string;
      needsManualGrant?: boolean;
      error?: string;
    }>;

    // Network
    getNetworkState: () => Promise<{
      isOnline: boolean;
      networkQuality: string;
      vpnActive: boolean;
      interfaces: [string, { name: string; addresses: NetworkInterfaceInfo[]; type: string }][];
      primaryInterface: string | null;
      connectionType: string;
      diagnostics: { dnsResolvable: boolean; internetReachable: boolean; captivePortal: boolean; latency: number };
      lastUpdate: number;
      version: number;
      confidence?: number;
    }>;
    // HTTP request execution (main-process owned)
    httpRequest: {
      executeRequest: (spec: HttpRequestSpec) => Promise<HttpRequestResult>;
      getTotpCooldown: (workspaceId: string, sourceId: string) => Promise<TotpCooldownInfo>;
      generateTotpPreview: (secret: string) => Promise<string>;
    };

    // Shortcuts
    disableRecordingHotkey: () => Promise<void>;
    enableRecordingHotkey: () => Promise<void>;

    // Recording
    loadRecordings: () => Promise<RecordingMetadataEvent[]>;
    loadRecording: (recordId: string) => Promise<RecordingData>;
    saveUploadedRecording: (recordData: RecordingData) => Promise<{ success: boolean; recordId?: string }>;
    deleteRecording: (recordId: string) => Promise<{ success: boolean }>;
    updateRecordingMetadata: (
      data: RecordingMetadataUpdateRequest,
    ) => Promise<{ success: boolean; metadata?: RecordingMetadataEvent }>;

    // Proxy
    proxyStart: (port: number) => Promise<{ success: boolean; port?: number; error?: string }>;
    proxyStop: () => Promise<{ success: boolean; error?: string }>;
    proxyStatus: () => Promise<{
      running: boolean;
      port: number;
      rulesCount: number;
      sourcesCount: number;
      cacheEnabled: boolean;
      cacheSize: number;
      stats: { requestsProcessed: number; cacheHits: number; cacheMisses: number; errors: number };
      strictSSL: boolean;
      trustedCertificates: number;
      certificateExceptions: number;
    }>;
    proxyGetRules: () => Promise<ProxyRule[]>;
    proxySaveRule: (rule: ProxyRule) => Promise<{ success: boolean; error?: string }>;
    proxyDeleteRule: (ruleId: string) => Promise<{ success: boolean; error?: string }>;
    proxyClearCache: () => Promise<{ success: boolean; error?: string }>;
    proxyGetCacheStats: () => Promise<CacheStats | null>;
    proxyGetCacheEntries: () => Promise<CacheEntry[]>;
    proxySetCacheEnabled: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
    proxyUpdateHeaderRules: (headerRules: HeaderRule[]) => Promise<{ success: boolean; error?: string }>;
    proxyClearRules: () => Promise<{ success: boolean; error?: string }>;
    proxyUpdateSource: (sourceId: string, value: string) => void;
    proxyUpdateSources: (sources: Source[]) => void;

    // WebSocket
    wsGetConnectionStatus: () => Promise<{
      totalConnections: number;
      browserCounts: Record<string, number>;
      clients: {
        id: string;
        browser: string;
        browserVersion: string;
        platform: string;
        connectionType: string;
        connectedAt: number;
        lastActivity: number;
        extensionVersion: string;
      }[];
      wsServerRunning: boolean;
      wsPort: number;
      error?: string;
    }>;

    // Git
    testGitConnection: (config: {
      url?: string;
      branch?: string;
      authType?: string;
      filePath?: string;
      authData?: WorkspaceAuthData;
      checkWriteAccess?: boolean;
      isInvite?: boolean;
    }) => Promise<{
      success: boolean;
      error?: string;
      message?: string;
      branches?: string[];
      configFileValid?: boolean;
      validationDetails?: { sourceCount: number; ruleCount: number; proxyRuleCount: number; variableCount: number };
      readAccess?: boolean;
      writeAccess?: boolean;
      warning?: string;
      hint?: string;
      debugHint?: string;
    }>;
    getGitStatus: () => Promise<{ isInstalled: boolean; version?: string; error?: string; user?: { name?: string } }>;
    installGit: () => Promise<{ success: boolean; message?: string; error?: string }>;
    syncGitWorkspace: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;
    cleanupGitRepo: (gitUrl: string) => Promise<{ success: boolean; error?: string }>;
    commitConfiguration: (config: {
      url?: string;
      branch?: string;
      path?: string;
      files?: Record<string, string>;
      message?: string;
      authType?: string;
      authData?: WorkspaceAuthData;
    }) => Promise<{
      success: boolean;
      error?: string;
      commitHash?: string;
      commitInfo?: CommitInfo;
      files?: string[];
      noChanges?: boolean;
      message?: string;
    }>;
    createBranch: (config: {
      url?: string;
      branch?: string;
      authType?: string;
      authData?: WorkspaceAuthData;
    }) => Promise<{ success: boolean; error?: string; message?: string }>;
    checkWritePermissions: (config: {
      url?: string;
      branch?: string;
      authType?: string;
      authData?: WorkspaceAuthData;
    }) => Promise<{ success: boolean; error?: string; details?: { canPush?: boolean; reason?: string } }>;

    // CLI API
    cliApiStatus: () => Promise<{
      running: boolean;
      port: number;
      discoveryPath: string;
      token: string;
      startedAt: number | null;
      totalRequests: number;
    }>;
    cliApiStart: (port: number) => Promise<{ success: boolean; port?: number; error?: string }>;
    cliApiStop: () => Promise<{ success: boolean; error?: string }>;
    cliApiGetLogs: () => Promise<CliApiLogEntry[]>;
    cliApiClearLogs: () => Promise<{ success: boolean }>;
    cliApiRegenerateToken: () => Promise<{ success: boolean; token?: string; error?: string }>;

    // Workspace
    initializeWorkspaceSync: (workspaceId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    syncWorkspace: (
      workspaceId: string,
      options: { silent?: boolean },
    ) => Promise<{ success: boolean; error?: string }>;
    generateTeamWorkspaceInvite: (workspaceData: Partial<Workspace> & { includeAuthData?: boolean }) => Promise<{
      success: boolean;
      inviteData?: TeamWorkspaceInvite;
      links?: { appLink: string; webLink: string };
      error?: string;
    }>;
    generateEnvironmentConfigLink: (environmentData: {
      environments?: EnvironmentMap;
      environmentSchema?: EnvironmentSchema;
      includeValues?: boolean;
    }) => Promise<{
      success: boolean;
      envConfigData?: EnvironmentConfigData;
      links?: { appLink: string; webLink: string; dataSize: number };
      error?: string;
    }>;

    // Video
    checkFFmpeg: () => Promise<{ available: boolean } | boolean>;
    downloadFFmpeg: () => Promise<{ success: boolean; error?: string }>;
    convertVideo: (inputPath: string, outputPath: string) => Promise<{ success: boolean; error?: string }>;
    sendVideoRecordingStarted: (channel: string, result: { success: boolean; error?: string }) => void;
    sendVideoRecordingStopped: (
      channel: string,
      result: { success: boolean; error?: string } | { success: boolean },
    ) => void;

    // Window management
    showMainWindow: () => void;
    hideMainWindow: () => void;
    minimizeWindow: () => void;
    maximizeWindow: () => void;
    closeWindow: () => void;
    quitApp: () => void;
    send: (channel: string, ...args: unknown[]) => void;

    // Updates
    checkForUpdates: (isManual?: boolean) => void;
    installUpdate: () => void;
    restartApp: () => void;

    // Runtime updates
    cleanupTempFiles: (...args: string[]) => void;

    // Workspace state (main-process owned)
    workspaceState: WorkspaceStateAPI;

    // Source refresh (main-process owned lifecycle)
    sourceRefresh: {
      manualRefresh: (sourceId: string) => Promise<{ success: boolean; error?: string }>;
      updateSource: (source: Source) => Promise<void>;
      getRefreshStatus: (sourceId: string) => Promise<RefreshStatusInfo>;
      getTimeUntilRefresh: (sourceId: string) => Promise<number>;
      onStatusChanged: (callback: (data: StatusChangedPayload) => void) => () => void;
      onScheduleUpdated: (callback: (data: ScheduleUpdatedPayload) => void) => () => void;
    };

    // Event listeners (return cleanup function)
    onNavigateTo: (callback: (data: NavigationData) => void) => () => void;
    onShowApp: (callback: () => void) => () => void;
    onHideApp: (callback: () => void) => () => void;
    onQuitApp: (callback: () => void) => () => void;
    onTriggerUpdateCheck: (callback: () => void) => () => void;
    onSystemSuspend: (callback: () => void) => () => void;
    onSystemResume: (callback: () => void) => () => void;
    onNetworkStateSync: (callback: (data: NetworkStateSyncData) => void) => () => void;
    onRecordingReceived: (callback: (data: RecordingMetadataEvent) => void) => () => void;
    onRecordingProgress: (callback: (data: RecordingProgressEvent) => void) => () => void;
    onRecordingProcessing: (callback: (data: RecordingProcessingEvent) => void) => () => void;
    onRecordingDeleted: (callback: (data: { recordId: string }) => void) => () => void;
    onRecordingMetadataUpdated: (
      callback: (data: {
        recordId: string;
        updates: RecordingMetadataUpdateRequest['updates'];
        metadata?: RecordingMetadataEvent;
      }) => void,
    ) => () => void;
    onOpenRecordRecording: (callback: (data: { recordId: string }) => void) => () => void;
    onStartVideoRecording: (callback: (data: VideoRecordingEvent) => void) => () => void;
    onStopVideoRecording: (callback: (data: VideoRecordingEvent) => void) => () => void;
    onVideoConversionProgress: (callback: (data: VideoConversionProgressEvent) => void) => () => void;
    onFFmpegDownloadProgress: (callback: (data: FFmpegDownloadProgressEvent) => void) => () => void;
    onFFmpegInstallStatus: (callback: (data: FFmpegInstallStatusEvent) => void) => () => void;
    onGitConnectionProgress: (callback: (data: GitProgressEvent) => void) => () => void;
    onGitCommitProgress: (callback: (data: GitProgressEvent) => void) => () => void;
    onGitInstallProgress: (callback: (data: GitProgressEvent) => void) => () => void;
    onFileChanged: (callback: (sourceId: string, content: string) => void) => () => void;
    onWorkspaceDataUpdated: (callback: (data: WorkspaceDataUpdatedData) => void) => () => void;
    onWorkspaceSyncProgress: (callback: (data: WorkspaceSyncCompletedData) => void) => () => void;
    onWorkspaceSyncCompleted: (callback: (data: WorkspaceSyncCompletedData) => void) => () => void;
    onWorkspaceSyncStarted: (callback: (data: WorkspaceSyncCompletedData) => void) => () => void;
    onCliWorkspaceJoined: (callback: (data: CliWorkspaceJoinedData) => void) => () => void;
    onEnvironmentsStructureChanged: (callback: (data: EnvironmentChangeEvent) => void) => () => void;
    onEnvironmentVariablesChanged: (callback: (data: EnvironmentChangeEvent) => void) => () => void;
    onWsConnectionStatusChanged: (callback: (data: WsConnectionStatusEvent) => void) => () => void;
    onUpdateAvailable: (callback: (data: UpdateInfoEvent) => void) => () => void;
    onUpdateNotAvailable: (callback: (data: UpdateInfoEvent) => void) => () => void;
    onUpdateDownloaded: (callback: (data: UpdateInfoEvent) => void) => () => void;
    onUpdateAlreadyDownloaded: (callback: (data: UpdateInfoEvent) => void) => () => void;
    onUpdateError: (callback: (data: { message: string; error?: string }) => void) => () => void;
    onUpdateProgress: (callback: (data: UpdateProgressEvent) => void) => () => void;
    onUpdateCheckAlreadyInProgress: (callback: () => void) => () => void;
    onClearUpdateCheckingNotification: (callback: () => void) => () => void;
    onProcessTeamWorkspaceInvite?: (callback: (data: Partial<TeamWorkspaceInvite>) => void) => () => void;
    onShowErrorMessage?: (callback: (data: { title?: string; message: string }) => void) => () => void;
    onProcessEnvironmentConfigImport?: (callback: (data: Partial<EnvironmentConfigData>) => void) => () => void;

    // Renderer lifecycle
    signalRendererReady?: () => void;
  }

  interface RRWebPlayerModule {
    default?: RRWebPlayerConstructor;
    Player?: RRWebPlayerConstructor;
  }

  interface RRWebPlayerConstructor {
    new (options: {
      target: HTMLElement;
      data: { events: unknown[] };
      width?: number;
      height?: number;
    }): {
      destroy(): void;
      play(): void;
      pause(): void;
    };
  }

  /** Startup data injected synchronously by the preload script */
  interface StartupData {
    settings: AppSettings;
    platform: string;
    version: string;
    isPackaged: boolean;
  }

  interface Window {
    electronAPI: ElectronAPI;
    startupData: StartupData;
    rrwebPlayer?: RRWebPlayerModule | RRWebPlayerConstructor;
  }
}
