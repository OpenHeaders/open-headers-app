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
  openFileDialog: (...args: any[]) => Promise<any>;
  saveFileDialog: (...args: any[]) => Promise<any>;
  readFile: (...args: any[]) => Promise<any>;
  writeFile: (...args: any[]) => Promise<any>;
  watchFile: (...args: any[]) => Promise<any>;
  unwatchFile: (...args: any[]) => Promise<any>;
  getAppPath: (...args: any[]) => Promise<any>;
  getEnvVariable: (...args: any[]) => Promise<any>;

  // Storage
  saveToStorage: (...args: any[]) => Promise<any>;
  loadFromStorage: (...args: any[]) => Promise<any>;

  // Settings
  saveSettings: (...args: any[]) => Promise<any>;
  getSettings: (...args: any[]) => Promise<any>;
  setAutoLaunch: (...args: any[]) => Promise<any>;
  openExternal: (...args: any[]) => Promise<any>;

  // System
  getSystemTimezone: () => Promise<any>;
  getAppVersion: () => Promise<string>;
  showItemInFolder: (...args: any[]) => Promise<any>;
  openAppPath: (...args: any[]) => Promise<any>;
  requestScreenRecordingPermission: () => Promise<any>;

  // Network
  getNetworkState: () => Promise<any>;
  makeHttpRequest: (...args: any[]) => Promise<any>;

  // Shortcuts
  disableRecordingHotkey: () => Promise<any>;
  enableRecordingHotkey: () => Promise<any>;

  // Recording
  loadRecordings: (...args: any[]) => Promise<any>;
  loadRecording: (...args: any[]) => Promise<any>;
  saveUploadedRecording: (...args: any[]) => Promise<any>;
  deleteRecording: (...args: any[]) => Promise<any>;
  updateRecordingMetadata: (...args: any[]) => Promise<any>;

  // Proxy
  proxyStart: (...args: any[]) => Promise<any>;
  proxyStop: () => Promise<any>;
  proxyStatus: () => Promise<any>;
  proxyGetRules: () => Promise<any>;
  proxySaveRule: (...args: any[]) => Promise<any>;
  proxyDeleteRule: (...args: any[]) => Promise<any>;
  proxyClearCache: () => Promise<any>;
  proxyGetCacheStats: () => Promise<any>;
  proxyGetCacheEntries: () => Promise<any>;
  proxySetCacheEnabled: (...args: any[]) => Promise<any>;
  proxyUpdateHeaderRules: (...args: any[]) => Promise<any>;
  proxyClearRules: () => Promise<any>;
  proxyUpdateSource: (...args: any[]) => void;
  proxyUpdateSources: (...args: any[]) => void;

  // WebSocket
  wsGetConnectionStatus: () => Promise<any>;
  wsCheckCertTrust: () => Promise<any>;
  wsTrustCert: () => Promise<any>;
  wsUntrustCert: () => Promise<any>;

  // Git
  testGitConnection: (...args: any[]) => Promise<any>;
  getGitStatus: (...args: any[]) => Promise<any>;
  installGit: (...args: any[]) => Promise<any>;
  syncGitWorkspace: (...args: any[]) => Promise<any>;
  cleanupGitRepo: (...args: any[]) => Promise<any>;
  commitConfiguration: (...args: any[]) => Promise<any>;
  createBranch: (...args: any[]) => Promise<any>;
  checkWritePermissions: (...args: any[]) => Promise<any>;

  // CLI API
  cliApiStatus: () => Promise<any>;
  cliApiStart: (...args: any[]) => Promise<any>;
  cliApiStop: () => Promise<any>;
  cliApiGetLogs: () => Promise<any>;
  cliApiClearLogs: () => Promise<any>;
  cliApiRegenerateToken: () => Promise<any>;

  // Workspace
  deleteWorkspace: (...args: any[]) => Promise<any>;
  initializeWorkspaceSync: (...args: any[]) => Promise<any>;
  syncWorkspace: (...args: any[]) => Promise<any>;
  generateTeamWorkspaceInvite: (...args: any[]) => Promise<any>;
  generateEnvironmentConfigLink: (...args: any[]) => Promise<any>;

  // Video
  checkFFmpeg: () => Promise<any>;
  downloadFFmpeg: () => Promise<any>;
  convertVideo: (...args: any[]) => Promise<any>;
  sendVideoRecordingStarted: (...args: any[]) => void;
  sendVideoRecordingStopped: (...args: any[]) => void;

  // Window management
  showMainWindow: () => void;
  hideMainWindow: () => void;
  send: (...args: any[]) => void;

  // Updates
  checkForUpdates: (isManual?: boolean) => void;
  installUpdate: () => void;
  restartApp: () => void;

  // Runtime updates
  updateWebSocketSources: (...args: any[]) => void;
  cleanupTempFiles: (...args: any[]) => void;

  // Event listeners (return cleanup function)
  onNavigateTo: (callback: (data: any) => void) => (() => void);
  onShowApp: (callback: () => void) => (() => void);
  onHideApp: (callback: () => void) => (() => void);
  onQuitApp: (callback: () => void) => (() => void);
  onTriggerUpdateCheck: (callback: () => void) => (() => void);
  onSystemSuspend: (callback: () => void) => (() => void);
  onSystemResume: (callback: () => void) => (() => void);
  onNetworkStateSync: (callback: (data: any) => void) => (() => void);
  onRecordingReceived: (callback: (data: any) => void) => (() => void);
  onRecordingProgress: (callback: (data: any) => void) => (() => void);
  onRecordingProcessing: (callback: (data: any) => void) => (() => void);
  onRecordingDeleted: (callback: (data: any) => void) => (() => void);
  onRecordingMetadataUpdated: (callback: (data: any) => void) => (() => void);
  onOpenRecordRecording: (callback: (data: any) => void) => (() => void);
  onStartVideoRecording: (callback: (data: any) => void) => (() => void);
  onStopVideoRecording: (callback: (data: any) => void) => (() => void);
  onVideoConversionProgress: (callback: (data: any) => void) => (() => void);
  onFFmpegDownloadProgress: (callback: (data: any) => void) => (() => void);
  onFFmpegInstallStatus: (callback: (data: any) => void) => (() => void);
  onGitConnectionProgress: (callback: (data: any) => void) => (() => void);
  onGitCommitProgress: (callback: (data: any) => void) => (() => void);
  onGitInstallProgress: (callback: (data: any) => void) => (() => void);
  onFileChanged: (callback: (data: any) => void) => (() => void);
  onWorkspaceDataUpdated: (callback: (data: any) => void) => (() => void);
  onWorkspaceSyncProgress: (callback: (data: any) => void) => (() => void);
  onWorkspaceSyncCompleted: (callback: (data: any) => void) => (() => void);
  onWorkspaceSyncStarted: (callback: (data: any) => void) => (() => void);
  onCliWorkspaceJoined: (callback: (data: any) => void) => (() => void);
  onEnvironmentsStructureChanged: (callback: (data: any) => void) => (() => void);
  onEnvironmentVariablesChanged: (callback: (data: any) => void) => (() => void);
  onWsConnectionStatusChanged: (callback: (data: any) => void) => (() => void);
  onUpdateAvailable: (callback: (data: any) => void) => (() => void);
  onUpdateNotAvailable: (callback: (data: any) => void) => (() => void);
  onUpdateDownloaded: (callback: (data: any) => void) => (() => void);
  onUpdateAlreadyDownloaded: (callback: (data: any) => void) => (() => void);
  onUpdateError: (callback: (data: any) => void) => (() => void);
  onUpdateProgress: (callback: (data: any) => void) => (() => void);
  onUpdateCheckAlreadyInProgress: (callback: (data: any) => void) => (() => void);
  onClearUpdateCheckingNotification: (callback: () => void) => (() => void);
  onProcessTeamWorkspaceInvite?: (callback: (data: any) => void) => (() => void);
  onShowErrorMessage?: (callback: (data: any) => void) => (() => void);
  onProcessEnvironmentConfigImport?: (callback: (data: any) => void) => (() => void);

  // Renderer lifecycle
  signalRendererReady?: () => void;

  [key: string]: any;
}

interface Window {
  electronAPI: ElectronAPI;
  generateTOTP: (secret: string, options?: { digits?: number; period?: number; timeOffset?: number }) => string;
}
