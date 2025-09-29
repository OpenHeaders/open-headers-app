const { ipcRenderer } = require('electron');

const gitAPI = {
    // Git sync APIs
    testGitConnection: (config) => ipcRenderer.invoke('testGitConnection', config),
    syncGitWorkspace: (config) => ipcRenderer.invoke('syncGitWorkspace', config),
    getGitStatus: () => ipcRenderer.invoke('getGitStatus'),
    installGit: () => ipcRenderer.invoke('installGit'),
    cleanupGitRepository: (gitUrl) => ipcRenderer.invoke('cleanupGitRepository', gitUrl),
    cleanupGitRepo: (gitUrl) => ipcRenderer.invoke('cleanupGitRepository', gitUrl), // Alias for backward compatibility
    commitConfiguration: (config) => ipcRenderer.invoke('commitConfiguration', config),
    createBranch: (config) => ipcRenderer.invoke('createBranch', config),
    checkWritePermissions: (config) => ipcRenderer.invoke('checkWritePermissions', config),
    
    // Git installation progress event
    onGitInstallProgress: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('git-install-progress', subscription);
        return () => ipcRenderer.removeListener('git-install-progress', subscription);
    },
    
    // Git connection test progress event
    onGitConnectionProgress: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('git-connection-progress', subscription);
        return () => ipcRenderer.removeListener('git-connection-progress', subscription);
    },
    
    // Git commit progress event
    onGitCommitProgress: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('git-commit-progress', subscription);
        return () => ipcRenderer.removeListener('git-commit-progress', subscription);
    }
};

module.exports = gitAPI;