# Bloomberg/WSJ Hybrid Design Analysis

## Overview

This document outlines the visual design improvements to create a Bloomberg Terminal + Wall Street Journal hybrid aesthetic for the financial terminal application. The goal is to combine Bloomberg's data-dense terminal authority with WSJ's editorial typographic clarity.

## Design Research Summary

### Bloomberg Terminal Design Principles

**Color Palette:**
- Background: `#0A0A0A` (near black)
- Panel Background: `#1A1A1A` (dark gray)
- Primary Text: `#00FF00` (phosphor green)
- Secondary Text: `#00CC00` (darker green)
- Accent: `#FF6600` (orange)
- Market Up: `#338736` (green)
- Market Down: `#E51503` (red)
- Border: `#003300` (dark green)

**Typography:**
- Monospace is non-negotiable (IBM Plex Mono, JetBrains Mono)
- Brightness as hierarchy instead of weight/size
- High information density
- Terminal-like UI patterns

**Key Characteristics:**
- Dark CRT-style display aesthetic
- Phosphor glow effect on active elements
- Sharp corners (square CTAs, not rounded)
- Chromatic semantic colors (green = up, red = down)
- Multi-window data density

### WSJ Design Principles

**Typography Stack:**
- Headlines: Escrow (serif, authoritative)
- Body: Exchange (slab serif, readable)
- UI/Labels: Retina (sans-serif, clean)
- Web fallback: Georgia for serif, system sans-serif

**Color Palette:**
- Canvas: `#FFFFFF` (white)
- Ink: `#000000` (near-black)
- Ink Secondary: `#3C3C3C`
- Ink Tertiary: `#545454`
- Hairline: `#E5E7EB`
- Markets Up: `#338736`
- Markets Down: `#E51503`
- Opinion Blue: `#0064FA`

**Key Characteristics:**
- Strong typographic hierarchy
- Editorial feel with serif headlines
- Clean whitespace rhythm
- Trust signals through typography
- Square-corner CTAs (terminal-chrome feel)

## Current App Analysis

### TopBar (Current State)

**Issues Identified:**
1. **Tab Visibility:** Icon-only tabs are hard to distinguish
2. **Color Uniformity:** All categories use identical black text
3. **Active State:** Subtle bottom border, not enough contrast
4. **Typography:** Monospace throughout, no hierarchy variation
5. **Background:** Orange gradient feels dated, not terminal-authentic

**Current CATEGORY_THEME:**
```typescript
// All categories identical:
color: "text-black",
restingBg: "bg-black/5",
activeBg: "bg-black/10",
activeBorder: "border-b-black",
```

### News Cards (Current State)

**Issues Identified:**
1. **Headline Font:** Monospace for headlines feels technical, not editorial
2. **Source Badge:** Small, low contrast
3. **Spacing:** Tight, could benefit from WSJ-style whitespace
4. **Hierarchy:** Limited visual distinction between headline and metadata

## Bloomberg/WSJ Hybrid Design Recommendations

### 1. TopBar Redesign

**Background:**
- Change from orange gradient to near-black (`#0A0A0A`)
- Add subtle phosphor glow on active elements
- Keep terminal-chrome aesthetic

**Tab Styling:**
```typescript
const CATEGORY_THEME = {
  market: {
    label: "MARKET",
    color: "text-emerald-400",        // Phosphor green
    restingBg: "bg-emerald-400/5",
    activeBg: "bg-emerald-400/15",
    activeBorder: "border-b-emerald-400",
    glow: "shadow-[0_0_8px_rgba(52,211,153,0.4)]", // Phosphor glow
  },
  macro: {
    label: "MACRO",
    color: "text-amber-400",          // Warm accent
    restingBg: "bg-amber-400/5",
    activeBg: "bg-amber-400/15",
    activeBorder: "border-b-amber-400",
    glow: "shadow-[0_0_8px_rgba(251,191,36,0.4)]",
  },
  intel: {
    label: "INTEL",
    color: "text-cyan-400",           // Cool accent
    restingBg: "bg-cyan-400/5",
    activeBg: "bg-cyan-400/15",
    activeBorder: "border-b-cyan-400",
    glow: "shadow-[0_0_8px_rgba(34,211,238,0.4)]",
  },
};
```

**Typography:**
- Category labels: Sans-serif (Inter or system) at 10px, uppercase, letter-spacing
- Tab icons: Keep monospace aesthetic
- Active tab: Brighter color + glow effect

**Layout:**
- Add tab labels (not just icons) for better visibility
- Increase horizontal padding
- Cleaner separator lines

### 2. Typography Hierarchy

**Font Stack:**
```css
/* Headlines (WSJ influence) */
--font-headline: 'Georgia', 'Times New Roman', serif;

/* UI Labels (Bloomberg influence) */
--font-ui: 'Inter', -apple-system, sans-serif;

/* Data Values (Terminal) */
--font-data: 'JetBrains Mono', monospace;
```

**Usage:**
- News headlines: Serif font (WSJ editorial feel)
- Tab labels: Sans-serif (clean UI)
- Data values: Monospace (terminal authority)
- Metadata: Sans-serif, smaller size

### 3. News Card Improvements

**Headline Styling:**
```css
.news-headline {
  font-family: var(--font-headline);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--color-text-primary);
}
```

**Source Badge:**
- Larger, more readable
- Better contrast
- Consistent with terminal aesthetic

**Spacing:**
- Increase vertical padding
- Better whitespace rhythm
- Clear separation between elements

### 4. Color System

**Primary Palette:**
```css
:root {
  /* Terminal Surfaces */
  --surface-primary: #0A0A0A;
  --surface-secondary: #1A1A1A;
  --surface-tertiary: #2A2A2A;
  
  /* Text */
  --text-primary: #FFFFFF;
  --text-secondary: #A0A0A0;
  --text-muted: #666666;
  
  /* Accents (Phosphor) */
  --accent-green: #00FF00;
  --accent-orange: #FF6600;
  --accent-cyan: #00FFFF;
  
  /* Market Semantics */
  --market-up: #338736;
  --market-down: #E51503;
  --market-neutral: #666666;
}
```

### 5. Component Updates

**TopBar:**
- Dark background with phosphor accents
- Tab labels with category colors
- Active state with glow effect
- Cleaner separator lines

**News Cards:**
- Serif headlines
- Better spacing
- Improved source badges
- Stronger hierarchy

**Status Bar:**
- Keep current design (already good)
- Ensure consistency with new palette

## Implementation Plan

### Phase 1: TopBar Redesign
1. Update CATEGORY_THEME colors
2. Add tab labels
3. Implement glow effects
4. Test visibility and contrast

### Phase 2: Typography System
1. Add font variables to CSS
2. Update news card headlines
3. Create typography utility classes
4. Apply to key components

### Phase 3: News Card Improvements
1. Update headline styling
2. Improve source badges
3. Adjust spacing
4. Test readability

### Phase 4: Polish & Testing
1. Verify contrast ratios
2. Test on different screens
3. Ensure accessibility
4. Document changes

## Success Metrics

- **Tab Visibility:** 80%+ improvement in tab distinguishability
- **Typography Hierarchy:** Clear distinction between headline, body, and data
- **News Readability:** Improved scanning speed for headlines
- **Terminal Authority:** Maintained Bloomberg-style data density
- **Editorial Feel:** WSJ-inspired typographic clarity

## References

- Bloomberg Terminal Clone SPEC.md
- WSJ Design Typography (Escrow, Exchange, Retina)
- Bloomberg Design System (shadcn.io/design/bloomberg)
- Terminal Green Design Pattern
