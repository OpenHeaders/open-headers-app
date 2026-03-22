import { describe, it, expect, beforeEach } from 'vitest';
import zlib from 'zlib';
import { ProtocolHandler } from '../../../src/main/modules/protocol/protocolHandler';
import { DATA_FORMAT_VERSION } from '../../../src/config/version';

type ProtocolPayload = Parameters<ProtocolHandler['expandOptimizedPayload']>[0];

function makePayload(overrides: Record<string, unknown>): ProtocolPayload {
    return overrides as unknown as ProtocolPayload;
}

function makeCompressedUrl(payload: Record<string, unknown>, compression: 'gzip' | 'deflate' = 'gzip'): string {
    const json = JSON.stringify(payload);
    const compressed = compression === 'deflate'
        ? zlib.deflateSync(json)
        : zlib.gzipSync(json, { level: 9 });
    const param = compressed.toString('base64url');
    return `openheaders://open?payload=${param}`;
}

// Enterprise-realistic invite payload
const ENTERPRISE_INVITE = {
    action: 'team-invite',
    version: DATA_FORMAT_VERSION,
    data: {
        workspaceName: 'OpenHeaders — Production Configuration',
        repoUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git',
        branch: 'workspace/production-env',
        configPath: 'config/open-headers.json',
        authType: 'token',
        inviterName: 'admin@openheaders.io',
        description: 'Production header config for the platform engineering team'
    }
};

// Enterprise-realistic environment import payload
const ENTERPRISE_ENV_IMPORT = {
    action: 'environment-import',
    version: DATA_FORMAT_VERSION,
    data: {
        environmentSchema: {
            environments: {
                production: {
                    variables: [
                        { name: 'OAUTH_CLIENT_ID', isSecret: false },
                        { name: 'OAUTH_CLIENT_SECRET', isSecret: true },
                        { name: 'DATABASE_URL', isSecret: true },
                        { name: 'API_GATEWAY_URL', isSecret: false },
                        { name: 'REDIS_CONNECTION_STRING', isSecret: true }
                    ]
                },
                staging: {
                    variables: [
                        { name: 'OAUTH_CLIENT_ID', isSecret: false },
                        { name: 'OAUTH_CLIENT_SECRET', isSecret: true }
                    ]
                }
            }
        }
    }
};

