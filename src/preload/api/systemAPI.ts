import electron from 'electron';
const { ipcRenderer } = electron;

const systemAPI = {
    isDevelopment: process.env.NODE_ENV === 'development',
    platform: process.platform,

    getAppVersion: (): Promise<unknown> => ipcRenderer.invoke('getAppVersion'),
    openExternal: (url: string): Promise<unknown> => ipcRenderer.invoke('openExternal', url),
    showItemInFolder: (filePath: string): Promise<unknown> => ipcRenderer.invoke('showItemInFolder', filePath),
    openAppPath: (pathKey: string): Promise<unknown> => ipcRenderer.invoke('openAppPath', pathKey),
    getSystemTimezone: (): Promise<unknown> => ipcRenderer.invoke('getSystemTimezone'),

    checkScreenRecordingPermission: (): Promise<unknown> => ipcRenderer.invoke('checkScreenRecordingPermission'),
    requestScreenRecordingPermission: (): Promise<unknown> => ipcRenderer.invoke('requestScreenRecordingPermission'),

    // Global hotkey management
    disableRecordingHotkey: (): Promise<unknown> => ipcRenderer.invoke('disableRecordingHotkey'),
    enableRecordingHotkey: (): Promise<unknown> => ipcRenderer.invoke('enableRecordingHotkey'),

    showMainWindow: (): void => ipcRenderer.send('showMainWindow'),
    hideMainWindow: (): void => ipcRenderer.send('hideMainWindow'),
    minimizeWindow: (): void => ipcRenderer.send('minimizeWindow'),
    maximizeWindow: (): void => ipcRenderer.send('maximizeWindow'),
    closeWindow: (): void => ipcRenderer.send('closeWindow'),
    quitApp: (): void => ipcRenderer.send('quitApp'),
    restartApp: (): void => ipcRenderer.send('restartApp'),

    send: (channel: string, ...args: unknown[]): void => {
        const allowedChannels = [
            'workspace-switched',
            'workspace-updated',
            'environment-switched',
            'environment-variables-changed'
        ];
        if (allowedChannels.includes(channel)) {
            ipcRenderer.send(channel, ...args);
        }
    },

    // Signal that renderer is ready to receive protocol messages
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

    onNavigateTo: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
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
