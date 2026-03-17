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
  openFileDialog: () => Promise<string | null>;
  saveFileDialog: (options: Record<string, unknown>) => Promise<string | null>;
  readFile: (filePath: string, encoding: string) => Promise<string | Buffer>;
  writeFile: (filePath: string, content: string) => Promise<void>;
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
  }>;
  makeHttpRequest: (url: string, method: string, options?: Record<string, unknown>) => Promise<string>;

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
  testGitConnection: (config: Record<string, unknown>) => Promise<{ success: boolean; error?: string; message?: string }>;
  getGitStatus: () => Promise<{ isInstalled: boolean; error?: string; user?: { name?: string } }>;
  installGit: () => Promise<{ success: boolean; message?: string; error?: string }>;
  syncGitWorkspace: (config: unknown) => Promise<{ success: boolean; error?: string }>;
  cleanupGitRepo: (gitUrl: string) => Promise<{ success: boolean; error?: string }>;
  commitConfiguration: (config: unknown) => Promise<{ success: boolean; error?: string }>;
  createBranch: (config: unknown) => Promise<{ success: boolean; error?: string }>;
  checkWritePermissions: (config: unknown) => Promise<{ success: boolean; error?: string }>;

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
  checkFFmpeg: () => Promise<unknown>;
  downloadFFmpeg: () => Promise<unknown>;
  convertVideo: (inputPath: string, outputPath: string) => Promise<unknown>;
  sendVideoRecordingStarted: (channel: string, result: unknown) => void;
  sendVideoRecordingStopped: (channel: string, result: unknown) => void;

  // Window management
  showMainWindow: () => void;
  hideMainWindow: () => void;
  send: (channel: string, ...args: unknown[]) => void;

  // Updates
  checkForUpdates: (isManual?: boolean) => void;
  installUpdate: () => void;
  restartApp: () => void;

  // Runtime updates
  updateWebSocketSources: (sources: unknown) => void;
  cleanupTempFiles: (...args: unknown[]) => void;

  // Event listeners (return cleanup function)
  onNavigateTo: (callback: (data: unknown) => void) => (() => void);
  onShowApp: (callback: () => void) => (() => void);
  onHideApp: (callback: () => void) => (() => void);
  onQuitApp: (callback: () => void) => (() => void);
  onTriggerUpdateCheck: (callback: () => void) => (() => void);
  onSystemSuspend: (callback: () => void) => (() => void);
  onSystemResume: (callback: () => void) => (() => void);
  onNetworkStateSync: (callback: (data: unknown) => void) => (() => void);
  onRecordingReceived: (callback: (data: unknown) => void) => (() => void);
  onRecordingProgress: (callback: (data: unknown) => void) => (() => void);
  onRecordingProcessing: (callback: (data: unknown) => void) => (() => void);
  onRecordingDeleted: (callback: (data: unknown) => void) => (() => void);
  onRecordingMetadataUpdated: (callback: (data: unknown) => void) => (() => void);
  onOpenRecordRecording: (callback: (data: unknown) => void) => (() => void);
  onStartVideoRecording: (callback: (data: unknown) => void) => (() => void);
  onStopVideoRecording: (callback: (data: unknown) => void) => (() => void);
  onVideoConversionProgress: (callback: (data: unknown) => void) => (() => void);
  onFFmpegDownloadProgress: (callback: (data: unknown) => void) => (() => void);
  onFFmpegInstallStatus: (callback: (data: unknown) => void) => (() => void);
  onGitConnectionProgress: (callback: (data: unknown) => void) => (() => void);
  onGitCommitProgress: (callback: (data: unknown) => void) => (() => void);
  onGitInstallProgress: (callback: (data: unknown) => void) => (() => void);
  onFileChanged: (callback: (data: unknown) => void) => (() => void);
  onWorkspaceDataUpdated: (callback: (data: unknown) => void) => (() => void);
  onWorkspaceSyncProgress: (callback: (data: unknown) => void) => (() => void);
  onWorkspaceSyncCompleted: (callback: (data: unknown) => void) => (() => void);
  onWorkspaceSyncStarted: (callback: (data: unknown) => void) => (() => void);
  onCliWorkspaceJoined: (callback: (data: unknown) => void) => (() => void);
  onEnvironmentsStructureChanged: (callback: (data: unknown) => void) => (() => void);
  onEnvironmentVariablesChanged: (callback: (data: unknown) => void) => (() => void);
  onWsConnectionStatusChanged: (callback: (data: unknown) => void) => (() => void);
  onUpdateAvailable: (callback: (data: unknown) => void) => (() => void);
  onUpdateNotAvailable: (callback: (data: unknown) => void) => (() => void);
  onUpdateDownloaded: (callback: (data: unknown) => void) => (() => void);
  onUpdateAlreadyDownloaded: (callback: (data: unknown) => void) => (() => void);
  onUpdateError: (callback: (data: unknown) => void) => (() => void);
  onUpdateProgress: (callback: (data: unknown) => void) => (() => void);
  onUpdateCheckAlreadyInProgress: (callback: (data: unknown) => void) => (() => void);
  onClearUpdateCheckingNotification: (callback: () => void) => (() => void);
  onProcessTeamWorkspaceInvite?: (callback: (data: unknown) => void) => (() => void);
  onShowErrorMessage?: (callback: (data: unknown) => void) => (() => void);
  onProcessEnvironmentConfigImport?: (callback: (data: unknown) => void) => (() => void);

  // Renderer lifecycle
  signalRendererReady?: () => void;
}

interface Window {
  electronAPI: ElectronAPI;
  generateTOTP: (secret: string, options?: { digits?: number; period?: number; timeOffset?: number }) => string;
}
