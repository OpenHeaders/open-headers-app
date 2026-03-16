import { describe, it, expect } from 'vitest';
import DomainMatcher from '../../../src/services/proxy/domainMatcher';

describe('DomainMatcher', () => {
    describe('matches()', () => {
        describe('exact domain', () => {
            it('matches exact domain', () => {
                expect(DomainMatcher.matches('https://example.com/path', 'example.com')).toBe(true);
            });

            it('is case-insensitive', () => {
                expect(DomainMatcher.matches('https://Example.COM/path', 'example.com')).toBe(true);
                expect(DomainMatcher.matches('https://example.com/path', 'Example.COM')).toBe(true);
            });

            it('does not match different domain', () => {
                expect(DomainMatcher.matches('https://other.com/path', 'example.com')).toBe(false);
            });

            it('does not match subdomain against bare domain', () => {
                expect(DomainMatcher.matches('https://sub.example.com/path', 'example.com')).toBe(false);
            });
        });

        describe('wildcard subdomain (*.example.com)', () => {
            it('matches subdomain', () => {
                expect(DomainMatcher.matches('https://api.example.com/v1', '*.example.com')).toBe(true);
            });

            it('matches nested subdomain', () => {
                expect(DomainMatcher.matches('https://a.b.example.com/', '*.example.com')).toBe(true);
            });

            it('matches the base domain itself', () => {
                expect(DomainMatcher.matches('https://example.com/', '*.example.com')).toBe(true);
            });

            it('does not match unrelated domain', () => {
                expect(DomainMatcher.matches('https://notexample.com/', '*.example.com')).toBe(false);
            });
        });

        describe('localhost', () => {
            it('matches localhost without port', () => {
                expect(DomainMatcher.matches('http://localhost/api', 'localhost')).toBe(true);
            });

            it('matches localhost with correct port', () => {
                expect(DomainMatcher.matches('http://localhost:3001/api', 'localhost:3001')).toBe(true);
            });

            it('does not match localhost with wrong port', () => {
                expect(DomainMatcher.matches('http://localhost:3000/api', 'localhost:3001')).toBe(false);
            });
        });

        describe('IP addresses', () => {
            it('matches exact IP', () => {
                expect(DomainMatcher.matches('http://192.168.1.1/api', '192.168.1.1')).toBe(true);
            });

            it('matches IP with correct port', () => {
                expect(DomainMatcher.matches('http://192.168.1.1:8080/api', '192.168.1.1:8080')).toBe(true);
            });

            it('does not match IP with wrong port', () => {
                expect(DomainMatcher.matches('http://192.168.1.1:9090/api', '192.168.1.1:8080')).toBe(false);
            });
        });

        describe('full URL patterns (*://...)', () => {
            it('matches full URL pattern with wildcards', () => {
                expect(DomainMatcher.matches('https://example.com/api/v1', '*://example.com/*')).toBe(true);
            });

            it('matches http protocol', () => {
                expect(DomainMatcher.matches('http://example.com/path', '*://example.com/*')).toBe(true);
            });

            it('does not match different domain in full URL pattern', () => {
                expect(DomainMatcher.matches('https://other.com/path', '*://example.com/*')).toBe(false);
            });
        });

        describe('edge cases', () => {
            it('returns false for null URL', () => {
                expect(DomainMatcher.matches(null, 'example.com')).toBe(false);
            });

            it('returns false for null pattern', () => {
                expect(DomainMatcher.matches('https://example.com', null)).toBe(false);
            });

            it('returns false for empty strings', () => {
                expect(DomainMatcher.matches('', '')).toBe(false);
            });
        });
    });

    describe('matchesAny()', () => {
        it('returns true when no domains (match all)', () => {
            expect(DomainMatcher.matchesAny('https://anything.com', [])).toBe(true);
            expect(DomainMatcher.matchesAny('https://anything.com', null)).toBe(true);
        });

        it('returns true when URL matches one of the domains', () => {
            const domains = ['api.example.com', 'cdn.example.com'];
            expect(DomainMatcher.matchesAny('https://api.example.com/v1', domains)).toBe(true);
        });

        it('returns false when URL matches none of the domains', () => {
            const domains = ['api.example.com', 'cdn.example.com'];
            expect(DomainMatcher.matchesAny('https://other.com/', domains)).toBe(false);
        });
    });
});
