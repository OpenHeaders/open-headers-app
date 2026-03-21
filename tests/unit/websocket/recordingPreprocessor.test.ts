import { describe, it, expect } from 'vitest';
import { preprocessRecordingForSave } from '../../../src/services/websocket/utils/recordingPreprocessor';
import type { PreprocessorData } from '../../../src/services/websocket/utils/recordingPreprocessor';
import type { DomNode, RRWebEvent, RRWebInnerData, RecordingMetadata } from '../../../src/types/recording';

/** Get the DomNode from a preprocessor result event */
function getNode(result: PreprocessorData, eventIndex: number): DomNode {
    const event = result.record.events[eventIndex] as unknown as { data: { node: DomNode } };
    return event.data.node;
}

// ---------- helpers ----------

/** Create a minimal valid recording */
function makeRecording(events: RRWebEvent[] = [], metadata: Partial<RecordingMetadata> = {}): PreprocessorData {
    return {
        record: {
            events,
            metadata: { url: 'https://example.com', ...metadata }
        }
    } as PreprocessorData;
}

/** Create a full-snapshot event (rrweb type 2) */
function makeFullSnapshot(node: DomNode, timestamp = 1000): RRWebEvent {
    return { type: 2, timestamp, data: { node } };
}

/** Create a wrapped rrweb full-snapshot event */
function makeWrappedFullSnapshot(node: DomNode, timestamp = 1000) {
    return { type: 'rrweb', timestamp, data: { type: 2, data: { node } } };
}

/** Create an incremental snapshot (rrweb type 3) */
function makeIncrementalSnapshot(data: RRWebInnerData, timestamp = 2000): RRWebEvent {
    return { type: 3, timestamp, data };
}

// ---------- tests ----------

