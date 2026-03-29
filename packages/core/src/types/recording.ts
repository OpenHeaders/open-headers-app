/**
 * Recording domain types.
 *
 * Shared types for workflow recordings, storage/console/network
 * event data used by both the desktop app and browser extension.
 */

// ── Storage ────────────────────────────────────────────────────────

export interface StorageCookieMetadata {
  initial?: boolean;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  maxAge?: number | string;
  expires?: string;
  expired?: boolean;
  clearedCount?: number;
  clearedKeys?: Array<{ name: string; value: unknown }>;
}

export interface StorageRecord {
  timestamp: number;
  type: string;
  action: string;
  name: string;
  domain: string;
  key?: string;
  url?: string | null;
  value?: unknown;
  oldValue?: unknown;
  newValue?: string | null;
  path?: string;
  metadata?: StorageCookieMetadata;
  data?: {
    localStorage?: Record<string, string>;
    sessionStorage?: Record<string, string>;
    cookies?: string;
  };
}

// ── Console ────────────────────────────────────────────────────────

export interface ConsoleArgObject {
  __type?: string;
  message?: string;
  tagName?: string;
  id?: string;
  className?: string;
  name?: string;
}

export type ConsoleArg = null | undefined | string | number | boolean | ConsoleArgObject;

export interface ConsoleRecord {
  timestamp: number;
  level: string;
  args: ConsoleArg[];
  stack?: string;
  key?: string;
}

// ── Network ────────────────────────────────────────────────────────

export interface NetworkTimingData {
  dns?: number;
  connect?: number;
  ssl?: number;
  waiting?: number;
  download?: number;
  startTime?: number;
  endTime?: number;
}

export interface NetworkRecord {
  id: string;
  url: string;
  method: string;
  status: number;
  timestamp: number;
  endTime?: number;
  duration?: number;
  size?: number;
  responseSize?: number;
  type?: string;
  error?: boolean;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  key?: string;
  remoteAddress?: string;
  timing?: NetworkTimingData;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string | null;
}

// ── Recording metadata ─────────────────────────────────────────────

export interface RecordingMetadata {
  recordId?: string;
  recordingId?: string;
  startTime?: number;
  timestamp?: number;
  duration?: number;
  url?: string;
  initialUrl?: string;
  title?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

// ── Navigation ─────────────────────────────────────────────────────

export interface NavigationEntry {
  timestamp: number;
  url?: string;
  title?: string;
  transitionType?: string;
}

// ── Recording events ───────────────────────────────────────────────

export interface RecordingEventData {
  timestamp?: number;
  type?: string;
  url?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RecordingEvent {
  timestamp: number;
  type: string;
  url?: string;
  data?: RecordingEventData | Record<string, unknown>;
}

// ── Workflow recording list entry ──────────────────────────────────

export interface WorkflowTag {
  name?: string;
  url?: string;
}

export interface WorkflowRecordingEntry {
  id: string;
  timestamp: string | number;
  url?: string;
  duration?: number;
  eventCount?: number;
  size?: number;
  source?: string;
  hasVideo?: boolean;
  hasProcessedVersion?: boolean;
  tag?: WorkflowTag | null;
  description?: string | null;
  metadata?: { url?: string; initialUrl?: string };
}
