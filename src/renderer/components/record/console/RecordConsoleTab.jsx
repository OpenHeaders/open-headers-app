/**
 * RecordConsoleTab Component
 * 
 * Refactored console logs display component with improved modularity
 * Uses shared hooks and components for consistent behavior
 * 
 * @param {Object} props - Component props
 * @param {Object} props.record - The record containing console logs
 * @param {string} props.viewMode - Current view mode
 * @param {number} props.activeTime - Current playback time for highlighting
 * @param {boolean} props.autoHighlight - Whether to enable auto-highlighting
 */
import React, { useState } from 'react';
import { Table, Tag, Typography, theme, Empty, App, Button, Tooltip } from 'antd';
import { SearchOutlined, ClearOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { formatConsoleArg } from '../../../utils';
import { useSearchFilter } from '../shared/useSearchFilter';
import { useTimeHighlight } from '../shared/useTimeHighlight';
import SearchOverlay from '../shared/SearchOverlay';
import TimestampCell from '../shared/TimestampCell';
import ConsoleLogModal from './ConsoleLogModal';
import { createSearchableColumnHeader, createStandardTableProps, createCopyButton, createViewButton, createTimestampColumn } from '../shared';

const { Text } = Typography;

const RecordConsoleTab = ({ record, viewMode, activeTime, autoHighlight = false }) => {
    const { token } = theme.useToken();
    const { message: messageApi } = App.useApp();

    // Modal state
    const [consoleModalVisible, setConsoleModalVisible] = useState(false);
    const [selectedConsoleLog, setSelectedConsoleLog] = useState(null);
    
    // Filter state
    const [consoleLevelFilter, setConsoleLevelFilter] = useState([]);

    // Search functionality
    const searchFilter = useSearchFilter();
    
    // Time-based highlighting
    const timeHighlight = useTimeHighlight(record, viewMode, activeTime, autoHighlight);

    // Early return if no console logs
    if (!record?.console?.length) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    /**
     * Show detailed console log modal
     */
    const showConsoleModal = (timestamp, level, message) => {
        setSelectedConsoleLog({ timestamp, level, message });
        setConsoleModalVisible(true);
    };

    /**
     * Extract searchable fields from console record
     */
    const extractSearchableFields = (consoleRecord) => {
        const message = consoleRecord.args.map(arg => formatConsoleArg(arg)).join(' ');
        return [message];
    };

    /**
     * Render console log message with actions
     */
    const renderMessage = (args, consoleRecord) => {
        const message = args.map(arg => formatConsoleArg(arg)).join(' ');
        const needsExpansion = message.length > 150;
        const displayMessage = needsExpansion ? message.substring(0, 150) + '...' : message;

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                <Text
                    code
                    style={{
                        fontSize: '12px',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0
                    }}
                >
                    {displayMessage}
                </Text>
                
                <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                    {createCopyButton(message, () => messageApi.success('Copied to clipboard'))}
                    
                    {needsExpansion && createViewButton(
                        () => showConsoleModal(consoleRecord.timestamp, consoleRecord.level, message),
                        'View full message'
                    )}
                </div>
            </div>
        );
    };

    /**
     * Render log level tag
     */
    const renderLevel = (level) => (
        <Tag color={
            level === 'error' ? 'error' :
            level === 'warn' ? 'warning' :
            level === 'info' ? 'blue' :
            level === 'debug' ? 'purple' : 'default'
        }>
            {level.toUpperCase()}
        </Tag>
    );

    // Table columns configuration
    const columns = [
        {
            ...createTimestampColumn(
                (timestamp, consoleRecord) => (
                    <TimestampCell
                        timestamp={timestamp}
                        record={record}
                        isCurrentEntry={timeHighlight.isCurrentEntry(consoleRecord, record.console)}
                        width={100}
                    />
                ),
                120
            )
        },
        {
            title: 'Level',
            dataIndex: 'level',
            key: 'level',
            width: 100,
            filters: [
                { text: 'LOG', value: 'log' },
                { text: 'INFO', value: 'info' },
                { text: 'WARN', value: 'warn' },
                { text: 'ERROR', value: 'error' },
                { text: 'DEBUG', value: 'debug' }
            ],
            filteredValue: consoleLevelFilter,
            onFilter: (value, record) => record.level === value,
            sorter: (a, b) => a.level.localeCompare(b.level),
            render: renderLevel
        },
        {
            title: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>Message</span>
                    {searchFilter.searchValue && !searchFilter.inverseFilter && (
                        <Tooltip title="Search filter is active">
                            <Tag 
                                icon={<InfoCircleOutlined />}
                                color="blue" 
                                style={{ 
                                    fontSize: '10px', 
                                    margin: 0, 
                                    padding: '0 4px', 
                                    height: '16px', 
                                    lineHeight: '16px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '2px'
                                }}
                            />
                        </Tooltip>
                    )}
                    {searchFilter.searchValue && searchFilter.inverseFilter && (
                        <Tooltip title="Inverse filter is active - hiding messages that match the search">
                            <Tag 
                                color="red" 
                                style={{ 
                                    fontSize: '10px', 
                                    margin: 0, 
                                    padding: '0 4px', 
                                    height: '16px', 
                                    lineHeight: '16px' 
                                }}
                            >
                                !
                            </Tag>
                        </Tooltip>
                    )}
                    <Tooltip title={searchFilter.searchValue ? 
                        `Searching: "${searchFilter.searchValue}"${searchFilter.inverseFilter ? ' (inverse)' : ''}` : 
                        "Search all messages"
                    }>
                        <Button
                            type="text"
                            size="small"
                            icon={<SearchOutlined />}
                            onClick={(e) => {
                                e.stopPropagation();
                                searchFilter.toggleSearch();
                            }}
                            style={{
                                minWidth: 'auto',
                                padding: '0 4px',
                                height: '20px',
                                color: searchFilter.searchValue ? 
                                    (searchFilter.inverseFilter ? '#ff4d4f' : '#1890ff') : 
                                    '#8c8c8c'
                            }}
                        />
                    </Tooltip>
                    {searchFilter.searchValue && (
                        <Tooltip title="Clear all filters">
                            <Button
                                type="text"
                                size="small"
                                icon={<ClearOutlined />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    searchFilter.clearSearch();
                                }}
                                style={{
                                    minWidth: 'auto',
                                    padding: '0 4px',
                                    height: '20px',
                                    color: '#ff4d4f'
                                }}
                            />
                        </Tooltip>
                    )}
                </div>
            ),
            dataIndex: 'args',
            key: 'args',
            filteredValue: searchFilter.searchValue ? [searchFilter.searchValue] : null,
            onFilter: searchFilter.createFilterFunction(extractSearchableFields),
            render: renderMessage
        }
    ];

    // Format table data with unique keys
    const tableData = record.console
        .slice()
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((item, index) => ({
            ...item,
            key: `console-${item.timestamp}-${index}`
        }));

    // Table change handler
    const handleTableChange = (pagination, filters) => {
        setConsoleLevelFilter(filters.level || []);
    };

    // Row class name generator
    const generateRowClassName = (consoleRecord) => {
        const baseClass = `console-${consoleRecord.level}`;
        return timeHighlight.getRowClassName(consoleRecord, record.console, baseClass);
    };

    // Complete table props
    const tableProps = createStandardTableProps(
        tableData,
        columns,
        handleTableChange,
        generateRowClassName
    );

    return (
        <>
            <SearchOverlay
                visible={searchFilter.searchVisible}
                searchValue={searchFilter.searchValue}
                onSearchChange={searchFilter.updateSearchValue}
                onClose={searchFilter.hideSearch}
                placeholder="Search all messages"
                showInverseFilter={true}
                inverseFilter={searchFilter.inverseFilter}
                onInverseFilterChange={searchFilter.toggleInverseFilter}
            />

            <div style={{ padding: '16px', height: '100%', boxSizing: 'border-box', position: 'relative' }}>
                <Table {...tableProps} />
            </div>

            <ConsoleLogModal
                visible={consoleModalVisible}
                selectedLog={selectedConsoleLog}
                record={record}
                onClose={() => setConsoleModalVisible(false)}
                messageApi={messageApi}
            />
        </>
    );
};

export default RecordConsoleTab;