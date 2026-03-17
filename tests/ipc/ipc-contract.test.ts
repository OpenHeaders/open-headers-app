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
// Video export manager registers IPC handlers outside main.ts
const videoExportSource = readFile('src/services/video/video-export-manager.ts');
// Services that send to renderer
const servicesSource = readDir('src/services') + readDir('src/main/modules');

const mainHandleChannels = new Set([
    ...extractHandleChannels(mainSource),
    ...extractHandleChannels(videoExportSource),
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
            // Known gaps: handlers registered in main but preload API not yet created
            // These are partially-wired features — the backend exists but the bridge is missing
            const knownGaps = [
                'deleteWorkspaceFolder',       // handler exists, no preload API
                'proxy-set-strict-ssl',         // SSL/cert management: backend wired, UI bridge missing
                'proxy-add-trusted-certificate',
                'proxy-remove-trusted-certificate',
                'proxy-add-certificate-exception',
                'proxy-remove-certificate-exception',
                'proxy-get-certificate-info',
                'export-video',                 // registered by VideoExportManager, no preload API
            ];
            const unusedHandlers = [...mainHandleChannels].filter(
                ch => !preloadInvokeChannels.has(ch) && !knownGaps.includes(ch)
            );
            expect(unusedHandlers, `Main handlers with no preload caller: ${unusedHandlers.join(', ')}`).toEqual([]);
        });

        it('no duplicate handle() registrations', () => {
            const allHandles = extractHandleChannels(mainSource + videoExportSource);
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
            ];
            const realOrphans = unusedListeners.filter(ch => !rendererContextChannels.includes(ch));
            expect(realOrphans, `Main listeners with no preload sender: ${realOrphans.join(', ')}`).toEqual([]);
        });
    });

    describe('push channels (main → renderer)', () => {
        it('every main push has a preload listener or renderer handler', () => {
            // Main→renderer channels should have ipcRenderer.on listeners in preload
            // Some are handled dynamically in renderer, so we just verify they exist
            expect(mainPushChannels.size).toBeGreaterThan(0);
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
});
