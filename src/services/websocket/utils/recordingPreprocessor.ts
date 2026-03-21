/**
 * Recording Preprocessor for WebSocket Service
 *
 * Handles preprocessing of recordings when they are saved from the browser extension.
 * This preprocessing includes:
 * - Fixing iframe sandbox attributes
 * - Collecting and prefetching fonts
 * - Optimizing multi-page recordings
 * - Adding font-display: swap to prevent blocking
 */

import mainLogger from '../../../utils/mainLogger';
import { errorMessage } from '../../../types/common';
import http from 'http';
import nodeUrl from 'url';
import type {
    DomNode,
    Snapshot,
    StaticResources,
    PageTransition,
    RRWebInnerData,
    RRWebAdd,
    RRWebEvent,
    PreprocessProgressDetails,
    RecordingMetadata,
} from '../../../types/recording';

const { createLogger } = mainLogger;
const log = createLogger('RecordingPreprocessor');

const urlNormalizationCache = new Map<string, string>();
const CACHE_MAX_SIZE = 5000;

interface PreprocessorEvent {
    type: string | number;
    timestamp: number;
    data?: RRWebEvent;
}

interface PreprocessorRecord {
    events: PreprocessorEvent[];
    metadata?: RecordingMetadata;
    _preprocessed?: boolean;
    _pageTransitions?: PageTransition[];
    _fontUrls?: string[];
    _staticResources?: Record<string, string[]>;
}

interface PreprocessorData {
    record: PreprocessorRecord;
}

interface PreprocessOptions {
    proxyPort?: number | null;
    onProgress?: (stage: string, progress: number, details?: PreprocessProgressDetails) => void;
}

interface PrefetchResource {
    url: string;
    type: string;
    priority: number;
}

/**
 * Create a map to track all URLs for each resource filename
 */
function createResourceMap(): Map<string, string[]> {
    return new Map();
}

/**
 * Collect all URLs for each resource
 */
function collectResourceUrl(resourceMap: Map<string, string[]>, urlStr: string): void {
    if (!urlStr || typeof urlStr !== 'string') return;

    try {
        const urlObj = new URL(urlStr);
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop();

        if (!filename) return;

        if (!resourceMap.has(filename)) {
            resourceMap.set(filename, []);
        }

        const urls = resourceMap.get(filename)!;
        if (!urls.includes(urlStr)) {
            urls.push(urlStr);
        }
    } catch (error) {
        // Ignore parsing errors
    }
}

/**
 * Get the shortest URL for a resource (with caching)
 */
function getShortestUrl(resourceMap: Map<string, string[]>, urlStr: string): string {
    if (!urlStr || typeof urlStr !== 'string') return urlStr;

    // Check cache first
    if (urlNormalizationCache.has(urlStr)) {
        return urlNormalizationCache.get(urlStr)!;
    }

    try {
        const urlObj = new URL(urlStr);
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop();

        if (!filename || !resourceMap.has(filename)) {
            // Cache and return original
            cacheNormalizedUrl(urlStr, urlStr);
            return urlStr;
        }

        const urls = resourceMap.get(filename)!;
        if (urls.length === 1) {
            const result = urls[0];
            cacheNormalizedUrl(urlStr, result);
            return result;
        }

        // Find the shortest URL
        let shortest = urls[0];
        for (const u of urls) {
            if (new URL(u).pathname.length < new URL(shortest).pathname.length) {
                shortest = u;
            }
        }

        if (shortest !== urlStr) {
            log.info(`Replaced URL for ${filename}: ${urlStr} -> ${shortest}`);
        }

        // Cache the result
        cacheNormalizedUrl(urlStr, shortest);
        return shortest;
    } catch (error) {
        // Cache original on error
        cacheNormalizedUrl(urlStr, urlStr);
        return urlStr;
    }
}

/**
 * Cache a normalized URL with size management
 */
function cacheNormalizedUrl(original: string, normalized: string): void {
    // Clear cache if it gets too large
    if (urlNormalizationCache.size >= CACHE_MAX_SIZE) {
        // Clear oldest entries (first half of cache)
        const entriesToDelete = Math.floor(CACHE_MAX_SIZE / 2);
        let deleted = 0;
        for (const key of urlNormalizationCache.keys()) {
            if (deleted >= entriesToDelete) break;
            urlNormalizationCache.delete(key);
            deleted++;
        }
        log.info(`Cleared ${deleted} entries from URL normalization cache`);
    }
    urlNormalizationCache.set(original, normalized);
}

/**
 * Extract base URL from base tag in snapshot
 */
