/**
 * WebSocket message type definitions for the desktop ↔ extension protocol.
 *
 * These types define the contract between the desktop app (WS server)
 * and the browser extension (WS client).
 */

import type { RecordingEvent, RecordingMetadata } from '../types/recording';
import type { PayloadRule, Rule } from '../types/rules';
import type { Source } from '../types/source';

// ── Shared protocol types ──────────────────────────────────────────

/** Navigation action applied to an item or settings toggle. */
export type NavigationAction =
  | 'edit'
  | 'delete'
  | 'toggle'
  | 'view'
  | 'create'
  | 'duplicate'
  | 'highlight'
  | 'toggleVideoRecording'
  | 'toggleRecordingHotkey'
  | 'editHotkey';

/** Settings tab identifier. */
export type SettingsTabId = 'general' | 'appearance' | 'workflows';

/**
 * Navigation intent sent with focusApp to tell the desktop UI which view
 * to show and what action to perform.
 */
export interface AppNavigationIntent {
  tab?: string;
  subTab?: string;
  action?: NavigationAction;
  itemId?: string;
  settingsTab?: SettingsTabId;
  /** Value for toggle actions — boolean via WebSocket, string via protocol URL. */
  value?: string | boolean;
}

/** Display bounds rectangle. */
export interface DisplayBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Information about a display/monitor. */
export interface BrowserDisplayInfo {
  id: string | number;
  name?: string;
  bounds: DisplayBounds;
}

/** Display context sent with startSyncRecording for video capture targeting. */
export interface DisplayContext {
  currentDisplay?: BrowserDisplayInfo;
  allDisplays?: BrowserDisplayInfo[];
  windowPosition?: { x: number; y: number };
}

// ── Recording wire format (extension → desktop via WebSocket) ──────

/**
 * The recording payload that crosses the WebSocket boundary.
 *
 * Extension builds this in RecordingService.exportRecording(),
 * desktop validates it in WSRecordingHandler with the valibot schema,
 * then passes it to the preprocessor pipeline.
 */
export interface WorkflowRecordingPayload {
  record: WorkflowRecordingRecord;
}

export interface WorkflowRecordingRecord {
  /** Extension-generated recording ID */
  id: string;
  /** Browser tab that was recorded */
  tabId: number;
  /** Recording start timestamp (epoch ms) */
  startTime: number;
  /** Recording end timestamp (epoch ms) */
  endTime: number;
  /** URL of the recorded page */
  url: string;
  /** Page title */
  title: string;
  /** All captured events (rrweb, console, network, navigation, storage) */
  events: RecordingEvent[];
  /** Time offset for pre-navigation recordings */
  preNavTimeAdjustment?: number;
  /** Whether video sync was active with the desktop app */
  hasVideoSync: boolean;
  /** Recording metadata for indexing and display */
  metadata: RecordingMetadata;
}

// ── Incoming messages (extension → desktop) ────────────────────────

export interface BrowserInfoMessage {
  type: 'browserInfo';
  browser: string;
  version: string;
  extensionVersion: string;
}

export interface FocusAppMessage {
  type: 'focusApp';
  navigation: AppNavigationIntent;
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
  recording: WorkflowRecordingPayload;
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
    displayInfo?: DisplayContext;
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
  request?: PayloadRule[];
  response?: Rule[];
}
