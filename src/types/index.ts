/**
 * Shared type re-exports.
 *
 * Import from 'types/' or from individual domain files.
 */

export type { OperationResult, IpcInvokeEvent, IpcFireEvent } from './common';
export { errorMessage } from './common';

export type {
  Workspace,
  WorkspaceType,
  AuthType,
  WorkspaceAuthData,
  WorkspaceSyncStatus,
  TeamWorkspaceInvite,
  ServicesHealth,
} from './workspace';

export type {
  EnvironmentVariable,
  EnvironmentVariables,
  EnvironmentMap,
  EnvironmentsFile,
  EnvironmentSchema,
  EnvironmentSchemaVariable,
  EnvironmentSchemaEntry,
  EnvironmentConfigData,
} from './environment';

export type {
  RuleType,
  MatchType,
  ContentType,
  UrlRuleAction,
  BaseRule,
  HeaderRule,
  PayloadRule,
  UrlRule,
  UrlParamModification,
  Rule,
  RulesStorage,
  RuleValidation,
} from './rules';

export type {
  Source,
  SourceType,
  ActivationState,
  SourceMethod,
  SourceHeader,
  SourceQueryParam,
  SourceRequestOptions,
  JsonFilter,
  RefreshType,
  RefreshOptions,
  RefreshStatus,
} from './source';

export type {
  ProxyRule,
  ProxyStats,
  ProxyStatus,
  ProxyCertificateInfo,
} from './proxy';

export type { AppSettings } from './settings';

export type {
  HttpConnectionOptions,
  HttpRequestOptions,
  HttpResponsePayload,
  HttpResult,
  HttpProgressCallback,
  TestResponseContent,
  EnvironmentContextLike,
} from './http';
