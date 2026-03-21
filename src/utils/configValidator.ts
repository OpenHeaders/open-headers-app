/**
 * Configuration File Validator
 *
 * Shared validation logic for Open Headers configuration files
 * Used by Import modal and Git workspace validation
 * This is a shared utility that can be used by both main and renderer processes
 */

function errMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

interface LoggerLike {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

// Console-based fallback logger
const consoleLog: LoggerLike = {
  debug: (...args: unknown[]) => console.debug('[ConfigValidator]', ...args),
  info: (...args: unknown[]) => console.info('[ConfigValidator]', ...args),
  warn: (...args: unknown[]) => console.warn('[ConfigValidator]', ...args),
  error: (...args: unknown[]) => console.error('[ConfigValidator]', ...args)
};

// Lazy-initialized logger — resolves on first use
let _log: LoggerLike | null = null;
const getLog = (): LoggerLike => {
  if (_log) return _log;
  try {
    _log = consoleLog;
  } catch {
    _log = consoleLog;
  }
  return _log;
};

// Proxy that lazily resolves the logger
const log: LoggerLike = {
  debug: (...args: unknown[]) => getLog().debug(...args),
  info: (...args: unknown[]) => getLog().info(...args),
  warn: (...args: unknown[]) => getLog().warn(...args),
  error: (...args: unknown[]) => getLog().error(...args),
};

import type { EnvironmentMap } from '../types/environment';
import type { EnvironmentSchema } from '../types/environment';
import type { Source } from '../types/source';
import type { ProxyRule } from '../types/proxy';

interface ConfigData {
  version?: string;
  environments?: EnvironmentMap;
  environmentSchema?: EnvironmentSchema & { variableDefinitions?: Record<string, { description: string; isSecret: boolean; usedIn: string[]; example?: string }> };
  rules?: Array<{ id: string; name?: string }> | Record<string, Array<{ id: string; name?: string }>>;
  sources?: Source[];
  proxyRules?: ProxyRule[];
  workspace?: { name?: string; type?: string; gitUrl?: string };
  // Legacy/workspace-specific fields used by ConfigFileDetector
  workspaceId?: string;
  workspaceName?: string;
  headers?: Array<{ name: string; value: string }>;
  proxy?: { port?: number; rules?: ProxyRule[] };
}

interface EnvAnalysisResult {
  kind: 'env';
  valid: true;
  hasEnvironmentSchema: boolean;
  hasEnvironments: boolean;
  environmentCount: number;
  variableCount: number;
  rawData: ConfigData;
}

interface MainAnalysisResult {
  kind: 'main';
  valid: true;
  hasEnvironmentSchema: boolean;
  hasEnvironments: boolean;
  hasRules: boolean;
  hasSources: boolean;
  hasProxyRules: boolean;
  ruleCount: number;
  sourceCount: number;
  proxyRuleCount: number;
  environmentCount: number;
  variableCount: number;
  rawData: ConfigData;
}

interface AnalysisError {
  valid: false;
  error: string;
}

type AnalysisResult = EnvAnalysisResult | MainAnalysisResult | AnalysisError;


interface ValidationSummary {
  sources: number;
  rules: number;
  proxyRules: number;
  environments: number;
  variables: number;
  isMultiFile: boolean;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  configFile?: AnalysisResult;
  envFile?: AnalysisResult | null;
  summary?: ValidationSummary;
}

/**
 * Helper function to calculate environment count
 */
function calculateEnvironmentCount(data: ConfigData): number {
  return data.environments ? Object.keys(data.environments).length :
         (data.environmentSchema?.environments ? Object.keys(data.environmentSchema.environments).length : 0);
}

/**
 * Helper function to calculate variable count
 */
function calculateVariableCount(data: ConfigData): number {
  return data.environmentSchema ? Object.keys(data.environmentSchema.variableDefinitions || {}).length : 0;
}

/**
 * Analyze and validate Open Headers configuration file content
 */
async function analyzeConfigFile(content: string, isEnvFile: boolean = false, isSeparateMode: boolean = false): Promise<AnalysisResult> {
  try {
    const data: ConfigData = JSON.parse(content);

    if (isEnvFile) {
      // Environment file should only contain environment data
      const hasOtherData = data.rules || data.sources || data.proxyRules;
      if (hasOtherData) {
        return {
          valid: false,
          error: 'This appears to be a main configuration file with sources/rules/proxy rules. Please use the main configuration file upload area for this file.'
        };
      }

      return {
        kind: 'env',
        valid: true,
        hasEnvironmentSchema: !!data.environmentSchema,
        hasEnvironments: !!data.environments,
        environmentCount: calculateEnvironmentCount(data),
        variableCount: calculateVariableCount(data),
        rawData: data
      };
    }

    // For main config file in separate mode, check if it's environment-only
    const hasOnlyEnvData = !data.sources && !data.rules && !data.proxyRules &&
                           (data.environmentSchema || data.environments);

    // In separate files mode, reject environment-only files for main config area
    if (isSeparateMode && hasOnlyEnvData) {
      return {
        valid: false,
        error: 'This appears to be an environment-only file. Please use the environment file upload area for environment files.'
      };
    }

    return {
      kind: 'main',
      valid: true,
      hasEnvironmentSchema: !!data.environmentSchema,
      hasEnvironments: !!data.environments,
      hasRules: !!data.rules,
      hasSources: !!data.sources,
      hasProxyRules: !!data.proxyRules,
      ruleCount: data.rules ? (Array.isArray(data.rules) ? data.rules.length : Object.values(data.rules).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)) : 0,
      sourceCount: data.sources ? data.sources.length : 0,
      proxyRuleCount: data.proxyRules ? data.proxyRules.length : 0,
      environmentCount: calculateEnvironmentCount(data),
      variableCount: calculateVariableCount(data),
      rawData: data
    };
  } catch (error: unknown) {
    log.error('Config file analysis failed:', error);
    return {
      valid: false,
      error: errMsg(error)
    };
  }
}

