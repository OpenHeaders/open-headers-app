import electron from 'electron';
const { ipcRenderer } = electron;

const gitAPI = {
    // Git sync APIs
    testGitConnection: (config: unknown): Promise<unknown> => ipcRenderer.invoke('testGitConnection', config),
    syncGitWorkspace: (config: unknown): Promise<unknown> => ipcRenderer.invoke('syncGitWorkspace', config),
    getGitStatus: (): Promise<unknown> => ipcRenderer.invoke('getGitStatus'),
    installGit: (): Promise<unknown> => ipcRenderer.invoke('installGit'),
    cleanupGitRepository: (gitUrl: string): Promise<unknown> => ipcRenderer.invoke('cleanupGitRepository', gitUrl),
    cleanupGitRepo: (gitUrl: string): Promise<unknown> => ipcRenderer.invoke('cleanupGitRepository', gitUrl), // Alias for backward compatibility
    commitConfiguration: (config: unknown): Promise<unknown> => ipcRenderer.invoke('commitConfiguration', config),
    createBranch: (config: unknown): Promise<unknown> => ipcRenderer.invoke('createBranch', config),
    checkWritePermissions: (config: unknown): Promise<unknown> => ipcRenderer.invoke('checkWritePermissions', config),

    // Git installation progress event
    onGitInstallProgress: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('git-install-progress', subscription);
        return () => ipcRenderer.removeListener('git-install-progress', subscription);
    },

    // Git connection test progress event
    onGitConnectionProgress: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('git-connection-progress', subscription);
        return () => ipcRenderer.removeListener('git-connection-progress', subscription);
    },

    // Git commit progress event
    onGitCommitProgress: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('git-commit-progress', subscription);
        return () => ipcRenderer.removeListener('git-commit-progress', subscription);
    }
};

export default gitAPI;
