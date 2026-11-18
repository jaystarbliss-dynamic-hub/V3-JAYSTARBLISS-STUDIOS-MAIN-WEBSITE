# Jaystarbliss Studios — UI/UX Master Design System

## Experience goal
Premium education + creative services platform. The UI should feel modern, trustworthy, educational, and technology-forward while prioritizing operational clarity.

## Visual language
- Editorial hierarchy with strong page titles and concise supporting copy.
- Soft elevated surfaces with 16–24px radii.
- Glass/blur only where it establishes layering or focus.
- Calm backgrounds with restrained brand accents.
- One primary action per view; secondary actions subordinate.
- Lucide SVG icon language throughout.

## Color tokens
- `--jb-brand-slate`: `#1E293B`
- `--jb-brand-red`: `#B91C1C`
- `--jb-brand-neutral`: `#F8FAFC`
- `--jb-surface`: `#FFFFFF`
- `--jb-surface-muted`: `#F1F5F9`
- `--jb-text`: `#0F172A`
- `--jb-text-muted`: `#64748B`
- `--jb-border`: `#E2E8F0`
- `--jb-focus`: `#B91C1C`

Dark mode should use lighter/desaturated tonal variants rather than inversion.

## Typography
Poppins remains the primary family. Base body size is 16px on mobile, body line-height 1.5–1.7, headings 600–800, labels 500–700. Use tabular figures for aligned data values.

## Spacing & shape
Use a 4/8px rhythm: 8, 12, 16, 20, 24, 32, 40, 48, 64. Cards/surfaces use 16–24px radii; small controls 10–12px. Keep elevation consistent and subtle.

## Interaction
Primary touch targets should be at least 44×44px with 8px+ separation. Always provide keyboard focus. Show loading/pressed/error feedback. Never make important actions hover-only. Confirm destructive actions.

## Responsive
Mobile-first. Use consistent breakpoints around 375 / 768 / 1024 / 1440px. Avoid horizontal scrolling and nested scroll traps. Prefer `min-height: 100dvh` for viewport-fitting shells and preserve safe-area spacing for fixed mobile navigation.

## Motion
Use transform/opacity. Prefer short meaningful transitions, shorter exits, interruptible state changes, and reduced-motion support. Never block input with animation.

## Dashboard hierarchy
1. Context header + primary action.
2. High-value KPI cards using real data.
3. Primary analytical surface.
4. Secondary operational panels.
5. Recent activity / next actions.

Empty states should explain what is missing and provide the next useful action. Synthetic metrics are prohibited.

## Accessibility
Target WCAG AA contrast. Use visible labels, logical heading order, alt text where meaningful, accessible names for icon-only controls, and text/icon alongside semantic colors. Preserve keyboard navigation and reduced motion.

## Existing classes to standardize
`digital-canvas`, `pro-surface`, `pro-interactive`, `glass-card`, `glass-card-subtle`, `dashboard-interface`, and existing `brand-*` utilities.

## Avoid
Noisy gradients, excessive glass, giant empty padding, tiny text, dense mobile controls, random radii/shadows, competing accent colors, emoji icons, hover-only actions, or fabricated dashboard data.
