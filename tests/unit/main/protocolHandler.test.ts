import { describe, it, expect, beforeEach } from 'vitest';
import zlib from 'zlib';
import { ProtocolHandler } from '../../../src/main/modules/protocol/protocolHandler';
import { DATA_FORMAT_VERSION } from '../../../src/config/version';

type ProtocolPayload = Parameters<ProtocolHandler['expandOptimizedPayload']>[0];

function makePayload(overrides: Record<string, unknown>): ProtocolPayload {
    return overrides as unknown as ProtocolPayload;
}

function makeCompressedPayloadUrl(payload: Record<string, unknown>, compression: 'gzip' | 'deflate' = 'gzip'): string {
    const json = JSON.stringify(payload);
    let compressed: Buffer;
    if (compression === 'deflate') {
        compressed = zlib.deflateSync(json);
    } else {
        compressed = zlib.gzipSync(json, { level: 9 });
    }
    const param = compressed.toString('base64url');
    return `openheaders://open?payload=${param}`;
}

describe('ProtocolHandler', () => {
    let handler: ProtocolHandler;

    beforeEach(() => {
        handler = new ProtocolHandler();
    });

    describe('validateProtocolUrl', () => {
        describe('valid URLs', () => {
            it('accepts valid URL with payload parameter', () => {
                const result = handler.validateProtocolUrl('openheaders://open?payload=abc123def456');
                expect(result).toEqual({
                    valid: true,
                    urlObj: expect.any(URL),
                    host: 'open'
                });
                expect(result.urlObj!.protocol).toBe('openheaders:');
            });

            it('accepts URL with g parameter (gzip)', () => {
                const result = handler.validateProtocolUrl('openheaders://open?g=H4sIAAAAAAAAA');
                expect(result.valid).toBe(true);
                expect(result.host).toBe('open');
            });

            it('accepts URL with d parameter (deflate)', () => {
                const result = handler.validateProtocolUrl('openheaders://open?d=eJzLSM3JyQcABJgB8Q');
                expect(result.valid).toBe(true);
            });

            it('accepts URL with b85 parameter (base85)', () => {
                const result = handler.validateProtocolUrl('openheaders://open?b85=0123456789');
                expect(result.valid).toBe(true);
            });

            it('accepts URL with very long payload (enterprise-sized)', () => {
                const longPayload = 'A'.repeat(10000);
                const result = handler.validateProtocolUrl(`openheaders://open?payload=${longPayload}`);
                expect(result.valid).toBe(true);
            });
        });

        describe('invalid URLs', () => {
            it('rejects empty string', () => {
                const result = handler.validateProtocolUrl('');
                expect(result).toEqual({ valid: false, error: 'URL must be a non-empty string' });
            });

            it('rejects URLs without openheaders:// prefix', () => {
                const result = handler.validateProtocolUrl('https://openheaders.io/open?payload=abc');
                expect(result.valid).toBe(false);
                expect(result.error).toContain('openheaders://');
            });

            it('rejects URLs with wrong host (not "open")', () => {
                const result = handler.validateProtocolUrl('openheaders://invite?payload=abc');
                expect(result.valid).toBe(false);
                expect(result.error).toContain('Expected: openheaders://open?payload=...');
            });

            it('rejects URLs without any valid payload parameter', () => {
                const result = handler.validateProtocolUrl('openheaders://open?action=team-invite');
                expect(result.valid).toBe(false);
                expect(result.error).toContain('payload parameter');
            });

            it('rejects URLs without host', () => {
                const result = handler.validateProtocolUrl('openheaders:///');
                expect(result.valid).toBe(false);
            });

            it('rejects http:// protocol', () => {
                const result = handler.validateProtocolUrl('http://open?payload=abc');
                expect(result.valid).toBe(false);
            });

            it('rejects legacy join host', () => {
                const result = handler.validateProtocolUrl('openheaders://join?payload=abc');
                expect(result.valid).toBe(false);
                expect(result.error).toContain('Expected: openheaders://open?payload=...');
            });
        });
    });

    describe('expandOptimizedPayload', () => {
        describe('action code expansion', () => {
            it('expands "ei" to "environment-import"', () => {
                const result = handler.expandOptimizedPayload(makePayload({ a: 'ei', data: {} }));
                expect(result.action).toBe('environment-import');
                expect(result.a).toBeUndefined();
            });

            it('expands "ti" to "team-invite"', () => {
                const result = handler.expandOptimizedPayload(makePayload({ a: 'ti', data: {} }));
                expect(result.action).toBe('team-invite');
                expect(result.a).toBeUndefined();
            });

            it('preserves already-expanded action', () => {
                const result = handler.expandOptimizedPayload(makePayload({
                    action: 'team-invite',
                    version: DATA_FORMAT_VERSION,
                    data: { workspaceName: 'OpenHeaders — Production' }
                }));
                expect(result.action).toBe('team-invite');
            });
        });

        describe('version expansion', () => {
            it('expands "3" to full DATA_FORMAT_VERSION', () => {
                const result = handler.expandOptimizedPayload(makePayload({ v: '3', data: {} }));
                expect(result.version).toBe(DATA_FORMAT_VERSION);
                expect(result.v).toBeUndefined();
            });
        });

        describe('environment data expansion', () => {
            it('expands environment short names (dev, prod, stg)', () => {
                const result = handler.expandOptimizedPayload(makePayload({
                    d: {
                        e: {
                            dev: {
                                API_KEY: { val: 'ohk_test_Q3W4E5R6T7Y8U9I0', s: 1 },
                                BASE_URL: { val: 'https://api.dev.openheaders.io' }
                            },
                            prod: {
                                API_KEY: { val: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc', s: 1 }
                            },
                            stg: {
                                API_KEY: { val: 'sk_stg_M1N2O3P4Q5R6S7T8', s: 1 }
                            }
                        }
                    }
                }));

                const envData = result.data as { environments: Record<string, Record<string, { value: string; isSecret?: boolean }>> };
                expect(envData.environments.development).toBeDefined();
                expect(envData.environments.production).toBeDefined();
                expect(envData.environments.staging).toBeDefined();

                expect(envData.environments.development.API_KEY.value).toBe('ohk_test_Q3W4E5R6T7Y8U9I0');
                expect(envData.environments.development.API_KEY.isSecret).toBe(true);
                expect(envData.environments.development.BASE_URL.value).toBe('https://api.dev.openheaders.io');
                expect(envData.environments.development.BASE_URL.isSecret).toBeUndefined();

                expect(envData.environments.production.API_KEY.value).toBe('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
                expect(envData.environments.staging.API_KEY.value).toBe('sk_stg_M1N2O3P4Q5R6S7T8');
            });

            it('preserves custom environment names that are not shortened', () => {
                const result = handler.expandOptimizedPayload(makePayload({
                    d: {
                        e: {
                            qa: { API_KEY: { val: 'qa-key' } },
                            'pre-production': { API_KEY: { val: 'preprod-key' } }
                        }
                    }
                }));

                const envData = result.data as { environments: Record<string, Record<string, { value: string }>> };
                expect(envData.environments.qa).toBeDefined();
                expect(envData.environments['pre-production']).toBeDefined();
            });
        });

        describe('environment schema expansion', () => {
            it('expands minified schema to full format', () => {
                const result = handler.expandOptimizedPayload(makePayload({
                    d: {
                        es: {
                            e: {
                                dev: {
                                    v: [
                                        { n: 'OAUTH_CLIENT_ID', s: 0 },
                                        { n: 'OAUTH_CLIENT_SECRET', s: 1 },
                                        { n: 'DATABASE_URL', s: 1 }
                                    ]
                                },
                                prod: {
                                    v: [
                                        { n: 'OAUTH_CLIENT_ID', s: 0 },
                                        { n: 'OAUTH_CLIENT_SECRET', s: 1 }
                                    ]
                                }
                            }
                        }
                    }
                }));

                const schemaData = result.data as { environmentSchema: { environments: Record<string, { variables: Array<{ name: string; isSecret: boolean }> }> } };
                const devVars = schemaData.environmentSchema.environments.development.variables;
                expect(devVars).toHaveLength(3);
                expect(devVars[0]).toEqual({ name: 'OAUTH_CLIENT_ID', isSecret: false });
                expect(devVars[1]).toEqual({ name: 'OAUTH_CLIENT_SECRET', isSecret: true });
                expect(devVars[2]).toEqual({ name: 'DATABASE_URL', isSecret: true });

                const prodVars = schemaData.environmentSchema.environments.production.variables;
                expect(prodVars).toHaveLength(2);
            });
        });

        describe('team invite field expansion', () => {
            it('expands all minified team invite fields', () => {
                const result = handler.expandOptimizedPayload(makePayload({
                    d: {
                        wn: 'OpenHeaders — Platform Team Config',
                        ru: 'https://gitlab.openheaders.io/platform/shared-headers.git',
                        b: 'workspace/production-env',
                        cp: 'config/open-headers.json',
                        at: 'token',
                        in: 'admin@openheaders.io',
                        desc: 'Production header configuration for the platform team'
                    }
                }));

                const inviteData = result.data as Record<string, string>;
                expect(inviteData.workspaceName).toBe('OpenHeaders — Platform Team Config');
                expect(inviteData.repoUrl).toBe('https://gitlab.openheaders.io/platform/shared-headers.git');
                expect(inviteData.branch).toBe('workspace/production-env');
                expect(inviteData.configPath).toBe('config/open-headers.json');
                expect(inviteData.authType).toBe('token');
                expect(inviteData.inviterName).toBe('admin@openheaders.io');
                expect(inviteData.description).toBe('Production header configuration for the platform team');
            });
        });

        describe('combined ultra-optimized payload', () => {
            it('expands a fully minified payload with all features', () => {
                const result = handler.expandOptimizedPayload(makePayload({
                    a: 'ei',
                    v: '3',
                    d: {
                        e: {
                            prod: {
                                AUTH_TOKEN: { val: 'Bearer eyJhbGciOiJSUzI1NiJ9.xxx.yyy', s: 1 }
                            }
                        },
                        es: {
                            e: {
                                prod: { v: [{ n: 'AUTH_TOKEN', s: 1 }] }
                            }
                        }
                    }
                }));

                expect(result.action).toBe('environment-import');
                expect(result.version).toBe(DATA_FORMAT_VERSION);
                expect(result.a).toBeUndefined();
                expect(result.v).toBeUndefined();
                expect(result.d).toBeUndefined();
            });
        });
    });

    describe('base85Decode', () => {
        it('returns a Buffer', () => {
            const result = handler.base85Decode('00000');
            expect(Buffer.isBuffer(result)).toBe(true);
        });

        it('decodes known values to non-empty buffer', () => {
            const result = handler.base85Decode('00000');
            expect(result.length).toBeGreaterThan(0);
        });

        it('handles longer input strings', () => {
            const result = handler.base85Decode('0123456789ABCDE');
            expect(result.length).toBeGreaterThan(0);
        });

        it('handles partial chunks (not multiple of 5)', () => {
            const result = handler.base85Decode('0123');
            expect(Buffer.isBuffer(result)).toBe(true);
        });
    });

    describe('isVersionCompatible', () => {
        it('accepts same version', () => {
            expect(handler.isVersionCompatible('3.0.0')).toBe(true);
        });

        it('accepts same major version with different minor/patch', () => {
            expect(handler.isVersionCompatible('3.1.0')).toBe(true);
            expect(handler.isVersionCompatible('3.0.1')).toBe(true);
            expect(handler.isVersionCompatible('3.99.99')).toBe(true);
        });

        it('rejects different major version', () => {
            expect(handler.isVersionCompatible('2.0.0')).toBe(false);
            expect(handler.isVersionCompatible('4.0.0')).toBe(false);
            expect(handler.isVersionCompatible('1.0.0')).toBe(false);
        });

        it('rejects empty string', () => {
            expect(handler.isVersionCompatible('')).toBe(false);
        });
    });

    describe('shouldShowDock', () => {
        it('defaults to true when no settings file exists', () => {
            expect(handler.shouldShowDock()).toBe(true);
        });
    });

    describe('constructor and state', () => {
        it('initializes with null mainWindow', () => {
            expect(handler.mainWindow).toBeNull();
        });

        it('initializes with rendererReady = false', () => {
            expect(handler.rendererReady).toBe(false);
        });

        it('initializes with no pending invites', () => {
            expect(handler.pendingInvite).toBeNull();
            expect(handler.pendingEnvironmentImport).toBeNull();
        });
    });

    describe('setRendererReady', () => {
        it('marks renderer as ready', () => {
            handler.setRendererReady();
            expect(handler.rendererReady).toBe(true);
        });
    });

    describe('processTeamWorkspaceInvite', () => {
        it('stores invite as pending when no window is available', () => {
            handler.processTeamWorkspaceInvite({
                workspaceName: 'OpenHeaders — Staging Environment',
                repoUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git',
                branch: 'workspace/staging-env',
                authType: 'token',
                inviterName: 'admin@openheaders.io'
            });

            expect(handler.pendingInvite).toEqual({
                workspaceName: 'OpenHeaders — Staging Environment',
                repoUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git',
                branch: 'workspace/staging-env',
                authType: 'token',
                inviterName: 'admin@openheaders.io'
            });
        });

        it('calls handleProtocolError for invalid invite data (missing workspaceName)', () => {
            // This should not store a pending invite
            handler.processTeamWorkspaceInvite({
                workspaceName: '',
                repoUrl: 'https://gitlab.openheaders.io/repo.git'
            });

            expect(handler.pendingInvite).toBeNull();
        });

        it('calls handleProtocolError for invalid invite data (missing repoUrl)', () => {
            handler.processTeamWorkspaceInvite({
                workspaceName: 'Test Workspace',
                repoUrl: ''
            });

            expect(handler.pendingInvite).toBeNull();
        });
    });

    describe('processEnvironmentConfigImport', () => {
        it('stores environment import as pending when no window is available', () => {
            const envData = {
                environmentSchema: {
                    environments: {
                        production: {
                            variables: [
                                { name: 'API_KEY', isSecret: true },
                                { name: 'BASE_URL', isSecret: false }
                            ]
                        }
                    }
                }
            };

            handler.processEnvironmentConfigImport(envData);
            expect(handler.pendingEnvironmentImport).toEqual(envData);
        });

        it('calls handleProtocolError for invalid data (no schema or environments)', () => {
            handler.processEnvironmentConfigImport({});
            expect(handler.pendingEnvironmentImport).toBeNull();
        });
    });

    describe('handleUnifiedProtocol — round-trip with real payloads', () => {
        it('processes a gzip-compressed team invite payload', () => {
            const payload = {
                action: 'team-invite',
                version: DATA_FORMAT_VERSION,
                data: {
                    workspaceName: 'OpenHeaders — Production Configuration',
                    repoUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git',
                    branch: 'workspace/production-env',
                    configPath: 'config/open-headers.json',
                    authType: 'token',
                    inviterName: 'admin@openheaders.io',
                    description: 'Production header config'
                }
            };

            const compressed = zlib.gzipSync(JSON.stringify(payload), { level: 9 });
            const payloadParam = compressed.toString('base64url');

            handler.handleUnifiedProtocol(payloadParam, 'gzip');

            expect(handler.pendingInvite).toEqual({
                workspaceName: 'OpenHeaders — Production Configuration',
                repoUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git',
                branch: 'workspace/production-env',
                configPath: 'config/open-headers.json',
                authType: 'token',
                inviterName: 'admin@openheaders.io',
                description: 'Production header config'
            });
        });

        it('processes a gzip-compressed environment import payload', () => {
            const payload = {
                action: 'environment-import',
                version: DATA_FORMAT_VERSION,
                data: {
                    environmentSchema: {
                        environments: {
                            staging: {
                                variables: [
                                    { name: 'AUTH_TOKEN', isSecret: true },
                                    { name: 'API_URL', isSecret: false }
                                ]
                            }
                        }
                    }
                }
            };

            const compressed = zlib.gzipSync(JSON.stringify(payload), { level: 9 });
            const payloadParam = compressed.toString('base64url');

            handler.handleUnifiedProtocol(payloadParam, 'gzip');

            expect(handler.pendingEnvironmentImport).toEqual({
                environmentSchema: {
                    environments: {
                        staging: {
                            variables: [
                                { name: 'AUTH_TOKEN', isSecret: true },
                                { name: 'API_URL', isSecret: false }
                            ]
                        }
                    }
                }
            });
        });

        it('processes a deflate-compressed payload', () => {
            const payload = {
                action: 'team-invite',
                version: DATA_FORMAT_VERSION,
                data: {
                    workspaceName: 'Deflate Test Workspace',
                    repoUrl: 'https://github.com/openheaders/test.git',
                    inviterName: 'test-user'
                }
            };

            const compressed = zlib.deflateSync(JSON.stringify(payload));
            const payloadParam = compressed.toString('base64url');

            handler.handleUnifiedProtocol(payloadParam, 'deflate');

            expect(handler.pendingInvite).toEqual({
                workspaceName: 'Deflate Test Workspace',
                repoUrl: 'https://github.com/openheaders/test.git',
                inviterName: 'test-user'
            });
        });

        it('falls back to base64 for uncompressed legacy payload', () => {
            const payload = {
                action: 'team-invite',
                version: DATA_FORMAT_VERSION,
                data: {
                    workspaceName: 'Legacy Format Workspace',
                    repoUrl: 'https://github.com/openheaders/legacy.git',
                    inviterName: 'legacy-user'
                }
            };

            const payloadParam = btoa(JSON.stringify(payload));

            handler.handleUnifiedProtocol(payloadParam, 'gzip');

            expect(handler.pendingInvite).toEqual({
                workspaceName: 'Legacy Format Workspace',
                repoUrl: 'https://github.com/openheaders/legacy.git',
                inviterName: 'legacy-user'
            });
        });

        it('rejects payload missing action field', () => {
            const payload = { version: DATA_FORMAT_VERSION, data: { test: true } };
            const compressed = zlib.gzipSync(JSON.stringify(payload), { level: 9 });
            const payloadParam = compressed.toString('base64url');

            // Should not throw, but should not set pending invite
            handler.handleUnifiedProtocol(payloadParam, 'gzip');
            expect(handler.pendingInvite).toBeNull();
        });

        it('rejects payload missing data field', () => {
            const payload = { action: 'team-invite', version: DATA_FORMAT_VERSION };
            const compressed = zlib.gzipSync(JSON.stringify(payload), { level: 9 });
            const payloadParam = compressed.toString('base64url');

            handler.handleUnifiedProtocol(payloadParam, 'gzip');
            expect(handler.pendingInvite).toBeNull();
        });

        it('rejects unknown action', () => {
            const payload = {
                action: 'unknown-action',
                version: DATA_FORMAT_VERSION,
                data: { foo: 'bar' }
            };
            const compressed = zlib.gzipSync(JSON.stringify(payload), { level: 9 });
            const payloadParam = compressed.toString('base64url');

            handler.handleUnifiedProtocol(payloadParam, 'gzip');
            expect(handler.pendingInvite).toBeNull();
            expect(handler.pendingEnvironmentImport).toBeNull();
        });

        it('handles empty payload parameter gracefully', () => {
            // Should not throw
            handler.handleUnifiedProtocol('', 'gzip');
            expect(handler.pendingInvite).toBeNull();
        });

        it('handles corrupted payload gracefully', () => {
            handler.handleUnifiedProtocol('not-valid-base64-at-all!!!', 'gzip');
            expect(handler.pendingInvite).toBeNull();
        });

        it('processes ultra-optimized payload with expansion', () => {
            const minified = {
                a: 'ti',
                v: '3',
                d: {
                    wn: 'OpenHeaders — QA Environment',
                    ru: 'https://gitlab.openheaders.io/qa/headers.git',
                    b: 'workspace/qa',
                    at: 'token',
                    in: 'qa-admin@openheaders.io'
                }
            };

            const compressed = zlib.gzipSync(JSON.stringify(minified), { level: 9 });
            const payloadParam = compressed.toString('base64url');

            handler.handleUnifiedProtocol(payloadParam, 'gzip');

            expect(handler.pendingInvite).toEqual({
                workspaceName: 'OpenHeaders — QA Environment',
                repoUrl: 'https://gitlab.openheaders.io/qa/headers.git',
                branch: 'workspace/qa',
                authType: 'token',
                inviterName: 'qa-admin@openheaders.io'
            });
        });
    });

    describe('handleProtocolUrl — integration', () => {
        it('rejects invalid URL and does not set pending data', () => {
            handler.handleProtocolUrl('https://evil.com/steal');
            expect(handler.pendingInvite).toBeNull();
        });

        it('processes valid openheaders:// URL end-to-end', () => {
            const payload = {
                action: 'team-invite',
                version: DATA_FORMAT_VERSION,
                data: {
                    workspaceName: 'E2E Test Workspace',
                    repoUrl: 'https://github.com/openheaders/e2e-test.git',
                    inviterName: 'e2e-tester'
                }
            };

            const compressed = zlib.gzipSync(JSON.stringify(payload), { level: 9 });
            const payloadParam = compressed.toString('base64url');
            const url = `openheaders://open?payload=${payloadParam}`;

            handler.handleProtocolUrl(url);

            expect(handler.pendingInvite).toEqual({
                workspaceName: 'E2E Test Workspace',
                repoUrl: 'https://github.com/openheaders/e2e-test.git',
                inviterName: 'e2e-tester'
            });
        });
    });
});
