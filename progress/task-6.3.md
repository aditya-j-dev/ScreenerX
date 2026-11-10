# Task 6.3 — Accessibility

Implemented:

- Filter controls retain accessible names; the Filters trigger exposes its expanded state and dialog relationship.
- Filter dialog focuses its close control, traps Tab/Shift+Tab, closes with Escape, restores trigger focus, and makes the background inert while open.
- Result counts announce politely and atomically even when filters are closed. Grid descriptions use the actual universe count.
- Virtualized grid headers and cells expose logical column positions; the header exposes row position 1. Active-descendant references only point at mounted cells.
- Column options open with Shift+F10 or the Context Menu key, focus their action, and restore focus after dismissal.
- Chart opening retains its existing focus transfer. The page offers a skip link to the grid.
- Charts expose a text summary of the selected timeframe and latest OHLCV, selected timeframe buttons expose pressed state, and canvas internals are hidden from screen readers.
- Drawing tools support Enter to start/save, arrow keys to adjust, and Escape to cancel. Focus returns to the initiating tool.
- Shared focus-visible styling and reduced-motion styles cover controls and animations; chart reveal respects reduced-motion scrolling.
- Selected timeframe background changed to emerald-700 so white text meets the 4.5:1 target.

Checks:

- Accessibility regressions cover filter control names, modal focus wrapping/restoration, result announcements, chart focus, grid positions, column menus, chart text/state, and keyboard drawing.
- All 47 relevant UI tests passed in the full-suite run. TypeScript and lint passed without warnings.
- Full suite: 280 passed, 4 failed. The four failures are existing real WebSocket client/server tests blocked by localhost connection permissions (`connect EACCES 127.0.0.1`); they do not exercise these accessibility changes. They remain unverified in this environment.
- Calculated sRGB contrast samples using installed Tailwind colors: selected timeframe 5.48:1; muted text on panel 7.11:1; muted text on selected row 6.01:1; positive change on selected row 7.88:1; negative change on selected row 5.48:1.
- Existing row-oriented test/audit selectors now exclude the indexed header row.

Limits: no live browser accessibility audit, rendered-state contrast sweep, or NVDA/VoiceOver session was performed. These code/test checks do not establish full WCAG 2.1 AA conformance. Keyboard chart drawing starts at the middle candle; the summary provides the latest candle rather than a full historical data table.

Next: Task 6.4 — Responsive Design; then Task 6.5 — Performance Report Document.
