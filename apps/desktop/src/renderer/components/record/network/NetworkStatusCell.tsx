/**
 * NetworkStatusCell Component
 *
 * Renders the status code cell with appropriate coloring based on HTTP status
 * Handles error states and pending requests
 *
 *  props - Component props
 *  props.status - HTTP status code
 *  props.record - The full network record
 *  props.token - Ant Design theme token
 */

import { Typography } from 'antd';
import type { GlobalToken, NetworkRecord } from './types';

const { Text } = Typography;

interface NetworkStatusCellProps {
  status: number;
  record: NetworkRecord;
  token: GlobalToken;
}
const NetworkStatusCell = ({ status, record, token }: NetworkStatusCellProps) => {
  // Handle error states
  if (record.error) {
    return <Text style={{ color: token.colorError, fontSize: '12px' }}>Failed</Text>;
  }

  // Determine color based on status code
  const getStatusColor = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) return token.colorSuccess;
    if (statusCode >= 300 && statusCode < 400) return token.colorWarning;
    if (statusCode >= 400) return token.colorError;
    return token.colorTextTertiary; // Pending or unknown
  };

  return <Text style={{ color: getStatusColor(status), fontSize: '12px' }}>{status || 'Pending'}</Text>;
};

export default NetworkStatusCell;
