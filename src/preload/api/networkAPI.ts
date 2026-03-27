import electron from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { NetworkInterfaceInfo } from 'os';

const { ipcRenderer } = electron;

interface NetworkState {
    isOnline: boolean;
    networkQuality: string;
    vpnActive: boolean;
    interfaces: [string, { name: string; addresses: NetworkInterfaceInfo[]; type: string }][];
    primaryInterface: string | null;
    connectionType: string;
    diagnostics: { dnsResolvable: boolean; internetReachable: boolean; captivePortal: boolean; latency: number };
    lastUpdate: number;
    version: number;
    confidence?: number;
}

const networkAPI = {
    checkNetworkConnectivity: (): Promise<{ isOnline: boolean }> => ipcRenderer.invoke('checkNetworkConnectivity'),

    getNetworkState: (): Promise<NetworkState> => {
        return ipcRenderer.invoke('getNetworkState');
    },

    forceNetworkCheck: (): Promise<{ isOnline: boolean }> => ipcRenderer.invoke('forceNetworkCheck'),

    getSystemState: (): Promise<NetworkState> => ipcRenderer.invoke('getSystemState'),

    onNetworkStateSync: (callback: (data: NetworkStateSyncData) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: NetworkStateSyncData) => {
            callback(data);
        };
        ipcRenderer.on('network-state-sync', subscription);
        return () => ipcRenderer.removeListener('network-state-sync', subscription);
    }
};

export default networkAPI;
