/**
 * Utility functions for environment variable operations
 */

import type { HeaderRule, Source } from '@openheaders/core';
import { createLogger } from '@/renderer/utils/error-handling/logger';
import type { EnvironmentMap, EnvironmentVariables } from '@/types/environment';
import { VARIABLE_TEMPLATE_REGEX } from './EnvironmentTypes';

const log = createLogger('EnvironmentUtils');

/** Rules object containing header rules */
interface RulesConfig {
  header?: HeaderRule[];
}

/** Variable usage information */
interface VariableUsageInfo {
  sourceId: string;
  sourceName: string;
  isRule: boolean;
}

/**
 * Extracts all variable references from a text string
 * @param text - Text to search for variables
 * @returns Array of variable names found
 */
export const extractVariables = (text: string): string[] => {
  if (!text) return [];

  const matches = text.match(VARIABLE_TEMPLATE_REGEX) || [];
  return matches.map((match) => match.slice(2, -2)); // Remove {{ and }}
};

/**
 * Checks for missing variables in a target environment
 * @param sources - Array of source configurations
 * @param targetEnvironment - Target environment variables
 * @param rules - Rules object containing header rules
 * @returns Array of missing variable names
 */
export const checkMissingVariables = (
  sources: Source[],
  targetEnvironment: EnvironmentVariables,
  rules: RulesConfig | null = null,
): string[] => {
  const missingVars = new Set<string>();

  if (!sources || !Array.isArray(sources)) {
    log.warn('Invalid sources provided to checkMissingVariables');
    return [];
  }

  sources.forEach((source: Source) => {
    if (source.sourceType === 'http') {
      // Check URL for variables
      const urlVars = extractVariables(source.sourcePath || '');
      urlVars.forEach((varName) => {
        if (!targetEnvironment[varName]) {
          missingVars.add(varName);
        }
      });

      // Check headers
      if (source.requestOptions?.headers) {
        source.requestOptions.headers.forEach((header) => {
          const headerVars = extractVariables(header.value || '');
          headerVars.forEach((varName) => {
            if (!targetEnvironment[varName]) {
              missingVars.add(varName);
            }
          });
        });
      }

      // Check body and totpSecret
      const reqOpts = source.requestOptions;
      if (reqOpts) {
        for (const fieldValue of [reqOpts.body, reqOpts.totpSecret]) {
          if (fieldValue) {
            const fieldVars = extractVariables(fieldValue);
            fieldVars.forEach((varName) => {
              if (!targetEnvironment[varName]) {
                missingVars.add(varName);
              }
            });
          }
        }
      }

      // Check query parameters
      if (source.requestOptions?.queryParams) {
        source.requestOptions.queryParams.forEach((param) => {
          const paramVars = extractVariables(param.value || '');
          paramVars.forEach((varName) => {
            if (!targetEnvironment[varName]) {
              missingVars.add(varName);
            }
          });
        });
      }

      // Check JSON filter path
      if (source.jsonFilter?.enabled && source.jsonFilter?.path) {
        const filterVars = extractVariables(source.jsonFilter.path || '');
        filterVars.forEach((varName) => {
          if (!targetEnvironment[varName]) {
            missingVars.add(varName);
          }
        });
      }
    }
  });

  // Check header rules for environment variables
  if (rules?.header && Array.isArray(rules.header)) {
    rules.header.forEach((rule: HeaderRule) => {
      if (rule.hasEnvVars && rule.envVars && Array.isArray(rule.envVars)) {
        rule.envVars.forEach((varName: string) => {
          if (!targetEnvironment[varName]) {
            missingVars.add(varName);
          }
        });
      }
    });
  }

  return Array.from(missingVars);
};

/**
 * Generates a unique environment name based on an existing name
 * @param baseName - Base name for the new environment
 * @param existingEnvironments - Existing environments object
 * @returns Unique environment name
 */
export const generateUniqueEnvironmentName = (baseName: string, existingEnvironments: EnvironmentMap): string => {
  let newName = `${baseName}-copy`;
  let counter = 1;

  while (existingEnvironments[newName]) {
    newName = `${baseName}-copy-${counter}`;
    counter++;
  }

  return newName;
};

/**
 * Checks if a source uses environment variables
 * @param source - Source configuration object
 * @returns True if source uses variables
 */
export const sourceUsesVariables = (source: Source | null): boolean => {
  if (!source) return false;

  const sourceStr = JSON.stringify(source);
  return sourceStr.includes('{{') && sourceStr.includes('}}');
};

/**
 * Gets sources that use environment variables
 * @param sources - Array of source configurations
 * @returns Filtered array of sources using variables
 */
export const getSourcesUsingVariables = (sources: Source[]): Source[] => {
  if (!sources || !Array.isArray(sources)) return [];

  return sources.filter(sourceUsesVariables);
};

/**
 * Formats variable usage information for display
 * @param _varName - Variable name
 * @param sourceIds - Array of source IDs using this variable
 * @param sources - Array of all sources for name lookup
 * @param rules - Rules object for rule name lookup
 * @returns Array of formatted source info
 */
export const formatVariableUsage = (
  _varName: string,
  sourceIds: string[],
  sources: Source[],
  rules: RulesConfig | null = null,
): VariableUsageInfo[] => {
  if (!sourceIds || !Array.isArray(sourceIds)) return [];

  return sourceIds.map((sourceId) => {
    // Check if this is a rule identifier
    if (sourceId.startsWith('rule-')) {
      const ruleId = sourceId.substring(5); // Remove 'rule-' prefix
      let ruleName = `Rule #${ruleId}`;

      // Try to find the actual rule to get its name
      if (rules?.header) {
        const rule = rules.header.find((r: HeaderRule) => r.id === ruleId);
        if (rule) {
          ruleName = rule.headerName || `Header Rule #${ruleId}`;
        }
      }

      return {
        sourceId: sourceId,
        sourceName: ruleName,
        isRule: true,
      };
    }

    // Regular source
    const source = sources.find((s: Source) => s.sourceId === sourceId);
    return {
      sourceId,
      sourceName: source?.sourceName || `Source ${sourceId}`,
      isRule: false,
    };
  });
};
