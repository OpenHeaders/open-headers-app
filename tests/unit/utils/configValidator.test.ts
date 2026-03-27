import { describe, it, expect } from 'vitest';
import { analyzeConfigFile } from '../../../src/utils/configValidator';
import type { MainAnalysisResult, EnvAnalysisResult } from '../../../src/utils/configValidator';

// Enterprise config factory
function makeEnterpriseConfig() {
    return {
        sources: [
            { id: 'src-a1b2c3d4-e5f6-7890-abcd-ef1234567890', name: 'Production API Gateway Token' },
            { id: 'src-b2c3d4e5-f6a7-8901-bcde-f12345678901', name: 'Staging OAuth2 Client Credentials' }
        ],
        rules: [
            { id: 'rule-c3d4e5f6-a7b8-9012-cdef-123456789012', name: 'Add OAuth2 Bearer Token (prod)' },
            { id: 'rule-d4e5f6a7-b8c9-0123-defa-234567890123', name: 'Inject X-Correlation-ID' }
        ],
        proxyRules: [
            { id: 'pr-e5f6a7b8-c9d0-1234-efab-345678901234', host: '*.openheaders.io' }
        ],
        environmentSchema: {
            environments: {
                development: {},
                staging: {},
                'pre-production': {},
                production: {},
                'disaster-recovery': {}
            },
            variableDefinitions: {
                API_URL: { description: 'API base URL', isSecret: false, usedIn: ['rules'], example: 'https://api.openheaders.io' },
                API_KEY: { description: 'API key for auth', isSecret: true, usedIn: ['sources'] },
                OAUTH_CLIENT_ID: { description: 'OAuth2 client ID', isSecret: false, usedIn: ['sources'] }
            }
        }
    };
}

