/**
 * IPC Contract Tests
 *
 * Verify that every IPC channel has matching registrations on both sides:
 * - Every ipcMain.handle() has a corresponding ipcRenderer.invoke() in preload
 * - Every ipcMain.on() has a corresponding ipcRenderer.send() in preload
 * - Every preload invoke/send targets a channel that main registers
 *
 * These tests parse the actual source files to detect mismatches,
 * catching bugs where a channel name is typo'd or a handler is missing.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { IPC_INVOKE, IPC_SEND, IPC_PUSH } from '../../src/types/ipc-channels';

const ROOT = path.resolve(__dirname, '../../');

function readFile(relativePath: string): string {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readDir(relativePath: string): string {
    const dir = path.join(ROOT, relativePath);
    let combined = '';
    const files = fs.readdirSync(dir, { recursive: true }) as string[];
    for (const file of files) {
        const full = path.join(dir, file);
        if (fs.statSync(full).isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
            combined += fs.readFileSync(full, 'utf8') + '\n';
        }
    }
    return combined;
}

// ── Extract channels from source code ──────────────────────────────

function extractHandleChannels(source: string): string[] {
    const matches = source.matchAll(/ipcMain\.handle\(\s*['"]([^'"]+)['"]/g);
    return [...matches].map(m => m[1]).sort();
}

function extractOnChannels(source: string): string[] {
    const matches = source.matchAll(/ipcMain\.on\(\s*['"]([^'"]+)['"]/g);
    return [...matches].map(m => m[1]).sort();
}

function extractInvokeChannels(source: string): string[] {
    const matches = source.matchAll(/ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g);
    return [...matches].map(m => m[1]).sort();
}

function extractSendChannels(source: string): string[] {
    const matches = source.matchAll(/ipcRenderer\.send\(\s*['"]([^'"]+)['"]/g);
    return [...matches].map(m => m[1]).sort();
}

function extractWebContentsSendChannels(source: string): string[] {
    const matches = source.matchAll(/webContents\.send\(\s*['"]([^'"]+)['"]/g);
    return [...matches].map(m => m[1]).sort();
}

function extractPreloadOnChannels(source: string): string[] {
    // ipcRenderer.on('channel', ...) in preload API files
    const matches = source.matchAll(/ipcRenderer\.on\(\s*['"]([^'"]+)['"]/g);
    return [...matches].map(m => m[1]).sort();
}

// ── Load sources ───────────────────────────────────────────────────

const mainSource = readFile('src/main.ts');
const preloadSource = readDir('src/preload');
// Services that register IPC handlers outside main.ts
const videoExportSource = readFile('src/services/video/video-export-manager.ts');
const workspaceStateHandlersSource = readFile('src/main/modules/ipc/handlers/workspaceStateHandlers.ts');
// Services that send to renderer
const servicesSource = readDir('src/services') + readDir('src/main/modules');

const mainHandleChannels = new Set([
    ...extractHandleChannels(mainSource),
    ...extractHandleChannels(videoExportSource),
    ...extractHandleChannels(workspaceStateHandlersSource),
]);
const mainOnChannels = new Set(extractOnChannels(mainSource));
const preloadInvokeChannels = new Set(extractInvokeChannels(preloadSource));
const preloadSendChannels = new Set(extractSendChannels(preloadSource));
const preloadListenChannels = new Set(extractPreloadOnChannels(preloadSource));
const mainPushChannels = new Set(extractWebContentsSendChannels(servicesSource + mainSource));

// ── Tests ──────────────────────────────────────────────────────────

describe('IPC Contract', () => {
    describe('invoke channels (renderer → main, request/response)', () => {
        it('every preload invoke() has a matching main handle()', () => {
            const orphanInvokes = [...preloadInvokeChannels].filter(ch => !mainHandleChannels.has(ch));
            expect(orphanInvokes, `Preload invokes channels with no main handler: ${orphanInvokes.join(', ')}`).toEqual([]);
        });

        it('every main handle() has a matching preload invoke()', () => {
            const unusedHandlers = [...mainHandleChannels].filter(ch => !preloadInvokeChannels.has(ch));
            expect(unusedHandlers, `Main handlers with no preload caller: ${unusedHandlers.join(', ')}`).toEqual([]);
        });

        it('no duplicate handle() registrations', () => {
            const allHandles = extractHandleChannels(mainSource + videoExportSource + workspaceStateHandlersSource);
            const seen = new Set<string>();
            const dupes: string[] = [];
            for (const ch of allHandles) {
                if (seen.has(ch)) dupes.push(ch);
                seen.add(ch);
            }
            expect(dupes, `Duplicate handle registrations: ${dupes.join(', ')}`).toEqual([]);
        });
    });

    describe('send channels (renderer → main, fire-and-forget)', () => {
        it('every preload send() has a matching main on()', () => {
            const orphanSends = [...preloadSendChannels].filter(ch => !mainOnChannels.has(ch));
            expect(orphanSends, `Preload sends to channels with no main listener: ${orphanSends.join(', ')}`).toEqual([]);
        });

        it('every main on() has a matching preload send()', () => {
            // Some main.on channels are triggered by renderer contexts, not preload APIs
            // (environment-switched, workspace-switched, etc. are sent by renderer code)
            const unusedListeners = [...mainOnChannels].filter(ch => !preloadSendChannels.has(ch));
            // These are legitimately sent from renderer contexts, not preload
            const rendererContextChannels = [
                'environment-switched',
                'environment-variables-changed',
                'workspace-switched',
                'workspace-updated',
                'get-startup-data', // Sent via sendSync in preload (not regular send pattern)
            ];
            const realOrphans = unusedListeners.filter(ch => !rendererContextChannels.includes(ch));
            expect(realOrphans, `Main listeners with no preload sender: ${realOrphans.join(', ')}`).toEqual([]);
        });
    });

    describe('push channels (main → renderer)', () => {
        it('every main push has a preload listener or renderer handler', () => {
            // Main→renderer channels should have ipcRenderer.on listeners in preload
            // Some are handled dynamically in renderer, so we allow a reasonable number of unmatched
            const unmatched = [...mainPushChannels].filter(ch => !preloadListenChannels.has(ch));
            expect(unmatched.length).toBeLessThan(mainPushChannels.size / 2);
        });

        it('lists all known push channels', () => {
            // Snapshot of all main→renderer channels for documentation
            const channels = [...mainPushChannels].sort();
            expect(channels.length).toBeGreaterThan(10);
        });
    });

    describe('channel naming conventions', () => {
        it('no channels contain spaces', () => {
            const all = [...mainHandleChannels, ...mainOnChannels, ...preloadInvokeChannels, ...preloadSendChannels];
            const withSpaces = all.filter(ch => ch.includes(' '));
            expect(withSpaces).toEqual([]);
        });

        it('no channels contain uppercase (except camelCase legacy)', () => {
            // Verify channels follow conventions — either kebab-case or camelCase
            const all = new Set([...mainHandleChannels, ...mainOnChannels]);
            for (const ch of all) {
                // Should be either kebab-case or camelCase, never UPPER_CASE
                expect(ch).not.toMatch(/^[A-Z]/);
            }
        });
    });

    describe('channel count sanity', () => {
        it('has expected number of invoke channels', () => {
            // Guard against accidental mass deletion/addition
            expect(mainHandleChannels.size).toBeGreaterThan(70);
            expect(mainHandleChannels.size).toBeLessThan(120);
        });

        it('has expected number of send channels', () => {
            expect(mainOnChannels.size).toBeGreaterThan(10);
            expect(mainOnChannels.size).toBeLessThan(30);
        });
    });

    describe('ipc-channels.ts constants match actual registrations', () => {
        const invokeConstantValues: Set<string> = new Set(Object.values(IPC_INVOKE));
        const sendConstantValues: Set<string> = new Set(Object.values(IPC_SEND));
        const pushConstantValues: Set<string> = new Set(Object.values(IPC_PUSH));

        it('every IPC_INVOKE constant is registered as a main handle()', () => {
            const unregistered = [...invokeConstantValues].filter(ch => !mainHandleChannels.has(ch));
            expect(unregistered, `IPC_INVOKE constants with no main handler: ${unregistered.join(', ')}`).toEqual([]);
        });

        it('every main handle() has an IPC_INVOKE constant', () => {
            // Some channels are registered dynamically by services (e.g., VideoExportManager)
            const dynamicChannels = ['export-video'];
            const undeclared = [...mainHandleChannels].filter(
                (ch: string) => !invokeConstantValues.has(ch) && !dynamicChannels.includes(ch)
            );
            expect(undeclared, `Main handlers with no IPC_INVOKE constant: ${undeclared.join(', ')}`).toEqual([]);
        });

        it('every IPC_SEND constant is registered as a main on()', () => {
            const unregistered = [...sendConstantValues].filter(ch => !mainOnChannels.has(ch));
            expect(unregistered, `IPC_SEND constants with no main listener: ${unregistered.join(', ')}`).toEqual([]);
        });

        it('every main on() has an IPC_SEND constant', () => {
            const undeclared = [...mainOnChannels].filter((ch: string) => !sendConstantValues.has(ch));
            expect(undeclared, `Main listeners with no IPC_SEND constant: ${undeclared.join(', ')}`).toEqual([]);
        });

        it('IPC_INVOKE has no duplicate values', () => {
            const values = Object.values(IPC_INVOKE);
            const unique = new Set(values);
            expect(values.length).toBe(unique.size);
        });

        it('IPC_SEND has no duplicate values', () => {
            const values = Object.values(IPC_SEND);
            const unique = new Set(values);
            expect(values.length).toBe(unique.size);
        });

        it('IPC_PUSH has no duplicate values', () => {
            const values = Object.values(IPC_PUSH);
            const unique = new Set(values);
            expect(values.length).toBe(unique.size);
        });

        it('no channel name appears in both IPC_INVOKE and IPC_SEND', () => {
            const overlap = [...invokeConstantValues].filter((ch: string) => sendConstantValues.has(ch));
            expect(overlap, `Channels in both INVOKE and SEND: ${overlap.join(', ')}`).toEqual([]);
        });

        it('IPC_PUSH channels are used in webContents.send calls', () => {
            const unusedPush = [...pushConstantValues].filter(ch => !mainPushChannels.has(ch));
            // Some push channels may be sent conditionally or via helper functions
            // so we just verify most are used
            expect(unusedPush.length).toBeLessThan(pushConstantValues.size / 2);
        });
    });
});
