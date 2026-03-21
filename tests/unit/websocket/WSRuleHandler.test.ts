import { describe, it, expect, beforeEach } from 'vitest';
import { WSRuleHandler } from '../../../src/services/websocket/ws-rule-handler';
import type { RulesCollection, HeaderRule } from '../../../src/types/rules';
import type { Source } from '../../../src/types/source';

const emptyRules: RulesCollection = { header: [], request: [], response: [] };

function makeHeaderRule(overrides: Partial<HeaderRule>): HeaderRule {
    return {
        id: '1',
        type: 'header',
        name: '',
        description: '',
        isEnabled: true,
        domains: [],
        createdAt: '',
        updatedAt: '',
        headerName: '',
        headerValue: '',
        tag: '',
        isResponse: false,
        isDynamic: false,
        sourceId: null,
        prefix: '',
        suffix: '',
        hasEnvVars: false,
        envVars: [],
        ...overrides
    };
}

function createMockService(rules: RulesCollection = emptyRules, sources: Partial<Source>[] = []) {
    return {
        rules,
        sources,
        appDataPath: null,
        environmentHandler: {
            loadEnvironmentVariables: () => ({}),
            resolveTemplate: (template: string, vars: Record<string, string>) => {
                return template.replace(/\{\{([^}]+)\}\}/g, (match: string, varName: string) => {
                    const v = vars[varName.trim()];
                    return (v !== undefined && v !== null && v !== '') ? v : match;
                });
            }
        },
        _broadcastToAll: () => 0
    };
}

