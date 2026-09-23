# Design system: ARQUS Sports Consultancy

A modern, simple look built from the logo's three colours: **ink black, cyan, white**.
Source of truth for tokens: `frontend/src/styles/_tokens.scss`. Material is mapped onto them in
`frontend/src/styles.scss`.

## Principles

- **Simple to scan.** One clear thing per card, generous space, big tap targets (rows are 44px+).
- **Black + cyan + white.** White cards on a soft cool-grey canvas, black for emphasis, cyan for energy
  (primary buttons, avatars, glows, icons on dark, active accents).
- **Cyan never carries text on a light background.** Text on a cyan fill is `--ink` (9.7:1).
  Blue text, links and icons on light backgrounds use `--brand-deep`. White text never sits on cyan.
- **Colour is never the only signal.** Green/red only appear with a sign or text. The active nav item is also
  bold. Locked steps say "Not available for your role".
- **Soft depth, not decoration.** Rounded corners (`--radius-*`), hairline borders and low shadows on cards.
  Gradients are limited to the cyan glow on dark hero panels.
- No purple or indigo, and no default Angular Material blue.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#0B0D0F` | Primary text, hero panels, active nav pill, dark buttons/badges |
| `--ink-2` / `--ink-3` | `#3A4147` / `#565E66` | Secondary / muted text |
| `--on-ink` / `--on-ink-2` | `#FFFFFF` / `#B9C2C9` | Text on `--ink` |
| `--paper` | `#F2F5F8` | App canvas |
| `--surface` | `#FFFFFF` | Cards, sidebar |
| `--plate` | `#E6E9EC` | Neutral chips, disabled/locked fills |
| `--line` | `#E2E6EA` | Hairlines, dividers |
| `--line-strong` | `#6B737B` | Form-control borders (3:1) |
| `--brand` | `#32C5F3` | Logo cyan. Primary button, avatar, accents, glow |
| `--brand-deep` | `#086F92` | Cyan for text, links, icons, focus rings on light backgrounds |
| `--brand-tint` | `#E3F6FD` | Hover / selected backgrounds, icon tiles |
| `--positive` / `--negative` / `--warning` (+ `-bg`) | see file | Signs, chips, errors |
| `--radius-sm/md/lg/xl` | 10 / 14 / 20 / 28px | Rows, controls, cards, hero |
| `--shadow-sm/md` | soft | Cards / hovered tiles |
| `--glow-brand` | radial cyan | Behind dark hero panels |

`--brand` was sampled from the logo with Pillow (`#32C5F3`; the logo black is `#000000`).
The supplied logo is transparent, so it sits cleanly on white.

## Type

- **Archivo Variable** (`@fontsource-variable/archivo`, self-hosted). Weight 100-900, width 62-125%.
- **Wide (`font-stretch: 125%`, `--font-wide`)** for titles (`h1`-`h3`), the top-bar page title, badges,
  avatars and `.label` captions. **Normal width** for body text and numbers.
- **Tabular figures** on globally (`font-variant-numeric: tabular-nums`); Archivo has a real `tnum` feature.
- Base size 15px. The CSS `font:` shorthand resets `font-stretch`; set it again after using `font:`.
- Do not use Inter, Roboto, Poppins or Space Grotesk.

## Components

- **Buttons:** primary = cyan fill, ink bold text, 14px radius, 48px high. Secondary = white with an ink border.
- **Fields:** 56px, 14px radius, `--line-strong` border, `--brand-deep` on focus. Errors in `--negative`.
- **Focus ring (everything):** `outline: 2px solid var(--brand-deep)`, 2px offset (inside the row for nav).
- **Sidebar:** white, full height. Logo top; nav rows 46px; active top-level item = ink pill with a cyan icon;
  groups expand to an indented list with a `--line` rule; active child = `--brand-tint` with a 3px cyan edge.
  User card (avatar, name, role, log-out) pinned at the bottom.
- **Top bar:** translucent (blurred) over the canvas. Page title, round bell, profile chip. On phones: hamburger +
  emblem + title.
