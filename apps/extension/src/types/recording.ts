/**
 * Recording-related type definitions.
 *
 * Extension-specific recording service interfaces.
 * Shared types (RecordingEvent, ConsoleRecord, etc.) are imported
 * directly from '@openheaders/core'.
 */

import type { RecordingEvent } from '@openheaders/core';

// ── Extension-specific recording types ────────────────────────────

/** Result of starting a recording */
export interface RecordingResult {
  id: string;
  tabId: number;
  startTime: number;
  status: string;
  url: string | undefined;
  title: string | undefined;
  [key: string]: unknown;
}

/** Complete recording data after stopping */
export interface RecordingData {
  id: string;
  tabId: number;
  startTime: number;
  endTime: number;
  status: string;
  url: string;
  title: string;
  events: RecordingEvent[];
  preNavTimeAdjustment: number | undefined;
  hasVideoSync: boolean;
  [key: string]: unknown;
}

/** Recording state exposed to consumers */
export interface RecordingStateInfo {
  state: string;
  metadata: {
    startTime: number | undefined;
    recordingId: string | undefined;
    isPreNavigation: boolean;
  };
  shouldInjectScripts: boolean;
}

export interface StartRecordingOptions {
  useWidget?: boolean;
}

export interface StopRecordingOptions {
  fromWidget?: boolean;
}

export interface IRecordingService {
  isRecording(tabId: number): boolean;
  getRecordingState(tabId: number): RecordingStateInfo;
  startRecording(tabId: number, options?: StartRecordingOptions): Promise<RecordingResult>;
  stopRecording(tabId: number, options?: StopRecordingOptions): Promise<RecordingData | null>;
  cleanupTab(tabId: number): void;
  handleNavigation(tabId: number, url: string): Promise<void>;
  addEvent(tabId: number, event: RecordingEvent): void;
  handleContentScriptReady(tabId: number, payload: unknown): Promise<unknown>;
}
