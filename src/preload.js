// preload.js - Modularized secure bridge between renderer and main process
const { contextBridge } = require('electron');

// Import modules
const httpBridge = require('./preload/modules/httpBridge');
const totpGenerator = require('./preload/modules/totpGenerator');

// Import APIs
const fileAPI = require('./preload/api/fileAPI');
const systemAPI = require('./preload/api/systemAPI');
const settingsAPI = require('./preload/api/settingsAPI');
const networkAPI = require('./preload/api/networkAPI');
const updateAPI = require('./preload/api/updateAPI');
const recordingAPI = require('./preload/api/recordingAPI');
const proxyAPI = require('./preload/api/proxyAPI');
const gitAPI = require('./preload/api/gitAPI');
const workspaceAPI = require('./preload/api/workspaceAPI');
const videoAPI = require('./preload/api/videoAPI');

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
    ...videoAPI
});

// TOTP generation helper
contextBridge.exposeInMainWorld('generateTOTP', totpGenerator.generate.bind(totpGenerator));