describe('recordingPreprocessor', () => {
    describe('preprocessRecordingForSave', () => {
        it('returns recording with empty events', async () => {
            const input = makeRecording([]);
            const result = await preprocessRecordingForSave(input);
            expect(result.record._preprocessed).toBe(true);
            expect(result.record.events).toEqual([]);
            expect(result.record._pageTransitions).toEqual([]);
            expect(result.record._fontUrls).toEqual([]);
        });

        it('preserves non-snapshot events', async () => {
            const events: RRWebEvent[] = [
                { type: 4, timestamp: 100, data: { tag: 'meta' } } as RRWebEvent,
                { type: 5, timestamp: 200, data: {} } as RRWebEvent
            ];
            const input = makeRecording(events);
            const result = await preprocessRecordingForSave(input);
            expect(result.record.events).toHaveLength(2);
            expect(result.record.events[0].type).toBe(4);
            expect(result.record.events[1].type).toBe(5);
        });

        // --- iframe sandbox fixing ---
        it('adds allow-scripts and allow-same-origin to iframe sandbox', async () => {
            const node = {
                tagName: 'html',
                childNodes: [{
                    tagName: 'body',
                    childNodes: [{
                        tagName: 'iframe',
                        attributes: { sandbox: 'allow-forms', src: 'https://x.com' }
                    }]
                }]
            };
            const input = makeRecording([makeFullSnapshot(node)]);
            const result = await preprocessRecordingForSave(input);

            const iframe = getNode(result, 0).childNodes![0].childNodes![0];
            const sandboxParts = iframe.attributes!.sandbox.split(' ');
            expect(sandboxParts).toContain('allow-forms');
            expect(sandboxParts).toContain('allow-scripts');
            expect(sandboxParts).toContain('allow-same-origin');
        });

        it('adds default sandbox to iframe without sandbox attribute but with src', async () => {
            const node = {
                tagName: 'html',
                childNodes: [{
                    tagName: 'body',
                    childNodes: [{
                        tagName: 'iframe',
                        attributes: { src: 'https://x.com' }
                    }]
                }]
            };
            const input = makeRecording([makeFullSnapshot(node)]);
            const result = await preprocessRecordingForSave(input);

            const iframe = getNode(result, 0).childNodes[0].childNodes[0];
            expect(iframe.attributes.sandbox).toBe('allow-scripts allow-same-origin allow-forms allow-popups');
        });

        // --- font-display: swap injection ---
        it('injects font-display: swap into @font-face rules', async () => {
            const node = {
                tagName: 'html',
                childNodes: [{
                    tagName: 'head',
                    childNodes: [{
                        tagName: 'style',
                        textContent: '@font-face { font-family: "Test"; src: url("https://fonts.example.com/test.woff2"); }'
                    }]
                }]
            };
            const input = makeRecording([makeFullSnapshot(node)]);
            const result = await preprocessRecordingForSave(input);

            const style = getNode(result, 0).childNodes[0].childNodes[0];
            expect(style.textContent).toContain('font-display: swap');
        });

        it('does not duplicate font-display if already present', async () => {
            const node = {
                tagName: 'html',
                childNodes: [{
                    tagName: 'head',
                    childNodes: [{
                        tagName: 'style',
                        textContent: '@font-face { font-family: "Test"; font-display: swap; src: url("https://fonts.example.com/test.woff2"); }'
                    }]
                }]
            };
            const input = makeRecording([makeFullSnapshot(node)]);
            const result = await preprocessRecordingForSave(input);

            const style = getNode(result, 0).childNodes[0].childNodes[0];
            const count = (style.textContent.match(/font-display/g) || []).length;
            expect(count).toBe(1);
        });

        // --- static resource collection ---
        it('collects stylesheet URLs from link tags', async () => {
            const node = {
                tagName: 'html',
                childNodes: [{
                    tagName: 'head',
                    childNodes: [{
                        tagName: 'link',
                        attributes: { rel: 'stylesheet', href: 'https://cdn.example.com/style.css' }
                    }]
                }]
            };
            const input = makeRecording([makeFullSnapshot(node)]);
            const result = await preprocessRecordingForSave(input);
            expect(result.record._staticResources!.stylesheets).toContain('https://cdn.example.com/style.css');
        });

        it('collects script URLs from script tags', async () => {
            const node = {
                tagName: 'html',
                childNodes: [{
                    tagName: 'head',
                    childNodes: [{
                        tagName: 'script',
                        attributes: { src: 'https://cdn.example.com/app.js' }
                    }]
                }]
            };
            const input = makeRecording([makeFullSnapshot(node)]);
            const result = await preprocessRecordingForSave(input);
            expect(result.record._staticResources!.scripts).toContain('https://cdn.example.com/app.js');
        });

        it('collects image URLs from img tags', async () => {
            const node = {
                tagName: 'html',
                childNodes: [{
                    tagName: 'body',
                    childNodes: [{
                        tagName: 'img',
                        attributes: { src: 'https://cdn.example.com/logo.png' }
                    }]
                }]
            };
            const input = makeRecording([makeFullSnapshot(node)]);
            const result = await preprocessRecordingForSave(input);
            expect(result.record._staticResources!.images).toContain('https://cdn.example.com/logo.png');
        });

        it('collects font URLs from CSS', async () => {
            const node = {
                tagName: 'html',
                childNodes: [{
                    tagName: 'head',
                    childNodes: [{
                        tagName: 'style',
                        textContent: '@font-face { src: url("https://fonts.example.com/font.woff2"); }'
                    }]
                }]
            };
            const input = makeRecording([makeFullSnapshot(node)]);
            const result = await preprocessRecordingForSave(input);
            expect(result.record._fontUrls).toContain('https://fonts.example.com/font.woff2');
            expect(result.record._staticResources!.fonts).toContain('https://fonts.example.com/font.woff2');
        });

        // --- data: URLs should be skipped ---
        it('skips data: URLs for link tags', async () => {
            const node = {
                tagName: 'html',
                childNodes: [{
                    tagName: 'head',
                    childNodes: [{
                        tagName: 'link',
                        attributes: { rel: 'stylesheet', href: 'data:text/css,body{}' }
                    }]
                }]
            };
            const input = makeRecording([makeFullSnapshot(node)]);
            const result = await preprocessRecordingForSave(input);
            expect(result.record._staticResources!.stylesheets).toHaveLength(0);
        });

        // --- page transitions ---
        it('tracks page transitions from full snapshots', async () => {
            const node1 = { tagName: 'html', childNodes: [] };
            const node2 = { tagName: 'html', childNodes: [] };

            const events = [
                makeFullSnapshot(node1, 1000),
                { type: 3, timestamp: 1500, data: { source: 2 } }, // mouse movement
                makeFullSnapshot(node2, 2000)
            ];

            const input = makeRecording(events);
            const result = await preprocessRecordingForSave(input);
            expect(result.record._pageTransitions).toHaveLength(2);
            expect(result.record._pageTransitions![0].pageIndex).toBe(0);
            expect(result.record._pageTransitions![1].pageIndex).toBe(1);
        });

        // --- wrapped rrweb events ---
        it('handles wrapped rrweb full snapshot events', async () => {
            const node = {
                tagName: 'html',
                childNodes: [{
                    tagName: 'head',
                    childNodes: [{
                        tagName: 'link',
                        attributes: { rel: 'stylesheet', href: 'https://cdn.example.com/wrapped.css' }
                    }]
                }]
            };
            const input = makeRecording([makeWrappedFullSnapshot(node)]);
            const result = await preprocessRecordingForSave(input);
            expect(result.record._staticResources!.stylesheets).toContain('https://cdn.example.com/wrapped.css');
        });

        // --- incremental snapshot with mutation adds ---
        it('fixes iframe sandbox in incremental snapshot adds', async () => {
            const snapshotNode = { tagName: 'html', childNodes: [] };
            const events = [
                makeFullSnapshot(snapshotNode, 1000),
                makeIncrementalSnapshot({
                    source: 0,
                    adds: [{
                        node: {
                            tagName: 'iframe',
                            attributes: { sandbox: '', src: 'https://x.com' }
                        }
                    }]
                }, 2000)
            ];

            const input = makeRecording(events);
            const result = await preprocessRecordingForSave(input);
            const addedNode = result.record.events[1].data.adds[0].node;
            expect(addedNode.attributes.sandbox).toContain('allow-scripts');
            expect(addedNode.attributes.sandbox).toContain('allow-same-origin');
        });

        // --- mouse events are always kept ---
        it('preserves mouse movement events', async () => {
            const snapshotNode = { tagName: 'html', childNodes: [] };
            const events = [
                makeFullSnapshot(snapshotNode, 1000),
                makeIncrementalSnapshot({ source: 2 }, 1500), // mouse movement
                makeIncrementalSnapshot({ source: 1 }, 1600), // mouse interaction
                makeIncrementalSnapshot({ source: 6, positions: [] }, 1700) // mouse position
            ];

            const input = makeRecording(events);
            const result = await preprocessRecordingForSave(input);
            // All 4 events should be preserved (1 snapshot + 3 mouse)
            expect(result.record.events).toHaveLength(4);
        });

        // --- drops events close to page transitions ---
        it('drops non-mouse events within 100ms of page transition', async () => {
            const snapshotNode = { tagName: 'html', childNodes: [] };
            const events = [
                makeFullSnapshot(snapshotNode, 1000),
                makeIncrementalSnapshot({ source: 5 }, 1950), // 50ms before next page, should be dropped
                makeFullSnapshot(snapshotNode, 2000)
            ];

            const input = makeRecording(events);
            const result = await preprocessRecordingForSave(input);
            // Should have 2 events (both snapshots), the incremental one should be dropped
            expect(result.record.events).toHaveLength(2);
            expect(result.record.events[0].type).toBe(2);
            expect(result.record.events[1].type).toBe(2);
        });

        // --- progress callback ---
        it('calls onProgress callback during processing', async () => {
            const progressCalls: Array<{ stage: string; progress: number }> = [];
            const onProgress = (stage: string, progress: number) => {
                progressCalls.push({ stage, progress });
            };

            const events: RRWebEvent[] = [];
            for (let i = 0; i < 25; i++) {
                events.push({ type: 4, timestamp: i * 100, data: {} });
            }
            const input = makeRecording(events);
            await preprocessRecordingForSave(input, { onProgress });

            expect(progressCalls.length).toBeGreaterThan(0);
            expect(progressCalls[0].stage).toBe('preprocessing');
            const lastCall = progressCalls[progressCalls.length - 1];
            expect(lastCall.progress).toBe(100);
        });

        // --- base URL resolution ---
        it('resolves relative URLs from base tag', async () => {
            const node = {
                tagName: 'html',
                childNodes: [
                    {
                        tagName: 'head',
                        childNodes: [
                            { tagName: 'base', attributes: { href: 'https://example.com/app/' } },
                            { tagName: 'script', attributes: { src: 'main.js' } }
                        ]
                    }
                ]
            };
            const input = makeRecording([makeFullSnapshot(node)]);
            const result = await preprocessRecordingForSave(input);
            expect(result.record._staticResources!.scripts).toContain('https://example.com/app/main.js');
        });

        // --- preload to prefetch for fonts ---
        it('changes preload to prefetch for font links', async () => {
            const node = {
                tagName: 'html',
                childNodes: [{
                    tagName: 'head',
                    childNodes: [{
                        tagName: 'link',
                        attributes: {
                            rel: 'preload',
                            href: 'https://fonts.example.com/font.woff2',
                            type: ''
                        }
                    }]
                }]
            };
            const input = makeRecording([makeFullSnapshot(node)]);
            const result = await preprocessRecordingForSave(input);
            const link = getNode(result, 0).childNodes[0].childNodes[0];
            expect(link.attributes.rel).toBe('prefetch');
        });

        // --- URL deduplication ---
        it('normalizes duplicate resource URLs to shortest path', async () => {
            const node = {
                tagName: 'html',
                childNodes: [{
                    tagName: 'head',
                    childNodes: [
                        { tagName: 'script', attributes: { src: 'https://cdn.example.com/assets/v1/app.js' } },
                        { tagName: 'script', attributes: { src: 'https://cdn.example.com/app.js' } }
                    ]
                }]
            };
            const input = makeRecording([makeFullSnapshot(node)]);
            const result = await preprocessRecordingForSave(input);
            // Both should be normalized to the shorter path
            const scripts = result.record._staticResources!.scripts;
            expect(scripts).toContain('https://cdn.example.com/app.js');
        });

        // --- _cssText in link tags ---
        it('extracts font URLs from link tag _cssText attribute', async () => {
            const node = {
                tagName: 'html',
                childNodes: [{
                    tagName: 'head',
                    childNodes: [{
                        tagName: 'link',
                        attributes: {
                            rel: 'stylesheet',
                            href: 'https://cdn.example.com/style.css',
                            _cssText: '@font-face { src: url("https://cdn.example.com/font.woff2"); }'
                        }
                    }]
                }]
            };
            const input = makeRecording([makeFullSnapshot(node)]);
            const result = await preprocessRecordingForSave(input);
            expect(result.record._fontUrls).toContain('https://cdn.example.com/font.woff2');
        });
    });
});
