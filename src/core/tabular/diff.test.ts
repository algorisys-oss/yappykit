import { describe, it, expect } from 'vitest';
import { diffTables } from './diff';
import type { Table } from './parse';

const t = (headers: string[], rows: Record<string, string>[]): Table => ({ headers, rows });

describe('diffTables', () => {
  const before = t(
    ['id', 'name', 'price'],
    [
      { id: '1', name: 'Apple', price: '10' },
      { id: '2', name: 'Banana', price: '5' },
      { id: '3', name: 'Cherry', price: '8' },
    ],
  );
  const after = t(
    ['id', 'name', 'price'],
    [
      { id: '1', name: 'Apple', price: '10' }, // unchanged
      { id: '2', name: 'Banana', price: '6' }, // changed (price)
      { id: '4', name: 'Date', price: '12' }, // added
      // id 3 removed
    ],
  );

  it('classifies added / removed / changed / unchanged', () => {
    const d = diffTables(before, after, 'id');
    expect(d.summary).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 1 });
  });

  it('reports which columns changed', () => {
    const d = diffTables(before, after, 'id');
    const changed = d.rows.find((r) => r.key === '2');
    expect(changed?.status).toBe('changed');
    expect(changed?.changedColumns).toEqual(['price']);
    expect(changed?.cells.price).toBe('6'); // after value wins
  });

  it('merges the column union across both files', () => {
    const d = diffTables(
      t(['id', 'a'], [{ id: '1', a: 'x' }]),
      t(['id', 'b'], [{ id: '1', b: 'y' }]),
      'id',
    );
    expect(d.columns).toEqual(['id', 'a', 'b']);
    // id 1: a went 'x' -> '' and b went '' -> 'y'
    expect(d.rows[0]?.status).toBe('changed');
    expect(new Set(d.rows[0]?.changedColumns)).toEqual(new Set(['a', 'b']));
  });

  it('skips rows with an empty key', () => {
    const d = diffTables(
      t(['id', 'v'], [{ id: '', v: 'x' }, { id: '1', v: 'a' }]),
      t(['id', 'v'], [{ id: '1', v: 'a' }]),
      'id',
    );
    expect(d.summary).toEqual({ added: 0, removed: 0, changed: 0, unchanged: 1 });
  });

  it('treats a later duplicate key as the surviving row', () => {
    const d = diffTables(
      t(['id', 'v'], [{ id: '1', v: 'a' }]),
      t(['id', 'v'], [{ id: '1', v: 'a' }, { id: '1', v: 'b' }]),
      'id',
    );
    const row = d.rows.find((r) => r.key === '1');
    expect(row?.cells.v).toBe('b');
    expect(row?.status).toBe('changed');
  });
});
