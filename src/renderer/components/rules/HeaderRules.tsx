import { useSources, useWorkspaces, useNavigation, useSettings, useEnvironments } from '../../contexts';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
    Card, 
    Button, 
    Space, 
    Table, 
    Tag, 
    Switch, 
    Popconfirm, 
    Typography,
    Empty,
    Tooltip,
    Alert
} from 'antd';
import { 
    PlusOutlined, 
    EditOutlined, 
    DeleteOutlined,
    CopyOutlined,
    ApiOutlined,
    ExclamationCircleOutlined,
    WarningOutlined,
    EnvironmentOutlined,
    RightCircleTwoTone,
    CopyrightTwoTone
} from '@ant-design/icons';
import UnifiedHeaderModal from './header/unified-modal/UnifiedHeaderModal';
import { showMessage } from '../../utils';
import { 
    createRulesStorage, 
    createRule,
    exportForExtension,
    RULE_TYPES 
} from '../../utils';
import {
    checkRuleActivation,
    getResolvedPreview,
    extractVariablesFromRule
} from '../../utils/validation/environment-variables';

const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('HeaderRules');

const { Title, Text } = Typography;

const HeaderRules = () => {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    
    // Get sources from context
    const { sources } = useSources();
    const { activeWorkspaceId } = useWorkspaces();
    const { settings } = useSettings();
    const envContext = useEnvironments();
    const tutorialMode = settings?.tutorialMode !== undefined ? settings.tutorialMode : true;
    
    // Use ref to always have access to current rules
    const rulesRef = useRef(rules);
    useEffect(() => {
        rulesRef.current = rules;
    }, [rules]);
    
    // Get navigation context
    const { 
        getHighlight, 
        applyHighlight, 
        registerActionHandler, 
        executeAction,
        ACTIONS, 
        TARGETS 
    } = useNavigation();
    
    // Apply highlight when table data changes
    useEffect(() => {
        const highlight = getHighlight(TARGETS.RULES_HEADERS);
        if (highlight && highlight.itemId && rules.length > 0) {
            applyHighlight(TARGETS.RULES_HEADERS, highlight.itemId);
        }
    }, [rules, getHighlight, applyHighlight, TARGETS.RULES_HEADERS]);
    
    // Register action handlers on mount (independent of rules loading)
    useEffect(() => {
        // Register edit action handler
        const unregisterEdit = registerActionHandler(TARGETS.RULES_HEADERS, ACTIONS.EDIT, (itemId) => {
            const rule = rulesRef.current.find(r => r.id === itemId);
            if (rule) {
                setEditingRule(rule);
                setModalVisible(true);
                showMessage('info', `Editing header rule "${rule.headerName}"`);
            }
        });
        
        // Register delete action handler
        const unregisterDelete = registerActionHandler(TARGETS.RULES_HEADERS, ACTIONS.DELETE, async (itemId) => {
            try {
                await handleDeleteRule(itemId);
            } catch (error) {
                log.error('Failed to delete rule:', error);
            }
        });
        
        // Register toggle action handler
        const unregisterToggle = registerActionHandler(TARGETS.RULES_HEADERS, ACTIONS.TOGGLE, async (itemId) => {
            const rule = rulesRef.current.find(r => r.id === itemId);
            if (rule) {
                try {
                    await handleToggleRule(itemId, !rule.isEnabled);
                } catch (error) {
                    log.error('Failed to toggle rule:', error);
                }
            }
        });
        
        // Register create action handler
        const unregisterCreate = registerActionHandler(TARGETS.RULES_HEADERS, ACTIONS.CREATE, () => {
            setEditingRule(null);
            setModalVisible(true);
            showMessage('info', 'Creating new header rule');
        });
        
        return () => {
            unregisterEdit();
            unregisterDelete();
            unregisterToggle();
            unregisterCreate();
        };
    }, []); // Empty dependency array - register only once on mount

    // Load rules on mount
    useEffect(() => {
        loadRules().catch(error => log.error('Failed to load rules:', error));
        
        // Listen for import events
        const handleRulesImported = (event) => {
            log.info('Header rules imported, reloading:', event.detail);
            loadRules().catch(error => log.error('Failed to reload rules:', error));
        };
        
        // Listen for rules update events
        window.addEventListener('rules-updated', handleRulesImported);
        
        // Listen for workspace switches
        const handleWorkspaceSwitch = () => {
            log.info('Workspace switched, reloading rules');
            loadRules().catch(error => log.error('Failed to reload rules:', error));
        };
        
        window.addEventListener('workspace-switched', handleWorkspaceSwitch);
        window.addEventListener('workspace-data-applied', handleWorkspaceSwitch);
        
        return () => {
            window.removeEventListener('rules-updated', handleRulesImported);
            window.removeEventListener('workspace-switched', handleWorkspaceSwitch);
            window.removeEventListener('workspace-data-applied', handleWorkspaceSwitch);
        };
    }, [activeWorkspaceId]);

    // Listen for environment variable changes to update rule states
    useEffect(() => {
        // Force re-render when environment variables change
        const handleEnvChange = () => {
            log.info('Environment variables changed, updating rule states');
            // Force a re-render by updating state
            setRules(currentRules => [...currentRules]);
        };
        
        window.addEventListener('environment-variables-changed', handleEnvChange);
        window.addEventListener('environment-switched', handleEnvChange);
        
        // Also listen to IPC events from main process
        if (window.electronAPI && window.electronAPI.onEnvironmentVariablesChanged) {
            const unsubscribe = window.electronAPI.onEnvironmentVariablesChanged(() => {
                handleEnvChange();
            });
            
            return () => {
                window.removeEventListener('environment-variables-changed', handleEnvChange);
                window.removeEventListener('environment-switched', handleEnvChange);
                if (unsubscribe) unsubscribe();
            };
        }
        
        return () => {
            window.removeEventListener('environment-variables-changed', handleEnvChange);
            window.removeEventListener('environment-switched', handleEnvChange);
        };
    }, []);

    // Load rules from storage
    const loadRules = async () => {
        try {
            setLoading(true);
            let headerRules;
            
            // Add small delay to ensure workspace data is written
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Load from workspace-specific rules.json
            const rulesPath = `workspaces/${activeWorkspaceId}/rules.json`;
            log.debug(`Loading rules from: ${rulesPath}`);
            const rulesData = await window.electronAPI.loadFromStorage(rulesPath);
            if (rulesData) {
                const rulesStorage = JSON.parse(rulesData);
                headerRules = rulesStorage.rules?.[RULE_TYPES.HEADER] || [];
            } else {
                // No data - ensure we have empty rules
                headerRules = [];
            }
            
            setRules(headerRules);
            log.info(`Loaded ${headerRules.length} header rules`);
        } catch (error) {
            log.error('Failed to load header rules:', error);
            showMessage('error', 'Failed to load header rules');
            // On error, ensure we have empty rules
            setRules([]);
        } finally {
            setLoading(false);
        }
    };

    // Save rules to storage and sync to extension
    const saveRules = useCallback(async (newRules) => {
        try {
            // Load existing rules storage or create new one
            let rulesStorage;
            const rulesPath = `workspaces/${activeWorkspaceId}/rules.json`;
            const existingData = await window.electronAPI.loadFromStorage(rulesPath);
            if (existingData) {
                rulesStorage = JSON.parse(existingData);
            } else {
                rulesStorage = createRulesStorage();
            }
            
            // Update header rules
            rulesStorage.rules[RULE_TYPES.HEADER] = newRules;
            rulesStorage.metadata.totalRules = Object.values(rulesStorage.rules)
                .reduce((sum, rules) => sum + rules.length, 0);
            rulesStorage.metadata.lastUpdated = new Date().toISOString();
            
            // Save in new format
            log.debug(`Saving rules to: ${rulesPath}`);
            await window.electronAPI.saveToStorage(rulesPath, JSON.stringify(rulesStorage));
            
            
            setRules(newRules);
            
            // Trigger automatic sync to browser extensions
            // Send new format
            const exportData = exportForExtension(rulesStorage);
            window.electronAPI.updateWebSocketSources({
                type: 'rules-update',
                data: exportData
            });
            
            
            // Dispatch event for other components
            window.dispatchEvent(new CustomEvent('rules-updated', { 
                detail: { rules: rulesStorage } 
            }));
            
            // Update proxy manager with new header rules
            await window.electronAPI.proxyUpdateHeaderRules(newRules);
            
            log.info('Rules saved and automatically synced to browser and proxy');
            return true;
        } catch (error) {
            log.error('Failed to save header rules:', error);
            showMessage('error', 'Failed to save header rules');
            return false;
        }
    }, []);

    // Handle add/edit rule (generic header rule)
    const handleSaveRule = async (ruleData) => {
        try {
            let newRules;
            if (editingRule) {
                // Update existing rule using createRule to ensure proper structure
                const updatedRule = createRule(RULE_TYPES.HEADER, {
                    ...editingRule,
                    ...ruleData,
                    id: editingRule.id,
                    createdAt: editingRule.createdAt,
                    updatedAt: new Date().toISOString()
                });
                newRules = rules.map(rule => 
                    rule.id === editingRule.id ? updatedRule : rule
                );
                showMessage('success', 'Rule updated successfully');
            } else {
                // Add new rule using createRule
                const newRule = createRule(RULE_TYPES.HEADER, ruleData);
                newRules = [...rules, newRule];
                showMessage('success', 'Rule added successfully');
            }
            
            await saveRules(newRules);
            setModalVisible(false);
            setEditingRule(null);
        } catch (error) {
            log.error('Failed to save rule:', error);
            showMessage('error', 'Failed to save rule');
        }
    };

    // Handle add/edit cookie rule

    // Handle delete rule
    const handleDeleteRule = useCallback(async (ruleId) => {
        try {
            // Find the rule to get its name for the message
            const rule = rulesRef.current.find(r => r.id === ruleId);
            const ruleName = rule ? rule.headerName : 'Rule';
            
            const newRules = rulesRef.current.filter(rule => rule.id !== ruleId);
            await saveRules(newRules);
            showMessage('success', `Header rule "${ruleName}" deleted successfully`);
        } catch (error) {
            log.error('Failed to delete rule:', error);
            showMessage('error', 'Failed to delete rule');
        }
    }, []);

    // Handle toggle rule
    const handleToggleRule = useCallback(async (ruleId, enabled) => {
        try {
            const newRules = rulesRef.current.map(rule => 
                rule.id === ruleId ? { ...rule, isEnabled: enabled } : rule
            );
            await saveRules(newRules);
            
            // Find the rule to get its name for the message
            const rule = rulesRef.current.find(r => r.id === ruleId);
            if (rule) {
                showMessage('success', `Header rule "${rule.headerName}" ${enabled ? 'enabled' : 'disabled'}`);
            }
        } catch (error) {
            log.error('Failed to toggle rule:', error);
            showMessage('error', 'Failed to toggle rule');
        }
    }, []);

    // Helper function to truncate long values
    const truncateValue = (value, maxLength = 40) => {
        if (!value || value.length <= maxLength) return value;
        
        const prefixLength = 30;
        const suffixLength = 10;
        
        if (value.length > maxLength) {
            const prefix = value.substring(0, prefixLength);
            const suffix = value.substring(value.length - suffixLength);
            return `${prefix}...${suffix}`;
        }
        
        return value;
    };

    // Get dynamic value info for a rule including environment variable resolution
    const getDynamicValueInfo = (rule) => {
        const result = {
            actualValue: '',
            sourceInfo: '',
            sourceTag: '',
            available: true,
            placeholderType: null,
            hasEnvVars: false,
            envVarInfo: null,
            activationState: 'active',
            missingDependencies: []
        };
        
        // Check environment variable dependencies first
        if (rule.hasEnvVars) {
            result.hasEnvVars = true;
            
            if (envContext.environmentsReady) {
                const variables = envContext.getAllVariables();
                const activation = checkRuleActivation(rule, variables);
                
                result.activationState = activation.activationState || 'active';
                result.missingDependencies = activation.missingVars || [];
                
                if (activation.activationState === 'waiting_for_deps') {
                    result.envVarInfo = {
                        missingVars: activation.missingVars,
                        totalVars: rule.envVars || []
                    };
                    result.placeholderType = 'missing_env_vars';
                    result.available = false;
                }
            } else {
                // Environment not ready, mark as waiting
                result.activationState = 'waiting_for_deps';
                result.missingDependencies = rule.envVars || [];
                result.placeholderType = 'missing_env_vars';
                result.available = false;
            }
        }
        
        if (!rule.isDynamic || !rule.sourceId) {
            // Check if this is an empty static value
            if (!rule.headerValue || !rule.headerValue.trim()) {
                result.actualValue = '[EMPTY_VALUE]';
                result.placeholderType = 'empty_value';
            } else {
                // For static values with env vars, show resolved preview or original if missing deps
                if (rule.hasEnvVars) {
                    if (result.activationState === 'waiting_for_deps') {
                        // Show original template when waiting for dependencies
                        result.actualValue = rule.headerValue;
                    } else if (envContext.environmentsReady) {
                        const variables = envContext.getAllVariables();
                        const preview = getResolvedPreview(rule.headerValue, variables);
                        result.actualValue = preview.text;
                    } else {
                        result.actualValue = rule.headerValue;
                    }
                } else {
                    result.actualValue = rule.headerValue;
                }
            }
            
            return result;
        }

        // Find the source for dynamic values
        const source = sources.find(s => s.sourceId === rule.sourceId);
        
        if (!source) {
            result.actualValue = `[SOURCE_NOT_FOUND:${rule.sourceId}]`;
            result.sourceInfo = `Source #${rule.sourceId} (removed)`;
            result.available = false;
            result.placeholderType = 'source_not_found';
            return result;
        }

        const content = source.sourceContent || '';
        
        if (!content) {
            result.actualValue = `[EMPTY_SOURCE:${rule.sourceId}]`;
            result.sourceInfo = source.sourcePath || `Source #${rule.sourceId}`;
            result.sourceTag = source.sourceTag || '';
            result.placeholderType = 'empty_source';
            return result;
        }

        // Build the actual value with prefix/suffix
        let actualValue = content;
        let prefix = rule.prefix || '';
        let suffix = rule.suffix || '';
        
        // Resolve env vars in prefix/suffix if needed
        if (rule.hasEnvVars && envContext.environmentsReady) {
            const variables = envContext.getAllVariables();
            if (prefix && prefix.includes('{{')) {
                const prefixPreview = getResolvedPreview(prefix, variables);
                prefix = prefixPreview.text;
            }
            if (suffix && suffix.includes('{{')) {
                const suffixPreview = getResolvedPreview(suffix, variables);
                suffix = suffixPreview.text;
            }
        }
        
        actualValue = `${prefix}${content}${suffix}`;
        
        const sourceType = source.sourceType || '';
        const sourcePath = source.sourcePath || '';
        const displayPath = sourceType.toLowerCase().includes('env') && sourcePath && !sourcePath.startsWith('$')
            ? `$${sourcePath}`
            : sourcePath;

        result.actualValue = actualValue;
        result.sourceInfo = displayPath;
        result.sourceTag = source.sourceTag || '';
        
        return result;
    };

    // Table columns matching browser extension
    const columns = [
        {
            title: 'Type',
            key: 'type',
            width: 180,
            render: (_, record) => {
                const info = getDynamicValueInfo(record);
                
                return (
                    <Space size={4} direction="vertical" align="start">
                        <Space size={4}>
                            {/* Primary type tag */}
                            <Tag
                                color={record.isResponse ? 'blue' : 'green'}
                                style={{ fontSize: '11px', padding: '0 4px' }}
                            >
                                {record.isResponse ? 'RESPONSE' : 'REQUEST'}
                            </Tag>
                            {/* Show if uses environment variables */}
                            {info.hasEnvVars && (
                                <Tag
                                    color="purple"
                                    style={{ fontSize: '11px', padding: '0 4px' }}
                                >
                                    TEMPLATE
                                </Tag>
                            )}
                        </Space>
                        {/* Dependency warning for rules with missing environment variables */}
                        {info.activationState === 'waiting_for_deps' && info.missingDependencies?.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
                                <span style={{ fontSize: '10px', color: '#faad14', fontWeight: 500 }}>
                                    Waiting for:
                                </span>
                                {/* Show first dependency */}
                                <Tag
                                    color="warning"
                                    style={{
                                        fontSize: '9px',
                                        padding: '0 4px',
                                        margin: 0,
                                        borderRadius: 3,
                                        lineHeight: '16px',
                                        height: '16px'
                                    }}
                                >
                                    {info.missingDependencies[0]}
                                </Tag>
                                {/* Show "+X more" tooltip if there are additional dependencies */}
                                {info.missingDependencies.length > 1 && (
                                    <Tooltip title={info.missingDependencies.slice(1).join(', ')}>
                                        <Tag
                                            color="warning"
                                            style={{
                                                fontSize: '9px',
                                                padding: '0 4px',
                                                margin: 0,
                                                borderRadius: 3,
                                                lineHeight: '16px',
                                                height: '16px'
                                            }}
                                        >
                                            +{info.missingDependencies.length - 1} more
                                        </Tag>
                                    </Tooltip>
                                )}
                            </div>
                        )}
                    </Space>
                );
            },
        },
        {
            title: 'Tag',
            dataIndex: 'tag',
            key: 'tag',
            width: 80,
            render: (tag) => tag || '-', // Display dash when no tag is set
        },
        {
            title: 'Source',
            key: 'source',
            width: 200,
            render: (_, record) => {
                const info = getDynamicValueInfo(record);
                
                if (!record.isDynamic) {
                    return (
                        <Text
                            style={{
                                fontSize: '12px',
                                color: '#8c8c8c',
                                opacity: info.activationState === 'waiting_for_deps' ? 0.5 : 1
                            }}
                        >
                            Static value
                        </Text>
                    );
                }
                
                // Find the source to get its type
                const source = sources.find(s => s.sourceId === record.sourceId);
                const sourceType = source?.sourceType || 'unknown';
                
                // Prepare display value based on source type
                let displayValue = info.sourceInfo || '';
                let label = '';
                
                if (sourceType === 'http') {
                    label = 'URL';
                    // Remove protocol for display
                    displayValue = displayValue.replace(/^https?:\/\//, '');
                    // Truncate if too long
                    if (displayValue.length > 25) {
                        displayValue = displayValue.substring(0, 25) + '...';
                    }
                } else if (sourceType === 'file') {
                    label = 'FILE';
                    // Show just filename for files
                    const parts = displayValue.split(/[\\\/]/);
                    displayValue = parts[parts.length - 1] || displayValue;
                    // Truncate if too long
                    if (displayValue.length > 20) {
                        displayValue = displayValue.substring(0, 20) + '...';
                    }
                } else if (sourceType === 'env') {
                    label = 'ENV';
                    // Truncate if too long
                    if (displayValue.length > 20) {
                        displayValue = displayValue.substring(0, 20) + '...';
                    }
                } else {
                    label = sourceType.toUpperCase();
                }
                
                return (
                    <Space size={4} wrap>
                        <Tag style={{ fontSize: '11px', margin: 0 }}>
                            ID: {record.sourceId}
                        </Tag>
                        <Tooltip title={info.sourceInfo}>
                            <Tag style={{ fontSize: '11px', margin: 0, cursor: 'help' }}>
                                {label}: {displayValue || 'N/A'}
                            </Tag>
                        </Tooltip>
                    </Space>
                );
            },
        },
        {
            title: 'Header Name',
            dataIndex: 'headerName',
            key: 'headerName',
            width: 160,
            sorter: (a, b) => a.headerName.localeCompare(b.headerName),
            render: (text, record) => {
                const info = getDynamicValueInfo(record);
                const hasPlaceholder = info.placeholderType && record.isEnabled;
                
                // Check if header name has env vars
                let headerNameDisplay = text;
                if (record.hasEnvVars && record.headerName && record.headerName.includes('{{')) {
                    if (info.activationState === 'waiting_for_deps') {
                        // Show original template when waiting for dependencies
                        headerNameDisplay = record.headerName;
                    } else if (envContext.environmentsReady) {
                        const variables = envContext.getAllVariables();
                        const preview = getResolvedPreview(record.headerName, variables);
                        headerNameDisplay = preview.text;
                    }
                }

                // For cookie rules, show cookie name if available
                const isCookieRule = record.headerName === 'Cookie' || record.headerName === 'Set-Cookie';
                if (isCookieRule && record.cookieName) {
                    headerNameDisplay = `${headerNameDisplay} (${record.cookieName})`;
                }

                return (
                    <Space align="center">
                        <Text 
                            strong 
                            style={{ 
                                fontSize: '13px',
                                opacity: info.activationState === 'waiting_for_deps' ? 0.5 : 1
                            }}
                        >
                            {headerNameDisplay}
                        </Text>
                        {isCookieRule && (
                            <Tooltip title="Cookie Rule">
                                <CopyrightTwoTone style={{ fontSize: '14px' }} />
                            </Tooltip>
                        )}
                        {record.hasEnvVars && record.headerName && record.headerName.includes('{{') && (
                            <Tooltip title={`Uses environment variables: ${record.headerName}`}>
                                <EnvironmentOutlined style={{ color: '#1890ff', fontSize: '12px' }} />
                            </Tooltip>
                        )}
                        {hasPlaceholder && info.activationState !== 'waiting_for_deps' && (
                            <Tooltip title="This header is being sent with a diagnostic placeholder value">
                                <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: '12px' }} />
                            </Tooltip>
                        )}
                    </Space>
                );
            },
        },
        {
            title: 'Value',
            dataIndex: 'headerValue',
            key: 'value',
            width: 200,
            render: (_, record) => {
                const info = getDynamicValueInfo(record);
                const hasPlaceholder = info.placeholderType;

                let tooltipMessage = null;
                let textColor = undefined;
                let icon = null;

                if (hasPlaceholder && info.activationState !== 'waiting_for_deps') {
                    switch (info.placeholderType) {
                        case 'source_not_found':
                            tooltipMessage = `Sending '[SOURCE_NOT_FOUND:${record.sourceId}]' because the source was deleted`;
                            textColor = "danger";
                            icon = <WarningOutlined style={{ marginRight: 4 }} />;
                            break;
                        case 'empty_source':
                            tooltipMessage = `Sending '[EMPTY_SOURCE:${record.sourceId}]' because the source value is empty`;
                            textColor = "secondary";
                            icon = <ExclamationCircleOutlined style={{ marginRight: 4 }} />;
                            break;
                        case 'empty_value':
                            tooltipMessage = "Sending '[EMPTY_VALUE]' because the header value is empty";
                            textColor = "secondary";
                            icon = <ExclamationCircleOutlined style={{ marginRight: 4 }} />;
                            break;
                    }
                }

                const displayValue = truncateValue(info.actualValue);
                
                // Only show tooltip for error/warning messages, not for truncated values
                if (tooltipMessage) {
                    return (
                        <Tooltip title={tooltipMessage}>
                            <Text
                                type={textColor}
                                style={{
                                    display: 'block',
                                    fontSize: '13px',
                                    fontFamily: hasPlaceholder ? 'monospace' : 'inherit',
                                    opacity: record.isEnabled && info.activationState !== 'waiting_for_deps' ? 1 : 0.5,
                                    wordBreak: 'break-all'
                                }}
                            >
                                {icon}
                                {displayValue}
                            </Text>
                        </Tooltip>
                    );
                }
                
                return (
                    <Text
                        type={textColor}
                        style={{
                            display: 'block',
                            fontSize: '13px',
                            fontFamily: hasPlaceholder ? 'monospace' : 'inherit',
                            opacity: record.isEnabled && info.activationState !== 'waiting_for_deps' ? 1 : 0.5,
                            wordBreak: 'break-all'
                        }}
                    >
                        {icon}
                        {displayValue}
                    </Text>
                );
            },
        },
        {
            title: 'Domains',
            dataIndex: 'domains',
            key: 'domains',
            width: 140,
            sorter: (a, b) => a.domains.join(',').localeCompare(b.domains.join(',')),
            render: (domains, record) => {
                // Check if rule has missing dependencies
                const info = getDynamicValueInfo(record);
                const hasMissingDeps = info.activationState === 'waiting_for_deps';
                
                // Resolve domains with env vars if needed
                let resolvedDomains = domains;
                let hasUnresolvedVars = false;
                
                if (record.hasEnvVars && envContext.environmentsReady) {
                    const variables = envContext.getAllVariables();
                    resolvedDomains = domains.flatMap(domain => {
                        if (domain && domain.includes('{{')) {
                            const preview = getResolvedPreview(domain, variables);
                            // Check if domain has unresolved variables
                            if (preview.text.includes('{{') && preview.text.includes('}}')) {
                                hasUnresolvedVars = true;
                                return domain; // Return original domain if unresolved
                            }
                            // Split comma-separated domains from resolved env vars
                            return preview.text.split(',').map(d => d.trim()).filter(d => d);
                        }
                        return domain;
                    });
                } else if (!envContext.environmentsReady) {
                    // Environment not ready, keep original domains
                    hasUnresolvedVars = domains.some(d => d && d.includes('{{'));
                }
                
                return (
                    <Space direction="vertical" size={1}>
                        {resolvedDomains.slice(0, 1).map((domain, index) => {
                            const isTruncated = domain.length > 18;
                            const displayDomain = isTruncated ? `${domain.substring(0, 18)}...` : domain;
                            const isUnresolved = domain.includes('{{') && domain.includes('}}');
                            
                            return isTruncated ? (
                                <Tooltip key={`${domain}-${index}`} title={domain}>
                                    <Tag 
                                        color={isUnresolved ? 'warning' : undefined}
                                        style={{ fontSize: '12px', cursor: 'help' }}
                                    >
                                        {displayDomain}
                                    </Tag>
                                </Tooltip>
                            ) : (
                                <Tag 
                                    key={`${domain}-${index}`} 
                                    color={isUnresolved ? 'warning' : undefined}
                                    style={{ fontSize: '12px' }}
                                >
                                    {displayDomain}
                                </Tag>
                            );
                        })}
                        {resolvedDomains.length > 1 && (
                            <Tooltip title={resolvedDomains.slice(1).join(', ')}>
                                <Tag style={{ fontSize: '11px' }}>+{resolvedDomains.length - 1} more</Tag>
                            </Tooltip>
                        )}
                    </Space>
                );
            },
        },
        {
            title: 'Status',
            key: 'status',
            width: 80,
            align: 'center',
            render: (_, record) => {
                const info = getDynamicValueInfo(record);
                const isWaitingForDeps = info.activationState === 'waiting_for_deps';
                
                return (
                    <Tooltip title={isWaitingForDeps ? 'Cannot enable - missing environment variables' : undefined}>
                        <Switch
                            checked={record.isEnabled && !isWaitingForDeps}
                            onChange={(checked) => handleToggleRule(record.id, checked)}
                            size="small"
                            disabled={isWaitingForDeps}
                        />
                    </Tooltip>
                );
            }
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 120,
            align: 'center',
            fixed: 'right',
            render: (_, record) => {
                const info = getDynamicValueInfo(record);
                
                const handleCopyValue = async () => {
                    try {
                        await navigator.clipboard.writeText(info.actualValue);
                        showMessage('success', 'Value copied to clipboard');
                    } catch (error) {
                        showMessage('error', 'Failed to copy to clipboard');
                    }
                };
                
                return (
                    <Space size={4}>
                        <Tooltip title="Copy value">
                            <Button
                                type="text"
                                icon={<CopyOutlined />}
                                size="small"
                                onClick={handleCopyValue}
                            />
                        </Tooltip>
                        <Tooltip title={
                            (record.headerName === 'Cookie' || record.headerName === 'Set-Cookie') 
                                ? "Edit Cookie rule" 
                                : "Edit Generic rule"
                        }>
                            <Button
                                type="text"
                                icon={<EditOutlined />}
                                size="small"
                                onClick={() => executeAction(TARGETS.RULES_HEADERS, ACTIONS.EDIT, record.id)}
                            />
                        </Tooltip>
                        <Popconfirm
                            title="Delete this rule?"
                            onConfirm={() => executeAction(TARGETS.RULES_HEADERS, ACTIONS.DELETE, record.id)}
                            okText="Yes"
                            cancelText="No"
                        >
                            <Tooltip title="Delete rule">
                                <Button
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    size="small"
                                />
                            </Tooltip>
                        </Popconfirm>
                    </Space>
                );
            }
        }
    ];

    return (
        <div className="header-rules-container">
            <Card>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Title level={4} style={{ margin: 0 }}>
                        <ApiOutlined /> Header Rules
                    </Title>
                    <Button 
                        type="primary" 
                        icon={<PlusOutlined />}
                        onClick={() => {
                            setEditingRule(null);
                            setModalVisible(true);
                        }}
                    >
                        Add Rule
                    </Button>
                </div>

                {tutorialMode && (
                    <Alert
                        message="Header Rules"
                        description={
                            <div>
                                <div>Header rules allow you to modify HTTP request and response headers for specific domains.</div>
                                <div style={{marginTop: 8}}>
                                    Headers can have static values or dynamic values from sources
                                </div>
                                <div style={{marginTop: 8}}>
                                    Rules are automatically synced with the browser extension and applied in real-time
                                </div>
                            </div>
                        }
                        type="info"
                        showIcon
                        closable
                        style={{marginBottom: 16}}
                    />
                )}

                <Table
                    dataSource={rules}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    scroll={{ x: 1000, y: 280 }}
                    size="small"
                    locale={{
                        emptyText: (
                            <Empty
                                description="No header rules yet"
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                            >
                                <Button 
                                    type="primary" 
                                    icon={<PlusOutlined />}
                                    onClick={() => {
                                        setEditingRule(null);
                                        setModalVisible(true);
                                    }}
                                >
                                    Add Your First Rule
                                </Button>
                            </Empty>
                        )
                    }}
                />
            </Card>

            <UnifiedHeaderModal
                visible={modalVisible}
                onCancel={() => {
                    setModalVisible(false);
                    setEditingRule(null);
                }}
                onSave={handleSaveRule}
                initialValues={editingRule}
            />
        </div>
    );
};

export default HeaderRules;