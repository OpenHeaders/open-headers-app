/**
 * JSON Filter — shared between renderer and main process.
 * Applies JSON path traversal to extract values from responses.
 */

import type { JsonArray, JsonObject } from '../types/common';

export interface JsonFilterConfig {
  enabled: boolean;
  path?: string;
}

/**
 * Parse JSON safely, returning null on failure.
 */
function parseJSON(text: string): JsonObject | null {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

/**
 * Apply a JSON filter (dot-path traversal) to a response body.
 *
 * @param body  - Raw response body (string or parsed object)
 * @param filter - Filter configuration with `enabled` flag and `path`
 * @returns The extracted value as a string, or the original body if filter is inactive.
 */
export function applyJsonFilter(body: string | JsonObject, filter: JsonFilterConfig): string | JsonObject {
  const normalizedFilter = {
    enabled: filter?.enabled === true,
    path: filter?.enabled === true ? filter?.path || '' : '',
  };

  if (!normalizedFilter.enabled || !normalizedFilter.path) {
    return body;
  }

  try {
    let jsonObj: JsonObject;
    if (typeof body === 'string') {
      const parsed = parseJSON(body);
      if (!parsed) {
        return body;
      }
      jsonObj = parsed;
    } else {
      jsonObj = body;
    }

    // Check if this is an error response
    if (jsonObj.error) {
      let errorMessage = `Error: ${jsonObj.error}`;
      if (jsonObj.error_description) {
        errorMessage += ` - ${jsonObj.error_description}`;
      } else if (jsonObj.message) {
        errorMessage += ` - ${jsonObj.message}`;
      }
      return errorMessage;
    }

    // Extract path (remove 'root.' prefix if present)
    const path = normalizedFilter.path.startsWith('root.') ? normalizedFilter.path.substring(5) : normalizedFilter.path;

    if (!path) {
      return body;
    }

    // Navigate through path parts
    const parts = path.split('.');
    let current: unknown = jsonObj;

    for (const part of parts) {
      // Check for array notation: property[index]
      const arrayMatch = part.match(/^(\w+)\[(\d+)]$/);

      if (arrayMatch) {
        const [, propName, index] = arrayMatch;
        const currentObj = current as JsonObject;

        if (currentObj[propName] === undefined) {
          return `The field "${path}" was not found in the response.`;
        }

        if (!Array.isArray(currentObj[propName])) {
          return `The field "${propName}" exists but is not an array.`;
        }

        const idx = parseInt(index, 10);
        if (idx >= (currentObj[propName] as JsonArray).length) {
          return `The array index [${idx}] is out of bounds.`;
        }

        current = (currentObj[propName] as JsonArray)[idx];
      } else {
        const currentObj = current as JsonObject;
        if (currentObj[part] === undefined) {
          return `The field "${part}" was not found in the response.`;
        }
        current = currentObj[part];
      }
    }

    // Format result based on type
    if (typeof current === 'object' && current !== null) {
      return JSON.stringify(current, null, 2);
    } else {
      return String(current);
    }
  } catch (error: unknown) {
    return `Could not filter response: ${error instanceof Error ? error.message : String(error)}`;
  }
}