/**
 * Validate Git workspace configuration
 */
async function validateGitWorkspaceConfig(configPath: string, envPath?: string): Promise<ValidationResult> {
  const { promises: fsPromises } = await import('fs');

  try {
    log.info('Validating Git workspace config:', { configPath, envPath });

    // Read and validate main config file
    const configContent: string = await fsPromises.readFile(configPath, 'utf8');
    const configResult = await analyzeConfigFile(configContent, false, !!envPath);

    if (!configResult.valid) {
      return {
        valid: false,
        error: `Main config file validation failed: ${configResult.error}`
      };
    }

    let envResult: AnalysisResult | null = null;
    if (envPath) {
      // Read and validate environment file
      const envContent: string = await fsPromises.readFile(envPath, 'utf8');
      envResult = await analyzeConfigFile(envContent, true, true);

      if (!envResult.valid) {
        return {
          valid: false,
          error: `Environment file validation failed: ${envResult.error}`
        };
      }
    }

    // Narrow via discriminant: configResult.valid is true (checked above), kind is 'main' (isEnvFile=false)
    if (configResult.kind !== 'main') return { valid: false, error: 'Unexpected analysis result type' };
    const totalSources = configResult.sourceCount;
    const totalRules = configResult.ruleCount;
    const totalProxyRules = configResult.proxyRuleCount;
    const totalEnvironments = Math.max(configResult.environmentCount, envResult?.valid ? envResult.environmentCount : 0);
    const totalVariables = Math.max(configResult.variableCount, envResult?.valid ? envResult.variableCount : 0);

    return {
      valid: true,
      configFile: configResult,
      envFile: envResult,
      summary: {
        sources: totalSources,
        rules: totalRules,
        proxyRules: totalProxyRules,
        environments: totalEnvironments,
        variables: totalVariables,
        isMultiFile: !!envPath
      }
    };
  } catch (error: unknown) {
    log.error('Git workspace validation error:', error);
    return {
      valid: false,
      error: errMsg(error)
    };
  }
}

/**
 * Read and validate multi-file configuration
 */
async function readAndValidateMultiFileConfig(configPath: string, envPath: string): Promise<ValidationResult> {
  return await validateGitWorkspaceConfig(configPath, envPath);
}

export {
  analyzeConfigFile,
  validateGitWorkspaceConfig,
  readAndValidateMultiFileConfig
};
export type { AnalysisResult, MainAnalysisResult, EnvAnalysisResult, AnalysisError, ConfigData };

export default {
  analyzeConfigFile,
  validateGitWorkspaceConfig,
  readAndValidateMultiFileConfig
};
