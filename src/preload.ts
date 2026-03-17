// preload.ts - Modularized secure bridge between renderer and main process
import electron from 'electron';
const { contextBridge } = electron;

// Import modules
import httpBridge from './preload/modules/httpBridge';
import totpGenerator from './preload/modules/totpGenerator';

// Import APIs
import fileAPI from './preload/api/fileAPI';
import systemAPI from './preload/api/systemAPI';
import settingsAPI from './preload/api/settingsAPI';
import networkAPI from './preload/api/networkAPI';
import updateAPI from './preload/api/updateAPI';
import recordingAPI from './preload/api/recordingAPI';
import proxyAPI from './preload/api/proxyAPI';
import gitAPI from './preload/api/gitAPI';
import workspaceAPI from './preload/api/workspaceAPI';
import videoAPI from './preload/api/videoAPI';
import cliAPI from './preload/api/cliAPI';

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
    makeHttpRequest: httpBridge.makeHttpRequest.bind(httpBridge),

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
    ...cliAPI
});

// TOTP generation helper
contextBridge.exposeInMainWorld('generateTOTP', totpGenerator.generate.bind(totpGenerator));
