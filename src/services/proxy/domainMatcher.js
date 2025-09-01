const url = require('url');

/**
 * Matches a URL against domain patterns
 * Supports the same format as header rules:
 * - localhost:3001
 * - example.com
 * - *.example.com
 * - *://example.com/*
 * - 192.168.1.1
 */
class DomainMatcher {
  /**
   * Check if a URL matches a domain pattern
   * @param {string} targetUrl - The full URL to check
   * @param {string} domainPattern - The domain pattern to match against
   * @returns {boolean} - True if matches
   */
  static matches(targetUrl, domainPattern) {
    if (!targetUrl || !domainPattern) return false;
    
    const parsedUrl = url.parse(targetUrl);
    const hostname = parsedUrl.hostname || '';
    const port = parsedUrl.port || '';
    const protocol = parsedUrl.protocol || '';
    
    // Handle full URL patterns like *://example.com/*
    if (domainPattern.includes('://')) {
      // Convert wildcard pattern to regex
      let pattern = domainPattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except *
        .replace(/\*/g, '.*'); // Convert * to regex .*
      
      const regex = new RegExp(`^${pattern}$`, 'i');
      return regex.test(targetUrl);
    }
    
    // Handle IP addresses (with optional port)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;
    if (ipRegex.test(domainPattern)) {
      if (domainPattern.includes(':')) {
        const [domainIp, domainPort] = domainPattern.split(':');
        return hostname === domainIp && port === domainPort;
      }
      return hostname === domainPattern;
    }
    
    // Handle localhost (with optional port)
    if (domainPattern === 'localhost' || domainPattern.startsWith('localhost:')) {
      if (domainPattern.includes(':')) {
        const [, domainPort] = domainPattern.split(':');
        return hostname === 'localhost' && port === domainPort;
      }
      return hostname === 'localhost';
    }
    
    // Handle subdomain wildcards like *.example.com
    if (domainPattern.startsWith('*.')) {
      const baseDomain = domainPattern.substring(2).toLowerCase();
      const lowerHostname = hostname.toLowerCase();
      
      // Match exact domain or any subdomain
      return lowerHostname === baseDomain || lowerHostname.endsWith('.' + baseDomain);
    }
    
    // Handle exact domain match (case-insensitive)
    return hostname.toLowerCase() === domainPattern.toLowerCase();
  }
  
  /**
   * Check if a URL matches any of the domain patterns
   * @param {string} targetUrl - The full URL to check
   * @param {string[]} domains - Array of domain patterns
   * @returns {boolean} - True if matches any pattern
   */
  static matchesAny(targetUrl, domains) {
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return true; // No domains means match all
    }
    
    return domains.some(domain => this.matches(targetUrl, domain));
  }
}

module.exports = DomainMatcher;