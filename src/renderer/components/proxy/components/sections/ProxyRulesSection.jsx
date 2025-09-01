import React, { useState } from 'react';
import { Card, Space, Typography, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ProxyRuleTableModular } from '../tables';
import { ProxyRuleFormModular } from '../forms';

const { Title } = Typography;

/**
 * ProxyRulesSection - Complete proxy rules management section
 * 
 * Integrated component that combines proxy rule table display with rule creation/editing
 * functionality. Manages the modal state for rule forms and coordinates between table
 * and form components for a seamless user experience.
 * 
 * Features:
 * - Proxy rules table with full management capabilities
 * - Add new rule button with modal form integration
 * - Edit existing rules with pre-populated form data
 * - Delete rules with confirmation dialogs
 * - Rule enable/disable toggle functionality
 * - Seamless integration between table and form components
 * 
 * State Management:
 * - Modal visibility for rule creation/editing forms
 * - Currently editing rule data for form initialization
 * - Automatic form reset when switching between create/edit modes
 * 
 * Integration Points:
 * - Uses ProxyRuleTable for rule display and basic operations
 * - Uses ProxyRuleForm for rule creation and editing modals
 * - Coordinates with parent component callbacks for actual data operations
 * - Passes through all necessary props for rule and source management
 * 
 * Technical Notes:
 * - Manages modal state internally to reduce parent component complexity
 * - Provides clean separation between display and editing functionality
 * - Handles both creation and editing workflows with proper form initialization
 * 
 * @param {Array} rules - Current proxy rules
 * @param {Array} sources - Available sources for dynamic header values
 * @param {Array} headerRules - Available header rules for reference mode
 * @param {function} onSaveRule - Callback for rule save operations
 * @param {function} onDeleteRule - Callback for rule deletion
 * @param {function} onToggleRule - Callback for rule enable/disable
 * @returns {JSX.Element} Complete proxy rules management section
 */
const ProxyRulesSection = ({
    rules,
    sources,
    headerRules,
    onSaveRule,
    onDeleteRule,
    onToggleRule
}) => {
    const [modalVisible, setModalVisible] = useState(false);
    const [editingRule, setEditingRule] = useState(null);

    /**
     * Handle add new rule action
     * Resets editing state and opens modal for creation
     */
    const handleAddRule = () => {
        setEditingRule(null);
        setModalVisible(true);
    };

    /**
     * Handle edit existing rule action
     * Sets the rule to edit and opens modal for editing
     */
    const handleEditRule = (rule) => {
        setEditingRule(rule);
        setModalVisible(true);
    };

    /**
     * Handle rule save operation
     * Delegates to parent callback and closes modal on success
     */
    const handleSaveRule = async (rule) => {
        const success = await onSaveRule(rule);
        if (success) {
            setModalVisible(false);
            setEditingRule(null);
        }
    };

    /**
     * Handle modal cancel action
     * Closes modal and resets editing state
     */
    const handleCancel = () => {
        setModalVisible(false);
        setEditingRule(null);
    };

    return (
        <>
            <Card style={{ marginTop: '16px' }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Title level={4} style={{ margin: 0 }}>Proxy Rules</Title>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleAddRule}
                        >
                            Add Rule
                        </Button>
                    </div>

                    <ProxyRuleTableModular
                        rules={rules}
                        sources={sources}
                        headerRules={headerRules}
                        onEdit={handleEditRule}
                        onDelete={onDeleteRule}
                        onToggle={onToggleRule}
                        onAdd={handleAddRule}
                    />
                </Space>
            </Card>

            <ProxyRuleFormModular
                visible={modalVisible}
                rule={editingRule}
                sources={sources}
                headerRules={headerRules}
                onCancel={handleCancel}
                onSave={handleSaveRule}
            />
        </>
    );
};

export default ProxyRulesSection;