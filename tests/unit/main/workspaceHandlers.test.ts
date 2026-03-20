import { describe, it, expect } from 'vitest';
import { DATA_FORMAT_VERSION } from '../../../src/config/version';
import type { TeamWorkspaceInvite, Workspace, WorkspaceAuthData } from '../../../src/types/workspace';

/**
 * Tests for pure logic extracted from WorkspaceHandlers.
 *
 * We test data-transformation and validation logic directly rather than
 * importing the full handler (which pulls in Electron IPC, proxy, etc.).
 */

// ---------- generateInviteId ----------
// Mirrors WorkspaceHandlers.generateInviteId()
function generateInviteId(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(8).toString('hex');
}

// ---------- buildInviteData ----------
// Mirrors the invite-data construction inside handleGenerateTeamWorkspaceInvite
interface InviteInput extends Partial<Workspace> {
    includeAuthData?: boolean;
}

function buildInviteData(
    workspaceData: InviteInput,
    inviterName: string,
    inviteId: string
): TeamWorkspaceInvite {
    const inviteData: TeamWorkspaceInvite = {
        version: DATA_FORMAT_VERSION,
        workspaceName: workspaceData.name || '',
        description: workspaceData.description,
        repoUrl: workspaceData.gitUrl || '',
        branch: workspaceData.gitBranch || 'main',
        configPath: workspaceData.gitPath || 'config/open-headers.json',
        authType: workspaceData.authType || 'none',
        inviterName,
        inviteId,
        createdAt: new Date().toISOString()
    };

    if (workspaceData.includeAuthData && workspaceData.authData) {
        inviteData.authData = workspaceData.authData;
    }

    return inviteData;
}

// ---------- buildInviteLinks ----------
function buildInviteLinks(payload: TeamWorkspaceInvite): { appLink: string; webLink: string } {
    const zlib = require('zlib');
    const payloadJson = JSON.stringify(payload);
    const compressed = zlib.gzipSync(payloadJson, { level: 9 });
    const payloadParam = compressed.toString('base64url');

    return {
        appLink: `openheaders://open?payload=${payloadParam}`,
        webLink: `https://openheaders.io/join?payload=${payloadParam}`
    };
}

// ---------- buildEnvConfigData ----------
// Mirrors the environment data builder inside handleGenerateEnvironmentConfigLink

interface EnvVarData { value?: string; isSecret?: boolean }
interface EnvSchemaVariable { name: string; isSecret?: boolean }
interface EnvSchemaEnv { variables: EnvSchemaVariable[] }
interface EnvSchema { environments: Record<string, EnvSchemaEnv> }

interface EnvironmentInput {
    environmentSchema?: EnvSchema;
    environments?: Record<string, Record<string, EnvVarData>>;
    includeValues?: boolean;
}

interface EnvConfigOutput {
    version: string;
    environmentSchema?: EnvSchema;
    environments?: Record<string, Record<string, { value?: string; isSecret?: boolean }>>;
}

function buildEnvConfigData(environmentData: EnvironmentInput): EnvConfigOutput {
    const envConfigData: EnvConfigOutput = {
        version: DATA_FORMAT_VERSION
    };

    if (environmentData.environmentSchema) {
        envConfigData.environmentSchema = environmentData.environmentSchema;
    }

    if (environmentData.environments) {
        if (environmentData.includeValues) {
            envConfigData.environments = {};
            Object.entries(environmentData.environments).forEach(([envName, vars]) => {
                envConfigData.environments![envName] = {};
                Object.entries(vars).forEach(([varName, varData]) => {
                    envConfigData.environments![envName][varName] = {
                        value: varData.value,
                        ...(varData.isSecret && { isSecret: varData.isSecret })
                    };
                });
            });
        } else {
            envConfigData.environmentSchema = envConfigData.environmentSchema || { environments: {} };

            Object.entries(environmentData.environments).forEach(([envName, vars]) => {
                if (!envConfigData.environmentSchema!.environments[envName]) {
                    envConfigData.environmentSchema!.environments[envName] = { variables: [] };
                }

                Object.entries(vars).forEach(([varName, varData]) => {
                    const existingVar = envConfigData.environmentSchema!.environments[envName].variables
                        .find((v) => v.name === varName);

                    if (!existingVar) {
                        envConfigData.environmentSchema!.environments[envName].variables.push({
                            name: varName,
                            isSecret: varData.isSecret || false
                        });
                    }
                });
            });
        }
    }

    return envConfigData;
}

// ---------- needsInitialSync logic ----------
function determineNeedsInitialSync(data: string | null): boolean {
    if (data === null) return true; // file missing
    if (!data || data.trim() === '[]' || data.trim() === '') return true;
    return false;
}

