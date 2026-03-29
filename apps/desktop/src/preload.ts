// preload.ts - Modularized secure bridge between renderer and main process
import electron from 'electron';

const { contextBridge, ipcRenderer } = electron;

// Synchronous startup data — available to renderer at module load time (no async IPC).
// The main process loads settings before creating the window, so this is always ready.
const startupData = ipcRenderer.sendSync('get-startup-data') as {
  settings: Record<string, unknown>;
  platform: string;
  version: string;
  isPackaged: boolean;
};

contextBridge.exposeInMainWorld('startupData', startupData);

import cliAPI from './preload/api/cliAPI';
// Import APIs
import fileAPI from './preload/api/fileAPI';
import gitAPI from './preload/api/gitAPI';
import httpRequestAPI from './preload/api/httpRequestAPI';
import networkAPI from './preload/api/networkAPI';
import proxyAPI from './preload/api/proxyAPI';
import recordingAPI from './preload/api/recordingAPI';
import settingsAPI from './preload/api/settingsAPI';
import sourceRefreshAPI from './preload/api/sourceRefreshAPI';
import systemAPI from './preload/api/systemAPI';
import updateAPI from './preload/api/updateAPI';
import videoAPI from './preload/api/videoAPI';
import workspaceAPI from './preload/api/workspaceAPI';
import { createWorkspaceStateAPI } from './preload/api/workspaceStateAPI';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Environment and system info
  ...systemAPI,

  // File operations
  ...fileAPI,

  // Settings
  ...settingsAPI,

  // Network operations
  ...networkAPI,

  // Update functionality
  ...updateAPI,

  // Recording functionality
  ...recordingAPI,

  // Proxy server APIs
  ...proxyAPI,

  // Git sync APIs
  ...gitAPI,

  // Workspace management
  ...workspaceAPI,

  // Video recording
  ...videoAPI,

  // CLI API server
  ...cliAPI,

  // Source refresh (main-process owned lifecycle)
  sourceRefresh: sourceRefreshAPI,

  // HTTP request execution (main-process owned)
  httpRequest: httpRequestAPI,

  // Workspace state (main-process owned)
  workspaceState: createWorkspaceStateAPI(),
});
