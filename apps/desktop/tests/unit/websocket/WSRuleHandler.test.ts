import type { HeaderRule, RulesCollection, Source } from '@openheaders/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WSRuleHandler } from '@/services/websocket/ws-rule-handler';

const emptyRules: RulesCollection = { header: [], request: [], response: [] };

function makeHeaderRule(overrides: Partial<HeaderRule>): HeaderRule {
  return {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    type: 'header',
    name: 'Add OAuth2 Bearer Token (prod)',
    description: 'Injects production OAuth2 bearer token from auth gateway',
    isEnabled: true,
    domains: ['*.openheaders.io', 'api.partner-service.io:8443'],
    createdAt: '2025-11-15T09:30:00.000Z',
    updatedAt: '2026-01-20T14:45:12.345Z',
    headerName: 'Authorization',
    headerValue:
      'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQGFjbWUuY29tIiwiaWF0IjoxNzE2MDAwMDAwfQ.signature',
    tag: 'auth',
    isResponse: false,
    isDynamic: false,
    sourceId: null,
    prefix: '',
    suffix: '',
    hasEnvVars: false,
    envVars: [],
    ...overrides,
  };
}

function makeSource(overrides: Partial<Source> & { sourceId: string }): Source {
  return {
    sourceType: 'http',
    sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token',
    sourceName: 'Production API Gateway Token',
    sourceContent: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig',
    ...overrides,
  };
}

function createMockService(rules: RulesCollection = emptyRules, sources: Source[] = []) {
  return {
    rules,
    sources,
    appDataPath: null,
    environmentHandler: {
      loadEnvironmentVariables: () => ({}) as Record<string, string>,
      resolveTemplate: (template: string, vars: Record<string, string>) => {
        return template.replace(/\{\{([^}]+)\}\}/g, (match: string, varName: string) => {
          const v = vars[varName.trim()];
          return v !== undefined && v !== null && v !== '' ? v : match;
        });
      },
    },
    _broadcastToAll: vi.fn().mockReturnValue(0),
  };
}

