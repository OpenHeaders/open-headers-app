/**
 * Shared types for the Export/Import system
 */

/** Environment schema structure returned by generateEnvironmentSchema */
export interface EnvironmentSchema {
  environments: Record<string, Record<string, unknown>>;
  variableDefinitions: Record<string, Record<string, unknown>>;
}

import type { Source } from '../../../../types/source';
import type { Workspace } from '../../../../types/workspace';
import type { RulesCollection } from '../../../../types/rules';
import type { ProxyRule } from '../../../../types/proxy';

/** A single environment variable entry as stored in the environment service */
export interface EnvironmentVariableEntry {
  value?: string;
  isSecret?: boolean;
  updatedAt?: string;
  [key: string]: unknown;
}

/** Workspace data as used in the export/import system — id is optional since imports create new workspaces */
export type WorkspaceData = Partial<Workspace> & { name: string; type: Workspace['type'] };

/**
 * All dependencies required by ExportService, ImportService, and their handlers.
 * Passed in from the React hook layer (useExportImport).
 *
 * Method shorthands (e.g. generateEnvironmentSchema, exportSources) use bivariant
 * checking so the concrete implementations can have narrower parameter types without
 * causing assignment errors.
 */
export interface ExportImportDependencies {
  appVersion: string;
  sources: Source[];
  activeWorkspaceId: string;
  // bivariant method shorthands: concrete functions may have narrower param types
  exportSources(): Source[];
  removeSource(sourceId: string): Promise<boolean>;
  workspaces: WorkspaceData[];
  createWorkspace(workspace: WorkspaceData): Promise<WorkspaceData | null>;
  switchWorkspace(workspaceId: string): Promise<boolean>;
  environments: Record<string, Record<string, EnvironmentVariableEntry>>;
  createEnvironment(name: string): Promise<boolean>;
  setVariable(name: string, value: string | null, environment?: string | null, isSecret?: boolean): Promise<boolean>;
  generateEnvironmentSchema(sources: Source[]): EnvironmentSchema;
}

/** Shape of the data object assembled during an export operation */
export interface ExportData {
  version: string;
  sources?: Source[];
  proxyRules?: ProxyRule[];
  rules?: RulesCollection;
  rulesMetadata?: { totalRules: number; lastUpdated: string };
  environmentSchema?: EnvironmentSchema;
  environments?: Record<string, Record<string, EnvironmentVariableEntry>>;
  workspace?: WorkspaceData;
}

/** Individual rule entry stored in rules storage */
export interface RuleEntry {
  id: string;
  [key: string]: unknown;
}

/** Rules storage structure */
export interface RulesStorage {
  rules: Record<string, RuleEntry[]>;
  metadata: {
    totalRules: number;
    lastUpdated: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Import data parsed from file */
export interface ImportData {
  version?: string;
  sources?: Source[];
  proxyRules?: ProxyRule[];
  rules?: Record<string, RuleEntry[]>;
  rulesMetadata?: Record<string, unknown>;
  environments?: Record<string, Record<string, { value?: string; isSecret?: boolean; [key: string]: unknown }>>;
  environmentSchema?: EnvironmentSchema;
  workspace?: WorkspaceData;
  [key: string]: unknown;
}

/** Export options passed to the export handlers */
export interface ExportOptions {
  selectedItems: Record<string, boolean>;
  fileFormat?: string;
  environmentOption?: string;
  selectedEnvironments?: string[];
  includeWorkspace?: boolean;
  includeCredentials?: boolean;
  currentWorkspace?: WorkspaceData;
  appVersion?: string;
  [key: string]: unknown;
}

/** Import options passed to the import handlers */
export interface ImportOptions {
  fileContent: string;
  envFileContent?: string;
  selectedItems: Record<string, boolean>;
  importMode?: string;
  isGitSync?: boolean;
  workspaceInfo?: WorkspaceData;
  includeCredentials?: boolean;
  switchToNewWorkspace?: boolean;
  [key: string]: unknown;
}
