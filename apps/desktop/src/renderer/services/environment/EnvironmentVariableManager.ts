/**
 * EnvironmentVariableManager - Manages environment variables and operations
 */

import type { EnvironmentVariable, EnvironmentVariables } from '../../../types/environment';
import { createLogger } from '../../utils/error-handling/logger';

const log = createLogger('EnvironmentVariableManager');

type EnvStore = Record<string, EnvironmentVariables>;

class EnvironmentVariableManager {
  constructor() {}

  getAllVariables(environments: EnvStore, activeEnvironment: string) {
    const envVars = environments[activeEnvironment] ?? {};
    const result: Record<string, string> = {};

    Object.entries(envVars).forEach(([key, variable]) => {
      result[key] = variable.value ?? '';
    });

    return result;
  }

  setVariable(
    environments: EnvStore,
    environmentName: string,
    name: string,
    value: string | null,
    isSecret = false,
  ): EnvStore {
    const updatedEnvironments: EnvStore = JSON.parse(JSON.stringify(environments));

    if (!updatedEnvironments[environmentName]) {
      throw new Error(`Environment '${environmentName}' does not exist`);
    }

    if (value === null || value === '') {
      delete updatedEnvironments[environmentName][name];
      log.debug(`Deleted variable ${name} from environment ${environmentName}`);
    } else {
      updatedEnvironments[environmentName][name] = {
        value,
        isSecret,
        updatedAt: new Date().toISOString(),
      };
      log.debug(`Set variable ${name} in environment ${environmentName}:`, {
        value: isSecret ? '(secret)' : value,
        isSecret,
      });
    }

    return updatedEnvironments;
  }

  createEnvironment(environments: EnvStore, name: string): EnvStore {
    if (environments[name]) {
      throw new Error(`Environment '${name}' already exists`);
    }

    const updatedEnvironments = {
      ...environments,
      [name]: {},
    };

    log.info(`Created environment: ${name}`);
    return updatedEnvironments;
  }

  deleteEnvironment(environments: EnvStore, name: string): EnvStore {
    if (name === 'Default') {
      throw new Error('Cannot delete Default environment');
    }

    const updatedEnvironments = { ...environments };
    delete updatedEnvironments[name];

    log.info(`Deleted environment: ${name}`);
    return updatedEnvironments;
  }

  validateEnvironmentExists(environments: EnvStore, name: string) {
    if (!environments[name]) {
      throw new Error(`Environment '${name}' does not exist`);
    }
  }

  getVariableCount(environments: EnvStore, environmentName: string) {
    const env = environments[environmentName];
    return env ? Object.keys(env).length : 0;
  }

  exportEnvironment(environments: EnvStore, environmentName: string, format = 'json') {
    const env = environments[environmentName];
    if (!env) {
      throw new Error(`Environment '${environmentName}' does not exist`);
    }

    switch (format) {
      case 'json':
        return JSON.stringify(env, null, 2);

      case 'env':
        return Object.entries(env)
          .map(([key, variable]) => `${key}=${variable.value ?? ''}`)
          .join('\n');

      case 'shell':
        return Object.entries(env)
          .map(([key, variable]) => `export ${key}="${variable.value ?? ''}"`)
          .join('\n');

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  importEnvironment(data: string, format = 'json') {
    const variables: EnvironmentVariables = {};

    switch (format) {
      case 'json': {
        const parsed = JSON.parse(data) as Record<string, EnvironmentVariable | string>;
        Object.entries(parsed).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null && 'value' in value) {
            variables[key] = value;
          } else {
            variables[key] = {
              value: String(value),
              isSecret: false,
              updatedAt: new Date().toISOString(),
            };
          }
        });
        break;
      }

      case 'env':
        data.split('\n').forEach((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key) {
              variables[key.trim()] = {
                value: valueParts.join('=').trim(),
                isSecret: false,
                updatedAt: new Date().toISOString(),
              };
            }
          }
        });
        break;

      default:
        throw new Error(`Unsupported import format: ${format}`);
    }

    return variables;
  }
}

export default EnvironmentVariableManager;
