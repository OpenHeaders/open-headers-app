const fs = require('fs').promises;
const path = require('path');
const { analyzeConfigFile } = require('../../utils/configValidator');
const { createLogger } = require('../../utils/mainLogger');

const log = createLogger('ConfigFileDetector');

/**
 * Detect and validate configuration files based on search patterns
 * @param {string} repoDir - Repository directory
 * @param {Object} searchPatterns - Search patterns from getSearchPatterns
 * @returns {Object} Validation result
 */
async function detectAndValidateConfig(repoDir, searchPatterns) {
  log.info('=== Config File Detection ===');
  log.info('Repository directory:', repoDir);
  log.info('Search patterns:', JSON.stringify(searchPatterns, null, 2));
  
  // Try exact matches first if specified
  if (searchPatterns.exactMatch) {
    // For comma-separated paths, validate both files exist
    if (searchPatterns.configFiles.length > 0 && searchPatterns.envFiles.length > 0) {
      try {
        const configPath = path.join(repoDir, searchPatterns.configFiles[0]);
        const envPath = path.join(repoDir, searchPatterns.envFiles[0]);
        
        // Check both files exist
        await fs.access(configPath);
        await fs.access(envPath);
        
        // Read and combine both files
        const configContent = await fs.readFile(configPath, 'utf8');
        const envContent = await fs.readFile(envPath, 'utf8');
        
        const configData = JSON.parse(configContent);
        const envData = JSON.parse(envContent);
        
        // Merge environment data into config
        const combinedData = {
          ...configData,
          ...(envData.environmentSchema && { environmentSchema: envData.environmentSchema }),
          ...(envData.environments && { environments: envData.environments })
        };
        
        const validationResult = await analyzeConfigFile(JSON.stringify(combinedData));
        if (validationResult.valid) {
          return {
            success: true,
            message: `Connection successful! Found comma-separated configuration files with ${validationResult.sourceCount || 0} sources, ${validationResult.ruleCount || 0} rules, ${validationResult.proxyRuleCount || 0} proxy rules, and ${validationResult.variableCount || 0} environment variables.`,
            details: {
              rawData: combinedData,
              validationResults: validationResult
            }
          };
        } else {
          return {
            success: false,
            error: validationResult.error,
            details: validationResult
          };
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new Error(`One or both files not found: ${searchPatterns.configFiles[0]}, ${searchPatterns.envFiles[0]}`);
        }
        throw error;
      }
    }
    
    // Single exact file
    if (searchPatterns.configFiles.length > 0) {
      const configPath = path.join(repoDir, searchPatterns.configFiles[0]);
      const content = await fs.readFile(configPath, 'utf8');
      const validationResult = await analyzeConfigFile(content);
      if (validationResult.valid) {
        return {
          success: true,
          message: `Connection successful! Found configuration file with ${validationResult.sourceCount || 0} sources, ${validationResult.ruleCount || 0} rules, ${validationResult.proxyRuleCount || 0} proxy rules, and ${validationResult.variableCount || 0} environment variables.`,
          details: {
            rawData: JSON.parse(content),
            validationResults: validationResult
          }
        };
      } else {
        return {
          success: false,
          error: validationResult.error,
          details: validationResult
        };
      }
    }
  }
  
  // For pattern-based searches, try to find matching files
  let foundConfigFile = null;
  let foundEnvFile = null;
  
  log.info('Starting pattern-based search...');
  
  // Search for config files
  for (const pattern of searchPatterns.configFiles) {
    log.info('Checking pattern:', pattern);
    if (pattern.includes('*')) {
      // Pattern matching - list directory and find matches
      const dir = path.dirname(pattern);
      const filePattern = path.basename(pattern);
      
      log.info(`Pattern matching: dir="${dir}", filePattern="${filePattern}"`);
      
      try {
        const dirPath = path.join(repoDir, dir);
        const files = await fs.readdir(dirPath);
        log.info(`Files in ${dirPath}:`, files);
        
        // Find files matching the pattern
        const matches = files.filter(f => {
          if (!f.endsWith('.json')) return false;
          
          // Remove the asterisk and check pattern
          const basePattern = filePattern.replace('*', '');
          
          if (filePattern.startsWith('*')) {
            return f.endsWith(basePattern);
          } else if (filePattern.endsWith('*')) {
            return f.startsWith(basePattern);
          } else {
            const parts = filePattern.split('*');
            return f.startsWith(parts[0]) && f.endsWith(parts[1] || '');
          }
        });
        
        log.info(`Matches for pattern "${filePattern}":`, matches);
        
        if (matches.length > 0) {
          // Sort to get most recent file if multiple matches
          matches.sort((a, b) => b.localeCompare(a));
          foundConfigFile = path.join(dir, matches[0]);
          log.info(`Found config file: ${foundConfigFile}`);
          break;
        }
      } catch (error) {
        log.warn(`Could not read directory ${dir}:`, error.message);
      }
    } else {
      // Exact file path
      try {
        const filePath = path.join(repoDir, pattern);
        await fs.access(filePath);
        foundConfigFile = pattern;
        break;
      } catch (error) {
        // File doesn't exist, continue
      }
    }
  }
  
  // Search for env files
  for (const pattern of searchPatterns.envFiles) {
    if (pattern.includes('*')) {
      // Pattern matching
      const dir = path.dirname(pattern);
      const filePattern = path.basename(pattern).replace('*', '');
      
      try {
        const dirPath = path.join(repoDir, dir);
        const files = await fs.readdir(dirPath);
        
        const matches = files.filter(f => {
          if (!f.endsWith('.json')) return false;
          if (filePattern.startsWith('*')) {
            return f.endsWith(filePattern.substring(1));
          } else if (filePattern.endsWith('*')) {
            return f.startsWith(filePattern.substring(0, filePattern.length - 1));
          } else {
            const parts = filePattern.split('*');
            return f.startsWith(parts[0]) && f.endsWith(parts[1] || '');
          }
        });
        
        if (matches.length > 0) {
          matches.sort((a, b) => b.localeCompare(a));
          foundEnvFile = path.join(dir, matches[0]);
          break;
        }
      } catch (error) {
        // Directory doesn't exist, continue
      }
    } else {
      // Exact file path
      try {
        const filePath = path.join(repoDir, pattern);
        await fs.access(filePath);
        foundEnvFile = pattern;
        break;
      } catch (error) {
        // File doesn't exist, continue
      }
    }
  }
  
  // Validate what we found
  if (foundConfigFile && foundEnvFile) {
    // Multi-file format found
    const configContent = await fs.readFile(path.join(repoDir, foundConfigFile), 'utf8');
    const envContent = await fs.readFile(path.join(repoDir, foundEnvFile), 'utf8');
    
    const configData = JSON.parse(configContent);
    const envData = JSON.parse(envContent);
    
    const combinedData = {
      ...configData,
      ...(envData.environmentSchema && { environmentSchema: envData.environmentSchema }),
      ...(envData.environments && { environments: envData.environments })
    };
    
    const validationResult = await analyzeConfigFile(JSON.stringify(combinedData));
    if (validationResult.valid) {
      return {
        success: true,
        message: `Connection successful! Found multi-file configuration (${path.basename(foundConfigFile)} + ${path.basename(foundEnvFile)}) with ${validationResult.sourceCount || 0} sources, ${validationResult.ruleCount || 0} rules, ${validationResult.proxyRuleCount || 0} proxy rules, and ${validationResult.variableCount || 0} environment variables.`,
        details: {
          rawData: combinedData,
          validationResults: validationResult
        }
      };
    } else {
      return {
        success: false,
        error: validationResult.error,
        details: validationResult
      };
    }
  } else if (foundConfigFile) {
    // Single file format
    const content = await fs.readFile(path.join(repoDir, foundConfigFile), 'utf8');
    const validationResult = await analyzeConfigFile(content);
    if (validationResult.valid) {
      const message = foundConfigFile !== searchPatterns.configFiles[0] 
        ? `Connection successful! Found configuration file (${foundConfigFile}) with ${validationResult.sourceCount || 0} sources, ${validationResult.ruleCount || 0} rules, ${validationResult.proxyRuleCount || 0} proxy rules, and ${validationResult.variableCount || 0} environment variables.`
        : `Connection successful! Configuration verified with ${validationResult.sourceCount || 0} sources, ${validationResult.ruleCount || 0} rules, ${validationResult.proxyRuleCount || 0} proxy rules, and ${validationResult.variableCount || 0} environment variables.`;
      
      return {
        success: true,
        message,
        details: {
          rawData: JSON.parse(content),
          validationResults: validationResult
        }
      };
    } else {
      return {
        success: false,
        error: validationResult.error,
        details: validationResult
      };
    }
  }
  
  // Nothing found
  log.error('No configuration files found!');
  log.info(`foundConfigFile: ${foundConfigFile}`);
  log.info(`foundEnvFile: ${foundEnvFile}`);
  log.info('=== End Config File Detection ===');
  
  throw new Error('No configuration files found matching the specified path pattern');
}

module.exports = {
  detectAndValidateConfig
};