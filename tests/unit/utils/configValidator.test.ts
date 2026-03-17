import { describe, it, expect } from 'vitest';
import { analyzeConfigFile } from '../../../src/utils/configValidator';

describe('configValidator', () => {
    describe('analyzeConfigFile()', () => {
        describe('valid main config', () => {
            it('parses a full config with sources, rules, proxyRules', async () => {
                const config = {
                    sources: [{ id: 1, name: 'src1' }, { id: 2, name: 'src2' }],
                    rules: [{ id: 1, pattern: '*.js' }],
                    proxyRules: [{ id: 1, host: 'example.com' }],
                };
                const result = await analyzeConfigFile(JSON.stringify(config));

                expect(result.valid).toBe(true);
                if (result.valid) {
                    expect((result as any).hasSources).toBe(true);
                    expect((result as any).hasRules).toBe(true);
                    expect((result as any).hasProxyRules).toBe(true);
                    expect((result as any).sourceCount).toBe(2);
                    expect((result as any).ruleCount).toBe(1);
                    expect((result as any).proxyRuleCount).toBe(1);
                }
            });

            it('includes environment counts from environmentSchema', async () => {
                const config = {
                    sources: [],
                    rules: [],
                    environmentSchema: {
                        environments: { dev: {}, prod: {}, staging: {} },
                        variableDefinitions: { API_URL: {}, API_KEY: {} }
                    }
                };
                const result = await analyzeConfigFile(JSON.stringify(config));

                expect(result.valid).toBe(true);
                if (result.valid) {
                    expect((result as any).hasEnvironmentSchema).toBe(true);
                    expect((result as any).environmentCount).toBe(3);
                    expect((result as any).variableCount).toBe(2);
                }
            });

            it('includes environment counts from top-level environments', async () => {
                const config = {
                    sources: [],
                    environments: { dev: {}, prod: {} }
                };
                const result = await analyzeConfigFile(JSON.stringify(config));

                expect(result.valid).toBe(true);
                if (result.valid) {
                    expect((result as any).environmentCount).toBe(2);
                }
            });

            it('returns rawData in result', async () => {
                const config = { sources: [{ id: 1 }], rules: [] };
                const result = await analyzeConfigFile(JSON.stringify(config));

                expect(result.valid).toBe(true);
                if (result.valid) {
                    expect((result as any).rawData).toEqual(config);
                }
            });
        });

        describe('invalid content', () => {
            it('rejects non-JSON content', async () => {
                const result = await analyzeConfigFile('not json at all');
                expect(result.valid).toBe(false);
                if (!result.valid) {
                    expect(result.error).toBeDefined();
                }
            });

            it('rejects malformed JSON', async () => {
                const result = await analyzeConfigFile('{"unclosed": ');
                expect(result.valid).toBe(false);
            });
        });

        describe('environment file mode (isEnvFile=true)', () => {
            it('accepts valid environment-only data', async () => {
                const envData = {
                    environmentSchema: {
                        environments: { dev: {}, prod: {} },
                        variableDefinitions: { API_URL: {} }
                    }
                };
                const result = await analyzeConfigFile(JSON.stringify(envData), true);

                expect(result.valid).toBe(true);
                if (result.valid) {
                    expect((result as any).hasEnvironmentSchema).toBe(true);
                    expect((result as any).environmentCount).toBe(2);
                    expect((result as any).variableCount).toBe(1);
                }
            });

            it('accepts data with top-level environments', async () => {
                const envData = {
                    environments: { dev: {}, staging: {}, prod: {} }
                };
                const result = await analyzeConfigFile(JSON.stringify(envData), true);

                expect(result.valid).toBe(true);
                if (result.valid) {
                    expect((result as any).hasEnvironments).toBe(true);
                    expect((result as any).environmentCount).toBe(3);
                }
            });

            it('rejects file with rules (is actually main config)', async () => {
                const data = {
                    rules: [{ id: 1 }],
                    environments: { dev: {} }
                };
                const result = await analyzeConfigFile(JSON.stringify(data), true);

                expect(result.valid).toBe(false);
                if (!result.valid) {
                    expect(result.error).toContain('main configuration file');
                }
            });

            it('rejects file with sources', async () => {
                const data = {
                    sources: [{ id: 1 }],
                    environments: { dev: {} }
                };
                const result = await analyzeConfigFile(JSON.stringify(data), true);

                expect(result.valid).toBe(false);
                if (!result.valid) {
                    expect(result.error).toContain('main configuration file');
                }
            });

            it('rejects file with proxyRules', async () => {
                const data = {
                    proxyRules: [{ id: 1 }],
                    environments: { dev: {} }
                };
                const result = await analyzeConfigFile(JSON.stringify(data), true);

                expect(result.valid).toBe(false);
            });
        });

        describe('separate files mode (isSeparateMode=true)', () => {
            it('rejects environment-only data for main config area', async () => {
                const envOnlyData = {
                    environmentSchema: {
                        environments: { dev: {} },
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
                    sources: [{ id: 1 }],
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
                if (result.valid) {
                    expect((result as any).sourceCount).toBe(0);
                    expect((result as any).ruleCount).toBe(0);
                    expect((result as any).proxyRuleCount).toBe(0);
                }
            });

            it('handles missing variableDefinitions in environmentSchema', async () => {
                const config = {
                    sources: [],
                    environmentSchema: {
                        environments: { dev: {} }
                    }
                };
                const result = await analyzeConfigFile(JSON.stringify(config));

                expect(result.valid).toBe(true);
                if (result.valid) {
                    expect((result as any).variableCount).toBe(0);
                }
            });
        });
    });
});