describe('WSRuleHandler', () => {
    let handler: WSRuleHandler;
    let mockService: ReturnType<typeof createMockService>;

    beforeEach(() => {
        mockService = createMockService();
        handler = new WSRuleHandler(mockService as ConstructorParameters<typeof WSRuleHandler>[0]);
    });

    // ------- _populateDynamicHeaderValues -------
    describe('_populateDynamicHeaderValues', () => {
        it('returns empty rules unchanged', () => {
            const result = handler._populateDynamicHeaderValues(emptyRules);
            expect(result.header).toHaveLength(0);
        });

        it('returns rules without header array unchanged', () => {
            const result = handler._populateDynamicHeaderValues(emptyRules);
            expect(result.header).toEqual([]);
        });

        it('passes through rules without env vars or dynamic sources', () => {
            const rules: RulesCollection = {
                ...emptyRules,
                header: [makeHeaderRule({ id: '1', headerName: 'X-Custom', headerValue: 'value' })]
            };
            const result = handler._populateDynamicHeaderValues(rules);
            expect(result.header).toHaveLength(1);
            expect(result.header[0].headerName).toBe('X-Custom');
            expect(result.header[0].headerValue).toBe('value');
        });

        it('resolves dynamic header value from source', () => {
            mockService.sources = [
                { sourceId: '42', sourceContent: 'token-abc' } as Source
            ];
            const rules: RulesCollection = {
                ...emptyRules,
                header: [makeHeaderRule({ id: '1', isDynamic: true, sourceId: 42, prefix: 'Bearer ', suffix: '', headerName: 'Authorization' })]
            };
            const result = handler._populateDynamicHeaderValues(rules);
            expect(result.header[0].headerValue).toBe('Bearer token-abc');
        });

        it('handles dynamic rule with prefix and suffix', () => {
            mockService.sources = [
                { sourceId: '1', sourceContent: 'XYZ' } as Source
            ];
            const rules: RulesCollection = {
                ...emptyRules,
                header: [makeHeaderRule({ id: '1', isDynamic: true, sourceId: '1', prefix: 'pre-', suffix: '-post', headerName: 'X-Token' })]
            };
            const result = handler._populateDynamicHeaderValues(rules);
            expect(result.header[0].headerValue).toBe('pre-XYZ-post');
        });

        it('leaves dynamic value empty when source not found', () => {
            mockService.sources = [];
            const rules: RulesCollection = {
                ...emptyRules,
                header: [makeHeaderRule({ id: '1', isDynamic: true, sourceId: '999', prefix: '', suffix: '', headerName: 'X-Token' })]
            };
            const result = handler._populateDynamicHeaderValues(rules);
            expect(result.header[0].headerValue).toBe('');
        });

        it('resolves env vars in header values', () => {
            mockService.environmentHandler.loadEnvironmentVariables = () => ({ API_KEY: 'secret123' });
            const rules: RulesCollection = {
                ...emptyRules,
                header: [makeHeaderRule({ id: '1', headerName: 'X-Key', headerValue: '{{API_KEY}}', hasEnvVars: true, envVars: ['API_KEY'] })]
            };
            const result = handler._populateDynamicHeaderValues(rules);
            expect(result.header[0].headerValue).toBe('secret123');
            expect(result.header[0].activationState).toBe('active');
            expect(result.header[0].hasEnvVars).toBeUndefined();
        });

        it('resolves env vars in header name', () => {
            mockService.environmentHandler.loadEnvironmentVariables = () => ({ HEADER: 'X-Custom' });
            const rules: RulesCollection = {
                ...emptyRules,
                header: [makeHeaderRule({ id: '1', headerName: '{{HEADER}}', headerValue: 'val', hasEnvVars: true, envVars: ['HEADER'] })]
            };
            const result = handler._populateDynamicHeaderValues(rules);
            expect(result.header[0].headerName).toBe('X-Custom');
        });

        it('filters out rules with missing env var dependencies', () => {
            mockService.environmentHandler.loadEnvironmentVariables = () => ({});
            const rules: RulesCollection = {
                ...emptyRules,
                header: [makeHeaderRule({ id: '1', headerName: 'X-Key', headerValue: '{{MISSING}}', hasEnvVars: true, envVars: ['MISSING'] })]
            };
            const result = handler._populateDynamicHeaderValues(rules);
            expect(result.header).toHaveLength(0);
        });

        it('resolves env vars in domains with comma splitting', () => {
            mockService.environmentHandler.loadEnvironmentVariables = () => ({
                DOMAINS: 'example.com, test.com'
            });
            const rules: RulesCollection = {
                ...emptyRules,
                header: [makeHeaderRule({ id: '1', headerName: 'X-Key', headerValue: 'val', hasEnvVars: true, envVars: ['DOMAINS'], domains: ['{{DOMAINS}}'] })]
            };
            const result = handler._populateDynamicHeaderValues(rules);
            expect(result.header[0].domains).toEqual(['example.com', 'test.com']);
        });

        it('resolves env vars in dynamic prefix/suffix', () => {
            mockService.environmentHandler.loadEnvironmentVariables = () => ({ PREFIX: 'Bearer ' });
            mockService.sources = [{ sourceId: '1', sourceContent: 'token' } as Source];
            const rules: RulesCollection = {
                ...emptyRules,
                header: [makeHeaderRule({
                    id: '1', isDynamic: true, sourceId: '1',
                    prefix: '{{PREFIX}}', suffix: '',
                    headerName: 'Auth',
                    hasEnvVars: true, envVars: ['PREFIX']
                })]
            };
            const result = handler._populateDynamicHeaderValues(rules);
            expect(result.header[0].headerValue).toBe('Bearer token');
        });

        it('does not modify original rules object', () => {
            const original: RulesCollection = {
                ...emptyRules,
                header: [makeHeaderRule({ id: '1', headerName: 'X-Test', headerValue: 'original' })]
            };
            handler._populateDynamicHeaderValues(original);
            expect(original.header[0].headerValue).toBe('original');
        });
    });

    // ------- updateRules -------
    describe('updateRules', () => {
        it('sets rules on service and broadcasts', () => {
            let broadcastCalled = false;
            mockService._broadcastToAll = () => { broadcastCalled = true; return 1; };
            const rules: RulesCollection = { ...emptyRules, header: [makeHeaderRule({ id: '1' })] };
            handler.updateRules(rules);
            expect(mockService.rules.header).toHaveLength(1);
            expect(broadcastCalled).toBe(true);
        });
    });
});
