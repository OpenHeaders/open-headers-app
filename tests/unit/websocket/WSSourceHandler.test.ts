import { describe, it, expect, beforeEach } from 'vitest';
import { WSSourceHandler } from '../../../src/services/websocket/ws-source-handler';
import type { Source } from '../../../src/types/source';

function createMockService(sources: Source[] = []) {
    return {
        rules: {},
        sources,
        appDataPath: null,
        sourceService: null,
        ruleHandler: { broadcastRules: () => {} },
        _broadcastToAll: () => 0
    };
}

describe('WSSourceHandler', () => {
    let handler: WSSourceHandler;
    let mockService: ReturnType<typeof createMockService>;

    beforeEach(() => {
        mockService = createMockService();
        handler = new WSSourceHandler(mockService as any);
    });

    // ------- _hasSourceContentChanged -------
    describe('_hasSourceContentChanged', () => {
        it('returns true for non-array input', () => {
            expect(handler._hasSourceContentChanged(null as any)).toBe(true);
            expect(handler._hasSourceContentChanged('bad' as any)).toBe(true);
            expect(handler._hasSourceContentChanged(undefined as any)).toBe(true);
        });

        it('returns true when current sources is empty and new has items', () => {
            mockService.sources = [];
            expect(handler._hasSourceContentChanged([
                { sourceId: '1', sourceContent: 'abc' }
            ])).toBe(true);
        });

        it('returns true when lengths differ', () => {
            mockService.sources = [
                { sourceId: '1', sourceContent: 'abc' }
            ];
            expect(handler._hasSourceContentChanged([
                { sourceId: '1', sourceContent: 'abc' },
                { sourceId: '2', sourceContent: 'def' }
            ])).toBe(true);
        });

        it('returns false when content is the same', () => {
            const sources = [
                { sourceId: '1', sourceContent: 'abc' },
                { sourceId: '2', sourceContent: 'def' }
            ];
            mockService.sources = [...sources];
            expect(handler._hasSourceContentChanged([...sources])).toBe(false);
        });

        it('returns true when content has changed', () => {
            mockService.sources = [
                { sourceId: '1', sourceContent: 'abc' },
                { sourceId: '2', sourceContent: 'def' }
            ];
            expect(handler._hasSourceContentChanged([
                { sourceId: '1', sourceContent: 'abc' },
                { sourceId: '2', sourceContent: 'CHANGED' }
            ])).toBe(true);
        });

        it('returns true when a source has no sourceId', () => {
            mockService.sources = [
                { sourceId: '1', sourceContent: 'abc' }
            ];
            expect(handler._hasSourceContentChanged([
                { sourceContent: 'abc' }
            ])).toBe(true);
        });

        it('returns true when new source added with different id', () => {
            mockService.sources = [
                { sourceId: '1', sourceContent: 'abc' }
            ];
            expect(handler._hasSourceContentChanged([
                { sourceId: '2', sourceContent: 'abc' }
            ])).toBe(true);
        });

        it('treats missing sourceContent as empty string', () => {
            mockService.sources = [
                { sourceId: '1' }
            ];
            expect(handler._hasSourceContentChanged([
                { sourceId: '1' }
            ])).toBe(false);
        });

        it('detects change from empty to non-empty content', () => {
            mockService.sources = [
                { sourceId: '1', sourceContent: '' }
            ];
            expect(handler._hasSourceContentChanged([
                { sourceId: '1', sourceContent: 'new content' }
            ])).toBe(true);
        });
    });
});
