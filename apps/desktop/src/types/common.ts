/**
 * Common shared types used across multiple modules.
 *
 * Generic result types, IPC event placeholders, and utility types
 * that don't belong to a single domain.
 */

import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';

// ── IPC handler signatures ──────────────────────────────────────────
// IPC handlers receive the Electron event as first param.
// These aliases keep handler signatures readable.

/** First param of ipcMain.handle callbacks (request/response). */
export type IpcInvokeEvent = IpcMainInvokeEvent;

/** First param of ipcMain.on callbacks (fire-and-forget). */
export type IpcFireEvent = IpcMainEvent;

// ── JSON value types ───────────────────────────────────────────────
// Used for genuinely dynamic JSON data (HTTP bodies, JWT payloads, parsed config files)

export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

// ── Generic result types ────────────────────────────────────────────

/** Minimal success/error result returned by most IPC handlers. */
export interface OperationResult {
  success: boolean;
  error?: string;
  message?: string;
}

/** Narrowing helper — extracts the error message from an unknown catch value. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Narrows an unknown catch value to Error. */
export function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

/** Narrows an unknown catch value to NodeJS.ErrnoException. */
export function toErrno(error: unknown): NodeJS.ErrnoException {
  if (error instanceof Error) return error as NodeJS.ErrnoException;
  return new Error(String(error));
}
