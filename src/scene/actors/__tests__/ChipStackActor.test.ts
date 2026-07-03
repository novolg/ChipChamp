import { describe, it, expect } from 'vitest';
import { chipColumns, chipColumnDiff } from '../ChipStackActor';

describe('chipColumns', () => {
  it('gives each denomination group its own column when there are ≤3', () => {
    expect(chipColumns(235)).toEqual([[100, 100], [25], [10]]);
  });

  it('collapses groups beyond the column cap into the last column', () => {
    // 141 -> breakdown [100x1, 25x1, 10x1, 5x1, 1x1]; col cap 3.
    expect(chipColumns(141)).toEqual([[100], [25], [10, 5, 1]]);
  });

  it('returns no columns for zero', () => {
    expect(chipColumns(0)).toEqual([]);
  });

  it('never exceeds maxCols regardless of how fragmented the breakdown is', () => {
    const cols = chipColumns(141, 3);
    expect(cols.length).toBeLessThanOrEqual(3);
  });

  it('stacks a single large denomination group in one column', () => {
    expect(chipColumns(1000)).toEqual([Array(10).fill(100)]);
  });
});

describe('chipColumnDiff', () => {
  it('is empty when the composition is unchanged', () => {
    const cols = chipColumns(235);
    expect(chipColumnDiff(cols, cols)).toEqual({ added: [], removed: [] });
  });

  it('reports only the newly-added discs on top of an unchanged prefix', () => {
    const prev = chipColumns(100); // [[100]]
    const next = chipColumns(200); // [[100, 100]]
    expect(chipColumnDiff(prev, next)).toEqual({
      added: [{ col: 0, row: 1, denom: 100 }],
      removed: [],
    });
  });

  it('reports every disc as added when growing from empty', () => {
    const next = chipColumns(35); // [[25],[10]]
    expect(chipColumnDiff([], next)).toEqual({
      added: [
        { col: 0, row: 0, denom: 25 },
        { col: 1, row: 0, denom: 10 },
      ],
      removed: [],
    });
  });

  it('adds a whole new column when the prefix is preserved but the breakdown grows wider', () => {
    // 100 -> [[100]]; 141 -> [[100],[25],[10,5,1]]: col0's [100] prefix is
    // preserved (no removals), two new columns appear.
    const prev = chipColumns(100);
    const next = chipColumns(141);
    expect(chipColumnDiff(prev, next)).toEqual({
      added: [
        { col: 1, row: 0, denom: 25 },
        { col: 2, row: 0, denom: 10 },
        { col: 2, row: 1, denom: 5 },
        { col: 2, row: 2, denom: 1 },
      ],
      removed: [],
    });
  });

  it('reports removals on a genuine prefix break (col0 bottom disc changes denom)', () => {
    // The headline corruption case: committed 20 = [[10,10]] raised to
    // 40 = [[25],[10],[5]]. col0's bottom disc changes 10 -> 25, so the greedy
    // breakdown of 40 is NOT a per-column extension of 20 — both existing col0
    // discs must be REMOVED (destroyed), not overwritten in place, and the new
    // [25],[10],[5] discs added. Asserts both the adds and the removal/rebuild.
    const prev = chipColumns(20); // [[10, 10]]
    const next = chipColumns(40); // [[25], [10], [5]]
    expect(prev).toEqual([[10, 10]]);
    expect(next).toEqual([[25], [10], [5]]);
    expect(chipColumnDiff(prev, next)).toEqual({
      added: [
        { col: 0, row: 0, denom: 25 },
        { col: 1, row: 0, denom: 10 },
        { col: 2, row: 0, denom: 5 },
      ],
      removed: [
        { col: 0, row: 0 },
        { col: 0, row: 1 },
      ],
    });
  });

  it('reports a dropped surplus column as removed with no adds', () => {
    // A composition losing a column: the surplus discs must be removed even
    // when nothing is added. 30 = [[25],[5]] -> 25 = [[25]] drops col1.
    const prev = chipColumns(30); // [[25],[5]]
    const next = chipColumns(25); // [[25]]
    expect(prev).toEqual([[25], [5]]);
    expect(chipColumnDiff(prev, next)).toEqual({
      added: [],
      removed: [{ col: 1, row: 0 }],
    });
  });
});
