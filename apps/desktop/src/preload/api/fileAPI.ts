import electron from 'electron';
import type { IpcRendererEvent } from 'electron';

const { ipcRenderer } = electron;

const fileAPI = {
    openFileDialog: (): Promise<string | null> => ipcRenderer.invoke('openFileDialog'),
    saveFileDialog: (options: FileDialogOptions): Promise<string | null> => ipcRenderer.invoke('saveFileDialog', options),
    readFile: (filePath: string, encoding: string): Promise<string | Buffer> => ipcRenderer.invoke('readFile', filePath, encoding),
    writeFile: (filePath: string, content: string): Promise<void> => ipcRenderer.invoke('writeFile', filePath, content),
    watchFile: (sourceId: string, filePath: string): Promise<string> => ipcRenderer.invoke('watchFile', sourceId, filePath),
    unwatchFile: (filePath: string): Promise<boolean> => ipcRenderer.invoke('unwatchFile', filePath),

    saveToStorage: (filename: string, content: string): Promise<void> => ipcRenderer.invoke('saveToStorage', filename, content),
    loadFromStorage: (filename: string): Promise<string | null> => ipcRenderer.invoke('loadFromStorage', filename),
    deleteFromStorage: (filename: string): Promise<void> => ipcRenderer.invoke('deleteFromStorage', filename),
    deleteDirectory: (dirPath: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('deleteDirectory', dirPath),

    openRecordFile: (filePath: string): Promise<void> => ipcRenderer.invoke('openRecordFile', filePath),
    getResourcePath: (filename: string): Promise<string> => ipcRenderer.invoke('getResourcePath', filename),

    getEnvVariable: (name: string): Promise<string> => ipcRenderer.invoke('getEnvVariable', name),

    getAppPath: (): Promise<string> => ipcRenderer.invoke('getAppPath'),

    onFileChanged: (callback: (sourceId: string, content: string) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, sourceId: string, content: string) => callback(sourceId, content);
        ipcRenderer.on('fileChanged', subscription);
        return () => ipcRenderer.removeListener('fileChanged', subscription);
    }
};

export default fileAPI;
