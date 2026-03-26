import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserWindow } from 'electron';

// ── Mocks for joinWorkspace / importEnvironment lazy deps ────────
const mockTestConnection = vi.fn();
const mockSyncWorkspace = vi.fn();
const mockGetGitSyncService = vi.fn();
const mockGetWorkspaceSettingsService = vi.fn();
const mockOnCliWorkspaceCreated = vi.fn();
const mockImportEnvironments = vi.fn();

vi.mock('../../../src/main/modules/app/lifecycle', () => ({
    default: {
        getGitSyncService: (...args: unknown[]) => mockGetGitSyncService(...args),
        getWorkspaceSettingsService: (...args: unknown[]) => mockGetWorkspaceSettingsService(...args),
    }
}));

vi.mock('../../../src/services/workspace/WorkspaceStateService', () => ({
    default: {
        onCliWorkspaceCreated: (...args: unknown[]) => mockOnCliWorkspaceCreated(...args),
        importEnvironments: (...args: unknown[]) => mockImportEnvironments(...args),
    }
}));

vi.mock('../../../src/utils/mainLogger', () => ({
    default: {
        createLogger: () => ({
            info: () => {},
            warn: () => {},
            error: () => {},
            debug: () => {},
        }),
    },
}));

vi.mock('../../../src/utils/atomicFileWriter', () => ({
    default: {
        readJson: vi.fn().mockResolvedValue(null),
        writeJson: vi.fn().mockResolvedValue(undefined),
    }
}));

import { CliSetupHandler } from '../../../src/services/cli/CliSetupHandler';

type AuthData = Parameters<CliSetupHandler['_normalizeAuthData']>[1];
type NotifyData = Parameters<CliSetupHandler['_notifyRenderer']>[1];

function makeMockWindow(overrides: { isDestroyed?: () => boolean; send?: (...args: unknown[]) => void } = {}): BrowserWindow {
    return {
        isDestroyed: overrides.isDestroyed ?? (() => false),
        webContents: { send: overrides.send ?? (() => {}) },
    } as unknown as BrowserWindow;
}

