import fs from 'fs';
import path from 'path';
import mainLogger from '../../utils/mainLogger';

const { createLogger } = mainLogger;
const log = createLogger('ConfigFileDetector');

const configValidator = require('../../utils/configValidator').default;
const { analyzeConfigFile } = configValidator;

// Type definitions
interface ValidationResultDetails {
  valid: boolean;
  error?: string;
  sourceCount?: number;
  ruleCount?: number;
  proxyRuleCount?: number;
  variableCount?: number;
  [key: string]: unknown;
}

interface DetectionResult {
  success: boolean;
  message?: string;
  error?: string;
  details?: {
    rawData?: Record<string, unknown>;
    validationResults?: ValidationResultDetails;
  };
}

interface SearchPatterns {
  configFiles: string[];
  envFiles: string[];
  exactMatch: boolean;
}

/**
 * Detect and validate configuration files based on search patterns
 */
async function detectAndValidateConfig(repoDir: string, searchPatterns: SearchPatterns): Promise<DetectionResult> {
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
        await fs.promises.access(configPath);
        await fs.promises.access(envPath);

        // Read and combine both files
        const configContent = await fs.promises.readFile(configPath, 'utf8');
        const envContent = await fs.promises.readFile(envPath, 'utf8');

        const configData = JSON.parse(configContent) as Record<string, unknown>;
        const envData = JSON.parse(envContent) as Record<string, unknown>;

        // Merge environment data into config
        const combinedData: Record<string, unknown> = {
          ...configData,
          ...(envData.environmentSchema && { environmentSchema: envData.environmentSchema }),
          ...(envData.environments && { environments: envData.environments })
        };

        const validationResult: ValidationResultDetails = await analyzeConfigFile(JSON.stringify(combinedData));
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
            details: validationResult as DetectionResult['details']
          };
        }
      } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
          throw new Error(`One or both files not found: ${searchPatterns.configFiles[0]}, ${searchPatterns.envFiles[0]}`);
        }
        throw error;
      }
    }

    // Single exact file
    if (searchPatterns.configFiles.length > 0) {
      const configPath = path.join(repoDir, searchPatterns.configFiles[0]);
      const content = await fs.promises.readFile(configPath, 'utf8');
      const validationResult: ValidationResultDetails = await analyzeConfigFile(content);
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
          details: validationResult as DetectionResult['details']
        };
      }
    }
  }

  // For pattern-based searches, try to find matching files
  let foundConfigFile: string | null = null;
  let foundEnvFile: string | null = null;

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
        const files = await fs.promises.readdir(dirPath);
        log.info(`Files in ${dirPath}:`, files);

        // Find files matching the pattern
        const matches = files.filter((f: string) => {
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
          matches.sort((a: string, b: string) => b.localeCompare(a));
          foundConfigFile = path.join(dir, matches[0]);
          log.info(`Found config file: ${foundConfigFile}`);
          break;
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        log.warn(`Could not read directory ${dir}:`, errMsg);
      }
    } else {
      // Exact file path
      try {
        const filePath = path.join(repoDir, pattern);
        await fs.promises.access(filePath);
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
        const files = await fs.promises.readdir(dirPath);

        const matches = files.filter((f: string) => {
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
          matches.sort((a: string, b: string) => b.localeCompare(a));
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
        await fs.promises.access(filePath);
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
    const configContent = await fs.promises.readFile(path.join(repoDir, foundConfigFile), 'utf8');
    const envContent = await fs.promises.readFile(path.join(repoDir, foundEnvFile), 'utf8');

    const configData = JSON.parse(configContent) as Record<string, unknown>;
    const envData = JSON.parse(envContent) as Record<string, unknown>;

    const combinedData: Record<string, unknown> = {
      ...configData,
      ...(envData.environmentSchema && { environmentSchema: envData.environmentSchema }),
      ...(envData.environments && { environments: envData.environments })
    };

    const validationResult: ValidationResultDetails = await analyzeConfigFile(JSON.stringify(combinedData));
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
        details: validationResult as DetectionResult['details']
      };
    }
  } else if (foundConfigFile) {
    // Single file format
    const content = await fs.promises.readFile(path.join(repoDir, foundConfigFile), 'utf8');
    const validationResult: ValidationResultDetails = await analyzeConfigFile(content);
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
        details: validationResult as DetectionResult['details']
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

export { detectAndValidateConfig, DetectionResult, SearchPatterns, ValidationResultDetails };
export default { detectAndValidateConfig };