function extractBaseUrl(snapshot: Snapshot | null): string | null {
    if (!snapshot || !snapshot.node) return null;

    const findBaseTag = (node: DomNode): string | null => {
        if (node.tagName === 'base' && node.attributes?.href) {
            return node.attributes.href;
        }

        if (node.childNodes) {
            for (const child of node.childNodes) {
                const baseUrl = findBaseTag(child);
                if (baseUrl) return baseUrl;
            }
        }

        return null;
    };

    return findBaseTag(snapshot.node);
}

/**
 * Collect all resource URLs from a snapshot (first pass)
 */
function collectResourcesFromSnapshot(snapshot: Snapshot, resourceMap: Map<string, string[]>, baseUrl: string): void {
    if (!snapshot || !snapshot.node) return;

    // Check for base tag and use it if present
    const baseTagUrl = extractBaseUrl(snapshot);
    if (baseTagUrl) {
        baseUrl = baseTagUrl;
        log.info(`Found base tag with URL: ${baseUrl}`);
    }

    const collectFromNode = (node: DomNode) => {
        // Check link tags
        if (node.tagName === 'link' && node.attributes?.href) {
            const href = node.attributes.href;
            if (!href.startsWith('data:')) {
                let resolvedHref = href;
                if (!href.startsWith('http://') && !href.startsWith('https://')) {
                    const resolved = resolveRelativeUrl(href, baseUrl);
                    if (resolved) resolvedHref = resolved;
                }
                collectResourceUrl(resourceMap, resolvedHref);
            }
        }

        // Check script tags
        if (node.tagName === 'script' && node.attributes?.src) {
            const src = node.attributes.src;
            if (!src.startsWith('data:')) {
                let resolvedSrc = src;
                if (!src.startsWith('http://') && !src.startsWith('https://')) {
                    const resolved = resolveRelativeUrl(src, baseUrl);
                    if (resolved) resolvedSrc = resolved;
                }
                collectResourceUrl(resourceMap, resolvedSrc);
            }
        }

        // Check img tags
        if (node.tagName === 'img' && node.attributes?.src) {
            const src = node.attributes.src;
            if (!src.startsWith('data:')) {
                let resolvedSrc = src;
                if (!src.startsWith('http://') && !src.startsWith('https://')) {
                    const resolved = resolveRelativeUrl(src, baseUrl);
                    if (resolved) resolvedSrc = resolved;
                }
                collectResourceUrl(resourceMap, resolvedSrc);
            }
        }

        // Check style tags
        if (node.tagName === 'style') {
            const cssContent = node.textContent || node.attributes?._cssText || '';
            if (cssContent) {
                collectResourcesFromCss(cssContent, resourceMap, baseUrl);
            }
        }

        // Check link CSS content
        if (node.tagName === 'link' && node.attributes?._cssText) {
            const cssBaseUrl = node.attributes.href ?
                (node.attributes.href.startsWith('http') ? node.attributes.href : resolveRelativeUrl(node.attributes.href, baseUrl) || baseUrl)
                : baseUrl;
            collectResourcesFromCss(node.attributes._cssText, resourceMap, cssBaseUrl);
        }

        // Check noscript content
        if (node.tagName === 'noscript' && node.childNodes) {
            node.childNodes.forEach(child => {
                if (child.textContent) {
                    const linkRegex = /<link[^>]+href=["']([^"']+)["']/gi;
                    let match: RegExpExecArray | null;
                    while ((match = linkRegex.exec(child.textContent!)) !== null) {
                        const matchedUrl = match[1];
                        if (!matchedUrl.startsWith('data:')) {
                            if (matchedUrl.startsWith('http')) {
                                collectResourceUrl(resourceMap, matchedUrl);
                            } else {
                                const resolved = resolveRelativeUrl(matchedUrl, baseUrl);
                                if (resolved) {
                                    collectResourceUrl(resourceMap, resolved);
                                }
                            }
                        }
                    }
                }
            });
        }

        // Recurse through children
        if (node.childNodes) {
            node.childNodes.forEach(collectFromNode);
        }
    };

    collectFromNode(snapshot.node);
}

/**
 * Collect resource URLs from CSS content
 */
function collectResourcesFromCss(cssText: string, resourceMap: Map<string, string[]>, baseUrl: string): void {
    const fontFaceRegex = /url\s*\(\s*["']?([^"')]+\.(woff2?|otf|ttf|eot)[^"')]*)["']?\s*\)/gi;
    let match: RegExpExecArray | null;
    while ((match = fontFaceRegex.exec(cssText)) !== null) {
        const fontUrl = match[1].trim();
        if (!fontUrl.startsWith('data:')) {
            if (fontUrl.startsWith('http://') || fontUrl.startsWith('https://')) {
                collectResourceUrl(resourceMap, fontUrl);
            } else if (baseUrl) {
                const resolved = resolveRelativeUrl(fontUrl, baseUrl);
                if (resolved) {
                    collectResourceUrl(resourceMap, resolved);
                }
            }
        }
    }
}

