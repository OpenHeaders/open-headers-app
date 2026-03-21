import { describe, it, expect } from 'vitest';
import DomainMatcher from '../../../src/services/proxy/domainMatcher';

describe('DomainMatcher', () => {
    describe('matches()', () => {
        describe('exact domain', () => {
            it('matches exact enterprise domain', () => {
                expect(DomainMatcher.matches('https://api.acme-corp.com/v2/tokens', 'api.acme-corp.com')).toBe(true);
            });

            it('is case-insensitive on both URL and pattern', () => {
                expect(DomainMatcher.matches('https://API.Acme-Corp.COM/path', 'api.acme-corp.com')).toBe(true);
                expect(DomainMatcher.matches('https://api.acme-corp.com/path', 'API.Acme-Corp.COM')).toBe(true);
            });

            it('does not match different domain', () => {
                expect(DomainMatcher.matches('https://api.partner-service.io/v1', 'api.acme-corp.com')).toBe(false);
            });

            it('does not match subdomain against bare domain', () => {
                expect(DomainMatcher.matches('https://staging.api.acme-corp.com/v1', 'api.acme-corp.com')).toBe(false);
            });

            it('does not match domain that contains the pattern as substring', () => {
                expect(DomainMatcher.matches('https://notacme-corp.com/path', 'acme-corp.com')).toBe(false);
            });

            it('matches domain with long subpath and query string', () => {
                expect(DomainMatcher.matches(
                    'https://auth.acme-corp.internal/oauth2/token?grant_type=client_credentials&scope=api.read',
                    'auth.acme-corp.internal'
                )).toBe(true);
            });
        });

        describe('wildcard subdomain (*.example.com)', () => {
            it('matches single subdomain', () => {
                expect(DomainMatcher.matches('https://api.acme-corp.com/v1/resources', '*.acme-corp.com')).toBe(true);
            });

            it('matches deeply nested subdomain', () => {
                expect(DomainMatcher.matches('https://us-east-1.staging.api.acme-corp.com/', '*.acme-corp.com')).toBe(true);
            });

            it('matches the base domain itself (wildcard includes base)', () => {
                expect(DomainMatcher.matches('https://acme-corp.com/', '*.acme-corp.com')).toBe(true);
            });

            it('does not match unrelated domain', () => {
                expect(DomainMatcher.matches('https://evil-acme-corp.com/', '*.acme-corp.com')).toBe(false);
            });

            it('is case-insensitive for wildcard patterns', () => {
                expect(DomainMatcher.matches('https://API.ACME-CORP.COM/path', '*.acme-corp.com')).toBe(true);
            });

            it('matches wildcard with enterprise internal domain', () => {
                expect(DomainMatcher.matches(
                    'https://gitlab.acme-corp.internal:8443/api/v4/projects',
                    '*.acme-corp.internal'
                )).toBe(true);
            });
        });

        describe('localhost', () => {
            it('matches localhost without port', () => {
                expect(DomainMatcher.matches('http://localhost/api/v1/health', 'localhost')).toBe(true);
            });

            it('matches localhost with correct port', () => {
                expect(DomainMatcher.matches('http://localhost:3000/api', 'localhost:3000')).toBe(true);
            });

            it('does not match localhost with wrong port', () => {
                expect(DomainMatcher.matches('http://localhost:3000/api', 'localhost:8080')).toBe(false);
            });

            it('does not match localhost pattern against non-localhost URL', () => {
                expect(DomainMatcher.matches('https://api.acme-corp.com/api', 'localhost')).toBe(false);
            });

            it('matches localhost with high port number', () => {
                expect(DomainMatcher.matches('http://localhost:59212/proxy', 'localhost:59212')).toBe(true);
            });
        });

        describe('IP addresses', () => {
            it('matches exact IPv4 address', () => {
                expect(DomainMatcher.matches('http://192.168.1.100/api', '192.168.1.100')).toBe(true);
            });

            it('matches IPv4 with correct port', () => {
                expect(DomainMatcher.matches('http://10.0.0.1:8443/internal', '10.0.0.1:8443')).toBe(true);
            });

            it('does not match IPv4 with wrong port', () => {
                expect(DomainMatcher.matches('http://10.0.0.1:9090/internal', '10.0.0.1:8443')).toBe(false);
            });

            it('does not match different IPv4 address', () => {
                expect(DomainMatcher.matches('http://192.168.1.1/api', '192.168.1.2')).toBe(false);
            });

            it('matches loopback address', () => {
                expect(DomainMatcher.matches('http://127.0.0.1:8080/health', '127.0.0.1:8080')).toBe(true);
            });

            it('does not match IPv4 without port against IPv4 with port', () => {
                expect(DomainMatcher.matches('http://192.168.1.1/api', '192.168.1.1:8080')).toBe(false);
            });
        });

        describe('full URL patterns (*://...)', () => {
            it('matches full URL pattern with wildcards', () => {
                expect(DomainMatcher.matches(
                    'https://api.acme-corp.com/v2/oauth/token',
                    '*://api.acme-corp.com/*'
                )).toBe(true);
            });

            it('matches http protocol variant', () => {
                expect(DomainMatcher.matches(
                    'http://api.acme-corp.com/legacy/endpoint',
                    '*://api.acme-corp.com/*'
                )).toBe(true);
            });

            it('does not match different domain in full URL pattern', () => {
                expect(DomainMatcher.matches(
                    'https://api.partner-service.io/v1',
                    '*://api.acme-corp.com/*'
                )).toBe(false);
            });

            it('matches URL pattern with specific path prefix', () => {
                expect(DomainMatcher.matches(
                    'https://api.acme-corp.com/v2/tokens/refresh',
                    '*://api.acme-corp.com/v2/*'
                )).toBe(true);
            });

            it('does not match URL pattern with non-matching path', () => {
                expect(DomainMatcher.matches(
                    'https://api.acme-corp.com/v1/tokens',
                    '*://api.acme-corp.com/v2/*'
                )).toBe(false);
            });
        });

        describe('edge cases', () => {
            it('returns false for null URL', () => {
                expect(DomainMatcher.matches(null, 'acme-corp.com')).toBe(false);
            });

            it('returns false for undefined URL', () => {
                expect(DomainMatcher.matches(undefined, 'acme-corp.com')).toBe(false);
            });

            it('returns false for null pattern', () => {
                expect(DomainMatcher.matches('https://acme-corp.com', null)).toBe(false);
            });

            it('returns false for undefined pattern', () => {
                expect(DomainMatcher.matches('https://acme-corp.com', undefined)).toBe(false);
            });

            it('returns false for empty URL string', () => {
                expect(DomainMatcher.matches('', 'acme-corp.com')).toBe(false);
            });

            it('returns false for empty pattern string', () => {
                expect(DomainMatcher.matches('https://acme-corp.com', '')).toBe(false);
            });

            it('returns false for both null', () => {
                expect(DomainMatcher.matches(null, null)).toBe(false);
            });

            it('handles URL with encoded characters', () => {
                expect(DomainMatcher.matches(
                    'https://api.acme-corp.com/path%20with%20spaces?q=hello%20world',
                    'api.acme-corp.com'
                )).toBe(true);
            });

            it('handles URL with fragment', () => {
                expect(DomainMatcher.matches(
                    'https://docs.acme-corp.com/page#section-3',
                    'docs.acme-corp.com'
                )).toBe(true);
            });

            it('handles URL with authentication credentials', () => {
                expect(DomainMatcher.matches(
                    'https://user:pass@api.acme-corp.com/endpoint',
                    'api.acme-corp.com'
                )).toBe(true);
            });

            it('handles domain with hyphen in subdomain', () => {
                expect(DomainMatcher.matches(
                    'https://us-east-1.api.acme-corp.com/v1',
                    '*.acme-corp.com'
                )).toBe(true);
            });

            it('handles very long URL', () => {
                const longPath = '/segment'.repeat(100);
                expect(DomainMatcher.matches(
                    `https://api.acme-corp.com${longPath}`,
                    'api.acme-corp.com'
                )).toBe(true);
            });
        });
    });

    describe('matchesAny()', () => {
        it('returns true when domains array is empty (match all)', () => {
            expect(DomainMatcher.matchesAny('https://anything.acme-corp.com/api', [])).toBe(true);
        });

        it('returns true when domains is null (match all)', () => {
            expect(DomainMatcher.matchesAny('https://anything.acme-corp.com/api', null)).toBe(true);
        });

        it('returns true when domains is undefined (match all)', () => {
            expect(DomainMatcher.matchesAny('https://anything.acme-corp.com/api', undefined)).toBe(true);
        });

        it('returns true when URL matches one of multiple domains', () => {
            const domains = [
                'api.acme-corp.com',
                'auth.acme-corp.internal',
                '*.partner-service.io',
            ];
            expect(DomainMatcher.matchesAny('https://auth.acme-corp.internal/oauth2/token', domains)).toBe(true);
        });

        it('returns false when URL matches none of the domains', () => {
            const domains = [
                'api.acme-corp.com',
                'auth.acme-corp.internal:8443',
                '*.partner-service.io',
            ];
            expect(DomainMatcher.matchesAny('https://evil.example.com/phishing', domains)).toBe(false);
        });

        it('handles large domain list', () => {
            const domains = Array.from({ length: 100 }, (_, i) => `service-${i}.acme-corp.com`);
            expect(DomainMatcher.matchesAny('https://service-99.acme-corp.com/api', domains)).toBe(true);
            expect(DomainMatcher.matchesAny('https://service-100.acme-corp.com/api', domains)).toBe(false);
        });

        it('matches with mixed domain pattern types', () => {
            const domains = [
                '*.acme-corp.com',
                'localhost:3000',
                '192.168.1.1:8080',
                '*://partner.io/*',
            ];
            expect(DomainMatcher.matchesAny('https://api.acme-corp.com/v1', domains)).toBe(true);
            expect(DomainMatcher.matchesAny('http://localhost:3000/dev', domains)).toBe(true);
            expect(DomainMatcher.matchesAny('http://192.168.1.1:8080/internal', domains)).toBe(true);
            expect(DomainMatcher.matchesAny('https://partner.io/callback', domains)).toBe(true);
            expect(DomainMatcher.matchesAny('https://unrelated.example.org/', domains)).toBe(false);
        });
    });
});
