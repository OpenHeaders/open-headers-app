import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProxyRuleStore } from '../../../src/services/proxy/ProxyRuleStore';
import type { ProxyRule } from '../../../src/services/proxy/ProxyRuleStore';

// Mock atomicWriter to avoid filesystem I/O
vi.mock('../../../src/utils/atomicFileWriter', () => ({
    default: {
        readJson: vi.fn(() => Promise.resolve(null)),
        writeJson: vi.fn(() => Promise.resolve()),
    },
}));

describe('ProxyRuleStore', () => {
    let store: ProxyRuleStore;

    beforeEach(() => {
        store = new ProxyRuleStore();
        vi.clearAllMocks();
    });

    // ── workspace management ────────────────────────────────────────

    describe('setWorkspace()', () => {
        it('sets the current workspace ID', () => {
            store.setWorkspace('ws-123');
            expect(store.currentWorkspaceId).toBe('ws-123');
        });
    });

    describe('getRulesPath()', () => {
        it('returns global path when no workspace is set', () => {
            const rulesPath = store.getRulesPath();
            expect(rulesPath).toContain('proxy-rules.json');
            expect(rulesPath).not.toContain('workspaces');
        });

        it('returns workspace-specific path when workspace is set', () => {
            store.setWorkspace('ws-abc');
            const rulesPath = store.getRulesPath();
            expect(rulesPath).toContain('workspaces');
            expect(rulesPath).toContain('ws-abc');
            expect(rulesPath).toContain('proxy-rules.json');
        });
    });

    // ── load ────────────────────────────────────────────────────────

    describe('load()', () => {
        it('loads rules from disk', async () => {
            const { default: atomicWriter } = await import('../../../src/utils/atomicFileWriter');
            const mockRules: ProxyRule[] = [
                { id: '1', enabled: true, headerName: 'Authorization', headerValue: 'Bearer token' },
                { id: '2', enabled: false, headerName: 'X-Custom', headerValue: 'val' },
            ];
            vi.mocked(atomicWriter.readJson).mockResolvedValueOnce(mockRules);

            await store.load();
            expect(store.rules).toEqual(mockRules);
            expect(store.rules).toHaveLength(2);
        });

        it('starts with empty rules when file does not exist', async () => {
            const { default: atomicWriter } = await import('../../../src/utils/atomicFileWriter');
            vi.mocked(atomicWriter.readJson).mockResolvedValueOnce(null);

            await store.load();
            expect(store.rules).toEqual([]);
        });

        it('resets to empty rules on read error', async () => {
            const { default: atomicWriter } = await import('../../../src/utils/atomicFileWriter');
            vi.mocked(atomicWriter.readJson).mockRejectedValueOnce(new Error('disk error'));

            store.rules = [{ id: 'existing' }];
            await store.load();
            expect(store.rules).toEqual([]);
        });
    });

    // ── saveRule ────────────────────────────────────────────────────

    describe('saveRule()', () => {
        it('adds a new rule', async () => {
            const rule: ProxyRule = { id: 'r-1', enabled: true, headerName: 'X-Test', headerValue: 'val' };
            await store.saveRule(rule);

            expect(store.rules).toHaveLength(1);
            expect(store.rules[0].id).toBe('r-1');
        });

        it('updates an existing rule by ID', async () => {
            store.rules = [{ id: 'r-1', enabled: true, headerName: 'Old', headerValue: 'old' }];

            await store.saveRule({ id: 'r-1', enabled: false, headerName: 'Updated', headerValue: 'new' });

            expect(store.rules).toHaveLength(1);
            expect(store.rules[0].headerName).toBe('Updated');
            expect(store.rules[0].enabled).toBe(false);
        });

        it('auto-generates ID when missing', async () => {
            await store.saveRule({ id: '', headerName: 'X-Auto' } as ProxyRule);

            expect(store.rules).toHaveLength(1);
            expect(store.rules[0].id).toBeTruthy();
            expect(store.rules[0].id).not.toBe('');
        });

        it('persists to disk via save()', async () => {
            const { default: atomicWriter } = await import('../../../src/utils/atomicFileWriter');

            await store.saveRule({ id: 'r-1', headerName: 'X-Test' });

            expect(atomicWriter.writeJson).toHaveBeenCalled();
        });
    });

    // ── deleteRule ──────────────────────────────────────────────────

    describe('deleteRule()', () => {
        it('removes a rule by ID', async () => {
            store.rules = [
                { id: 'r-1', headerName: 'Keep' },
                { id: 'r-2', headerName: 'Delete' },
            ];

            await store.deleteRule('r-2');

            expect(store.rules).toHaveLength(1);
            expect(store.rules[0].id).toBe('r-1');
        });

        it('does nothing when ID not found', async () => {
            store.rules = [{ id: 'r-1', headerName: 'Keep' }];

            await store.deleteRule('nonexistent');

            expect(store.rules).toHaveLength(1);
        });

        it('persists to disk via save()', async () => {
            const { default: atomicWriter } = await import('../../../src/utils/atomicFileWriter');
            store.rules = [{ id: 'r-1' }];

            await store.deleteRule('r-1');

            expect(atomicWriter.writeJson).toHaveBeenCalled();
        });
    });

    // ── getRules ────────────────────────────────────────────────────

    describe('getRules()', () => {
        it('returns the rules array', () => {
            store.rules = [{ id: 'a' }, { id: 'b' }];
            expect(store.getRules()).toEqual([{ id: 'a' }, { id: 'b' }]);
        });

        it('returns empty array by default', () => {
            expect(store.getRules()).toEqual([]);
        });
    });
});
