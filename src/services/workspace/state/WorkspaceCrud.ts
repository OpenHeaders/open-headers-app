/**
 * WorkspaceCrud — workspace CRUD operations extracted from WorkspaceStateService.
 *
 * All functions receive a StateContext so they can mutate state, mark dirty,
 * broadcast, and persist without coupling to the service class.
 */

import fs from 'fs';
import path from 'path';
import mainLogger from '../../../utils/mainLogger';
import atomicWriter from '../../../utils/atomicFileWriter';
import { DATA_FORMAT_VERSION } from '../../../config/version';
import { errorMessage } from '../../../types/common';
import type { Workspace, WorkspaceType } from '../../../types/workspace';
import type { StateContext, WorkspaceSyncSchedulerLike } from './types';
import { workspaceDir } from './StatePersistence';
import { sendPatchToRenderers } from './StateBroadcaster';

const { createLogger } = mainLogger;
const log = createLogger('WorkspaceCrud');

export async function createWorkspace(
    ctx: StateContext,
    workspace: Partial<Workspace> & { id: string; name: string; type: WorkspaceType },
    switchWorkspace: (id: string) => Promise<void>
): Promise<Workspace> {
    if (ctx.state.workspaces.some(w => w.id === workspace.id)) {
        throw new Error(`Workspace with ID ${workspace.id} already exists`);
    }
    if (!workspace.name || workspace.name.length < 1 || workspace.name.length > 100) {
        throw new Error('Workspace name must be between 1 and 100 characters');
    }
    if (!['personal', 'team', 'git'].includes(workspace.type)) {
        throw new Error('Invalid workspace type');
    }
    if (!/^[a-zA-Z0-9\-_]+$/.test(workspace.id)) {
        throw new Error('Workspace ID can only contain letters, numbers, hyphens, and underscores');
    }
    if (workspace.type === 'git' && !workspace.gitUrl) {
        throw new Error('Git workspace must have a gitUrl');
    }

    const newWorkspace: Workspace = {
        ...workspace,
        createdAt: workspace.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDefault: workspace.id === 'default-personal',
        isPersonal: workspace.type === 'personal',
        isTeam: workspace.type === 'team' || workspace.type === 'git',
        metadata: { version: DATA_FORMAT_VERSION, sourceCount: 0, ruleCount: 0, proxyRuleCount: 0, ...(workspace.metadata ?? {}) }
    };

    ctx.state.workspaces.push(newWorkspace);
    ctx.dirty.workspaces = true;

    const dir = workspaceDir(ctx.appDataPath, newWorkspace.id);
    await fs.promises.mkdir(dir, { recursive: true });
    await Promise.all([
        atomicWriter.writeJson(path.join(dir, 'sources.json'), []),
        atomicWriter.writeJson(path.join(dir, 'rules.json'), { version: DATA_FORMAT_VERSION, rules: { header: [], request: [], response: [] }, metadata: { totalRules: 0, lastUpdated: new Date().toISOString() } }, { pretty: true }),
        atomicWriter.writeJson(path.join(dir, 'proxy-rules.json'), [])
    ]);

    await ctx.saveWorkspacesConfig();
    await switchWorkspace(newWorkspace.id);

    log.info(`Created workspace: ${newWorkspace.id} (${newWorkspace.type})`);
    return newWorkspace;
}

export async function updateWorkspace(ctx: StateContext, workspaceId: string, updates: Partial<Workspace>): Promise<boolean> {
    const existing = ctx.state.workspaces.find(w => w.id === workspaceId);
    if (!existing) throw new Error(`Workspace ${workspaceId} not found`);

    if (updates.name && (updates.name.length < 1 || updates.name.length > 100)) {
        throw new Error('Workspace name must be between 1 and 100 characters');
    }
    if (updates.type && !['personal', 'team', 'git'].includes(updates.type)) {
        throw new Error('Invalid workspace type');
    }

    ctx.state.workspaces = ctx.state.workspaces.map(w =>
        w.id === workspaceId ? { ...w, ...updates, updatedAt: new Date().toISOString() } : w
    );
    ctx.dirty.workspaces = true;
    await ctx.saveWorkspacesConfig();

    if (ctx.syncScheduler && workspaceId === ctx.state.activeWorkspaceId) {
        const updatedWorkspace = ctx.state.workspaces.find(w => w.id === workspaceId);
        if (updatedWorkspace) {
            await ctx.syncScheduler.onWorkspaceUpdated(workspaceId, updatedWorkspace);
        }
    }

    sendPatchToRenderers(ctx.state, ['workspaces']);
    return true;
}

export async function deleteWorkspace(
    ctx: StateContext,
    workspaceId: string,
    switchWorkspace: (id: string) => Promise<void>
): Promise<boolean> {
    if (workspaceId === 'default-personal') {
        throw new Error('Cannot delete default personal workspace');
    }

    ctx.state.workspaces = ctx.state.workspaces.filter(w => w.id !== workspaceId);
    ctx.dirty.workspaces = true;

    if (ctx.state.activeWorkspaceId === workspaceId) {
        await switchWorkspace('default-personal');
    }

    const dir = workspaceDir(ctx.appDataPath, workspaceId);
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(e => log.warn('Failed to delete workspace dir:', errorMessage(e)));
    await ctx.saveWorkspacesConfig();

    sendPatchToRenderers(ctx.state, ['workspaces']);
    log.info(`Deleted workspace: ${workspaceId}`);
    return true;
}

export async function syncWorkspace(ctx: StateContext, workspaceId: string, updateSyncStatus: (id: string, status: Record<string, unknown>) => void): Promise<{ success: boolean; error?: string }> {
    const workspace = ctx.state.workspaces.find(w => w.id === workspaceId);
    if (!workspace) return { success: false, error: 'Workspace not found' };
    if (workspace.type !== 'git') return { success: false, error: 'Only git workspaces can be synced' };
    if (!ctx.syncScheduler) return { success: false, error: 'Sync scheduler not available' };

    updateSyncStatus(workspaceId, { syncing: true });

    try {
        const result = await (ctx.syncScheduler as WorkspaceSyncSchedulerLike & { manualSync(id: string): Promise<{ success: boolean; error?: string }> }).manualSync(workspaceId);

        if (result.success && workspaceId === ctx.state.activeWorkspaceId) {
            await ctx.loadWorkspaceData(workspaceId);
            sendPatchToRenderers(ctx.state, ['sources', 'rules', 'proxyRules']);
        }

        updateSyncStatus(workspaceId, { syncing: false, lastSync: new Date().toISOString() });
        return result;
    } catch (error) {
        updateSyncStatus(workspaceId, { syncing: false, error: errorMessage(error) });
        return { success: false, error: errorMessage(error) };
    }
}

export async function copyWorkspaceData(ctx: StateContext, sourceWorkspaceId: string, targetWorkspaceId: string): Promise<void> {
    const files = ['sources.json', 'rules.json', 'proxy-rules.json', 'environments.json'];
    for (const file of files) {
        try {
            const src = path.join(workspaceDir(ctx.appDataPath, sourceWorkspaceId), file);
            const dst = path.join(workspaceDir(ctx.appDataPath, targetWorkspaceId), file);
            const data = await fs.promises.readFile(src, 'utf8');
            await fs.promises.writeFile(dst, data, 'utf8');
        } catch (_e) { /* file doesn't exist, skip */ }
    }
}
