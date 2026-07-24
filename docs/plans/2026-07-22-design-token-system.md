# Design Token System & Chrome Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use godmode:task-runner to implement this plan task-by-task.

**Goal:** Establish a formal design token system and refactor terminal chrome (TopBar, StatusBar, TickerTape, TabStrip, PanelShell) to achieve Bloomberg-grade scannability with 13px base font, monospace numerals, semantic color encoding, and consistent visual hierarchy.

**Architecture:** Refactor in-place on the existing CSS custom property system. Tokens are defined in `index.css` as CSS custom properties, consumed by Tailwind via `hsl(var(...))`. Chrome components get font-size upgrades, semantic color application, and micro-interactions. No new dependencies required.

**Tech Stack:** React 18, Tailwind CSS 3.4, CSS Custom Properties, shadcn/ui primitives

---

## Task 1: Formalize Design Token System in index.css

**Files:**
- Modify: `src/client/src/index.css`

**Step 1: Extend the token system**

Add these token groups to the existing `:root` block in `index.css`, preserving all existing tokens:

```css
/* ── Financial Terminal Token System ────────────────────────────────── */

/* Typography Scale (financial density) */
:root {
  /* Existing tokens preserved... */

  /* NEW: Financial typography scale */
  --text-terminal-xs: 0.625rem;   /* 10px - chrome only: ticker, status bar */
  --text-terminal-sm: 0.6875rem;  /* 11px - panel labels, table headers */
  --text-terminal-base: 0.75rem;  /* 12px - panel body, table cells */
  --text-terminal-md: 0.8125rem;  /* 13px - PRIMARY body text (Bloomberg standard) */
  --text-terminal-lg: 0.875rem;   /* 14px - emphasis, section headers */
  --text-terminal-xl: 1rem;       /* 16px - panel titles, chart labels */

  /* NEW: Semantic financial colors */
  --color-positive: 142 71% 45%;       /* Green - price up, gain */
  --color-positive-muted: 142 40% 18%; /* Green tint - positive background */
  --color-negative: 0 80% 55%;         /* Red - price down, loss */
  --color-negative-muted: 0 50% 15%;   /* Red tint - negative background */
  --color-flat: 0 0% 55%;              /* Gray - unchanged */
  --color-flat-muted: 0 0% 12%;        /* Gray tint - neutral background */

  /* NEW: Category accent colors (refined) */
  --color-market: 186 45% 50%;         /* Cyan - market views */
  --color-market-muted: 186 30% 14%;   /* Cyan tint */
  --color-macro: 38 70% 55%;           /* Amber - macro views */
  --color-macro-muted: 38 40% 14%;     /* Amber tint */
  --color-intel: 265 55% 55%;          /* Purple - intelligence views */
  --color-intel-muted: 265 30% 14%;    /* Purple tint */

  /* NEW: Alert/Status semantic colors */
  --color-alert-critical: 0 80% 55%;   /* Red - critical alerts */
  --color-alert-warning: 38 80% 55%;   /* Amber - warnings */
  --color-alert-info: 186 45% 50%;     /* Cyan - informational */
  --color-alert-success: 142 71% 45%;  /* Green - success/confirmed */

  /* NEW: Surface refinements for data density */
  --surface-data: #0d0d0d;             /* Data table backgrounds */
  --surface-data-hover: #141414;        /* Table row hover */
  --surface-data-active: #1a1a1a;       /* Table row selected */

  /* NEW: Border system */
  --border-subtle: 0 0% 12%;           /* Default dividers */
  --border-data: 0 0% 16%;             /* Table borders */
  --border-focus: 186 45% 50%;         /* Focus rings */

  /* NEW: Spacing scale (4px base) */
  --space-px: 1px;
  --space-05: 0.125rem;   /* 2px */
  --space-1: 0.25rem;     /* 4px */
  --space-15: 0.375rem;   /* 6px */
  --space-2: 0.5rem;      /* 8px */
  --space-25: 0.625rem;   /* 10px */
  --space-3: 0.75rem;     /* 12px */
  --space-4: 1rem;        /* 16px */
  --space-5: 1.25rem;     /* 20px */
  --space-6: 1.5rem;      /* 24px */
  --space-8: 2rem;        /* 32px */

  /* NEW: Transitions */
  --transition-color: 150ms ease;
  --transition-transform: 150ms ease-out;
}
```

