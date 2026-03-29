import { describe, expect, it } from 'vitest';
import type { PreprocessorData } from '../../../src/services/websocket/utils/recordingPreprocessor';
import { preprocessRecordingForSave } from '../../../src/services/websocket/utils/recordingPreprocessor';
import type { DomNode, RecordingMetadata, RRWebEvent, RRWebInnerData } from '../../../src/types/recording';

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
      metadata: {
        url: 'https://app.openheaders.io/dashboard',
        startTime: 1709123456789,
        timestamp: 1709123456789,
        ...metadata,
      },
    },
  } as PreprocessorData;
}

/** Create a full-snapshot event (rrweb type 2) */
function makeFullSnapshot(node: DomNode, timestamp = 1000): RRWebEvent {
  return { type: 2, timestamp, data: { node } };
}

/** Create a wrapped rrweb full-snapshot event */
function makeWrappedFullSnapshot(node: DomNode, timestamp = 1000): RRWebEvent {
  return { type: 'rrweb' as unknown as number, timestamp, data: { type: 2, data: { node } } } as unknown as RRWebEvent;
}

/** Create an incremental snapshot (rrweb type 3) */
function makeIncrementalSnapshot(data: RRWebInnerData, timestamp = 2000): RRWebEvent {
  return { type: 3, timestamp, data };
}

// ---------- tests ----------

