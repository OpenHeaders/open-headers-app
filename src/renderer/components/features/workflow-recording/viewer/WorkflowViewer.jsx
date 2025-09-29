/**
 * Main workflow viewer component
 * Handles workflow record display, playback, and interactions
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Spin } from 'antd';

import { useSettings } from '../../../../contexts';
import { useRecordPlayer } from '../../../../hooks/useRecordPlayer';
import { RecordPlayer } from '../../../record';
import WorkflowViewerTabs from './WorkflowViewerTabs';
import {
  createAutoScrollHandler,
  createHighlightHandlers
} from './WorkflowViewerUtils';
import { VIEW_MODES, AUTO_SCROLL_CONFIG, TAB_KEYS } from './WorkflowViewerTypes';
import '../../../../styles/RecordViewer.css';

/**
 * WorkflowViewer component
 * @param {Object} props - Component props
 * @param {Object} props.record - External record data
 * @param {Function} props.onRecordChange - Record change handler
 * @param {string} props.viewMode - Current view mode
 * @param {number} props.playbackTime - Current playback time
 * @param {Function} props.onPlaybackTimeChange - Playback time change handler
 * @param {boolean} props.autoHighlight - External auto-highlight state
 * @param {Function} props.onAutoHighlightChange - External auto-highlight change handler
 * @returns {React.ReactNode} Rendered workflow viewer
 */
const WorkflowViewer = ({
                          record: externalRecord,
                          onRecordChange,
                          viewMode,
                          playbackTime,
                          onPlaybackTimeChange,
                          autoHighlight: externalAutoHighlight,
                          onAutoHighlightChange: externalOnAutoHighlightChange,
                          showAllWorkflowsButton,
                          onShowAllWorkflows
                        }) => {
  const { settings } = useSettings();

  // Internal state
  const [internalRecord, setInternalRecord] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Refs for component lifecycle and scroll management
  const lastActiveTimeRef = useRef(-1);
  const scrollTimeoutRef = useRef(null);
  const isScrollingRef = useRef(false);
  const activeTabRef = useRef(TAB_KEYS.CONSOLE);
  const previousRecordIdRef = useRef(null);
  const isMountedRef = useRef(true);

  // Auto-highlight state management
  const [internalAutoHighlight, setInternalAutoHighlight] = useState(
      settings?.autoHighlightTableEntries !== undefined ? settings.autoHighlightTableEntries : false
  );
  const autoHighlight = externalAutoHighlight !== undefined ? externalAutoHighlight : internalAutoHighlight;
  const setAutoHighlight = externalOnAutoHighlightChange || setInternalAutoHighlight;

  // Auto-scroll state
  const [autoScroll, setAutoScroll] = useState(
      settings?.autoScrollTableEntries !== undefined ? settings.autoScrollTableEntries : false
  );

  // Record management
  const record = externalRecord !== undefined ? externalRecord : internalRecord;
  const setRecord = (newRecord) => {
    if (onRecordChange) {
      onRecordChange(newRecord);
    } else {
      setInternalRecord(newRecord);
    }
  };

  // Playback time management
  const activeTime = playbackTime !== undefined ? playbackTime : currentTime;

  // Record player hook
  const {
    rrwebPlayer,
    loading: playerLoading,
    error: playerError,
    processRecordForProxy,
    createConsoleOverrides
  } = useRecordPlayer();

  // Auto-scroll handler
  const performAutoScroll = useCallback(createAutoScrollHandler(), []);

  // Highlight handlers
  const { handleAutoHighlightChange } = createHighlightHandlers(setAutoHighlight, setAutoScroll);

  // Reset autoScroll when new record is loaded
  useEffect(() => {
    const currentRecordId = record?.metadata?.recordId;

    if (currentRecordId && currentRecordId !== previousRecordIdRef.current) {
      setAutoScroll(settings?.autoScrollTableEntries !== undefined ? settings.autoScrollTableEntries : false);
      previousRecordIdRef.current = currentRecordId;
    }
  }, [record?.metadata?.recordId, settings?.autoScrollTableEntries]);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && autoHighlight && activeTime >= 0 && viewMode === VIEW_MODES.TABS) {
      if (isScrollingRef.current) {
        return;
      }

      const isFirstRender = lastActiveTimeRef.current === -1;
      const timeDiff = Math.abs(activeTime - lastActiveTimeRef.current);
      const shouldAutoScroll = isFirstRender || timeDiff > AUTO_SCROLL_CONFIG.TIME_DIFF_THRESHOLD;

      if (shouldAutoScroll) {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        isScrollingRef.current = true;

        scrollTimeoutRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;

          performAutoScroll();
          const resetTimeout = setTimeout(() => {
            if (isMountedRef.current) {
              isScrollingRef.current = false;
            }
          }, AUTO_SCROLL_CONFIG.SCROLL_RESET_DELAY);

          if (!isMountedRef.current) {
            clearTimeout(resetTimeout);
          }
        }, AUTO_SCROLL_CONFIG.ANIMATION_DELAY);
      }

      lastActiveTimeRef.current = activeTime;
    }
  }, [activeTime, viewMode, autoScroll, autoHighlight, performAutoScroll]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }


      lastActiveTimeRef.current = -1;
      isScrollingRef.current = false;
    };
  }, []);


  // Playback handlers
  const handlePlaybackTimeChange = useCallback((time) => {
    setCurrentTime(time);
    if (onPlaybackTimeChange) {
      onPlaybackTimeChange(time);
    }
  }, [onPlaybackTimeChange]);

  const handlePlayingStateChange = useCallback(() => {
    // Handle playing state changes if needed
  }, []);

  const handleTabChange = useCallback((key) => {
    activeTabRef.current = key;
  }, []);

  // Early return if no record and not in a valid view mode
  if (!record) {
    return null;
  }

  if (!rrwebPlayer && !playerError) {
    return (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
          <p style={{ marginTop: '20px' }}>Loading record player...</p>
        </div>
    );
  }

  if (playerError) {
    return (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>Failed to load record player: {playerError}</p>
        </div>
    );
  }

  // Render based on view mode
  switch (viewMode) {
    case VIEW_MODES.INFO:
      return (
          <RecordPlayer
              record={record}
              rrwebPlayer={rrwebPlayer}
              loading={playerLoading}
              onPlaybackTimeChange={handlePlaybackTimeChange}
              processRecordForProxy={processRecordForProxy}
              createConsoleOverrides={createConsoleOverrides}
              onPlayingStateChange={handlePlayingStateChange}
              autoHighlight={autoHighlight}
              showAllWorkflowsButton={showAllWorkflowsButton}
              onShowAllWorkflows={onShowAllWorkflows}
          />
      );

    case VIEW_MODES.TABS:
      return (
          <WorkflowViewerTabs
              record={record}
              viewMode={viewMode}
              activeTime={activeTime}
              autoHighlight={autoHighlight}
              autoScroll={autoScroll}
              onAutoHighlightChange={handleAutoHighlightChange}
              onAutoScrollChange={setAutoScroll}
              onTabChange={handleTabChange}
          />
      );

    default:
      return null;
  }
};

export default WorkflowViewer;