import { describe, it, expect, beforeEach } from 'vitest';
import { ProtocolHandler } from '../../../src/main/modules/protocol/protocolHandler';

type ProtocolPayload = Parameters<ProtocolHandler['expandOptimizedPayload']>[0];
type ExpandedPayload = ReturnType<ProtocolHandler['expandOptimizedPayload']>;

function makePayload(overrides: Record<string, unknown>): ProtocolPayload {
    return overrides as unknown as ProtocolPayload;
}

describe('ProtocolHandler', () => {
    let handler: ProtocolHandler;

    beforeEach(() => {
        handler = new ProtocolHandler();
    });

    describe('validateProtocolUrl', () => {
        it('rejects empty string', () => {
            expect(handler.validateProtocolUrl('').valid).toBe(false);
        });

        it('rejects URLs without openheaders:// prefix', () => {
            const result = handler.validateProtocolUrl('https://example.com');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('openheaders://');
        });

        it('rejects URLs with wrong protocol', () => {
            const result = handler.validateProtocolUrl('http://open?payload=abc');
            expect(result.valid).toBe(false);
        });

        it('rejects URLs without a host', () => {
            // openheaders:// with no host
            const result = handler.validateProtocolUrl('openheaders:///');
            expect(result.valid).toBe(false);
        });

        it('rejects URLs with non-"open" host', () => {
            const result = handler.validateProtocolUrl('openheaders://invite?payload=abc');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Expected: openheaders://open?payload=...');
        });

        it('rejects URLs without payload parameter', () => {
            const result = handler.validateProtocolUrl('openheaders://open?foo=bar');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('payload parameter');
        });

        it('accepts valid URLs with payload parameter', () => {
            const result = handler.validateProtocolUrl('openheaders://open?payload=abc123');
            expect(result.valid).toBe(true);
            expect(result.host).toBe('open');
        });

        it('accepts valid URLs with g parameter (gzip)', () => {
            const result = handler.validateProtocolUrl('openheaders://open?g=abc123');
            expect(result.valid).toBe(true);
        });

        it('accepts valid URLs with d parameter (deflate)', () => {
            const result = handler.validateProtocolUrl('openheaders://open?d=abc123');
            expect(result.valid).toBe(true);
        });

        it('accepts valid URLs with b85 parameter (base85)', () => {
            const result = handler.validateProtocolUrl('openheaders://open?b85=abc123');
            expect(result.valid).toBe(true);
        });

        it('returns urlObj on valid URLs', () => {
            const result = handler.validateProtocolUrl('openheaders://open?payload=test');
            expect(result.valid).toBe(true);
            expect(result.urlObj).toBeInstanceOf(URL);
            expect(result.urlObj!.protocol).toBe('openheaders:');
        });
    });

    describe('expandOptimizedPayload', () => {
        it('expands action code "ei" to "environment-import"', () => {
            const result = handler.expandOptimizedPayload(makePayload({ a: 'ei', data: {} }));
            expect(result.action).toBe('environment-import');
            expect(result.a).toBeUndefined();
        });

        it('expands action code "ti" to "team-invite"', () => {
            const result = handler.expandOptimizedPayload(makePayload({ a: 'ti', data: {} }));
            expect(result.action).toBe('team-invite');
        });

        it('expands version "3" to full DATA_FORMAT_VERSION', () => {
            const result = handler.expandOptimizedPayload(makePayload({ v: '3', data: {} }));
            expect(result.version).toBe('3.0.0');
            expect(result.v).toBeUndefined();
        });

        it('expands minified data field "d" to "data"', () => {
            const result = handler.expandOptimizedPayload(makePayload({ d: { foo: 'bar' } }));
            expect(result.data).toEqual({ foo: 'bar' });
            expect(result.d).toBeUndefined();
        });

        it('expands environment short names', () => {
            const result = handler.expandOptimizedPayload(makePayload({
                d: {
                    e: {
                        dev: { API_KEY: { val: '123', s: 1 } },
                        prod: { API_KEY: { val: '456' } },
                        stg: { API_KEY: { val: '789' } }
                    }
                }
            }));
            const envData = result.data as unknown as { environments: Record<string, Record<string, { value: string; isSecret?: boolean }>> };
            expect(envData.environments.development).toBeDefined();
            expect(envData.environments.production).toBeDefined();
            expect(envData.environments.staging).toBeDefined();
            expect(envData.environments.development.API_KEY.value).toBe('123');
            expect(envData.environments.development.API_KEY.isSecret).toBe(true);
            expect(envData.environments.production.API_KEY.value).toBe('456');
            expect(envData.environments.production.API_KEY.isSecret).toBeUndefined();
        });

        it('expands environment schema', () => {
            const result = handler.expandOptimizedPayload(makePayload({
                d: {
                    es: {
                        e: {
                            dev: { v: [{ n: 'API_KEY', s: 1 }, { n: 'HOST' }] }
                        }
                    }
                }
            }));
            const schemaData = result.data as unknown as { environmentSchema: { environments: Record<string, { variables: Array<{ name: string; isSecret: boolean }> }> } };
            expect(schemaData.environmentSchema.environments.development).toBeDefined();
            const vars = schemaData.environmentSchema.environments.development.variables;
            expect(vars).toHaveLength(2);
            expect(vars[0].name).toBe('API_KEY');
            expect(vars[0].isSecret).toBe(true);
            expect(vars[1].name).toBe('HOST');
            expect(vars[1].isSecret).toBe(false);
        });

        it('expands team invite fields', () => {
            const result = handler.expandOptimizedPayload(makePayload({
                d: {
                    wn: 'My Team',
                    ru: 'https://github.com/test/repo',
                    b: 'develop',
                    cp: 'config/app.json',
                    at: 'token',
                    in: 'Alice',
                    desc: 'Team workspace'
                }
            }));
            const inviteData = result.data as unknown as { workspaceName: string; repoUrl: string; branch: string; configPath: string; authType: string; inviterName: string; description: string };
            expect(inviteData.workspaceName).toBe('My Team');
            expect(inviteData.repoUrl).toBe('https://github.com/test/repo');
            expect(inviteData.branch).toBe('develop');
            expect(inviteData.configPath).toBe('config/app.json');
            expect(inviteData.authType).toBe('token');
            expect(inviteData.inviterName).toBe('Alice');
            expect(inviteData.description).toBe('Team workspace');
        });

        it('does not modify already-expanded payloads', () => {
            const payload = {
                action: 'team-invite',
                version: '3.0.0',
                data: { workspaceName: 'Test' }
            };
            const result = handler.expandOptimizedPayload(makePayload({ ...payload }));
            expect(result.action).toBe('team-invite');
            expect(result.version).toBe('3.0.0');
            expect((result.data as Record<string, unknown>).workspaceName).toBe('Test');
        });
    });

    describe('base85Decode', () => {
        it('returns a Buffer', () => {
            const result = handler.base85Decode('00000');
            expect(Buffer.isBuffer(result)).toBe(true);
        });

        it('decodes known base85 values to bytes', () => {
            // '0' maps to index 0 in the alphabet
            const result = handler.base85Decode('00000');
            expect(result.length).toBeGreaterThan(0);
        });
    });

    describe('isVersionCompatible', () => {
        it('accepts compatible version', () => {
            expect(handler.isVersionCompatible('3.0.0')).toBe(true);
        });

        it('accepts same major version with different minor', () => {
            expect(handler.isVersionCompatible('3.1.0')).toBe(true);
        });

        it('rejects different major version', () => {
            expect(handler.isVersionCompatible('2.0.0')).toBe(false);
            expect(handler.isVersionCompatible('4.0.0')).toBe(false);
        });
    });

    describe('shouldShowDock', () => {
        it('defaults to true when no settings exist', () => {
            // No settings file exists in test environment
            expect(handler.shouldShowDock()).toBe(true);
        });
    });
});
