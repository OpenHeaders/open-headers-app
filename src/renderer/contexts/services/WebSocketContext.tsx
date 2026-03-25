/**
 * WebSocketContext — syncs source config changes to ws-service via IPC.
 *
 * Content fetching is now handled by the main-process SourceRefreshService.
 * This context only broadcasts source CONFIG changes (add/remove/rename/filter)
 * to keep ws-service in sync for the extension popup UI.
 */

import React, { createContext, useEffect, useRef } from 'react';
import { useSources } from '../../hooks/workspace';
import timeManager from '../../services/TimeManager';
import { createLogger } from '../../utils/error-handling/logger';
import { getCentralizedWorkspaceService } from '../../services/CentralizedWorkspaceService';
import type { Source } from '../../../types/source';

const WebSocketContext = createContext({});
const log = createLogger('WebSocketContext');

type CleanedSource = Pick<Source,
    'sourceId' | 'sourceType' | 'sourcePath' | 'sourceTag' |
    'sourceContent' | 'sourceMethod' | 'jsonFilter' | 'isFiltered' | 'filteredWith'
>;

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
    const { sources, shouldSuppressBroadcast } = useSources();
    const prevSourcesRef = useRef<Source[]>([]);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastBroadcastTimeRef = useRef(0);

    const haveSourcesChanged = (prevSources: Source[], currentSources: Source[]): boolean => {
        if (prevSources.length !== currentSources.length) return true;

        for (const currentSource of currentSources) {
            const prevSource = prevSources.find(s => s.sourceId === currentSource.sourceId);
            if (!prevSource) return true;
            if (prevSource.sourceContent !== currentSource.sourceContent) return true;

            const fields = ['sourceTag', 'sourcePath', 'sourceType', 'isFiltered', 'filteredWith'] as const;
            for (const field of fields) {
                if (prevSource[field] !== currentSource[field]) return true;
            }

            if (prevSource.jsonFilter?.enabled !== currentSource.jsonFilter?.enabled ||
                prevSource.jsonFilter?.path !== currentSource.jsonFilter?.path) {
                return true;
            }
        }
        return false;
    };

    useEffect(() => {
        if (!sources || !Array.isArray(sources) || !window.electronAPI?.updateWebSocketSources) return;

        const workspaceService = getCentralizedWorkspaceService();
        const isWorkspaceSwitching = workspaceService?.getState?.()?.isWorkspaceSwitching || false;

        if (isWorkspaceSwitching) {
            prevSourcesRef.current = JSON.parse(JSON.stringify(sources));
            return;
        }

        if (!haveSourcesChanged(prevSourcesRef.current, sources)) return;

        if (shouldSuppressBroadcast && shouldSuppressBroadcast(sources)) {
            prevSourcesRef.current = JSON.parse(JSON.stringify(sources));
            return;
        }

        // Debounce rapid changes
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        const now = timeManager.now();
        const timeSinceLastBroadcast = now - lastBroadcastTimeRef.current;
        const debounceTime = timeSinceLastBroadcast < 2000 ? 500 : 100;

        debounceTimerRef.current = setTimeout(() => {
            const cleanedSources: CleanedSource[] = sources.map(source => ({
                sourceId: source.sourceId,
                sourceType: source.sourceType,
                sourcePath: source.sourcePath,
                sourceTag: source.sourceTag,
                sourceContent: source.sourceContent,
                sourceMethod: source.sourceMethod,
                ...(source.jsonFilter?.enabled ? { jsonFilter: { enabled: source.jsonFilter.enabled, path: source.jsonFilter.path } } : {}),
                ...(source.isFiltered ? { isFiltered: true, filteredWith: source.filteredWith } : {})
            }));

            log.info(`Broadcasting ${cleanedSources.length} sources to main process`);
            window.electronAPI.updateWebSocketSources(cleanedSources);
            lastBroadcastTimeRef.current = timeManager.now();
            debounceTimerRef.current = null;
        }, debounceTime);

        prevSourcesRef.current = JSON.parse(JSON.stringify(sources));

        return () => {
            if (!sources || sources.length === 0) {
                if (debounceTimerRef.current) {
                    clearTimeout(debounceTimerRef.current);
                    debounceTimerRef.current = null;
                }
            }
        };
    }, [sources, shouldSuppressBroadcast]);

    return (
        <WebSocketContext.Provider value={{}}>
            {children}
        </WebSocketContext.Provider>
    );
}