describe('ProtocolHandler', () => {
    let handler: ProtocolHandler;

    beforeEach(() => {
        handler = new ProtocolHandler();
    });

    describe('validateProtocolUrl', () => {
        describe('valid URLs', () => {
            it('accepts valid URL with payload parameter and returns full shape', () => {
                const result = handler.validateProtocolUrl('openheaders://open?payload=abc123def456');
                expect(result).toEqual({
                    valid: true,
                    urlObj: expect.any(URL),
                    host: 'open'
                });
                expect(result.urlObj!.protocol).toBe('openheaders:');
                expect(result.urlObj!.hostname).toBe('open');
            });

            it('accepts URL with g parameter (gzip)', () => {
                const result = handler.validateProtocolUrl('openheaders://open?g=H4sIAAAAAAAAA');
                expect(result.valid).toBe(true);
                expect(result.host).toBe('open');
            });

            it('accepts URL with d parameter (deflate)', () => {
                const result = handler.validateProtocolUrl('openheaders://open?d=eJzLSM3JyQcABJgB8Q');
                expect(result.valid).toBe(true);
                expect(result.host).toBe('open');
            });

            it('accepts URL with b85 parameter (base85)', () => {
                const result = handler.validateProtocolUrl('openheaders://open?b85=0123456789ABCDEFabcdef');
                expect(result.valid).toBe(true);
            });

            it('accepts URL with enterprise-sized payload (10KB+)', () => {
                const longPayload = 'A'.repeat(15000);
                const result = handler.validateProtocolUrl(`openheaders://open?payload=${longPayload}`);
                expect(result.valid).toBe(true);
            });

            it('accepts real compressed enterprise invite URL', () => {
                const url = makeCompressedUrl(ENTERPRISE_INVITE);
                const result = handler.validateProtocolUrl(url);
                expect(result.valid).toBe(true);
                expect(result.host).toBe('open');
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

            it('rejects legacy env-config host', () => {
                const result = handler.validateProtocolUrl('openheaders://env-config?payload=abc');
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

                expect(envData.environments.development.API_KEY).toEqual({ value: 'ohk_test_Q3W4E5R6T7Y8U9I0', isSecret: true });
                expect(envData.environments.development.BASE_URL).toEqual({ value: 'https://api.dev.openheaders.io' });

                expect(envData.environments.production.API_KEY.value).toBe('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
                expect(envData.environments.staging.API_KEY.value).toBe('sk_stg_M1N2O3P4Q5R6S7T8');
            });

            it('preserves custom environment names that are not shortened', () => {
                const result = handler.expandOptimizedPayload(makePayload({
                    d: {
                        e: {
                            qa: { API_KEY: { val: 'qa-key-openheaders-io' } },
                            'pre-production': { API_KEY: { val: 'preprod-key-openheaders-io' } }
                        }
                    }
                }));

                const envData = result.data as { environments: Record<string, Record<string, { value: string }>> };
                expect(envData.environments.qa.API_KEY.value).toBe('qa-key-openheaders-io');
                expect(envData.environments['pre-production'].API_KEY.value).toBe('preprod-key-openheaders-io');
            });

            it('handles variable without secret flag as non-secret', () => {
                const result = handler.expandOptimizedPayload(makePayload({
                    d: {
                        e: {
                            dev: {
                                PUBLIC_URL: { val: 'https://app.openheaders.io' }
                            }
                        }
                    }
                }));

                const envData = result.data as { environments: Record<string, Record<string, { value: string; isSecret?: boolean }>> };
                expect(envData.environments.development.PUBLIC_URL.isSecret).toBeUndefined();
            });
        });

        describe('environment schema expansion', () => {
            it('expands minified schema to full format with all env names', () => {
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
                expect(devVars).toEqual([
                    { name: 'OAUTH_CLIENT_ID', isSecret: false },
                    { name: 'OAUTH_CLIENT_SECRET', isSecret: true },
                    { name: 'DATABASE_URL', isSecret: true }
                ]);

                const prodVars = schemaData.environmentSchema.environments.production.variables;
                expect(prodVars).toEqual([
                    { name: 'OAUTH_CLIENT_ID', isSecret: false },
                    { name: 'OAUTH_CLIENT_SECRET', isSecret: true }
                ]);
            });
        });

        describe('team invite field expansion', () => {
            it('expands all minified team invite fields to full names', () => {
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
                expect(inviteData).toEqual(expect.objectContaining({
                    workspaceName: 'OpenHeaders — Platform Team Config',
                    repoUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git',
                    branch: 'workspace/production-env',
                    configPath: 'config/open-headers.json',
                    authType: 'token',
                    inviterName: 'admin@openheaders.io',
                    description: 'Production header configuration for the platform team'
                }));
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

                const data = result.data as {
                    environments: Record<string, Record<string, { value: string; isSecret: boolean }>>;
                    environmentSchema: { environments: Record<string, { variables: Array<{ name: string; isSecret: boolean }> }> }
                };
                expect(data.environments.production.AUTH_TOKEN.value).toBe('Bearer eyJhbGciOiJSUzI1NiJ9.xxx.yyy');
                expect(data.environments.production.AUTH_TOKEN.isSecret).toBe(true);
                expect(data.environmentSchema.environments.production.variables).toEqual([
                    { name: 'AUTH_TOKEN', isSecret: true }
                ]);
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

        it('handles longer input strings (multiple of 5)', () => {
            const result = handler.base85Decode('0123456789ABCDE');
            expect(result.length).toBeGreaterThan(0);
        });

        it('handles partial chunks (not multiple of 5)', () => {
            const result = handler.base85Decode('0123');
            expect(Buffer.isBuffer(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
        });

        it('handles empty string', () => {
            const result = handler.base85Decode('');
            expect(Buffer.isBuffer(result)).toBe(true);
            expect(result.length).toBe(0);
        });

        it('handles single character', () => {
            const result = handler.base85Decode('A');
            expect(Buffer.isBuffer(result)).toBe(true);
        });

        it('handles alphabet boundary characters', () => {
            // First and last chars of the base85 alphabet
            const result = handler.base85Decode('0~');
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
        it('initializes with all fields in expected default state', () => {
            expect(handler.mainWindow).toBeNull();
            expect(handler.rendererReady).toBe(false);
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

    describe('setMainWindow', () => {
        it('stores window reference', () => {
            const win = { webContents: { send: () => {}, isLoading: () => false } } as unknown as Parameters<typeof handler.setMainWindow>[0];
            handler.setMainWindow(win);
            expect(handler.mainWindow).toBe(win);
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

        it('rejects invite with empty workspaceName', () => {
            handler.processTeamWorkspaceInvite({
                workspaceName: '',
                repoUrl: 'https://gitlab.openheaders.io/repo.git'
            });
            expect(handler.pendingInvite).toBeNull();
        });

        it('rejects invite with empty repoUrl', () => {
            handler.processTeamWorkspaceInvite({
                workspaceName: 'OpenHeaders — Test Workspace',
                repoUrl: ''
            });
            expect(handler.pendingInvite).toBeNull();
        });

        it('stores as pending when renderer is not ready', () => {
            const sentMessages: Array<{ channel: string; data: unknown }> = [];
            const win = {
                webContents: {
                    send: (channel: string, data: unknown) => { sentMessages.push({ channel, data }); },
                    isLoading: () => false,
                },
                show: () => {},
                focus: () => {},
                isMinimized: () => false,
                isDestroyed: () => false,
                restore: () => {},
            } as unknown as Parameters<typeof handler.setMainWindow>[0];
            handler.setMainWindow(win);
            // rendererReady is still false

            handler.processTeamWorkspaceInvite({
                workspaceName: 'OpenHeaders — QA Config',
                repoUrl: 'https://github.com/openheaders/qa-headers.git',
                inviterName: 'qa-lead@openheaders.io'
            });

            expect(handler.pendingInvite).toEqual({
                workspaceName: 'OpenHeaders — QA Config',
                repoUrl: 'https://github.com/openheaders/qa-headers.git',
                inviterName: 'qa-lead@openheaders.io'
            });
        });
    });

    describe('processEnvironmentConfigImport', () => {
        it('stores environment import as pending when no window is available', () => {
            const envData = {
                environmentSchema: {
                    environments: {
                        production: {
                            variables: [
                                { name: 'OAUTH_CLIENT_ID', isSecret: false },
                                { name: 'OAUTH_CLIENT_SECRET', isSecret: true },
                                { name: 'DATABASE_URL', isSecret: true }
                            ]
                        },
                        staging: {
                            variables: [
                                { name: 'OAUTH_CLIENT_ID', isSecret: false }
                            ]
                        }
                    }
                }
            };

            handler.processEnvironmentConfigImport(envData);
            expect(handler.pendingEnvironmentImport).toEqual(envData);
        });

        it('accepts import with environments values (no schema)', () => {
            const envData = {
                environments: {
                    production: {
                        API_KEY: { value: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc', isSecret: true }
                    }
                }
            };
            handler.processEnvironmentConfigImport(envData);
            expect(handler.pendingEnvironmentImport).toEqual(envData);
        });

        it('rejects invalid data with neither schema nor environments', () => {
            handler.processEnvironmentConfigImport({});
            expect(handler.pendingEnvironmentImport).toBeNull();
        });
    });

    describe('processPendingInvite', () => {
        it('sends pending invite to window and clears it', () => {
            const sentMessages: Array<{ channel: string; data: unknown }> = [];
            const win = {
                webContents: {
                    send: (channel: string, data: unknown) => { sentMessages.push({ channel, data }); },
                    isLoading: () => false,
                },
            } as unknown as Parameters<typeof handler.processPendingInvite>[0];

            handler.pendingInvite = {
                workspaceName: 'OpenHeaders — Staging',
                repoUrl: 'https://gitlab.openheaders.io/platform/headers.git',
                inviterName: 'admin@openheaders.io'
            };

            handler.processPendingInvite(win);

            expect(sentMessages).toContainEqual({
                channel: 'process-team-workspace-invite',
                data: {
                    workspaceName: 'OpenHeaders — Staging',
                    repoUrl: 'https://gitlab.openheaders.io/platform/headers.git',
                    inviterName: 'admin@openheaders.io'
                }
            });
            expect(handler.pendingInvite).toBeNull();
        });

        it('sends pending environment import to window and clears it', () => {
            const sentMessages: Array<{ channel: string; data: unknown }> = [];
            const win = {
                webContents: {
                    send: (channel: string, data: unknown) => { sentMessages.push({ channel, data }); },
                    isLoading: () => false,
                },
            } as unknown as Parameters<typeof handler.processPendingInvite>[0];

            const envData = {
                environmentSchema: {
                    environments: {
                        production: {
                            variables: [{ name: 'API_KEY', isSecret: true }]
                        }
                    }
                }
            };
            handler.pendingEnvironmentImport = envData;

            handler.processPendingInvite(win);

            expect(sentMessages).toContainEqual({
                channel: 'process-environment-config-import',
                data: envData
            });
            expect(handler.pendingEnvironmentImport).toBeNull();
        });

        it('does nothing when no pending data exists', () => {
            const sentMessages: Array<{ channel: string; data: unknown }> = [];
            const win = {
                webContents: {
                    send: (channel: string, data: unknown) => { sentMessages.push({ channel, data }); },
                    isLoading: () => false,
                },
            } as unknown as Parameters<typeof handler.processPendingInvite>[0];

            handler.processPendingInvite(win);
            expect(sentMessages).toHaveLength(0);
        });
    });

    describe('handleUnifiedProtocol — round-trip with real payloads', () => {
        it('processes a gzip-compressed enterprise team invite payload', () => {
            const compressed = zlib.gzipSync(JSON.stringify(ENTERPRISE_INVITE), { level: 9 });
            const payloadParam = compressed.toString('base64url');

            handler.handleUnifiedProtocol(payloadParam, 'gzip');

            expect(handler.pendingInvite).toEqual(ENTERPRISE_INVITE.data);
        });

        it('processes a gzip-compressed enterprise environment import payload', () => {
            const compressed = zlib.gzipSync(JSON.stringify(ENTERPRISE_ENV_IMPORT), { level: 9 });
            const payloadParam = compressed.toString('base64url');

            handler.handleUnifiedProtocol(payloadParam, 'gzip');

            expect(handler.pendingEnvironmentImport).toEqual(ENTERPRISE_ENV_IMPORT.data);
        });

        it('processes a deflate-compressed payload', () => {
            const payload = {
                action: 'team-invite',
                version: DATA_FORMAT_VERSION,
                data: {
                    workspaceName: 'OpenHeaders — Deflate Test Workspace',
                    repoUrl: 'https://github.com/openheaders/deflate-test.git',
                    inviterName: 'test-user@openheaders.io'
                }
            };

            const compressed = zlib.deflateSync(JSON.stringify(payload));
            const payloadParam = compressed.toString('base64url');

            handler.handleUnifiedProtocol(payloadParam, 'deflate');

            expect(handler.pendingInvite).toEqual({
                workspaceName: 'OpenHeaders — Deflate Test Workspace',
                repoUrl: 'https://github.com/openheaders/deflate-test.git',
                inviterName: 'test-user@openheaders.io'
            });
        });

        it('falls back to base64 for uncompressed legacy payload', () => {
            const payload = {
                action: 'team-invite',
                version: DATA_FORMAT_VERSION,
                data: {
                    workspaceName: 'OpenHeaders Legacy Format Workspace',
                    repoUrl: 'https://github.com/openheaders/legacy.git',
                    inviterName: 'legacy-user@openheaders.io'
                }
            };

            // btoa only handles ASCII, so use Buffer for the encoding
            const payloadParam = Buffer.from(JSON.stringify(payload)).toString('base64');
            handler.handleUnifiedProtocol(payloadParam, 'gzip');

            expect(handler.pendingInvite).toEqual({
                workspaceName: 'OpenHeaders Legacy Format Workspace',
                repoUrl: 'https://github.com/openheaders/legacy.git',
                inviterName: 'legacy-user@openheaders.io'
            });
        });

        it('rejects payload missing action field', () => {
            const payload = { version: DATA_FORMAT_VERSION, data: { test: true } };
            const compressed = zlib.gzipSync(JSON.stringify(payload), { level: 9 });
            handler.handleUnifiedProtocol(compressed.toString('base64url'), 'gzip');
            expect(handler.pendingInvite).toBeNull();
        });

        it('rejects payload missing data field', () => {
            const payload = { action: 'team-invite', version: DATA_FORMAT_VERSION };
            const compressed = zlib.gzipSync(JSON.stringify(payload), { level: 9 });
            handler.handleUnifiedProtocol(compressed.toString('base64url'), 'gzip');
            expect(handler.pendingInvite).toBeNull();
        });

        it('rejects unknown action', () => {
            const payload = {
                action: 'unknown-action',
                version: DATA_FORMAT_VERSION,
                data: { foo: 'bar' }
            };
            const compressed = zlib.gzipSync(JSON.stringify(payload), { level: 9 });
            handler.handleUnifiedProtocol(compressed.toString('base64url'), 'gzip');
            expect(handler.pendingInvite).toBeNull();
            expect(handler.pendingEnvironmentImport).toBeNull();
        });

        it('handles empty payload parameter gracefully', () => {
            handler.handleUnifiedProtocol('', 'gzip');
            expect(handler.pendingInvite).toBeNull();
        });

        it('handles corrupted payload gracefully', () => {
            handler.handleUnifiedProtocol('not-valid-base64-at-all!!!', 'gzip');
            expect(handler.pendingInvite).toBeNull();
        });

        it('processes ultra-optimized payload with full expansion', () => {
            const minified = {
                a: 'ti',
                v: '3',
                d: {
                    wn: 'OpenHeaders — QA Environment',
                    ru: 'https://gitlab.openheaders.io/qa/headers.git',
                    b: 'workspace/qa',
                    cp: 'config/open-headers.json',
                    at: 'token',
                    in: 'qa-admin@openheaders.io',
                    desc: 'QA environment header configuration'
                }
            };

            const compressed = zlib.gzipSync(JSON.stringify(minified), { level: 9 });
            handler.handleUnifiedProtocol(compressed.toString('base64url'), 'gzip');

            expect(handler.pendingInvite).toEqual({
                workspaceName: 'OpenHeaders — QA Environment',
                repoUrl: 'https://gitlab.openheaders.io/qa/headers.git',
                branch: 'workspace/qa',
                configPath: 'config/open-headers.json',
                authType: 'token',
                inviterName: 'qa-admin@openheaders.io',
                description: 'QA environment header configuration'
            });
        });

        it('processes minified environment import with variables and schema', () => {
            const minified = {
                a: 'ei',
                v: '3',
                d: {
                    e: {
                        prod: {
                            GATEWAY_URL: { val: 'https://api.openheaders.io:8443/v2' },
                            AUTH_SECRET: { val: 'ohk_live_enterprise_key_here', s: 1 }
                        }
                    },
                    es: {
                        e: {
                            prod: {
                                v: [
                                    { n: 'GATEWAY_URL', s: 0 },
                                    { n: 'AUTH_SECRET', s: 1 }
                                ]
                            }
                        }
                    }
                }
            };

            const compressed = zlib.gzipSync(JSON.stringify(minified), { level: 9 });
            handler.handleUnifiedProtocol(compressed.toString('base64url'), 'gzip');

            expect(handler.pendingEnvironmentImport).toBeDefined();
            const envImport = handler.pendingEnvironmentImport as {
                environments: Record<string, Record<string, { value: string; isSecret?: boolean }>>;
                environmentSchema: { environments: Record<string, { variables: Array<{ name: string; isSecret: boolean }> }> }
            };
            expect(envImport.environments.production.GATEWAY_URL.value).toBe('https://api.openheaders.io:8443/v2');
            expect(envImport.environments.production.AUTH_SECRET.isSecret).toBe(true);
            expect(envImport.environmentSchema.environments.production.variables).toEqual([
                { name: 'GATEWAY_URL', isSecret: false },
                { name: 'AUTH_SECRET', isSecret: true }
            ]);
        });
    });

    describe('handleProtocolUrl — integration', () => {
        it('rejects invalid URL and does not set pending data', () => {
            handler.handleProtocolUrl('https://evil.com/steal');
            expect(handler.pendingInvite).toBeNull();
        });

        it('processes valid openheaders:// URL end-to-end', () => {
            const url = makeCompressedUrl(ENTERPRISE_INVITE);
            handler.handleProtocolUrl(url);
            expect(handler.pendingInvite).toEqual(ENTERPRISE_INVITE.data);
        });

        it('processes URL with g parameter for gzip compression', () => {
            const compressed = zlib.gzipSync(JSON.stringify(ENTERPRISE_INVITE), { level: 9 });
            const param = compressed.toString('base64url');
            const url = `openheaders://open?g=${param}`;

            handler.handleProtocolUrl(url);
            expect(handler.pendingInvite).toEqual(ENTERPRISE_INVITE.data);
        });

        it('processes URL with d parameter for deflate compression', () => {
            const compressed = zlib.deflateSync(JSON.stringify(ENTERPRISE_INVITE));
            const param = compressed.toString('base64url');
            const url = `openheaders://open?d=${param}`;

            handler.handleProtocolUrl(url);
            expect(handler.pendingInvite).toEqual(ENTERPRISE_INVITE.data);
        });

        it('handles URL with unicode in payload data', () => {
            const payload = {
                action: 'team-invite',
                version: DATA_FORMAT_VERSION,
                data: {
                    workspaceName: 'ÖpenHeaders — München Büro Konfiguration',
                    repoUrl: 'https://gitlab.openheaders.io/de/münchen-config.git',
                    inviterName: 'müller@openheaders.io'
                }
            };
            const url = makeCompressedUrl(payload);
            handler.handleProtocolUrl(url);
            expect(handler.pendingInvite!.workspaceName).toBe('ÖpenHeaders — München Büro Konfiguration');
        });
    });
});
