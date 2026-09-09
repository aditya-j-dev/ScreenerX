export type GridKeyboardAction =
  | 'toggle-help'
  | 'move-row-down'
  | 'move-row-up'
  | 'move-column-right'
  | 'move-column-left'
  | 'first-row'
  | 'last-row'
  | 'page-down'
  | 'page-up'
  | 'open-chart'
  | 'toggle-watchlist'
  | 'focus-next-region'
  | 'focus-previous-region';

export function getGridKeyboardAction(key: string, shiftKey = false): GridKeyboardAction | null {
  if (key === 'Tab') return shiftKey ? 'focus-previous-region' : 'focus-next-region';
  const actions: Record<string, GridKeyboardAction> = {
    '?': 'toggle-help',
    ArrowDown: 'move-row-down',
    ArrowUp: 'move-row-up',
    ArrowRight: 'move-column-right',
    ArrowLeft: 'move-column-left',
    Home: 'first-row',
    End: 'last-row',
    PageDown: 'page-down',
    PageUp: 'page-up',
    Enter: 'open-chart',
    ' ': 'toggle-watchlist',
  };
  return actions[key] ?? null;
}

export function moveGridIndex(current: number, delta: number, count: number) {
  if (count <= 0) return 0;
  return Math.min(Math.max(current + delta, 0), count - 1);
}

export function getViewportRowCount(viewportHeight: number, rowHeight: number) {
  return Math.max(1, Math.floor(viewportHeight / rowHeight));
}

export function getNextFocusRegionIndex(current: number, shiftKey: boolean, regionCount: number) {
  if (regionCount <= 0) return 0;
  const direction = shiftKey ? -1 : 1;
  return (current + direction + regionCount) % regionCount;
}
