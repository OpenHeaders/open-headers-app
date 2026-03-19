/**
 * Global type declarations for the renderer process.
 *
 * Extends the Window interface with:
 * - electronAPI: the preload bridge exposed via contextBridge
 * - generateTOTP: TOTP generator exposed via contextBridge
 */

interface ElectronAPI {
  // Platform info
  platform: string;
  isDevelopment: boolean;

  // File operations
  openFileDialog: (options?: Record<string, unknown>) => Promise<string | null>;
  saveFileDialog: (options: Record<string, unknown>) => Promise<string | null>;
  readFile: (filePath: string, encoding?: string) => Promise<string | Buffer>;
  writeFile: (filePath: string, content: string | Buffer) => Promise<void>;
  watchFile: (sourceId: string, filePath: string) => Promise<string>;
  unwatchFile: (filePath: string) => Promise<boolean>;
  getAppPath: () => Promise<string>;
  getEnvVariable: (name: string) => Promise<string>;

  // Storage
  saveToStorage: (filename: string, content: string) => Promise<void>;
  loadFromStorage: (filename: string) => Promise<string | null>;

  // Settings
  saveSettings: (settings: Record<string, unknown>) => Promise<{ success: boolean; message?: string }>;
  getSettings: () => Promise<Record<string, unknown>>;
  setAutoLaunch: (enable: boolean) => Promise<{ success: boolean; message?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;

  // System
  getSystemTimezone: () => Promise<{ timezone: string; offset: number; method: string }>;
  getAppVersion: () => Promise<string>;
  showItemInFolder: (filePath: string) => Promise<void>;
  openAppPath: (pathKey: string) => Promise<{ success: boolean; error?: string }>;
  requestScreenRecordingPermission: () => Promise<{ success: boolean; hasPermission?: boolean; platform: string; needsManualGrant?: boolean; error?: string }>;

  // Network
  getNetworkState: () => Promise<{
    isOnline: boolean;
    networkQuality: string;
    vpnActive: boolean;
    interfaces: [string, { name: string; addresses: unknown[]; type: string }][];
    primaryInterface: string | null;
    connectionType: string;
    diagnostics: { dnsResolvable: boolean; internetReachable: boolean; captivePortal: boolean; latency: number };
    lastUpdate: number;
    version: number;
    confidence?: number;
  }>;
  makeHttpRequest: (url: string, method: string, options?: import('./http').HttpRequestOptions) => Promise<string>;

  // Shortcuts
  disableRecordingHotkey: () => Promise<void>;
  enableRecordingHotkey: () => Promise<void>;

  // Recording
  loadRecordings: () => Promise<Record<string, unknown>[]>;
  loadRecording: (recordId: string) => Promise<Record<string, unknown>>;
  saveUploadedRecording: (recordData: unknown) => Promise<{ success: boolean; recordId?: string }>;
  deleteRecording: (recordId: string) => Promise<{ success: boolean }>;
  updateRecordingMetadata: (data: { recordId: string; updates: Record<string, unknown> }) => Promise<{ success: boolean; metadata?: Record<string, unknown> }>;

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
  proxyGetRules: () => Promise<unknown[]>;
  proxySaveRule: (rule: unknown) => Promise<{ success: boolean; error?: string }>;
  proxyDeleteRule: (ruleId: string) => Promise<{ success: boolean; error?: string }>;
  proxyClearCache: () => Promise<{ success: boolean; error?: string }>;
  proxyGetCacheStats: () => Promise<Record<string, unknown> | null>;
  proxyGetCacheEntries: () => Promise<unknown[]>;
  proxySetCacheEnabled: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  proxyUpdateHeaderRules: (headerRules: unknown[]) => Promise<{ success: boolean; error?: string }>;
  proxyClearRules: () => Promise<{ success: boolean; error?: string }>;
  proxyUpdateSource: (sourceId: string, value: unknown) => void;
  proxyUpdateSources: (sources: unknown) => void;

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
    wssServerRunning: boolean;
    wsPort: number;
    wssPort: number;
    certificateFingerprint: string | null;
    certificatePath: string | null;
    certificateExpiry: string | null;
    certificateSubject: string | null;
    error?: string;
  }>;
  wsCheckCertTrust: () => Promise<{ trusted: boolean; error?: string }>;
  wsTrustCert: () => Promise<{ success: boolean; error?: string }>;
  wsUntrustCert: () => Promise<{ success: boolean; error?: string }>;

