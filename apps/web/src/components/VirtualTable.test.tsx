// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import VirtualTable, { type ColumnDef } from './VirtualTable';

interface TestItem {
  id: number;
  name: string;
}

const columns: ColumnDef<TestItem>[] = [
  { key: 'id', header: 'ID', width: '80px' },
  { key: 'name', header: 'Name' },
];

function makeItems(count: number): TestItem[] {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
}

function renderRow(item: TestItem, _index: number) {
  return (
    <div data-testid={`row-${item.id}`} style={{ display: 'flex' }}>
      <span>{item.id}</span>
      <span>{item.name}</span>
    </div>
  );
}

describe('VirtualTable', () => {
  beforeEach(() => {
    // Mock requestIdleCallback
    vi.stubGlobal('requestIdleCallback', vi.fn((cb: () => void) => {
      const id = setTimeout(cb, 0);
      return id;
    }));
    vi.stubGlobal('cancelIdleCallback', vi.fn((id: number) => clearTimeout(id)));
  });

  it('renders only visible rows plus overscan', () => {
    const items = makeItems(200);
    const rowHeight = 40;
    const overscan = 10;

    // Mock container height of 400px → 10 visible rows
    const { container } = render(
      <VirtualTable
        data={items}
        rowHeight={rowHeight}
        overscan={overscan}
        columns={columns}
        renderRow={renderRow}
      />,
    );

    // Before ResizeObserver fires, containerHeight is 0 via clientHeight in jsdom.
    // With containerHeight=0 and scrollTop=0:
    // startIndex = max(0, floor(0/40) - 10) = 0
    // endIndex = min(200, ceil((0+0)/40) + 10) = 10
    // So we expect at most overscan rows rendered (10)
    const rows = container.querySelectorAll('[role="row"][aria-rowindex]');
    // Subtract 1 for the header row
    const dataRows = Array.from(rows).filter(
      (r) => r.getAttribute('aria-rowindex') !== '1',
    );

    expect(dataRows.length).toBeLessThanOrEqual(overscan + 10);
    expect(dataRows.length).toBeGreaterThan(0);

    // Total items count should be reflected in aria-rowcount
    const table = container.querySelector('[role="table"]');
    expect(table).toHaveAttribute('aria-rowcount', '200');
  });

  it('handles empty data gracefully', () => {
    const { container } = render(
      <VirtualTable
        data={[]}
        rowHeight={40}
        columns={columns}
        renderRow={renderRow}
      />,
    );

    // Should have the header row but no data rows
    const table = container.querySelector('[role="table"]');
    expect(table).toBeInTheDocument();
    expect(table).toHaveAttribute('aria-rowcount', '0');

    // Only the header row should be present
    const dataRows = container.querySelectorAll('[data-testid^="row-"]');
    expect(dataRows.length).toBe(0);
  });

  it('applies correct absolute positioning with translateY', () => {
    const items = makeItems(5);
    const rowHeight = 50;

    const { container } = render(
      <VirtualTable
        data={items}
        rowHeight={rowHeight}
        overscan={10}
        columns={columns}
        renderRow={renderRow}
      />,
    );

    // Check that each rendered row has the correct transform
    const dataRows = container.querySelectorAll('[role="rowgroup"] > [role="row"]');
    dataRows.forEach((row, i) => {
      const style = (row as HTMLElement).style;
      expect(style.position).toBe('absolute');
      expect(style.transform).toBe(`translateY(${i * rowHeight}px)`);
      expect(style.height).toBe(`${rowHeight}px`);
      expect(style.width).toBe('100%');
    });
  });

  it('uses inset-inline-start for RTL compatibility', () => {
    const items = makeItems(3);

    const { container } = render(
      <VirtualTable
        data={items}
        rowHeight={40}
        columns={columns}
        renderRow={renderRow}
      />,
    );

    const dataRows = container.querySelectorAll('[role="rowgroup"] > [role="row"]');
    dataRows.forEach((row) => {
      const style = (row as HTMLElement).style;
      expect(style.insetInlineStart).toBe('0px');
    });
  });

  it('renders column headers from column definitions', () => {
    render(
      <VirtualTable
        data={makeItems(3)}
        rowHeight={40}
        columns={columns}
        renderRow={renderRow}
      />,
    );

    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('sets total container height based on data length and rowHeight', () => {
    const items = makeItems(100);
    const rowHeight = 40;

    const { container } = render(
      <VirtualTable
        data={items}
        rowHeight={rowHeight}
        columns={columns}
        renderRow={renderRow}
      />,
    );

    const rowgroup = container.querySelector('[role="rowgroup"]');
    expect((rowgroup as HTMLElement).style.height).toBe(`${100 * rowHeight}px`);
  });

  it('defaults overscan to 10 when not specified', () => {
    const items = makeItems(100);
    const rowHeight = 40;

    // containerHeight will be 0 in jsdom, so:
    // endIndex = min(100, ceil((0+0)/40) + 10) = 10
    const { container } = render(
      <VirtualTable
        data={items}
        rowHeight={rowHeight}
        columns={columns}
        renderRow={renderRow}
      />,
    );

    const dataRows = container.querySelectorAll('[role="rowgroup"] > [role="row"]');
    // With default overscan=10, startIndex=0, endIndex=10 (when containerHeight=0)
    expect(dataRows.length).toBe(10);
  });
});
