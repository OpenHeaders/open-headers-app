/**
 * Recording-related type definitions.
 *
 * Extension-specific recording service interfaces.
 * Shared types (RecordingEvent, ConsoleRecord, etc.) are imported
 * directly from '@openheaders/core'.
 */

import type {
  ConsoleRecord,
  NavigationEntry,
  NetworkRecord,
  RecordingEvent,
  RecordingMetadata,
  StorageRecord,
} from '@openheaders/core';

// ── Extension-specific recording types ────────────────────────────

export interface RecordingState {
  metadata?: RecordingMetadata;
  [key: string]: unknown;
}

export interface Recording {
  id: string;
  status?: string;
  metadata?: RecordingMetadata;
  events?: RecordingEvent[];
  console?: ConsoleRecord[];
  network?: NetworkRecord[];
  storage?: StorageRecord[];
  startTime?: number;
  endTime?: number;
  url?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  navigationHistory?: NavigationEntry[];
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
  addEvent(tabId: number, event: RecordingEvent): void;
  handleContentScriptReady(tabId: number, payload: unknown): Promise<unknown>;
}
