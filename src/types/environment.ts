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