describe('WSRuleHandler', () => {
  let handler: WSRuleHandler;
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    mockService = createMockService();
    handler = new WSRuleHandler(mockService as ConstructorParameters<typeof WSRuleHandler>[0]);
  });

  describe('_populateDynamicHeaderValues', () => {
    it('returns empty rules unchanged', () => {
      const result = handler._populateDynamicHeaderValues(emptyRules);
      expect(result).toEqual({ header: [], request: [], response: [] });
    });

    it('passes through static rules without modification', () => {
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-static-1',
            headerName: 'X-OpenHeaders-API-Key',
            headerValue: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
          }),
        ],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      expect(result.header).toHaveLength(1);
      expect(result.header[0].headerName).toBe('X-OpenHeaders-API-Key');
      expect(result.header[0].headerValue).toBe('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
      expect(result.header[0].domains).toEqual(['*.openheaders.io', 'api.partner-service.io:8443']);
    });

    it('resolves dynamic header value from source with prefix and suffix', () => {
      mockService.sources = [
        makeSource({ sourceId: 'src-oauth2-prod', sourceContent: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig' }),
      ];
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-dynamic-1',
            isDynamic: true,
            sourceId: 'src-oauth2-prod',
            prefix: 'Bearer ',
            suffix: '',
            headerName: 'Authorization',
            headerValue: '', // will be populated
          }),
        ],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      expect(result.header[0].headerValue).toBe('Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig');
    });

    it('handles dynamic rule with both prefix and suffix', () => {
      mockService.sources = [makeSource({ sourceId: 'src-totp-1', sourceContent: '482937' })];
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-totp',
            isDynamic: true,
            sourceId: 'src-totp-1',
            prefix: 'TOTP-',
            suffix: '-VERIFY',
            headerName: 'X-MFA-Token',
          }),
        ],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      expect(result.header[0].headerValue).toBe('TOTP-482937-VERIFY');
    });

    it('keeps original headerValue when dynamic source not found', () => {
      mockService.sources = [];
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-missing-src',
            isDynamic: true,
            sourceId: 'nonexistent-source-id',
            prefix: 'Bearer ',
            suffix: '',
            headerName: 'Authorization',
            headerValue: '', // explicit empty
          }),
        ],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      // Source not found, so header value is not populated from prefix+content+suffix
      expect(result.header[0].headerValue).toBe('');
    });

    it('excludes rule when source has null content (readiness gate)', () => {
      mockService.sources = [makeSource({ sourceId: 'src-null', sourceContent: null })];
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-null-src',
            isDynamic: true,
            sourceId: 'src-null',
            prefix: 'Bearer ',
            suffix: '',
            headerName: 'Authorization',
            headerValue: '',
          }),
        ],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      // sourceContent is null — rule excluded until content arrives
      expect(result.header).toHaveLength(0);
    });

    it('excludes rule when source has stale content but is waiting_for_deps', () => {
      mockService.sources = [
        makeSource({
          sourceId: 'src-stale',
          sourceContent: 'stale-token-from-previous-fetch',
          activationState: 'waiting_for_deps',
          missingDependencies: ['API_HOST'],
        }),
      ];
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-stale-dep',
            isDynamic: true,
            sourceId: 'src-stale',
            prefix: 'Bearer ',
            suffix: '',
            headerName: 'Authorization',
            headerValue: '',
          }),
        ],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      // Source has stale content but deps are unresolved — rule must be excluded
      expect(result.header).toHaveLength(0);
    });

    it('includes rule when source has content and is active', () => {
      mockService.sources = [
        makeSource({
          sourceId: 'src-active',
          sourceContent: 'fresh-token',
          activationState: 'active',
        }),
      ];
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-active-dep',
            isDynamic: true,
            sourceId: 'src-active',
            prefix: 'Bearer ',
            suffix: '',
            headerName: 'Authorization',
            headerValue: '',
          }),
        ],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      expect(result.header).toHaveLength(1);
      expect(result.header[0].headerValue).toBe('Bearer fresh-token');
    });

    it('resolves env vars in header values and marks as active', () => {
      mockService.environmentHandler.loadEnvironmentVariables = () => ({
        API_KEY: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
      });
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-env-1',
            headerName: 'X-API-Key',
            headerValue: '{{API_KEY}}',
            hasEnvVars: true,
            envVars: ['API_KEY'],
          }),
        ],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      expect(result.header[0].headerValue).toBe('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
      expect(result.header[0].activationState).toBe('active');
      expect(result.header[0].hasEnvVars).toBeUndefined();
      expect(result.header[0].envVars).toBeUndefined();
    });

    it('resolves env vars in header name', () => {
      mockService.environmentHandler.loadEnvironmentVariables = () => ({
        HEADER_NAME: 'X-Custom-Enterprise-Token',
      });
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-env-name',
            headerName: '{{HEADER_NAME}}',
            headerValue: 'some-value',
            hasEnvVars: true,
            envVars: ['HEADER_NAME'],
          }),
        ],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      expect(result.header[0].headerName).toBe('X-Custom-Enterprise-Token');
    });

    it('filters out rules with missing env var dependencies', () => {
      mockService.environmentHandler.loadEnvironmentVariables = () => ({});
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-missing-env',
            headerName: 'X-Key',
            headerValue: '{{MISSING_VAR}}',
            hasEnvVars: true,
            envVars: ['MISSING_VAR'],
          }),
        ],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      expect(result.header).toHaveLength(0);
    });

    it('filters out rules when some env vars present but others missing', () => {
      mockService.environmentHandler.loadEnvironmentVariables = () => ({
        VAR_A: 'present',
      });
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-partial-env',
            headerName: 'X-Key',
            headerValue: '{{VAR_A}}-{{VAR_B}}',
            hasEnvVars: true,
            envVars: ['VAR_A', 'VAR_B'],
          }),
        ],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      expect(result.header).toHaveLength(0);
    });

    it('resolves env vars in domains with comma splitting', () => {
      mockService.environmentHandler.loadEnvironmentVariables = () => ({
        DOMAINS: 'api.openheaders.io, staging.openheaders.io:8443, *.internal.openheaders.io',
      });
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-env-domains',
            headerName: 'X-Key',
            headerValue: 'val',
            hasEnvVars: true,
            envVars: ['DOMAINS'],
            domains: ['{{DOMAINS}}'],
          }),
        ],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      expect(result.header[0].domains).toEqual([
        'api.openheaders.io',
        'staging.openheaders.io:8443',
        '*.internal.openheaders.io',
      ]);
    });

    it('resolves env vars in dynamic prefix/suffix', () => {
      mockService.environmentHandler.loadEnvironmentVariables = () => ({
        TOKEN_PREFIX: 'Bearer ',
      });
      mockService.sources = [makeSource({ sourceId: 'src-dynamic-env', sourceContent: 'jwt-token-value' })];
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-env-dynamic',
            isDynamic: true,
            sourceId: 'src-dynamic-env',
            prefix: '{{TOKEN_PREFIX}}',
            suffix: '',
            headerName: 'Authorization',
            hasEnvVars: true,
            envVars: ['TOKEN_PREFIX'],
          }),
        ],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      expect(result.header[0].headerValue).toBe('Bearer jwt-token-value');
    });

    it('does not modify original rules object', () => {
      const original: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-original',
            headerName: 'X-Original',
            headerValue: 'original-value',
          }),
        ],
      };
      handler._populateDynamicHeaderValues(original);
      expect(original.header[0].headerValue).toBe('original-value');
    });

    it('preserves request and response rules in output', () => {
      const rules: RulesCollection = {
        header: [makeHeaderRule({ id: 'h1' })],
        request: [{ id: 'req-1', type: 'payload', name: 'Body Transform' }] as RulesCollection['request'],
        response: [{ id: 'res-1', type: 'url', name: 'URL Redirect' }] as RulesCollection['response'],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      expect(result.request).toHaveLength(1);
      expect(result.response).toHaveLength(1);
    });

    it('handles multiple rules with mixed static, dynamic, and env var types', () => {
      mockService.environmentHandler.loadEnvironmentVariables = () => ({
        API_KEY: 'ohk_live_enterprise',
        ENV_NAME: 'production',
      });
      mockService.sources = [makeSource({ sourceId: 'src-jwt', sourceContent: 'jwt-token-abc123' })];

      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-static',
            headerName: 'X-Static-Header',
            headerValue: 'static-value',
          }),
          makeHeaderRule({
            id: 'rule-dynamic',
            isDynamic: true,
            sourceId: 'src-jwt',
            prefix: 'Bearer ',
            suffix: '',
            headerName: 'Authorization',
          }),
          makeHeaderRule({
            id: 'rule-env',
            headerName: 'X-API-Key',
            headerValue: '{{API_KEY}}',
            hasEnvVars: true,
            envVars: ['API_KEY'],
          }),
          makeHeaderRule({
            id: 'rule-missing-env',
            headerName: 'X-Missing',
            headerValue: '{{MISSING}}',
            hasEnvVars: true,
            envVars: ['MISSING'],
          }),
        ],
      };

      const result = handler._populateDynamicHeaderValues(rules);
      // Missing env var rule is filtered out
      expect(result.header).toHaveLength(3);
      expect(result.header[0].headerName).toBe('X-Static-Header');
      expect(result.header[0].headerValue).toBe('static-value');
      expect(result.header[1].headerName).toBe('Authorization');
      expect(result.header[1].headerValue).toBe('Bearer jwt-token-abc123');
      expect(result.header[2].headerName).toBe('X-API-Key');
      expect(result.header[2].headerValue).toBe('ohk_live_enterprise');
    });

    it('handles env var loading failure gracefully', () => {
      mockService.environmentHandler.loadEnvironmentVariables = () => {
        throw new Error('environments.json corrupted');
      };
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-env-fail',
            headerName: 'X-Key',
            headerValue: '{{API_KEY}}',
            hasEnvVars: true,
            envVars: ['API_KEY'],
          }),
        ],
      };
      // Should not throw; env vars just won't be resolved
      const result = handler._populateDynamicHeaderValues(rules);
      // Rule has hasEnvVars but environmentVariables is null, so env vars won't be processed
      expect(result.header).toHaveLength(1);
    });

    it('does not resolve env vars in non-dynamic static headerValue when isDynamic is true', () => {
      mockService.environmentHandler.loadEnvironmentVariables = () => ({
        TOKEN: 'secret-token',
      });
      mockService.sources = [makeSource({ sourceId: 'src-1', sourceContent: 'source-content' })];
      const rules: RulesCollection = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-dyn-no-env-val',
            isDynamic: true,
            sourceId: 'src-1',
            prefix: '',
            suffix: '',
            headerName: 'Authorization',
            headerValue: '{{TOKEN}}', // should NOT be resolved since isDynamic=true
            hasEnvVars: true,
            envVars: ['TOKEN'],
          }),
        ],
      };
      const result = handler._populateDynamicHeaderValues(rules);
      // Dynamic rules get their value from source, not from headerValue template
      expect(result.header[0].headerValue).toBe('source-content');
    });
  });

  describe('updateRules', () => {
    it('sets rules on service and triggers broadcast', () => {
      const rules: RulesCollection = {
        ...emptyRules,
        header: [makeHeaderRule({ id: 'rule-update-1' })],
      };
      handler.updateRules(rules);
      expect(mockService.rules.header).toHaveLength(1);
      expect(mockService._broadcastToAll).toHaveBeenCalled();
    });
  });

  describe('handleToggleRule', () => {
    it('delegates to onRuleToggle callback with stringified ruleId', async () => {
      const onToggle = vi.fn().mockResolvedValue(undefined);
      handler.onRuleToggle = onToggle;

      await handler.handleToggleRule('rule-abc-123', false);
      expect(onToggle).toHaveBeenCalledWith('rule-abc-123', { isEnabled: false });
    });

    it('coerces numeric ruleId to string', async () => {
      const onToggle = vi.fn().mockResolvedValue(undefined);
      handler.onRuleToggle = onToggle;

      await handler.handleToggleRule(42 as unknown as string, true);
      expect(onToggle).toHaveBeenCalledWith('42', { isEnabled: true });
    });

    it('logs warning and returns when onRuleToggle is not wired', async () => {
      handler.onRuleToggle = null;
      // Should not throw
      await handler.handleToggleRule('rule-1', true);
    });

    it('catches and logs errors from onRuleToggle callback', async () => {
      handler.onRuleToggle = vi.fn().mockRejectedValue(new Error('persistence failed'));
      // Should not throw
      await handler.handleToggleRule('rule-1', true);
    });
  });

  describe('handleDeleteRule', () => {
    it('delegates to onRuleDelete callback with stringified ruleId', async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined);
      handler.onRuleDelete = onDelete;

      const result = await handler.handleDeleteRule('rule-abc-123');
      expect(onDelete).toHaveBeenCalledWith('rule-abc-123');
      expect(result).toBe(true);
    });

    it('coerces numeric ruleId to string', async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined);
      handler.onRuleDelete = onDelete;

      const result = await handler.handleDeleteRule(42 as unknown as string);
      expect(onDelete).toHaveBeenCalledWith('42');
      expect(result).toBe(true);
    });

    it('returns false when onRuleDelete is not wired', async () => {
      handler.onRuleDelete = null;
      const result = await handler.handleDeleteRule('rule-1');
      expect(result).toBe(false);
    });

    it('returns false and logs error on callback failure', async () => {
      handler.onRuleDelete = vi.fn().mockRejectedValue(new Error('persistence failed'));
      const result = await handler.handleDeleteRule('rule-1');
      expect(result).toBe(false);
    });
  });

  describe('handleToggleAllRules', () => {
    it('uses batch callback when available (single broadcast)', async () => {
      const onBatch = vi.fn().mockResolvedValue(undefined);
      handler.onRuleToggleBatch = onBatch;
      handler.onRuleToggle = vi.fn();

      await handler.handleToggleAllRules(['rule-1', 'rule-2', 'rule-3'], false);

      expect(onBatch).toHaveBeenCalledWith([
        { ruleId: 'rule-1', changes: { isEnabled: false } },
        { ruleId: 'rule-2', changes: { isEnabled: false } },
        { ruleId: 'rule-3', changes: { isEnabled: false } },
      ]);
      // Should NOT have called the individual toggle
      expect(handler.onRuleToggle).not.toHaveBeenCalled();
    });

    it('falls back to individual toggles when batch callback not wired', async () => {
      const onToggle = vi.fn().mockResolvedValue(undefined);
      handler.onRuleToggle = onToggle;
      handler.onRuleToggleBatch = null;

      await handler.handleToggleAllRules(['rule-a', 'rule-b'], true);

      expect(onToggle).toHaveBeenCalledTimes(2);
      expect(onToggle).toHaveBeenCalledWith('rule-a', { isEnabled: true });
      expect(onToggle).toHaveBeenCalledWith('rule-b', { isEnabled: true });
    });

    it('continues toggling remaining rules when one fails in fallback mode', async () => {
      const onToggle = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('rule-2 failed'))
        .mockResolvedValueOnce(undefined);
      handler.onRuleToggle = onToggle;
      handler.onRuleToggleBatch = null;

      await handler.handleToggleAllRules(['rule-1', 'rule-2', 'rule-3'], true);

      // All three were attempted despite rule-2 failure
      expect(onToggle).toHaveBeenCalledTimes(3);
    });

    it('logs warning when neither callback is wired', async () => {
      handler.onRuleToggle = null;
      handler.onRuleToggleBatch = null;
      // Should not throw
      await handler.handleToggleAllRules(['rule-1'], true);
    });
  });

  describe('broadcastRules', () => {
    it('broadcasts populated rules with version to all clients', () => {
      mockService.rules = {
        ...emptyRules,
        header: [
          makeHeaderRule({
            id: 'rule-broadcast',
            headerName: 'X-Broadcast',
            headerValue: 'test-value',
          }),
        ],
      };
      handler.broadcastRules();
      expect(mockService._broadcastToAll).toHaveBeenCalledTimes(1);

      const message = JSON.parse(mockService._broadcastToAll.mock.calls[0][0] as string);
      expect(message.type).toBe('rules-update');
      expect(message.data).toHaveProperty('rules');
      expect(message.data).toHaveProperty('version');
      expect(message.data.rules.header).toHaveLength(1);
      expect(message.data.rules.header[0].headerName).toBe('X-Broadcast');
    });
  });
});
