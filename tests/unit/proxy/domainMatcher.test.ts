import { describe, it, expect } from 'vitest';
import DomainMatcher from '../../../src/services/proxy/domainMatcher';

describe('DomainMatcher', () => {
    describe('matches()', () => {
        describe('exact domain', () => {
            it('matches exact enterprise domain', () => {
                expect(DomainMatcher.matches('https://api.openheaders.io/v2/tokens', 'api.openheaders.io')).toBe(true);
            });

            it('is case-insensitive on both URL and pattern', () => {
                expect(DomainMatcher.matches('https://API.OpenHeaders.IO/path', 'api.openheaders.io')).toBe(true);
                expect(DomainMatcher.matches('https://api.openheaders.io/path', 'API.OpenHeaders.IO')).toBe(true);
            });

            it('does not match different domain', () => {
                expect(DomainMatcher.matches('https://api.partners.openheaders.io/v1', 'api.openheaders.io')).toBe(false);
            });

            it('does not match subdomain against bare domain', () => {
                expect(DomainMatcher.matches('https://staging.api.openheaders.io/v1', 'api.openheaders.io')).toBe(false);
            });

            it('does not match domain that contains the pattern as substring', () => {
                expect(DomainMatcher.matches('https://notopenheaders.io/path', 'openheaders.io')).toBe(false);
            });

            it('matches domain with long subpath and query string', () => {
                expect(DomainMatcher.matches(
                    'https://auth.internal.openheaders.io/oauth2/token?grant_type=client_credentials&scope=api.read',
                    'auth.internal.openheaders.io'
                )).toBe(true);
            });
        });

        describe('wildcard subdomain (*.openheaders.io)', () => {
            it('matches single subdomain', () => {
                expect(DomainMatcher.matches('https://api.openheaders.io/v1/resources', '*.openheaders.io')).toBe(true);
            });

            it('matches deeply nested subdomain', () => {
                expect(DomainMatcher.matches('https://us-east-1.staging.api.openheaders.io/', '*.openheaders.io')).toBe(true);
            });

            it('matches the base domain itself (wildcard includes base)', () => {
                expect(DomainMatcher.matches('https://openheaders.io/', '*.openheaders.io')).toBe(true);
            });

            it('does not match unrelated domain', () => {
                expect(DomainMatcher.matches('https://evil-openheaders.io/', '*.openheaders.io')).toBe(false);
            });

            it('is case-insensitive for wildcard patterns', () => {
                expect(DomainMatcher.matches('https://API.OPENHEADERS.IO/path', '*.openheaders.io')).toBe(true);
            });

            it('matches wildcard with enterprise internal domain', () => {
                expect(DomainMatcher.matches(
                    'https://gitlab.internal.openheaders.io:8443/api/v4/projects',
                    '*.internal.openheaders.io'
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
                expect(DomainMatcher.matches('https://api.openheaders.io/api', 'localhost')).toBe(false);
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
                    'https://api.openheaders.io/v2/oauth/token',
                    '*://api.openheaders.io/*'
                )).toBe(true);
            });

            it('matches http protocol variant', () => {
                expect(DomainMatcher.matches(
                    'http://api.openheaders.io/legacy/endpoint',
                    '*://api.openheaders.io/*'
                )).toBe(true);
            });

            it('does not match different domain in full URL pattern', () => {
                expect(DomainMatcher.matches(
                    'https://api.partners.openheaders.io/v1',
                    '*://api.openheaders.io/*'
                )).toBe(false);
            });

            it('matches URL pattern with specific path prefix', () => {
                expect(DomainMatcher.matches(
                    'https://api.openheaders.io/v2/tokens/refresh',
                    '*://api.openheaders.io/v2/*'
                )).toBe(true);
            });

            it('does not match URL pattern with non-matching path', () => {
                expect(DomainMatcher.matches(
                    'https://api.openheaders.io/v1/tokens',
                    '*://api.openheaders.io/v2/*'
                )).toBe(false);
            });
        });

        describe('edge cases', () => {
            it('returns false for null URL', () => {
                expect(DomainMatcher.matches(null, 'openheaders.io')).toBe(false);
            });

            it('returns false for undefined URL', () => {
                expect(DomainMatcher.matches(undefined, 'openheaders.io')).toBe(false);
            });

            it('returns false for null pattern', () => {
                expect(DomainMatcher.matches('https://openheaders.io', null)).toBe(false);
            });

            it('returns false for undefined pattern', () => {
                expect(DomainMatcher.matches('https://openheaders.io', undefined)).toBe(false);
            });

            it('returns false for empty URL string', () => {
                expect(DomainMatcher.matches('', 'openheaders.io')).toBe(false);
            });

            it('returns false for empty pattern string', () => {
                expect(DomainMatcher.matches('https://openheaders.io', '')).toBe(false);
            });

            it('returns false for both null', () => {
                expect(DomainMatcher.matches(null, null)).toBe(false);
            });

            it('handles URL with encoded characters', () => {
                expect(DomainMatcher.matches(
                    'https://api.openheaders.io/path%20with%20spaces?q=hello%20world',
                    'api.openheaders.io'
                )).toBe(true);
            });

            it('handles URL with fragment', () => {
                expect(DomainMatcher.matches(
                    'https://docs.openheaders.io/page#section-3',
                    'docs.openheaders.io'
                )).toBe(true);
            });

            it('handles URL with authentication credentials', () => {
                expect(DomainMatcher.matches(
                    'https://user:pass@api.openheaders.io/endpoint',
                    'api.openheaders.io'
                )).toBe(true);
            });

            it('handles domain with hyphen in subdomain', () => {
                expect(DomainMatcher.matches(
                    'https://us-east-1.api.openheaders.io/v1',
                    '*.openheaders.io'
                )).toBe(true);
            });

            it('handles very long URL', () => {
                const longPath = '/segment'.repeat(100);
                expect(DomainMatcher.matches(
                    `https://api.openheaders.io${longPath}`,
                    'api.openheaders.io'
                )).toBe(true);
            });
        });
    });

    describe('matchesAny()', () => {
        it('returns true when domains array is empty (match all)', () => {
            expect(DomainMatcher.matchesAny('https://anything.openheaders.io/api', [])).toBe(true);
        });

        it('returns true when domains is null (match all)', () => {
            expect(DomainMatcher.matchesAny('https://anything.openheaders.io/api', null)).toBe(true);
        });

        it('returns true when domains is undefined (match all)', () => {
            expect(DomainMatcher.matchesAny('https://anything.openheaders.io/api', undefined)).toBe(true);
        });

        it('returns true when URL matches one of multiple domains', () => {
            const domains = [
                'api.openheaders.io',
                'auth.internal.openheaders.io',
                '*.partners.openheaders.io',
            ];
            expect(DomainMatcher.matchesAny('https://auth.internal.openheaders.io/oauth2/token', domains)).toBe(true);
        });

        it('returns false when URL matches none of the domains', () => {
            const domains = [
                'api.openheaders.io',
                'auth.internal.openheaders.io:8443',
                '*.partners.openheaders.io',
            ];
            expect(DomainMatcher.matchesAny('https://evil.notrelated.com/phishing', domains)).toBe(false);
        });

        it('handles large domain list', () => {
            const domains = Array.from({ length: 100 }, (_, i) => `service-${i}.openheaders.io`);
            expect(DomainMatcher.matchesAny('https://service-99.openheaders.io/api', domains)).toBe(true);
            expect(DomainMatcher.matchesAny('https://service-100.openheaders.io/api', domains)).toBe(false);
        });

        it('matches with mixed domain pattern types', () => {
            const domains = [
                '*.openheaders.io',
                'localhost:3000',
                '192.168.1.1:8080',
                '*://partners.openheaders.io/*',
            ];
            expect(DomainMatcher.matchesAny('https://api.openheaders.io/v1', domains)).toBe(true);
            expect(DomainMatcher.matchesAny('http://localhost:3000/dev', domains)).toBe(true);
            expect(DomainMatcher.matchesAny('http://192.168.1.1:8080/internal', domains)).toBe(true);
            expect(DomainMatcher.matchesAny('https://partners.openheaders.io/callback', domains)).toBe(true);
            expect(DomainMatcher.matchesAny('https://unrelated.notmatched.com/', domains)).toBe(false);
        });
    });
});
