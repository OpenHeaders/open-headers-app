/**
 * Recording domain types.
 *
 * Types for workflow recordings, storage/console/network event data,
 * and the rrweb preprocessor pipeline.
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
  rawAttributes?: CookieAttributes;
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

export interface CookieAttributes {
  domain?: string;
  path?: string;
  httponly?: boolean;
  secure?: boolean;
  samesite?: string;
  'max-age'?: string;
  expires?: string;
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
  /** Kept for backward compat with the converter — same as requestHeaders */
  headers?: Record<string, string>;
  /** Kept for backward compat with the converter — same as requestBody */
  body?: string | null;
}

// ── Recording metadata ─────────────────────────────────────────────

export interface RecordingMetadata {
  recordId?: string;
  startTime: number;
  timestamp?: number;
  duration?: number;
  url?: string;
  initialUrl?: string;
  title?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

// ── Full recording (what tab components receive) ───────────────────

export interface Recording {
  metadata: RecordingMetadata;
  events: RRWebEvent[];
  console: ConsoleRecord[];
  network: NetworkRecord[];
  storage: StorageRecord[];
  startTime?: number;
  endTime?: number;
  id?: string;
  url?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  navigationHistory?: NavigationEntry[];
  _originalEvents?: RecordingEvent[];
  _preprocessed?: boolean;
  _pageTransitions?: PageTransition[];
  _fontUrls?: string[];
  _staticResources?: Record<string, string[]>;
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

/** Metadata written to the recording file index on disk */
export interface WorkflowRecordingFileMetadata {
  id: string;
  timestamp: number;
  url: string;
  duration: number;
  eventCount: number;
  size: number;
  source: string;
  hasVideo: boolean;
  hasProcessedVersion?: boolean;
  tag?: string | null;
  description?: string | null;
}

// ── Recording event pipeline (converter) ──────────────────────────

export interface NavigationEntry {
  timestamp: number;
  url?: string;
  title?: string;
  transitionType?: string;
}

export interface RecordingEventData {
  type?: string;
  level?: string;
  args?: ConsoleArg[];
  stack?: string;
  url?: string;
  requestId?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timing?: NetworkTimingData;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  responseSize?: number;
  action?: string;
  key?: string;
  oldValue?: string | null;
  newValue?: string | null;
  domain?: string;
  path?: string;
  title?: string;
  transitionType?: string;
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
  cookies?: string;
}

export interface RecordingEvent {
  timestamp: number;
  type: string;
  url?: string;
  data: RecordingEventData;
}

/** Raw recording record before conversion */
export interface RawRecordingRecord {
  id?: string;
  events?: RecordingEvent[];
  console?: ConsoleRecord[];
  network?: NetworkRecord[];
  storage?: StorageRecord[];
  startTime?: number;
  endTime?: number;
  url?: string;
  metadata?: RecordingMetadata;
  viewport?: { width: number; height: number };
  userAgent?: string;
  _originalEvents?: RecordingEvent[];
}

// ── rrweb preprocessor types ──────────────────────────────────────

export interface DomNode {
  tagName?: string;
  attributes?: Record<string, string>;
  textContent?: string;
  childNodes?: DomNode[];
  node?: DomNode;
}

export interface RRWebInnerData {
  node?: DomNode;
  source?: number;
  adds?: RRWebAdd[];
  positions?: unknown[];
}

export interface RRWebAdd {
  node?: DomNode;
  rule?: string;
}

export interface RRWebEvent {
  type?: number;
  source?: number;
  timestamp?: number;
  data?: RRWebInnerData | null;
  adds?: RRWebAdd[];
  positions?: unknown[];
}

export interface Snapshot {
  node: DomNode;
}

export interface PageTransition {
  index: number;
  timestamp: number;
  pageIndex: number;
}

export interface StaticResources {
  scripts: Set<string>;
  stylesheets: Set<string>;
  images: Set<string>;
  fonts: Set<string>;
  other: Set<string>;
}

export interface PreprocessedRecording {
  record: {
    events: RRWebEvent[];
    metadata?: RecordingMetadata;
    _preprocessed?: boolean;
    _pageTransitions?: PageTransition[];
    _fontUrls?: string[];
    _staticResources?: Record<string, string[]>;
  };
}

export interface PreprocessOptions {
  proxyPort?: number | null;
  onProgress?: (stage: string, progress: number, details?: PreprocessProgressDetails) => void;
}

export interface PreprocessProgressDetails {
  eventCount?: number;
  totalEvents?: number;
  phase?: string;
  resourcesFound?: number;
  eventsProcessed?: number;
  duplicatesFound?: number;
  resourcesNormalized?: number;
  totalResources?: number;
  prefetched?: number;
  failed?: number;
}

// ── Player types ──────────────────────────────────────────────────

export interface RRWebPlayerInstance {
  getReplayer: () => {
    getCurrentTime: () => number;
    getMetaData: () => { playing?: boolean };
    pause: () => void;
    play: (time?: number) => void;
  } | null;
  addEventListener: (event: string, handler: (event: { payload: unknown }) => void) => void;
  _restoreConsole?: () => void;
  _restoreCreateElement?: () => void;
  _eventHandlers?: {
    timeUpdate: ((event: { payload: unknown }) => void) | null;
    stateUpdate: ((event: { payload: unknown }) => void) | null;
  };
  $destroy?: () => void;
}

export type RRWebPlayerConstructor = new (options: {
  target: HTMLElement;
  props: RRWebPlayerProps;
}) => RRWebPlayerInstance;

export interface RRWebPlayerProps {
  events: RRWebEvent[];
  width?: number;
  height?: number;
  autoPlay?: boolean;
  speed?: number;
  showController?: boolean;
  mouseTail?: boolean;
  triggerFocus?: boolean;
  UNSAFE_replayCanvas?: boolean;
  skipInactive?: boolean;
  showDebug?: boolean;
  blockClass?: string;
  liveMode?: boolean;
  unpackFn?: null;
  showWarning?: boolean;
  insertStyleRules?: string[];
  pauseAnimation?: boolean;
  useVirtualDom?: boolean;
  plugins?: Array<{ handler: (event: RRWebEvent, isSync?: boolean, context?: unknown) => RRWebEvent | null }>;
}

// ── Time events ──────────────────────────────────────────────────

export type TimeEventType =
  | 'TIME_JUMP_FORWARD'
  | 'TIME_JUMP_BACKWARD'
  | 'TIMEZONE_CHANGE'
  | 'DST_CHANGE'
  | 'SYSTEM_WAKE'
  | 'MONOTONIC_DRIFT';

export interface TimeEvent {
  type: string;
  delta?: number;
  previousTimezone?: string;
  newTimezone?: string;
  previousOffset?: number;
  newOffset?: number;
  sleepDuration?: number;
  drift?: number;
}
