# BLMTRM V1 UI/UX, Workflow & Information-Management Audit

Objective: document the objective V1 critique of the terminal's UI/UX, navigation workflow,
and information management, and convert it into a prioritized fix plan.

Scope reviewed: `App.tsx`, `pages/Terminal.tsx`, `lib/workspaceStore.ts`,
`lib/panelRegistry.ts`, and the chrome components `TopBar`, `Sidebar`, `CommandBar`,
`StatusBar`, `TickerTape`, `WorkspacePane`, `TabStrip`, `MobileNav`.

---

## 1. Information Architecture — navigation is defined in 4 places that can drift
The registry (`panelRegistry.ts:72`) is called the authoritative source, but the actual
nav is hardcoded in at least four spots that each must be edited by hand when adding a panel:
- `TopBar.NAV_GROUPS` (`TopBar.tsx:39-82`) — only 12 of 28 views, manually grouped.
- `CommandBar.QUICK_COMMANDS` (`CommandBar.tsx:21-45`) — 21 views, manually listed.
- `TopBar.SYMBOL_VIEWS` (`TopBar.tsx:84-97`) — 12 symbol views, manually listed.
- `panelRegistry.showInTopBar` (`panelRegistry.ts`) — the real flag.

The TopBar grouping (MARKET/MACRO/INTEL color coding) exists nowhere else — the Sidebar
and CommandBar are uncategorized, so the mental model breaks between surfaces.

### Concrete bugs from this duplication
- `quote` vs `qr` alias collision (`panelRegistry.ts:93` `"QR"` and `:303` `"QR"`): both
  register `QR`. `VIEW_ALIASES` is built by `flatMap` in registry order, so `qr` (Quote
  Recap) wins and `quote` cannot be reached by its own alias.
- `quote` and `intel` both render `IntelPanel` (`panelRegistry.ts:94` & `:200`) — two
  registry entries, one component, one hidden from the top bar. Dead/confusing redundancy.
- Keyboard shortcut collision: `screener` kbd `"S"` (`:137`) and `sectors` kbd `"S"` (`:376`).
  Pressing `S` in the Sidebar is ambiguous.
- `agent` is `needsSymbol: true` (`:125`) but the AI agent is global; forcing a symbol
  context on it is wrong, and it is `showInTopBar:false` yet only reachable via command bar.

## 2. Workflows — tab sprawl, confused "active symbol", no quick symbol switch
- No tab cap + unbounded persistence (`workspaceStore.ts:58-76`): every symbol+view opens a
  new tab unless identical; tabs are persisted across sessions with no limit. Reload keeps
  them all. `TabStrip` hides itself at <=1 tab (`TabStrip.tsx:24`), so the feature is
  invisible until already cluttered.
- Three competing notions of "current symbol": `activePane.symbol` (`Terminal.tsx:64`,
  derived from the focused pane's active tab), `secondarySymbol` (store default `"AAPL"`,
  only used by `ensureSecondary`), and per-tab `symbol`. Global->symbol view falls back to
  `activePane.symbol || "AAPL"` (`Terminal.tsx:104`); the TopBar "ACTIVE" pill reflects the
  derived one, which may not match user intent.
- No inline symbol switcher. Only ways to change to a NEW symbol: command bar (`AAPL DES`)
  or ticker-tape click. The TopBar symbol dropdown (`TopBar.tsx:230`) lists only functions
  for the CURRENT symbol — you cannot type a new ticker there.
- Global views replace the tab; symbol views append. Reasonable, but inconsistent
  discoverability (TabStrip appears/disappears).

## 3. Information Management — freshness and density
- Per-panel data staleness is invisible. StatusBar shows a global LIVE/DOWN + latency
  (`StatusBar.tsx:36-46`) — good — but no panel shows its OWN last-updated time. A quote 1
  min old vs 1 hour old is a different decision; the user cannot tell which.
- Ticker tape is a constant CPU repaint (`TickerTape.tsx:18-28`): `requestAnimationFrame`
  scroll at 0.6px/frame forever, and it RESETS to 0 on every `quotes` change, stuttering
  whenever data refreshes. Auto-scrolling marquees also hurt scannability/screenshots.
- 28 panels, zero saved layouts/presets. No "Macro desk" or "Single-name deep dive"
  workspace. For a PERSONAL tracker, saved multi-pane layouts are the core info-management
  win and are missing.
