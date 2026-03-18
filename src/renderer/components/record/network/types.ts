import type { GlobalToken } from 'antd/es/theme/interface';

export type { GlobalToken };

export interface NetworkTimingData {
    dns?: number;
    connect?: number;
    ssl?: number;
    waiting?: number;
    download?: number;
}

export interface NetworkRecord {
    id: string;
    url: string;
    method: string;
    status: number;
    timestamp: number;
    endTime?: number;
    duration?: number;
    size?: number;
    responseSize?: number;
    type?: string;
    error?: boolean;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    requestBody?: string | Record<string, unknown>;
    responseBody?: string | Record<string, unknown>;
    key?: string;
    remoteAddress?: string;
    timing?: NetworkTimingData;
    [key: string]: unknown;
}

export interface RecordData {
    network: NetworkRecord[];
    startTime?: number;
    metadata?: {
        startTime: number;
    };
    [key: string]: unknown;
}
