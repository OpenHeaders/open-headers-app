import { describe, expect, it, vi } from 'vitest';

// Mock the logger
vi.mock('@/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { analyzeConfigFile, validateGitWorkspaceConfig, readAndValidateMultiFileConfig } = await import(
  '../../../../src/renderer/utils/validation/configValidator'
);

// ======================================================================
// analyzeConfigFile — main config
// ======================================================================
describe('analyzeConfigFile (main config)', () => {
  it('parses a valid config with sources and rules', async () => {
    const config = {
      version: '3.0.0',
      sources: [{ sourceId: 's1', sourceType: 'http', sourcePath: '/api' }],
      rules: {
        header: [
          { id: '1', headerName: 'X-Test', headerValue: 'val' },
          { id: '2', headerName: 'X-Other', headerValue: 'val2' },
        ],
      },
    };

    const result = await analyzeConfigFile(JSON.stringify(config));
    expect(result.valid).toBe(true);
    expect(result.version).toBe('3.0.0');
    expect(result.sourceCount).toBe(1);
    expect(result.ruleCount).toBe(2);
    expect(result.ruleBreakdown.header).toBe(2);
  });

  it('parses config with proxy rules', async () => {
    const config = {
      proxyRules: [
        {
          isDynamic: false,
          domains: ['example.com'],
          headerName: 'X-Proxy',
          headerValue: 'val',
        },
      ],
    };
    const result = await analyzeConfigFile(JSON.stringify(config));
    expect(result.valid).toBe(true);
    expect(result.proxyRuleCount).toBe(1);
  });

  it('parses config with environment data', async () => {
    const config = {
      environmentSchema: {
        variableDefinitions: { API_KEY: { type: 'string' } },
      },
      environments: { prod: { API_KEY: 'key123' } },
    };
    const result = await analyzeConfigFile(JSON.stringify(config));
    expect(result.valid).toBe(true);
    expect(result.hasEnvironmentSchema).toBe(true);
    expect(result.variableCount).toBe(1);
    expect(result.environmentCount).toBe(1);
  });

  it('parses config with workspace', async () => {
    const config = {
      workspace: { type: 'git', gitUrl: 'https://example.com', name: 'test' },
      sources: [{ sourceId: 's1', sourceType: 'http', sourcePath: '/api' }],
    };
    const result = await analyzeConfigFile(JSON.stringify(config));
    expect(result.valid).toBe(true);
    expect(result.hasWorkspace).toBe(true);
    expect(result.workspaceInfo).toBeTruthy();
  });

  it('throws for invalid JSON', async () => {
    await expect(analyzeConfigFile('not json')).rejects.toThrow('Invalid file format');
  });

  it('throws for invalid source type', async () => {
    const config = {
      sources: [{ sourceId: 's1', sourceType: 'invalid', sourcePath: '/api' }],
    };
    await expect(analyzeConfigFile(JSON.stringify(config))).rejects.toThrow('Invalid file format');
  });

  it('throws for source missing required fields', async () => {
    const config = {
      sources: [{ sourceId: 's1' }],
    };
    await expect(analyzeConfigFile(JSON.stringify(config))).rejects.toThrow('Invalid file format');
  });

  it('throws for rules that is not an object', async () => {
    const config = { rules: 'invalid' };
    await expect(analyzeConfigFile(JSON.stringify(config))).rejects.toThrow('Invalid file format');
  });

  it('throws for rules with non-array rule type', async () => {
    const config = { rules: { header: 'not-an-array' } };
    await expect(analyzeConfigFile(JSON.stringify(config))).rejects.toThrow('Invalid file format');
  });

  it('throws for proxyRules that is not an array', async () => {
    const config = { proxyRules: 'invalid' };
    await expect(analyzeConfigFile(JSON.stringify(config))).rejects.toThrow('Invalid file format');
  });

  it('throws for sources that is not an array', async () => {
    const config = { sources: 'invalid' };
    await expect(analyzeConfigFile(JSON.stringify(config))).rejects.toThrow('Invalid file format');
  });
});

// ======================================================================
// analyzeConfigFile — env file
// ======================================================================
describe('analyzeConfigFile (env file)', () => {
  it('parses a valid env file', async () => {
    const envConfig = {
      environmentSchema: {
        variableDefinitions: { TOKEN: { type: 'string' } },
      },
      environments: { dev: { TOKEN: 'abc' }, prod: { TOKEN: 'xyz' } },
    };
    const result = await analyzeConfigFile(JSON.stringify(envConfig), true);
    expect(result.valid).toBe(true);
    expect(result.environmentCount).toBe(2);
    expect(result.variableCount).toBe(1);
  });

  it('rejects env file that contains rules', async () => {
    const config = {
      rules: { header: [] },
      environmentSchema: {},
    };
    await expect(analyzeConfigFile(JSON.stringify(config), true)).rejects.toThrow('Invalid file format');
  });

  it('rejects env file that contains sources', async () => {
    const config = {
      sources: [],
      environmentSchema: {},
    };
    await expect(analyzeConfigFile(JSON.stringify(config), true)).rejects.toThrow('Invalid file format');
  });
});

