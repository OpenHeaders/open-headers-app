import type { IpcRendererEvent } from 'electron';
import electron from 'electron';

const { ipcRenderer } = electron;

const updateAPI = {
  checkForUpdates: (isManual: boolean): void => ipcRenderer.send('check-for-updates', isManual),
  installUpdate: (): void => ipcRenderer.send('install-update'),

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

  onUpdateAlreadyDownloaded: (callback: (data: UpdateInfoEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, data: UpdateInfoEvent) => {
      callback(data);
    };
    ipcRenderer.on('update-already-downloaded', subscription);
    return () => ipcRenderer.removeListener('update-already-downloaded', subscription);
  },

  onUpdateAvailable: (callback: (info: UpdateInfoEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, info: UpdateInfoEvent) => callback(info);
    ipcRenderer.on('update-available', subscription);
    return () => ipcRenderer.removeListener('update-available', subscription);
  },

  onUpdateProgress: (callback: (progressObj: UpdateProgressEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, progressObj: UpdateProgressEvent) => callback(progressObj);
    ipcRenderer.on('update-progress', subscription);
    return () => ipcRenderer.removeListener('update-progress', subscription);
  },

  onUpdateDownloaded: (callback: (info: UpdateInfoEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, info: UpdateInfoEvent) => callback(info);
    ipcRenderer.on('update-downloaded', subscription);
    return () => ipcRenderer.removeListener('update-downloaded', subscription);
  },

  onUpdateError: (callback: (message: { message: string; error?: string }) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, message: { message: string; error?: string }) => callback(message);
    ipcRenderer.on('update-error', subscription);
    return () => ipcRenderer.removeListener('update-error', subscription);
  },

  onUpdateNotAvailable: (callback: (info: UpdateInfoEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, info: UpdateInfoEvent) => callback(info);
    ipcRenderer.on('update-not-available', subscription);
    return () => ipcRenderer.removeListener('update-not-available', subscription);
  },
};

export default updateAPI;