**Step 2: Remove the hacky readability overrides**

Delete these lines from the bottom of `index.css`:
```css
/* REMOVE:
main .text-\[8px\] { font-size: 10px !important; }
main .text-\[9px\] { font-size: 10px !important; }
```

**Step 3: Add new utility classes**

Add to the `@layer utilities` section:
```css
/* Tabular numerals for price alignment */
.tabular-nums {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}

/* Financial data text sizing */
.text-data { font-size: var(--text-terminal-base); }      /* 12px */
.text-data-md { font-size: var(--text-terminal-md); }     /* 13px */
.text-data-lg { font-size: var(--text-terminal-lg); }     /* 14px */
.text-data-xs { font-size: var(--text-terminal-xs); }     /* 10px */
.text-data-sm { font-size: var(--text-terminal-sm); }     /* 11px */

/* Financial sentiment utilities */
.text-positive { color: hsl(var(--color-positive)); }
.text-negative { color: hsl(var(--color-negative)); }
.text-flat { color: hsl(var(--color-flat)); }
.text-positive-muted { color: hsl(var(--color-positive-muted)); }
.text-negative-muted { color: hsl(var(--color-negative-muted)); }

.bg-positive-muted { background-color: hsl(var(--color-positive-muted)); }
.bg-negative-muted { background-color: hsl(var(--color-negative-muted)); }
.bg-flat-muted { background-color: hsl(var(--color-flat-muted)); }

.border-positive { border-color: hsl(var(--color-positive)); }
.border-negative { border-color: hsl(var(--color-negative)); }

/* Category accent utilities */
.text-market { color: hsl(var(--color-market)); }
.text-macro { color: hsl(var(--color-macro)); }
.text-intel { color: hsl(var(--color-intel)); }
.bg-market-muted { background-color: hsl(var(--color-market-muted)); }
.bg-macro-muted { background-color: hsl(var(--color-macro-muted)); }
.bg-intel-muted { background-color: hsl(var(--color-intel-muted)); }

/* Price change flash animation */
@keyframes flash-up {
  0% { background-color: hsl(var(--color-positive-muted)); }
  100% { background-color: transparent; }
}
@keyframes flash-down {
  0% { background-color: hsl(var(--color-negative-muted)); }
  100% { background-color: transparent; }
}
.flash-up { animation: flash-up 0.6s ease-out; }
.flash-down { animation: flash-down 0.6s ease-out; }
```

**Step 4: Verify**

Run: `npm run dev` and check that existing styles still render correctly. Open DevTools > Elements > `:root` and confirm new tokens are present.

**Step 5: Commit**

```bash
git add src/client/src/index.css
git commit -m "feat: formalize financial terminal design token system"
```

---

## Task 2: Refactor TopBar for Scannability

**Files:**
- Modify: `src/client/src/components/terminal/TopBar.tsx`

**Step 1: Upgrade typography to terminal scale**

Replace font size classes in TopBar:
- Brand label: `text-[10px]` → `text-data-xs`
- Nav items: existing sizes → ensure minimum `text-data-sm` (11px)
- Active symbol text: ensure `text-data-md` (13px)
- Clock: `text-[11px]` → `text-data-sm` (11px)
- All monospace elements: add `font-terminal tabular-nums`

**Step 2: Apply category color system**

In the `CATEGORY_THEME` object, replace hardcoded HSL values with token references:
```typescript
const CATEGORY_THEME = {
  market: {
    active: "text-market",
    hover: "hover:bg-market-muted",
    indicator: "bg-market",
  },
  macro: {
    active: "text-macro",
    hover: "hover:bg-macro-muted",
    indicator: "bg-macro",
  },
  intel: {
    active: "text-intel",
    hover: "hover:bg-intel-muted",
    indicator: "bg-intel",
  },
  symbol: {
    active: "text-market",
    hover: "hover:bg-market-muted",
    indicator: "bg-market",
  },
  system: {
    active: "text-intel",
    hover: "hover:bg-intel-muted",
    indicator: "bg-intel",
  },
};
```

**Step 3: Add hover micro-interaction**

Add `transition-colors duration-150` to all nav items for smooth hover transitions.

**Step 4: Verify**

Visually inspect TopBar at different viewport widths (768px, 1024px, 1440px). Confirm:
- Category colors are consistent (cyan=market, amber=macro, purple=intel)
- All text is readable at 11-13px
- Hover transitions are smooth
- Clock uses tabular numerals