// ======================================================================
// analyzeConfigFile — separate mode
// ======================================================================
describe('analyzeConfigFile (separate mode)', () => {
  it('rejects env-only file in main config area', async () => {
    const config = {
      environmentSchema: { variableDefinitions: {} },
      environments: { dev: {} },
    };
    await expect(analyzeConfigFile(JSON.stringify(config), false, true)).rejects.toThrow('environment-only file');
  });
});

// ======================================================================
// validateGitWorkspaceConfig
// ======================================================================
describe('validateGitWorkspaceConfig', () => {
  it('succeeds for config with data', async () => {
    const config = {
      sources: [{ sourceId: 's1', sourceType: 'http', sourcePath: '/api' }],
    };
    const result = await validateGitWorkspaceConfig(JSON.stringify(config), 'config.json');
    expect(result.success).toBe(true);
    expect(result.summary!.sources).toBe(1);
  });

  it('fails for empty config', async () => {
    const config = {};
    const result = await validateGitWorkspaceConfig(JSON.stringify(config), 'config.json');
    expect(result.success).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('fails for invalid JSON', async () => {
    const result = await validateGitWorkspaceConfig('not json', 'config.json');
    expect(result.success).toBe(false);
  });

  it('returns details for valid config', async () => {
    const config = {
      rules: { header: [{ id: '1' }] },
    };
    const result = await validateGitWorkspaceConfig(JSON.stringify(config), 'config.json');
    expect(result.success).toBe(true);
    expect(result.details).toBeTruthy();
  });
});

// ======================================================================
// Workspace validation (validateConfigStructure edge cases)
// ======================================================================
describe('validateConfigStructure (via analyzeConfigFile)', () => {
  it('validates git workspace requires gitUrl', async () => {
    const config = {
      workspace: { type: 'git', name: 'test' },
      sources: [{ sourceId: 's1', sourceType: 'http', sourcePath: '/api' }],
    };
    await expect(analyzeConfigFile(JSON.stringify(config))).rejects.toThrow('Invalid file format');
  });

  it('validates git workspace requires name', async () => {
    const config = {
      workspace: { type: 'git', gitUrl: 'https://example.com' },
      sources: [{ sourceId: 's1', sourceType: 'http', sourcePath: '/api' }],
    };
    await expect(analyzeConfigFile(JSON.stringify(config))).rejects.toThrow('Invalid file format');
  });

  it('validates environments must be object', async () => {
    const config = { environments: 'invalid' };
    await expect(analyzeConfigFile(JSON.stringify(config))).rejects.toThrow('Invalid file format');
  });

  it('validates environmentSchema must be object', async () => {
    const config = { environmentSchema: 'invalid' };
    await expect(analyzeConfigFile(JSON.stringify(config))).rejects.toThrow('Invalid file format');
  });

  it('validates dynamic proxy rule requires headerRuleId', async () => {
    const config = {
      proxyRules: [{ isDynamic: true }],
    };
    await expect(analyzeConfigFile(JSON.stringify(config))).rejects.toThrow('Invalid file format');
  });

  it('validates static proxy rule requires headerName', async () => {
    const config = {
      proxyRules: [{ isDynamic: false, domains: ['example.com'] }],
    };
    await expect(analyzeConfigFile(JSON.stringify(config))).rejects.toThrow('Invalid file format');
  });
});

// ======================================================================
// readAndValidateMultiFileConfig
// ======================================================================
describe('readAndValidateMultiFileConfig', () => {
  it('returns failure when no config files found', async () => {
    const readFile = vi.fn().mockRejectedValue(new Error('not found'));
    const result = await readAndValidateMultiFileConfig(readFile, '/base');
    expect(result.success).toBe(false);
    expect(result.error).toContain('No valid configuration files');
  });

  it('reads and merges main + env files', async () => {
    const mainConfig = {
      sources: [{ sourceId: 's1', sourceType: 'http', sourcePath: '/a' }],
    };
    const envConfig = {
      environmentSchema: {
        variableDefinitions: { TOKEN: { type: 'string' } },
      },
      environments: { dev: { TOKEN: 'abc' } },
    };

    const readFile = vi.fn().mockImplementation(async (path, opts) => {
      if (opts?.list) {
        return ['open-headers-config.json', 'open-headers-env.json'];
      }
      if (path.includes('open-headers-config.json')) {
        return JSON.stringify(mainConfig);
      }
      if (path.includes('open-headers-env.json')) {
        return JSON.stringify(envConfig);
      }
      throw new Error('not found');
    });

    const result = await readAndValidateMultiFileConfig(readFile, '/base');
    expect(result.success).toBe(true);
    expect(result.config!.sources).toHaveLength(1);
    expect(result.config!.environmentSchema).toBeTruthy();
    expect(result.config!.environments).toBeTruthy();
  });
});