/**
 * Clear URL normalization cache (useful between recordings)
 */
function clearUrlNormalizationCache(): void {
    const size = urlNormalizationCache.size;
    if (size > 0) {
        urlNormalizationCache.clear();
        log.info(`Cleared ${size} entries from URL normalization cache`);
    }
}

/**
 * Preprocesses a recording for optimized playback
 * This is called when saving a recording from the browser extension
 */
async function preprocessRecordingForSave(recordingData: PreprocessorData, options: PreprocessOptions = {}): Promise<PreprocessorData> {

    // Clear cache if it's too large before starting new recording
    if (urlNormalizationCache.size > CACHE_MAX_SIZE / 2) {
        clearUrlNormalizationCache();
    }

    try {
        const record = recordingData.record;
        log.info(`Starting preprocessing of recording with ${record.events.length} events`);

        // Extract base URL from metadata
        const baseUrl = record.metadata?.url || '';

        const processedEvents: PreprocessorEvent[] = [];
        const pageTransitions: PageTransition[] = [];
        const fontUrls = new Set<string>();
        const staticResources: StaticResources = {
            scripts: new Set(),
            stylesheets: new Set(),
            images: new Set(),
            fonts: new Set(),
            other: new Set()
        };

        // Create resource map for deduplication
        const resourceMap = createResourceMap();

        let currentPageIndex = 0;

        // First pass: quickly collect all resource URLs for deduplication
        const firstPassStart = Date.now();
        log.info(`First pass: collecting resources from ${record.events.length} events`);

        // Report initial preprocessing progress
        if (options.onProgress) {
            options.onProgress('preprocessing', 0, { phase: 'first-pass', totalEvents: record.events.length });
        }

        for (let i = 0; i < record.events.length; i++) {
            const event = record.events[i];

            // Report progress every 20 events during first pass
            if (i > 0 && i % 20 === 0 && options.onProgress) {
                const progress = Math.round((i / record.events.length) * 30);
                options.onProgress('preprocessing', progress, {
                    phase: 'first-pass',
                    eventsProcessed: i,
                    totalEvents: record.events.length
                });
            }

            // Handle wrapped rrweb events
            if (event.type === 'rrweb' && event.data) {
                const rrwebEvent = event.data;

                if (rrwebEvent.type === 2) { // Full snapshot
                    pageTransitions.push({
                        index: i,
                        timestamp: event.timestamp,
                        pageIndex: currentPageIndex++
                    });

                    const baseTagUrl = extractBaseUrl(rrwebEvent.data as Snapshot | null);
                    const effectiveBaseUrl = baseTagUrl || baseUrl;
                    collectResourcesFromSnapshot(rrwebEvent.data as Snapshot, resourceMap, effectiveBaseUrl);
                } else if (rrwebEvent.type === 3 && rrwebEvent.data?.source === 8 && rrwebEvent.data?.adds) {
                    rrwebEvent.data.adds.forEach((add: RRWebAdd) => {
                        if (add.rule && typeof add.rule === 'string') {
                            collectResourcesFromCss(add.rule, resourceMap, baseUrl);
                        }
                    });
                }
            } else if (event.type === 2) { // Direct rrweb format - Full snapshot
                pageTransitions.push({
                    index: i,
                    timestamp: event.timestamp,
                    pageIndex: currentPageIndex++
                });

                const baseTagUrl = extractBaseUrl(event.data as Snapshot | null);
                const effectiveBaseUrl = baseTagUrl || baseUrl;
                collectResourcesFromSnapshot(event.data as Snapshot, resourceMap, effectiveBaseUrl);
            } else if (event.type === 3 && event.data?.source === 8 && event.data?.adds) {
                event.data.adds.forEach((add: RRWebAdd) => {
                    if (add.rule && typeof add.rule === 'string') {
                        collectResourcesFromCss(add.rule, resourceMap, baseUrl);
                    }
                });
            }
        }

        const firstPassDuration = Date.now() - firstPassStart;

        // Log resource map statistics
        log.info(`Resource map contains ${resourceMap.size} unique filenames (first pass took ${firstPassDuration}ms)`);
        let duplicateCount = 0;
        resourceMap.forEach((urls, filename) => {
            if (urls.length > 1) {
                duplicateCount++;
                if (duplicateCount <= 5) {
                    log.info(`Found ${urls.length} paths for ${filename}`);
                }
            }
        });
        if (duplicateCount > 5) {
            log.info(`... and ${duplicateCount - 5} more resources with multiple paths`);
        }

        // Report completion of first pass
        if (options.onProgress) {
            options.onProgress('preprocessing', 30, {
                phase: 'first-pass-complete',
                resourcesFound: resourceMap.size,
                duplicatesFound: duplicateCount
            });
        }

        // Second pass: process events with complete resource map
        const secondPassStart = Date.now();
        log.info(`Second pass: processing ${record.events.length} events with normalized URLs`);

        if (options.onProgress) {
            options.onProgress('preprocessing', 35, { phase: 'second-pass', totalEvents: record.events.length });
        }

        for (let i = 0; i < record.events.length; i++) {
            const event = record.events[i];

            // Report progress every 20 events during second pass
            if (i > 0 && i % 20 === 0 && options.onProgress) {
                const progress = 35 + Math.round((i / record.events.length) * 65);
                options.onProgress('preprocessing', progress, {
                    phase: 'second-pass',
                    eventsProcessed: i,
                    totalEvents: record.events.length,
                    resourcesNormalized: staticResources.scripts.size + staticResources.stylesheets.size + staticResources.images.size
                });
            }

            // Handle wrapped rrweb events
            if (event.type === 'rrweb' && event.data) {
                const rrwebEvent = event.data;

                if (rrwebEvent.type === 2) { // Full snapshot
                    const baseTagUrl = extractBaseUrl(rrwebEvent.data as Snapshot | null);
                    const effectiveBaseUrl = baseTagUrl || baseUrl;

                    const processedData = preprocessSnapshot(rrwebEvent.data as Snapshot, fontUrls, staticResources, effectiveBaseUrl, resourceMap);
                    const processedEvent = {
                        ...event,
                        data: {
                            ...rrwebEvent,
                            data: processedData
                        }
                    };
                    processedEvents.push(processedEvent);
                } else if (rrwebEvent.type === 3) { // Incremental snapshot
                    const processedRrwebEvent = processIncrementalSnapshot(rrwebEvent, fontUrls, pageTransitions, baseUrl, resourceMap);
                    if (processedRrwebEvent) {
                        const processedEvent = {
                            ...event,
                            data: processedRrwebEvent
                        };
                        processedEvents.push(processedEvent as PreprocessorEvent);
                    }
                } else {
                    processedEvents.push(event);
                }
            } else if (event.type === 2) { // Direct rrweb format - Full snapshot
                const baseTagUrl = extractBaseUrl(event.data as Snapshot | null);
                const effectiveBaseUrl = baseTagUrl || baseUrl;

                const processedEvent = {
                    ...event,
                    data: preprocessSnapshot(event.data as Snapshot, fontUrls, staticResources, effectiveBaseUrl, resourceMap)
                };
                processedEvents.push(processedEvent as PreprocessorEvent);
            } else if (event.type === 3) { // Direct rrweb format - Incremental snapshot
                const processedEvent = processIncrementalSnapshot(event, fontUrls, pageTransitions, baseUrl, resourceMap);
                if (processedEvent) {
                    processedEvents.push(processedEvent as PreprocessorEvent);
                }
            } else {
                processedEvents.push(event);
            }
        }

        const secondPassDuration = Date.now() - secondPassStart;
        const totalPreprocessingDuration = Date.now() - firstPassStart;

        log.info(`Preprocessing complete: ${processedEvents.length} events, ${fontUrls.size} fonts, ${staticResources.scripts.size + staticResources.stylesheets.size + staticResources.images.size + staticResources.fonts.size + staticResources.other.size} total resources`);
        log.info(`Preprocessing timing: First pass: ${firstPassDuration}ms, Second pass: ${secondPassDuration}ms, Total: ${totalPreprocessingDuration}ms`);

        // Report preprocessing completion
        if (options.onProgress) {
            options.onProgress('preprocessing', 100, {
                phase: 'complete',
                eventsProcessed: processedEvents.length,
                totalResources: staticResources.scripts.size + staticResources.stylesheets.size + staticResources.images.size + staticResources.fonts.size + staticResources.other.size
            });
        }

        // Prefetch resources through proxy if available
        if (options.proxyPort) {
            await prefetchResources(staticResources, options.proxyPort, options.onProgress);
        }

        // Return processed recording data
        return {
            ...recordingData,
            record: {
                ...record,
                events: processedEvents,
                _preprocessed: true,
                _pageTransitions: pageTransitions,
                _fontUrls: Array.from(fontUrls),
                _staticResources: {
                    scripts: Array.from(staticResources.scripts),
                    stylesheets: Array.from(staticResources.stylesheets),
                    images: Array.from(staticResources.images),
                    fonts: Array.from(staticResources.fonts),
                    other: Array.from(staticResources.other)
                }
            }
        };
    } catch (error) {
        log.error('Error preprocessing recording:', error);
        return recordingData;
    }
}

