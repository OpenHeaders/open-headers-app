import { describe, it, expect } from 'vitest';
import { encodeFormBody } from '../../../../src/services/source-refresh/SourceFetcher';

describe('encodeFormBody', () => {
    it('converts key:value newline format to URL-encoded form data', () => {
        const body = 'username:user@openheaders.io\npassword:s3cret!\ngrant_type:password';
        const result = encodeFormBody(body);
        expect(result).toContain('username=user%40openheaders.io');
        expect(result).toContain('password=s3cret%21');
        expect(result).toContain('grant_type=password');
        expect(result).toContain('&');
    });

    it('preserves colon-containing values (e.g. Basic auth)', () => {
        const body = 'Authorization:Basic dXNlcjpwYXNz\ngrant_type:password';
        const result = encodeFormBody(body);
        // The value after the FIRST colon should be preserved intact
        expect(result).toContain('Authorization=Basic+dXNlcjpwYXNz');
    });

    it('passes through already-encoded key=value& format', () => {
        const body = 'username=user&password=pass&grant_type=password';
        expect(encodeFormBody(body)).toBe(body);
    });

    it('converts key=value with newline separators to &-joined', () => {
        const body = 'username=user\npassword=pass\ngrant_type=password';
        const result = encodeFormBody(body);
        expect(result).toBe('username=user&password=pass&grant_type=password');
    });

    it('skips empty lines', () => {
        const body = 'key1:value1\n\nkey2:value2\n';
        const result = encodeFormBody(body);
        expect(result).toContain('key1=value1');
        expect(result).toContain('key2=value2');
        expect(result).not.toContain('=&');
    });

    it('returns plain body when no recognized format', () => {
        const body = 'just some plain text';
        expect(encodeFormBody(body)).toBe('just some plain text');
    });

    it('handles the real OAuth token request body format', () => {
        const body = [
            'username:user@openheaders.io#1c18b88a',
            'password:MyP@ssw0rd!',
            'client_id:7koqk2jawr3li',
            'verification_code:123456',
            'grant_type:password',
            'scope:openid email profile'
        ].join('\n');
        const result = encodeFormBody(body);

        expect(result).toContain('username=');
        expect(result).toContain('password=');
        expect(result).toContain('grant_type=password');
        // URLSearchParams uses + for spaces (standard form encoding)
        expect(result).toContain('scope=openid+email+profile');
        // @ and ! should be percent-encoded
        expect(result).toContain('%40');
        expect(result).toContain('%21');
        expect(result).not.toContain('\n');
    });

    it('encodes special characters that querystring.stringify misses', () => {
        const body = 'password:P@ss!w0rd#123';
        const result = encodeFormBody(body);
        // URLSearchParams encodes @, !, # — all required for correct form encoding
        expect(result).toBe('password=P%40ss%21w0rd%23123');
    });
});
