/** PDF Task 2.1 virtual-grid constraints, kept separate so they are testable without rendering. */
export const VIRTUAL_ROW_HEIGHT = 36;
// 10 rows (360px) on either side of the viewport prevents fast wheel/touchpad jumps from exposing an empty range
// without keeping 1,850+ extra React components alive in the DOM.
export const VIRTUAL_OVERSCAN = 10;

export function clampScrollRowIndex(index: number, rowCount: number) {
  if (rowCount === 0) return null;
  return Math.min(Math.max(0, index), rowCount - 1);
}
