const { ipcRenderer } = require('electron');

const networkAPI = {
    checkNetworkConnectivity: () => ipcRenderer.invoke('checkNetworkConnectivity'),
    
    getNetworkState: () => {
        return ipcRenderer.invoke('getNetworkState');
    },
    
    forceNetworkCheck: () => ipcRenderer.invoke('forceNetworkCheck'),
    
    getSystemState: () => ipcRenderer.invoke('getSystemState'),
    
    // Network state synchronization - used by RefreshManager and DebugNetworkState
    onNetworkStateSync: (callback) => {
        const subscription = (_, data) => {
            callback(data);
        };
        ipcRenderer.on('network-state-sync', subscription);
        return () => ipcRenderer.removeListener('network-state-sync', subscription);
    }
};

module.exports = networkAPI;