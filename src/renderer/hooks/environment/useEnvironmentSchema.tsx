import { useCallback } from 'react';
import { useEnvironmentCore } from './useEnvironmentCore';
import type { EnvironmentVariableEntry } from './useEnvironmentCore';
import type { Source } from '../../../types/source';
import type { EnvironmentSchema } from '../../services/export-import/core/types';


interface VariableUsage {
  [varName: string]: string[];
}

interface UseEnvironmentSchemaReturn {
  findVariableUsage: (sources: Source[]) => VariableUsage;
  generateEnvironmentSchema: (sources: Source[]) => EnvironmentSchema;
}

/**
 * Hook for environment schema and variable usage analysis
 */
export function useEnvironmentSchema(): UseEnvironmentSchemaReturn {
  const { environments } = useEnvironmentCore();

  const findVariableUsage = useCallback((sources: Source[]): VariableUsage => {
    const usage: VariableUsage = {};
    const variablePattern = /\{\{(\w+)\}\}/g;

    sources.forEach((source: Source) => {
      if (source.sourceType === 'http') {
        // Check all string fields in the source
        const checkField = (field: unknown, path: string) => {
          if (typeof field === 'string') {
            const matches = [...field.matchAll(variablePattern)];
            matches.forEach((match: RegExpMatchArray) => {
              const varName = match[1];
              if (!usage[varName]) {
                usage[varName] = [];
              }
              if (!usage[varName].includes(source.sourceId)) {
                usage[varName].push(source.sourceId);
              }
            });
          } else if (typeof field === 'object' && field !== null) {
            Object.entries(field as Record<string, unknown>).forEach(([key, value]) => {
              checkField(value, `${path}.${key}`);
            });
          }
        };

        // Check URL
        checkField(source.sourcePath, 'sourcePath');

        // Check request options
        if (source.requestOptions) {
          // Check headers
          if (Array.isArray(source.requestOptions.headers)) {
            source.requestOptions.headers.forEach((header: { key: string; value: string }) => {
              if (header && header.value) {
                checkField(header.value, `headers.${header.key}`);
              }
            });
          }

          // Check query params
          if (Array.isArray(source.requestOptions.queryParams)) {
            source.requestOptions.queryParams.forEach((param: { key: string; value: string }) => {
              if (param && param.value) {
                checkField(param.value, `queryParams.${param.key}`);
              }
            });
          }

          // Check body
          checkField(source.requestOptions.body, 'body');

          // Check TOTP secret
          checkField(source.requestOptions.totpSecret, 'totpSecret');
        }

        // Check JSON filter path
        if (source.jsonFilter?.enabled && source.jsonFilter?.path) {
          checkField(source.jsonFilter.path, 'jsonFilter.path');
        }
      }
    });

    return usage;
  }, []);

  const generateEnvironmentSchema = useCallback((sources: Source[]): EnvironmentSchema => {
    const variableUsage = findVariableUsage(sources);
    const schema: EnvironmentSchema = {
      environments: {},
      variableDefinitions: {}
    };

    // Build environment structure
    Object.entries(environments).forEach(([envName, envVars]: [string, Record<string, EnvironmentVariableEntry>]) => {
      schema.environments[envName] = {
        variables: Object.keys(envVars).map(varName => {
          const variable = envVars[varName];
          return {
            name: varName,
            isSecret: variable.isSecret || false
          };
        })
      };
    });

    // Build variable definitions
    Object.entries(variableUsage).forEach(([varName, usedIn]) => {
      let isSecret = false;
      Object.values(environments).forEach((envVars: Record<string, EnvironmentVariableEntry>) => {
        const variable = envVars[varName];
        if (variable && variable.isSecret) {
          isSecret = true;
        }
      });

      schema.variableDefinitions[varName] = {
        description: '',
        isSecret,
        usedIn
      };

      // Add example if we can infer from name
      if (varName.includes('URL') || varName.includes('ENDPOINT')) {
        schema.variableDefinitions[varName].example = 'https://api.example.com';
      }
    });

    return schema;
  }, [environments, findVariableUsage]);

  return {
    findVariableUsage,
    generateEnvironmentSchema
  };
}
