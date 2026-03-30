/**
 * Auto-Refresh Card Component
 *
 * Provides interface for configuring automatic request refresh settings
 * with preset and custom interval options.
 *
 * Features:
 * - Toggle for enabling/disabling auto-refresh
 * - Preset interval selection (1min - 12hrs)
 * - Custom interval input with validation
 * - Real-time state synchronization
 *
 * @component
 * @since 3.0.0
 */

import type { FormInstance } from 'antd';
import { Card, Col, Form, Input, InputNumber, Radio, Row, Select, Space, Switch } from 'antd';


/**
 * Auto-Refresh card component for refresh configuration
 *
 *  props - Component props
 *  props.refreshEnabled - Current refresh enabled state
 *  props.handleRefreshToggle - Refresh toggle handler
 *  props.refreshType - Current refresh type (preset/custom)
 *  props.handleRefreshTypeChange - Refresh type change handler
 *  props.customInterval - Current custom interval value
 *  props.handlePresetIntervalChange - Preset interval change handler
 *  props.handleCustomIntervalChange - Custom interval change handler
 *  props.form - Form instance for field access
 *  Auto-refresh card component
 */
interface AutoRefreshCardProps {
  refreshEnabled: boolean;
  handleRefreshToggle: (checked: boolean) => void;
  refreshType: string;
  handleRefreshTypeChange: (e: { target: { value?: string } }) => void;
  customInterval: number;
  handlePresetIntervalChange: (value: number) => void;
  handleCustomIntervalChange: (value: number | null) => void;
  form: FormInstance;
}

const AutoRefreshCard = ({
  refreshEnabled,
  handleRefreshToggle,
  refreshType,
  handleRefreshTypeChange,
  customInterval,
  handlePresetIntervalChange,
  handleCustomIntervalChange,
  form,
}: AutoRefreshCardProps) => {
  return (
    <Card
      size="small"
      title="Auto-Refresh"
      extra={
        <Form.Item name={['refreshOptions', 'enabled']} valuePropName="checked" noStyle>
          <Switch
            size="small"
            checkedChildren="On"
            unCheckedChildren="Off"
            onChange={handleRefreshToggle}
            checked={refreshEnabled}
          />
        </Form.Item>
      }
    >
      {(refreshEnabled || !!form.getFieldValue(['refreshOptions', 'enabled'])) && (
        <Row gutter={[8, 8]}>
          <Col span={24}>
            <Form.Item name={['refreshOptions', 'type']} initialValue="preset" style={{ marginBottom: 8 }}>
              <Radio.Group onChange={handleRefreshTypeChange} value={refreshType} size="small">
                <Radio value="preset">Preset</Radio>
                <Radio value="custom">Custom</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
          <Col span={24}>
            {refreshType === 'preset' || form.getFieldValue(['refreshOptions', 'type']) === 'preset' ? (
              <Form.Item name={['refreshOptions', 'interval']} initialValue={15} style={{ marginBottom: 0 }}>
                <Select
                  onChange={handlePresetIntervalChange}
                  size="small"
                  options={[
                    { value: 1, label: 'Every 1 minute' },
                    { value: 5, label: 'Every 5 minutes' },
                    { value: 15, label: 'Every 15 minutes' },
                    { value: 30, label: 'Every 30 minutes' },
                    { value: 60, label: 'Every hour' },
                    { value: 120, label: 'Every 2 hours' },
                  ]}
                />
              </Form.Item>
            ) : (
              <Form.Item name={['refreshOptions', 'interval']} initialValue={15} style={{ marginBottom: 0 }}>
                <Space.Compact style={{ width: '100%' }}>
                  <InputNumber
                    min={1}
                    max={10080}
                    value={customInterval}
                    onChange={handleCustomIntervalChange}
                    size="small"
                    style={{ width: '100%' }}
                  />
                  <Input value="minutes" disabled style={{ width: 80, textAlign: 'center', pointerEvents: 'none' }} />
                </Space.Compact>
              </Form.Item>
            )}
          </Col>
        </Row>
      )}
    </Card>
  );
};

export default AutoRefreshCard;
