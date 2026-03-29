/**
 * Recording-related type definitions.
 *
 * Re-exports canonical types from @openheaders/core and adds
 * extension-specific recording service interfaces.
 */

// Re-export shared types
export type {
  ConsoleArg,
  ConsoleArgObject,
  ConsoleRecord,
  NavigationEntry,
  NetworkRecord,
  NetworkTimingData,
  RecordingEvent,
  RecordingEventData,
  RecordingMetadata,
  StorageCookieMetadata,
  StorageRecord,
  WorkflowRecordingEntry,
  WorkflowTag,
} from '@openheaders/core/types';

// ── Extension-specific recording types ────────────────────────────

export interface RecordingState {
  metadata?: import('@openheaders/core/types').RecordingMetadata;
  [key: string]: unknown;
}

export interface Recording {
  id: string;
  status?: string;
  metadata?: import('@openheaders/core/types').RecordingMetadata;
  events?: import('@openheaders/core/types').RecordingEvent[];
  console?: import('@openheaders/core/types').ConsoleRecord[];
  network?: import('@openheaders/core/types').NetworkRecord[];
  storage?: import('@openheaders/core/types').StorageRecord[];
  startTime?: number;
  endTime?: number;
  url?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  navigationHistory?: import('@openheaders/core/types').NavigationEntry[];
  [key: string]: unknown;
}

export interface StartRecordingOptions {
  useWidget?: boolean;
}

export interface StopRecordingOptions {
  fromWidget?: boolean;
}

export interface IRecordingService {
  isRecording(tabId: number): boolean;
  getRecordingState(tabId: number): RecordingState;
  startRecording(tabId: number, options?: StartRecordingOptions): Promise<Recording>;
  stopRecording(tabId: number, options?: StopRecordingOptions): Promise<Recording | null>;
  cleanupTab(tabId: number): void;
  handleNavigation(tabId: number, url: string): Promise<void>;
  addEvent(tabId: number, event: import('@openheaders/core/types').RecordingEvent): void;
  handleContentScriptReady(tabId: number, payload: unknown): Promise<unknown>;
}
