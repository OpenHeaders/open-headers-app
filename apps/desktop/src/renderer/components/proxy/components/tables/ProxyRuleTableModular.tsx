import { Table } from 'antd';
import { createAllColumns, type HeaderRule, type ProxyRule, type ProxySource } from './ProxyRuleTableColumns';
import ProxyRuleTableEmpty from './ProxyRuleTableEmpty';

/**
 * ProxyRuleTable - Modular display and management table for proxy rules
 *
 * Refactored proxy rules table using modular column definitions and empty state.
 * Maintains all original functionality while improving maintainability through
 * component separation and cleaner architecture.
 *
 * Architecture:
 * - Column definitions extracted to ProxyRuleTableColumns
 * - Empty state extracted to ProxyRuleTableEmpty
 * - Core table logic remains focused in this component
 * - Clean separation between presentation and business logic
 *
 * Features:
 * - Tabular display of all proxy rules with status indicators
 * - Differentiated display for custom headers vs header rule references
 * - Domain pattern display with truncation and tooltip support
 * - Header information display with dynamic value source indication
 * - Inline rule enable/disable toggle switches
 * - Edit and delete actions with confirmation dialogs
 * - Empty state with call-to-action for first rule creation
 *
 * Rule Type Indicators:
 * - Link icon (🔗): Header rule reference
 * - Edit icon (✏️): Custom header rule
 *
 * Data Display:
 * - Rule name and enable/disable status
 * - Domain patterns (truncated with "more" indicator)
 * - Header name and value (static or dynamic source)
 * - Action buttons for edit/delete operations
 *
 * Technical Notes:
 * - Resolves header rule references to display inherited information
 * - Handles domain inheritance from referenced header rules
 * - Implements responsive design with column width management
 * - Uses popconfirm for destructive delete operations
 *
 *  rules - Array of proxy rule objects
 *  sources - Available sources for dynamic value display
 *  headerRules - Available header rules for reference resolution
 *  onEdit - Callback when edit button is clicked
 *  onDelete - Callback when delete is confirmed
 *  onToggle - Callback when rule is enabled/disabled
 *  onAdd - Callback when "Add First Rule" button is clicked
 *  Proxy rules management table
 */
interface ProxyRuleTableProps {
  rules: ProxyRule[];
  sources: ProxySource[];
  headerRules?: HeaderRule[];
  onEdit: (rule: ProxyRule) => void;
  onDelete: (ruleId: string) => Promise<boolean>;
  onToggle: (ruleId: string, enabled: boolean) => void;
  onAdd: () => void;
}

const ProxyRuleTable = ({
  rules,
  sources,
  headerRules = [],
  onEdit,
  onDelete,
  onToggle,
  onAdd,
}: ProxyRuleTableProps) => {
  // Create columns with all dependencies
  const columns = createAllColumns(sources, headerRules, onEdit, onDelete, onToggle);

  return (
    <Table
      dataSource={rules}
      columns={columns}
      rowKey="id"
      pagination={false}
      locale={{
        emptyText: <ProxyRuleTableEmpty onAdd={onAdd} />,
      }}
    />
  );
};

export default ProxyRuleTable;
