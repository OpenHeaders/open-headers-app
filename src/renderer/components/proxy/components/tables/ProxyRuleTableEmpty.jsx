import React from 'react';
import { Empty, Button, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const { Text } = Typography;

/**
 * ProxyRuleTableEmpty - Empty state component for proxy rules table
 * 
 * Displays appropriate empty state content when no proxy rules exist.
 * Provides call-to-action for creating the first rule when applicable.
 * 
 * Features:
 * - Contextual empty state message
 * - Optional "Add Your First Rule" button
 * - Fallback message when no add callback is provided
 * - Consistent styling with Ant Design Empty component
 * 
 * @param {function|undefined} onAdd - Optional callback for adding first rule
 * @returns {JSX.Element} Empty state component
 */
const ProxyRuleTableEmpty = ({ onAdd }) => (
    <Empty
        description="No proxy rules yet"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
    >
        {onAdd ? (
            <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={onAdd}
            >
                Add Your First Rule
            </Button>
        ) : (
            <Text type="secondary">
                Click "Add Rule" above to create proxy rules
            </Text>
        )}
    </Empty>
);

export default ProxyRuleTableEmpty;