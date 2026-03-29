import { describe, expect, it } from 'vitest';
import {
  getPathErrorMessage,
  getSearchPatterns,
  parseConfigPath,
} from '../../../src/services/workspace/config-path-parser';

describe('config-path-parser', () => {
  describe('parseConfigPath()', () => {
    it('returns default single path for null input', () => {
      const result = parseConfigPath(null);
      expect(result.type).toBe('single');
      expect(result).toHaveProperty('primaryPath', 'config/open-headers.json');
      expect(result).toHaveProperty('isDefault', true);
    });

    it('returns default single path for undefined input', () => {
      const result = parseConfigPath(undefined);
      expect(result.type).toBe('single');
      expect(result).toHaveProperty('isDefault', true);
    });

    it('returns default single path for empty string', () => {
      const result = parseConfigPath('');
      expect(result.type).toBe('single');
      expect(result).toHaveProperty('isDefault', true);
    });

    it('parses single file path with extension', () => {
      const result = parseConfigPath('config/open-headers.json');
      expect(result.type).toBe('single');
      expect(result).toHaveProperty('primaryPath', 'config/open-headers.json');
      expect(result).toHaveProperty('basePath', 'config');
      expect(result).toHaveProperty('fileName', 'open-headers.json');
    });

    it('normalizes backslashes to forward slashes', () => {
      const result = parseConfigPath('config\\sub\\file.json');
      expect(result.type).toBe('single');
      expect(result).toHaveProperty('primaryPath', 'config/sub/file.json');
    });

    it('trims whitespace from input', () => {
      const result = parseConfigPath('  config/file.json  ');
      expect(result.type).toBe('single');
      expect(result).toHaveProperty('primaryPath', 'config/file.json');
    });

    it('parses comma-separated paths (two files)', () => {
      const result = parseConfigPath('config/main.json,config/env.json');
      expect(result.type).toBe('comma-separated');
      expect(result).toHaveProperty('configPath', 'config/main.json');
      expect(result).toHaveProperty('envPath', 'config/env.json');
      expect(result).toHaveProperty('basePath', 'config');
    });

    it('handles spaces in comma-separated paths', () => {
      const result = parseConfigPath(' config/main.json , config/env.json ');
      expect(result.type).toBe('comma-separated');
      expect(result).toHaveProperty('configPath', 'config/main.json');
      expect(result).toHaveProperty('envPath', 'config/env.json');
    });

    it('parses folder path ending with /', () => {
      const result = parseConfigPath('config/');
      expect(result.type).toBe('folder');
      expect(result).toHaveProperty('folderPath', 'config');
      expect(result).toHaveProperty('basePath', 'config');
      expect(result).toHaveProperty('possibleFiles');
      if (result.type === 'folder') {
        expect(result.possibleFiles).toContain('config/open-headers.json');
        expect(result.possibleFiles).toContain('config/config.json');
      }
    });

    it('parses short name without extension as folder', () => {
      const result = parseConfigPath('config');
      expect(result.type).toBe('folder');
      expect(result).toHaveProperty('folderPath', 'config');
    });

    it('parses name with hyphen and no extension as base-path', () => {
      const result = parseConfigPath('config/open-headers');
      expect(result.type).toBe('base-path');
      expect(result).toHaveProperty('baseFileName', 'open-headers');
      expect(result).toHaveProperty('primaryPath', 'config/open-headers.json');
      expect(result).toHaveProperty('multiFileConfig', 'config/open-headers-config*.json');
      expect(result).toHaveProperty('multiFileEnv', 'config/open-headers-env*.json');
    });

    it('parses name with underscore and no extension as base-path', () => {
      const result = parseConfigPath('config/my_config');
      expect(result.type).toBe('base-path');
      expect(result).toHaveProperty('baseFileName', 'my_config');
    });

    it('parses very long name without extension as base-path', () => {
      const result = parseConfigPath('config/longenoughname');
      expect(result.type).toBe('base-path');
      expect(result).toHaveProperty('baseFileName', 'longenoughname');
    });
  });

  describe('getSearchPatterns()', () => {
    it('returns exact match for single file', () => {
      const parsed = parseConfigPath('config/file.json');
      const patterns = getSearchPatterns(parsed);
      expect(patterns.exactMatch).toBe(true);
      expect(patterns.configFiles).toEqual(['config/file.json']);
      expect(patterns.envFiles).toEqual([]);
    });

    it('returns exact match for comma-separated files', () => {
      const parsed = parseConfigPath('config/main.json,config/env.json');
      const patterns = getSearchPatterns(parsed);
      expect(patterns.exactMatch).toBe(true);
      expect(patterns.configFiles).toEqual(['config/main.json']);
      expect(patterns.envFiles).toEqual(['config/env.json']);
    });

    it('returns pattern match for folder path', () => {
      const parsed = parseConfigPath('mydir/');
      const patterns = getSearchPatterns(parsed);
      expect(patterns.exactMatch).toBe(false);
      expect(patterns.configFiles.length).toBeGreaterThan(0);
      expect(patterns.envFiles.length).toBeGreaterThan(0);
      // Should include standard config filenames
      expect(patterns.configFiles).toContain('mydir/open-headers.json');
      expect(patterns.configFiles).toContain('mydir/config.json');
    });

    it('returns pattern match for base-path', () => {
      const parsed = parseConfigPath('dir/open-headers');
      const patterns = getSearchPatterns(parsed);
      expect(patterns.exactMatch).toBe(false);
      expect(patterns.configFiles).toContain('dir/open-headers.json');
    });

    it('returns exact match for default path', () => {
      const parsed = parseConfigPath(null);
      const patterns = getSearchPatterns(parsed);
      expect(patterns.exactMatch).toBe(true);
      expect(patterns.configFiles).toEqual(['config/open-headers.json']);
    });
  });

  describe('getPathErrorMessage()', () => {
    it('includes single file path in error message', () => {
      const parsed = parseConfigPath('missing/file.json');
      const msg = getPathErrorMessage(parsed);
      expect(msg).toContain('missing/file.json');
      expect(msg).toContain('Supported path formats');
    });

    it('includes comma-separated paths in error message', () => {
      const parsed = parseConfigPath('a.json,b.json');
      const msg = getPathErrorMessage(parsed);
      expect(msg).toContain('a.json');
      expect(msg).toContain('b.json');
    });

    it('includes folder path in error message', () => {
      const parsed = parseConfigPath('myfolder/');
      const msg = getPathErrorMessage(parsed);
      expect(msg).toContain('myfolder');
    });

    it('includes base-path pattern in error message', () => {
      const parsed = parseConfigPath('dir/my-config');
      const msg = getPathErrorMessage(parsed);
      expect(msg).toContain('my-config');
    });

    it('suggests found JSON files for single file type', () => {
      const parsed = parseConfigPath('config/missing.json');
      const msg = getPathErrorMessage(parsed, ['config/found.json', 'config/other.txt']);
      expect(msg).toContain('found.json');
      expect(msg).toContain('Did you mean');
      expect(msg).not.toContain('other.txt');
    });

    it('shows found JSON files for folder type', () => {
      const parsed = parseConfigPath('configs/');
      const msg = getPathErrorMessage(parsed, ['file.json', 'readme.md']);
      expect(msg).toContain('file.json');
      expect(msg).toContain('Found these JSON files');
    });

    it('handles empty foundFiles array', () => {
      const parsed = parseConfigPath('missing.json');
      const msg = getPathErrorMessage(parsed, []);
      expect(msg).toContain('Supported path formats');
      expect(msg).not.toContain('Did you mean');
    });
  });
});
