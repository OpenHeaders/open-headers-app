import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron — vi.hoisted ensures mockNetRequest exists before vi.mock factory runs
const { mockNetRequest } = vi.hoisted(() => ({
  mockNetRequest: vi.fn(),
}));

vi.mock('electron', () => ({
  default: {
    app: { getVersion: () => '3.5.0' },
    net: { request: mockNetRequest },
  },
}));

// Mock mainLogger
vi.mock('../../../../src/utils/mainLogger', () => ({
  default: {
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import type { EnvironmentResolver } from '@/services/http/HttpRequestService';
import { encodeFormBody, HttpRequestService } from '@/services/http/HttpRequestService';
import { TotpCooldownTracker } from '@/services/http/TotpCooldownTracker';
import type { HttpRequestSpec } from '@/types/http';

// ── Helpers ─────────────────────────────────────────────────────────

function makeEnvResolver(vars: Record<string, string> = {}): EnvironmentResolver {
  return {
    loadEnvironmentVariables: vi.fn(() => vars),
    resolveTemplate: vi.fn((template: string, variables: Record<string, string>) => {
      let result = template;
      for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
      return result;
    }),
  };
}

function mockElectronResponse(statusCode: number, body: string, headers: Record<string, string> = {}) {
  const responseHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  const requestHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};

  const response = {
    statusCode,
    headers: headers as Record<string, string | string[]>,
    on: (event: string, handler: (...args: unknown[]) => void) => {
      if (!responseHandlers[event]) responseHandlers[event] = [];
      responseHandlers[event].push(handler);
    },
  };

  const request = {
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(() => {
      // Trigger response
      setTimeout(() => {
        for (const h of requestHandlers.response || []) h(response);
        // Trigger data
        setTimeout(() => {
          for (const h of responseHandlers.data || []) h(Buffer.from(body));
          // Trigger end
          setTimeout(() => {
            for (const h of responseHandlers.end || []) h();
          }, 0);
        }, 0);
      }, 0);
    }),
    abort: vi.fn(),
    on: (event: string, handler: (...args: unknown[]) => void) => {
      if (!requestHandlers[event]) requestHandlers[event] = [];
      requestHandlers[event].push(handler);
    },
  };

  mockNetRequest.mockReturnValue(request);
  return { request, response };
}

function makeSpec(overrides: Partial<HttpRequestSpec> = {}): HttpRequestSpec {
  return {
    url: 'https://api.openheaders.io/v1/sources',
    method: 'GET',
    sourceId: 'src-1',
    workspaceId: 'ws-test-1',
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('HttpRequestService', () => {
  let tracker: TotpCooldownTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new TotpCooldownTracker();
    mockNetRequest.mockReset();
  });

  afterEach(() => {
    tracker.destroy();
    vi.useRealTimers();
  });

  describe('execute', () => {
    it('makes a basic GET request and returns result', async () => {
      const resolver = makeEnvResolver();
      const service = new HttpRequestService(resolver, tracker);
      mockElectronResponse(200, '{"ok":true}', { 'content-type': 'application/json' });

      const resultPromise = service.execute(makeSpec());
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('{"ok":true}');
      expect(result.headers['content-type']).toBe('application/json');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.responseSize).toBeGreaterThan(0);
      expect(result.isFiltered).toBe(false);
    });

    it('resolves {{VAR}} templates in URL', async () => {
      const resolver = makeEnvResolver({ API_URL: 'https://api.openheaders.io' });
      const service = new HttpRequestService(resolver, tracker);
      mockElectronResponse(200, 'ok');

      const resultPromise = service.execute(makeSpec({ url: '{{API_URL}}/v1/test' }));
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(mockNetRequest).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://api.openheaders.io/v1/test' }),
      );
    });

    it('resolves {{VAR}} in headers (both keys and values)', async () => {
      const resolver = makeEnvResolver({ TOKEN: 'bearer-123', HEADER_NAME: 'X-Custom' });
      const service = new HttpRequestService(resolver, tracker);
      const { request } = mockElectronResponse(200, 'ok');

      const resultPromise = service.execute(
        makeSpec({
          headers: [
            { key: '{{HEADER_NAME}}', value: '{{TOKEN}}' },
            { key: 'Accept', value: 'application/json' },
          ],
        }),
      );
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(request.setHeader).toHaveBeenCalledWith('X-Custom', 'bearer-123');
      expect(request.setHeader).toHaveBeenCalledWith('Accept', 'application/json');
    });

    it('resolves {{VAR}} in query params', async () => {
      const resolver = makeEnvResolver({ PAGE: '2' });
      const service = new HttpRequestService(resolver, tracker);
      mockElectronResponse(200, 'ok');

      const resultPromise = service.execute(
        makeSpec({
          url: 'https://api.openheaders.io/v1/list',
          queryParams: [{ key: 'page', value: '{{PAGE}}' }],
        }),
      );
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(mockNetRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('page=2'),
        }),
      );
    });

    it('resolves {{VAR}} in body', async () => {
      const resolver = makeEnvResolver({ USER: 'admin@openheaders.io' });
      const service = new HttpRequestService(resolver, tracker);
      const { request } = mockElectronResponse(200, 'ok');

      const resultPromise = service.execute(
        makeSpec({
          method: 'POST',
          body: '{"user":"{{USER}}"}',
          contentType: 'application/json',
        }),
      );
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(request.write).toHaveBeenCalledWith(Buffer.from('{"user":"admin@openheaders.io"}'));
    });

    it('sends body for any HTTP method including GET and DELETE', async () => {
      const resolver = makeEnvResolver();
      const service = new HttpRequestService(resolver, tracker);

      for (const method of ['GET', 'DELETE', 'POST', 'PUT', 'PATCH']) {
        mockNetRequest.mockReset();
        const { request } = mockElectronResponse(200, 'ok');

        const resultPromise = service.execute(
          makeSpec({
            method,
            body: '{"query":"test"}',
          }),
        );
        await vi.runAllTimersAsync();
        await resultPromise;

        expect(request.write).toHaveBeenCalledWith(Buffer.from('{"query":"test"}'));
      }
    });

    it('does NOT throw on 4xx/5xx — returns statusCode', async () => {
      const resolver = makeEnvResolver();
      const service = new HttpRequestService(resolver, tracker);
      mockElectronResponse(404, 'Not Found');

      const resultPromise = service.execute(makeSpec());
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.statusCode).toBe(404);
      expect(result.body).toBe('Not Found');
    });

    it('throws on invalid URL after variable substitution', async () => {
      const resolver = makeEnvResolver();
      const service = new HttpRequestService(resolver, tracker);

      await expect(service.execute(makeSpec({ url: '' }))).rejects.toThrow('Invalid URL');
    });

    it('applies JSON filter when enabled', async () => {
      const resolver = makeEnvResolver();
      const service = new HttpRequestService(resolver, tracker);
      mockElectronResponse(200, '{"data":{"value":42}}');

      const resultPromise = service.execute(
        makeSpec({
          jsonFilter: { enabled: true, path: 'data.value' },
        }),
      );
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.isFiltered).toBe(true);
      expect(result.filteredBody).toBe('42');
      expect(result.filteredWith).toBe('data.value');
      expect(result.originalResponse).toBe('{"data":{"value":42}}');
      expect(result.body).toBe('{"data":{"value":42}}');
    });

    it('encodes form body for application/x-www-form-urlencoded', async () => {
      const resolver = makeEnvResolver();
      const service = new HttpRequestService(resolver, tracker);
      const { request } = mockElectronResponse(200, 'ok');

      const resultPromise = service.execute(
        makeSpec({
          method: 'POST',
          body: 'username:user@openheaders.io\npassword:secret',
          contentType: 'application/x-www-form-urlencoded',
        }),
      );
      await vi.runAllTimersAsync();
      await resultPromise;

      const writtenBody = (request.write as ReturnType<typeof vi.fn>).mock.calls[0][0].toString();
      expect(writtenBody).toContain('username=');
      expect(writtenBody).toContain('password=');
      expect(writtenBody).not.toContain('\n');
    });

    it('throws on TOTP cooldown', async () => {
      const resolver = makeEnvResolver();
      const service = new HttpRequestService(resolver, tracker);

      // Record a TOTP usage to trigger cooldown
      tracker.recordUsage('ws-test-1', 'src-1', 'secret', '123456');

      await expect(service.execute(makeSpec({ totpSecret: 'secret' }))).rejects.toThrow('TOTP cooldown active');
    });

    it('throws on timeout', async () => {
      vi.useRealTimers(); // Use real timers for this test to avoid fake timer conflicts

      const resolver = makeEnvResolver();
      const service = new HttpRequestService(resolver, tracker);

      // Mock a request that never responds
      mockNetRequest.mockReturnValue({
        setHeader: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        abort: vi.fn(),
        on: vi.fn(),
      });

      await expect(service.execute(makeSpec({ timeout: 100 }))).rejects.toThrow('timed out');

      vi.useFakeTimers(); // Restore for afterEach
    });
  });

  describe('generateTotpPreview', () => {
    it('generates a TOTP code for preview', async () => {
      const resolver = makeEnvResolver();
      const service = new HttpRequestService(resolver, tracker);

      const code = await service.generateTotpPreview('JBSWY3DPEHPK3PXP');
      expect(code).toMatch(/^\d{6}$/);
    });

    it('resolves {{VAR}} in secret before generating', async () => {
      const resolver = makeEnvResolver({ TOTP_SECRET: 'JBSWY3DPEHPK3PXP' });
      const service = new HttpRequestService(resolver, tracker);

      const code = await service.generateTotpPreview('{{TOTP_SECRET}}');
      expect(code).toMatch(/^\d{6}$/);
    });

    it('does NOT record cooldown (preview only)', async () => {
      const resolver = makeEnvResolver();
      const service = new HttpRequestService(resolver, tracker);

      await service.generateTotpPreview('JBSWY3DPEHPK3PXP');
      expect(tracker.checkCooldown('ws-test-1', 'src-1').inCooldown).toBe(false);
    });
  });
});

describe('encodeFormBody', () => {
  it('converts key:value newline format to URL-encoded', () => {
    const body = 'username:user@openheaders.io\npassword:s3cret!';
    const result = encodeFormBody(body);
    expect(result).toContain('username=user%40openheaders.io');
    expect(result).toContain('password=s3cret%21');
  });

  it('passes through already-encoded format', () => {
    const body = 'username=user&password=pass';
    expect(encodeFormBody(body)).toBe(body);
  });

  it('converts key=value with newline separators', () => {
    const body = 'username=user\npassword=pass';
    expect(encodeFormBody(body)).toBe('username=user&password=pass');
  });

  it('returns plain body when no recognized format', () => {
    expect(encodeFormBody('just text')).toBe('just text');
  });
});
