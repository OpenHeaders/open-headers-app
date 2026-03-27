import electron from 'electron';
import type { IpcRendererEvent } from 'electron';

const { ipcRenderer } = electron;

const systemAPI = {
    isDevelopment: process.env.NODE_ENV === 'development',
    platform: process.platform,

    getAppVersion: (): Promise<string> => ipcRenderer.invoke('getAppVersion'),
    openExternal: (url: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('openExternal', url),
    showItemInFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('showItemInFolder', filePath),
    openAppPath: (pathKey: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('openAppPath', pathKey),
    getSystemTimezone: (): Promise<{ timezone: string; offset: number; method: string }> => ipcRenderer.invoke('getSystemTimezone'),

    checkScreenRecordingPermission: (): Promise<{ success: boolean; hasPermission?: boolean }> => ipcRenderer.invoke('checkScreenRecordingPermission'),
    requestScreenRecordingPermission: (): Promise<{ success: boolean; hasPermission?: boolean; platform: string; needsManualGrant?: boolean; error?: string }> => ipcRenderer.invoke('requestScreenRecordingPermission'),

    disableRecordingHotkey: (): Promise<void> => ipcRenderer.invoke('disableRecordingHotkey'),
    enableRecordingHotkey: (): Promise<void> => ipcRenderer.invoke('enableRecordingHotkey'),

    showMainWindow: (): void => ipcRenderer.send('showMainWindow'),
    hideMainWindow: (): void => ipcRenderer.send('hideMainWindow'),
    minimizeWindow: (): void => ipcRenderer.send('minimizeWindow'),
    maximizeWindow: (): void => ipcRenderer.send('maximizeWindow'),
    closeWindow: (): void => ipcRenderer.send('closeWindow'),
    quitApp: (): void => ipcRenderer.send('quitApp'),
    restartApp: (): void => ipcRenderer.send('restartApp'),

    send: (_channel: string, ..._args: unknown[]): void => {
        // Environment IPC channels removed — main process now owns environment state.
        // All environment mutations go through workspace-state:* IPC handlers.
    },

    signalRendererReady: (): void => {
        ipcRenderer.send('renderer-ready');
    },

    onShowApp: (callback: () => void): (() => void) => {
        const subscription = () => callback();
        ipcRenderer.on('showApp', subscription);
        return () => ipcRenderer.removeListener('showApp', subscription);
    },

    onHideApp: (callback: () => void): (() => void) => {
        const subscription = () => callback();
        ipcRenderer.on('hideApp', subscription);
        return () => ipcRenderer.removeListener('hideApp', subscription);
    },

    onQuitApp: (callback: () => void): (() => void) => {
        const subscription = () => callback();
        ipcRenderer.on('quitApp', subscription);
        return () => ipcRenderer.removeListener('quitApp', subscription);
    },

    onNavigateTo: (callback: (data: NavigationData) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: NavigationData) => callback(data);
        ipcRenderer.on('navigate-to', subscription);
        return () => ipcRenderer.removeListener('navigate-to', subscription);
    },

    onTriggerUpdateCheck: (callback: () => void): (() => void) => {
        const subscription = () => callback();
        ipcRenderer.on('trigger-update-check', subscription);
        return () => ipcRenderer.removeListener('trigger-update-check', subscription);
    },

    onSystemSuspend: (callback: () => void): (() => void) => {
        const subscription = () => callback();
        ipcRenderer.on('system-suspend', subscription);
        return () => ipcRenderer.removeListener('system-suspend', subscription);
    },

    onSystemResume: (callback: () => void): (() => void) => {
        const subscription = () => callback();
        ipcRenderer.on('system-resume', subscription);
        return () => ipcRenderer.removeListener('system-resume', subscription);
    }
};

export default systemAPI;
