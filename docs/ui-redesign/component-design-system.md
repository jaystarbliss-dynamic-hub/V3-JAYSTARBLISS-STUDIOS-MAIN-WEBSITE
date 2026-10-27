# Jaystarbliss Studios — Component & Design System Specification

## 1. Brand & Visual Language

The Jaystarbliss authenticated platform uses a restrained, high-trust education SaaS visual language consolidated in `src/uiux-pro-max.css`, `src/index.css`, and `src/components/portal/portal-polish.css`:

- **Brand Navy / Slate (`--jb-brand-slate`)**: `#1E293B` (Midnight Navy `#14284B` in portal navigation)
- **Brand Red (`--jb-brand-red`)**: `#B91C1C` (Reserved for intentional brand accents and critical actions)
- **Primary Action Blue (`--jb-status-info`)**: `#2563EB`
- **Neutral Canvas (`--jb-brand-neutral`)**: `#F8FAFC` (Light) / `#0B1120` (Dark)
- **Card / Panel Surface (`--jb-surface`)**: `#FFFFFF` (Light) / `#111827` (Dark) with crisp `1px solid #E2E8F0` (`rgba(255, 255, 255, 0.08)` in dark mode) borders and subtle single-elevation shadows.

---

## 2. Design Tokens (`src/uiux-pro-max.css`)

| Token Category | CSS Variable | Light Value | Dark Value | Purpose |
| --- | --- | --- | --- | --- |
| Surface | `--jb-surface` | `#ffffff` | `#111827` | Primary card, table, and modal surface |
| Muted Surface | `--jb-surface-muted` | `#f1f5f9` | `#1e293b` | Filter bars, table headers, secondary wells |
| Primary Text | `--jb-text` | `#0f172a` | `#f8fafc` | Headings, primary data values |
| Muted Text | `--jb-text-muted` | `#64748b` | `#94a3b8` | Labels, metadata, timestamps |
| Border | `--jb-border` | `#e2e8f0` | `rgba(255,255,255,0.08)` | 1px structural dividers and card outlines |
| Focus Ring | `--jb-focus` | `#0284c7` | `#38bdf8` | WCAG 2.2 AA 3px keyboard focus outline |
| Status Success | `--jb-status-success` | `#16a34a` | `#4ade80` | Active, released, graded, verified states |
| Status Warning | `--jb-status-warning` | `#d97706` | `#fbbf24` | Scheduled, pending, in-progress states |
| Status Danger | `--jb-status-danger` | `#dc2626` | `#f87171` | Expired, overdue, destructive actions |
| Header Height | `--jb-header-height` | `3.5rem` (`56px`) | `3.5rem` (`56px`) | Compact sticky topbar height |
| Touch Target | `--jb-touch-target` | `2.75rem` (`44px`) | `2.75rem` (`44px`) | Minimum interactive target height on mobile |

---

## 3. Typography & Tabular Numerals

- **Headings**: Crisp sentence-case hierarchy (`text-sm sm:text-base font-bold` in sticky topbar; `text-base sm:text-lg font-bold` for section headings).
- **Tabular Numerals**: All KPI metrics, countdown timers, financial figures, scores (`1 / 3`), percentages (`33.3%`), and table cells enforce `font-variant-numeric: tabular-nums` to prevent layout jitter.
- **Mobile Input Sizing**: Inputs, selects, and textareas enforce `font-size: 16px` under `767px` to prevent iOS Safari auto-zoom on focus.

---

## 4. Standardized Shared Components

1. **Application Shells (`PortalLayout.tsx`, `AdminLayout.tsx`)**:
   - Sticky route-aware topbar (`48–56px`) displaying only the current page title.
   - Collapsible desktop sidebar (`268px` expanded / `72px` rail in Portal; `280px` expanded / `80px` rail in Admin).
   - Mobile slide-over drawer with `useEdgeSwipeDrawer` gesture support, backdrop dismiss, and automatic close on route change.
2. **Action Toolbars**:
   - Compact inline toolbars replacing oversized decorative hero banners while preserving all operational buttons (Refresh, Search, Filter, Export CSV/XLSX/ZIP, Onboard, Create).
3. **Responsive Data Tables & Mobile Row Cards**:
   - Semantic `<table>` on tablet/desktop viewports (`hidden md:block`).
   - Structured mobile row/card presentation (`md:hidden`) keeping primary identifiers, status badges, tabular scores, and row actions immediately accessible without horizontal overflow.
4. **Accessible Modals & Drawers**:
   - Keyboard Escape support, backdrop click handling, clear confirmation states for destructive operations, and viewport-safe scrolling (`max-h-[90vh] overflow-y-auto`).
