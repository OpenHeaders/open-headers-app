/**
 * Desktop-specific common types.
 *
 * Shared types (JsonValue, OperationResult, errorMessage, toError) are
 * imported directly from '@openheaders/core'. This file only contains
 * types that depend on Electron or Node-specific APIs.
 */

import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';

// Re-export shared types so existing `@/types/common` imports keep working
export type {
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  OperationResult,
} from '@openheaders/core';
export { errorMessage, toError } from '@openheaders/core';

// -- IPC handler signatures -------------------------------------------------
// IPC handlers receive the Electron event as first param.
// These aliases keep handler signatures readable.

/** First param of ipcMain.handle callbacks (request/response). */
export type IpcInvokeEvent = IpcMainInvokeEvent;

/** First param of ipcMain.on callbacks (fire-and-forget). */
export type IpcFireEvent = IpcMainEvent;

// -- Node-specific error helpers --------------------------------------------

/** Narrows an unknown catch value to NodeJS.ErrnoException. */
export function toErrno(error: unknown): NodeJS.ErrnoException {
  if (error instanceof Error) return error as NodeJS.ErrnoException;
  return new Error(String(error));
}
