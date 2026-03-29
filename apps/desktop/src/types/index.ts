/**
 * Shared type re-exports.
 *
 * Import from 'types/' or from individual domain files.
 */

export type {
  IpcFireEvent,
  IpcInvokeEvent,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  OperationResult,
} from './common';
export { errorMessage } from './common';
export type {
  EnvironmentConfigData,
  EnvironmentMap,
  EnvironmentSchema,
  EnvironmentSchemaEntry,
  EnvironmentSchemaVariable,
  EnvironmentsFile,
  EnvironmentVariable,
  EnvironmentVariables,
} from './environment';
export type {
  EnvironmentContextLike,
  HttpProgressCallback,
  HttpRequestResult,
  HttpRequestSpec,
  TestResponseContent,
  TotpCooldownInfo,
} from './http';
export type {
  ProxyCertificateInfo,
  ProxyRule,
  ProxyStats,
  ProxyStatus,
} from './proxy';
export type {
  ConsoleArg,
  ConsoleArgObject,
  ConsoleRecord,
  CookieAttributes,
  DomNode,
  NavigationEntry,
  NetworkRecord,
  NetworkTimingData,
  PageTransition,
  PreprocessedRecording,
  PreprocessOptions,
  PreprocessProgressDetails,
  RawRecordingRecord,
  Recording,
  RecordingEvent,
  RecordingEventData,
  RecordingMetadata,
  RRWebAdd,
  RRWebEvent,
  RRWebInnerData,
  RRWebPlayerConstructor,
  RRWebPlayerInstance,
  Snapshot,
  StaticResources,
  StorageCookieMetadata,
  StorageRecord,
  TimeEvent,
  WorkflowRecordingEntry,
  WorkflowRecordingFileMetadata,
  WorkflowTag,
} from './recording';
export type {
  BaseRule,
  ContentType,
  HeaderRule,
  MatchType,
  PayloadRule,
  Rule,
  RulesCollection,
  RulesStorage,
  RuleType,
  RuleValidation,
  UrlParamModification,
  UrlRule,
  UrlRuleAction,
} from './rules';
export type { AppSettings, ScreenRecordingPermission } from './settings';
export type {
  ActivationState,
  JsonFilter,
  NewSourceData,
  RefreshOptions,
  RefreshStatus,
  RefreshType,
  Source,
  SourceHeader,
  SourceMethod,
  SourceQueryParam,
  SourceRequestOptions,
  SourceType,
} from './source';
export type {
  AuthType,
  ServiceRegistryStatus,
  ServicesHealth,
  TeamWorkspaceInvite,
  Workspace,
  WorkspaceAuthData,
  WorkspaceDataUpdatedData,
  WorkspaceMetadata,
  WorkspaceSyncCompletedData,
  WorkspaceSyncStatus,
  WorkspaceType,
} from './workspace';
