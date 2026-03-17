import { useCallback } from 'react';
import { useEnvironmentCore } from './useEnvironmentCore';

interface VariableUsage {
  [varName: string]: string[];
}

interface VariableDefinition {
  description: string;
  sensitive: boolean;
  usedIn: string[];
  example?: string;
}

interface EnvironmentSchema {
  environments: Record<string, { variables: Array<{ name: string; isSecret: boolean }> }>;
  variableDefinitions: Record<string, VariableDefinition>;
}

interface UseEnvironmentSchemaReturn {
  findVariableUsage: (sources: any[]) => VariableUsage;
  generateEnvironmentSchema: (sources: any[]) => EnvironmentSchema;
}

/**
 * Hook for environment schema and variable usage analysis
 */
export function useEnvironmentSchema(): UseEnvironmentSchemaReturn {
  const { environments } = useEnvironmentCore();

  const findVariableUsage = useCallback((sources: any[]): VariableUsage => {
    const usage: VariableUsage = {};
    const variablePattern = /\{\{(\w+)\}\}/g;

    sources.forEach((source: any) => {
      if (source.sourceType === 'http') {
        // Check all string fields in the source
        const checkField = (field: any, path: string) => {
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
            Object.entries(field).forEach(([key, value]) => {
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
            source.requestOptions.headers.forEach((header: any) => {
              if (header && header.value) {
                checkField(header.value, `headers.${header.key}`);
              }
            });
          }

          // Check query params
          if (Array.isArray(source.requestOptions.queryParams)) {
            source.requestOptions.queryParams.forEach((param: any) => {
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

  const generateEnvironmentSchema = useCallback((sources: any[]): EnvironmentSchema => {
    const variableUsage = findVariableUsage(sources);
    const schema: EnvironmentSchema = {
      environments: {},
      variableDefinitions: {}
    };

    // Build environment structure
    Object.entries(environments).forEach(([envName, envVars]: [string, any]) => {
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
      Object.values(environments).forEach((envVars: any) => {
        const variable = envVars[varName];
        if (variable && variable.isSecret) {
          isSecret = true;
        }
      });

      schema.variableDefinitions[varName] = {
        description: '',
        sensitive: isSecret,
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
