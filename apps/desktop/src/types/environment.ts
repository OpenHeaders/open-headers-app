/**
 * Environment domain types.
 *
 * Environments hold key/value pairs (some secret) that are injected
 * into header rules and HTTP source requests via {{VAR_NAME}} syntax.
 */

// ── Environment variable ────────────────────────────────────────────

export interface EnvironmentVariable {
  value: string;
  isSecret: boolean;
  updatedAt?: string;
}

/** Variables keyed by name within a single environment. */
export type EnvironmentVariables = Record<string, EnvironmentVariable>;

/** All environments keyed by environment name (e.g. "Default"). */
export type EnvironmentMap = Record<string, EnvironmentVariables>;

/**
 * Create an independent deep copy of an EnvironmentMap.
 *
 * EnvironmentMap is two levels deep (envName → varName → EnvironmentVariable),
 * so a shallow spread only clones the outer Record while sharing the inner
 * EnvironmentVariables objects. Any mutation of the "copy" silently corrupts the
 * original — the exact class of bug that hit SyncDataImporter (issue #6) and
 * importEnvironments (issue A).
 *
 * Use this function whenever you need an EnvironmentMap you can freely mutate
 * without affecting the source.
 */
export function cloneEnvironmentMap(env: EnvironmentMap): EnvironmentMap {
  const clone: EnvironmentMap = {};
  for (const [envName, vars] of Object.entries(env)) {
    clone[envName] = {};
    for (const [varName, varData] of Object.entries(vars)) {
      clone[envName][varName] = { ...varData };
    }
  }
  return clone;
}

// ── Persisted file shape (environments.json) ────────────────────────

export interface EnvironmentsFile {
  environments: EnvironmentMap;
  activeEnvironment: string;
}

// ── Environment config sharing ──────────────────────────────────────

export interface EnvironmentSchemaVariable {
  name: string;
  isSecret: boolean;
}

export interface EnvironmentSchemaEntry {
  variables: EnvironmentSchemaVariable[];
}

export interface EnvironmentSchema {
  environments: Record<string, EnvironmentSchemaEntry>;
}

export interface EnvironmentConfigData {
  version: string;
  environments?: EnvironmentMap;
  environmentSchema?: EnvironmentSchema;
}
