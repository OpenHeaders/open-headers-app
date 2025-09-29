const { ipcRenderer } = require('electron');

const settingsAPI = {
    // Settings management
    saveSettings: (settings) => ipcRenderer.invoke('saveSettings', settings),
    getSettings: () => ipcRenderer.invoke('getSettings'),
    
    // Auto-launch
    setAutoLaunch: (enable) => ipcRenderer.invoke('setAutoLaunch', enable),
    
    // WebSocket sources
    updateWebSocketSources: (sources) => {
        ipcRenderer.send('updateWebSocketSources', sources);
    }
};

module.exports = settingsAPI;