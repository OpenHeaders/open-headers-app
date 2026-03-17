import electron from 'electron';
const { ipcRenderer } = electron;

const settingsAPI = {
    // Settings management
    saveSettings: (settings: unknown): Promise<unknown> => ipcRenderer.invoke('saveSettings', settings),
    getSettings: (): Promise<unknown> => ipcRenderer.invoke('getSettings'),

    // Auto-launch
    setAutoLaunch: (enable: boolean): Promise<unknown> => ipcRenderer.invoke('setAutoLaunch', enable),

    // WebSocket sources
    updateWebSocketSources: (sources: unknown): void => {
        ipcRenderer.send('updateWebSocketSources', sources);
    }
};

export default settingsAPI;