describe('CliSetupHandler', () => {
    const handler = new CliSetupHandler();

    describe('_normalizeAuthData()', () => {
        it('returns empty object for authType "none"', () => {
            expect(handler._normalizeAuthData('none', { token: 'ghp_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6' })).toEqual({});
        });

        it('returns empty object for falsy authType', () => {
            expect(handler._normalizeAuthData('', undefined)).toEqual({});
        });

        it('returns empty object for missing authData', () => {
            expect(handler._normalizeAuthData('token', undefined)).toEqual({});
        });

        it('normalizes token auth with GitHub PAT', () => {
            expect(handler._normalizeAuthData('token', {
                token: 'ghp_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6',
                tokenType: 'github'
            })).toEqual({
                token: 'ghp_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6',
                tokenType: 'github'
            });
        });

        it('defaults tokenType to "auto" when not provided', () => {
            expect(handler._normalizeAuthData('token', {
                token: 'glpat-xxxxxxxxxxxxxxxxxxxx'
            })).toEqual({
                token: 'glpat-xxxxxxxxxxxxxxxxxxxx',
                tokenType: 'auto'
            });
        });

        it('normalizes token auth with empty token to empty string', () => {
            expect(handler._normalizeAuthData('token', {})).toEqual({
                token: '',
                tokenType: 'auto'
            });
        });

        it('normalizes ssh-key auth with key and passphrase', () => {
            const sshKey = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----';
            expect(handler._normalizeAuthData('ssh-key', {
                sshKey,
                sshPassphrase: 'P@ssphrase!2026'
            })).toEqual({
                sshKey,
                sshPassphrase: 'P@ssphrase!2026'
            });
        });

        it('normalizes ssh-key auth without passphrase to undefined', () => {
            const result = handler._normalizeAuthData('ssh-key', {
                sshKey: '-----BEGIN OPENSSH PRIVATE KEY-----\ndata\n-----END OPENSSH PRIVATE KEY-----'
            });
            expect(result.sshKey).toBe('-----BEGIN OPENSSH PRIVATE KEY-----\ndata\n-----END OPENSSH PRIVATE KEY-----');
            expect(result.sshPassphrase).toBeUndefined();
        });

        it('normalizes basic auth with special characters in credentials', () => {
            expect(handler._normalizeAuthData('basic', {
                username: 'deploy-bot@openheaders.io',
                password: 'P@$$w0rd!#%&*'
            })).toEqual({
                username: 'deploy-bot@openheaders.io',
                password: 'P@$$w0rd!#%&*'
            });
        });

        it('normalizes basic auth with empty credentials to empty strings', () => {
            expect(handler._normalizeAuthData('basic', {})).toEqual({
                username: '',
                password: ''
            });
        });

        it('passes through unknown auth types unchanged', () => {
            const data = { custom: 'field', nested: { key: 'val' } } as unknown as AuthData;
            expect(handler._normalizeAuthData('custom-type', data)).toBe(data);
        });
    });

    describe('_generateUniqueWorkspaceName()', () => {
        it('returns base name when no conflicts exist', async () => {
            const mockService = { getSettings: async () => ({ workspaces: [] }) };
            expect(await handler._generateUniqueWorkspaceName(
                'OpenHeaders — Production Config', mockService
            )).toBe('OpenHeaders — Production Config');
        });

        it('appends (2) when base name already exists', async () => {
            const mockService = {
                getSettings: async () => ({
                    workspaces: [{ name: 'OpenHeaders — Production Config' }]
                })
            };
            expect(await handler._generateUniqueWorkspaceName(
                'OpenHeaders — Production Config', mockService
            )).toBe('OpenHeaders — Production Config (2)');
        });

        it('increments counter past all existing conflicts', async () => {
            const mockService = {
                getSettings: async () => ({
                    workspaces: [
                        { name: 'Platform Team' },
                        { name: 'Platform Team (2)' },
                        { name: 'Platform Team (3)' }
                    ]
                })
            };
            expect(await handler._generateUniqueWorkspaceName(
                'Platform Team', mockService
            )).toBe('Platform Team (4)');
        });

        it('returns base name when workspaces array is undefined', async () => {
            const mockService = { getSettings: async () => ({}) };
            expect(await handler._generateUniqueWorkspaceName(
                'New Workspace', mockService
            )).toBe('New Workspace');
        });

        it('handles workspace names with unicode characters', async () => {
            const mockService = {
                getSettings: async () => ({
                    workspaces: [{ name: 'ÖpenHeaders — Ünified Cönfig' }]
                })
            };
            expect(await handler._generateUniqueWorkspaceName(
                'ÖpenHeaders — Ünified Cönfig', mockService
            )).toBe('ÖpenHeaders — Ünified Cönfig (2)');
        });
    });

    describe('_notifyRenderer()', () => {
        it('does nothing when no main window is set', () => {
            handler.mainWindow = null;
            expect(() => handler._notifyRenderer('cli-workspace-joined', { timestamp: Date.now() })).not.toThrow();
        });

        it('does nothing when window is destroyed', () => {
            handler.mainWindow = makeMockWindow({ isDestroyed: () => true });
            expect(() => handler._notifyRenderer('cli-workspace-joined', { timestamp: Date.now() })).not.toThrow();
            handler.mainWindow = null;
        });

        it('sends channel and data to window when available', () => {
            let sent: { channel: string; data: NotifyData } | null = null;
            handler.mainWindow = makeMockWindow({
                send: (channel: unknown, data: unknown) => { sent = { channel: channel as string, data: data as NotifyData }; }
            });
            const data: NotifyData = {
                workspaceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                timestamp: 1737367512345
            };
            handler._notifyRenderer('cli-workspace-joined', data);
            expect(sent).toEqual({
                channel: 'cli-workspace-joined',
                data: {
                    workspaceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                    timestamp: 1737367512345
                }
            });
            handler.mainWindow = null;
        });

        it('sends environment structure change events', () => {
            let sentChannel: string | null = null;
            handler.mainWindow = makeMockWindow({
                send: (channel: unknown) => { sentChannel = channel as string; }
            });
            handler._notifyRenderer('environments-structure-changed', { timestamp: Date.now() });
            expect(sentChannel).toBe('environments-structure-changed');
            handler.mainWindow = null;
        });
    });

    describe('setMainWindow()', () => {
        it('stores window reference', () => {
            const win = makeMockWindow();
            handler.setMainWindow(win);
            expect(handler.mainWindow).toBe(win);
            handler.mainWindow = null;
        });
    });

    describe('joinWorkspace()', () => {
        const validJoinData = {
            repoUrl: 'https://git.openheaders.io/team/config.git',
            branch: 'main',
            configPath: 'config/open-headers.json',
            authType: 'none' as const,
            workspaceName: 'OpenHeaders Team',
            inviterName: 'alice@openheaders.io',
        };

        const mockSyncData = {
            sources: [{ sourceId: 'src-1', url: 'https://api.openheaders.io/headers', sourceType: 'http' }],
            rules: { header: [{ id: 'r-1' }], request: [], response: [] },
            proxyRules: [{ id: 'pr-1' }],
        };

        function setupMocks(overrides: {
            connectionSuccess?: boolean;
            syncSuccess?: boolean;
            syncData?: typeof mockSyncData | null;
        } = {}) {
            const {
                connectionSuccess = true,
                syncSuccess = true,
                syncData = mockSyncData,
            } = overrides;

            mockTestConnection.mockResolvedValue({ success: connectionSuccess, error: connectionSuccess ? undefined : 'Connection refused' });
            mockSyncWorkspace.mockResolvedValue({ success: syncSuccess, data: syncData, error: syncSuccess ? undefined : 'Sync failed' });
            mockOnCliWorkspaceCreated.mockResolvedValue(undefined);

            mockGetGitSyncService.mockReturnValue({
                testConnection: mockTestConnection,
                syncWorkspace: mockSyncWorkspace,
            });
            mockGetWorkspaceSettingsService.mockReturnValue({
                getSettings: vi.fn().mockResolvedValue({ workspaces: [] }),
            });
        }

        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('delegates state management to WorkspaceStateService.onCliWorkspaceCreated', async () => {
            setupMocks();

            const result = await handler.joinWorkspace(validJoinData);

            expect(result.success).toBe(true);
            expect(result.workspaceId).toMatch(/^team-[a-f0-9]{16}$/);
            expect(mockOnCliWorkspaceCreated).toHaveBeenCalledOnce();
        });

        it('passes workspace config and sync data to onCliWorkspaceCreated', async () => {
            setupMocks();

            const result = await handler.joinWorkspace(validJoinData);

            expect(result.success).toBe(true);
            const call = mockOnCliWorkspaceCreated.mock.calls[0][0];
            expect(call.workspaceId).toMatch(/^team-/);
            expect(call.workspaceConfig.name).toBe('OpenHeaders Team');
            expect(call.workspaceConfig.type).toBe('git');
            expect(call.workspaceConfig.gitUrl).toBe('https://git.openheaders.io/team/config.git');
            expect(call.workspaceConfig.inviteMetadata.invitedBy).toBe('alice@openheaders.io');
            expect(call.syncData).toBe(mockSyncData);
        });

        it('passes null syncData when sync fails', async () => {
            setupMocks({ syncSuccess: false, syncData: null });

            const result = await handler.joinWorkspace(validJoinData);

            expect(result.success).toBe(true);
            const call = mockOnCliWorkspaceCreated.mock.calls[0][0];
            expect(call.syncData).toBeNull();
        });

        it('passes null syncData when sync returns no data', async () => {
            setupMocks({ syncData: null });

            const result = await handler.joinWorkspace(validJoinData);

            expect(result.success).toBe(true);
            const call = mockOnCliWorkspaceCreated.mock.calls[0][0];
            expect(call.syncData).toBeNull();
        });

        it('returns error when connection test fails', async () => {
            setupMocks({ connectionSuccess: false });

            const result = await handler.joinWorkspace(validJoinData);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Connection test failed');
            expect(mockSyncWorkspace).not.toHaveBeenCalled();
            expect(mockOnCliWorkspaceCreated).not.toHaveBeenCalled();
        });

        it('returns error when services are not ready', async () => {
            mockGetGitSyncService.mockReturnValue(null);
            mockGetWorkspaceSettingsService.mockReturnValue(null);

            const result = await handler.joinWorkspace(validJoinData);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Services not ready');
        });

        it('returns error when repoUrl is missing', async () => {
            setupMocks();

            const result = await handler.joinWorkspace({ ...validJoinData, repoUrl: '' });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Missing repoUrl');
        });
    });

    describe('importEnvironment()', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('delegates to WorkspaceStateService.importEnvironments', async () => {
            mockImportEnvironments.mockResolvedValue(undefined);

            const envData = {
                Default: { API_KEY: { value: 'test-key', isSecret: true } }
            };
            const result = await handler.importEnvironment({ environments: envData });

            expect(result.success).toBe(true);
            expect(mockImportEnvironments).toHaveBeenCalledOnce();
            expect(mockImportEnvironments).toHaveBeenCalledWith(envData);
        });

        it('returns error when importEnvironments throws', async () => {
            mockImportEnvironments.mockRejectedValue(new Error('State service not initialized'));

            const result = await handler.importEnvironment({
                environments: { Default: {} }
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('State service not initialized');
        });

        it('returns error when environments data is missing', async () => {
            const result = await handler.importEnvironment({} as Parameters<typeof handler.importEnvironment>[0]);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Missing environments data');
        });
    });
});