/**
 * Preprocesses DOM snapshot to fix iframe sandbox issues and collect static resource URLs
 */
function preprocessSnapshot(snapshot: Snapshot, fontUrls: Set<string>, staticResources: StaticResources, baseUrl: string, resourceMap: Map<string, string[]>): Snapshot {
    if (!snapshot || !snapshot.node) return snapshot;

    // Check for base tag and use it if present
    const baseTagUrl = extractBaseUrl(snapshot);
    if (baseTagUrl) {
        baseUrl = baseTagUrl;
    }

    const processNode = (node: DomNode): DomNode => {
        // Handle iframe nodes
        if (node.tagName === 'iframe' && node.attributes) {
            if (node.attributes.sandbox !== undefined) {
                const sandboxValue = node.attributes.sandbox || '';
                const sandboxAttrs = sandboxValue.split(' ').filter(Boolean);

                if (!sandboxAttrs.includes('allow-scripts')) {
                    sandboxAttrs.push('allow-scripts');
                }
                if (!sandboxAttrs.includes('allow-same-origin')) {
                    sandboxAttrs.push('allow-same-origin');
                }

                node.attributes.sandbox = sandboxAttrs.join(' ');
            }

            if (node.attributes.sandbox === undefined && node.attributes.src) {
                node.attributes.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups';
            }
        }

        // Handle link nodes
        if (node.tagName === 'link' && node.attributes) {
            const href = node.attributes.href || '';
            const rel = node.attributes.rel || '';
            const type = node.attributes.type || '';

            if (href.startsWith('data:')) {
                return node;
            }

            let resolvedHref = href;
            if (!href.startsWith('http://') && !href.startsWith('https://')) {
                const resolved = resolveRelativeUrl(href, baseUrl);
                if (resolved) {
                    resolvedHref = resolved;
                }
            }

            const normalizedHref = getShortestUrl(resourceMap, resolvedHref);
            if (normalizedHref !== resolvedHref) {
                log.info(`NORMALIZED link href: ${resolvedHref} -> ${normalizedHref}`);
                node.attributes.href = normalizedHref;
            }

            if (rel.includes('stylesheet')) {
                staticResources.stylesheets.add(normalizedHref);
            } else if (rel.includes('modulepreload') || rel.includes('preload') && type.includes('script')) {
                staticResources.scripts.add(normalizedHref);
            } else if (type.includes('image') || normalizedHref.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i)) {
                staticResources.images.add(normalizedHref);
            } else if (normalizedHref.match(/\.(woff2?|ttf|otf|eot)$/i)) {
                fontUrls.add(normalizedHref);
                staticResources.fonts.add(normalizedHref);
            } else {
                staticResources.other.add(normalizedHref);
            }

            if (rel.includes('preload') && resolvedHref.match(/\.(woff2?|ttf|otf|eot)$/i)) {
                node.attributes.rel = rel.replace('preload', 'prefetch');
            }

            if (node.attributes._cssText) {
                const cssBaseUrl = resolvedHref || baseUrl;
                extractFontUrlsFromCss(node.attributes._cssText, fontUrls, staticResources, cssBaseUrl, resourceMap);
            }
        }

        // Handle script nodes
        if (node.tagName === 'script' && node.attributes?.src) {
            const src = node.attributes.src;
            if (!src.startsWith('data:')) {
                let resolvedSrc = src;
                if (!src.startsWith('http://') && !src.startsWith('https://')) {
                    const resolved = resolveRelativeUrl(src, baseUrl);
                    if (resolved) {
                        resolvedSrc = resolved;
                    }
                }
                const normalizedSrc = getShortestUrl(resourceMap, resolvedSrc);
                if (normalizedSrc !== resolvedSrc) {
                    log.info(`NORMALIZED script src: ${resolvedSrc} -> ${normalizedSrc}`);
                    node.attributes.src = normalizedSrc;
                }
                staticResources.scripts.add(normalizedSrc);
            }
        }

        // Handle img nodes
        if (node.tagName === 'img' && node.attributes?.src) {
            const src = node.attributes.src;
            if (!src.startsWith('data:')) {
                let resolvedSrc = src;
                if (!src.startsWith('http://') && !src.startsWith('https://')) {
                    const resolved = resolveRelativeUrl(src, baseUrl);
                    if (resolved) {
                        resolvedSrc = resolved;
                    }
                }
                const normalizedSrc = getShortestUrl(resourceMap, resolvedSrc);
                if (normalizedSrc !== resolvedSrc) {
                    log.info(`NORMALIZED image src: ${resolvedSrc} -> ${normalizedSrc}`);
                    node.attributes.src = normalizedSrc;
                }
                staticResources.images.add(normalizedSrc);
            }
        }

        // Handle style nodes that might contain font-face rules
        if (node.tagName === 'style') {
            const cssContent = node.textContent || node.attributes?._cssText || '';

            if (cssContent) {
                extractFontUrlsFromCss(cssContent, fontUrls, staticResources, baseUrl, resourceMap);

                let modifiedContent = cssContent;
                modifiedContent = modifiedContent.replace(
                    /(@font-face\s*{[^}]*)(})/gi,
                    (match: string, fontFaceStart: string, fontFaceEnd: string) => {
                        if (fontFaceStart.includes('font-display')) {
                            return match;
                        }
                        return `${fontFaceStart}; font-display: swap ${fontFaceEnd}`;
                    }
                );

                if (modifiedContent !== cssContent) {
                    if (node.textContent) {
                        node.textContent = modifiedContent;
                    } else if (node.attributes?._cssText) {
                        node.attributes._cssText = modifiedContent;
                    }
                }
            }
        }

        // Handle noscript nodes that may contain stylesheet links
        if (node.tagName === 'noscript' && node.childNodes) {
            node.childNodes.forEach(child => {
                if (child.textContent) {
                    const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi;
                    let match: RegExpExecArray | null;
                    while ((match = linkRegex.exec(child.textContent!)) !== null) {
                        const styleUrl = match[1];
                        if (styleUrl.startsWith('http')) {
                            const normalizedUrl = getShortestUrl(resourceMap, styleUrl);
                            if (normalizedUrl !== styleUrl) {
                                log.info(`NORMALIZED noscript stylesheet: ${styleUrl} -> ${normalizedUrl}`);
                            }
                            staticResources.stylesheets.add(normalizedUrl);
                        } else if (!styleUrl.startsWith('data:')) {
                            const resolvedUrl = resolveRelativeUrl(styleUrl, baseUrl);
                            if (resolvedUrl) {
                                const normalizedUrl = getShortestUrl(resourceMap, resolvedUrl);
                                if (normalizedUrl !== resolvedUrl) {
                                    log.info(`NORMALIZED noscript stylesheet: ${resolvedUrl} -> ${normalizedUrl}`);
                                }
                                staticResources.stylesheets.add(normalizedUrl);
                            }
                        }
                    }
                }
            });
        }

        // Process child nodes recursively
        if (node.childNodes) {
            node.childNodes = node.childNodes.map(processNode);
        }

        return node;
    };

    return {
        ...snapshot,
        node: processNode(snapshot.node)
    };
}

