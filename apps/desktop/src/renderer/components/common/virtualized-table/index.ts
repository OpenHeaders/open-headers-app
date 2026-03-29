/**
 * Virtualized Table Components Package
 * 
 * This package provides high-performance virtualized table components
 * for different use cases in the Open Headers application.
 * 
 * Components:
 * - VirtualizedSimpleTable: Basic virtualized table for simple data display
 * - VirtualizedFilterableTable: Advanced table with filtering and search capabilities
 * 
 * Both components use react-window for efficient rendering of large datasets
 * while maintaining Ant Design styling and functionality.
 * 
 * @module virtualized-table
 * @since 3.0.0
 */

export { default as VirtualizedSimpleTable } from './VirtualizedSimpleTable';
export { default as VirtualizedFilterableTable } from './VirtualizedFilterableTable';