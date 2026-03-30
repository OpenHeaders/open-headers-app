/**
 * WebSocket message type definitions for the desktop ↔ extension protocol.
 *
 * These types define the contract between the desktop app (WS server)
 * and the browser extension (WS client).
 */

import type { Source } from '../types/source';

// ── Incoming messages (extension → desktop) ────────────────────────

export interface BrowserInfoMessage {
  type: 'browserInfo';
  browser: string;
  version: string;
  extensionVersion: string;
}

export interface FocusAppMessage {
  type: 'focusApp';
  navigation: Record<string, unknown>;
}

export interface ToggleRuleMessage {
  type: 'toggleRule';
  ruleId: string;
  enabled: boolean;
}

export interface ToggleAllRulesMessage {
  type: 'toggleAllRules';
  ruleIds: string[];
  enabled: boolean;
}

export interface GetVideoRecordingStateMessage {
  type: 'getVideoRecordingState';
}

export interface GetRecordingHotkeyMessage {
  type: 'getRecordingHotkey';
}

export interface SaveWorkflowMessage {
  type: 'saveWorkflow';
  recording: unknown;
}

export interface StartSyncRecordingMessage {
  type: 'startSyncRecording';
  data: {
    tabId: number;
    url: string | undefined;
    title: string | undefined;
    windowId: number;
    recordingId: string;
    timestamp: number;
    displayInfo?: unknown;
  };
}

export interface StopSyncRecordingMessage {
  type: 'stopSyncRecording';
  data: {
    recordingId: string;
    timestamp: number;
  };
}

// ── Outgoing messages (desktop → extension) ────────────────────────

export interface SourcesInitialMessage {
  type: 'sourcesInitial';
  sources: Source[];
}

export interface SourcesUpdatedMessage {
  type: 'sourcesUpdated';
  sources: Source[];
}

export interface RulesUpdateMessage {
  type: 'rules-update';
  data: {
    rules: RulesData;
  };
}

export interface VideoRecordingStateChangedMessage {
  type: 'videoRecordingStateChanged';
  enabled: boolean;
}

export interface RecordingHotkeyResponseMessage {
  type: 'recordingHotkeyResponse';
  hotkey: string;
  enabled: boolean;
}

export interface RecordingHotkeyChangedMessage {
  type: 'recordingHotkeyChanged';
  hotkey: string;
  enabled: boolean;
}

export interface RecordingHotkeyPressedMessage {
  type: 'recordingHotkeyPressed';
}

// ── Rules data from desktop app ─────────────────────────────────────

export interface HeaderRuleFromApp {
  id: string;
  type?: 'header';
  name?: string;
  description?: string;
  headerName: string;
  headerValue?: string;
  domains?: string[];
  isDynamic?: boolean;
  sourceId?: string | number | null;
  prefix?: string;
  suffix?: string;
  isResponse?: boolean;
  isEnabled?: boolean;
  tag?: string;
  hasEnvVars?: boolean;
  envVars?: string[];
  cookieName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RulesData {
  header?: HeaderRuleFromApp[];
  request?: unknown[];
  response?: unknown[];
  [key: string]: unknown;
}
