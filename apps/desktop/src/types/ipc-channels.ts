/**
 * IPC Channel Contract Definitions
 *
 * Single source of truth for all IPC channels between main ↔ renderer.
 * Both the main process (ipcMain.handle/on) and preload (ipcRenderer.invoke/send)
 * should reference these constants instead of raw strings.
 *
 * Channel categories:
 * - INVOKE: renderer calls, main responds (request/response via ipcMain.handle)
 * - SEND:   renderer fires, main listens (one-way via ipcMain.on)
 * - PUSH:   main fires, renderer listens (one-way via webContents.send)
 */

// ── Invoke channels (renderer → main, with response) ───────────────

export const IPC_INVOKE = {
  // File operations
  OPEN_FILE_DIALOG: 'openFileDialog',
  SAVE_FILE_DIALOG: 'saveFileDialog',
  READ_FILE: 'readFile',
  WRITE_FILE: 'writeFile',
  WATCH_FILE: 'watchFile',
  UNWATCH_FILE: 'unwatchFile',
  OPEN_RECORD_FILE: 'openRecordFile',
  GET_RESOURCE_PATH: 'getResourcePath',
  GET_ENV_VARIABLE: 'getEnvVariable',
  GET_APP_PATH: 'getAppPath',

  // Storage
  SAVE_TO_STORAGE: 'saveToStorage',
  LOAD_FROM_STORAGE: 'loadFromStorage',
  DELETE_FROM_STORAGE: 'deleteFromStorage',
  DELETE_DIRECTORY: 'deleteDirectory',

  // Settings
  SAVE_SETTINGS: 'saveSettings',
  GET_SETTINGS: 'getSettings',
  SET_AUTO_LAUNCH: 'setAutoLaunch',
  OPEN_EXTERNAL: 'openExternal',

  // System
  GET_SYSTEM_TIMEZONE: 'getSystemTimezone',
  CHECK_SCREEN_RECORDING_PERMISSION: 'checkScreenRecordingPermission',
  REQUEST_SCREEN_RECORDING_PERMISSION: 'requestScreenRecordingPermission',
  GET_APP_VERSION: 'getAppVersion',
  SHOW_ITEM_IN_FOLDER: 'showItemInFolder',
  OPEN_APP_PATH: 'openAppPath',

  // Shortcuts
  DISABLE_RECORDING_HOTKEY: 'disableRecordingHotkey',
  ENABLE_RECORDING_HOTKEY: 'enableRecordingHotkey',

  // Network
  CHECK_NETWORK_CONNECTIVITY: 'checkNetworkConnectivity',
  GET_NETWORK_STATE: 'getNetworkState',
  FORCE_NETWORK_CHECK: 'forceNetworkCheck',
  GET_SYSTEM_STATE: 'getSystemState',
  // HTTP request execution (main-process owned)
  HTTP_EXECUTE_REQUEST: 'http:execute-request',
  HTTP_GET_TOTP_COOLDOWN: 'http:get-totp-cooldown',
  HTTP_GENERATE_TOTP_PREVIEW: 'http:generate-totp-preview',

  // Source refresh (main-process owned)
  SOURCE_REFRESH_MANUAL: 'source-refresh:manual',
  SOURCE_REFRESH_UPDATE_SOURCE: 'source-refresh:update-source',
  SOURCE_REFRESH_GET_STATUS: 'source-refresh:get-status',
  SOURCE_REFRESH_GET_TIME_UNTIL: 'source-refresh:get-time-until',

  // Recording
  LOAD_RECORDINGS: 'loadRecordings',
  LOAD_RECORDING: 'loadRecording',
  SAVE_RECORDING: 'saveRecording',
  SAVE_UPLOADED_RECORDING: 'saveUploadedRecording',
  DELETE_RECORDING: 'deleteRecording',
  DOWNLOAD_RECORDING: 'downloadRecording',
  UPDATE_RECORDING_METADATA: 'updateRecordingMetadata',

  // Proxy
  PROXY_START: 'proxy-start',
  PROXY_STOP: 'proxy-stop',
  PROXY_STATUS: 'proxy-status',
  PROXY_GET_RULES: 'proxy-get-rules',
  PROXY_SAVE_RULE: 'proxy-save-rule',
  PROXY_DELETE_RULE: 'proxy-delete-rule',
  PROXY_CLEAR_CACHE: 'proxy-clear-cache',
  PROXY_GET_CACHE_STATS: 'proxy-get-cache-stats',
  PROXY_GET_CACHE_ENTRIES: 'proxy-get-cache-entries',
  PROXY_SET_CACHE_ENABLED: 'proxy-set-cache-enabled',
  PROXY_UPDATE_HEADER_RULES: 'proxy-update-header-rules',
  PROXY_CLEAR_RULES: 'proxyClearRules',
  PROXY_SET_STRICT_SSL: 'proxy-set-strict-ssl',
  PROXY_ADD_TRUSTED_CERTIFICATE: 'proxy-add-trusted-certificate',
  PROXY_REMOVE_TRUSTED_CERTIFICATE: 'proxy-remove-trusted-certificate',
  PROXY_ADD_CERTIFICATE_EXCEPTION: 'proxy-add-certificate-exception',
  PROXY_REMOVE_CERTIFICATE_EXCEPTION: 'proxy-remove-certificate-exception',
  PROXY_GET_CERTIFICATE_INFO: 'proxy-get-certificate-info',

  // WebSocket
  WS_GET_CONNECTION_STATUS: 'ws-get-connection-status',

  // Git
  TEST_GIT_CONNECTION: 'testGitConnection',
  GET_GIT_STATUS: 'getGitStatus',
  INSTALL_GIT: 'installGit',
  SYNC_GIT_WORKSPACE: 'syncGitWorkspace',
  CLEANUP_GIT_REPOSITORY: 'cleanupGitRepository',
  COMMIT_CONFIGURATION: 'commitConfiguration',
  CREATE_BRANCH: 'createBranch',
  CHECK_WRITE_PERMISSIONS: 'checkWritePermissions',

  // CLI API
  CLI_API_STATUS: 'cli-api-status',
  CLI_API_START: 'cli-api-start',
  CLI_API_STOP: 'cli-api-stop',
  CLI_API_GET_LOGS: 'cli-api-get-logs',
  CLI_API_CLEAR_LOGS: 'cli-api-clear-logs',
  CLI_API_REGENERATE_TOKEN: 'cli-api-regenerate-token',

  // Workspace
  DELETE_WORKSPACE_FOLDER: 'deleteWorkspaceFolder',
  WORKSPACE_TEST_CONNECTION: 'workspace-test-connection',
  WORKSPACE_SYNC: 'workspace-sync',
  WORKSPACE_SYNC_ALL: 'workspace-sync-all',
  WORKSPACE_GET_SYNC_STATUS: 'workspace-get-sync-status',
  WORKSPACE_AUTO_SYNC_ENABLED: 'workspace-auto-sync-enabled',
  WORKSPACE_OPEN_FOLDER: 'workspace-open-folder',
  SERVICES_HEALTH_CHECK: 'services-health-check',
  INITIALIZE_WORKSPACE_SYNC: 'initializeWorkspaceSync',
  GENERATE_TEAM_WORKSPACE_INVITE: 'generate-team-workspace-invite',
  GENERATE_ENVIRONMENT_CONFIG_LINK: 'generate-environment-config-link',

  // Video (handled by VideoExportManager IPC registration)
  CHECK_FFMPEG: 'check-ffmpeg',
  DOWNLOAD_FFMPEG: 'download-ffmpeg',
  CONVERT_VIDEO: 'convert-video',

  // Workspace state (main-process owned)
  WORKSPACE_STATE_INITIALIZE: 'workspace-state:initialize',
  WORKSPACE_STATE_GET_STATE: 'workspace-state:get-state',
  WORKSPACE_STATE_SWITCH_WORKSPACE: 'workspace-state:switch-workspace',
  WORKSPACE_STATE_ADD_SOURCE: 'workspace-state:add-source',
  WORKSPACE_STATE_UPDATE_SOURCE: 'workspace-state:update-source',
  WORKSPACE_STATE_REMOVE_SOURCE: 'workspace-state:remove-source',
  WORKSPACE_STATE_UPDATE_SOURCE_CONTENT: 'workspace-state:update-source-content',
  WORKSPACE_STATE_REFRESH_SOURCE: 'workspace-state:refresh-source',
  WORKSPACE_STATE_IMPORT_SOURCES: 'workspace-state:import-sources',
  WORKSPACE_STATE_ADD_HEADER_RULE: 'workspace-state:add-header-rule',
  WORKSPACE_STATE_UPDATE_HEADER_RULE: 'workspace-state:update-header-rule',
  WORKSPACE_STATE_REMOVE_HEADER_RULE: 'workspace-state:remove-header-rule',
  WORKSPACE_STATE_ADD_PROXY_RULE: 'workspace-state:add-proxy-rule',
  WORKSPACE_STATE_REMOVE_PROXY_RULE: 'workspace-state:remove-proxy-rule',
  WORKSPACE_STATE_CREATE_WORKSPACE: 'workspace-state:create-workspace',
  WORKSPACE_STATE_UPDATE_WORKSPACE: 'workspace-state:update-workspace',
  WORKSPACE_STATE_DELETE_WORKSPACE: 'workspace-state:delete-workspace',
  WORKSPACE_STATE_COPY_WORKSPACE_DATA: 'workspace-state:copy-workspace-data',
  WORKSPACE_STATE_SYNC_WORKSPACE: 'workspace-state:sync-workspace',
  WORKSPACE_STATE_GET_ENVIRONMENT_STATE: 'workspace-state:get-environment-state',
  WORKSPACE_STATE_CREATE_ENVIRONMENT: 'workspace-state:create-environment',
  WORKSPACE_STATE_DELETE_ENVIRONMENT: 'workspace-state:delete-environment',
  WORKSPACE_STATE_SWITCH_ENVIRONMENT: 'workspace-state:switch-environment',
  WORKSPACE_STATE_SET_VARIABLE: 'workspace-state:set-variable',
  WORKSPACE_STATE_BATCH_SET_VARIABLES: 'workspace-state:batch-set-variables',
} as const;

