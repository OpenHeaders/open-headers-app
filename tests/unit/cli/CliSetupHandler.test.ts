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
            expect(handler._normalizeAuthData('none', { token: 'x' })).toEqual({});
        });

        it('returns empty object for falsy authType', () => {
            expect(handler._normalizeAuthData('', undefined)).toEqual({});
        });

        it('returns empty object for missing authData', () => {
            expect(handler._normalizeAuthData('token', undefined)).toEqual({});
        });

        it('normalizes token auth', () => {
            expect(handler._normalizeAuthData('token', { token: 'ghp_abc', tokenType: 'github' }))
                .toEqual({ token: 'ghp_abc', tokenType: 'github' });
        });

        it('defaults tokenType to auto', () => {
            expect(handler._normalizeAuthData('token', { token: 'abc' }))
                .toEqual({ token: 'abc', tokenType: 'auto' });
        });

        it('normalizes ssh-key auth', () => {
            expect(handler._normalizeAuthData('ssh-key', { sshKey: 'key-data', sshPassphrase: 'pass' }))
                .toEqual({ sshKey: 'key-data', sshPassphrase: 'pass' });
        });

        it('normalizes basic auth', () => {
            expect(handler._normalizeAuthData('basic', { username: 'user', password: 'pass' }))
                .toEqual({ username: 'user', password: 'pass' });
        });

        it('passes through unknown auth types', () => {
            const data = { custom: 'field' } as unknown as AuthData;
            expect(handler._normalizeAuthData('custom-type', data)).toBe(data);
        });
    });

    describe('_generateUniqueWorkspaceName()', () => {
        it('returns base name when no conflicts', async () => {
            const mockService = { getSettings: async () => ({ workspaces: [] }) };
            expect(await handler._generateUniqueWorkspaceName('My Team', mockService)).toBe('My Team');
        });

        it('appends counter when name exists', async () => {
            const mockService = {
                getSettings: async () => ({
                    workspaces: [{ name: 'My Team' }]
                })
            };
            expect(await handler._generateUniqueWorkspaceName('My Team', mockService)).toBe('My Team (2)');
        });

        it('increments counter past existing conflicts', async () => {
            const mockService = {
                getSettings: async () => ({
                    workspaces: [{ name: 'Team' }, { name: 'Team (2)' }, { name: 'Team (3)' }]
                })
            };
            expect(await handler._generateUniqueWorkspaceName('Team', mockService)).toBe('Team (4)');
        });
    });

    describe('_notifyRenderer()', () => {
        it('does nothing when no main window', () => {
            handler.mainWindow = null;
            expect(() => handler._notifyRenderer('test', { timestamp: Date.now() })).not.toThrow();
        });

        it('does nothing when window is destroyed', () => {
            handler.mainWindow = makeMockWindow({ isDestroyed: () => true });
            expect(() => handler._notifyRenderer('test', { timestamp: Date.now() })).not.toThrow();
        });

        it('sends to window when available', () => {
            let sent: { channel: string; data: NotifyData } | null = null;
            handler.mainWindow = makeMockWindow({
                send: (channel: unknown, data: unknown) => { sent = { channel: channel as string, data: data as NotifyData }; }
            });
            const data: NotifyData = { workspaceId: 'ws-1', timestamp: Date.now() };
            handler._notifyRenderer('my-event', data);
            expect(sent).toEqual({ channel: 'my-event', data });
            handler.mainWindow = null;
        });
    });
});
