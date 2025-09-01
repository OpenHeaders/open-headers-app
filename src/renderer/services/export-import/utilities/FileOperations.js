/**
 * File Operations Utilities for Export/Import Functionality
 * 
 * This module handles all file-related operations including file dialogs, path generation,
 * and file reading/writing operations. It provides cross-platform file handling with
 * proper error handling and security considerations.
 * 
 * Key features:
 * - Cross-platform file dialogs (save/open)
 * - JSON file reading/writing with pretty-printing
 * - Secure file path validation
 * - Multi-file export coordination
 * - Timestamp-based filename generation
 * - Path manipulation utilities
 */

import { FILE_FILTERS, ERROR_MESSAGES } from '../core/ExportImportConfig.js';

/**
 * Generates a timestamp-based filename for exports
 * 
 * Creates unique filenames by appending ISO timestamp to prevent overwrites.
 * Format: prefix_suffix_YYYY-MM-DDTHH-MM-SS.extension
 * 
 * @param {string} prefix - Filename prefix (e.g., 'open-headers-config')
 * @param {string} suffix - Optional suffix (e.g., 'env')
 * @param {string} extension - File extension (default: 'json')
 * @returns {string} - Generated filename with timestamp
 */
export function generateTimestampedFilename(prefix = 'open-headers-config', suffix = '', extension = 'json') {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const suffixPart = suffix ? `_${suffix}` : '';
  return `${prefix}${suffixPart}_${timestamp}.${extension}`;
}

/**
 * Shows a save file dialog for exporting data
 * 
 * Opens a native file save dialog with JSON file filters. Handles user cancellation
 * and provides consistent error handling across platforms.
 * 
 * @param {Object} options - Dialog options
 * @param {string} options.title - Dialog title
 * @param {string} options.defaultPath - Default filename
 * @param {string} options.buttonLabel - Save button label
 * @returns {Promise<string|null>} - Selected file path or null if cancelled
 */
export async function showExportFileDialog({ 
  title = 'Export Configuration', 
  defaultPath, 
  buttonLabel = 'Export' 
}) {
  try {
    return await window.electronAPI.saveFileDialog({
      title,
      buttonLabel,
      defaultPath,
      filters: FILE_FILTERS.JSON
    });
  } catch (error) {
    throw new Error(`${ERROR_MESSAGES.FILE_OPERATION_FAILED}: ${error.message}`);
  }
}

/**
 * Shows an open file dialog for importing data
 * 
 * Opens a native file open dialog with JSON file filters. Supports both single
 * and multiple file selection modes.
 * 
 * @param {Object} options - Dialog options
 * @param {string} options.title - Dialog title
 * @param {string} options.buttonLabel - Open button label
 * @param {boolean} options.multiSelect - Allow multiple file selection
 * @returns {Promise<string[]|null>} - Selected file paths or null if cancelled
 */
export async function showImportFileDialog({ 
  title = 'Import Configuration', 
  buttonLabel = 'Import',
  multiSelect = false 
}) {
  try {
    return await window.electronAPI.openFileDialog({
      title,
      buttonLabel,
      filters: FILE_FILTERS.JSON,
      properties: multiSelect ? ['openFile', 'multiSelections'] : ['openFile']
    });
  } catch (error) {
    throw new Error(`${ERROR_MESSAGES.FILE_OPERATION_FAILED}: ${error.message}`);
  }
}

/**
 * Writes data to a file as JSON
 * 
 * Serializes JavaScript objects to JSON and writes to file. Supports both
 * pretty-printed (human-readable) and compact formats.
 * 
 * @param {string} filePath - Path to write the file
 * @param {Object} data - Data to write
 * @param {boolean} pretty - Whether to pretty-print the JSON (default: true)
 * @returns {Promise<void>}
 */
export async function writeJsonFile(filePath, data, pretty = true) {
  try {
    const jsonString = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    await window.electronAPI.writeFile(filePath, jsonString);
  } catch (error) {
    throw new Error(`Failed to write file ${filePath}: ${error.message}`);
  }
}

