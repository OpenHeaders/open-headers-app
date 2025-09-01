/**
 * CircuitBreakerIndicator Component
 * 
 * Displays the circuit breaker state for HTTP sources with auto-refresh.
 * Shows when auto-refresh is paused due to repeated failures and allows
 * users to understand the current state and manually retry if needed.
 */

import React from 'react';
import { Tooltip, Tag, Badge } from 'antd';
import { 
  ExclamationCircleOutlined, 
  ClockCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined 
} from '@ant-design/icons';

/**
 * CircuitBreakerIndicator - Shows circuit breaker state in the UI
 * 
 * @param {Object} props
 * @param {Object} props.circuitBreaker - Circuit breaker status from RefreshManager
 * @param {boolean} props.showDetails - Whether to show detailed information
 * @returns {JSX.Element|null} Circuit breaker indicator or null if not applicable
 */
const CircuitBreakerIndicator = ({ circuitBreaker, showDetails = true }) => {
  if (!circuitBreaker) {
    return null;
  }

  const { state, isOpen, timeUntilNextAttempt, consecutiveOpenings, failureCount } = circuitBreaker;

  // Don't show indicator for closed circuit with no failures
  if (state === 'CLOSED' && failureCount === 0) {
    return null;
  }

  // Determine display properties based on state
  const getStateDisplay = () => {
    switch (state) {
      case 'CLOSED':
        if (failureCount > 0) {
          return {
            color: 'warning',
            icon: <WarningOutlined />,
            text: `${failureCount} failure${failureCount > 1 ? 's' : ''}`,
            tooltip: `Circuit breaker has recorded ${failureCount} failure${failureCount > 1 ? 's' : ''}. Will open after ${3 - failureCount} more.`
          };
        }
        return {
          color: 'success',
          icon: <CheckCircleOutlined />,
          text: 'Healthy',
          tooltip: 'Auto-refresh is working normally'
        };

      case 'OPEN':
        return {
          color: 'error',
          icon: <ExclamationCircleOutlined />,
          text: timeUntilNextAttempt ? `Paused (${timeUntilNextAttempt})` : 'Paused',
          tooltip: `Auto-refresh temporarily disabled after ${consecutiveOpenings} consecutive failure${consecutiveOpenings > 1 ? 's' : ''}. ${
            timeUntilNextAttempt 
              ? `Will retry in ${timeUntilNextAttempt}.` 
              : 'Retrying soon.'
          } You can still refresh manually.`
        };

      case 'HALF_OPEN':
        return {
          color: 'warning',
          icon: <ClockCircleOutlined spin />,
          text: 'Testing...',
          tooltip: 'Testing if the service has recovered'
        };

      default:
        return null;
    }
  };

  const display = getStateDisplay();
  if (!display) {
    return null;
  }

  // Simple indicator (for table rows)
  if (!showDetails) {
    return (
      <Tooltip title={display.tooltip}>
        <Badge 
          status={display.color === 'error' ? 'error' : display.color === 'warning' ? 'warning' : 'success'} 
          text={display.text}
        />
      </Tooltip>
    );
  }

  // Detailed indicator (for expanded views)
  return (
    <div className="circuit-breaker-indicator" style={{ marginTop: 8 }}>
      <Tooltip title={display.tooltip}>
        <Tag 
          color={display.color} 
          icon={display.icon}
          style={{ fontSize: '12px' }}
        >
          Auto-refresh: {display.text}
        </Tag>
      </Tooltip>
      
      {state === 'OPEN' && consecutiveOpenings > 1 && (
        <div style={{ 
          fontSize: '11px', 
          color: '#666', 
          marginTop: 4,
          marginLeft: 20 
        }}>
          {getBackoffExplanation(consecutiveOpenings)}
        </div>
      )}
    </div>
  );
};

/**
 * Get human-readable explanation of exponential backoff
 */
function getBackoffExplanation(openings) {
  if (openings <= 1) return null;
  
  const examples = [
    { openings: 2, text: 'Wait time doubled to 1 minute' },
    { openings: 3, text: 'Wait time increased to 2 minutes' },
    { openings: 4, text: 'Wait time increased to 4 minutes' },
    { openings: 5, text: 'Wait time increased to 8 minutes' },
    { openings: 6, text: 'Wait time increased to 16 minutes' },
    { openings: 7, text: 'Wait time increased to 32 minutes' },
    { openings: 8, text: 'Wait time capped at 1 hour' }
  ];
  
  const match = examples.find(e => e.openings === openings);
  return match ? match.text : `Wait time increased (${openings} consecutive failures)`;
}

/**
 * CircuitBreakerStatus - Inline status for source tables
 * Shows a compact indicator that can be used in table cells
 */
export const CircuitBreakerStatus = ({ refreshStatus }) => {
  if (!refreshStatus?.circuitBreaker || !refreshStatus.circuitBreaker.isOpen) {
    return null;
  }

  const { timeUntilNextAttempt } = refreshStatus.circuitBreaker;

  return (
    <Tooltip 
      title="Auto-refresh is temporarily paused due to repeated failures. Click refresh to try manually."
      placement="top"
    >
      <span style={{ 
        color: '#ff4d4f', 
        fontSize: '11px',
        marginLeft: 8 
      }}>
        <ExclamationCircleOutlined style={{ marginRight: 4 }} />
        Auto-refresh paused
        {timeUntilNextAttempt && ` (${timeUntilNextAttempt})`}
      </span>
    </Tooltip>
  );
};

export default CircuitBreakerIndicator;