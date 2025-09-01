const path = require('path');

/**
 * Parse and normalize configuration path input from user
 * Supports multiple formats:
 * 1. Single file: "config/open-headers.json"
 * 2. Folder path: "config/" or "config" 
 * 3. Comma-separated: "config/config.json,config/env.json"
 * 4. Base path for multi-file: "config/open-headers"
 * 
 * @param {string} userInput - The raw path input from user
 * @returns {Object} Parsed path information
 */
function parseConfigPath(userInput) {
  if (!userInput || typeof userInput !== 'string') {
    return {
      type: 'single',
      primaryPath: 'config/open-headers.json',
      basePath: 'config',
      isDefault: true
    };
  }

  // Trim and normalize slashes
  const input = userInput.trim().replace(/\\/g, '/');
  
  // Check if it's comma-separated (explicit multi-file)
  if (input.includes(',')) {
    const paths = input.split(',').map(p => p.trim()).filter(p => p);
    if (paths.length === 2) {
      return {
        type: 'comma-separated',
        configPath: paths[0],
        envPath: paths[1],
        basePath: path.dirname(paths[0]).replace(/\\/g, '/')
      };
    }
  }
  
  // Check if it's a folder path (ends with /)
  const isFolder = input.endsWith('/');
  
  if (isFolder) {
    // Clean up folder path
    const folderPath = input.slice(0, -1);
    
    return {
      type: 'folder',
      folderPath: folderPath,
      basePath: folderPath,
      // Will need to auto-detect files in this folder
      possibleFiles: [
        `${folderPath}/open-headers.json`,
        `${folderPath}/config.json`,
        `${folderPath}/configuration.json`,
        `${folderPath}/open-headers-config.json`,
        `${folderPath}/open-headers-env.json`
      ]
    };
  }
  
  // Check if it has no extension and contains a filename part
  // This distinguishes "config/open-headers" (base path) from "config" (folder)
  if (!path.extname(input)) {
    const parts = input.split('/');
    const lastPart = parts[parts.length - 1];
    
    // If the last part looks like a filename (contains hyphen or underscore or is longer)
    // treat it as a base path, otherwise it's a folder
    if (lastPart.includes('-') || lastPart.includes('_') || lastPart.length > 10) {
      return {
        type: 'base-path',
        basePath: path.dirname(input).replace(/\\/g, '/'),
        baseFileName: path.basename(input),
        // These will be checked in order
        primaryPath: `${input}.json`,
        multiFileConfig: `${input}-config*.json`,
        multiFileEnv: `${input}-env*.json`
      };
    } else {
      // It's a folder without trailing slash
      return {
        type: 'folder',
        folderPath: input,
        basePath: input,
        // Will need to auto-detect files in this folder
        possibleFiles: [
          `${input}/open-headers.json`,
          `${input}/config.json`,
          `${input}/configuration.json`,
          `${input}/open-headers-config.json`,
          `${input}/open-headers-env.json`
        ]
      };
    }
  }
  
  // Standard single file path
  return {
    type: 'single',
    primaryPath: input,
    basePath: path.dirname(input).replace(/\\/g, '/'),
    fileName: path.basename(input)
  };
}

/**
 * Get the search patterns for a parsed config path
 * @param {Object} parsedPath - Result from parseConfigPath
 * @returns {Object} Search patterns for different file types
 */
function getSearchPatterns(parsedPath) {
  switch (parsedPath.type) {
    case 'comma-separated':
      return {
        configFiles: [parsedPath.configPath],
        envFiles: [parsedPath.envPath],
        exactMatch: true
      };
      
    case 'folder':
      return {
        configFiles: [
          `${parsedPath.folderPath}/open-headers.json`,
          `${parsedPath.folderPath}/config.json`,
          `${parsedPath.folderPath}/configuration.json`,
          `${parsedPath.folderPath}/open-headers-config*.json`,
          `${parsedPath.folderPath}/open-headers-conf*.json`,
          `${parsedPath.folderPath}/config_*.json`,
          `${parsedPath.folderPath}/configuration_*.json`
        ],
        envFiles: [
          `${parsedPath.folderPath}/open-headers-env*.json`,
          `${parsedPath.folderPath}/open-headers-environment*.json`,
          `${parsedPath.folderPath}/env_*.json`,
          `${parsedPath.folderPath}/environment_*.json`,
          `${parsedPath.folderPath}/environments.json`
        ],
        exactMatch: false
      };
      
    case 'base-path':
      return {
        configFiles: [
          parsedPath.primaryPath,
          parsedPath.multiFileConfig
        ],
        envFiles: [
          parsedPath.multiFileEnv
        ],
        exactMatch: false
      };
      
    case 'single':
    default:
      return {
        configFiles: [parsedPath.primaryPath],
        envFiles: [],
        exactMatch: true
      };
  }
}

/**
 * Generate helpful error message based on what was searched
 * @param {Object} parsedPath - Result from parseConfigPath
 * @param {Array} foundFiles - Array of files that were found in the directory
 * @returns {string} Error message
 */
function getPathErrorMessage(parsedPath, foundFiles = []) {
  const jsonFiles = foundFiles.filter(f => f.endsWith('.json'));
  
  let message = 'Configuration file not found. ';
  
  switch (parsedPath.type) {
    case 'comma-separated':
      message += `Could not find one or both files: ${parsedPath.configPath}, ${parsedPath.envPath}`;
      break;
      
    case 'folder':
      message += `No valid Open Headers configuration files found in folder: ${parsedPath.folderPath}`;
      if (jsonFiles.length > 0) {
        message += `\n\nFound these JSON files: ${jsonFiles.join(', ')}`;
      }
      break;
      
    case 'base-path':
      message += `Could not find configuration files matching pattern: ${parsedPath.baseFileName}*.json`;
      if (jsonFiles.length > 0) {
        message += `\n\nFound these JSON files: ${jsonFiles.join(', ')}`;
      }
      break;
      
    case 'single':
    default:
      message += `File not found: ${parsedPath.primaryPath}`;
      if (jsonFiles.length > 0) {
        message += `\n\nDid you mean one of these? ${jsonFiles.join(', ')}`;
      }
  }
  
  message += '\n\nSupported path formats:\n';
  message += '• Single file: config/open-headers.json\n';
  message += '• Folder path: config/ or config\n';
  message += '• Base path: config/open-headers (detects -config and -env files)\n';
  message += '• Comma-separated: config/main.json,config/env.json';
  
  return message;
}

module.exports = {
  parseConfigPath,
  getSearchPatterns,
  getPathErrorMessage
};