- Command-bar `Tab` fills a display label, not the raw command (`CommandBar.tsx:208-222`):
  it injects e.g. `"AAPL STOCK INTELLIGENCE"` back into the input and relies on
  `parseTerminalCommand` re-parsing that human string — fragile parser/display coupling.

## 4. Visual / Responsive
- 8-9px fonts with `tracking-[0.12em]` everywhere (e.g. `Sidebar.tsx:31`,
  `TabStrip.tsx:52`) — dense Bloomberg feel, but near-illegible and eye-straining for
  sustained use. Lots of `muted-foreground/30-/50` low-contrast text.
- Mobile is effectively read-only (`MobileNav.tsx:10`): only the first 5 of 28 views show,
  cap is arbitrary — `portfolio`, `economics`, `chart`, `agent` unreachable on mobile. The
  StatusBar (clock/LIVE/latency) is also dropped on mobile in favor of the nav bar.

---

## Prioritized Fix Plan

### P1 — Single source of truth for navigation
**Milestone: TopBar + Sidebar + CommandBar + symbol menu all derive from `panelRegistry`.**
- [ ] Add `category` (`market`|`macro`|`intel`|`symbol`) and `shortcut` fields to
  `PanelDefinition` (`panelRegistry.ts`); remove `NAV_GROUPS`/`SYMBOL_VIEWS` hardcoded lists.
- [ ] Generate TopBar groups, Sidebar rail, CommandBar quick commands, and the symbol
  dropdown from the registry. Eliminate the 4-place duplication.
- [ ] De-duplicate `quote`/`intel` (keep one entry, or make `quote` an alias of `intel`) and
  resolve the `QR` alias collision; validate aliases are unique at startup.
- [ ] Fix the `S` shortcut collision; audit all `kbd` for duplicates.
- [ ] Make `agent` global (`needsSymbol:false`).

### P2 — Workspace / tab workflow
**Milestone: tabs stay manageable and the "active symbol" is unambiguous.**
- [ ] Add a tab cap (e.g. 12) with LRU eviction; do not persist the entire growing pile —
  persist only the focused-symbol context or a "session" the user names.
- [ ] Collapse the three symbol notions into one `activeSymbol` in the store, updated
  explicitly on navigation; remove the `|| "AAPL"` fallback surprise.
- [ ] Add an inline `SYM:` quick-switch (command bar or TopBar field) to jump to any ticker
  without a verb.
- [ ] Keep global-view-replaces / symbol-view-appends behavior, but make TabStrip always
  visible (or show a "+" affordance) for discoverability.

### P3 — Information management & data freshness
**Milestone: every panel shows its own freshness; layouts are savable.**
- [ ] Wire the existing `DataStatusBadge` into panels to show "updated Xs ago" per view.
- [ ] Make the ticker tape pausable / static-on-hover and stop resetting scroll on every
  `quotes` refresh (decouple animation from data updates).
- [ ] Add 2-3 saved layout presets ("Macro Desk", "Single-Name Deep Dive", "Portfolio") with
  named, restorable multi-pane arrangements.
- [ ] Replace the command-bar `Tab`-fills-display-label behavior with raw-command completion.

### P4 — Visual & responsive polish
**Milestone: legible at sustained use; mobile is usable.**
- [ ] Bump base panel text to >=10px; reserve 8-9px for true metadata only; raise
  low-contrast `muted-foreground` ratios.
- [ ] Replace the arbitrary 5-item MobileNav cap with a scrollable / searchable mobile
  navigator; keep the StatusBar (or a compact equivalent) on mobile.

---

## Suggested order
P1 -> P2 -> P3 -> P4. P1 removes the structural debt that makes everything else harder.

## Key reference points
- `src/client/src/lib/panelRegistry.ts` — registry + duplicated alias/shortcut definitions.
- `src/client/src/components/terminal/TopBar.tsx:39,84` — hardcoded NAV_GROUPS / SYMBOL_VIEWS.
- `src/client/src/components/terminal/CommandBar.tsx:21,208` — hardcoded list + label completion.
- `src/client/src/lib/workspaceStore.ts:58,139` — unbounded tab creation + persistence.
- `src/client/src/components/terminal/TickerTape.tsx:18` — rAF scroll reset on data change.
- `src/client/src/components/terminal/MobileNav.tsx:10` — 5-item cap.
- `src/client/src/components/terminal/StatusBar.tsx:36` — global-only freshness.
