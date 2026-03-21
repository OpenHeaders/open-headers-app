/**
 * Workspace domain types.
 *
 * A workspace is a container for sources, rules, environments, and proxy-rules.
 * Workspaces can be personal (local-only) or team (git-backed).
 */

// ── Workspace ───────────────────────────────────────────────────────

export type WorkspaceType = 'personal' | 'team' | 'git';

export type AuthType = 'none' | 'token' | 'ssh' | 'ssh-key' | 'basic';

export interface WorkspaceAuthData {
  token?: string;
  tokenType?: string;
  username?: string;
  password?: string;
  sshKeySource?: string;
  sshKey?: string;
  sshKeyPath?: string;
  privateKey?: string;
  publicKey?: string;
  passphrase?: string;
  sshPassphrase?: string;
}

export interface WorkspaceMetadata {
  version?: string;
  sourceCount?: number;
  ruleCount?: number;
  proxyRuleCount?: number;
  lastDataLoad?: string;
  lastDataUpdate?: string;
}

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  isDefault?: boolean;
  isPersonal?: boolean;
  isTeam?: boolean;
  autoSync?: boolean;
  gitUrl?: string;
  gitBranch?: string;
  gitPath?: string;
  authType?: AuthType;
  authData?: WorkspaceAuthData;
  createdAt?: string;
  updatedAt?: string;
  clonedFrom?: string;
  description?: string;
  metadata?: WorkspaceMetadata;
  inviteMetadata?: {
    invitedBy?: string | null;
    inviteId?: string | null;
    joinedAt?: string;
  };
}

// ── Workspace sync ──────────────────────────────────────────────────

export interface CommitInfo {
  commitHash?: string;
  message?: string;
  author?: string;
  date?: string;
}

export interface WorkspaceSyncStatus {
  syncing?: boolean;
  lastSync?: string | null;
  error?: string | null;
  lastCommit?: string;
  commitInfo?: CommitInfo;
}

// ── Team invite ─────────────────────────────────────────────────────

export interface TeamWorkspaceInvite {
  version: string;
  workspaceName: string;
  description?: string;
  repoUrl: string;
  branch: string;
  configPath: string;
  authType: AuthType;
  authData?: WorkspaceAuthData;
  inviterName: string;
  inviteId: string;
  createdAt: string;
}

// ── IPC event data ──────────────────────────────────────────────────

export interface WorkspaceSyncCompletedData {
  workspaceId: string;
  success: boolean;
  error?: string;
  timestamp?: number;
  commitInfo?: CommitInfo;
  hasChanges?: boolean;
  isInitialSync?: boolean;
}

export interface WorkspaceDataUpdatedData {
  workspaceId: string;
  timestamp: number;
}

export interface CliWorkspaceJoinedData {
  workspaceId: string;
}

// ── Services health ─────────────────────────────────────────────────

export interface ServiceRegistryStatus {
  initialized: boolean;
  error: string | null;
  dependencies: string[];
}

export interface ServicesHealth {
  gitSync: boolean;
  workspaceSyncScheduler: boolean;
  networkService: boolean;
  proxyService: boolean;
  webSocketService: boolean;
  serviceRegistry: Record<string, ServiceRegistryStatus>;
}
