# Design system: ARQUS CRM + PM

**Direction: calm and crisp.** Light, airy and precise, in the spirit of Linear, Stripe and Vercel. Near-black ink,
white cards on a cool off-white canvas, and the logo cyan as the one accent. Nothing chunky, colourful or decorative.

Source of truth: `frontend/src/styles/_tokens.scss`. Angular Material is restyled through those tokens in
`frontend/src/styles.scss`; no component may keep the default Material look.

## Rules that never bend

- **Cyan never carries text on a light background, and white text never sits on cyan.** Readable cyan
  (links, icons that must be read, focus rings) is `--brand-deep`.
- **Every text/background pair passes 4.5:1**; focus rings, control borders and meaningful graphics pass 3:1.
  Run `npm run check:contrast` after any colour change (table below).
- **Colour is never the only signal.** Green, red and amber appear only on signed values ("+12.4%", "-3.1%") and
  status chips, always with a sign or words. Severity markers have screen-reader text ("Urgent", "Soon").
- **Money** is a decimal string from the API and is shown with the `inr` / `inrCompact` pipes (Indian grouping:
  ₹12,34,568; compact ₹12.3L, ₹1.2Cr). No floating-point maths on money; zero shows as ₹0.
- **Mobile-first.** Design at 360px, then widen. No sideways scrolling.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#0B0D0F` | Headings, KPI values, primary buttons, tooltips, "Spent" bars |
| `--ink-2` | `#3B4250` | Body text |
| `--ink-3` | `#667085` | Muted text, labels, icons |
| `--on-ink` | `#FFFFFF` | Text on ink |
| `--paper` | `#F6F7F9` | App canvas |
| `--surface` | `#FFFFFF` | Cards, sidebar, top bar |
| `--subtle` | `#F2F4F7` | Hover fill, table header |
| `--plate` | `#EAECF0` | Skeletons, empty bar tracks |
| `--line` | `#E7E9ED` | Card borders and dividers |
| `--line-strong` | `#858D9A` | Input and select borders (3:1) |
| `--brand` | `#32C5F3` | Logo cyan: active bar, sparklines, fills, "Collected" bars, selected states |
| `--brand-deep` | `#086F92` | Readable cyan: links, focus rings, bar outlines, ranked bars |
| `--brand-tint` | `#E6F7FD` | Active nav item, selected segment, avatar |
| `--positive` / `--negative` / `--warning` (+ `-bg`) | see tokens | Signed values and status chips only |

## Type

- **Geist Variable** (`@fontsource-variable/geist`, self-hosted, weights 100-900). Verified with fontTools that it
  has a real `tnum` feature; its default digits are proportional, so `font-variant-numeric: tabular-nums` is set
  on `body`. Never Inter, Roboto, Poppins, Space Grotesk or any wide/expanded width.
- Scale (px): **12, 13, 14 (body), 16, 20, 24 (page title), 32-36 (KPI values)**.
- Headings weight 600, letter-spacing -0.02em. Body 400-500. Labels 12-13px, weight 500, sentence case, muted.
  **Never** uppercase labels with wide tracking.

## Shape, depth, spacing

- Radii: **16px cards** (`--radius-card`), **10px controls** (`--radius-control`), 8px small, **999px chips**.
- Cards: white, 1px `--line` border, `--shadow-card` (`0 1px 2px rgba(16,24,40,.04)`). Clickable cards (`.card-link`)
  darken the border and use `--shadow-card-hover`.
- Spacing on a 4px scale (`--space-1` .. `--space-10`); 20-24px padding inside cards; 24px gutters, 1280px max width.
- No gradients or glows, except the 12%-to-0 cyan fill under sparklines.

## Components

- **Buttons:** primary = ink fill, white text, 10px radius, 40px, a 1px lift on hover. Secondary = white with a
  hairline. Icon buttons 40px, muted icon, light grey hover, always with `aria-label`.
- **Inputs and selects:** 40px (Material density -4), 10px radius, `--line-strong` border, `--brand-deep` on focus.
- **Focus ring:** `2px solid --brand-deep`, 2px offset (drawn inside rows in the sidebar, lists and flyouts).
- **Chips:** pill with a dot and the status in words. **Tables (`app-data-list`):** light header row, 48px rows, no
  zebra stripes, subtle hover; below 600px rows stack as label/value pairs.
- **Menus, flyouts, dialogs, sheets:** white, hairline border, `--shadow-pop`; 12px (menus) / 16px (dialogs, sheets).
  Tooltips and snackbars are ink with white text.
