import electron from 'electron';
const { ipcRenderer } = electron;

const cliAPI = {
    cliApiStatus: (): Promise<unknown> => ipcRenderer.invoke('cli-api-status'),
    cliApiStart: (port: number): Promise<unknown> => ipcRenderer.invoke('cli-api-start', port),
    cliApiStop: (): Promise<unknown> => ipcRenderer.invoke('cli-api-stop'),
    cliApiGetLogs: (): Promise<unknown> => ipcRenderer.invoke('cli-api-get-logs'),
    cliApiClearLogs: (): Promise<unknown> => ipcRenderer.invoke('cli-api-clear-logs'),
    cliApiRegenerateToken: (): Promise<unknown> => ipcRenderer.invoke('cli-api-regenerate-token')
};

export default cliAPI;
