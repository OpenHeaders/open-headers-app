import electron from 'electron';

const { ipcRenderer } = electron;

interface CliApiStatus {
    running: boolean;
    port: number;
    discoveryPath: string;
    token: string;
    startedAt: number | null;
    totalRequests: number;
}

const cliAPI = {
    cliApiStatus: (): Promise<CliApiStatus> => ipcRenderer.invoke('cli-api-status'),
    cliApiStart: (port: number): Promise<{ success: boolean; port?: number; error?: string }> => ipcRenderer.invoke('cli-api-start', port),
    cliApiStop: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('cli-api-stop'),
    cliApiGetLogs: (): Promise<CliApiLogEntry[]> => ipcRenderer.invoke('cli-api-get-logs'),
    cliApiClearLogs: (): Promise<{ success: boolean }> => ipcRenderer.invoke('cli-api-clear-logs'),
    cliApiRegenerateToken: (): Promise<{ success: boolean; token?: string; error?: string }> => ipcRenderer.invoke('cli-api-regenerate-token')
};

export default cliAPI;