**Step 5: Commit**

```bash
git add src/client/src/components/terminal/TopBar.tsx
git commit -m "feat: refactor TopBar with terminal tokens and category colors"
```

---

## Task 3: Refactor StatusBar for Data Density

**Files:**
- Modify: `src/client/src/components/terminal/StatusBar.tsx`

**Step 1: Upgrade typography and spacing**

Current StatusBar is `h-6` (24px). Keep this compact but improve readability:
- Change font classes to `text-data-xs font-terminal tabular-nums`
- Add `tracking-wide` for better character spacing at small sizes
- Ensure health dot is `w-1.5 h-1.5` (6px) with proper pulse animation

**Step 2: Add semantic status encoding**

```tsx
// Replace static colors with semantic tokens
<span className={cn(
  "inline-block w-1.5 h-1.5 rounded-full",
  isLive ? "bg-positive animate-pulse" : "bg-negative"
)} />
<span className={cn(
  "font-terminal text-data-xs tracking-wide",
  isLive ? "text-positive" : "text-negative"
)}>
  {isLive ? "LIVE" : "DOWN"}
</span>
```

**Step 3: Add latency color coding**

```tsx
// Color-code latency based on thresholds
<span className={cn(
  "font-terminal tabular-nums text-data-xs",
  latency < 100 ? "text-positive" :
  latency < 300 ? "text-flat" :
  "text-negative"
)}>
  {latency}ms
</span>
```

**Step 4: Verify**

Check StatusBar shows:
- Green pulsing dot + "LIVE" when API is healthy
- Red dot + "DOWN" when API is unreachable
- Latency color: green (<100ms), gray (100-300ms), red (>300ms)

**Step 5: Commit**

```bash
git add src/client/src/components/terminal/StatusBar.tsx
git commit -m "feat: refactor StatusBar with semantic status colors"
```

---

## Task 4: Refactor TickerTape for Price Encoding

**Files:**
- Modify: `src/client/src/components/terminal/TickerTape.tsx`

**Step 1: Upgrade typography**

Replace all font classes with terminal tokens:
- Symbol: `text-data-sm font-terminal font-semibold text-market`
- Price: `text-data-sm font-terminal tabular-nums text-foreground`
- Change: `text-data-xs font-terminal tabular-nums` + conditional color

**Step 2: Add semantic price change encoding**

```tsx
// Each ticker item
<span className={cn(
  "font-terminal tabular-nums text-data-xs font-medium",
  change > 0 ? "text-positive" :
  change < 0 ? "text-negative" :
  "text-flat"
)}>
  {change > 0 ? "▲" : change < 0 ? "▼" : ""}
  {change > 0 ? "+" : ""}{change.toFixed(2)}%
</span>
```

**Step 3: Add subtle background tint on change**

```tsx
// Flash background on price update
<span className={cn(
  "px-1 rounded",
  lastDirection === "up" ? "flash-up" :
  lastDirection === "down" ? "flash-down" : ""
)}>
  {/* price content */}
</span>
```

**Step 4: Verify**

TickerTape should show:
- Cyan symbol names
- Tabular-aligned prices
- Green ▲ / Red ▼ arrows with percentage
- Brief green/red flash on price updates

**Step 5: Commit**

```bash
git add src/client/src/components/terminal/TickerTape.tsx
git commit -m "feat: refactor TickerTape with semantic price encoding"
```

---

## Task 5: Refactor TabStrip for Category Awareness

**Files:**
- Modify: `src/client/src/components/terminal/TabStrip.tsx`

**Step 1: Upgrade typography and sizing**

- Tab text: `text-data-sm font-terminal`
- Tab height: keep `h-7` but add `px-2.5` for breathing room
- Close button: `w-3.5 h-3.5` with `text-flat hover:text-negative`

**Step 2: Apply category-based tab coloring**

```tsx
// Replace hardcoded gradient logic with category-aware styling
const getTabStyle = (view: ViewMode) => {
  const meta = VIEW_META[view];
  const category = meta?.category ?? "system";

  return cn(
    "border-b-2 transition-colors duration-150",
    category === "market" && "border-market text-market",
    category === "macro" && "border-macro text-macro",
    category === "intel" && "border-intel text-intel",
    category === "symbol" && "border-market text-market",
    category === "system" && "border-intel text-intel",
  );
};
```