/**
 * Reads and parses a JSON file
 * @param {string} filePath - Path to the file to read
 * @returns {Promise<Object>} - Parsed JSON data
 */
export async function readJsonFile(filePath) {
  try {
    const content = await window.electronAPI.readFile(filePath);
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error.message}`);
  }
}

/**
 * Generates a companion file path for environment data
 * @param {string} mainFilePath - Path to the main export file
 * @param {string} envFileName - Environment file name
 * @returns {string} - Path for the environment file
 */
export function generateCompanionFilePath(mainFilePath, envFileName) {
  const lastSlashIndex = mainFilePath.lastIndexOf('/');
  const lastBackslashIndex = mainFilePath.lastIndexOf('\\');
  const separatorIndex = Math.max(lastSlashIndex, lastBackslashIndex);
  
  if (separatorIndex === -1) {
    // No directory separator found, files are in current directory
    return envFileName;
  }
  
  const directory = mainFilePath.substring(0, separatorIndex + 1);
  return `${directory}${envFileName}`;
}

/**
 * Validates that a file path is safe for writing
 * 
 * Performs security checks to prevent directory traversal attacks and access
 * to system files. Validates against common dangerous patterns.
 * 
 * @param {string} filePath - File path to validate
 * @returns {Object} - Validation result
 */
export function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return {
      success: false,
      error: 'File path must be a non-empty string'
    };
  }

  // Check for potentially dangerous patterns
  const dangerousPatterns = [
    /\.\./,  // Parent directory traversal
    /^\/dev\//,  // Device files (Unix)
    /^\/proc\//,  // Process files (Unix)
    /^\/sys\//,  // System files (Unix)
    /^[A-Z]:\\/,  // Drive root (Windows)
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(filePath)) {
      return {
        success: false,
        error: 'File path contains potentially unsafe patterns'
      };
    }
  }

  return { success: true };
}


/**
 * Handles multi-file export operations
 * 
 * Coordinates the export of multiple related files (main config + environment data).
 * Automatically generates companion file paths in the same directory as the main file.
 * 
 * @param {Object} options - Export options
 * @param {Object} mainData - Main configuration data
 * @param {Object} environmentData - Environment data (optional)
 * @returns {Promise<Array<string>>} - Array of written file paths
 */
export async function handleMultiFileExport({ 
  title = 'Export Configuration',
  mainFilename,
  environmentFilename,
  mainData,
  environmentData
}) {
  const writtenFiles = [];

  // Get main file path
  const mainFilePath = await showExportFileDialog({
    title: `${title} (Main)`,
    defaultPath: mainFilename,
    buttonLabel: 'Export'
  });

  if (!mainFilePath) {
    throw new Error('Export cancelled by user');
  }

  // Write main configuration file
  await writeJsonFile(mainFilePath, mainData);
  writtenFiles.push(mainFilePath);

  // Write environment file if provided
  if (environmentData && environmentFilename) {
    const envFilePath = generateCompanionFilePath(mainFilePath, environmentFilename);
    await writeJsonFile(envFilePath, environmentData);
    writtenFiles.push(envFilePath);
  }

  return writtenFiles;
}

/**
 * Handles single-file export operations
 * 
 * Simplified export flow for single-file exports. Shows dialog, writes file,
 * and returns the path of the written file.
 * 
 * @param {Object} options - Export options
 * @param {string} filename - Default filename
 * @param {Object} data - Data to export
 * @returns {Promise<string>} - Path to written file
 */
export async function handleSingleFileExport({ filename, data }) {
  const filePath = await showExportFileDialog({
    title: 'Export Configuration',
    defaultPath: filename,
    buttonLabel: 'Export'
  });

  if (!filePath) {
    throw new Error('Export cancelled by user');
  }

  await writeJsonFile(filePath, data);
  return filePath;
}

