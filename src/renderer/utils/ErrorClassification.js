const { createLogger } = require('../utils/logger');
const log = createLogger('ErrorClassification');

/**
 * Error categories for intelligent retry decisions
 */
const ErrorCategory = {
  TRANSIENT: 'TRANSIENT',         // Temporary, should retry
  PERMANENT: 'PERMANENT',         // Won't resolve, don't retry
  RATE_LIMITED: 'RATE_LIMITED',   // Too many requests, retry with backoff
  NETWORK: 'NETWORK',             // Network issues, retry when online
  TIMEOUT: 'TIMEOUT',             // Request timeout, may retry
  SECURITY: 'SECURITY',           // Security/cert issues, don't retry
  CLIENT_ERROR: 'CLIENT_ERROR',   // 4xx errors, don't retry
  SERVER_ERROR: 'SERVER_ERROR',   // 5xx errors, may retry
  UNKNOWN: 'UNKNOWN'              // Can't classify, use default behavior
};

/**
 * Network error codes that are retryable
 */
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ECONNABORTED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENETDOWN',
  'EHOSTDOWN',
  'EPIPE',
  'EADDRINUSE',
  'EADDRNOTAVAIL',
  'ENETRESET',
  'EISCONN',
  'ENOTCONN',
  'ESHUTDOWN',
  'ETOOMANYREFS',
  'ECONNREFUSED',
  'ELOOP',
  'ENAMETOOLONG',
  'ENOTEMPTY',
  'EUSERS',
  'EDQUOT',
  'ESTALE',
  'EREMOTE'
]);

/**
 * Network error messages that indicate retryable conditions
 */
const RETRYABLE_ERROR_MESSAGES = [
  'net::ERR_CONNECTION_RESET',
  'net::ERR_CONNECTION_TIMED_OUT',
  'net::ERR_CONNECTION_REFUSED',
  'net::ERR_NAME_NOT_RESOLVED',
  'net::ERR_NETWORK_CHANGED',
  'net::ERR_CONNECTION_ABORTED',
  'net::ERR_EMPTY_RESPONSE',
  'net::ERR_INTERNET_DISCONNECTED',
  'net::ERR_ADDRESS_UNREACHABLE',
  'net::ERR_NETWORK_ACCESS_DENIED',
  'net::ERR_PROXY_CONNECTION_FAILED',
  'socket hang up',
  'ESOCKETTIMEDOUT',
  'network error',
  'DNS resolution failed',
  'Connection refused'
];

/**
 * Certificate and security error patterns
 */
const SECURITY_ERROR_PATTERNS = [
  'net::ERR_CERT_',
  'net::ERR_SSL_',
  'certificate',
  'SSL',
  'TLS',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_UNTRUSTED',
  'CERT_REVOKED'
];

/**
 * Error classifier for intelligent retry decisions
 */
class ErrorClassifier {
  /**
   * Classify an error into a category
   * @param {Error|Object} error The error to classify
   * @param {number} statusCode HTTP status code if available
   * @returns {Object} Classification result with category and retry recommendation
   */
  static classify(error, statusCode = null) {
    const result = {
      category: ErrorCategory.UNKNOWN,
      retryable: false,
      backoffMultiplier: 1,
      maxRetries: 3,
      description: ''
    };

    // Handle HTTP status codes first
    if (statusCode) {
      return this.classifyByStatusCode(statusCode);
    }

    // Handle error objects
    if (!error) {
      return result;
    }

    // Check for rate limiting
    if (this.isRateLimitError(error)) {
      return {
        category: ErrorCategory.RATE_LIMITED,
        retryable: true,
        backoffMultiplier: 2,
        maxRetries: 5,
        description: 'Rate limit exceeded'
      };
    }

    // Check for security/certificate errors
    if (this.isSecurityError(error)) {
      return {
        category: ErrorCategory.SECURITY,
        retryable: false,
        backoffMultiplier: 0,
        maxRetries: 0,
        description: 'Security or certificate error'
      };
    }

    // Check for network errors
    if (this.isNetworkError(error)) {
      return {
        category: ErrorCategory.NETWORK,
        retryable: true,
        backoffMultiplier: 1.5,
        maxRetries: 3,
        description: 'Network connectivity error'
      };
    }

    // Check for timeout errors
    if (this.isTimeoutError(error)) {
      return {
        category: ErrorCategory.TIMEOUT,
        retryable: true,
        backoffMultiplier: 1.2,
        maxRetries: 2,
        description: 'Request timeout'
      };
    }

    // Default to transient error
    return {
      category: ErrorCategory.TRANSIENT,
      retryable: true,
      backoffMultiplier: 1,
      maxRetries: 3,
      description: 'Transient error'
    };
  }

