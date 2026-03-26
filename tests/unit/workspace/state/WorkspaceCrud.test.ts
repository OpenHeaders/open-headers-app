import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Workspace } from '../../../../src/types/workspace';
import type { StateContext } from '../../../../src/services/workspace/state/types';

// Mock electron
vi.mock('electron', () => ({
    default: { app: { getPath: () => '/tmp/test' }, BrowserWindow: { getAllWindows: () => [] } },
}));

// Mock mainLogger
vi.mock('../../../../src/utils/mainLogger.js', () => ({
    default: { createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }
}));

// Mock atomicFileWriter
vi.mock('../../../../src/utils/atomicFileWriter.js', () => ({
    default: { writeJson: vi.fn().mockResolvedValue(undefined), readJson: vi.fn().mockResolvedValue(null) }
}));

vi.mock('../../../../src/config/version', () => ({ DATA_FORMAT_VERSION: '3.0.0' }));

// Mock fs.promises
vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        default: {
            ...actual,
            promises: {
                mkdir: vi.fn().mockResolvedValue(undefined),
                rm: vi.fn().mockResolvedValue(undefined),
                readFile: vi.fn().mockResolvedValue('{}'),
                writeFile: vi.fn().mockResolvedValue(undefined),
            },
        },
        promises: {
            mkdir: vi.fn().mockResolvedValue(undefined),
            rm: vi.fn().mockResolvedValue(undefined),
            readFile: vi.fn().mockResolvedValue('{}'),
            writeFile: vi.fn().mockResolvedValue(undefined),
        },
    };
});

import {
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    copyWorkspaceData,
} from '../../../../src/services/workspace/state/WorkspaceCrud';

