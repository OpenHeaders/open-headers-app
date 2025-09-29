const { ipcRenderer } = require('electron');

const systemAPI = {
    isDevelopment: process.env.NODE_ENV === 'development',
    platform: process.platform,
    
    getAppVersion: () => ipcRenderer.invoke('getAppVersion'),
    openExternal: (url) => ipcRenderer.invoke('openExternal', url),
    getSystemTimezone: () => ipcRenderer.invoke('getSystemTimezone'),
    
    checkScreenRecordingPermission: () => ipcRenderer.invoke('checkScreenRecordingPermission'),
    requestScreenRecordingPermission: () => ipcRenderer.invoke('requestScreenRecordingPermission'),
    
    // Global hotkey management
    disableRecordingHotkey: () => ipcRenderer.invoke('disableRecordingHotkey'),
    enableRecordingHotkey: () => ipcRenderer.invoke('enableRecordingHotkey'),
    
    showMainWindow: () => ipcRenderer.send('showMainWindow'),
    hideMainWindow: () => ipcRenderer.send('hideMainWindow'),
    minimizeWindow: () => ipcRenderer.send('minimizeWindow'),
    maximizeWindow: () => ipcRenderer.send('maximizeWindow'),
    closeWindow: () => ipcRenderer.send('closeWindow'),
    quitApp: () => ipcRenderer.send('quitApp'),
    restartApp: () => ipcRenderer.send('restartApp'),
    
    send: (channel, ...args) => {
        ipcRenderer.send(channel, ...args);
    },
    
    // Signal that renderer is ready to receive protocol messages
    signalRendererReady: () => {
        ipcRenderer.send('renderer-ready');
    },
    
    onShowApp: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('showApp', subscription);
        return () => ipcRenderer.removeListener('showApp', subscription);
    },

    onHideApp: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('hideApp', subscription);
        return () => ipcRenderer.removeListener('hideApp', subscription);
    },

    onQuitApp: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('quitApp', subscription);
        return () => ipcRenderer.removeListener('quitApp', subscription);
    },
    
    onNavigateTo: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('navigate-to', subscription);
        return () => ipcRenderer.removeListener('navigate-to', subscription);
    },
    
    onSystemSuspend: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('system-suspend', subscription);
        return () => ipcRenderer.removeListener('system-suspend', subscription);
    },

    onSystemResume: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('system-resume', subscription);
        return () => ipcRenderer.removeListener('system-resume', subscription);
    }
};

module.exports = systemAPI;