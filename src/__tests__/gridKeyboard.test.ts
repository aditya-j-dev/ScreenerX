import { describe, expect, it } from 'vitest';
import {
  getGridKeyboardAction,
  getNextFocusRegionIndex,
  getViewportRowCount,
  moveGridIndex,
} from '../lib/gridKeyboard';

describe('grid keyboard navigation', () => {
  it.each([
    ['?', false, 'toggle-help'],
    ['ArrowDown', false, 'move-row-down'],
    ['ArrowUp', false, 'move-row-up'],
    ['ArrowRight', false, 'move-column-right'],
    ['ArrowLeft', false, 'move-column-left'],
    ['Home', false, 'first-row'],
    ['End', false, 'last-row'],
    ['PageDown', false, 'page-down'],
    ['PageUp', false, 'page-up'],
    ['Enter', false, 'open-chart'],
    [' ', false, 'toggle-watchlist'],
    ['Tab', false, 'focus-next-region'],
    ['Tab', true, 'focus-previous-region'],
  ])('maps %s to %s', (key, shiftKey, expected) => {
    expect(getGridKeyboardAction(key, shiftKey)).toBe(expected);
  });

  it('ignores unsupported keys', () => {
    expect(getGridKeyboardAction('Escape')).toBeNull();
  });

  it('moves rows and columns without leaving their valid range', () => {
    expect(moveGridIndex(0, -1, 5000)).toBe(0);
    expect(moveGridIndex(0, 1, 5000)).toBe(1);
    expect(moveGridIndex(4999, 1, 5000)).toBe(4999);
  });

  it('calculates a one-viewport page movement from fixed row height', () => {
    expect(getViewportRowCount(560, 36)).toBe(15);
    expect(getViewportRowCount(10, 36)).toBe(1);
  });

  it('cycles focus forward and backward across filter, grid, and chart regions', () => {
    expect(getNextFocusRegionIndex(0, false, 3)).toBe(1);
    expect(getNextFocusRegionIndex(2, false, 3)).toBe(0);
    expect(getNextFocusRegionIndex(0, true, 3)).toBe(2);
  });
});