/**
 * Process incremental snapshots
 */
function processIncrementalSnapshot(event: PreprocessorEvent | RRWebEvent, fontUrls: Set<string>, pageTransitions: PageTransition[], baseUrl: string, resourceMap: Map<string, string[]>): PreprocessorEvent | RRWebEvent | null {
    if (!event.data) return event;

    if (event.data.source === 0 && event.data.adds) {
        const processedAdds = event.data.adds.map((add: RRWebAdd) => {
            if (!add.node || !add.node.attributes) return add;

            const processedNode = JSON.parse(JSON.stringify(add.node));

            // Handle iframe nodes
            if (processedNode.tagName === 'iframe') {
                if (processedNode.attributes.sandbox !== undefined) {
                    const sandboxValue = processedNode.attributes.sandbox || '';
                    const sandboxAttrs = sandboxValue.split(' ').filter(Boolean);

                    if (!sandboxAttrs.includes('allow-scripts')) {
                        sandboxAttrs.push('allow-scripts');
                    }
                    if (!sandboxAttrs.includes('allow-same-origin')) {
                        sandboxAttrs.push('allow-same-origin');
                    }

                    processedNode.attributes.sandbox = sandboxAttrs.join(' ');
                } else if (processedNode.attributes.src) {
                    processedNode.attributes.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups';
                }
            }

            // Normalize URLs for dynamically added scripts
            if (processedNode.tagName === 'script' && processedNode.attributes.src) {
                const src = processedNode.attributes.src;
                if (!src.startsWith('data:')) {
                    let resolvedSrc = src;
                    if (!src.startsWith('http://') && !src.startsWith('https://')) {
                        const resolved = resolveRelativeUrl(src, baseUrl);
                        if (resolved) resolvedSrc = resolved;
                    }
                    const normalizedSrc = getShortestUrl(resourceMap, resolvedSrc);
                    if (normalizedSrc !== resolvedSrc) {
                        processedNode.attributes.src = normalizedSrc;
                    }
                }
            }

            // Normalize URLs for dynamically added images
            if (processedNode.tagName === 'img' && processedNode.attributes.src) {
                const src = processedNode.attributes.src;
                if (!src.startsWith('data:')) {
                    let resolvedSrc = src;
                    if (!src.startsWith('http://') && !src.startsWith('https://')) {
                        const resolved = resolveRelativeUrl(src, baseUrl);
                        if (resolved) resolvedSrc = resolved;
                    }
                    const normalizedSrc = getShortestUrl(resourceMap, resolvedSrc);
                    if (normalizedSrc !== resolvedSrc) {
                        processedNode.attributes.src = normalizedSrc;
                    }
                }
            }

            // Normalize URLs for dynamically added links
            if (processedNode.tagName === 'link' && processedNode.attributes.href) {
                const href = processedNode.attributes.href;
                if (!href.startsWith('data:')) {
                    let resolvedHref = href;
                    if (!href.startsWith('http://') && !href.startsWith('https://')) {
                        const resolved = resolveRelativeUrl(href, baseUrl);
                        if (resolved) resolvedHref = resolved;
                    }
                    const normalizedHref = getShortestUrl(resourceMap, resolvedHref);
                    if (normalizedHref !== resolvedHref) {
                        processedNode.attributes.href = normalizedHref;
                    }
                }
            }

            return { ...add, node: processedNode };
        });

        return {
            ...event,
            data: {
                ...event.data,
                adds: processedAdds
            }
        };
    } else if (event.data.source === 8) {
        // Style sheet event - collect font URLs
        if (event.data.adds && Array.isArray(event.data.adds)) {
            event.data.adds.forEach((add: RRWebAdd) => {
                if (add.rule && typeof add.rule === 'string' && add.rule.includes('@font-face')) {
                    extractFontUrlsFromCss(add.rule, fontUrls, null, baseUrl, resourceMap);
                }
            });
        }
        return event;
    } else {
        const isMouseEvent = event.data && (
            (event.data.source === 6 && event.data.positions) ||
            event.data.source === 2 ||
            event.data.source === 1
        );

        if (isMouseEvent) {
            return event;
        } else {
            const eventTimestamp = event.timestamp ?? 0;
            const nextPageIndex = pageTransitions.findIndex(
                p => p.timestamp > eventTimestamp
            );

            if (nextPageIndex !== -1) {
                const nextPageTime = pageTransitions[nextPageIndex].timestamp;
                if (nextPageTime - eventTimestamp < 100) {
                    return null;
                }
            }

            return event;
        }
    }
}

