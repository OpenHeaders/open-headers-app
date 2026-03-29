import type { IpcRendererEvent } from 'electron';
import electron from 'electron';
import type { CommitInfo, WorkspaceAuthData } from '../../types/workspace';

const { ipcRenderer } = electron;

interface GitTestConfig {
  url?: string;
  branch?: string;
  authType?: string;
  filePath?: string;
  authData?: WorkspaceAuthData;
  checkWriteAccess?: boolean;
  isInvite?: boolean;
}

interface GitTestResult {
  success: boolean;
  error?: string;
  message?: string;
  branches?: string[];
  configFileValid?: boolean;
  validationDetails?: { sourceCount: number; ruleCount: number; proxyRuleCount: number; variableCount: number };
  readAccess?: boolean;
  writeAccess?: boolean;
  warning?: string;
  hint?: string;
  debugHint?: string;
}

interface GitStatusResult {
  isInstalled: boolean;
  version?: string;
  error?: string;
  user?: { name?: string };
}

interface CommitConfig {
  url?: string;
  branch?: string;
  path?: string;
  files?: Record<string, string>;
  message?: string;
  authType?: string;
  authData?: WorkspaceAuthData;
}

interface CommitResult {
  success: boolean;
  error?: string;
  commitHash?: string;
  commitInfo?: CommitInfo;
  files?: string[];
  noChanges?: boolean;
  message?: string;
}

interface BranchConfig {
  url?: string;
  branch?: string;
  authType?: string;
  authData?: WorkspaceAuthData;
}

const gitAPI = {
  testGitConnection: (config: GitTestConfig): Promise<GitTestResult> => ipcRenderer.invoke('testGitConnection', config),
  syncGitWorkspace: (workspaceId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('syncGitWorkspace', workspaceId),
  getGitStatus: (): Promise<GitStatusResult> => ipcRenderer.invoke('getGitStatus'),
  installGit: (): Promise<{ success: boolean; message?: string; error?: string }> => ipcRenderer.invoke('installGit'),
  cleanupGitRepository: (gitUrl: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('cleanupGitRepository', gitUrl),
  cleanupGitRepo: (gitUrl: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('cleanupGitRepository', gitUrl),
  commitConfiguration: (config: CommitConfig): Promise<CommitResult> =>
    ipcRenderer.invoke('commitConfiguration', config),
  createBranch: (config: BranchConfig): Promise<{ success: boolean; error?: string; message?: string }> =>
    ipcRenderer.invoke('createBranch', config),
  checkWritePermissions: (
    config: BranchConfig,
  ): Promise<{ success: boolean; error?: string; details?: { canPush?: boolean; reason?: string } }> =>
    ipcRenderer.invoke('checkWritePermissions', config),

  onGitInstallProgress: (callback: (data: GitProgressEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, data: GitProgressEvent) => callback(data);
    ipcRenderer.on('git-install-progress', subscription);
    return () => ipcRenderer.removeListener('git-install-progress', subscription);
  },

  onGitConnectionProgress: (callback: (data: GitProgressEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, data: GitProgressEvent) => callback(data);
    ipcRenderer.on('git-connection-progress', subscription);
    return () => ipcRenderer.removeListener('git-connection-progress', subscription);
  },

  onGitCommitProgress: (callback: (data: GitProgressEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, data: GitProgressEvent) => callback(data);
    ipcRenderer.on('git-commit-progress', subscription);
    return () => ipcRenderer.removeListener('git-commit-progress', subscription);
  },
};

export default gitAPI;
