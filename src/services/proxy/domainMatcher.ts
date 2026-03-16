import url from 'url';

/**
 * Matches a URL against domain patterns.
 *
 * Supported pattern formats:
 * - `example.com`          — exact domain
 * - `*.example.com`        — wildcard subdomain (matches base + any sub)
 * - `localhost:3001`       — localhost with port
 * - `192.168.1.1:8080`     — IP with optional port
 * - `*://example.com/*`    — full URL wildcard pattern
 */
class DomainMatcher {
  /**
   * Check if a URL matches a domain pattern.
   */
  static matches(targetUrl: string | null | undefined, domainPattern: string | null | undefined): boolean {
    if (!targetUrl || !domainPattern) return false;

    const parsedUrl = url.parse(targetUrl);
    const hostname = parsedUrl.hostname || '';
    const port = parsedUrl.port || '';

    // Handle full URL patterns like *://example.com/*
    if (domainPattern.includes('://')) {
      const pattern = domainPattern
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
   * Check if a URL matches any of the given domain patterns.
   * Returns true if domains is empty/null (match all).
   */
  static matchesAny(targetUrl: string, domains: string[] | null | undefined): boolean {
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return true; // No domains means match all
    }

    return domains.some(domain => this.matches(targetUrl, domain));
  }
}

export { DomainMatcher };
export default DomainMatcher;