- **Login:** split screen from 960px: ink panel with the "Idealize. Innovate. Achieve." tagline (from the logo)
  and ring art; white form side. Phones show the form only.
- **Dashboard:** ink hero with a time-of-day greeting; role-filtered workspace tiles; a "how a deal flows"
  strip (Lead, Won deal, Project, Payments & expenses, Margin) that links to the first page each role can open.
- **Placeholders:** white card, cyan-tint icon circle, page name, black "In development" badge.
- **Avatar:** cyan circle, ink initials (`app-user-avatar`). **Ring art:** `app-brand-art` (dark surfaces only).

## Logo

Files in `frontend/public/brand/` (served at `/brand/...`):

| File | Use |
| --- | --- |
| `arqus-logo.png` (484x284, transparent) | Sidebar (150px), login (160px) |
| `arqus-emblem.png` (285x143, transparent) | Mobile top bar (28px high) |
| `favicon-32.png`, `icon-192.png`, `icon-512.png`, `favicon.ico` | Emblem on a rounded `--paper` square |

Rules: only proportional scaling; never recolour, stretch or add effects; only on white/light backgrounds
(its black wordmark disappears on dark). Give it `alt="ARQUS Sports Consultancy"`.
Regenerate assets from the original with Pillow rather than editing the PNGs.

## Contrast

`npm run check:contrast` (`frontend/scripts/check-contrast.mjs`) reads the tokens and exits non-zero on failure.
Text needs 4.5:1; focus rings, control borders and meaningful graphics need 3:1. Re-run after changing any token
and refresh this table with `node scripts/check-contrast.mjs --md`.

Cyan on light surfaces is 1.8-2.0:1, so it is never relied on for meaning (see Principles).

