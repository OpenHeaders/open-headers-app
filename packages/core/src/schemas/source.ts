/**
 * Valibot schemas for Source types.
 * Used at serialization boundaries (WS messages, file I/O).
 */

import * as v from 'valibot';

export const SourceSchema = v.object({
  sourceId: v.string(),
  sourceType: v.optional(v.picklist(['http', 'file', 'manual', 'env'])),
  sourcePath: v.optional(v.string()),
  sourceMethod: v.optional(v.picklist(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])),
  sourceName: v.optional(v.string()),
  sourceTag: v.optional(v.string()),
  sourceContent: v.optional(v.nullable(v.string())),
  requestOptions: v.optional(
    v.object({
      contentType: v.optional(v.string()),
      body: v.optional(v.string()),
      headers: v.optional(v.array(v.object({ key: v.string(), value: v.string() }))),
      queryParams: v.optional(v.array(v.object({ key: v.string(), value: v.string() }))),
      totpSecret: v.optional(v.string()),
    }),
  ),
  jsonFilter: v.optional(
    v.object({
      enabled: v.boolean(),
      path: v.optional(v.string()),
    }),
  ),
  refreshOptions: v.optional(
    v.object({
      enabled: v.boolean(),
      type: v.optional(v.picklist(['custom', 'cron', 'manual'])),
      interval: v.optional(v.number()),
      lastRefresh: v.optional(v.nullable(v.number())),
      nextRefresh: v.optional(v.nullable(v.number())),
      alignToMinute: v.optional(v.boolean()),
      alignToHour: v.optional(v.boolean()),
      alignToDay: v.optional(v.boolean()),
    }),
  ),
  refreshStatus: v.optional(
    v.object({
      isRefreshing: v.boolean(),
      lastRefresh: v.optional(v.number()),
      startTime: v.optional(v.number()),
      success: v.optional(v.boolean()),
      error: v.optional(v.string()),
      reason: v.optional(v.string()),
      isRetry: v.optional(v.boolean()),
      attemptNumber: v.optional(v.number()),
      totalAttempts: v.optional(v.number()),
      failureCount: v.optional(v.number()),
    }),
  ),
  activationState: v.optional(v.picklist(['active', 'inactive', 'error', 'waiting_for_deps'])),
  missingDependencies: v.optional(v.array(v.string())),
  createdAt: v.optional(v.string()),
  updatedAt: v.optional(v.string()),
  isFiltered: v.optional(v.boolean()),
  filteredWith: v.optional(v.nullable(v.string())),
  needsInitialFetch: v.optional(v.boolean()),
  originalResponse: v.optional(v.nullable(v.string())),
  responseHeaders: v.optional(v.nullable(v.record(v.string(), v.string()))),
});
