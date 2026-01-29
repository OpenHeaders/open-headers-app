const { ipcRenderer } = require('electron');

const updateAPI = {
    // Update functionality
    checkForUpdates: (isManual) => ipcRenderer.send('check-for-updates', isManual),
    installUpdate: () => ipcRenderer.send('install-update'),
    
    // Update events
    onUpdateCheckAlreadyInProgress: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('update-check-already-in-progress', subscription);
        return () => ipcRenderer.removeListener('update-check-already-in-progress', subscription);
    },

    onClearUpdateCheckingNotification: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('clear-update-checking-notification', subscription);
        return () => ipcRenderer.removeListener('clear-update-checking-notification', subscription);
    },

    onUpdateAlreadyDownloaded: (callback) => {
        const subscription = (_, data) => {
            // Pass the full payload including isManual and info
            callback(data || {});
        };
        ipcRenderer.on('update-already-downloaded', subscription);
        return () => ipcRenderer.removeListener('update-already-downloaded', subscription);
    },

    onUpdateAvailable: (callback) => {
        const subscription = (_, info) => callback(info);
        ipcRenderer.on('update-available', subscription);
        return () => ipcRenderer.removeListener('update-available', subscription);
    },
    
    onUpdateProgress: (callback) => {
        const subscription = (_, progressObj) => callback(progressObj);
        ipcRenderer.on('update-progress', subscription);
        return () => ipcRenderer.removeListener('update-progress', subscription);
    },
    
    onUpdateDownloaded: (callback) => {
        const subscription = (_, info) => callback(info);
        ipcRenderer.on('update-downloaded', subscription);
        return () => ipcRenderer.removeListener('update-downloaded', subscription);
    },
    
    onUpdateError: (callback) => {
        const subscription = (_, message) => callback(message);
        ipcRenderer.on('update-error', subscription);
        return () => ipcRenderer.removeListener('update-error', subscription);
    },
    
    onUpdateNotAvailable: (callback) => {
        const subscription = (_, info) => callback(info);
        ipcRenderer.on('update-not-available', subscription);
        return () => ipcRenderer.removeListener('update-not-available', subscription);
    }
};

module.exports = updateAPI;