describe('recordingPreprocessor', () => {
  describe('preprocessRecordingForSave', () => {
    it('returns recording with empty events and all metadata fields', async () => {
      const input = makeRecording([]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._preprocessed).toBe(true);
      expect(result.record.events).toEqual([]);
      expect(result.record._pageTransitions).toEqual([]);
      expect(result.record._fontUrls).toEqual([]);
      expect(result.record._staticResources).toBeDefined();
      expect(result.record._staticResources!.scripts).toEqual([]);
      expect(result.record._staticResources!.stylesheets).toEqual([]);
      expect(result.record._staticResources!.images).toEqual([]);
      expect(result.record._staticResources!.fonts).toEqual([]);
      expect(result.record._staticResources!.other).toEqual([]);
    });

    it('preserves non-snapshot events', async () => {
      const events: RRWebEvent[] = [
        { type: 4, timestamp: 100, data: { tag: 'meta' } } as RRWebEvent,
        { type: 5, timestamp: 200, data: {} } as RRWebEvent,
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
        childNodes: [
          {
            tagName: 'body',
            childNodes: [
              {
                tagName: 'iframe',
                attributes: { sandbox: 'allow-forms', src: 'https://embed.openheaders.io/widget' },
              },
            ],
          },
        ],
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
        childNodes: [
          {
            tagName: 'body',
            childNodes: [
              {
                tagName: 'iframe',
                attributes: { src: 'https://embed.openheaders.io/analytics' },
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);

      const iframe = getNode(result, 0).childNodes![0].childNodes![0];
      expect(iframe.attributes!.sandbox).toBe('allow-scripts allow-same-origin allow-forms allow-popups');
    });

    it('preserves existing sandbox attributes while adding missing ones', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'body',
            childNodes: [
              {
                tagName: 'iframe',
                attributes: {
                  sandbox: 'allow-scripts allow-popups allow-modals',
                  src: 'https://embed.openheaders.io',
                },
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);

      const iframe = getNode(result, 0).childNodes![0].childNodes![0];
      const parts = iframe.attributes!.sandbox.split(' ');
      expect(parts).toContain('allow-scripts');
      expect(parts).toContain('allow-same-origin');
      expect(parts).toContain('allow-popups');
      expect(parts).toContain('allow-modals');
    });

    // --- font-display: swap injection ---
    it('injects font-display: swap into @font-face rules', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'style',
                textContent:
                  '@font-face { font-family: "Inter"; src: url("https://fonts.openheaders.io/inter-v13.woff2"); }',
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);

      const style = getNode(result, 0).childNodes![0].childNodes![0];
      expect(style.textContent).toContain('font-display: swap');
    });

    it('does not duplicate font-display if already present', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'style',
                textContent:
                  '@font-face { font-family: "Inter"; font-display: swap; src: url("https://fonts.openheaders.io/inter.woff2"); }',
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);

      const style = getNode(result, 0).childNodes![0].childNodes![0];
      const count = (style.textContent!.match(/font-display/g) || []).length;
      expect(count).toBe(1);
    });

    // --- static resource collection ---
    it('collects stylesheet URLs from link tags', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'link',
                attributes: { rel: 'stylesheet', href: 'https://cdn.openheaders.io/assets/styles/main.css' },
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._staticResources!.stylesheets).toContain(
        'https://cdn.openheaders.io/assets/styles/main.css',
      );
    });

    it('collects script URLs from script tags', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'script',
                attributes: { src: 'https://cdn.openheaders.io/assets/js/app.bundle.js' },
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._staticResources!.scripts).toContain('https://cdn.openheaders.io/assets/js/app.bundle.js');
    });

    it('collects image URLs from img tags', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'body',
            childNodes: [
              {
                tagName: 'img',
                attributes: { src: 'https://cdn.openheaders.io/assets/images/logo-enterprise.png' },
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._staticResources!.images).toContain(
        'https://cdn.openheaders.io/assets/images/logo-enterprise.png',
      );
    });

    it('collects font URLs from CSS @font-face rules', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'style',
                textContent:
                  '@font-face { font-family: "Inter"; src: url("https://fonts.openheaders.io/inter-v13-latin.woff2") format("woff2"); }',
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._fontUrls).toContain('https://fonts.openheaders.io/inter-v13-latin.woff2');
      expect(result.record._staticResources!.fonts).toContain('https://fonts.openheaders.io/inter-v13-latin.woff2');
    });

    it('collects multiple font formats from single @font-face', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'style',
                textContent: `@font-face { font-family: "Inter"; src: url("https://fonts.openheaders.io/inter.woff2") format("woff2"), url("https://fonts.openheaders.io/inter.woff") format("woff"); }`,
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._fontUrls).toContain('https://fonts.openheaders.io/inter.woff2');
      expect(result.record._fontUrls).toContain('https://fonts.openheaders.io/inter.woff');
    });

    // --- data: URLs should be skipped ---
    it('skips data: URLs for link tags', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'link',
                attributes: { rel: 'stylesheet', href: 'data:text/css,body{margin:0}' },
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._staticResources!.stylesheets).toHaveLength(0);
    });

    it('skips data: URLs for script tags', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'script',
                attributes: { src: 'data:text/javascript,console.log("hi")' },
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._staticResources!.scripts).toHaveLength(0);
    });

    it('skips data: URLs for img tags', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'body',
            childNodes: [
              {
                tagName: 'img',
                attributes: { src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' },
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._staticResources!.images).toHaveLength(0);
    });

    // --- page transitions ---
    it('tracks page transitions from full snapshots', async () => {
      const node1 = { tagName: 'html', childNodes: [] };
      const node2 = { tagName: 'html', childNodes: [] };

      const events = [
        makeFullSnapshot(node1, 1000),
        { type: 3, timestamp: 1500, data: { source: 2 } }, // mouse movement
        makeFullSnapshot(node2, 2000),
      ];

      const input = makeRecording(events);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._pageTransitions).toHaveLength(2);
      expect(result.record._pageTransitions![0]).toEqual({
        index: 0,
        timestamp: 1000,
        pageIndex: 0,
      });
      expect(result.record._pageTransitions![1]).toEqual({
        index: 2,
        timestamp: 2000,
        pageIndex: 1,
      });
    });

    // --- wrapped rrweb events ---
    it('handles wrapped rrweb full snapshot events', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'link',
                attributes: { rel: 'stylesheet', href: 'https://cdn.openheaders.io/wrapped-style.css' },
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeWrappedFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._staticResources!.stylesheets).toContain('https://cdn.openheaders.io/wrapped-style.css');
    });

    it('tracks page transitions from wrapped rrweb snapshots', async () => {
      const node = { tagName: 'html', childNodes: [] };
      const input = makeRecording([makeWrappedFullSnapshot(node, 5000)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._pageTransitions).toHaveLength(1);
      expect(result.record._pageTransitions![0].timestamp).toBe(5000);
    });

    // --- incremental snapshot with mutation adds ---
    it('fixes iframe sandbox in incremental snapshot adds', async () => {
      const snapshotNode = { tagName: 'html', childNodes: [] };
      const events = [
        makeFullSnapshot(snapshotNode, 1000),
        makeIncrementalSnapshot(
          {
            source: 0,
            adds: [
              {
                node: {
                  tagName: 'iframe',
                  attributes: { sandbox: '', src: 'https://embed.openheaders.io/dynamic-widget' },
                },
              },
            ],
          },
          2000,
        ),
      ];

      const input = makeRecording(events);
      const result = await preprocessRecordingForSave(input);
      const addedNode = (result.record.events[1] as unknown as { data: { adds: Array<{ node: DomNode }> } }).data
        .adds[0].node;
      expect(addedNode.attributes!.sandbox).toContain('allow-scripts');
      expect(addedNode.attributes!.sandbox).toContain('allow-same-origin');
    });

    it('normalizes script URLs in incremental snapshot adds', async () => {
      const snapshotNode = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [{ tagName: 'script', attributes: { src: 'https://cdn.openheaders.io/app.js' } }],
          },
        ],
      };
      const events = [
        makeFullSnapshot(snapshotNode, 1000),
        makeIncrementalSnapshot(
          {
            source: 0,
            adds: [
              {
                node: {
                  tagName: 'script',
                  attributes: { src: 'https://cdn.openheaders.io/deep/path/app.js' },
                },
              },
            ],
          },
          2000,
        ),
      ];

      const input = makeRecording(events);
      const result = await preprocessRecordingForSave(input);
      // The script should be normalized to the shorter path
      const addedNode = (result.record.events[1] as unknown as { data: { adds: Array<{ node: DomNode }> } }).data
        .adds[0].node;
      expect(addedNode.attributes!.src).toBe('https://cdn.openheaders.io/app.js');
    });

    // --- mouse events are always kept ---
    it('preserves all mouse event types', async () => {
      const snapshotNode = { tagName: 'html', childNodes: [] };
      const events = [
        makeFullSnapshot(snapshotNode, 1000),
        makeIncrementalSnapshot({ source: 2 }, 1500), // mouse movement
        makeIncrementalSnapshot({ source: 1 }, 1600), // mouse interaction
        makeIncrementalSnapshot({ source: 6, positions: [] }, 1700), // mouse position
      ];

      const input = makeRecording(events);
      const result = await preprocessRecordingForSave(input);
      expect(result.record.events).toHaveLength(4);
    });

    // --- drops events close to page transitions ---
    it('drops non-mouse events within 100ms of page transition', async () => {
      const snapshotNode = { tagName: 'html', childNodes: [] };
      const events = [
        makeFullSnapshot(snapshotNode, 1000),
        makeIncrementalSnapshot({ source: 5 }, 1950), // 50ms before next page, should be dropped
        makeFullSnapshot(snapshotNode, 2000),
      ];

      const input = makeRecording(events);
      const result = await preprocessRecordingForSave(input);
      expect(result.record.events).toHaveLength(2);
      expect(result.record.events[0].type).toBe(2);
      expect(result.record.events[1].type).toBe(2);
    });

    it('keeps non-mouse events far from page transitions', async () => {
      const snapshotNode = { tagName: 'html', childNodes: [] };
      const events = [
        makeFullSnapshot(snapshotNode, 1000),
        makeIncrementalSnapshot({ source: 5 }, 1500), // 500ms before next page, should be kept
        makeFullSnapshot(snapshotNode, 2000),
      ];

      const input = makeRecording(events);
      const result = await preprocessRecordingForSave(input);
      expect(result.record.events).toHaveLength(3);
    });

    // --- progress callback ---
    it('calls onProgress callback with preprocessing stages', async () => {
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
      expect(lastCall.stage).toBe('preprocessing');
      expect(lastCall.progress).toBe(100);
    });

    it('reports progress for both first and second pass', async () => {
      const stages = new Set<string>();
      const onProgress = (stage: string) => {
        stages.add(stage);
      };

      // Need enough events to trigger progress reports (every 20 events)
      const events: RRWebEvent[] = [];
      for (let i = 0; i < 50; i++) {
        events.push({ type: 4, timestamp: i * 100, data: {} });
      }
      const input = makeRecording(events);
      await preprocessRecordingForSave(input, { onProgress });

      expect(stages.has('preprocessing')).toBe(true);
    });

    // --- base URL resolution ---
    it('resolves relative URLs from base tag', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              { tagName: 'base', attributes: { href: 'https://app.openheaders.io/dashboard/' } },
              { tagName: 'script', attributes: { src: 'main.bundle.js' } },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node as unknown as DomNode)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._staticResources!.scripts).toContain('https://app.openheaders.io/dashboard/main.bundle.js');
    });

    it('resolves relative CSS href from base tag', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              { tagName: 'base', attributes: { href: 'https://cdn.openheaders.io/v2/' } },
              { tagName: 'link', attributes: { rel: 'stylesheet', href: 'styles/main.css' } },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node as unknown as DomNode)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._staticResources!.stylesheets).toContain('https://cdn.openheaders.io/v2/styles/main.css');
    });

    // --- preload to prefetch for fonts ---
    it('changes preload to prefetch for font links', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'link',
                attributes: {
                  rel: 'preload',
                  href: 'https://fonts.openheaders.io/inter-v13.woff2',
                  type: '',
                },
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      const link = getNode(result, 0).childNodes![0].childNodes![0];
      expect(link.attributes!.rel).toBe('prefetch');
    });

    // --- URL deduplication ---
    it('normalizes duplicate resource URLs to shortest path', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              { tagName: 'script', attributes: { src: 'https://cdn.openheaders.io/assets/v1/build/app.js' } },
              { tagName: 'script', attributes: { src: 'https://cdn.openheaders.io/app.js' } },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      const scripts = result.record._staticResources!.scripts;
      expect(scripts).toContain('https://cdn.openheaders.io/app.js');
    });

    // --- _cssText in link tags ---
    it('extracts font URLs from link tag _cssText attribute', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'link',
                attributes: {
                  rel: 'stylesheet',
                  href: 'https://cdn.openheaders.io/fonts.css',
                  _cssText: '@font-face { src: url("https://cdn.openheaders.io/inter.woff2"); }',
                },
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._fontUrls).toContain('https://cdn.openheaders.io/inter.woff2');
    });

    // --- noscript stylesheet collection ---
    it('collects stylesheet URLs from noscript link tags', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'noscript',
                childNodes: [
                  {
                    textContent: '<link rel="stylesheet" href="https://cdn.openheaders.io/noscript-styles.css">',
                  },
                ],
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node as unknown as DomNode)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._staticResources!.stylesheets).toContain('https://cdn.openheaders.io/noscript-styles.css');
    });

    // --- font-display in _cssText attribute ---
    it('injects font-display: swap in style _cssText attribute', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'style',
                attributes: {
                  _cssText:
                    '@font-face { font-family: "Inter"; src: url("https://fonts.openheaders.io/inter.woff2"); }',
                },
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      const style = getNode(result, 0).childNodes![0].childNodes![0];
      // Should inject font-display either in textContent or _cssText
      const cssContent = style.textContent || style.attributes?._cssText || '';
      expect(cssContent).toContain('font-display: swap');
    });

    // --- stylesheet rule events (source: 8) ---
    it('collects font URLs from stylesheet rule events', async () => {
      const snapshotNode = { tagName: 'html', childNodes: [] };
      const events = [
        makeFullSnapshot(snapshotNode, 1000),
        makeIncrementalSnapshot(
          {
            source: 8,
            adds: [
              {
                rule: '@font-face { src: url("https://fonts.openheaders.io/dynamic-font.woff2"); }',
              },
            ],
          },
          2000,
        ),
      ];

      const input = makeRecording(events);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._fontUrls).toContain('https://fonts.openheaders.io/dynamic-font.woff2');
    });

    // --- error handling ---
    it('returns original recording data on catastrophic processing error', async () => {
      // Create a recording with deliberately problematic data
      const input: PreprocessorData = {
        record: {
          events: [{ type: 2, timestamp: 1000, data: null as unknown as RRWebEvent }],
          metadata: { url: 'https://app.openheaders.io', startTime: 0 },
        },
      } as PreprocessorData;
      // Should not throw, should return gracefully
      const result = await preprocessRecordingForSave(input);
      expect(result).toBeDefined();
    });

    // --- large recording handling ---
    it('handles recording with many events', async () => {
      const events: RRWebEvent[] = [];
      // Add a snapshot
      events.push(makeFullSnapshot({ tagName: 'html', childNodes: [] }, 0));
      // Add many incremental events
      for (let i = 1; i <= 100; i++) {
        events.push(makeIncrementalSnapshot({ source: 2 }, i * 100)); // mouse events
      }
      const input = makeRecording(events);
      const result = await preprocessRecordingForSave(input);
      // All events should be preserved (snapshot + mouse events)
      expect(result.record.events).toHaveLength(101);
      expect(result.record._preprocessed).toBe(true);
    });

    // --- image classification ---
    it('classifies image links by type attribute or extension', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'link',
                attributes: {
                  rel: 'icon',
                  href: 'https://cdn.openheaders.io/favicon.ico',
                  type: 'image/x-icon',
                },
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._staticResources!.images).toContain('https://cdn.openheaders.io/favicon.ico');
    });

    // --- modulepreload links ---
    it('collects modulepreload links as scripts', async () => {
      const node = {
        tagName: 'html',
        childNodes: [
          {
            tagName: 'head',
            childNodes: [
              {
                tagName: 'link',
                attributes: {
                  rel: 'modulepreload',
                  href: 'https://cdn.openheaders.io/module-chunk.js',
                },
              },
            ],
          },
        ],
      };
      const input = makeRecording([makeFullSnapshot(node)]);
      const result = await preprocessRecordingForSave(input);
      expect(result.record._staticResources!.scripts).toContain('https://cdn.openheaders.io/module-chunk.js');
    });
  });
});