// ── Send channels (renderer → main, fire-and-forget) ───────────────

export const IPC_SEND = {
  // Updates
  CHECK_FOR_UPDATES: 'check-for-updates',
  INSTALL_UPDATE: 'install-update',

  // Window management
  SHOW_MAIN_WINDOW: 'showMainWindow',
  HIDE_MAIN_WINDOW: 'hideMainWindow',
  MINIMIZE_WINDOW: 'minimizeWindow',
  MAXIMIZE_WINDOW: 'maximizeWindow',
  CLOSE_WINDOW: 'closeWindow',
  QUIT_APP: 'quitApp',
  RESTART_APP: 'restartApp',

  // Renderer lifecycle
  GET_STARTUP_DATA: 'get-startup-data',
  RENDERER_READY: 'renderer-ready',

  // Runtime updates
  PROXY_UPDATE_SOURCE: 'proxy-update-source',
  PROXY_UPDATE_SOURCES: 'proxy-update-sources',
} as const;

// ── Push channels (main → renderer, via webContents.send) ──────────

export const IPC_PUSH = {
  // Navigation
  NAVIGATE_TO: 'navigate-to',
  TRIGGER_UPDATE_CHECK: 'trigger-update-check',

  // App visibility
  SHOW_APP: 'showApp',
  HIDE_APP: 'hideApp',

  // Network
  NETWORK_STATE_CHANGED: 'network-state-changed',
  NETWORK_STATE_SYNC: 'network-state-sync',
  NETWORK_CHANGE: 'network-change',

  // System
  SYSTEM_SUSPEND: 'system-suspend',
  SYSTEM_RESUME: 'system-resume',

  // Recording
  RECORDING_RECEIVED: 'recording-received',
  RECORDING_PROGRESS: 'recording-progress',
  RECORDING_PROCESSING: 'recording-processing',
  RECORDING_DELETED: 'recording-deleted',
  RECORDING_METADATA_UPDATED: 'recording-metadata-updated',

  // Video
  START_VIDEO_RECORDING: 'start-video-recording',
  STOP_VIDEO_RECORDING: 'stop-video-recording',
  VIDEO_CONVERSION_PROGRESS: 'video-conversion-progress',
  FFMPEG_DOWNLOAD_PROGRESS: 'ffmpeg-download-progress',

  // WebSocket
  WS_CONNECTION_STATUS_CHANGED: 'ws-connection-status-changed',

  // Git
  GIT_CONNECTION_PROGRESS: 'git-connection-progress',
  GIT_COMMIT_PROGRESS: 'git-commit-progress',

  // Protocol / CLI
  PROCESS_TEAM_WORKSPACE_INVITE: 'process-team-workspace-invite',
  PROCESS_ENVIRONMENT_CONFIG_IMPORT: 'process-environment-config-import',
  SHOW_ERROR_MESSAGE: 'show-error-message',
  CLI_WORKSPACE_JOINED: 'cli-workspace-joined',
  ENVIRONMENTS_STRUCTURE_CHANGED: 'environments-structure-changed',

  // Workspace data
  WORKSPACE_DATA_UPDATED: 'workspace-data-updated',
  SYNC_STATUS_UPDATED: 'sync-status-updated',

  // Settings (main → renderer, after any mutation from any source)
  SETTINGS_CHANGED: 'settings-changed',

  // Workspace state (main → renderer)
  WORKSPACE_STATE_PATCH: 'workspace:state-patch',
  WORKSPACE_SWITCH_PROGRESS: 'workspace:switch-progress',
} as const;

// ── Type helpers ────────────────────────────────────────────────────
