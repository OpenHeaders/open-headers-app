import electron from 'electron';
const { ipcRenderer } = electron;

const updateAPI = {
    // Update functionality
    checkForUpdates: (isManual: boolean): void => ipcRenderer.send('check-for-updates', isManual),
    installUpdate: (): void => ipcRenderer.send('install-update'),

    // Update events
    onUpdateCheckAlreadyInProgress: (callback: () => void): (() => void) => {
        const subscription = () => callback();
        ipcRenderer.on('update-check-already-in-progress', subscription);
        return () => ipcRenderer.removeListener('update-check-already-in-progress', subscription);
    },

    onClearUpdateCheckingNotification: (callback: () => void): (() => void) => {
        const subscription = () => callback();
        ipcRenderer.on('clear-update-checking-notification', subscription);
        return () => ipcRenderer.removeListener('clear-update-checking-notification', subscription);
    },

    onUpdateAlreadyDownloaded: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => {
            // Pass the full payload including isManual and info
            callback(data || {});
        };
        ipcRenderer.on('update-already-downloaded', subscription);
        return () => ipcRenderer.removeListener('update-already-downloaded', subscription);
    },

    onUpdateAvailable: (callback: (info: unknown) => void): (() => void) => {
        const subscription = (_: unknown, info: unknown) => callback(info);
        ipcRenderer.on('update-available', subscription);
        return () => ipcRenderer.removeListener('update-available', subscription);
    },

    onUpdateProgress: (callback: (progressObj: unknown) => void): (() => void) => {
        const subscription = (_: unknown, progressObj: unknown) => callback(progressObj);
        ipcRenderer.on('update-progress', subscription);
        return () => ipcRenderer.removeListener('update-progress', subscription);
    },

    onUpdateDownloaded: (callback: (info: unknown) => void): (() => void) => {
        const subscription = (_: unknown, info: unknown) => callback(info);
        ipcRenderer.on('update-downloaded', subscription);
        return () => ipcRenderer.removeListener('update-downloaded', subscription);
    },

    onUpdateError: (callback: (message: unknown) => void): (() => void) => {
        const subscription = (_: unknown, message: unknown) => callback(message);
        ipcRenderer.on('update-error', subscription);
        return () => ipcRenderer.removeListener('update-error', subscription);
    },

    onUpdateNotAvailable: (callback: (info: unknown) => void): (() => void) => {
        const subscription = (_: unknown, info: unknown) => callback(info);
        ipcRenderer.on('update-not-available', subscription);
        return () => ipcRenderer.removeListener('update-not-available', subscription);
    }
};

export default updateAPI;
