import electron from 'electron';
const { ipcRenderer } = electron;

const fileAPI = {
    // File operations
    openFileDialog: (): Promise<unknown> => ipcRenderer.invoke('openFileDialog'),
    saveFileDialog: (options: unknown): Promise<unknown> => ipcRenderer.invoke('saveFileDialog', options),
    readFile: (filePath: string, encoding: string): Promise<unknown> => ipcRenderer.invoke('readFile', filePath, encoding),
    writeFile: (filePath: string, content: string): Promise<unknown> => ipcRenderer.invoke('writeFile', filePath, content),
    watchFile: (sourceId: string, filePath: string): Promise<unknown> => ipcRenderer.invoke('watchFile', sourceId, filePath),
    unwatchFile: (filePath: string): Promise<unknown> => ipcRenderer.invoke('unwatchFile', filePath),

    // Storage operations
    saveToStorage: (filename: string, content: string): Promise<unknown> => ipcRenderer.invoke('saveToStorage', filename, content),
    loadFromStorage: (filename: string): Promise<unknown> => ipcRenderer.invoke('loadFromStorage', filename),
    deleteFromStorage: (filename: string): Promise<unknown> => ipcRenderer.invoke('deleteFromStorage', filename),
    deleteDirectory: (dirPath: string): Promise<unknown> => ipcRenderer.invoke('deleteDirectory', dirPath),

    // Recording operations
    openRecordFile: (filePath: string): Promise<unknown> => ipcRenderer.invoke('openRecordFile', filePath),
    getResourcePath: (filename: string): Promise<unknown> => ipcRenderer.invoke('getResourcePath', filename),

    // Environment variables
    getEnvVariable: (name: string): Promise<unknown> => ipcRenderer.invoke('getEnvVariable', name),

    // App paths
    getAppPath: (): Promise<unknown> => ipcRenderer.invoke('getAppPath'),

    // Events
    onFileChanged: (callback: (sourceId: string, content: string) => void): (() => void) => {
        const subscription = (_: unknown, sourceId: string, content: string) => callback(sourceId, content);
        ipcRenderer.on('fileChanged', subscription);
        return () => ipcRenderer.removeListener('fileChanged', subscription);
    }
};

export default fileAPI;
