/**
 * Shared types for the Export/Import system
 */

/** Environment schema structure returned by generateEnvironmentSchema */
export interface EnvironmentSchema {
  environments: Record<string, { variables?: Array<{ name: string; isSecret: boolean }> } | Record<string, { value?: string; isSecret?: boolean }>>;
  variableDefinitions: Record<string, { name?: string; defaultValue?: string; isSecret?: boolean; sensitive?: boolean; usedIn?: string[]; description?: string; example?: string }>;
}

import type { Source } from '../../../../types/source';
import type { Workspace } from '../../../../types/workspace';
import type { RulesCollection, RulesStorage as SharedRulesStorage } from '../../../../types/rules';
import type { ProxyRule } from '../../../../types/proxy';
import type { EnvironmentVariableEntry } from '../../../hooks/environment/useEnvironmentCore';

export type { EnvironmentVariableEntry };

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
  name?: string;
  enabled?: boolean;
  pattern?: string;
  matchType?: string;
  ruleType?: string;
  headers?: Array<{ name: string; value: string; operation?: string }>;
}

/** Rules storage structure — re-exports shared RulesStorage with extended rules map */
export interface RulesStorage extends SharedRulesStorage {
  rules: SharedRulesStorage['rules'] & Record<string, RuleEntry[]>;
}

/** Import data parsed from file */
export interface ImportData {
  version?: string;
  sources?: Source[];
  proxyRules?: ProxyRule[];
  rules?: Record<string, RuleEntry[]>;
  rulesMetadata?: { totalRules?: number; lastUpdated?: string };
  environments?: Record<string, Record<string, EnvironmentVariableEntry>>;
  environmentSchema?: EnvironmentSchema;
  workspace?: WorkspaceData;
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
  // Handlers may attach extra context properties
  [key: string]: string | boolean | string[] | WorkspaceData | Record<string, boolean> | undefined;
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
  // Handlers may attach extra context properties
  [key: string]: string | boolean | WorkspaceData | Record<string, boolean> | undefined;
}
