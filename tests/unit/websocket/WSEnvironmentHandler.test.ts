import { describe, it, expect, beforeEach } from 'vitest';
import { WSEnvironmentHandler } from '../../../src/services/websocket/ws-environment-handler';

function createMockService(): ConstructorParameters<typeof WSEnvironmentHandler>[0] {
    return {
        appDataPath: '/Users/jane.doe/Library/Application Support/OpenHeaders',
        rules: { header: [], request: [], response: [] },
        sources: [],
        ruleHandler: { broadcastRules: () => {} }
    };
}

describe('WSEnvironmentHandler', () => {
    let handler: WSEnvironmentHandler;

    beforeEach(() => {
        handler = new WSEnvironmentHandler(createMockService());
    });

    describe('resolveTemplate', () => {
        it('replaces single variable', () => {
            const result = handler.resolveTemplate(
                'Bearer {{TOKEN}}',
                { TOKEN: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyQGFjbWUuY29tIn0.sig' }
            );
            expect(result).toBe('Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyQGFjbWUuY29tIn0.sig');
        });

        it('replaces multiple variables in URL template', () => {
            const result = handler.resolveTemplate('{{PROTOCOL}}://{{HOST}}:{{PORT}}/api/v2/oauth/token', {
                PROTOCOL: 'https',
                HOST: 'auth.openheaders.internal',
                PORT: '8443'
            });
            expect(result).toBe('https://auth.openheaders.internal:8443/api/v2/oauth/token');
        });

        it('keeps unresolved variables in template', () => {
            const result = handler.resolveTemplate('{{FOUND}}-{{MISSING}}', { FOUND: 'resolved' });
            expect(result).toBe('resolved-{{MISSING}}');
        });

        it('handles template with no variables', () => {
            const result = handler.resolveTemplate('plain text value', { KEY: 'unused' });
            expect(result).toBe('plain text value');
        });

        it('returns empty template as-is', () => {
            expect(handler.resolveTemplate('', {})).toBe('');
        });

        it('trims whitespace in variable names', () => {
            const result = handler.resolveTemplate('{{ TOKEN }}', {
                TOKEN: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc'
            });
            expect(result).toBe('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
        });

        it('does not replace empty string values', () => {
            const result = handler.resolveTemplate('{{A}}-{{B}}-{{C}}', {
                A: '',
                B: 'present',
                C: ''
            });
            expect(result).toBe('{{A}}-present-{{C}}');
        });

        it('handles nested-looking braces gracefully', () => {
            const result = handler.resolveTemplate('{{{KEY}}}', { KEY: 'val' });
            expect(result).toBe('{{{KEY}}}');
        });

        it('resolves enterprise-style connection string variables', () => {
            const result = handler.resolveTemplate(
                'postgresql://{{DB_USER}}:{{DB_PASSWORD}}@{{DB_HOST}}:{{DB_PORT}}/{{DB_NAME}}?sslmode=require',
                {
                    DB_USER: 'openheaders_app',
                    DB_PASSWORD: 'P@$$w0rd!2026',
                    DB_HOST: 'db.openheaders.internal',
                    DB_PORT: '5432',
                    DB_NAME: 'openheaders_production'
                }
            );
            expect(result).toBe('postgresql://openheaders_app:P@$$w0rd!2026@db.openheaders.internal:5432/openheaders_production?sslmode=require');
        });

        it('resolves variables with special characters in values', () => {
            const result = handler.resolveTemplate('{{API_KEY}}', {
                API_KEY: 'ohk_live_4eC39HqLyjW+Darjt/T1zdp7dc=='
            });
            expect(result).toBe('ohk_live_4eC39HqLyjW+Darjt/T1zdp7dc==');
        });

        it('resolves comma-separated domain list for rule domain env var', () => {
            const result = handler.resolveTemplate('{{ALLOWED_DOMAINS}}', {
                ALLOWED_DOMAINS: '*.openheaders.io, api.partner-service.io:8443, localhost:3000'
            });
            expect(result).toBe('*.openheaders.io, api.partner-service.io:8443, localhost:3000');
        });

        it('resolves adjacent variables with no separator', () => {
            const result = handler.resolveTemplate('{{PREFIX}}{{SUFFIX}}', {
                PREFIX: 'Bearer ',
                SUFFIX: 'token123'
            });
            expect(result).toBe('Bearer token123');
        });

        it('handles same variable used multiple times', () => {
            const result = handler.resolveTemplate('{{HOST}}/api and {{HOST}}/ws', {
                HOST: 'api.openheaders.io'
            });
            expect(result).toBe('api.openheaders.io/api and api.openheaders.io/ws');
        });

        it('does not replace variables when value is null-like string', () => {
            // The code checks for empty string, null, and undefined
            const result = handler.resolveTemplate('{{A}}', { A: '' });
            expect(result).toBe('{{A}}');
        });

        it('handles variable names with underscores and numbers', () => {
            const result = handler.resolveTemplate('{{API_KEY_V2_PROD}}', {
                API_KEY_V2_PROD: 'ohk_live_enterprise_key_v2'
            });
            expect(result).toBe('ohk_live_enterprise_key_v2');
        });

        it('handles very long template values (JWT-like)', () => {
            const longJwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
                'eyJzdWIiOiJ1c2VyQGVudGVycHJpc2UuY29tIiwiaWF0IjoxNzE2MDAwMDAwLCJleHAiOjE3MTYwODY0MDAsInNjb3BlIjoicmVhZCB3cml0ZSBhZG1pbiIsImF1ZCI6Imh0dHBzOi8vYXBpLm9wZW5oZWFkZXJzLmlvIn0.' +
                'a'.repeat(256);
            const result = handler.resolveTemplate('Bearer {{JWT}}', { JWT: longJwt });
            expect(result).toBe(`Bearer ${longJwt}`);
        });
    });

    describe('variable cache', () => {
        it('returns cached variables from setVariables instead of reading disk', () => {
            const cached = { API_KEY: 'ohk_cached_key', SECRET: 'ohk_cached_secret' };
            handler.setVariables(cached);

            const result = handler.loadEnvironmentVariables();
            expect(result).toBe(cached);
        });

        it('clearVariableCache forces next load to fall back to disk', () => {
            handler.setVariables({ API_KEY: 'ohk_cached' });
            handler.clearVariableCache();

            // After clearing, loadEnvironmentVariables falls back to disk.
            // With a mock appDataPath that doesn't exist, it returns {}.
            const result = handler.loadEnvironmentVariables();
            expect(result).toEqual({});
        });

        it('setVariables overwrites previous cache', () => {
            handler.setVariables({ OLD_KEY: 'old_value' });
            handler.setVariables({ NEW_KEY: 'new_value' });

            const result = handler.loadEnvironmentVariables();
            expect(result).toEqual({ NEW_KEY: 'new_value' });
            expect(result).not.toHaveProperty('OLD_KEY');
        });

        it('setVariables stores plain strings — callers must normalize objects before calling', () => {
            // The renderer sends { value, isSecret } objects via IPC.
            // WorkspaceStateService.onEnvironmentVariablesChanged normalizes them
            // to plain strings BEFORE calling setVariables. Verify that setVariables
            // stores and returns exactly what it receives.
            const normalized = { USERNAME: 'user@openheaders.io', PASSWORD: 's3cret' };
            handler.setVariables(normalized);

            const result = handler.loadEnvironmentVariables();
            expect(result.USERNAME).toBe('user@openheaders.io');
            expect(result.PASSWORD).toBe('s3cret');
        });
    });

    describe('environment variable normalization (integration pattern)', () => {
        it('normalizes { value, isSecret } objects to plain strings', () => {
            // This tests the normalization pattern used by WorkspaceStateService.onEnvironmentVariablesChanged
            const rawFromRenderer: Record<string, string | { value: string; isSecret?: boolean }> = {
                API_KEY: { value: 'ohk_live_key123', isSecret: true },
                USERNAME: { value: 'admin@openheaders.io', isSecret: false },
                DOMAIN: 'openheaders.io' // already a string
            };

            const resolved: Record<string, string> = {};
            for (const [key, val] of Object.entries(rawFromRenderer)) {
                resolved[key] = typeof val === 'object' && val !== null ? val.value : String(val);
            }

            handler.setVariables(resolved);
            const result = handler.loadEnvironmentVariables();

            expect(result.API_KEY).toBe('ohk_live_key123');
            expect(result.USERNAME).toBe('admin@openheaders.io');
            expect(result.DOMAIN).toBe('openheaders.io');
            // Must not contain [object Object]
            expect(Object.values(result).join('')).not.toContain('[object Object]');
        });
    });
});
