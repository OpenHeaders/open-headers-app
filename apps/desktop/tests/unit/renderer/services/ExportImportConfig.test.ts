import { describe, expect, it } from 'vitest';
import {
  DEFAULTS,
  ERROR_MESSAGES,
  EVENTS,
  FILE_FILTERS,
  FILE_FORMATS,
  IMPORT_MODES,
  SUCCESS_MESSAGES,
  VALIDATION_RULES,
} from '../../../../src/renderer/services/export-import/core/ExportImportConfig';

// ---------------------------------------------------------------------------
// Constant shape and value checks
// ---------------------------------------------------------------------------
describe('ExportImportConfig constants', () => {
  describe('FILE_FORMATS', () => {
    it('has SINGLE and SEPARATE keys', () => {
      expect(FILE_FORMATS.SINGLE).toBe('single');
      expect(FILE_FORMATS.SEPARATE).toBe('separate');
    });
  });

  describe('IMPORT_MODES', () => {
    it('has MERGE and REPLACE keys', () => {
      expect(IMPORT_MODES.MERGE).toBe('merge');
      expect(IMPORT_MODES.REPLACE).toBe('replace');
    });
  });

  describe('FILE_FILTERS', () => {
    it('contains JSON filter with correct extensions', () => {
      expect(FILE_FILTERS.JSON).toEqual(expect.arrayContaining([expect.objectContaining({ extensions: ['json'] })]));
    });
  });

  describe('DEFAULTS', () => {
    it('has expected default values', () => {
      expect(DEFAULTS.ENVIRONMENT_NAME).toBe('Default');
      expect(DEFAULTS.WORKSPACE_TYPE).toBe('git');
      expect(DEFAULTS.WORKSPACE_BRANCH).toBe('main');
      expect(DEFAULTS.WORKSPACE_PATH).toBe('config/open-headers.json');
      expect(DEFAULTS.AUTH_TYPE).toBe('none');
      expect(DEFAULTS.AUTO_SYNC).toBe(true);
      expect(typeof DEFAULTS.APP_VERSION).toBe('string');
      expect(DEFAULTS.APP_VERSION.length).toBeGreaterThan(0);
      expect(typeof DEFAULTS.DATA_FORMAT_VERSION).toBe('string');
      expect(DEFAULTS.DATA_FORMAT_VERSION.length).toBeGreaterThan(0);
    });
  });

  describe('EVENTS', () => {
    it('has all expected event names with correct values', () => {
      expect(EVENTS).toEqual({
        PROXY_RULES_UPDATED: 'proxy-rules-updated',
        ENVIRONMENT_VARIABLES_CHANGED: 'environment-variables-changed',
      });
    });

    it('event names are non-empty strings', () => {
      Object.values(EVENTS).forEach((value) => {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      });
    });
  });

  describe('ERROR_MESSAGES', () => {
    it('has all expected keys', () => {
      expect(ERROR_MESSAGES.INVALID_FILE_FORMAT).toBeDefined();
      expect(ERROR_MESSAGES.EXPORT_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.IMPORT_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.FILE_OPERATION_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.WORKSPACE_CREATION_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.ENVIRONMENT_CREATION_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.NO_DATA_IMPORTED).toBeDefined();
    });
  });

  describe('SUCCESS_MESSAGES', () => {
    it('has all expected keys', () => {
      expect(SUCCESS_MESSAGES.EXPORT_COMPLETE).toBeDefined();
      expect(SUCCESS_MESSAGES.IMPORT_COMPLETE).toBeDefined();
      expect(SUCCESS_MESSAGES.GIT_SYNC_COMPLETE).toBeDefined();
      expect(SUCCESS_MESSAGES.WORKSPACE_SYNC_SUCCESS).toBeDefined();
      expect(SUCCESS_MESSAGES.ENVIRONMENT_VARIABLES_CREATED).toBeDefined();
    });
  });

  describe('VALIDATION_RULES', () => {
    it('has REQUIRED_FIELDS with expected data types', () => {
      expect(VALIDATION_RULES.REQUIRED_FIELDS.WORKSPACE).toEqual(['name', 'type']);
      expect(VALIDATION_RULES.REQUIRED_FIELDS.SOURCE).toEqual(['sourceId', 'sourceType', 'sourcePath']);
      expect(Array.isArray(VALIDATION_RULES.REQUIRED_FIELDS.PROXY_RULE)).toBe(true);
    });

    it('has positive MAX_NAME_LENGTH', () => {
      expect(VALIDATION_RULES.MAX_NAME_LENGTH).toBeGreaterThan(0);
      expect(VALIDATION_RULES.MAX_NAME_LENGTH).toBe(255);
    });

    it('has non-empty SUPPORTED_VERSIONS array', () => {
      expect(Array.isArray(VALIDATION_RULES.SUPPORTED_VERSIONS)).toBe(true);
      expect(VALIDATION_RULES.SUPPORTED_VERSIONS.length).toBeGreaterThan(0);
    });
  });
});