/**
 * Extract font URLs from CSS text
 */
function extractFontUrlsFromCss(cssText: string, fontUrls: Set<string>, staticResources: StaticResources | null, baseUrl: string, resourceMap: Map<string, string[]>): void {
    const fontFaceRegex = /url\s*\(\s*["']?([^"')]+\.(woff2?|otf|ttf|eot)[^"')]*)["']?\s*\)/gi;
    let match: RegExpExecArray | null;
    while ((match = fontFaceRegex.exec(cssText)) !== null) {
        let fontUrl = match[1].trim();

        if (fontUrl.startsWith('data:')) {
            continue;
        }

        if (fontUrl.startsWith('http://') || fontUrl.startsWith('https://')) {
            const normalizedUrl = resourceMap ? getShortestUrl(resourceMap, fontUrl) : fontUrl;
            if (normalizedUrl !== fontUrl) {
                log.info(`NORMALIZED font URL in CSS: ${fontUrl} -> ${normalizedUrl}`);
            }
            fontUrls.add(normalizedUrl);
            if (staticResources) {
                staticResources.fonts.add(normalizedUrl);
            }
        } else if (baseUrl) {
            const resolvedUrl = resolveRelativeUrl(fontUrl, baseUrl);
            if (resolvedUrl) {
                const normalizedUrl = resourceMap ? getShortestUrl(resourceMap, resolvedUrl) : resolvedUrl;
                if (normalizedUrl !== resolvedUrl) {
                    log.info(`NORMALIZED font URL in CSS: ${resolvedUrl} -> ${normalizedUrl}`);
                }
                fontUrls.add(normalizedUrl);
                if (staticResources) {
                    staticResources.fonts.add(normalizedUrl);
                }
            }
        }
    }
}