// ---------- workspace path construction ----------
function buildWorkspacePath(userDataPath: string, workspaceId: string): string {
    const path = require('path');
    return path.join(userDataPath, 'workspaces', workspaceId);
}

// ---------- default WebSocket status shape ----------
interface WsStatus {
    totalConnections: number;
    browserCounts: Record<string, number>;
    clients: { id: string; browser: string; browserVersion: string; platform: string; connectionType: string; connectedAt: number; lastActivity: number; extensionVersion: string }[];
    wsServerRunning: boolean;
    wssServerRunning: boolean;
    wsPort: number;
    wssPort: number;
    certificateFingerprint: string | null;
    certificatePath: string | null;
    certificateExpiry: string | null;
    certificateSubject: string | null;
}

function defaultWsStatus(): WsStatus {
    return {
        totalConnections: 0,
        browserCounts: {},
        clients: [],
        wsServerRunning: false,
        wssServerRunning: false,
        wsPort: 59210,
        wssPort: 59211,
        certificateFingerprint: null,
        certificatePath: null,
        certificateExpiry: null,
        certificateSubject: null
    };
}

// ==================== Tests ====================

describe('WorkspaceHandlers — pure logic', () => {
    describe('generateInviteId()', () => {
        it('produces a 16-char hex string', () => {
            const id = generateInviteId();
            expect(id).toMatch(/^[0-9a-f]{16}$/);
        });

        it('produces unique IDs on successive calls', () => {
            const ids = new Set(Array.from({ length: 20 }, () => generateInviteId()));
            expect(ids.size).toBe(20);
        });
    });

    describe('buildInviteData()', () => {
        it('populates required fields', () => {
            const result = buildInviteData(
                { name: 'Team A', description: 'Desc', gitUrl: 'https://github.com/org/repo', authType: 'token' },
                'Alice',
                'abc123'
            );
            expect(result.version).toBe(DATA_FORMAT_VERSION);
            expect(result.workspaceName).toBe('Team A');
            expect(result.description).toBe('Desc');
            expect(result.repoUrl).toBe('https://github.com/org/repo');
            expect(result.authType).toBe('token');
            expect(result.inviterName).toBe('Alice');
            expect(result.inviteId).toBe('abc123');
            expect(result.createdAt).toBeDefined();
        });

        it('defaults branch to "main"', () => {
            const result = buildInviteData({ name: 'W', gitUrl: 'u' }, 'Bob', 'id');
            expect(result.branch).toBe('main');
        });

        it('defaults configPath to "config/open-headers.json"', () => {
            const result = buildInviteData({ name: 'W', gitUrl: 'u' }, 'Bob', 'id');
            expect(result.configPath).toBe('config/open-headers.json');
        });

        it('respects custom branch and path', () => {
            const result = buildInviteData(
                { name: 'W', gitUrl: 'u', gitBranch: 'dev', gitPath: 'custom/path.json' },
                'Bob',
                'id'
            );
            expect(result.branch).toBe('dev');
            expect(result.configPath).toBe('custom/path.json');
        });

        it('includes authData only when includeAuthData is true', () => {
            const without = buildInviteData(
                { name: 'W', gitUrl: 'u', authData: { token: 'secret' } },
                'Bob',
                'id'
            );
            expect(without.authData).toBeUndefined();

            const withAuth = buildInviteData(
                { name: 'W', gitUrl: 'u', includeAuthData: true, authData: { token: 'secret' } },
                'Bob',
                'id'
            );
            expect(withAuth.authData).toEqual({ token: 'secret' });
        });

        it('does not include authData when includeAuthData is true but authData is missing', () => {
            const result = buildInviteData(
                { name: 'W', gitUrl: 'u', includeAuthData: true },
                'Bob',
                'id'
            );
            expect(result.authData).toBeUndefined();
        });
    });

    describe('buildInviteLinks()', () => {
        it('generates app and web links containing the compressed payload', () => {
            const payload = { action: 'team-invite', version: DATA_FORMAT_VERSION, data: { test: true } };
            const links = buildInviteLinks(payload);
            expect(links.appLink).toMatch(/^openheaders:\/\/open\?payload=/);
            expect(links.webLink).toMatch(/^https:\/\/openheaders\.io\/join\?payload=/);
        });

        it('payload is decompressible back to original JSON', () => {
            const zlib = require('zlib');
            const payload = { action: 'team-invite', version: DATA_FORMAT_VERSION, data: { name: 'Team' } };
            const links = buildInviteLinks(payload);
            const encoded = links.appLink.split('payload=')[1];
            const decompressed = zlib.gunzipSync(Buffer.from(encoded, 'base64url')).toString('utf8');
            expect(JSON.parse(decompressed)).toEqual(payload);
        });
    });

    describe('buildEnvConfigData()', () => {
        it('sets version from DATA_FORMAT_VERSION', () => {
            const result = buildEnvConfigData({});
            expect(result.version).toBe(DATA_FORMAT_VERSION);
        });

        it('copies environmentSchema when present', () => {
            const schema = { environments: { dev: { variables: [] } } };
            const result = buildEnvConfigData({ environmentSchema: schema });
            expect(result.environmentSchema).toEqual(schema);
        });

        it('includes values when includeValues is true', () => {
            const envData = {
                includeValues: true,
                environments: {
                    production: {
                        API_KEY: { value: 'key123', isSecret: true, updatedAt: '2025-01-01' },
                        BASE_URL: { value: 'https://api.com', updatedAt: '2025-01-01' }
                    }
                }
            };
            const result = buildEnvConfigData(envData);
            expect(result.environments!.production.API_KEY).toEqual({ value: 'key123', isSecret: true });
            expect(result.environments!.production.BASE_URL).toEqual({ value: 'https://api.com' });
            // updatedAt should be stripped
            expect((result.environments!.production.API_KEY as Record<string, unknown>).updatedAt).toBeUndefined();
        });

        it('extracts schema when includeValues is false', () => {
            const envData = {
                includeValues: false,
                environments: {
                    staging: {
                        DB_HOST: { value: 'host', isSecret: false },
                        DB_PASS: { value: 'pass', isSecret: true }
                    }
                }
            };
            const result = buildEnvConfigData(envData);
            expect(result.environments).toBeUndefined();
            expect(result.environmentSchema!.environments.staging.variables).toEqual([
                { name: 'DB_HOST', isSecret: false },
                { name: 'DB_PASS', isSecret: true }
            ]);
        });

        it('does not duplicate variables in schema extraction', () => {
            const envData = {
                includeValues: false,
                environmentSchema: {
                    environments: {
                        dev: { variables: [{ name: 'EXISTING', isSecret: false }] }
                    }
                },
                environments: {
                    dev: {
                        EXISTING: { value: 'v', isSecret: false },
                        NEW_VAR: { value: 'v2', isSecret: true }
                    }
                }
            };
            const result = buildEnvConfigData(envData);
            const devVars = result.environmentSchema!.environments.dev.variables;
            const existingCount = devVars.filter((v) => v.name === 'EXISTING').length;
            expect(existingCount).toBe(1);
            expect(devVars).toHaveLength(2);
        });
    });

    describe('determineNeedsInitialSync()', () => {
        it('returns true when data is null (file missing)', () => {
            expect(determineNeedsInitialSync(null)).toBe(true);
        });

        it('returns true for empty string', () => {
            expect(determineNeedsInitialSync('')).toBe(true);
        });

        it('returns true for empty array "[]"', () => {
            expect(determineNeedsInitialSync('[]')).toBe(true);
        });

        it('returns true for whitespace-only', () => {
            expect(determineNeedsInitialSync('   ')).toBe(true);
        });

        it('returns false for non-empty JSON array', () => {
            expect(determineNeedsInitialSync('[{"id":"1"}]')).toBe(false);
        });

        it('returns false for any meaningful content', () => {
            expect(determineNeedsInitialSync('some content')).toBe(false);
        });
    });

    describe('buildWorkspacePath()', () => {
        it('joins userData, "workspaces", and workspaceId', () => {
            const result = buildWorkspacePath('/home/user/.config/app', 'ws-123');
            expect(result).toMatch(/workspaces/);
            expect(result).toMatch(/ws-123/);
            expect(result).toBe('/home/user/.config/app/workspaces/ws-123');
        });
    });

    describe('defaultWsStatus()', () => {
        it('returns zero connections', () => {
            const status = defaultWsStatus();
            expect(status.totalConnections).toBe(0);
            expect(status.clients).toEqual([]);
        });

        it('returns expected default ports', () => {
            const status = defaultWsStatus();
            expect(status.wsPort).toBe(59210);
            expect(status.wssPort).toBe(59211);
        });

        it('returns null certificate fields', () => {
            const status = defaultWsStatus();
            expect(status.certificateFingerprint).toBeNull();
            expect(status.certificatePath).toBeNull();
            expect(status.certificateExpiry).toBeNull();
            expect(status.certificateSubject).toBeNull();
        });

        it('has servers not running', () => {
            const status = defaultWsStatus();
            expect(status.wsServerRunning).toBe(false);
            expect(status.wssServerRunning).toBe(false);
        });
    });
});
