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
- Depth and gradients are allowed (see "Polish layer" below); shadows use the layered `--shadow-1/2/3` tokens.

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
- **Icons:** Material Symbols Outlined at 18-20px, light weight. KPI icons sit in 36px, 10px-radius chips filled
  with the card's tint (`--tint-*`) and drawn in the matching `--tint-*-ink`.

## Polish layer (supersedes the earlier "no gradients, glows or shadows" rule)

Gradients, layered shadows, soft glows and subtle motion are allowed. Still binding: ink + cyan only (no
purple/indigo), text >= 4.5:1, cyan never as text on light backgrounds (fine on the dark `--grad-ink`), meaning
never by colour alone, pure CSS/SVG, animate only `transform`/`opacity`, modest blur radii, and everything off
under `prefers-reduced-motion`.

| Token | Use |
| --- | --- |
| `--shadow-1` / `--shadow-2` / `--shadow-3` | Resting card / hover (with a faint cyan layer) / floating (auth card) |
| `--highlight` | 1px white inner top highlight on cards |
| `--grad-ink` | Ink to deep teal-navy `--deep-navy` `#0E2A36`: auth brand panel, hero KPI, primary auth button |
| `--grad-brand`, `--grad-teal` | Fills only (bars, split segments), never behind text |
| `--wash` | Page background: paper + cyan glow top-right + warm-grey glow bottom-left |
| `--tint-cyan/teal/amber/rose/slate` + `-ink` | Icon chips, count pills, corner glows; `-ink` is the text/icon tone on the tint |
| `--glow-cyan` | Active nav item |
| `--ring` | Focus: 2px `--brand-deep` outline plus a 3px cyan ring (35%) outside it |

- **Auth pages:** from 1024px a 55/45 split: the brand panel (ink gradient, drifting blurred orbs, dot grid, three
  perspective rings with pointer parallax, glass chips, headline) and the form card on `--wash`. Phones: a 220px dark
  header with the form card overlapping it by 40px. The pointer tilt/parallax (`PointerTilt` directive) is desktop
  only and off with reduced motion.
- **Emblem rule:** the logo and emblem are black, so they only ever sit on white. On dark surfaces the emblem goes
  on a frosted white disc (`rgba(255,255,255,.94)` with a cyan glow behind it); the full logo stays on the white card.
- **Dashboard:** hero KPI on `--grad-ink` with white text and a translucent signed delta chip; other KPIs are white
  with a tinted corner glow and icon chip; "Waiting on you" count pills tinted by severity; chart bars use vertical
  gradients with 6px rounded tops, dashed gridlines, and a value label on hover; cards rise in with a 40ms stagger.

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
  - Header is 64px, the same as the top bar, so their bottom borders form one line: emblem + "ARQUS / Sports
    Consultancy" in type (the full logo's tagline is unreadable at sidebar size; the full logo stays on login).
  - Expanded 256px: 36px rows with 2px gaps; groups are accordions (one open at a time; the group holding the current
    page opens by itself and reads bold). Children are 32px, 13px text, on a 1px guide line under the parent icon.
    A closed group takes exactly 0px (the accordion clip has no padding).
  - Rail 72px: emblem, icons only. Every icon has a tooltip on hover and keyboard focus. Groups open a CDK-menu
    flyout beside the icon; arrow keys move, Escape closes and returns focus to the icon.
  - Toggle: panel icon button in the header (in the rail: just below the emblem) (`aria-expanded`, `aria-controls="app-sidebar"`, label
    "Collapse sidebar" / "Expand sidebar") and **Ctrl/Cmd+B**. Saved in `localStorage` (`crm.sidebar.collapsed`,
    wrapped in try/catch). First visit: expanded at >= 1280px, rail at 1024-1279px.
  - Content follows `--sidebar-w` (set on the shell), animated.
  - Active item: `--brand-tint` background, ink text weight 600, 3px `--brand` bar with a rounded end on the left.
    Active child: tint + ink 600, and its stretch of the guide line turns `--brand`. In the rail, the active icon sits
    on a `--brand-tint` square. Hover: light grey. Chevrons are 16px in `--line-strong`.
  - Bottom: flat user row with a top hairline (initials avatar, name, role, log-out). In the rail: the avatar opens an account menu.