- **States:** skeletons shaped like the real content (`app-skeleton`, shimmer), `app-error-state` with "Try again",
  `app-empty-state`, and real zeros. Empty charts say "No data for this period".
- **Icons:** Material Symbols Outlined at 18-20px, light weight, in `--ink-3`. No tinted squares behind icons.

## Motion

Subtle, and switched off by `prefers-reduced-motion` (global rule in `styles.scss`; the count-up checks it too).

| What | Duration |
| --- | --- |
| Sidebar width / content offset | 200ms `--ease-out` |
| Accordion open, chevron rotation | 200ms `--ease-out` |
| Card and row hover | 120ms |
| Skeleton shimmer | 1.2s loop |
| KPI count-up | 500ms, first load only |

Nothing else moves.

## Shell

- **Sidebar (>= 1024px)**, driven by `core/config/sidebar.config.ts` and filtered by role; state in `LayoutService`.
  - Expanded 256px: full logo, rows with icon + label, groups are accordions (one open at a time; the group holding
    the current page opens by itself).
  - Rail 72px: emblem, icons only. Every icon has a tooltip on hover and keyboard focus. Groups open a CDK-menu
    flyout beside the icon; arrow keys move, Escape closes and returns focus to the icon.
  - Toggle: round chevron button on the sidebar edge (`aria-expanded`, `aria-controls="app-sidebar"`, label
    "Collapse sidebar" / "Expand sidebar") and **Ctrl/Cmd+B**. Saved in `localStorage` (`crm.sidebar.collapsed`,
    wrapped in try/catch). First visit: expanded at >= 1280px, rail at 1024-1279px.
  - Content follows `--sidebar-w` (set on the shell), animated.
  - Active item: `--brand-tint` background, ink text weight 600, 3px `--brand` bar with a rounded end on the left.
    In the rail, the active icon sits on a `--brand-tint` square. Hover: light grey.
  - Bottom: user chip (initials avatar, name, role, log-out). In the rail: the avatar opens an account menu.
- **Below 1024px:** no rail and no toggle. Top bar + bottom tab bar (the first four role-visible sections + "More",
  which opens a bottom sheet with every page and Log out). Active tab: ink icon and label, 3px cyan bar above.
