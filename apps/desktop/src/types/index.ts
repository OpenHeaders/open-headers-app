/**
 * Desktop-only type re-exports.
 *
 * Shared types (Source, HeaderRule, Recording, etc.) are imported
 * directly from '@openheaders/core'. This barrel only re-exports
 * types that are specific to the desktop app.
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
export type { AppSettings, ScreenRecordingPermission } from './settings';
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
