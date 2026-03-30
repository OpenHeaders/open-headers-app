/**
 * Valibot schemas for recording wire format.
 * Used at the WebSocket boundary when desktop receives recordings from the extension.
 */

import * as v from 'valibot';

const RecordingEventDataSchema = v.record(v.string(), v.unknown());

const RecordingEventSchema = v.object({
  timestamp: v.number(),
  type: v.string(),
  url: v.optional(v.string()),
  data: v.optional(RecordingEventDataSchema),
});

const RecordingMetadataSchema = v.object({
  recordId: v.optional(v.string()),
  recordingId: v.optional(v.string()),
  startTime: v.optional(v.number()),
  timestamp: v.optional(v.number()),
  duration: v.optional(v.number()),
  url: v.optional(v.string()),
  initialUrl: v.optional(v.string()),
  title: v.optional(v.string()),
  userAgent: v.optional(v.string()),
  viewport: v.optional(
    v.object({
      width: v.number(),
      height: v.number(),
    }),
  ),
});

const WorkflowRecordingRecordSchema = v.object({
  id: v.string(),
  tabId: v.number(),
  startTime: v.number(),
  endTime: v.number(),
  url: v.string(),
  title: v.string(),
  events: v.array(RecordingEventSchema),
  preNavTimeAdjustment: v.optional(v.number()),
  hasVideoSync: v.boolean(),
  metadata: RecordingMetadataSchema,
});

export const WorkflowRecordingPayloadSchema = v.object({
  record: WorkflowRecordingRecordSchema,
});