- **Top bar:** flat white, 1px bottom border, 64px. Page title (the page's `h1`, 24px/600) with an optional subtitle
  (pages set `LayoutService.subtitle`). Right: "Search Ctrl K" (desktop) opening the command palette over the
  role-visible pages, the bell (dot when unread > 0) and the avatar menu. Mobile: title, bell, avatar only.

## Dashboard

Toolbar (period switcher Month / Quarter / Year / All, kept in `?period=`; refresh) → quick actions → six KPI cards
+ "Waiting on you" → revenue vs expenses (SVG bars drawn at their real width, `role="img"` summary + hidden data
table) → lead funnel and sales by executive (slim bars) → Recent tabs (payments, expenses, activity). The grid uses
container queries on the content width, so it follows the sidebar state: 4 columns from 960px of content (revenue
spans 2; "Waiting on you" takes the spare slot), 2 columns below, revenue/outstanding full width on phones.

## Logo

`frontend/public/brand/`: `arqus-logo.png` (expanded sidebar, login), `arqus-emblem.png` (rail, mobile top bar),
favicons. Proportional scaling only, never recoloured, only on white or light backgrounds.

## Contrast

Generated by `node scripts/check-contrast.mjs --md` (run from `frontend/`).

| Foreground | Background | Ratio | Needs | Use | Result |
| --- | --- | --- | --- | --- | --- |
| `--ink` #0b0d0f | `--paper` #f6f7f9 | 18.16:1 | 4.5:1 | heading/text on paper | pass |
| `--ink` #0b0d0f | `--surface` #ffffff | 19.47:1 | 4.5:1 | heading/text on surface | pass |
| `--ink` #0b0d0f | `--subtle` #f2f4f7 | 17.67:1 | 4.5:1 | heading/text on subtle | pass |
| `--ink` #0b0d0f | `--plate` #eaecf0 | 16.46:1 | 4.5:1 | heading/text on plate | pass |
| `--ink` #0b0d0f | `--brand-tint` #e6f7fd | 17.69:1 | 4.5:1 | heading/text on brand-tint | pass |
| `--ink` #0b0d0f | `--brand` #32c5f3 | 9.66:1 | 4.5:1 | heading/text on brand | pass |
| `--on-ink` #ffffff | `--ink` #0b0d0f | 19.47:1 | 4.5:1 | text on ink (primary button, tooltip) | pass |
| `--ink-2` #3b4250 | `--paper` #f6f7f9 | 9.41:1 | 4.5:1 | body text on paper | pass |
| `--ink-2` #3b4250 | `--surface` #ffffff | 10.09:1 | 4.5:1 | body text on surface | pass |
| `--ink-2` #3b4250 | `--subtle` #f2f4f7 | 9.16:1 | 4.5:1 | body text on subtle | pass |
| `--ink-2` #3b4250 | `--brand-tint` #e6f7fd | 9.17:1 | 4.5:1 | body text on brand-tint | pass |
| `--ink-3` #667085 | `--paper` #f6f7f9 | 4.64:1 | 4.5:1 | muted text on paper | pass |
| `--ink-3` #667085 | `--surface` #ffffff | 4.97:1 | 4.5:1 | muted text on surface | pass |
| `--ink-3` #667085 | `--subtle` #f2f4f7 | 4.51:1 | 4.5:1 | muted text on subtle | pass |
| `--ink-3` #667085 | `--brand-tint` #e6f7fd | 4.52:1 | 4.5:1 | muted text on brand-tint | pass |
| `--brand-deep` #086f92 | `--paper` #f6f7f9 | 5.30:1 | 4.5:1 | link on paper | pass |
| `--brand-deep` #086f92 | `--surface` #ffffff | 5.68:1 | 4.5:1 | link on surface | pass |
| `--brand-deep` #086f92 | `--subtle` #f2f4f7 | 5.15:1 | 4.5:1 | link on subtle | pass |
| `--brand-deep` #086f92 | `--brand-tint` #e6f7fd | 5.16:1 | 4.5:1 | link on brand-tint | pass |
| `--positive` #17663a | `--positive-bg` #e3f4e8 | 6.13:1 | 4.5:1 | positive chip text | pass |
| `--positive` #17663a | `--surface` #ffffff | 7.00:1 | 4.5:1 | positive text on surface | pass |
| `--negative` #b42318 | `--negative-bg` #fdecea | 5.75:1 | 4.5:1 | negative chip text | pass |
| `--negative` #b42318 | `--surface` #ffffff | 6.57:1 | 4.5:1 | negative text on surface | pass |
| `--warning` #93370d | `--warning-bg` #fef4e6 | 6.91:1 | 4.5:1 | warning chip text | pass |
| `--warning` #93370d | `--surface` #ffffff | 7.52:1 | 4.5:1 | warning text on surface | pass |
| `--brand-deep` #086f92 | `--paper` #f6f7f9 | 5.30:1 | 3:1 | focus ring on paper | pass |
| `--brand-deep` #086f92 | `--surface` #ffffff | 5.68:1 | 3:1 | focus ring on surface | pass |
| `--brand-deep` #086f92 | `--subtle` #f2f4f7 | 5.15:1 | 3:1 | focus ring on subtle | pass |
| `--brand-deep` #086f92 | `--brand-tint` #e6f7fd | 5.16:1 | 3:1 | focus ring on brand-tint | pass |
| `--ink-3` #667085 | `--paper` #f6f7f9 | 4.64:1 | 3:1 | nav / card icon on paper | pass |
| `--ink-3` #667085 | `--surface` #ffffff | 4.97:1 | 3:1 | nav / card icon on surface | pass |
| `--ink-3` #667085 | `--subtle` #f2f4f7 | 4.51:1 | 3:1 | nav / card icon on subtle | pass |
| `--line-strong` #858d9a | `--paper` #f6f7f9 | 3.12:1 | 3:1 | input border on paper | pass |
| `--line-strong` #858d9a | `--surface` #ffffff | 3.35:1 | 3:1 | input border on surface | pass |
| `--ink` #0b0d0f | `--surface` #ffffff | 19.47:1 | 3:1 | Spent bars, lost segment on surface | pass |
| `--brand-deep` #086f92 | `--surface` #ffffff | 5.68:1 | 3:1 | Collected bar outline on surface | pass |
| `--brand` #32c5f3 | `--paper` #f6f7f9 | 1.88:1 | n/a | cyan accent on paper (decorative) | info |
| `--brand` #32c5f3 | `--surface` #ffffff | 2.02:1 | n/a | cyan accent on surface (decorative) | info |
| `--brand` #32c5f3 | `--brand-tint` #e6f7fd | 1.83:1 | n/a | cyan accent on brand-tint (decorative) | info |

Tightest pairs: `--line-strong` on `--paper` (3.12:1, needs 3) and `--ink-3` on `--subtle` (4.51:1, needs 4.5).
Cyan on light surfaces is 1.8-2.0:1, which is why it never carries text or meaning on its own.