  /**
   * Classify by HTTP status code
   */
  static classifyByStatusCode(statusCode) {
    // 2xx - Success (shouldn't be here)
    if (statusCode >= 200 && statusCode < 300) {
      return {
        category: ErrorCategory.UNKNOWN,
        retryable: false,
        backoffMultiplier: 0,
        maxRetries: 0,
        description: 'Success status code'
      };
    }

    // 3xx - Redirection (shouldn't be here with follow redirects)
    if (statusCode >= 300 && statusCode < 400) {
      return {
        category: ErrorCategory.PERMANENT,
        retryable: false,
        backoffMultiplier: 0,
        maxRetries: 0,
        description: 'Redirect status code'
      };
    }

    // 4xx - Client errors
    if (statusCode >= 400 && statusCode < 500) {
      // Special cases
      if (statusCode === 429) {
        // Too Many Requests
        return {
          category: ErrorCategory.RATE_LIMITED,
          retryable: true,
          backoffMultiplier: 2,
          maxRetries: 5,
          description: 'Rate limit exceeded (429)'
        };
      }
      
      if (statusCode === 408 || statusCode === 409) {
        // Request Timeout or Conflict - might be transient
        return {
          category: ErrorCategory.TRANSIENT,
          retryable: true,
          backoffMultiplier: 1,
          maxRetries: 2,
          description: `Client error (${statusCode}) - possibly transient`
        };
      }

      // Most 4xx errors are permanent
      return {
        category: ErrorCategory.CLIENT_ERROR,
        retryable: false,
        backoffMultiplier: 0,
        maxRetries: 0,
        description: `Client error (${statusCode})`
      };
    }

    // 5xx - Server errors
    if (statusCode >= 500 && statusCode < 600) {
      if (statusCode === 503) {
        // Service Unavailable - definitely retry
        return {
          category: ErrorCategory.SERVER_ERROR,
          retryable: true,
          backoffMultiplier: 1.5,
          maxRetries: 5,
          description: 'Service unavailable (503)'
        };
      }

      // Most 5xx errors are retryable
      return {
        category: ErrorCategory.SERVER_ERROR,
        retryable: true,
        backoffMultiplier: 1.5,
        maxRetries: 3,
        description: `Server error (${statusCode})`
      };
    }

    // Unknown status code
    return {
      category: ErrorCategory.UNKNOWN,
      retryable: false,
      backoffMultiplier: 1,
      maxRetries: 1,
      description: `Unknown status code (${statusCode})`
    };
  }

  /**
   * Check if error is rate limit related
   */
  static isRateLimitError(error) {
    const errorStr = error.toString().toLowerCase();
    const message = error.message ? error.message.toLowerCase() : '';
    
    return errorStr.includes('rate limit') ||
           message.includes('rate limit') ||
           errorStr.includes('too many requests') ||
           message.includes('too many requests') ||
           error.statusCode === 429;
  }

  /**
   * Check if error is security/certificate related
   */
  static isSecurityError(error) {
    const errorStr = error.toString();
    const message = error.message || '';
    
    return SECURITY_ERROR_PATTERNS.some(pattern => 
      errorStr.includes(pattern) || message.includes(pattern)
    );
  }

  /**
   * Check if error is network related
   */
  static isNetworkError(error) {
    // Check error code
    if (error.code && RETRYABLE_ERROR_CODES.has(error.code)) {
      return true;
    }

    // Check error message
    const message = error.message || '';
    return RETRYABLE_ERROR_MESSAGES.some(pattern => 
      message.includes(pattern)
    );
  }

  /**
   * Check if error is timeout related
   */
  static isTimeoutError(error) {
    const errorStr = error.toString().toLowerCase();
    const message = error.message ? error.message.toLowerCase() : '';
    
    return errorStr.includes('timeout') ||
           message.includes('timeout') ||
           error.code === 'ETIMEDOUT' ||
           error.code === 'ESOCKETTIMEDOUT';
  }

  /**
   * Get retry recommendation based on classification
   */
  static getRetryStrategy(error, statusCode = null, attemptNumber = 1) {
    const classification = this.classify(error, statusCode);
    
    if (!classification.retryable) {
      return {
        shouldRetry: false,
        delay: 0,
        reason: classification.description
      };
    }

    // Check if we've exceeded max retries
    if (attemptNumber > classification.maxRetries) {
      return {
        shouldRetry: false,
        delay: 0,
        reason: `Max retries (${classification.maxRetries}) exceeded`
      };
    }

    // Calculate backoff delay
    const baseDelay = 1000; // 1 second
    const jitter = Math.random() * 500; // 0-500ms jitter
    const exponentialDelay = baseDelay * Math.pow(classification.backoffMultiplier, attemptNumber - 1);
    const delay = Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds

    return {
      shouldRetry: true,
      delay: Math.round(delay),
      category: classification.category,
      reason: classification.description,
      attemptNumber: attemptNumber,
      maxAttempts: classification.maxRetries
    };
  }
}

module.exports = {
  ErrorClassifier,
  ErrorCategory,
  RETRYABLE_ERROR_CODES,
  RETRYABLE_ERROR_MESSAGES,
  SECURITY_ERROR_PATTERNS
};