function createCtx(overrides: Partial<StateContext> = {}): StateContext {
    return {
        state: {
            initialized: true, loading: false, error: null,
            workspaces: [{ id: 'default-personal', name: 'Personal', type: 'personal' } as Workspace],
            activeWorkspaceId: 'default-personal',
            isWorkspaceSwitching: false, syncStatus: {},
            sources: [], rules: { header: [], request: [], response: [] }, proxyRules: [],
        },
        dirty: { sources: false, rules: false, proxyRules: false, workspaces: false },
        appDataPath: '/tmp/test',
        webSocketService: null,
        proxyService: null,
        envResolver: null,
        sourceRefreshService: null,
        syncScheduler: null,
        scheduleDebouncedSave: vi.fn(),
        saveAll: vi.fn().mockResolvedValue(undefined),
        saveSources: vi.fn().mockResolvedValue(undefined),
        saveWorkspacesConfig: vi.fn().mockResolvedValue(undefined),
        loadWorkspaceData: vi.fn().mockResolvedValue(undefined),
        updateWorkspaceMetadataInMemory: vi.fn(),
        ...overrides,
    };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('createWorkspace', () => {
    it('creates a workspace and auto-switches', async () => {
        const ctx = createCtx();
        const switchFn = vi.fn().mockResolvedValue(undefined);
        const result = await createWorkspace(ctx, { id: 'ws-new', name: 'New Workspace', type: 'personal' }, switchFn);

        expect(result.id).toBe('ws-new');
        expect(result.isPersonal).toBe(true);
        expect(ctx.state.workspaces).toHaveLength(2);
        expect(ctx.dirty.workspaces).toBe(true);
        expect(ctx.saveWorkspacesConfig).toHaveBeenCalled();
        expect(switchFn).toHaveBeenCalledWith('ws-new');
    });

    it('rejects duplicate workspace ID', async () => {
        const ctx = createCtx();
        await expect(createWorkspace(ctx, { id: 'default-personal', name: 'Dup', type: 'personal' }, vi.fn()))
            .rejects.toThrow('already exists');
    });

    it('rejects empty workspace name', async () => {
        const ctx = createCtx();
        await expect(createWorkspace(ctx, { id: 'ws-x', name: '', type: 'personal' }, vi.fn()))
            .rejects.toThrow('Workspace name must be');
    });

    it('rejects name over 100 chars', async () => {
        const ctx = createCtx();
        await expect(createWorkspace(ctx, { id: 'ws-x', name: 'A'.repeat(101), type: 'personal' }, vi.fn()))
            .rejects.toThrow('Workspace name must be');
    });

    it('rejects invalid workspace type', async () => {
        const ctx = createCtx();
        await expect(createWorkspace(ctx, { id: 'ws-x', name: 'X', type: 'invalid' as 'personal' }, vi.fn()))
            .rejects.toThrow('Invalid workspace type');
    });

    it('rejects invalid ID characters', async () => {
        const ctx = createCtx();
        await expect(createWorkspace(ctx, { id: 'ws x!', name: 'X', type: 'personal' }, vi.fn()))
            .rejects.toThrow('letters, numbers, hyphens');
    });

    it('requires gitUrl for git workspaces', async () => {
        const ctx = createCtx();
        await expect(createWorkspace(ctx, { id: 'ws-git', name: 'Git WS', type: 'git' }, vi.fn()))
            .rejects.toThrow('gitUrl');
    });

    it('sets isTeam=true for git type', async () => {
        const ctx = createCtx();
        const result = await createWorkspace(ctx, {
            id: 'ws-git',
            name: 'Git WS',
            type: 'git',
            gitUrl: 'https://github.com/openheaders/config.git'
        }, vi.fn().mockResolvedValue(undefined));
        expect(result.isTeam).toBe(true);
        expect(result.isPersonal).toBe(false);
    });
});

describe('updateWorkspace', () => {
    it('updates workspace fields and saves', async () => {
        const ctx = createCtx();
        const result = await updateWorkspace(ctx, 'default-personal', { name: 'Renamed' });
        expect(result).toBe(true);
        expect(ctx.state.workspaces[0].name).toBe('Renamed');
        expect(ctx.saveWorkspacesConfig).toHaveBeenCalled();
    });

    it('throws for non-existent workspace', async () => {
        const ctx = createCtx();
        await expect(updateWorkspace(ctx, 'nonexistent', { name: 'X' }))
            .rejects.toThrow('not found');
    });

    it('validates name over 100 chars', async () => {
        const ctx = createCtx();
        await expect(updateWorkspace(ctx, 'default-personal', { name: 'A'.repeat(101) }))
            .rejects.toThrow('Workspace name must be');
    });

    it('notifies sync scheduler for active workspace', async () => {
        const onWorkspaceUpdated = vi.fn().mockResolvedValue(undefined);
        const ctx = createCtx({
            syncScheduler: { onWorkspaceSwitch: vi.fn(), onWorkspaceUpdated, importSyncedData: vi.fn() },
        });
        await updateWorkspace(ctx, 'default-personal', { description: 'Updated desc' });
        expect(onWorkspaceUpdated).toHaveBeenCalledWith('default-personal', expect.objectContaining({ description: 'Updated desc' }));
    });
});

describe('deleteWorkspace', () => {
    it('removes workspace from state', async () => {
        const ctx = createCtx();
        ctx.state.workspaces.push({ id: 'ws-del', name: 'To Delete', type: 'personal' } as Workspace);
        const switchFn = vi.fn().mockResolvedValue(undefined);
        const result = await deleteWorkspace(ctx, 'ws-del', switchFn);
        expect(result).toBe(true);
        expect(ctx.state.workspaces.find(w => w.id === 'ws-del')).toBeUndefined();
    });

    it('refuses to delete default workspace', async () => {
        const ctx = createCtx();
        await expect(deleteWorkspace(ctx, 'default-personal', vi.fn()))
            .rejects.toThrow('Cannot delete default');
    });

    it('switches away if deleting active workspace', async () => {
        const ctx = createCtx();
        ctx.state.workspaces.push({ id: 'ws-del', name: 'Active', type: 'personal' } as Workspace);
        ctx.state.activeWorkspaceId = 'ws-del';
        const switchFn = vi.fn().mockResolvedValue(undefined);
        await deleteWorkspace(ctx, 'ws-del', switchFn);
        expect(switchFn).toHaveBeenCalledWith('default-personal');
    });
});

describe('copyWorkspaceData', () => {
    it('copies files between workspaces without throwing', async () => {
        const ctx = createCtx();
        await expect(copyWorkspaceData(ctx, 'default-personal', 'ws-target')).resolves.toBeUndefined();
    });
});
