/**
 * Configuration File Validator
 *
 * Pure JSON analysis for Open Headers configuration files.
 * No Node.js APIs (fs, path, etc.) — safe for both main and renderer processes.
 */

import type { Source } from '@openheaders/core';
import type { EnvironmentMap, EnvironmentSchema } from '@/types/environment';
import type { ProxyRule } from '@/types/proxy';

interface ConfigData {
  version?: string;
  environments?: EnvironmentMap;
  environmentSchema?: EnvironmentSchema & {
    variableDefinitions?: Record<
      string,
      { description: string; isSecret: boolean; usedIn: string[]; example?: string }
    >;
  };
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

/**
 * Helper function to calculate environment count
 */
function calculateEnvironmentCount(data: ConfigData): number {
  return data.environments
    ? Object.keys(data.environments).length
    : data.environmentSchema?.environments
      ? Object.keys(data.environmentSchema.environments).length
      : 0;
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
async function analyzeConfigFile(
  content: string,
  isEnvFile: boolean = false,
  isSeparateMode: boolean = false,
): Promise<AnalysisResult> {
  try {
    const data: ConfigData = JSON.parse(content);

    if (isEnvFile) {
      // Environment file should only contain environment data
      const hasOtherData = data.rules || data.sources || data.proxyRules;
      if (hasOtherData) {
        return {
          valid: false,
          error:
            'This appears to be a main configuration file with sources/rules/proxy rules. Please use the main configuration file upload area for this file.',
        };
      }

      return {
        kind: 'env',
        valid: true,
        hasEnvironmentSchema: !!data.environmentSchema,
        hasEnvironments: !!data.environments,
        environmentCount: calculateEnvironmentCount(data),
        variableCount: calculateVariableCount(data),
        rawData: data,
      };
    }

    // For main config file in separate mode, check if it's environment-only
    const hasOnlyEnvData =
      !data.sources && !data.rules && !data.proxyRules && (data.environmentSchema || data.environments);

    // In separate files mode, reject environment-only files for main config area
    if (isSeparateMode && hasOnlyEnvData) {
      return {
        valid: false,
        error:
          'This appears to be an environment-only file. Please use the environment file upload area for environment files.',
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
      ruleCount: data.rules
        ? Array.isArray(data.rules)
          ? data.rules.length
          : Object.values(data.rules).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
        : 0,
      sourceCount: data.sources ? data.sources.length : 0,
      proxyRuleCount: data.proxyRules ? data.proxyRules.length : 0,
      environmentCount: calculateEnvironmentCount(data),
      variableCount: calculateVariableCount(data),
      rawData: data,
    };
  } catch (error: unknown) {
    console.error('[ConfigValidator] Config file analysis failed:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type { AnalysisError, AnalysisResult, ConfigData, EnvAnalysisResult, MainAnalysisResult };
export { analyzeConfigFile };