**Step 3: Add active tab indicator**

Active tab gets a 2px bottom border in the category color with subtle background tint:
```tsx
active && cn(
  "bg-surface-2",
  getTabStyle(view)
)
```

**Step 4: Verify**

TabStrip should show:
- Tabs colored by their category (cyan for market, amber for macro, purple for intel)
- Active tab has colored bottom border
- Smooth color transitions on hover/active

**Step 5: Commit**

```bash
git add src/client/src/components/terminal/TabStrip.tsx
git commit -m "feat: refactor TabStrip with category-aware tab coloring"
```

---

## Task 6: Refactor PanelShell for Consistent Chrome

**Files:**
- Modify: `src/client/src/components/panel/PanelShell.tsx`
- Modify: `src/client/src/index.css` (panel classes)

**Step 1: Upgrade PanelShell typography**

```tsx
// PanelShell.tsx - update header
<header className="panel-header">
  <span className="panel-label">{label}</span>
  {extra && <span className="ml-2 text-data-xs text-muted-foreground">{extra}</span>}
  {headerRight && <div className="ml-auto">{headerRight}</div>}
</header>
```

**Step 2: Refine panel CSS classes**

In `index.css`, update the `@layer components` section:

```css
.panel-shell {
  @apply flex flex-col h-full bg-surface-0 overflow-hidden;
}

.panel-header {
  @apply flex items-center px-3 py-1.5 bg-surface-2 border-b border-border shrink-0;
  min-height: 28px; /* slightly taller for 11px text */
}

.panel-label {
  @apply font-terminal text-data-sm font-semibold tracking-[0.15em] text-muted-foreground uppercase;
}

.panel-card {
  @apply bg-surface-1 border border-border rounded;
}

/* NEW: Panel data section - for tables and dense data */
.panel-data {
  @apply bg-surface-0 overflow-auto;
  font-size: var(--text-terminal-base); /* 12px base for data */
}

/* NEW: Panel metric row - for KPI displays */
.panel-metric {
  @apply flex items-baseline justify-between py-1;
}
.panel-metric-label {
  @apply text-data-xs text-muted-foreground font-terminal;
}
.panel-metric-value {
  @apply text-data-md font-terminal tabular-nums font-semibold;
}
```

**Step 3: Verify**

All panels should show:
- Slightly taller, more readable headers (28px min-height)
- 11px uppercase monospace labels
- Consistent panel borders and backgrounds
- No visual regressions in existing panels

**Step 4: Commit**

```bash
git add src/client/src/components/panel/PanelShell.tsx src/client/src/index.css
git commit -m "feat: refactor PanelShell with terminal typography tokens"
```

---

## Task 7: Add Financial Data Table Primitives

**Files:**
- Modify: `src/client/src/index.css`

**Step 1: Add data table CSS classes**

```css
/* ── Financial Data Table ────────────────────────────────────────────── */

.data-table {
  @apply w-full border-collapse;
  font-size: var(--text-terminal-base); /* 12px */
}

.data-table thead {
  @apply sticky top-0 z-10;
}

.data-table th {
  @apply text-left font-terminal font-semibold text-muted-foreground uppercase;
  font-size: var(--text-terminal-sm); /* 11px */
  letter-spacing: 0.05em;
  padding: var(--space-15) var(--space-2); /* 6px 8px */
  border-bottom: 1px solid hsl(var(--border-data));
  background-color: var(--surface-2);
}

.data-table td {
  @apply font-terminal tabular-nums;
  padding: var(--space-1) var(--space-2); /* 4px 8px */
  border-bottom: 1px solid hsl(var(--border-subtle));
}

.data-table tbody tr {
  @apply transition-colors duration-100;
}

.data-table tbody tr:hover {
  background-color: var(--surface-data-hover);
}

.data-table tbody tr:active {
  background-color: var(--surface-data-active);
}

/* Right-align numeric columns */
.data-table td.num,
.data-table th.num {
  @apply text-right;
}

/* Sentiment-colored cells */
.data-table td.positive { @apply text-positive; }
.data-table td.negative { @apply text-negative; }
.data-table td.flat { @apply text-flat; }

/* Compact variant for dense views */
.data-table.compact td {
  padding: var(--space-05) var(--space-15); /* 2px 6px */
}

/* Striped variant */
.data-table.striped tbody tr:nth-child(even) {
  background-color: var(--surface-data);
}
```

