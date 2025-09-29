const { createLogger } = require('./mainLogger');
const { net, dialog } = require('electron');

/**
 * Error types that can be automatically recovered
 */
const ErrorTypes = {
  NETWORK: 'network',
  AUTH: 'auth',
  CONFLICT: 'conflict',
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  SERVER_ERROR: 'server_error',
  RESOURCE_EXHAUSTED: 'resource_exhausted',
  UNKNOWN: 'unknown'
};

/**
 * Error Recovery System
 * Provides intelligent error recovery strategies for common failure scenarios
 */
class ErrorRecovery {
  constructor() {
    this.log = createLogger('ErrorRecovery');
    this.retryAttempts = new Map();
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second
    this.maxDelay = 30000; // 30 seconds
  }

  /**
   * Classify error type based on error object
   * @param {Error} error - The error to classify
   * @returns {string} Error type from ErrorTypes
   */
  classifyError(error) {
    const errorString = error.toString().toLowerCase();
    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';

    // Network errors
    if (code.includes('enotfound') || 
        code.includes('etimedout') || 
        code.includes('econnrefused') ||
        code.includes('enetunreach') ||
        message.includes('network') ||
        message.includes('offline')) {
      return ErrorTypes.NETWORK;
    }

    // Authentication errors
    if (code === '401' || 
        code === '403' ||
        message.includes('unauthorized') ||
        message.includes('forbidden') ||
        message.includes('authentication') ||
        message.includes('permission')) {
      return ErrorTypes.AUTH;
    }

    // Timeout errors
    if (code.includes('timeout') ||
        message.includes('timeout') ||
        message.includes('timed out')) {
      return ErrorTypes.TIMEOUT;
    }

    // Rate limiting
    if (code === '429' ||
        message.includes('rate limit') ||
        message.includes('too many requests')) {
      return ErrorTypes.RATE_LIMIT;
    }

    // Server errors
    if (code === '500' || 
        code === '502' || 
        code === '503' || 
        code === '504' ||
        message.includes('server error') ||
        message.includes('internal error')) {
      return ErrorTypes.SERVER_ERROR;
    }

    // Conflict errors
    if (code === '409' ||
        message.includes('conflict') ||
        message.includes('already exists')) {
      return ErrorTypes.CONFLICT;
    }

    // Resource exhausted
    if (message.includes('memory') ||
        message.includes('disk space') ||
        message.includes('quota')) {
      return ErrorTypes.RESOURCE_EXHAUSTED;
    }

    return ErrorTypes.UNKNOWN;
  }

  /**
   * Handle error with automatic recovery
   * @param {Error} error - The error to handle
   * @param {Object} context - Context information for recovery
   * @param {Function} retryFn - Function to retry on recovery
   * @returns {Promise} Result of recovery attempt
   */
  async handle(error, context = {}, retryFn = null) {
    const errorType = this.classifyError(error);
    const strategy = this.getStrategy(errorType);

    this.log.info(`Handling ${errorType} error:`, error.message);

    try {
      const result = await strategy.call(this, error, context, retryFn);
      this.resetRetryCount(context.operationId);
      return result;
    } catch (recoveryError) {
      this.log.error(`Recovery failed for ${errorType} error:`, recoveryError);
      throw recoveryError;
    }
  }

  /**
   * Get recovery strategy for error type
   * @private
   */
  getStrategy(errorType) {
    const strategies = {
      [ErrorTypes.NETWORK]: this.handleNetworkError,
      [ErrorTypes.AUTH]: this.handleAuthError,
      [ErrorTypes.TIMEOUT]: this.handleTimeoutError,
      [ErrorTypes.RATE_LIMIT]: this.handleRateLimitError,
      [ErrorTypes.SERVER_ERROR]: this.handleServerError,
      [ErrorTypes.CONFLICT]: this.handleConflictError,
      [ErrorTypes.RESOURCE_EXHAUSTED]: this.handleResourceError,
      [ErrorTypes.UNKNOWN]: this.handleUnknownError
    };

    return strategies[errorType] || this.handleUnknownError;
  }

  /**
   * Handle network errors
   * @private
   */
  async handleNetworkError(error, context, retryFn) {
    // Check if we're actually offline
    const isOnline = await this.checkNetworkConnectivity();
    
    if (!isOnline) {
      this.log.info('Network is offline, waiting for connection...');
      await this.waitForNetwork();
    }

    if (retryFn && this.shouldRetry(context.operationId)) {
      const delay = this.getRetryDelay(context.operationId);
      this.log.info(`Retrying after ${delay}ms...`);
      await this.sleep(delay);
      return retryFn();
    }

    throw new Error(`Network error: ${error.message}`);
  }

  /**
   * Handle authentication errors
   * @private
   */
  async handleAuthError(error, context, retryFn) {
    if (context.onAuthError) {
      // Let the context handle authentication
      const newAuth = await context.onAuthError(error);
      if (newAuth && retryFn) {
        return retryFn();
      }
    }

    // Show dialog to user
    const response = await dialog.showMessageBox({
      type: 'error',
      title: 'Authentication Failed',
      message: 'Authentication failed. Please check your credentials.',
      buttons: ['Retry', 'Cancel'],
      defaultId: 0
    });

    if (response.response === 0 && retryFn) {
      return retryFn();
    }

    throw new Error(`Authentication error: ${error.message}`);
  }