describe('configValidator', () => {
    describe('analyzeConfigFile()', () => {
        describe('valid main config', () => {
            it('parses enterprise config with full counts', async () => {
                const config = makeEnterpriseConfig();
                const result = await analyzeConfigFile(JSON.stringify(config));

                expect(result.valid).toBe(true);
                if (result.valid && result.kind === 'main') {
                    const mainResult = result as MainAnalysisResult;
                    expect(mainResult.kind).toBe('main');
                    expect(mainResult.hasSources).toBe(true);
                    expect(mainResult.hasRules).toBe(true);
                    expect(mainResult.hasProxyRules).toBe(true);
                    expect(mainResult.hasEnvironmentSchema).toBe(true);
                    expect(mainResult.sourceCount).toBe(2);
                    expect(mainResult.ruleCount).toBe(2);
                    expect(mainResult.proxyRuleCount).toBe(1);
                    expect(mainResult.environmentCount).toBe(5);
                    expect(mainResult.variableCount).toBe(3);
                    expect(mainResult.rawData).toEqual(config);
                }
            });

            it('includes environment counts from top-level environments', async () => {
                const config = {
                    sources: [],
                    environments: {
                        development: {},
                        staging: {},
                        production: {}
                    }
                };
                const result = await analyzeConfigFile(JSON.stringify(config));

                expect(result.valid).toBe(true);
                if (result.valid && result.kind === 'main') {
                    expect(result.environmentCount).toBe(3);
                }
            });

            it('returns rawData in result', async () => {
                const config = { sources: [{ id: 'src-a1b2c3d4' }], rules: [] };
                const result = await analyzeConfigFile(JSON.stringify(config));

                expect(result.valid).toBe(true);
                if (result.valid && result.kind === 'main') {
                    expect(result.rawData).toEqual(config);
                }
            });
        });

        describe('invalid content', () => {
            it('rejects non-JSON content', async () => {
                const result = await analyzeConfigFile('not json at all — corrupted workspace file');
                expect(result.valid).toBe(false);
                if (!result.valid) {
                    expect(result.error).toBeDefined();
                }
            });

            it('rejects malformed JSON (truncated)', async () => {
                const result = await analyzeConfigFile('{"sources": [{"id": "a1b2c3d4');
                expect(result.valid).toBe(false);
            });

            it('rejects empty string', async () => {
                const result = await analyzeConfigFile('');
                expect(result.valid).toBe(false);
            });
        });

        describe('environment file mode (isEnvFile=true)', () => {
            it('accepts valid environment-only data', async () => {
                const envData = {
                    environmentSchema: {
                        environments: {
                            development: {},
                            staging: {},
                            production: {}
                        },
                        variableDefinitions: {
                            API_URL: { description: 'API URL', isSecret: false, usedIn: ['rules'] }
                        }
                    }
                };
                const result = await analyzeConfigFile(JSON.stringify(envData), true);

                expect(result.valid).toBe(true);
                if (result.valid && result.kind === 'env') {
                    const envResult = result as EnvAnalysisResult;
                    expect(envResult.kind).toBe('env');
                    expect(envResult.hasEnvironmentSchema).toBe(true);
                    expect(envResult.environmentCount).toBe(3);
                    expect(envResult.variableCount).toBe(1);
                }
            });

            it('accepts data with top-level environments', async () => {
                const envData = {
                    environments: {
                        development: {},
                        staging: {},
                        'pre-production': {},
                        production: {}
                    }
                };
                const result = await analyzeConfigFile(JSON.stringify(envData), true);

                expect(result.valid).toBe(true);
                if (result.valid && result.kind === 'env') {
                    expect(result.hasEnvironments).toBe(true);
                    expect(result.environmentCount).toBe(4);
                }
            });

            it('rejects file with rules (is actually main config)', async () => {
                const data = {
                    rules: [{ id: 'rule-a1b2c3d4', name: 'OAuth2 Bearer Token' }],
                    environments: { development: {} }
                };
                const result = await analyzeConfigFile(JSON.stringify(data), true);

                expect(result.valid).toBe(false);
                if (!result.valid) {
                    expect(result.error).toContain('main configuration file');
                }
            });

            it('rejects file with sources', async () => {
                const data = {
                    sources: [{ id: 'src-a1b2c3d4', name: 'API Token Source' }],
                    environments: { development: {} }
                };
                const result = await analyzeConfigFile(JSON.stringify(data), true);

                expect(result.valid).toBe(false);
                if (!result.valid) {
                    expect(result.error).toContain('main configuration file');
                }
            });

            it('rejects file with proxyRules', async () => {
                const data = {
                    proxyRules: [{ id: 'pr-a1b2c3d4' }],
                    environments: { development: {} }
                };
                const result = await analyzeConfigFile(JSON.stringify(data), true);
                expect(result.valid).toBe(false);
            });
        });

        describe('separate files mode (isSeparateMode=true)', () => {
            it('rejects environment-only data for main config area', async () => {
                const envOnlyData = {
                    environmentSchema: {
                        environments: { development: {} },
                        variableDefinitions: { API_URL: {} }
                    }
                };
                const result = await analyzeConfigFile(JSON.stringify(envOnlyData), false, true);

                expect(result.valid).toBe(false);
                if (!result.valid) {
                    expect(result.error).toContain('environment-only file');
                }
            });

            it('accepts config with sources in separate mode', async () => {
                const config = {
                    sources: [{ id: 'src-a1b2c3d4', name: 'Production Token Source' }],
                    rules: [],
                };
                const result = await analyzeConfigFile(JSON.stringify(config), false, true);
                expect(result.valid).toBe(true);
            });
        });

        describe('edge cases', () => {
            it('handles empty object', async () => {
                const result = await analyzeConfigFile('{}');
                expect(result.valid).toBe(true);
            });

            it('handles config with zero-length arrays', async () => {
                const config = { sources: [], rules: [], proxyRules: [] };
                const result = await analyzeConfigFile(JSON.stringify(config));

                expect(result.valid).toBe(true);
                if (result.valid && result.kind === 'main') {
                    expect(result.sourceCount).toBe(0);
                    expect(result.ruleCount).toBe(0);
                    expect(result.proxyRuleCount).toBe(0);
                }
            });

            it('handles missing variableDefinitions in environmentSchema', async () => {
                const config = {
                    sources: [],
                    environmentSchema: {
                        environments: { development: {} }
                    }
                };
                const result = await analyzeConfigFile(JSON.stringify(config));

                expect(result.valid).toBe(true);
                if (result.valid && result.kind === 'main') {
                    expect(result.variableCount).toBe(0);
                }
            });

            it('handles rules as record (grouped by category)', async () => {
                const config = {
                    sources: [],
                    rules: {
                        'header-rules': [
                            { id: 'rule-1', name: 'Auth Header' },
                            { id: 'rule-2', name: 'CORS Header' }
                        ],
                        'response-rules': [
                            { id: 'rule-3', name: 'Cache Control' }
                        ]
                    }
                };
                const result = await analyzeConfigFile(JSON.stringify(config));

                expect(result.valid).toBe(true);
                if (result.valid && result.kind === 'main') {
                    expect(result.ruleCount).toBe(3);
                }
            });

            it('handles large config with many sources', async () => {
                const config = {
                    sources: Array.from({ length: 50 }, (_, i) => ({
                        id: `src-${String(i).padStart(8, '0')}-e5f6-7890-abcd-ef1234567890`,
                        name: `Enterprise Source ${i + 1}`
                    })),
                    rules: [],
                    proxyRules: []
                };
                const result = await analyzeConfigFile(JSON.stringify(config));

                expect(result.valid).toBe(true);
                if (result.valid && result.kind === 'main') {
                    expect(result.sourceCount).toBe(50);
                }
            });
        });
    });
});
