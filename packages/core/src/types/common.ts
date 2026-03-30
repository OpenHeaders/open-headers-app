/**
 * Common utility types and helpers.
 *
 * Framework-agnostic types used across both the desktop app
 * and browser extension.
 */

// -- JSON value types -------------------------------------------------------
// Used for genuinely dynamic JSON data (HTTP bodies, JWT payloads, parsed config files)

export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

// -- Generic result types ---------------------------------------------------

/** Minimal success/error result returned by most IPC handlers. */
export interface OperationResult {
  success: boolean;
  error?: string;
  message?: string;
}

// -- Error helpers ----------------------------------------------------------

/** Narrowing helper -- extracts the error message from an unknown catch value. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Narrows an unknown catch value to Error. */
export function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}
