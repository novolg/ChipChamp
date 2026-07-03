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
    expect(chipColumnDiff(cols, cols)).toEqual([]);
  });

  it('reports only the newly-added discs on top of an unchanged prefix', () => {
    const prev = chipColumns(100); // [[100]]
    const next = chipColumns(200); // [[100, 100]]
    expect(chipColumnDiff(prev, next)).toEqual([{ col: 0, row: 1, denom: 100 }]);
  });

  it('reports every disc as added when growing from empty', () => {
    const next = chipColumns(35); // [[25],[10]]
    expect(chipColumnDiff([], next)).toEqual([
      { col: 0, row: 0, denom: 25 },
      { col: 1, row: 0, denom: 10 },
    ]);
  });

  it('re-adds a whole column when a denom composition shift breaks the prefix match', () => {
    // 100 -> [[100]]; 141 -> [[100],[25],[10,5,1]] (a NEW third column appears).
    const prev = chipColumns(100);
    const next = chipColumns(141);
    expect(chipColumnDiff(prev, next)).toEqual([
      { col: 1, row: 0, denom: 25 },
      { col: 2, row: 0, denom: 10 },
      { col: 2, row: 1, denom: 5 },
      { col: 2, row: 2, denom: 1 },
    ]);
  });
});
