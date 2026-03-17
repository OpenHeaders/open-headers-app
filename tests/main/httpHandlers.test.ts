import { describe, it, expect, beforeEach } from 'vitest';
import { HttpHandlers } from '../../src/main/modules/ipc/handlers/httpHandlers';

describe('HttpHandlers', () => {
    let handlers: HttpHandlers;

    beforeEach(() => {
        handlers = new HttpHandlers();
    });

    describe('processFormData', () => {
        const requestId = 'test-req-1';

        it('returns pre-encoded form data as-is (key=value&key=value)', () => {
            const body = 'username=john&password=secret';
            const result = handlers._processFormData(body, requestId);
            expect(result).toBe('username=john&password=secret');
        });

        it('converts newline-separated key=value pairs to &-joined', () => {
            const body = 'key1=val1\nkey2=val2\nkey3=val3';
            const result = handlers._processFormData(body, requestId);
            expect(result).toBe('key1=val1&key2=val2&key3=val3');
        });

        it('filters blank lines in newline-separated format', () => {
            const body = 'key1=val1\n\nkey2=val2\n\n';
            const result = handlers._processFormData(body, requestId);
            expect(result).toBe('key1=val1&key2=val2');
        });

        it('parses colon-separated key:value pairs', () => {
            const body = 'username:john\npassword:secret';
            const result = handlers._processFormData(body, requestId);
            expect(result).toContain('username=john');
            expect(result).toContain('password=secret');
        });

        it('parses colon-separated pairs with quoted values', () => {
            const body = 'name:"John Doe"\nemail:"john@example.com"';
            const result = handlers._processFormData(body, requestId);
            expect(result).toContain('name=John%20Doe');
            expect(result).toContain('email=john%40example.com');
        });

        it('handles colon in values (URL)', () => {
            const body = 'url:https://example.com';
            const result = handlers._processFormData(body, requestId);
            expect(result).toContain('url=https%3A%2F%2Fexample.com');
        });

        it('converts object body to querystring', () => {
            const body = { username: 'john', password: 'secret' };
            const result = handlers._processFormData(body, requestId);
            expect(result).toContain('username=john');
            expect(result).toContain('password=secret');
        });

        it('returns non-matching string body unchanged', () => {
            const body = 'just a plain string without delimiters';
            const result = handlers._processFormData(body, requestId);
            expect(result).toBe(body);
        });

        it('returns null body as-is', () => {
            const result = handlers._processFormData(null, requestId);
            expect(result).toBeNull();
        });

        it('skips empty lines in colon format', () => {
            const body = 'key1:val1\n\nkey2:val2';
            const result = handlers._processFormData(body, requestId);
            expect(result).toContain('key1=val1');
            expect(result).toContain('key2=val2');
        });
    });
});
