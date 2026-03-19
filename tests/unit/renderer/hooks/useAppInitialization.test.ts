// @vitest-environment jsdom
/**
 * Tests for useAppInitialization hook
 *
 * Validates version fetching and record opening IPC listener.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

const mockConvertNewRecordingFormat = vi.fn((record: unknown) => record);
vi.mock('../../../../src/renderer/utils/formatters/recordConverter', () => ({
  convertNewRecordingFormat: (record: unknown) => mockConvertNewRecordingFormat(record),
}));

type RecordCallback = (data: Record<string, unknown>) => void;

const mockGetAppVersion = vi.fn();
let capturedRecordCallback: RecordCallback | null = null;
const mockUnsubscribeRecord = vi.fn();

Object.defineProperty(window, 'electronAPI', {
  value: {
    getAppVersion: mockGetAppVersion,
    onOpenRecordRecording: vi.fn((cb: RecordCallback) => {
      capturedRecordCallback = cb;
      return mockUnsubscribeRecord;
    }),
  },
  writable: true,
});

import { useAppInitialization } from '../../../../src/renderer/hooks/app/useAppInitialization';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAppInitialization', () => {
  const mockSetAppVersion = vi.fn();
  const mockSetActiveTab = vi.fn();
  const mockSetCurrentRecord = vi.fn();

  beforeEach(() => {
    capturedRecordCallback = null;
    mockGetAppVersion.mockReset();
    mockSetAppVersion.mockClear();
    mockSetActiveTab.mockClear();
    mockSetCurrentRecord.mockClear();
    mockConvertNewRecordingFormat.mockClear();
    mockUnsubscribeRecord.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches app version on mount', async () => {
    mockGetAppVersion.mockResolvedValue('2.12.0');

    renderHook(() => useAppInitialization({
      setAppVersion: mockSetAppVersion,
      setActiveTab: mockSetActiveTab,
      setCurrentRecord: mockSetCurrentRecord,
    }));

    // Wait for async version fetch
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockGetAppVersion).toHaveBeenCalled();
    expect(mockSetAppVersion).toHaveBeenCalledWith('2.12.0');
  });

  it('handles version fetch failure gracefully', async () => {
    mockGetAppVersion.mockRejectedValue(new Error('IPC error'));

    renderHook(() => useAppInitialization({
      setAppVersion: mockSetAppVersion,
      setActiveTab: mockSetActiveTab,
      setCurrentRecord: mockSetCurrentRecord,
    }));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Should not throw, should not call setAppVersion
    expect(mockSetAppVersion).not.toHaveBeenCalled();
  });

  it('registers record opening listener', () => {
    renderHook(() => useAppInitialization({
      setAppVersion: mockSetAppVersion,
      setActiveTab: mockSetActiveTab,
      setCurrentRecord: mockSetCurrentRecord,
    }));

    expect(capturedRecordCallback).not.toBeNull();
  });

  it('opens record when IPC event fires', () => {
    const recordData = { id: 'rec-1', events: [] };
    mockConvertNewRecordingFormat.mockReturnValue({ id: 'rec-1', events: [], converted: true });

    renderHook(() => useAppInitialization({
      setAppVersion: mockSetAppVersion,
      setActiveTab: mockSetActiveTab,
      setCurrentRecord: mockSetCurrentRecord,
    }));

    act(() => {
      capturedRecordCallback!({ record: recordData });
    });

    expect(mockSetActiveTab).toHaveBeenCalledWith('record-viewer');
    expect(mockConvertNewRecordingFormat).toHaveBeenCalledWith(recordData);
    expect(mockSetCurrentRecord).toHaveBeenCalledWith({ id: 'rec-1', events: [], converted: true });
  });

  it('unsubscribes record listener on unmount', () => {
    const { unmount } = renderHook(() => useAppInitialization({
      setAppVersion: mockSetAppVersion,
      setActiveTab: mockSetActiveTab,
      setCurrentRecord: mockSetCurrentRecord,
    }));

    unmount();

    expect(mockUnsubscribeRecord).toHaveBeenCalledTimes(1);
  });
});
