import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the ExportImportConfig module
vi.mock('../../../../../src/renderer/services/export-import/core/ExportImportConfig', () => ({
  FILE_FILTERS: {
    JSON: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  },
  ERROR_MESSAGES: {
    FILE_OPERATION_FAILED: 'File operation failed',
  },
}));

const {
  generateTimestampedFilename,
  generateCompanionFilePath,
  validateFilePath,
  showExportFileDialog,
  showImportFileDialog,
  writeJsonFile,
  readJsonFile,
  handleSingleFileExport,
  handleMultiFileExport,
} = await import(
  '../../../../../src/renderer/services/export-import/utilities/FileOperations'
);

describe('FileOperations', () => {
  // ========================================================================
  // generateTimestampedFilename (pure)
  // ========================================================================
  describe('generateTimestampedFilename', () => {
    it('generates filename with default prefix and no suffix', () => {
      const result = generateTimestampedFilename();
      expect(result).toMatch(/^open-headers-config_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
    });

    it('uses custom prefix', () => {
      const result = generateTimestampedFilename('my-export');
      expect(result).toMatch(/^my-export_\d{4}/);
    });

    it('includes suffix when provided', () => {
      const result = generateTimestampedFilename('config', 'env');
      expect(result).toMatch(/^config_env_\d{4}/);
    });

    it('uses custom extension', () => {
      const result = generateTimestampedFilename('config', '', 'txt');
      expect(result).toMatch(/\.txt$/);
    });

    it('replaces colons in ISO timestamp with hyphens', () => {
      const result = generateTimestampedFilename();
      expect(result).not.toContain(':');
    });

    it('does not include milliseconds', () => {
      const result = generateTimestampedFilename();
      // Should not contain the .XXX millisecond portion
      expect(result).not.toMatch(/\.\d{3}\./);
    });
  });

  // ========================================================================
  // generateCompanionFilePath (pure)
  // ========================================================================
  describe('generateCompanionFilePath', () => {
    it('generates companion path in same directory (Unix)', () => {
      const result = generateCompanionFilePath('/home/user/export.json', 'env.json');
      expect(result).toBe('/home/user/env.json');
    });

    it('generates companion path in same directory (Windows)', () => {
      const result = generateCompanionFilePath('C:\\Users\\export.json', 'env.json');
      expect(result).toBe('C:\\Users\\env.json');
    });

    it('returns just filename when no directory separator', () => {
      const result = generateCompanionFilePath('export.json', 'env.json');
      expect(result).toBe('env.json');
    });

    it('handles mixed separators (uses last one)', () => {
      const result = generateCompanionFilePath('/home/user\\docs/export.json', 'env.json');
      expect(result).toBe('/home/user\\docs/env.json');
    });

    it('handles path with trailing separator', () => {
      const result = generateCompanionFilePath('/home/user/', 'env.json');
      expect(result).toBe('/home/user/env.json');
    });
  });

  // ========================================================================
  // validateFilePath (pure)
  // ========================================================================
  describe('validateFilePath', () => {
    it('returns success for valid path', () => {
      const result = validateFilePath('/home/user/exports/config.json');
      expect(result.success).toBe(true);
    });

    it('rejects null path', () => {
      const result = validateFilePath(null as any);
      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('rejects undefined path', () => {
      const result = validateFilePath(undefined as any);
      expect(result.success).toBe(false);
    });

    it('rejects empty string path', () => {
      const result = validateFilePath('');
      expect(result.success).toBe(false);
    });

    it('rejects non-string path', () => {
      const result = validateFilePath(123 as any);
      expect(result.success).toBe(false);
    });

    it('rejects parent directory traversal (..)', () => {
      const result = validateFilePath('/home/user/../etc/passwd');
      expect(result.success).toBe(false);
      expect(result.error).toContain('unsafe');
    });

    it('rejects /dev/ paths', () => {
      const result = validateFilePath('/dev/null');
      expect(result.success).toBe(false);
    });

    it('rejects /proc/ paths', () => {
      const result = validateFilePath('/proc/self/environ');
      expect(result.success).toBe(false);
    });

    it('rejects /sys/ paths', () => {
      const result = validateFilePath('/sys/class/block');
      expect(result.success).toBe(false);
    });

    it('rejects Windows drive root paths', () => {
      const result = validateFilePath('C:\\Windows\\System32\\config.json');
      expect(result.success).toBe(false);
    });

    it('accepts paths that happen to contain "dev" not at /dev/', () => {
      const result = validateFilePath('/home/developer/config.json');
      expect(result.success).toBe(true);
    });
  });

  // ========================================================================
  // showExportFileDialog / showImportFileDialog / writeJsonFile / readJsonFile
  // (require window.electronAPI mock)
  // ========================================================================
  describe('electronAPI-dependent operations', () => {
    let mockElectronAPI: any;

    beforeEach(() => {
      mockElectronAPI = {
        saveFileDialog: vi.fn(),
        openFileDialog: vi.fn(),
        writeFile: vi.fn(),
        readFile: vi.fn(),
      };
      vi.stubGlobal('window', { electronAPI: mockElectronAPI });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    describe('showExportFileDialog', () => {
      it('returns file path from dialog', async () => {
        mockElectronAPI.saveFileDialog.mockResolvedValue('/path/to/file.json');
        const result = await showExportFileDialog({ defaultPath: 'config.json' });
        expect(result).toBe('/path/to/file.json');
      });

      it('passes correct options to dialog', async () => {
        mockElectronAPI.saveFileDialog.mockResolvedValue(null);
        await showExportFileDialog({
          title: 'My Export',
          defaultPath: 'config.json',
          buttonLabel: 'Save',
        });
        expect(mockElectronAPI.saveFileDialog).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'My Export',
            defaultPath: 'config.json',
            buttonLabel: 'Save',
          })
        );
      });

      it('returns null when user cancels', async () => {
        mockElectronAPI.saveFileDialog.mockResolvedValue(null);
        const result = await showExportFileDialog({});
        expect(result).toBeNull();
      });

      it('throws on dialog error', async () => {
        mockElectronAPI.saveFileDialog.mockRejectedValue(new Error('dialog err'));
        await expect(showExportFileDialog({})).rejects.toThrow('File operation failed');
      });
    });

    describe('showImportFileDialog', () => {
      it('returns file paths from dialog', async () => {
        mockElectronAPI.openFileDialog.mockResolvedValue(['/path/to/file.json']);
        const result = await showImportFileDialog({});
        expect(result).toEqual(['/path/to/file.json']);
      });

      it('passes multiSelect as property', async () => {
        mockElectronAPI.openFileDialog.mockResolvedValue(null);
        await showImportFileDialog({ multiSelect: true });
        expect(mockElectronAPI.openFileDialog).toHaveBeenCalledWith(
          expect.objectContaining({
            properties: ['openFile', 'multiSelections'],
          })
        );
      });

      it('uses single file selection by default', async () => {
        mockElectronAPI.openFileDialog.mockResolvedValue(null);
        await showImportFileDialog({});
        expect(mockElectronAPI.openFileDialog).toHaveBeenCalledWith(
          expect.objectContaining({
            properties: ['openFile'],
          })
        );
      });

      it('throws on dialog error', async () => {
        mockElectronAPI.openFileDialog.mockRejectedValue(new Error('dialog err'));
        await expect(showImportFileDialog({})).rejects.toThrow('File operation failed');
      });
    });

    describe('writeJsonFile', () => {
      it('writes pretty-printed JSON by default', async () => {
        await writeJsonFile('/path/file.json', { key: 'value' });
        expect(mockElectronAPI.writeFile).toHaveBeenCalledWith(
          '/path/file.json',
          JSON.stringify({ key: 'value' }, null, 2)
        );
      });

      it('writes compact JSON when pretty is false', async () => {
        await writeJsonFile('/path/file.json', { key: 'value' }, false);
        expect(mockElectronAPI.writeFile).toHaveBeenCalledWith(
          '/path/file.json',
          JSON.stringify({ key: 'value' })
        );
      });

      it('throws on write error', async () => {
        mockElectronAPI.writeFile.mockRejectedValue(new Error('write err'));
        await expect(writeJsonFile('/path/file.json', {})).rejects.toThrow(
          'Failed to write file'
        );
      });
    });

    describe('readJsonFile', () => {
      it('reads and parses JSON file', async () => {
        mockElectronAPI.readFile.mockResolvedValue('{"key":"value"}');
        const result = await readJsonFile('/path/file.json');
        expect(result).toEqual({ key: 'value' });
      });

      it('throws on read error', async () => {
        mockElectronAPI.readFile.mockRejectedValue(new Error('read err'));
        await expect(readJsonFile('/path/file.json')).rejects.toThrow(
          'Failed to read file'
        );
      });

      it('throws on invalid JSON', async () => {
        mockElectronAPI.readFile.mockResolvedValue('not json');
        await expect(readJsonFile('/path/file.json')).rejects.toThrow(
          'Failed to read file'
        );
      });
    });

    describe('handleSingleFileExport', () => {
      it('writes data and returns file path', async () => {
        mockElectronAPI.saveFileDialog.mockResolvedValue('/path/config.json');
        mockElectronAPI.writeFile.mockResolvedValue(undefined);

        const result = await handleSingleFileExport({
          filename: 'config.json',
          data: { key: 'value' },
        });

        expect(result).toBe('/path/config.json');
        expect(mockElectronAPI.writeFile).toHaveBeenCalled();
      });

      it('throws when user cancels', async () => {
        mockElectronAPI.saveFileDialog.mockResolvedValue(null);
        await expect(
          handleSingleFileExport({ filename: 'config.json', data: {} })
        ).rejects.toThrow('cancelled');
      });
    });

    describe('handleMultiFileExport', () => {
      it('writes main and environment files', async () => {
        mockElectronAPI.saveFileDialog.mockResolvedValue('/path/config.json');
        mockElectronAPI.writeFile.mockResolvedValue(undefined);

        const result = await handleMultiFileExport({
          mainFilename: 'config.json',
          environmentFilename: 'env.json',
          mainData: { sources: [] },
          environmentData: { Default: {} },
        });

        expect(result).toHaveLength(2);
        expect(result[0]).toBe('/path/config.json');
        expect(result[1]).toBe('/path/env.json');
      });

      it('writes only main file when no environment data', async () => {
        mockElectronAPI.saveFileDialog.mockResolvedValue('/path/config.json');
        mockElectronAPI.writeFile.mockResolvedValue(undefined);

        const result = await handleMultiFileExport({
          mainFilename: 'config.json',
          mainData: { sources: [] },
          environmentData: null,
          environmentFilename: undefined,
        });

        expect(result).toHaveLength(1);
      });

      it('throws when user cancels', async () => {
        mockElectronAPI.saveFileDialog.mockResolvedValue(null);
        await expect(
          handleMultiFileExport({
            mainFilename: 'config.json',
            mainData: {},
          })
        ).rejects.toThrow('cancelled');
      });
    });
  });
});
