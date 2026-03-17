import electron from 'electron';
const { ipcRenderer } = electron;

const networkAPI = {
    checkNetworkConnectivity: (): Promise<unknown> => ipcRenderer.invoke('checkNetworkConnectivity'),

    getNetworkState: (): Promise<unknown> => {
        return ipcRenderer.invoke('getNetworkState');
    },

    forceNetworkCheck: (): Promise<unknown> => ipcRenderer.invoke('forceNetworkCheck'),

    getSystemState: (): Promise<unknown> => ipcRenderer.invoke('getSystemState'),

    // Network state synchronization - used by RefreshManager and DebugNetworkState
    onNetworkStateSync: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => {
            callback(data);
        };
        ipcRenderer.on('network-state-sync', subscription);
        return () => ipcRenderer.removeListener('network-state-sync', subscription);
    }
};

export default networkAPI;