| Foreground | Background | Ratio | Needs | Use | Result |
| --- | --- | --- | --- | --- | --- |
| `--ink` #0b0d0f | `--paper` #f2f5f8 | 17.79:1 | 4.5:1 | text on paper | pass |
| `--ink` #0b0d0f | `--surface` #ffffff | 19.47:1 | 4.5:1 | text on surface | pass |
| `--ink` #0b0d0f | `--plate` #e6e9ec | 15.97:1 | 4.5:1 | text on plate | pass |
| `--ink` #0b0d0f | `--brand-tint` #e3f6fd | 17.49:1 | 4.5:1 | text on brand-tint | pass |
| `--ink` #0b0d0f | `--brand` #32c5f3 | 9.66:1 | 4.5:1 | text on brand | pass |
| `--on-ink` #ffffff | `--ink` #0b0d0f | 19.47:1 | 4.5:1 | text on ink (hero, active nav) | pass |
| `--on-ink-2` #b9c2c9 | `--ink` #0b0d0f | 10.78:1 | 4.5:1 | secondary text on ink | pass |
| `--ink-2` #3a4147 | `--paper` #f2f5f8 | 9.47:1 | 4.5:1 | secondary text on paper | pass |
| `--ink-2` #3a4147 | `--surface` #ffffff | 10.36:1 | 4.5:1 | secondary text on surface | pass |
| `--ink-2` #3a4147 | `--plate` #e6e9ec | 8.50:1 | 4.5:1 | secondary text on plate | pass |
| `--ink-2` #3a4147 | `--brand-tint` #e3f6fd | 9.31:1 | 4.5:1 | secondary text on brand-tint | pass |
| `--ink-3` #565e66 | `--paper` #f2f5f8 | 6.02:1 | 4.5:1 | muted text on paper | pass |
| `--ink-3` #565e66 | `--surface` #ffffff | 6.59:1 | 4.5:1 | muted text on surface | pass |
| `--ink-3` #565e66 | `--plate` #e6e9ec | 5.40:1 | 4.5:1 | muted text on plate | pass |
| `--ink-3` #565e66 | `--brand-tint` #e3f6fd | 5.92:1 | 4.5:1 | muted text on brand-tint | pass |
| `--brand-deep` #086f92 | `--paper` #f2f5f8 | 5.19:1 | 4.5:1 | link/icon on paper | pass |
| `--brand-deep` #086f92 | `--surface` #ffffff | 5.68:1 | 4.5:1 | link/icon on surface | pass |
| `--brand-deep` #086f92 | `--plate` #e6e9ec | 4.66:1 | 4.5:1 | link/icon on plate | pass |
| `--brand-deep` #086f92 | `--brand-tint` #e3f6fd | 5.10:1 | 4.5:1 | link/icon on brand-tint | pass |
| `--positive` #17663a | `--positive-bg` #ddf1e4 | 5.93:1 | 4.5:1 | positive chip text | pass |
| `--positive` #17663a | `--surface` #ffffff | 7.00:1 | 4.5:1 | positive text on surface | pass |
| `--negative` #a82a1e | `--negative-bg` #fbe4e1 | 5.73:1 | 4.5:1 | negative chip text | pass |
| `--negative` #a82a1e | `--surface` #ffffff | 6.97:1 | 4.5:1 | negative text on surface | pass |
| `--warning` #7a4b00 | `--warning-bg` #fdefcf | 6.50:1 | 4.5:1 | warning chip text | pass |
| `--warning` #7a4b00 | `--surface` #ffffff | 7.41:1 | 4.5:1 | warning text on surface | pass |
| `--brand-deep` #086f92 | `--paper` #f2f5f8 | 5.19:1 | 3:1 | focus ring on paper | pass |
| `--brand-deep` #086f92 | `--surface` #ffffff | 5.68:1 | 3:1 | focus ring on surface | pass |
| `--brand-deep` #086f92 | `--plate` #e6e9ec | 4.66:1 | 3:1 | focus ring on plate | pass |
| `--brand-deep` #086f92 | `--brand-tint` #e3f6fd | 5.10:1 | 3:1 | focus ring on brand-tint | pass |
| `--ink` #0b0d0f | `--surface` #ffffff | 19.47:1 | 3:1 | outline button border on surface | pass |
| `--ink` #0b0d0f | `--plate` #e6e9ec | 15.97:1 | 3:1 | outline button border on plate | pass |
| `--ink` #0b0d0f | `--paper` #f2f5f8 | 17.79:1 | 3:1 | outline button border on paper | pass |
| `--brand` #32c5f3 | `--ink` #0b0d0f | 9.66:1 | 3:1 | cyan icon / art on ink (active nav icon, hero) | pass |
| `--ink-3` #565e66 | `--paper` #f2f5f8 | 6.02:1 | 3:1 | inactive nav icon on paper | pass |
| `--ink-3` #565e66 | `--surface` #ffffff | 6.59:1 | 3:1 | inactive nav icon on surface | pass |
| `--line-strong` #6b737b | `--surface` #ffffff | 4.81:1 | 3:1 | form field border on surface | pass |
| `--line-strong` #6b737b | `--plate` #e6e9ec | 3.95:1 | 3:1 | form field border on plate | pass |
| `--line-strong` #6b737b | `--paper` #f2f5f8 | 4.40:1 | 3:1 | form field border on paper | pass |
| `--brand` #32c5f3 | `--paper` #f2f5f8 | 1.84:1 | n/a | cyan accent on paper (decorative) | info |
| `--brand` #32c5f3 | `--surface` #ffffff | 2.02:1 | n/a | cyan accent on surface (decorative) | info |

Tightest margins: `--line-strong` on `--plate` (3.95:1, needs 3) and `--brand-deep` on `--plate` (4.66:1, needs 4.5). If `--plate` gets darker, darken those two too.

## Not built yet

- **Mobile bottom tab bar:** mobile uses the hamburger drawer today.
- **Real dashboard data** (received, spend, margin, charts): the dashboard shows navigation only, with no invented
  numbers. When added: Collected = `--brand`, Spent = `--ink`, green/red only for signs and chips.
- **Dark theme:** a future override of the same variable names.
