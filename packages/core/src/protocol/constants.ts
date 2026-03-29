/**
 * Protocol constants shared between all OpenHeaders components.
 */

/** WebSocket server port for desktop app ↔ extension/CLI communication */
export const WS_PORT = 59210;

/** WebSocket server URL */
export const WS_SERVER_URL = `ws://127.0.0.1:${WS_PORT}`;

/** Custom protocol scheme for deep linking */
export const PROTOCOL_NAME = 'openheaders';

/** Recording message types used by both background and content scripts */
export const MESSAGE_TYPES = {
  START_RECORDING: 'START_RECORDING',
  STOP_RECORDING: 'STOP_RECORDING',
  CANCEL_RECORDING: 'CANCEL_RECORDING',
  GET_RECORDING_STATE: 'GET_RECORDING_STATE',
  CHECK_RECORDING_STATUS: 'CHECK_RECORDING_STATUS',
  UPDATE_RECORDING_WIDGET: 'UPDATE_RECORDING_WIDGET',
  RECORDING_STARTED: 'RECORDING_STARTED',
  RECORDING_STOPPED: 'RECORDING_STOPPED',
  RECORDING_ERROR: 'RECORDING_ERROR',
  RECORDING_DATA: 'RECORDING_DATA',
} as const;

export type MessageType = typeof MESSAGE_TYPES[keyof typeof MESSAGE_TYPES];

export const RECORDING_STATES = {
  IDLE: 'idle',
  RECORDING: 'recording',
  STOPPING: 'stopping',
} as const;

export type RecordingStateType = typeof RECORDING_STATES[keyof typeof RECORDING_STATES];
