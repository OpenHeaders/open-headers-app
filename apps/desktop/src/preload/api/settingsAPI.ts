import type { IpcRendererEvent } from 'electron';
import electron from 'electron';
import type { AppSettings } from '@/types/settings';

const { ipcRenderer } = electron;

const settingsAPI = {
  saveSettings: (settings: Partial<AppSettings>): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('saveSettings', settings),
  getSettings: (): Promise<Partial<AppSettings>> => ipcRenderer.invoke('getSettings'),

  setAutoLaunch: (enable: boolean): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('setAutoLaunch', enable),

  onSettingsChanged: (callback: (settings: AppSettings) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, settings: AppSettings) => callback(settings);
    ipcRenderer.on('settings-changed', subscription);
    return () => ipcRenderer.removeListener('settings-changed', subscription);
  },
};

export default settingsAPI;
