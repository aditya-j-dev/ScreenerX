import { describe, expect, it } from 'vitest';
import { clampScrollRowIndex, VIRTUAL_OVERSCAN, VIRTUAL_ROW_HEIGHT } from '../lib/virtualGrid';

describe('virtual grid configuration', () => {
  it('uses the PDF-required 36px fixed row height with the tuned overscan buffer', () => {
    expect(VIRTUAL_ROW_HEIGHT).toBe(36);
    expect(VIRTUAL_OVERSCAN).toBe(10);
  });

  it.each([5000, 10000, 20000])('can target the final row in a %i-row dataset', (rowCount) => {
    expect(clampScrollRowIndex(rowCount - 1, rowCount)).toBe(rowCount - 1);
  });

  it('keeps programmatic scroll targets inside the available row range', () => {
    expect(clampScrollRowIndex(-10, 5000)).toBe(0);
    expect(clampScrollRowIndex(9000, 5000)).toBe(4999);
    expect(clampScrollRowIndex(0, 0)).toBeNull();
  });
});