  /**
   * Handle timeout errors
   * @private
   */
  async handleTimeoutError(error, context, retryFn) {
    if (retryFn && this.shouldRetry(context.operationId)) {
      // Increase timeout for retry
      if (context.updateTimeout) {
        context.updateTimeout(context.timeout * 2);
      }
      
      const delay = this.getRetryDelay(context.operationId);
      this.log.info(`Retrying with increased timeout after ${delay}ms...`);
      await this.sleep(delay);
      return retryFn();
    }

    throw new Error(`Operation timed out: ${error.message}`);
  }

  /**
   * Handle rate limit errors
   * @private
   */
  async handleRateLimitError(error, context, retryFn) {
    // Extract retry-after header if available
    const retryAfter = error.retryAfter || 60; // Default 60 seconds
    
    this.log.info(`Rate limited. Waiting ${retryAfter} seconds...`);
    await this.sleep(retryAfter * 1000);

    if (retryFn) {
      return retryFn();
    }

    throw new Error(`Rate limit exceeded: ${error.message}`);
  }

  /**
   * Handle server errors
   * @private
   */
  async handleServerError(error, context, retryFn) {
    if (retryFn && this.shouldRetry(context.operationId)) {
      const delay = this.getRetryDelay(context.operationId);
      this.log.info(`Server error. Retrying after ${delay}ms...`);
      await this.sleep(delay);
      return retryFn();
    }

    throw new Error(`Server error: ${error.message}`);
  }

  /**
   * Handle conflict errors
   * @private
   */
  async handleConflictError(error, context, retryFn) {
    if (context.onConflict) {
      const resolution = await context.onConflict(error);
      if (resolution && retryFn) {
        return retryFn();
      }
    }

    throw new Error(`Conflict error: ${error.message}`);
  }

  /**
   * Handle resource exhausted errors
   * @private
   */
  async handleResourceError(error, context, retryFn) {
    // Attempt to free resources
    if (global.gc) {
      global.gc();
    }

    // Show dialog to user
    const response = await dialog.showMessageBox({
      type: 'warning',
      title: 'Resources Low',
      message: 'System resources are low. Some operations may fail.',
      buttons: ['Continue', 'Cancel'],
      defaultId: 0
    });

    if (response.response === 0 && retryFn) {
      return retryFn();
    }

    throw new Error(`Resource exhausted: ${error.message}`);
  }

  /**
   * Handle unknown errors
   * @private
   */
  async handleUnknownError(error, context, retryFn) {
    this.log.warn('Unknown error type:', error);
    
    if (retryFn && this.shouldRetry(context.operationId)) {
      const delay = this.getRetryDelay(context.operationId);
      this.log.info(`Retrying unknown error after ${delay}ms...`);
      await this.sleep(delay);
      return retryFn();
    }

    throw error;
  }

  /**
   * Check if we should retry an operation
   * @private
   */
  shouldRetry(operationId) {
    const attempts = this.retryAttempts.get(operationId) || 0;
    return attempts < this.maxRetries;
  }

  /**
   * Get retry delay with exponential backoff
   * @private
   */
  getRetryDelay(operationId) {
    const attempts = this.retryAttempts.get(operationId) || 0;
    this.retryAttempts.set(operationId, attempts + 1);
    
    const delay = Math.min(
      this.baseDelay * Math.pow(2, attempts),
      this.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    return delay + Math.random() * 1000;
  }

  /**
   * Reset retry count for an operation
   * @private
   */
  resetRetryCount(operationId) {
    if (operationId) {
      this.retryAttempts.delete(operationId);
    }
  }

  /**
   * Check network connectivity
   * @private
   */
  async checkNetworkConnectivity() {
    try {
      const response = await net.fetch('https://1.1.1.1', {
        method: 'HEAD',
        timeout: 5000
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Wait for network to become available
   * @private
   */
  async waitForNetwork(maxWait = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      if (await this.checkNetworkConnectivity()) {
        return true;
      }
      await this.sleep(2000);
    }
    
    throw new Error('Network connection timeout');
  }

  /**
   * Sleep utility
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a retry wrapper for a function
   * @param {Function} fn - Function to wrap
   * @param {Object} options - Retry options
   * @returns {Function} Wrapped function with retry logic
   */
  withRetry(fn, options = {}) {
    const { maxRetries = this.maxRetries, operationId = `op-${Date.now()}` } = options;
    
    return async (...args) => {
      let lastError;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await fn(...args);
          this.resetRetryCount(operationId);
          return result;
        } catch (error) {
          lastError = error;
          
          if (attempt < maxRetries) {
            const errorType = this.classifyError(error);
            
            // Some errors shouldn't be retried
            if (errorType === ErrorTypes.AUTH || errorType === ErrorTypes.CONFLICT) {
              throw error;
            }
            
            const delay = this.getRetryDelay(operationId);
            this.log.info(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
            await this.sleep(delay);
          }
        }
      }
      
      throw lastError;
    };
  }
}

// Export singleton instance and types
const errorRecovery = new ErrorRecovery();
module.exports = {
  ErrorRecovery: errorRecovery,
  ErrorTypes,
  withRetry: errorRecovery.withRetry.bind(errorRecovery),
  handle: errorRecovery.handle.bind(errorRecovery)
};