- **Below 1024px:** no rail and no toggle. Top bar + bottom tab bar (the first four role-visible sections + "More",
  which opens a bottom sheet with every page and Log out). Active tab: ink icon and label, 3px cyan bar above.
- **Top bar:** flat white, 1px bottom border, 64px. Page title (the page's `h1`, 24px/600) with an optional subtitle
  (pages set `LayoutService.subtitle`). Right: "Search Ctrl K" (desktop) opening the command palette over the
  role-visible pages, the bell (dot when unread > 0) and the avatar menu. Mobile: title, bell, avatar only.

## Dashboard

- **Bento layout:** a 12-column grid driven by container queries on the content width. Row 1: cash-flow hero (8) + Waiting on you (4). Row 2: four KPI cards. Row 3: Projects (5) + Lead funnel (7). Row 4: Leaderboard, Lead sources, Collections aging (4 each). Row 5: Recent (8) + Activity (4). Two columns below ~980px of content (hero and Recent full width); one column on phones, with the KPIs 2x2.
- **Header:** an insight line composed from the API counts ("You're all caught up." when nothing is waiting), the period switcher (`?period=`), "Updated N min ago" (30s tick), refresh and one "+ New" menu. On mobile, "+ New" is a FAB above the tab bar. The page title and date stay in the top bar.
- **Panel header pattern (`app-panel-head`):** a title, one muted subtitle, and a "View all" link or a control on the right. Every panel uses it.
- **New tokens:** `--surface-2`, `--line-cyan`, `--grad-accent` (login card), and the graphics-only `--data-cyan / teal / ink / amber / orange / rose / slate` for chart marks. They are never used for text, so they are not in the text contrast gate.
- **Charts:** hand-built SVG, no library. Money shown on screen always comes from API strings; `Number()` is used only for geometry. Every chart has a text equivalent (a labelled list, figures beside it, or a hidden table), so colour never carries meaning alone.

## Leads

- **Status tints** (always with the word, never colour alone): New = slate, Contacted = cyan, Interested = amber, Won = teal, Lost = rose; `--tint-*` fill with `--tint-*-ink` text. Board column dots use the matching `--data-*` colour.
- **Follow-up pill:** overdue = rose with "3d overdue", today = amber with the time, later = quiet grey, none = muted text. Times are shown in IST.
- **Panels** reuse the dashboard's `app-panel-head` (title, muted subtitle, right-side control); cards use `.card`, `.rise-in`, skeletons shaped like the real rows and cards.
- **Lead header card:** a soft radial glow tinted by the status; avatars get a deterministic token tint from the name.
- **Phones:** tables become cards with 44px+ Call / WhatsApp buttons; filters move into a bottom sheet; the detail page has a sticky Call | WhatsApp | Log bar.

Contrast of the pairs the Leads screens add (all at least 4.5:1):

| Foreground | Background | Ratio | Use | Result |
| --- | --- | --- | --- | --- |
| `--tint-slate-ink` | `--tint-slate` | 8.91:1 | New status chip | pass |
| `--tint-cyan-ink` | `--tint-cyan` | 6.50:1 | Contacted status chip, top leaderboard | pass |
| `--tint-amber-ink` | `--tint-amber` | 6.77:1 | Interested chip, due-today pill, duplicate notice | pass |
| `--tint-teal-ink` | `--tint-teal` | 6.49:1 | Won chip, WhatsApp preview | pass |
| `--tint-rose-ink` | `--tint-rose` | 6.22:1 | Lost chip, overdue pill | pass |
| `--tint-amber-ink` | `--surface` | 7.63:1 | Follow-up nudge | pass |
| `--tint-rose-ink` | `--surface` | 7.36:1 | Lost reason, days overdue | pass |
| `--ink-2` | `--subtle` | 9.16:1 | Upcoming follow-up pill, chip counts | pass |
| `--ink-3` | `--subtle` | 4.51:1 | Table header | pass |
| `--ink-2` | `--surface-2` | 9.40:1 | Row hover text | pass |
| `--ink` | `--brand-tint` | 17.69:1 | Selected row / option | pass |
| `--on-ink` | `--ink` | 19.47:1 | Pressed filter chip, bulk bar | pass |
| `--brand-deep` | `--surface` | 5.68:1 | Links (Reassign, Edit, Open lead) | pass |
| `--negative` | `--surface` | 6.57:1 | Field errors | pass |
| `--ink-3` | `--surface-2` | 4.64:1 | Muted cells on row hover | pass |
| `--ink-3` | `--brand-tint` | 4.52:1 | Muted cells on a selected row | pass |

## Logo

`frontend/public/brand/`: `arqus-logo.png` (expanded sidebar, login), `arqus-emblem.png` (rail, mobile top bar),
favicons. Proportional scaling only, never recoloured, only on white or light backgrounds.

## Contrast

Generated by `node scripts/check-contrast.mjs --md` (run from `frontend/`).

PASS  18.16:1  (>= 4.5)  --ink on --paper  heading/text on paper
PASS  19.47:1  (>= 4.5)  --ink on --surface  heading/text on surface
PASS  17.67:1  (>= 4.5)  --ink on --subtle  heading/text on subtle
PASS  16.46:1  (>= 4.5)  --ink on --plate  heading/text on plate
PASS  17.69:1  (>= 4.5)  --ink on --brand-tint  heading/text on brand-tint
PASS  9.66:1   (>= 4.5)  --ink on --brand  heading/text on brand
PASS  19.47:1  (>= 4.5)  --on-ink on --ink  text on ink (primary button, tooltip)
PASS  9.41:1   (>= 4.5)  --ink-2 on --paper  body text on paper
PASS  10.09:1  (>= 4.5)  --ink-2 on --surface  body text on surface
PASS  9.16:1   (>= 4.5)  --ink-2 on --subtle  body text on subtle
PASS  9.17:1   (>= 4.5)  --ink-2 on --brand-tint  body text on brand-tint
PASS  4.64:1   (>= 4.5)  --ink-3 on --paper  muted text on paper
PASS  4.97:1   (>= 4.5)  --ink-3 on --surface  muted text on surface
PASS  4.51:1   (>= 4.5)  --ink-3 on --subtle  muted text on subtle
PASS  4.52:1   (>= 4.5)  --ink-3 on --brand-tint  muted text on brand-tint
PASS  5.30:1   (>= 4.5)  --brand-deep on --paper  link on paper
PASS  5.68:1   (>= 4.5)  --brand-deep on --surface  link on surface
PASS  5.15:1   (>= 4.5)  --brand-deep on --subtle  link on subtle
PASS  5.16:1   (>= 4.5)  --brand-deep on --brand-tint  link on brand-tint
PASS  6.13:1   (>= 4.5)  --positive on --positive-bg  positive chip text
PASS  7.00:1   (>= 4.5)  --positive on --surface  positive text on surface
PASS  5.75:1   (>= 4.5)  --negative on --negative-bg  negative chip text
PASS  6.57:1   (>= 4.5)  --negative on --surface  negative text on surface
PASS  6.91:1   (>= 4.5)  --warning on --warning-bg  warning chip text
PASS  7.52:1   (>= 4.5)  --warning on --surface  warning text on surface
PASS  5.30:1   (>= 3)  --brand-deep on --paper  focus ring on paper
PASS  5.68:1   (>= 3)  --brand-deep on --surface  focus ring on surface
PASS  5.15:1   (>= 3)  --brand-deep on --subtle  focus ring on subtle
PASS  5.16:1   (>= 3)  --brand-deep on --brand-tint  focus ring on brand-tint
PASS  4.64:1   (>= 3)  --ink-3 on --paper  nav / card icon on paper
PASS  4.97:1   (>= 3)  --ink-3 on --surface  nav / card icon on surface
PASS  4.51:1   (>= 3)  --ink-3 on --subtle  nav / card icon on subtle
PASS  3.12:1   (>= 3)  --line-strong on --paper  input border on paper
PASS  3.35:1   (>= 3)  --line-strong on --surface  input border on surface
PASS  19.47:1  (>= 3)  --ink on --surface  Spent bars, lost segment on surface
PASS  5.68:1   (>= 3)  --brand-deep on --surface  Collected bar outline on surface
PASS  6.50:1   (>= 4.5)  --tint-cyan-ink on --tint-cyan  cyan pill text/icon
PASS  6.49:1   (>= 4.5)  --tint-teal-ink on --tint-teal  teal pill text/icon
PASS  6.77:1   (>= 4.5)  --tint-amber-ink on --tint-amber  amber pill text/icon
PASS  6.22:1   (>= 4.5)  --tint-rose-ink on --tint-rose  rose pill text/icon
PASS  8.91:1   (>= 4.5)  --tint-slate-ink on --tint-slate  slate pill text/icon
PASS  19.47:1  (>= 4.5)  --on-ink on --ink  white text on --grad-ink (ink end)
PASS  14.97:1  (>= 4.5)  --on-ink on --deep-navy  white text on --grad-ink (deep-navy end)
PASS  9.66:1   (>= 4.5)  --brand on --ink  cyan text/sparkline on --grad-ink (ink end)
PASS  7.42:1   (>= 4.5)  --brand on --deep-navy  cyan text/sparkline on --grad-ink (deep-navy end)
PASS  8.91:1   (>= 4.5)  --ink-2 on --tint-slate  inactive pill-tab label on slate tint
PASS  18.14:1  (>= 4.5)  --ink on --surface-2  typed text in a filled input
PASS  4.64:1   (>= 3)  --ink-3 on --surface-2  leading icon in a filled input
PASS  3.12:1   (>= 3)  --line-strong on --surface-2  filled input border
INFO  1.88:1   (decorative)  --brand on --paper  cyan accent on paper
INFO  2.02:1   (decorative)  --brand on --surface  cyan accent on surface
INFO  1.83:1   (decorative)  --brand on --brand-tint  cyan accent on brand-tint

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
| `--tint-cyan-ink` #075e7c | `--tint-cyan` #e3f6fd | 6.50:1 | 4.5:1 | cyan pill text/icon | pass |
| `--tint-teal-ink` #0b6152 | `--tint-teal` #dff5f1 | 6.49:1 | 4.5:1 | teal pill text/icon | pass |
| `--tint-amber-ink` #86400b | `--tint-amber` #fdf0d9 | 6.77:1 | 4.5:1 | amber pill text/icon | pass |
| `--tint-rose-ink` #a52319 | `--tint-rose` #fde7e7 | 6.22:1 | 4.5:1 | rose pill text/icon | pass |
| `--tint-slate-ink` #3b4250 | `--tint-slate` #eef1f5 | 8.91:1 | 4.5:1 | slate pill text/icon | pass |
| `--on-ink` #ffffff | `--ink` #0b0d0f | 19.47:1 | 4.5:1 | white text on --grad-ink (ink end) | pass |
| `--on-ink` #ffffff | `--deep-navy` #0e2a36 | 14.97:1 | 4.5:1 | white text on --grad-ink (deep-navy end) | pass |
| `--brand` #32c5f3 | `--ink` #0b0d0f | 9.66:1 | 4.5:1 | cyan text/sparkline on --grad-ink (ink end) | pass |
| `--brand` #32c5f3 | `--deep-navy` #0e2a36 | 7.42:1 | 4.5:1 | cyan text/sparkline on --grad-ink (deep-navy end) | pass |
| `--ink-2` #3b4250 | `--tint-slate` #eef1f5 | 8.91:1 | 4.5:1 | inactive pill-tab label on slate tint | pass |
| `--ink` #0b0d0f | `--surface-2` #f5f7fa | 18.14:1 | 4.5:1 | typed text in a filled input | pass |
| `--ink-3` #667085 | `--surface-2` #f5f7fa | 4.64:1 | 3:1 | leading icon in a filled input | pass |
| `--line-strong` #858d9a | `--surface-2` #f5f7fa | 3.12:1 | 3:1 | filled input border | pass |
| `--brand` #32c5f3 | `--paper` #f6f7f9 | 1.88:1 | n/a | cyan accent on paper (decorative) | info |
| `--brand` #32c5f3 | `--surface` #ffffff | 2.02:1 | n/a | cyan accent on surface (decorative) | info |
| `--brand` #32c5f3 | `--brand-tint` #e6f7fd | 1.83:1 | n/a | cyan accent on brand-tint (decorative) | info |

49/49 pairs pass

