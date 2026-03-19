/**
 * Workspace domain types.
 *
 * A workspace is a container for sources, rules, environments, and proxy-rules.
 * Workspaces can be personal (local-only) or team (git-backed).
 */

// ── Workspace ───────────────────────────────────────────────────────

export type WorkspaceType = 'personal' | 'git';

export type AuthType = 'none' | 'token' | 'ssh' | 'basic';

export interface WorkspaceAuthData {
  token?: string;
  username?: string;
  password?: string;
  sshKeyPath?: string;
}

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  isPersonal?: boolean;
  isTeam?: boolean;
  gitUrl?: string;
  gitBranch?: string;
  gitPath?: string;
  authType?: AuthType;
  authData?: WorkspaceAuthData;
  createdAt?: string;
  updatedAt?: string;
  clonedFrom?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

// ── Workspace sync ──────────────────────────────────────────────────

export interface WorkspaceSyncStatus {
  syncing: boolean;
  lastSync?: string | null;
  error?: string | null;
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
