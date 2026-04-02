import type { NetworkRecord, NetworkTimingData, Recording } from '@openheaders/core';
import type { GlobalToken } from 'antd/es/theme/interface';

export type { GlobalToken, NetworkRecord, NetworkTimingData };

/** RecordData is the subset of Recording needed by RecordNetworkTab */
export type RecordData = Pick<Recording, 'network' | 'storage'> & {
  startTime?: number;
  metadata?: {
    startTime?: number;
  };
};