/**
 * Resolve a relative URL against a base URL
 */
function resolveRelativeUrl(relativeUrl: string, baseUrl: string): string | null {
    try {
        return new URL(relativeUrl, baseUrl).href;
    } catch (error) {
        return null;
    }
}

/**
 * Get batch size based on resource type
 */
function getBatchSize(resourceType: string): number {
    switch(resourceType) {
        case 'font':
            return 5;
        case 'stylesheet':
            return 15;
        case 'script':
            return 20;
        case 'image':
            return 30;
        case 'other':
            return 10;
        default:
            return 10;
    }
}

/**
 * Prefetch resources through the proxy to populate the cache
 */
async function prefetchResources(staticResources: StaticResources, proxyPort: number, onProgress?: (stage: string, progress: number, details?: PreprocessProgressDetails) => void): Promise<void> {
    const allResources: PrefetchResource[] = [];

    staticResources.stylesheets.forEach(url => allResources.push({ url, type: 'stylesheet', priority: 1 }));
    staticResources.fonts.forEach(url => allResources.push({ url, type: 'font', priority: 2 }));
    staticResources.scripts.forEach(url => allResources.push({ url, type: 'script', priority: 3 }));
    staticResources.images.forEach(url => allResources.push({ url, type: 'image', priority: 4 }));
    staticResources.other.forEach(url => allResources.push({ url, type: 'other', priority: 5 }));

    allResources.sort((a, b) => a.priority - b.priority);

    if (allResources.length === 0) {
        log.info('No resources to prefetch');
        return;
    }

    const prefetchStart = Date.now();
    log.info(`Prefetching ${allResources.length} resources through proxy at port ${proxyPort}`);

    let completed = 0;
    let failed = 0;

    const resourcesByType: Record<string, PrefetchResource[]> = {};
    allResources.forEach(resource => {
        if (!resourcesByType[resource.type]) {
            resourcesByType[resource.type] = [];
        }
        resourcesByType[resource.type].push(resource);
    });

    const typeOrder = ['stylesheet', 'font', 'script', 'image', 'other'];

    for (const resourceType of typeOrder) {
        const resources = resourcesByType[resourceType] || [];
        if (resources.length === 0) continue;

        const batchSize = getBatchSize(resourceType);

        for (let i = 0; i < resources.length; i += batchSize) {
            const batch = resources.slice(i, i + batchSize);

            await Promise.all(batch.map(async (resource) => {
                try {
                    await prefetchSingleResource(resource.url, resource.type, proxyPort);
                    completed++;
                } catch (error: unknown) {
                    log.warn(`Failed to prefetch ${resource.type}: ${resource.url}`, errorMessage(error));
                    failed++;
                }

                const totalProcessed = completed + failed;
                const progress = Math.round((totalProcessed / allResources.length) * 100);

                if (onProgress) {
                    onProgress('prefetching', progress, {
                        completed,
                        failed,
                        total: allResources.length,
                        currentResource: resource.url,
                        currentType: resource.type
                    });
                }
            }));
        }
    }

    const prefetchDuration = Date.now() - prefetchStart;
    log.info(`Prefetch complete: ${completed} succeeded, ${failed} failed out of ${allResources.length} total (took ${prefetchDuration}ms)`);
}

