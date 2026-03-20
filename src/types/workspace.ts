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
  username?: string;
  password?: string;
  sshKeyPath?: string;
  privateKey?: string;
  publicKey?: string;
  passphrase?: string;
  [key: string]: string | undefined;
}

export interface WorkspaceMetadata {
  version?: string;
  sourceCount?: number;
  ruleCount?: number;
  proxyRuleCount?: number;
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
}

// ── Workspace sync ──────────────────────────────────────────────────

export interface WorkspaceSyncStatus {
  syncing?: boolean;
  lastSync?: string | null;
  error?: string | null;
  lastCommit?: string;
  commitInfo?: Record<string, unknown>;
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

// ── Services health ─────────────────────────────────────────────────

export interface ServicesHealth {
  gitSync: boolean;
  workspaceSyncScheduler: boolean;
  networkService: boolean;
  proxyService: boolean;
  webSocketService: boolean;
  serviceRegistry: Record<string, unknown>;
}