**Step 2: Verify**

Existing data tables (HistoricalPrices, Financials, Dividends, KeyRatios, Estimates, OptionsChain) should render with:
- 12px body text, 11px headers
- Sticky headers on scroll
- Hover highlight on rows
- Tabular-aligned numbers
- Proper uppercase column headers

**Step 3: Commit**

```bash
git add src/client/src/index.css
git commit -m "feat: add financial data table CSS primitives"
```

---

## Task 8: Add Keyboard Navigation to Data Tables

**Files:**
- Modify: `src/client/src/components/panel/PanelShell.tsx` (add data-table keyboard handler)

**Step 1: Create a reusable data table keyboard hook**

Create `src/client/src/hooks/use-data-table-nav.ts`:

```typescript
import { useCallback, useRef, useEffect } from "react";

interface UseDataTableNavOptions {
  rowSelector?: string; // CSS selector for rows
  onSelect?: (row: HTMLElement, index: number) => void;
}

export function useDataTableNav({ rowSelector = "tbody tr", onSelect }: UseDataTableNavOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIndex = useRef(-1);

  const rows = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll(rowSelector));
  }, [rowSelector]);

  const setActive = useCallback((index: number) => {
    const allRows = rows();
    if (index < 0 || index >= allRows.length) return;

    // Remove previous active
    allRows.forEach(r => r.classList.remove("data-table-active"));

    activeIndex.current = index;
    allRows[index].classList.add("data-table-active");
    allRows[index].scrollIntoView({ block: "nearest" });
    onSelect?.(allRows[index] as HTMLElement, index);
  }, [rows, onSelect]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!containerRef.current?.contains(document.activeElement)) return;

    const allRows = rows();
    if (allRows.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive(Math.min(activeIndex.current + 1, allRows.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive(Math.max(activeIndex.current - 1, 0));
        break;
      case "Enter":
        if (activeIndex.current >= 0) {
          onSelect?.(allRows[activeIndex.current] as HTMLElement, activeIndex.current);
        }
        break;
    }
  }, [rows, setActive, onSelect]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { containerRef, setActive };
}
```

**Step 2: Add active row CSS**

In `index.css`:
```css
.data-table-active {
  background-color: hsl(var(--color-market-muted)) !important;
  outline: 1px solid hsl(var(--color-market));
  outline-offset: -1px;
}
```

**Step 3: Verify**

In any data table panel:
- Click a table to focus it
- Arrow Up/Down moves active row highlight
- Enter triggers the row's click handler
- Active row has cyan border and tinted background

**Step 4: Commit**

```bash
git add src/client/src/hooks/use-data-table-nav.ts src/client/src/index.css
git commit -m "feat: add keyboard navigation for data tables"
```

---

## Task 9: Cross-Symbol Panel Linking

**Files:**
- Modify: `src/client/src/lib/workspaceStore.ts`
- Modify: `src/client/src/pages/Terminal.tsx`

**Step 1: Add global symbol context to workspace store**

In `workspaceStore.ts`, add a `globalSymbol` field and an action to set it:

```typescript
// Add to WorkspaceState interface
globalSymbol: string | null;
setGlobalSymbol: (symbol: string | null) => void;

// Add to initial state
globalSymbol: null,

// Add action
setGlobalSymbol: (symbol) => set({ globalSymbol: symbol }),
```

**Step 2: Modify command bar to set global symbol**

In `Terminal.tsx`, when the command bar parses a symbol command, also set the global symbol:

```typescript
// In the command handler, after opening the view:
if (parsed.symbol) {
  useWorkspaceStore.getState().setGlobalSymbol(parsed.symbol);
}
```

**Step 3: Add cross-linking to panel components**

Add a hook `useLinkedSymbol` in `src/client/src/hooks/use-linked-symbol.ts`:

```typescript
import { useWorkspaceStore } from "@/lib/workspaceStore";

export function useLinkedSymbol(fallback?: string) {
  const globalSymbol = useWorkspaceStore((s) => s.globalSymbol);
  const primary = useWorkspaceStore((s) => s.primary);
  const focusedPane = useWorkspaceStore((s) => s.focusedPane);

  // Get the symbol from the active tab in the focused pane
  const pane = focusedPane === "primary" ? primary : useWorkspaceStore((s) => s.secondary);
  const activeTab = pane?.tabs.find(t => t.id === pane.activeTabId);
  const tabSymbol = activeTab?.symbol;

  return tabSymbol || globalSymbol || fallback;
}
```