/**
 * Prefetch a single resource through the proxy
 */
async function prefetchSingleResource(resourceUrl: string, resourceType: string, proxyPort: number): Promise<void> {
    // Skip chrome-extension:// URLs as they cannot be fetched through proxy
    if (resourceUrl.startsWith('chrome-extension://')) {
        return;
    }

    return new Promise((resolve, reject) => {
        const proxyUrl = `http://127.0.0.1:${proxyPort}/${resourceUrl}`;
        const parsedUrl = nodeUrl.parse(proxyUrl);

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.path,
            method: 'GET',
            headers: {
                'User-Agent': 'OpenHeaders-Preprocessor/1.0',
                'Accept': getAcceptHeader(resourceType),
                'Accept-Encoding': 'gzip, deflate, br'
            },
            timeout: 4000
        };

        const request = http.request(options, (response) => {
            response.on('data', () => {}); // Consume data

            response.on('end', () => {
                if (response.statusCode! >= 200 && response.statusCode! < 400) {
                    resolve();
                } else {
                    reject(new Error(`HTTP ${response.statusCode}`));
                }
            });

            response.on('error', reject);
        });

        request.on('error', reject);
        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });

        request.end();
    });
}

/**
 * Get appropriate Accept header for resource type
 */
function getAcceptHeader(resourceType: string): string {
    const acceptHeaders: Record<string, string> = {
        font: 'font/woff2,font/woff,font/ttf,font/otf,*/*',
        stylesheet: 'text/css,*/*',
        script: 'application/javascript,text/javascript,*/*',
        image: 'image/webp,image/png,image/jpeg,image/*,*/*',
        other: '*/*'
    };
    return acceptHeaders[resourceType] || '*/*';
}

export { preprocessRecordingForSave };
export type { PreprocessorData, PreprocessorRecord, PreprocessorEvent };
