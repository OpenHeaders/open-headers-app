import { describe, it, expect } from 'vitest';
import type { BrowserWindow } from 'electron';
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
});