**Step 4: Verify**

Type `MSFT` in command bar → all symbol-linked panels in the active pane update to MSFT.

**Step 5: Commit**

```bash
git add src/client/src/lib/workspaceStore.ts src/client/src/pages/Terminal.tsx src/client/src/hooks/use-linked-symbol.ts
git commit -m "feat: add cross-symbol panel linking via global symbol context"
```

---

## Task 10: Alert Notification Overlay

**Files:**
- Create: `src/client/src/components/terminal/AlertOverlay.tsx`
- Modify: `src/client/src/pages/Terminal.tsx`

**Step 1: Create AlertOverlay component**

```tsx
// src/client/src/components/terminal/AlertOverlay.tsx
import { useEffect, useState } from "react";
import { X, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertNotification {
  id: string;
  symbol: string;
  message: string;
  type: "info" | "warning" | "critical";
  timestamp: Date;
}

export default function AlertOverlay() {
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);

  // Listen for WebSocket alert events
  useEffect(() => {
    const ws = new WebSocket(`${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/ws`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "alert") {
        const alert: AlertNotification = {
          id: crypto.randomUUID(),
          symbol: data.symbol,
          message: data.message,
          type: data.severity || "info",
          timestamp: new Date(),
        };
        setAlerts(prev => [...prev, alert]);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setAlerts(prev => prev.filter(a => a.id !== alert.id));
        }, 5000);
      }
    };

    return () => ws.close();
  }, []);

  const dismiss = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-12 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className={cn(
            "flex items-start gap-2 px-3 py-2 rounded border backdrop-blur-sm",
            "animate-in slide-in-from-right duration-300",
            alert.type === "critical" && "bg-negative-muted border-negative/30",
            alert.type === "warning" && "bg-macro-muted border-macro/30",
            alert.type === "info" && "bg-market-muted border-market/30",
          )}
        >
          <Bell className={cn(
            "w-3.5 h-3.5 mt-0.5 shrink-0",
            alert.type === "critical" && "text-negative",
            alert.type === "warning" && "text-macro",
            alert.type === "info" && "text-market",
          )} />
          <div className="flex-1 min-w-0">
            <span className="font-terminal text-data-sm font-semibold text-foreground">
              {alert.symbol}
            </span>
            <span className="font-terminal text-data-xs text-muted-foreground ml-1.5">
              {alert.message}
            </span>
          </div>
          <button
            onClick={() => dismiss(alert.id)}
            className="text-flat hover:text-foreground transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Mount in Terminal.tsx**

```tsx
// Add import
import AlertOverlay from "@/components/terminal/AlertOverlay";

// Add inside Terminal component, after the main layout
<AlertOverlay />
```

**Step 3: Verify**

Trigger a price alert → notification slides in from right with:
- Cyan border for info, amber for warning, red for critical
- Symbol in bold terminal font
- Auto-dismisses after 5 seconds
- Manual dismiss via X button

**Step 4: Commit**

```bash
git add src/client/src/components/terminal/AlertOverlay.tsx src/client/src/pages/Terminal.tsx
git commit -m "feat: add alert notification overlay for price alerts"
```

---

## Summary

| Task | Files Changed | Key Improvement |
|------|---------------|-----------------|
| 1. Design Tokens | `index.css` | Formal token system with financial scale |
| 2. TopBar | `TopBar.tsx` | Category colors, terminal typography |
| 3. StatusBar | `StatusBar.tsx` | Semantic status colors, latency coding |
| 4. TickerTape | `TickerTape.tsx` | Price encoding, flash animations |
| 5. TabStrip | `TabStrip.tsx` | Category-aware tab coloring |
| 6. PanelShell | `PanelShell.tsx`, `index.css` | Consistent panel chrome |
| 7. Data Tables | `index.css` | Financial table primitives |
| 8. Table Keyboard | `use-data-table-nav.ts` | Arrow key navigation |
| 9. Cross-Linking | `workspaceStore.ts` | Global symbol context |
| 10. Alert Overlay | `AlertOverlay.tsx` | Real-time alert notifications |

**Post-implementation verification:** Run `npm run lint && npm run build` to confirm no regressions.
