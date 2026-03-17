import { describe, it, expect } from 'vitest';

/**
 * Tests for the URL validation logic extracted from SettingsHandlers.handleOpenExternal.
 * We test the pure validation logic directly rather than importing the full
 * handler chain (which pulls in Electron dependencies).
 */

const ALLOWED_DOMAINS = [
    'openheaders.io',
    'github.com',
    'chromewebstore.google.com',
    'microsoftedge.microsoft.com',
    'addons.mozilla.org'
];

function validateExternalUrl(url: string): { success: boolean; error?: string } {
    try {
        const validUrl = new URL(url);
        if (validUrl.protocol !== 'https:') {
            return { success: false, error: 'Only HTTPS URLs are allowed' };
        }

        const isAllowed = ALLOWED_DOMAINS.some(domain =>
            validUrl.hostname === domain || validUrl.hostname.endsWith(`.${domain}`)
        );

        if (!isAllowed) {
            return { success: false, error: 'Only trusted domains are allowed' };
        }

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

describe('SettingsHandlers URL validation logic', () => {
    describe('protocol checks', () => {
        it('rejects non-HTTPS URLs', () => {
            expect(validateExternalUrl('http://example.com').success).toBe(false);
            expect(validateExternalUrl('http://example.com').error).toContain('Only HTTPS URLs are allowed');
        });

        it('rejects ftp protocol', () => {
            expect(validateExternalUrl('ftp://files.example.com').success).toBe(false);
        });

        it('rejects file protocol', () => {
            expect(validateExternalUrl('file:///etc/passwd').success).toBe(false);
        });

        it('rejects data protocol', () => {
            expect(validateExternalUrl('data:text/html,<h1>Hello</h1>').success).toBe(false);
        });
    });

    describe('domain whitelist', () => {
        it('rejects untrusted domains', () => {
            expect(validateExternalUrl('https://evil.com/steal-data').success).toBe(false);
            expect(validateExternalUrl('https://evil.com/steal-data').error).toContain('Only trusted domains');
        });

        it('rejects domain spoofing with subdomain trick', () => {
            expect(validateExternalUrl('https://openheaders.io.evil.com/phish').success).toBe(false);
        });

        it('allows openheaders.io', () => {
            expect(validateExternalUrl('https://openheaders.io').success).toBe(true);
        });

        it('allows openheaders.io subdomains', () => {
            expect(validateExternalUrl('https://docs.openheaders.io/guide').success).toBe(true);
        });

        it('allows github.com', () => {
            expect(validateExternalUrl('https://github.com/OpenHeaders/open-headers-app').success).toBe(true);
        });

        it('allows chromewebstore.google.com', () => {
            expect(validateExternalUrl('https://chromewebstore.google.com/detail/test').success).toBe(true);
        });

        it('allows microsoftedge.microsoft.com', () => {
            expect(validateExternalUrl('https://microsoftedge.microsoft.com/addons/detail/test').success).toBe(true);
        });

        it('allows addons.mozilla.org', () => {
            expect(validateExternalUrl('https://addons.mozilla.org/firefox/addon/test').success).toBe(true);
        });

        it('rejects non-whitelisted HTTPS domains', () => {
            expect(validateExternalUrl('https://google.com').success).toBe(false);
            expect(validateExternalUrl('https://facebook.com').success).toBe(false);
        });
    });

    describe('invalid URLs', () => {
        it('rejects non-URL strings', () => {
            expect(validateExternalUrl('not-a-url').success).toBe(false);
        });

        it('rejects empty string', () => {
            expect(validateExternalUrl('').success).toBe(false);
        });
    });
});
