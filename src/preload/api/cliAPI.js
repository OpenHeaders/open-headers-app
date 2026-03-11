const { ipcRenderer } = require('electron');

const cliAPI = {
    cliApiStatus: () => ipcRenderer.invoke('cli-api-status'),
    cliApiStart: (port) => ipcRenderer.invoke('cli-api-start', port),
    cliApiStop: () => ipcRenderer.invoke('cli-api-stop'),
    cliApiGetLogs: () => ipcRenderer.invoke('cli-api-get-logs'),
    cliApiClearLogs: () => ipcRenderer.invoke('cli-api-clear-logs'),
    cliApiRegenerateToken: () => ipcRenderer.invoke('cli-api-regenerate-token')
};

module.exports = cliAPI;