  // Git
  testGitConnection: (config: Record<string, unknown>) => Promise<{ success: boolean; error?: string; message?: string; branches?: string[]; configFileValid?: boolean; validationDetails?: unknown; readAccess?: boolean; writeAccess?: boolean; warning?: string; hint?: string; debugHint?: string }>;
  getGitStatus: () => Promise<{ isInstalled: boolean; version?: string; error?: string; user?: { name?: string } }>;
  installGit: () => Promise<{ success: boolean; message?: string; error?: string }>;
  syncGitWorkspace: (config: unknown) => Promise<{ success: boolean; error?: string }>;
  cleanupGitRepo: (gitUrl: string) => Promise<{ success: boolean; error?: string }>;
  commitConfiguration: (config: unknown) => Promise<{ success: boolean; error?: string; commitHash?: string; commitInfo?: unknown; files?: string[]; noChanges?: boolean; message?: string }>;
  createBranch: (config: unknown) => Promise<{ success: boolean; error?: string; message?: string }>;
  checkWritePermissions: (config: unknown) => Promise<{ success: boolean; error?: string; details?: unknown }>;

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
  cliApiGetLogs: () => Promise<Record<string, unknown>[]>;
  cliApiClearLogs: () => Promise<{ success: boolean }>;
  cliApiRegenerateToken: () => Promise<{ success: boolean; token?: string; error?: string }>;

  // Workspace
  deleteWorkspace: (workspaceId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  initializeWorkspaceSync: (workspaceId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  syncWorkspace: (workspaceId: string, options: unknown) => Promise<{ success: boolean; error?: string }>;
  generateTeamWorkspaceInvite: (workspaceData: unknown) => Promise<{ success: boolean; inviteData?: Record<string, unknown>; links?: { appLink: string; webLink: string }; error?: string }>;
  generateEnvironmentConfigLink: (environmentData: unknown) => Promise<{ success: boolean; envConfigData?: Record<string, unknown>; links?: { appLink: string; webLink: string; dataSize: number }; error?: string }>;

  // Video
  checkFFmpeg: () => Promise<{ available: boolean } | boolean>;
  downloadFFmpeg: () => Promise<unknown>;
  convertVideo: (inputPath: string, outputPath: string) => Promise<{ success: boolean; error?: string }>;
  sendVideoRecordingStarted: (channel: string, result: unknown) => void;
  sendVideoRecordingStopped: (channel: string, result: unknown) => void;

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
  updateWebSocketSources: (sources: unknown) => void;
  cleanupTempFiles: (...args: unknown[]) => void;

  // Event listeners (return cleanup function)
  onNavigateTo: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onShowApp: (callback: () => void) => (() => void);
  onHideApp: (callback: () => void) => (() => void);
  onQuitApp: (callback: () => void) => (() => void);
  onTriggerUpdateCheck: (callback: () => void) => (() => void);
  onSystemSuspend: (callback: () => void) => (() => void);
  onSystemResume: (callback: () => void) => (() => void);
  onNetworkStateSync: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onRecordingReceived: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onRecordingProgress: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onRecordingProcessing: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onRecordingDeleted: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onRecordingMetadataUpdated: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onOpenRecordRecording: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onStartVideoRecording: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onStopVideoRecording: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onVideoConversionProgress: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onFFmpegDownloadProgress: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onFFmpegInstallStatus: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onGitConnectionProgress: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onGitCommitProgress: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onGitInstallProgress: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onFileChanged: (callback: (sourceId: string, content: string) => void) => (() => void);
  onWorkspaceDataUpdated: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onWorkspaceSyncProgress: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onWorkspaceSyncCompleted: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onWorkspaceSyncStarted: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onCliWorkspaceJoined: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onEnvironmentsStructureChanged: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onEnvironmentVariablesChanged: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onWsConnectionStatusChanged: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onUpdateAvailable: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onUpdateNotAvailable: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onUpdateDownloaded: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onUpdateAlreadyDownloaded: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onUpdateError: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onUpdateProgress: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onUpdateCheckAlreadyInProgress: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onClearUpdateCheckingNotification: (callback: () => void) => (() => void);
  onProcessTeamWorkspaceInvite?: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onShowErrorMessage?: (callback: (data: Record<string, unknown>) => void) => (() => void);
  onProcessEnvironmentConfigImport?: (callback: (data: Record<string, unknown>) => void) => (() => void);

  // Renderer lifecycle
  signalRendererReady?: () => void;
}

interface Window {
  electronAPI: ElectronAPI;
  generateTOTP: (secret: string, period?: number, digits?: number, timeOffset?: number) => Promise<string>;
}
