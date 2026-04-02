import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AtomicFileWriter } from '@/utils/atomicFileWriter';

describe('AtomicFileWriter', () => {
  let writer: AtomicFileWriter;

  beforeEach(() => {
    writer = new AtomicFileWriter();
  });

  describe('constructor', () => {
    it('initializes writeQueues as empty Map', () => {
      expect(writer.writeQueues).toBeInstanceOf(Map);
      expect(writer.writeQueues.size).toBe(0);
    });

    it('initializes lockFiles as empty Map', () => {
      expect(writer.lockFiles).toBeInstanceOf(Map);
      expect(writer.lockFiles.size).toBe(0);
    });
  });

  describe('queueWrite()', () => {
    it('creates a queue for a new file path', async () => {
      const op = vi.fn().mockResolvedValue(undefined);
      await writer.queueWrite('/tmp/openheaders-queue-test.json', op);
      expect(op).toHaveBeenCalledOnce();
    });

    it('serializes writes to the same file', async () => {
      const order: number[] = [];
      const op1 = async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(1);
      };
      const op2 = async () => {
        order.push(2);
      };

      const p1 = writer.queueWrite('/tmp/openheaders-serial.json', op1);
      const p2 = writer.queueWrite('/tmp/openheaders-serial.json', op2);

      await Promise.all([p1, p2]);
      expect(order).toEqual([1, 2]);
    });

    it('allows parallel writes to different files', async () => {
      const order: string[] = [];
      const op1 = async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push('sources');
      };
      const op2 = async () => {
        order.push('rules');
      };

      const p1 = writer.queueWrite('/tmp/openheaders-sources.json', op1);
      const p2 = writer.queueWrite('/tmp/openheaders-rules.json', op2);

      await Promise.all([p1, p2]);
      expect(order).toEqual(['rules', 'sources']);
    });

    it('propagates errors from the write operation', async () => {
      const op = vi.fn().mockRejectedValue(new Error('ENOSPC: no space left on device'));
      await expect(writer.queueWrite('/tmp/openheaders-fail.json', op)).rejects.toThrow('ENOSPC');
    });

    it('cleans up queue after completion', async () => {
      const op = vi.fn().mockResolvedValue(undefined);
      await writer.queueWrite('/tmp/openheaders-cleanup.json', op);
      expect(writer.writeQueues.has('/tmp/openheaders-cleanup.json')).toBe(false);
    });

    it('serializes three sequential writes to same file', async () => {
      const order: number[] = [];
      const ops = [1, 2, 3].map((n) => async () => {
        await new Promise((r) => setTimeout(r, 5));
        order.push(n);
      });

      const promises = ops.map((op, _i) => writer.queueWrite('/tmp/openheaders-triple.json', op));

      await Promise.all(promises);
      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('writeFile() validation', () => {
    it('rejects Buffer content when validateJson is true', async () => {
      await expect(writer.writeFile('/tmp/test.json', Buffer.from('hello'), { validateJson: true })).rejects.toThrow(
        'Cannot validate JSON for Buffer content',
      );
    });

    it('rejects invalid JSON when validateJson is true', async () => {
      await expect(writer.writeFile('/tmp/test.json', '{invalid json}', { validateJson: true })).rejects.toThrow(
        'Invalid JSON content',
      );
    });

    it('rejects truncated JSON', async () => {
      await expect(
        writer.writeFile('/tmp/test.json', '{"sources": [{"id": "a1b2c3d4', { validateJson: true }),
      ).rejects.toThrow('Invalid JSON content');
    });

    it('accepts valid JSON when validateJson is true', async () => {
      const validJson = JSON.stringify({
        sources: [{ id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', name: 'Production API Gateway Token' }],
        rules: [],
      });
      try {
        await writer.writeFile('/tmp/test.json', validJson, { validateJson: true, maxRetries: 1 });
      } catch (e) {
        expect((e as Error).message).not.toContain('Invalid JSON');
      }
    });
  });

  describe('writeJson()', () => {
    it('serializes data as pretty JSON by default', async () => {
      const data = {
        sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        sourceName: 'Production API Gateway Token',
        headerValue: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig',
      };
      const writeSpy = vi.spyOn(writer, 'writeFile').mockResolvedValue(undefined);

      await writer.writeJson('/tmp/openheaders-source.json', data);

      expect(writeSpy).toHaveBeenCalledWith('/tmp/openheaders-source.json', JSON.stringify(data, null, 2), {
        validateJson: true,
      });
    });

    it('serializes compact JSON when pretty is false', async () => {
      const data = { id: 'a1b2c3d4', name: 'Test Rule' };
      const writeSpy = vi.spyOn(writer, 'writeFile').mockResolvedValue(undefined);

      await writer.writeJson('/tmp/test.json', data, { pretty: false });

      expect(writeSpy).toHaveBeenCalledWith('/tmp/test.json', JSON.stringify(data), { validateJson: true });
    });

    it('passes through maxRetries option', async () => {
      const data = { key: 'value' };
      const writeSpy = vi.spyOn(writer, 'writeFile').mockResolvedValue(undefined);

      await writer.writeJson('/tmp/test.json', data, { maxRetries: 5 });

      expect(writeSpy).toHaveBeenCalledWith('/tmp/test.json', JSON.stringify(data, null, 2), {
        maxRetries: 5,
        validateJson: true,
      });
    });
  });

  describe('readJson()', () => {
    it('returns null when file does not exist', async () => {
      vi.spyOn(writer, 'readFile').mockResolvedValue(null);
      const result = await writer.readJson('/tmp/nonexistent.json');
      expect(result).toBeNull();
    });

    it('parses valid JSON content', async () => {
      const data = {
        sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        sourceName: 'Production API Gateway Token',
        domains: ['*.openheaders.io', 'api.partner-service.io:8443'],
      };
      vi.spyOn(writer, 'readFile').mockResolvedValue(JSON.stringify(data));
      const result = await writer.readJson('/tmp/valid.json');
      expect(result).toEqual(data);
    });

    it('throws on invalid JSON content with file path in message', async () => {
      vi.spyOn(writer, 'readFile').mockResolvedValue('not valid json {corrupted}');
      await expect(writer.readJson('/tmp/openheaders-corrupted.json')).rejects.toThrow(
        'Invalid JSON in /tmp/openheaders-corrupted.json',
      );
    });

    it('parses deeply nested enterprise config', async () => {
      const config = {
        environments: {
          production: { variables: { API_URL: 'https://api.openheaders.io' } },
          staging: { variables: { API_URL: 'https://staging-api.openheaders.io' } },
        },
        sources: Array.from({ length: 20 }, (_, i) => ({
          id: `src-${i}`,
          name: `Source ${i}`,
        })),
      };
      vi.spyOn(writer, 'readFile').mockResolvedValue(JSON.stringify(config));
      const result = await writer.readJson('/tmp/enterprise-config.json');
      expect(result).toEqual(config);
    });
  });

  describe('lock management', () => {
    it('releaseLock is a no-op if lock was never acquired', async () => {
      await writer.releaseLock('/tmp/nonexistent.lock');
    });

    it('cleanup releases all tracked locks', async () => {
      writer.lockFiles.set('/tmp/openheaders-sources.json.lock', true);
      writer.lockFiles.set('/tmp/openheaders-rules.json.lock', true);

      const releaseSpy = vi.spyOn(writer, 'releaseLock').mockResolvedValue(undefined);
      await writer.cleanup();

      expect(releaseSpy).toHaveBeenCalledTimes(2);
      expect(releaseSpy).toHaveBeenCalledWith('/tmp/openheaders-sources.json.lock');
      expect(releaseSpy).toHaveBeenCalledWith('/tmp/openheaders-rules.json.lock');
    });

    it('cleanup handles empty lock set', async () => {
      await expect(writer.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('singleton export', () => {
    it('default export is an AtomicFileWriter instance', async () => {
      const mod = await import('../../../src/utils/atomicFileWriter');
      expect(mod.default).toBeInstanceOf(AtomicFileWriter);
    });

    it('default export has all required methods', async () => {
      const mod = await import('../../../src/utils/atomicFileWriter');
      expect(typeof mod.default.writeFile).toBe('function');
      expect(typeof mod.default.readFile).toBe('function');
      expect(typeof mod.default.writeJson).toBe('function');
      expect(typeof mod.default.readJson).toBe('function');
      expect(typeof mod.default.cleanup).toBe('function');
      expect(typeof mod.default.queueWrite).toBe('function');
    });
  });
});
