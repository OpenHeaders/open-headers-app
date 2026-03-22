import { describe, it, expect, beforeEach } from 'vitest';
import { HttpHandlers } from '../../../src/main/modules/ipc/handlers/httpHandlers';

function makeHandlers(): HttpHandlers {
    return new HttpHandlers();
}

describe('HttpHandlers', () => {
    let handlers: HttpHandlers;

    beforeEach(() => {
        handlers = makeHandlers();
    });

    describe('processFormData', () => {
        const requestId = 'req-a1b2c3d4e5f67890';

        describe('null and empty inputs', () => {
            it('returns null for null body', () => {
                expect(handlers.processFormData(null, requestId)).toBeNull();
            });

            it('returns empty string body unchanged', () => {
                expect(handlers.processFormData('', requestId)).toBe('');
            });
        });

        describe('pre-encoded form data (key=value&key=value)', () => {
            it('returns simple pre-encoded form data as-is', () => {
                const body = 'grant_type=client_credentials&scope=openid%20profile';
                const result = handlers.processFormData(body, requestId);
                expect(result).toBe('grant_type=client_credentials&scope=openid%20profile');
            });

            it('returns enterprise OAuth2 token request form data as-is', () => {
                const body = 'client_id=oh-platform-service-a1b2c3&client_secret=ohk_live_4eC39HqLyjWDarjtT1zdp7dc&grant_type=client_credentials';
                const result = handlers.processFormData(body, requestId);
                expect(result).toBe(body);
            });

            it('returns URL-encoded special characters as-is', () => {
                const body = 'username=admin%40openheaders.io&password=P%40ssw0rd%21%26%23';
                const result = handlers.processFormData(body, requestId);
                expect(result).toBe(body);
            });
        });

        describe('newline-separated key=value pairs', () => {
            it('converts newline-separated pairs to &-joined', () => {
                const body = 'client_id=oh-staging-app-9f8e7d6c\nclient_secret=ohk_test_Q3W4E5R6T7Y8U9I0\ngrant_type=authorization_code';
                const result = handlers.processFormData(body, requestId);
                expect(result).toBe(
                    'client_id=oh-staging-app-9f8e7d6c&client_secret=ohk_test_Q3W4E5R6T7Y8U9I0&grant_type=authorization_code'
                );
            });

            it('filters blank lines in newline-separated format', () => {
                const body = 'api_key=ohk_live_4eC39HqLyjWDarjtT1zdp7dc\n\nformat=json\n\n';
                const result = handlers.processFormData(body, requestId);
                expect(result).toBe('api_key=ohk_live_4eC39HqLyjWDarjtT1zdp7dc&format=json');
            });

            it('filters lines without = sign', () => {
                const body = 'key1=val1\njust-a-comment\nkey2=val2';
                const result = handlers.processFormData(body, requestId);
                expect(result).toBe('key1=val1&key2=val2');
            });
        });

        describe('colon-separated key:value pairs', () => {
            it('parses colon-separated key:value pairs', () => {
                const body = 'username:admin@openheaders.io\npassword:S3cur3P@ss!';
                const result = handlers.processFormData(body, requestId);
                expect(result).toContain('username=admin%40openheaders.io');
                expect(result).toContain('password=S3cur3P%40ss!');
            });

            it('parses colon-separated pairs with quoted values', () => {
                const body = 'workspace:"OpenHeaders — Staging Environment"\nemail:"admin@openheaders.io"';
                const result = handlers.processFormData(body, requestId);
                expect(result).toContain('workspace=OpenHeaders');
                expect(result).toContain('email=admin%40openheaders.io');
            });

            it('handles colons in values (URLs)', () => {
                const body = 'redirect_uri:https://auth.openheaders.io:8443/callback';
                const result = handlers.processFormData(body, requestId);
                expect(result).toContain('redirect_uri=https%3A%2F%2Fauth.openheaders.io%3A8443%2Fcallback');
            });

            it('skips empty lines in colon format', () => {
                const body = 'client_id:oh-prod-svc\n\nclient_secret:ohk_live_abc123';
                const result = handlers.processFormData(body, requestId);
                expect(result).toContain('client_id=oh-prod-svc');
                expect(result).toContain('client_secret=ohk_live_abc123');
            });

            it('handles values with multiple colons (JWT tokens)', () => {
                const body = 'token:eyJhbGciOiJSUzI1NiI:payload:signature';
                const result = handlers.processFormData(body, requestId);
                expect(result).toContain('token=eyJhbGciOiJSUzI1NiI%3Apayload%3Asignature');
            });
        });

        describe('object body', () => {
            it('converts object body to querystring', () => {
                const body = {
                    client_id: 'oh-platform-service-a1b2c3',
                    client_secret: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
                    grant_type: 'client_credentials',
                    scope: 'openid profile email'
                };
                const result = handlers.processFormData(body, requestId);
                expect(result).toContain('client_id=oh-platform-service-a1b2c3');
                expect(result).toContain('client_secret=ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
                expect(result).toContain('grant_type=client_credentials');
                expect(result).toContain('scope=openid%20profile%20email');
            });

            it('handles object with special characters in values', () => {
                const body = {
                    redirect_uri: 'https://auth.openheaders.io/callback?state=abc',
                    password: 'P@ss+w0rd&special=true'
                };
                const result = handlers.processFormData(body, requestId);
                expect(result).toContain('redirect_uri=https%3A%2F%2Fauth.openheaders.io%2Fcallback%3Fstate%3Dabc');
                expect(result).toContain('password=P%40ss%2Bw0rd%26special%3Dtrue');
            });

            it('handles empty object', () => {
                const result = handlers.processFormData({}, requestId);
                expect(result).toBe('');
            });
        });

        describe('non-matching string body', () => {
            it('returns plain string without delimiters unchanged', () => {
                const body = 'just a plain string without any recognized delimiters';
                const result = handlers.processFormData(body, requestId);
                expect(result).toBe(body);
            });

            it('returns single value without delimiter unchanged', () => {
                const body = 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc';
                const result = handlers.processFormData(body, requestId);
                expect(result).toBe(body);
            });
        });

        describe('edge cases', () => {
            it('handles single key=value pair (no & or newline)', () => {
                // Has '=' but no '&' or '\n' — treated as plain string
                const body = 'single_key=single_value';
                const result = handlers.processFormData(body, requestId);
                // This falls through to the colon check, then returns as-is
                expect(result).toBe('single_key=single_value');
            });

            it('handles unicode characters in values', () => {
                const body = { name: '日本語テスト', city: 'München' };
                const result = handlers.processFormData(body, requestId);
                expect(result).toContain('name=');
                expect(result).toContain('city=');
            });
        });
    });

    describe('constructor binding', () => {
        it('binds handleMakeHttpRequest as a method', () => {
            expect(typeof handlers.handleMakeHttpRequest).toBe('function');
        });

        it('binds processFormData as a method', () => {
            expect(typeof handlers.processFormData).toBe('function');
        });

        it('bound processFormData works when called detached', () => {
            const { processFormData } = handlers;
            const result = processFormData('key=val&foo=bar', 'req-detached-test');
            expect(result).toBe('key=val&foo=bar');
        });
    });
});
