import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AtomicFileWriter } from '../../src/utils/atomicFileWriter';

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
            await writer.queueWrite('/tmp/test-queue.json', op);
            expect(op).toHaveBeenCalledOnce();
        });

        it('serializes writes to the same file', async () => {
            const order: number[] = [];
            const op1 = async () => {
                await new Promise(r => setTimeout(r, 10));
                order.push(1);
            };
            const op2 = async () => {
                order.push(2);
            };

            const p1 = writer.queueWrite('/tmp/serial.json', op1);
            const p2 = writer.queueWrite('/tmp/serial.json', op2);

            await Promise.all([p1, p2]);
            expect(order).toEqual([1, 2]);
        });

        it('allows parallel writes to different files', async () => {
            const order: string[] = [];
            const op1 = async () => {
                await new Promise(r => setTimeout(r, 10));
                order.push('a');
            };
            const op2 = async () => {
                order.push('b');
            };

            const p1 = writer.queueWrite('/tmp/file-a.json', op1);
            const p2 = writer.queueWrite('/tmp/file-b.json', op2);

            await Promise.all([p1, p2]);
            // b should finish before a since it has no delay
            expect(order).toEqual(['b', 'a']);
        });

        it('propagates errors from the write operation', async () => {
            const op = vi.fn().mockRejectedValue(new Error('disk full'));
            await expect(writer.queueWrite('/tmp/fail.json', op)).rejects.toThrow('disk full');
        });

        it('cleans up queue after completion', async () => {
            const op = vi.fn().mockResolvedValue(undefined);
            await writer.queueWrite('/tmp/cleanup.json', op);
            // Queue should be cleaned up after the last operation
            expect(writer.writeQueues.has('/tmp/cleanup.json')).toBe(false);
        });
    });

    describe('writeFile() validation', () => {
        it('rejects Buffer content when validateJson is true', async () => {
            await expect(
                writer.writeFile('/tmp/test.json', Buffer.from('hello'), { validateJson: true })
            ).rejects.toThrow('Cannot validate JSON for Buffer content');
        });

        it('rejects invalid JSON when validateJson is true', async () => {
            await expect(
                writer.writeFile('/tmp/test.json', '{invalid json}', { validateJson: true })
            ).rejects.toThrow('Invalid JSON content');
        });

        it('accepts valid JSON when validateJson is true', async () => {
            // This will go through to performAtomicWrite which will interact with fs
            // We just want to verify JSON validation passes
            const validJson = '{"key": "value"}';
            // The write itself may fail (no actual disk ops in test), but JSON validation passes
            try {
                await writer.writeFile('/tmp/test.json', validJson, { validateJson: true, maxRetries: 1 });
            } catch (e) {
                // Expected - fs operations will fail in test environment
                // But the error should NOT be about JSON validation
                expect((e as Error).message).not.toContain('Invalid JSON');
            }
        });
    });

    describe('writeJson()', () => {
        it('serializes data as pretty JSON by default', async () => {
            const data = { key: 'value', nested: { a: 1 } };
            // Mock writeFile to capture content
            const writeSpy = vi.spyOn(writer, 'writeFile').mockResolvedValue(undefined);

            await writer.writeJson('/tmp/test.json', data);

            expect(writeSpy).toHaveBeenCalledWith(
                '/tmp/test.json',
                JSON.stringify(data, null, 2),
                { validateJson: true }
            );
        });

        it('serializes compact JSON when pretty is false', async () => {
            const data = { key: 'value' };
            const writeSpy = vi.spyOn(writer, 'writeFile').mockResolvedValue(undefined);

            await writer.writeJson('/tmp/test.json', data, { pretty: false });

            expect(writeSpy).toHaveBeenCalledWith(
                '/tmp/test.json',
                JSON.stringify(data),
                { validateJson: true }
            );
        });
    });

    describe('readJson()', () => {
        it('returns null when file does not exist', async () => {
            vi.spyOn(writer, 'readFile').mockResolvedValue(null);
            const result = await writer.readJson('/tmp/nonexistent.json');
            expect(result).toBeNull();
        });

        it('parses valid JSON content', async () => {
            const data = { key: 'value', count: 42 };
            vi.spyOn(writer, 'readFile').mockResolvedValue(JSON.stringify(data));
            const result = await writer.readJson('/tmp/valid.json');
            expect(result).toEqual(data);
        });

        it('throws on invalid JSON content', async () => {
            vi.spyOn(writer, 'readFile').mockResolvedValue('not valid json');
            await expect(writer.readJson('/tmp/invalid.json')).rejects.toThrow('Invalid JSON in /tmp/invalid.json');
        });
    });

    describe('lock management', () => {
        it('releaseLock is a no-op if lock was never acquired', async () => {
            // Should not throw
            await writer.releaseLock('/tmp/nonexistent.lock');
        });

        it('cleanup releases all tracked locks', async () => {
            // Manually add some lock entries
            writer.lockFiles.set('/tmp/a.lock', true);
            writer.lockFiles.set('/tmp/b.lock', true);

            const releaseSpy = vi.spyOn(writer, 'releaseLock').mockResolvedValue(undefined);
            await writer.cleanup();

            expect(releaseSpy).toHaveBeenCalledTimes(2);
            expect(releaseSpy).toHaveBeenCalledWith('/tmp/a.lock');
            expect(releaseSpy).toHaveBeenCalledWith('/tmp/b.lock');
        });
    });

    describe('singleton export', () => {
        it('default export is an AtomicFileWriter instance', async () => {
            const mod = await import('../../src/utils/atomicFileWriter');
            expect(mod.default).toBeInstanceOf(AtomicFileWriter);
        });

        it('default export has writeFile method', async () => {
            const mod = await import('../../src/utils/atomicFileWriter');
            expect(typeof mod.default.writeFile).toBe('function');
        });

        it('default export has readFile method', async () => {
            const mod = await import('../../src/utils/atomicFileWriter');
            expect(typeof mod.default.readFile).toBe('function');
        });

        it('default export has writeJson method', async () => {
            const mod = await import('../../src/utils/atomicFileWriter');
            expect(typeof mod.default.writeJson).toBe('function');
        });

        it('default export has readJson method', async () => {
            const mod = await import('../../src/utils/atomicFileWriter');
            expect(typeof mod.default.readJson).toBe('function');
        });

        it('default export has cleanup method', async () => {
            const mod = await import('../../src/utils/atomicFileWriter');
            expect(typeof mod.default.cleanup).toBe('function');
        });
    });
});
