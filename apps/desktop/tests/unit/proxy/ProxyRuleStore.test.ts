import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyRuleStore } from '@/services/proxy/ProxyRuleStore';
import type { ProxyRule } from '@/types/proxy';

// Mock atomicWriter to avoid filesystem I/O
vi.mock('../../../src/utils/atomicFileWriter', () => ({
  default: {
    readJson: vi.fn(() => Promise.resolve(null)),
    writeJson: vi.fn(() => Promise.resolve()),
  },
}));

/** Create a realistic ProxyRule with enterprise-style defaults */
function makeProxyRule(overrides: Partial<ProxyRule> = {}): ProxyRule {
  return {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'Add OAuth2 Bearer Token (prod)',
    enabled: true,
    headerName: 'Authorization',
    headerValue: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQGFjbWUuY29tIn0.sig',
    domains: ['*.openheaders.io', 'api.partners.openheaders.io'],
    isDynamic: false,
    sourceId: undefined,
    prefix: '',
    suffix: '',
    hasEnvVars: false,
    ...overrides,
  };
}

describe('ProxyRuleStore', () => {
  let store: ProxyRuleStore;

  beforeEach(() => {
    store = new ProxyRuleStore();
    vi.clearAllMocks();
  });

  // ── workspace management ────────────────────────────────────────

  describe('setWorkspace()', () => {
    it('sets the current workspace ID', () => {
      store.setWorkspace('f47ac10b-58cc-4372-a567-0e02b2c3d479');
      expect(store.currentWorkspaceId).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    });

    it('overwrites previous workspace ID', () => {
      store.setWorkspace('workspace-alpha');
      store.setWorkspace('workspace-beta');
      expect(store.currentWorkspaceId).toBe('workspace-beta');
    });
  });

  describe('getRulesPath()', () => {
    it('returns global path when no workspace is set', () => {
      const rulesPath = store.getRulesPath();
      expect(rulesPath).toContain('proxy-rules.json');
      expect(rulesPath).not.toContain('workspaces');
    });

    it('returns workspace-specific path when workspace is set', () => {
      store.setWorkspace('f47ac10b-58cc-4372-a567-0e02b2c3d479');
      const rulesPath = store.getRulesPath();
      expect(rulesPath).toContain('workspaces');
      expect(rulesPath).toContain('f47ac10b-58cc-4372-a567-0e02b2c3d479');
      expect(rulesPath).toContain('proxy-rules.json');
    });
  });

  // ── load ────────────────────────────────────────────────────────

  describe('load()', () => {
    it('loads rules from disk and preserves full shape', async () => {
      const { default: atomicWriter } = await import('../../../src/utils/atomicFileWriter');
      const mockRules: ProxyRule[] = [
        makeProxyRule({
          id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          name: 'Inject X-Request-ID',
          headerName: 'X-Request-ID',
          headerValue: '{{REQUEST_ID}}',
          hasEnvVars: true,
          domains: ['*.openheaders.io'],
        }),
        makeProxyRule({
          id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
          name: 'Staging API Key',
          enabled: false,
          headerName: 'X-Api-Key',
          headerValue: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
          domains: ['api.staging.openheaders.io'],
        }),
      ];
      vi.mocked(atomicWriter.readJson).mockResolvedValueOnce(mockRules);

      await store.load();

      expect(store.rules).toHaveLength(2);
      expect(store.rules[0]).toEqual(mockRules[0]);
      expect(store.rules[1]).toEqual(mockRules[1]);
    });

    it('starts with empty rules when file does not exist', async () => {
      const { default: atomicWriter } = await import('../../../src/utils/atomicFileWriter');
      vi.mocked(atomicWriter.readJson).mockResolvedValueOnce(null);

      await store.load();
      expect(store.rules).toEqual([]);
    });

    it('resets to empty rules on read error (corrupted JSON)', async () => {
      const { default: atomicWriter } = await import('../../../src/utils/atomicFileWriter');
      vi.mocked(atomicWriter.readJson).mockRejectedValueOnce(
        new SyntaxError('Unexpected token } in JSON at position 42'),
      );

      store.rules = [makeProxyRule()];
      await store.load();
      expect(store.rules).toEqual([]);
    });

    it('resets to empty rules on disk I/O error', async () => {
      const { default: atomicWriter } = await import('../../../src/utils/atomicFileWriter');
      const diskError = new Error('EACCES: permission denied');
      (diskError as NodeJS.ErrnoException).code = 'EACCES';
      vi.mocked(atomicWriter.readJson).mockRejectedValueOnce(diskError);

      store.rules = [makeProxyRule()];
      await store.load();
      expect(store.rules).toEqual([]);
    });

    it('loads from workspace-specific path when workspace is set', async () => {
      const { default: atomicWriter } = await import('../../../src/utils/atomicFileWriter');
      vi.mocked(atomicWriter.readJson).mockResolvedValueOnce([makeProxyRule()]);

      store.setWorkspace('ws-prod');
      await store.load();

      const callPath = vi.mocked(atomicWriter.readJson).mock.calls[0][0] as string;
      expect(callPath).toContain('workspaces');
      expect(callPath).toContain('ws-prod');
    });
  });

  // ── saveRule ────────────────────────────────────────────────────

  describe('saveRule()', () => {
    it('adds a new rule with full enterprise data', async () => {
      const rule = makeProxyRule({
        id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
        name: 'Production OAuth2 Bearer Token',
        headerName: 'Authorization',
        headerValue: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzZXJ2aWNlLWFjY291bnRAYWNtZS5jb20ifQ.sig',
        domains: ['*.openheaders.io', 'api.partners.openheaders.io:8443'],
      });
      await store.saveRule(rule);

      expect(store.rules).toHaveLength(1);
      expect(store.rules[0]).toEqual(rule);
    });

    it('updates an existing rule by ID preserving array position', async () => {
      store.rules = [
        makeProxyRule({ id: 'rule-1', name: 'First Rule' }),
        makeProxyRule({ id: 'rule-2', name: 'Second Rule' }),
        makeProxyRule({ id: 'rule-3', name: 'Third Rule' }),
      ];

      await store.saveRule(
        makeProxyRule({
          id: 'rule-2',
          name: 'Updated Second Rule',
          headerValue: 'new-value',
        }),
      );

      expect(store.rules).toHaveLength(3);
      expect(store.rules[1].name).toBe('Updated Second Rule');
      expect(store.rules[1].headerValue).toBe('new-value');
      expect(store.rules[0].id).toBe('rule-1');
      expect(store.rules[2].id).toBe('rule-3');
    });

    it('auto-generates ID when missing', async () => {
      await store.saveRule({ id: '', headerName: 'X-Auto' } as ProxyRule);

      expect(store.rules).toHaveLength(1);
      expect(store.rules[0].id).toBeTruthy();
      expect(store.rules[0].id).not.toBe('');
    });

    it('persists to disk via save()', async () => {
      const { default: atomicWriter } = await import('../../../src/utils/atomicFileWriter');

      await store.saveRule(makeProxyRule());

      expect(atomicWriter.writeJson).toHaveBeenCalledTimes(1);
      const writtenData = vi.mocked(atomicWriter.writeJson).mock.calls[0][1] as ProxyRule[];
      expect(writtenData).toHaveLength(1);
    });

    it('handles rule with special characters in header value', async () => {
      const rule = makeProxyRule({
        id: 'special-chars',
        headerValue: 'Basic dXNlcjpwQHNzd29yZCE9Jyonfg==',
      });
      await store.saveRule(rule);

      expect(store.rules[0].headerValue).toBe('Basic dXNlcjpwQHNzd29yZCE9Jyonfg==');
    });

    it('handles rule with regex pattern in domains', async () => {
      const rule = makeProxyRule({
        id: 'regex-domain',
        domains: ['*://api.openheaders.io/v[0-9]/*'],
      });
      await store.saveRule(rule);

      expect(store.rules[0].domains).toEqual(['*://api.openheaders.io/v[0-9]/*']);
    });
  });

  // ── deleteRule ──────────────────────────────────────────────────

  describe('deleteRule()', () => {
    it('removes a rule by ID and persists', async () => {
      const { default: atomicWriter } = await import('../../../src/utils/atomicFileWriter');
      store.rules = [
        makeProxyRule({ id: 'keep-1', name: 'Keep This' }),
        makeProxyRule({ id: 'delete-me', name: 'Delete This' }),
        makeProxyRule({ id: 'keep-2', name: 'Also Keep' }),
      ];

      await store.deleteRule('delete-me');

      expect(store.rules).toHaveLength(2);
      expect(store.rules.map((r) => r.id)).toEqual(['keep-1', 'keep-2']);
      expect(atomicWriter.writeJson).toHaveBeenCalled();
    });

    it('does nothing when ID not found', async () => {
      store.rules = [makeProxyRule({ id: 'existing' })];

      await store.deleteRule('nonexistent-uuid');

      expect(store.rules).toHaveLength(1);
      expect(store.rules[0].id).toBe('existing');
    });

    it('handles deleting from empty rules array', async () => {
      store.rules = [];
      await store.deleteRule('anything');
      expect(store.rules).toEqual([]);
    });

    it('handles deleting the last remaining rule', async () => {
      store.rules = [makeProxyRule({ id: 'only-one' })];
      await store.deleteRule('only-one');
      expect(store.rules).toEqual([]);
    });
  });

  // ── getRules ────────────────────────────────────────────────────

  describe('getRules()', () => {
    it('returns the rules array reference', () => {
      const rules = [makeProxyRule({ id: 'a' }), makeProxyRule({ id: 'b' })];
      store.rules = rules;
      expect(store.getRules()).toBe(rules);
    });

    it('returns empty array by default', () => {
      expect(store.getRules()).toEqual([]);
    });

    it('returns rules with all fields intact', () => {
      const rule = makeProxyRule({
        id: 'full-rule',
        name: 'Full Enterprise Rule',
        enabled: true,
        headerName: 'Authorization',
        headerValue: 'Bearer token',
        domains: ['*.openheaders.io'],
        isDynamic: true,
        sourceId: 'src-42',
        prefix: 'Bearer ',
        suffix: '',
        hasEnvVars: true,
      });
      store.rules = [rule];

      const result = store.getRules();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(rule);
    });
  });

  // ── save (internal) ────────────────────────────────────────────

  describe('save() persistence', () => {
    it('creates directory structure for workspace path', async () => {
      const { default: atomicWriter } = await import('../../../src/utils/atomicFileWriter');
      store.setWorkspace('ws-staging');
      store.rules = [makeProxyRule()];

      await store.saveRule(makeProxyRule({ id: 'new' }));

      const writePath = vi.mocked(atomicWriter.writeJson).mock.calls[0][0] as string;
      expect(writePath).toContain('workspaces');
      expect(writePath).toContain('ws-staging');
    });

    it('writes with pretty option', async () => {
      const { default: atomicWriter } = await import('../../../src/utils/atomicFileWriter');

      await store.saveRule(makeProxyRule());

      const writeOptions = vi.mocked(atomicWriter.writeJson).mock.calls[0][2] as { pretty: boolean };
      expect(writeOptions).toEqual({ pretty: true });
    });
  });
});
