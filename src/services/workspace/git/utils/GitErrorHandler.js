/**
 * GitErrorHandler - Handles and classifies Git errors
 * Provides user-friendly error messages and recovery suggestions
 */

const { createLogger } = require('../../../../utils/mainLogger');

const log = createLogger('GitErrorHandler');

// Error type constants
const ERROR_TYPES = {
  AUTH_ERROR: 'AUTH_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  REPOSITORY_ERROR: 'REPOSITORY_ERROR',
  BRANCH_ERROR: 'BRANCH_ERROR',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  PERMISSION_ERROR: 'PERMISSION_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  INVALID_URL: 'INVALID_URL',
  GIT_NOT_FOUND: 'GIT_NOT_FOUND',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

// Error patterns for classification
const ERROR_PATTERNS = [
  {
    type: ERROR_TYPES.AUTH_ERROR,
    patterns: [
      /authentication\s+failed/i,
      /permission\s+denied.*publickey/i,
      /invalid\s+username\s+or\s+password/i,
      /could\s+not\s+read\s+from\s+remote\s+repository/i,
      /unauthorized/i,
      /403\s+forbidden/i,
      /401\s+unauthorized/i
    ]
  },
  {
    type: ERROR_TYPES.NETWORK_ERROR,
    patterns: [
      /could\s+not\s+resolve\s+host/i,
      /network\s+is\s+unreachable/i,
      /connection\s+refused/i,
      /connection\s+timed\s+out/i,
      /operation\s+timed\s+out/i,
      /no\s+route\s+to\s+host/i,
      /ssl\s+certificate\s+problem/i
    ]
  },
  {
    type: ERROR_TYPES.REPOSITORY_ERROR,
    patterns: [
      /repository\s+not\s+found/i,
      /does\s+not\s+exist/i,
      /not\s+a\s+git\s+repository/i,
      /remote\s+origin\s+already\s+exists/i,
      /fatal:\s+bad\s+object/i,
      /corrupted/i
    ]
  },
  {
    type: ERROR_TYPES.BRANCH_ERROR,
    patterns: [
      /couldn't\s+find\s+remote\s+ref/i,
      /branch.*not\s+found/i,
      /did\s+not\s+match\s+any\s+file/i,
      /pathspec.*did\s+not\s+match/i,
      /refspec.*does\s+not\s+match/i,
      /invalid\s+branch\s+name/i
    ]
  },
  {
    type: ERROR_TYPES.CONFLICT_ERROR,
    patterns: [
      /merge\s+conflict/i,
      /automatic\s+merge\s+failed/i,
      /conflict.*automatic\s+merge/i,
      /unmerged\s+files/i,
      /you\s+have\s+unmerged\s+paths/i,
      /fix\s+conflicts\s+and\s+then\s+commit/i
    ]
  },
  {
    type: ERROR_TYPES.PERMISSION_ERROR,
    patterns: [
      /permission\s+denied/i,
      /access\s+denied/i,
      /cannot\s+create\s+directory/i,
      /unable\s+to\s+create\s+file/i,
      /insufficient\s+permission/i,
      /operation\s+not\s+permitted/i
    ]
  },
  {
    type: ERROR_TYPES.TIMEOUT_ERROR,
    patterns: [
      /timeout/i,
      /timed\s+out/i,
      /operation\s+timed\s+out/i
    ]
  },
  {
    type: ERROR_TYPES.INVALID_URL,
    patterns: [
      /invalid\s+url/i,
      /malformed\s+url/i,
      /url.*invalid/i,
      /not\s+a\s+valid.*url/i
    ]
  },
  {
    type: ERROR_TYPES.GIT_NOT_FOUND,
    patterns: [
      /git.*not\s+found/i,
      /git.*not\s+recognized/i,
      /command\s+not\s+found.*git/i,
      /'git'\s+is\s+not\s+recognized/i
    ]
  }
];

class GitErrorHandler {
  /**
   * Handle Git error and provide user-friendly response
   * @param {Error} error - The error to handle
   * @param {Object} context - Additional context
   * @returns {Object} - Handled error response
   */
  handle(error, context = {}) {
    log.error('Handling Git error:', error, context);

    const errorType = this.classifyError(error);
    const friendlyMessage = this.getFriendlyMessage(errorType, error, context);
    const recovery = this.getRecoverySuggestions(errorType, context);

    return {
      type: errorType,
      message: friendlyMessage,
      originalMessage: error.message,
      recovery,
      retryable: this.isRetryable(errorType),
      requiresUserAction: this.requiresUserAction(errorType),
      context
    };
  }

  /**
   * Classify error based on message patterns
   * @param {Error} error - The error to classify
   * @returns {string} - Error type
   */
  classifyError(error) {
    const message = error.message || '';
    
    for (const { type, patterns } of ERROR_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          return type;
        }
      }
    }

    // Additional classification based on error properties
    if (error.code === 'ENOENT' && message.includes('git')) {
      return ERROR_TYPES.GIT_NOT_FOUND;
    }

    if (error.code === 'ETIMEDOUT' || error.killed) {
      return ERROR_TYPES.TIMEOUT_ERROR;
    }

    return ERROR_TYPES.UNKNOWN_ERROR;
  }

  /**
   * Get user-friendly error message
   * @param {string} errorType - Error type
   * @param {Error} error - Original error
   * @param {Object} context - Error context
   * @returns {string} - Friendly message
   */
  getFriendlyMessage(errorType, error, context) {
    const messages = {
      [ERROR_TYPES.AUTH_ERROR]: 
        'Authentication failed. Please check your credentials and repository permissions.',
      
      [ERROR_TYPES.NETWORK_ERROR]: 
        'Network connection failed. Please check your internet connection and try again.',
      
      [ERROR_TYPES.REPOSITORY_ERROR]: 
        'Repository not found or inaccessible. Please verify the URL is correct.',
      
      [ERROR_TYPES.BRANCH_ERROR]: 
        `Branch '${context.branch || 'specified'}' not found in the repository.`,
      
      [ERROR_TYPES.CONFLICT_ERROR]: 
        'Git merge conflict detected. Manual resolution required.',
      
      [ERROR_TYPES.PERMISSION_ERROR]: 
        'Permission denied. Please check file permissions and try again.',
      
      [ERROR_TYPES.TIMEOUT_ERROR]: 
        'Operation timed out. This might be due to a slow network or large repository.',
      
      [ERROR_TYPES.INVALID_URL]: 
        'Invalid repository URL. Please check the URL format.',
      
      [ERROR_TYPES.GIT_NOT_FOUND]: 
        'Git is not installed or not found in PATH. Please install Git first.',
      
      [ERROR_TYPES.UNKNOWN_ERROR]: 
        `An unexpected error occurred: ${error.message}`
    };

    return messages[errorType] || messages[ERROR_TYPES.UNKNOWN_ERROR];
  }

  /**
   * Get recovery suggestions based on error type
   * @param {string} errorType - Error type
   * @param {Object} context - Error context
   * @returns {string[]} - Recovery suggestions
   */
  getRecoverySuggestions(errorType, context) {
    const suggestions = {
      [ERROR_TYPES.AUTH_ERROR]: [
        'Verify your access token or SSH key is correct',
        'Check if you have permission to access the repository',
        'For private repositories, ensure proper authentication is configured',
        'Try regenerating your access token with appropriate permissions'
      ],
      
      [ERROR_TYPES.NETWORK_ERROR]: [
        'Check your internet connection',
        'Verify the repository URL is accessible',
        'Check if you\'re behind a proxy or firewall',
        'Try again in a few moments'
      ],
      
      [ERROR_TYPES.REPOSITORY_ERROR]: [
        'Verify the repository URL is correct',
        'Check if the repository exists and is accessible',
        'Ensure you have the correct permissions',
        'Try cloning the repository manually to verify access'
      ],
      
      [ERROR_TYPES.BRANCH_ERROR]: [
        `Create the branch '${context.branch}' first`,
        'Use a different branch that exists',
        'Check available branches in the repository',
        'Use the default branch (main/master)'
      ],
      
      [ERROR_TYPES.CONFLICT_ERROR]: [
        'Pull the latest changes from remote',
        'Resolve conflicts manually in affected files',
        'Consider using a merge tool',
        'Commit resolved changes before proceeding'
      ],
      
      [ERROR_TYPES.PERMISSION_ERROR]: [
        'Run the application with appropriate permissions',
        'Check file and directory permissions',
        'Ensure the workspace directory is writable',
        'Try running as administrator (if appropriate)'
      ],
      
      [ERROR_TYPES.TIMEOUT_ERROR]: [
        'Check your network connection speed',
        'Try with a smaller repository or shallow clone',
        'Increase timeout settings if possible',
        'Retry the operation'
      ],
      
      [ERROR_TYPES.INVALID_URL]: [
        'Check the repository URL format',
        'Ensure the URL includes the protocol (https:// or git@)',
        'Remove any extra spaces or characters',
        'Try copying the URL directly from the repository'
      ],
      
      [ERROR_TYPES.GIT_NOT_FOUND]: [
        'Install Git from https://git-scm.com',
        'Add Git to your system PATH',
        'Restart the application after installing Git',
        'Verify Git installation by running "git --version"'
      ],
      
      [ERROR_TYPES.UNKNOWN_ERROR]: [
        'Check the error message for specific details',
        'Try the operation again',
        'Check application logs for more information',
        'Contact support if the issue persists'
      ]
    };

    return suggestions[errorType] || suggestions[ERROR_TYPES.UNKNOWN_ERROR];
  }

  /**
   * Check if error is retryable
   * @param {string} errorType - Error type
   * @returns {boolean} - Whether error is retryable
   */
  isRetryable(errorType) {
    const retryableTypes = [
      ERROR_TYPES.NETWORK_ERROR,
      ERROR_TYPES.TIMEOUT_ERROR
    ];
    
    return retryableTypes.includes(errorType);
  }

  /**
   * Check if error requires user action
   * @param {string} errorType - Error type
   * @returns {boolean} - Whether user action is required
   */
  requiresUserAction(errorType) {
    const userActionTypes = [
      ERROR_TYPES.AUTH_ERROR,
      ERROR_TYPES.CONFLICT_ERROR,
      ERROR_TYPES.PERMISSION_ERROR,
      ERROR_TYPES.GIT_NOT_FOUND,
      ERROR_TYPES.INVALID_URL
    ];
    
    return userActionTypes.includes(errorType);
  }

  /**
   * Create error with additional context
   * @param {string} message - Error message
   * @param {string} type - Error type
   * @param {Object} details - Additional details
   * @returns {Error} - Enhanced error
   */
  createError(message, type, details = {}) {
    const error = new Error(message);
    error.type = type;
    error.details = details;
    error.timestamp = new Date().toISOString();
    
    return error;
  }

  /**
   * Wrap async operation with error handling
   * @param {Function} operation - Async operation
   * @param {Object} context - Operation context
   * @returns {Promise} - Operation result or handled error
   */
  async wrapOperation(operation, context = {}) {
    try {
      return await operation();
    } catch (error) {
      const handled = this.handle(error, context);
      
      // Re-throw as enhanced error
      const enhancedError = this.createError(
        handled.message,
        handled.type,
        {
          original: error.message,
          recovery: handled.recovery,
          context: handled.context
        }
      );
      
      throw enhancedError;
    }
  }

  /**
   * Format error for display
   * @param {Object} handledError - Handled error object
   * @returns {string} - Formatted error message
   */
  format(handledError) {
    let formatted = `❌ ${handledError.message}\n`;
    
    if (handledError.recovery && handledError.recovery.length > 0) {
      formatted += '\n💡 Suggestions:\n';
      handledError.recovery.forEach((suggestion, index) => {
        formatted += `   ${index + 1}. ${suggestion}\n`;
      });
    }
    
    if (handledError.retryable) {
      formatted += '\n🔄 This error may be temporary. You can try again.';
    }
    
    return formatted;
  }

  /**
   * Log error with context
   * @param {Error} error - Error to log
   * @param {Object} context - Error context
   */
  logError(error, context = {}) {
    const handled = this.handle(error, context);
    
    log.error('Git operation failed', {
      type: handled.type,
      message: handled.message,
      original: error.message,
      stack: error.stack,
      context: handled.context
    });
    
    return handled;
  }
}

module.exports = { GitErrorHandler, ERROR_TYPES };