import { describe, it, expect, beforeEach } from 'vitest';
import { WSEnvironmentHandler } from '../../../src/services/websocket/ws-environment-handler';

function createMockService() {
    return {
        appDataPath: '/tmp/test-app-data',
        rules: {},
        sources: [],
        ruleHandler: { broadcastRules: () => {} }
    };
}

describe('WSEnvironmentHandler', () => {
    let handler: WSEnvironmentHandler;

    beforeEach(() => {
        handler = new WSEnvironmentHandler(createMockService() as any);
    });

    // ------- resolveTemplate -------
    describe('resolveTemplate', () => {
        it('replaces single variable', () => {
            const result = handler.resolveTemplate('Bearer {{TOKEN}}', { TOKEN: 'abc123' });
            expect(result).toBe('Bearer abc123');
        });

        it('replaces multiple variables', () => {
            const result = handler.resolveTemplate('{{PROTOCOL}}://{{HOST}}:{{PORT}}', {
                PROTOCOL: 'https',
                HOST: 'example.com',
                PORT: '443'
            });
            expect(result).toBe('https://example.com:443');
        });

        it('keeps unresolved variables in template', () => {
            const result = handler.resolveTemplate('{{FOUND}}-{{MISSING}}', { FOUND: 'yes' });
            expect(result).toBe('yes-{{MISSING}}');
        });

        it('handles template with no variables', () => {
            const result = handler.resolveTemplate('plain text', { KEY: 'value' });
            expect(result).toBe('plain text');
        });

        it('returns empty/falsy template as-is', () => {
            expect(handler.resolveTemplate('', {})).toBe('');
            expect(handler.resolveTemplate(null as any, {})).toBe(null);
            expect(handler.resolveTemplate(undefined as any, {})).toBe(undefined);
        });

        it('trims whitespace in variable names', () => {
            const result = handler.resolveTemplate('{{ TOKEN }}', { TOKEN: 'abc' });
            expect(result).toBe('abc');
        });

        it('does not replace empty or null values', () => {
            const result = handler.resolveTemplate('{{A}}-{{B}}-{{C}}', {
                A: '',
                B: 'good',
                C: ''
            } as any);
            expect(result).toBe('{{A}}-good-{{C}}');
        });

        it('handles nested-looking braces gracefully', () => {
            // {{{KEY}}} — the regex [^}]+ greedily captures "{KEY" (including the
            // leading brace), so the captured var name is "{KEY", which is not in
            // variables — the match is returned unchanged.
            const result = handler.resolveTemplate('{{{KEY}}}', { KEY: 'val' });
            expect(result).toBe('{{{KEY}}}');
        });
    });
});
