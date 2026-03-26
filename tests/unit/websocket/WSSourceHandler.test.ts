import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WSSourceHandler } from '../../../src/services/websocket/ws-source-handler';
import type { Source } from '../../../src/types/source';

function makeSource(overrides: Partial<Source> & { sourceId: string }): Source {
    return {
        sourceType: 'http',
        sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token',
        sourceName: 'Production API Gateway Token',
        sourceContent: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig',
        createdAt: '2025-11-15T09:30:00.000Z',
        updatedAt: '2026-01-20T14:45:12.345Z',
        ...overrides,
    };
}

function createMockService(sources: Source[] = []): ConstructorParameters<typeof WSSourceHandler>[0] {
    return {
        sources,
        ruleHandler: { broadcastRules: vi.fn() },
        _broadcastToAll: vi.fn().mockReturnValue(0)
    };
}

describe('WSSourceHandler', () => {
    let handler: WSSourceHandler;
    let mockService: ReturnType<typeof createMockService>;

    beforeEach(() => {
        mockService = createMockService();
        handler = new WSSourceHandler(mockService);
    });

    describe('_hasSourceContentChanged', () => {
        it('returns true when current sources is empty and new has items', () => {
            mockService.sources = [];
            expect(handler._hasSourceContentChanged([
                makeSource({ sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', sourceContent: 'Bearer token-abc' })
            ])).toBe(true);
        });

        it('returns true when lengths differ', () => {
            mockService.sources = [
                makeSource({ sourceId: 'src-1', sourceContent: 'token-1' })
            ];
            expect(handler._hasSourceContentChanged([
                makeSource({ sourceId: 'src-1', sourceContent: 'token-1' }),
                makeSource({ sourceId: 'src-2', sourceContent: 'token-2' })
            ])).toBe(true);
        });

        it('returns false when content is the same', () => {
            const sources = [
                makeSource({ sourceId: 'src-oauth-prod', sourceContent: 'eyJhbGciOiJSUzI1NiJ9.prod-token' }),
                makeSource({ sourceId: 'src-oauth-staging', sourceContent: 'eyJhbGciOiJSUzI1NiJ9.staging-token' })
            ];
            mockService.sources = [...sources];
            expect(handler._hasSourceContentChanged([...sources])).toBe(false);
        });

        it('returns true when content has changed', () => {
            mockService.sources = [
                makeSource({ sourceId: 'src-1', sourceContent: 'old-token' }),
                makeSource({ sourceId: 'src-2', sourceContent: 'unchanged' })
            ];
            expect(handler._hasSourceContentChanged([
                makeSource({ sourceId: 'src-1', sourceContent: 'old-token' }),
                makeSource({ sourceId: 'src-2', sourceContent: 'REFRESHED-TOKEN-eyJhbGciOiJSUzI1NiJ9' })
            ])).toBe(true);
        });

        it('returns true when a source has different sourceId', () => {
            mockService.sources = [
                makeSource({ sourceId: 'src-original', sourceContent: 'content' })
            ];
            expect(handler._hasSourceContentChanged([
                makeSource({ sourceId: 'src-replaced', sourceContent: 'content' })
            ])).toBe(true);
        });

        it('treats missing sourceContent as empty string', () => {
            mockService.sources = [
                makeSource({ sourceId: 'src-1', sourceContent: undefined })
            ];
            expect(handler._hasSourceContentChanged([
                makeSource({ sourceId: 'src-1', sourceContent: undefined })
            ])).toBe(false);
        });

        it('detects change from empty to non-empty content', () => {
            mockService.sources = [
                makeSource({ sourceId: 'src-1', sourceContent: '' })
            ];
            expect(handler._hasSourceContentChanged([
                makeSource({ sourceId: 'src-1', sourceContent: 'Bearer eyJhbGciOiJSUzI1NiJ9.newtoken' })
            ])).toBe(true);
        });

        it('treats null sourceContent same as empty string', () => {
            mockService.sources = [
                makeSource({ sourceId: 'src-1', sourceContent: null })
            ];
            expect(handler._hasSourceContentChanged([
                makeSource({ sourceId: 'src-1', sourceContent: '' })
            ])).toBe(false);
        });

        it('detects change from null to non-empty content', () => {
            mockService.sources = [
                makeSource({ sourceId: 'src-1', sourceContent: null })
            ];
            expect(handler._hasSourceContentChanged([
                makeSource({ sourceId: 'src-1', sourceContent: 'new-content' })
            ])).toBe(true);
        });

        it('handles many sources efficiently', () => {
            const sources = Array.from({ length: 50 }, (_, i) =>
                makeSource({ sourceId: `src-${i}`, sourceContent: `token-${i}` })
            );
            mockService.sources = [...sources];
            // Same content → no change
            expect(handler._hasSourceContentChanged([...sources])).toBe(false);

            // Change last source
            const modified = [...sources];
            modified[49] = makeSource({ sourceId: 'src-49', sourceContent: 'CHANGED' });
            expect(handler._hasSourceContentChanged(modified)).toBe(true);
        });
    });

    describe('updateSources', () => {
        it('broadcasts when source content changes', () => {
            mockService.sources = [
                makeSource({ sourceId: 'src-1', sourceContent: 'old' })
            ];
            handler.updateSources([
                makeSource({ sourceId: 'src-1', sourceContent: 'new' })
            ]);
            expect(mockService._broadcastToAll).toHaveBeenCalled();
        });

        it('skips broadcast when source content unchanged', () => {
            const sources = [makeSource({ sourceId: 'src-1', sourceContent: 'same' })];
            mockService.sources = [...sources];
            handler.updateSources([...sources]);
            expect(mockService._broadcastToAll).not.toHaveBeenCalled();
        });

        it('updates service sources reference', () => {
            const newSources = [
                makeSource({ sourceId: 'src-new', sourceContent: 'new-content' })
            ];
            handler.updateSources(newSources);
            expect(mockService.sources).toEqual(newSources);
        });

        it('also broadcasts rules when content changes', () => {
            mockService.sources = [];
            handler.updateSources([
                makeSource({ sourceId: 'src-1', sourceContent: 'content' })
            ]);
            expect(mockService.ruleHandler.broadcastRules).toHaveBeenCalled();
        });
    });

    describe('broadcastSources', () => {
        it('broadcasts sources to all clients with correct message format', () => {
            mockService.sources = [
                makeSource({ sourceId: 'src-prod', sourceContent: 'token-prod' }),
                makeSource({ sourceId: 'src-staging', sourceContent: 'token-staging' }),
            ];
            handler.broadcastSources();
            expect(mockService._broadcastToAll).toHaveBeenCalledTimes(1);

            const message = JSON.parse((mockService._broadcastToAll as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
            expect(message.type).toBe('sourcesUpdated');
            expect(message.sources).toHaveLength(2);
            expect(message.sources[0].sourceId).toBe('src-prod');
            expect(message.sources[1].sourceId).toBe('src-staging');
        });
    });

});
