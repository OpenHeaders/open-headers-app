const { ipcRenderer } = require('electron');

const fileAPI = {
    // File operations
    openFileDialog: () => ipcRenderer.invoke('openFileDialog'),
    saveFileDialog: (options) => ipcRenderer.invoke('saveFileDialog', options),
    readFile: (filePath, encoding) => ipcRenderer.invoke('readFile', filePath, encoding),
    writeFile: (filePath, content) => ipcRenderer.invoke('writeFile', filePath, content),
    watchFile: (sourceId, filePath) => ipcRenderer.invoke('watchFile', sourceId, filePath),
    unwatchFile: (filePath) => ipcRenderer.invoke('unwatchFile', filePath),

    // Storage operations
    saveToStorage: (filename, content) => ipcRenderer.invoke('saveToStorage', filename, content),
    loadFromStorage: (filename) => ipcRenderer.invoke('loadFromStorage', filename),
    deleteFromStorage: (filename) => ipcRenderer.invoke('deleteFromStorage', filename),
    deleteDirectory: (dirPath) => ipcRenderer.invoke('deleteDirectory', dirPath),

    // Recording operations
    openRecordFile: (filePath) => ipcRenderer.invoke('openRecordFile', filePath),
    getResourcePath: (filename) => ipcRenderer.invoke('getResourcePath', filename),
    
    // Environment variables
    getEnvVariable: (name) => ipcRenderer.invoke('getEnvVariable', name),
    
    // App paths
    getAppPath: () => ipcRenderer.invoke('getAppPath'),
    
    // Events
    onFileChanged: (callback) => {
        const subscription = (_, sourceId, content) => callback(sourceId, content);
        ipcRenderer.on('fileChanged', subscription);
        return () => ipcRenderer.removeListener('fileChanged', subscription);
    }
};

module.exports = fileAPI;