/**
 * Valibot schemas for CLI API request validation.
 *
 * These schemas validate JSON-parsed HTTP bodies at system boundaries,
 * replacing unsafe `as unknown as` casts with runtime validation.
 */

import * as v from 'valibot';

// ── WorkspaceAuthData ────────────────────────────────────────────────

const WorkspaceAuthDataSchema = v.object({
  token: v.optional(v.string()),
  tokenType: v.optional(v.string()),
  username: v.optional(v.string()),
  password: v.optional(v.string()),
  sshKeySource: v.optional(v.string()),
  sshKey: v.optional(v.string()),
  sshKeyPath: v.optional(v.string()),
  privateKey: v.optional(v.string()),
  publicKey: v.optional(v.string()),
  passphrase: v.optional(v.string()),
  sshPassphrase: v.optional(v.string()),
});

// ── JoinWorkspaceData ────────────────────────────────────────────────

export const JoinWorkspaceDataSchema = v.object({
  workspaceName: v.optional(v.string()),
  repoUrl: v.string(),
  branch: v.optional(v.string()),
  configPath: v.optional(v.string()),
  authType: v.optional(v.string()),
  authData: v.optional(WorkspaceAuthDataSchema),
  inviterName: v.optional(v.string()),
  inviteId: v.optional(v.string()),
});

// ── EnvironmentVariable ──────────────────────────────────────────────

const EnvironmentVariableSchema = v.object({
  value: v.string(),
  isSecret: v.boolean(),
  updatedAt: v.optional(v.string()),
});

// ── EnvironmentImportData ────────────────────────────────────────────

export const EnvironmentImportDataSchema = v.object({
  environments: v.record(v.string(), v.record(v.string(), EnvironmentVariableSchema)),
});
