# Design system: ARQUS Sports Consultancy

Colour, logo and type only. Layout, components and behaviour are defined elsewhere.
Source of truth for tokens: `frontend/src/styles/_tokens.scss`. Material is mapped onto them in
`frontend/src/styles.scss`.

## Principles

- **Cyan is a signal, not a fill.** Under about 10% of any screen.
  Allowed: the 2px active-nav bar, the login accent line, progress fill, the "collected" chart series,
  small selected states.
- **Cyan never carries text on a light background, and white text never sits on cyan.**
  Text on a cyan fill is `--ink`. Blue text, links and icons use `--brand-deep`.
- **Colour is never the only signal.** Green/red only appear with a sign or text (status chips always show
  their label). The active nav item is also bold, not just cyan-barred.
- No gradients, glows or decorative shadows. No purple or indigo. No black sidebar (the logo's black
  wordmark would vanish). No default Angular Material blue.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#0B0D0F` | Primary text, primary button fill |
| `--ink-2` | `#3A4147` | Secondary text |
| `--ink-3` | `#565E66` | Muted text, group labels |
| `--on-ink` | `#FFFFFF` | Text on an `--ink` fill |
| `--paper` | `#F4F5F6` | Page background, `theme-color` |
| `--surface` | `#FFFFFF` | Bordered panels, top bar, secondary buttons |
| `--plate` | `#E6E6E6` | Sidebar and login panel (the logo sits on it) |
| `--line` | `#D9DCDF` | Decorative hairlines and dividers |
| `--line-strong` | `#6B737B` | Form-field borders (needs 3:1, so `--line` is too light) |
| `--brand` | `#32C5F3` | Sampled from the logo. Signal only |
| `--brand-deep` | `#086F92` | Links, icons, focus rings on light backgrounds |
| `--brand-tint` | `#E3F6FD` | Hover and selected backgrounds |
| `--positive` / `-bg` | `#17663A` / `#DDF1E4` | Green: signs, chips |
| `--negative` / `-bg` | `#A82A1E` / `#FBE4E1` | Brick red: signs, chips, negative margin, errors |
| `--warning` / `-bg` | `#7A4B00` / `#FDEFCF` | Amber: text-safe dark amber for chips |

How the logo colours were obtained: `--brand` was sampled with Pillow (most common saturated pixel
of `arqus-logo`: `#32C5F3`; logo black is `#000000`). **The supplied logo is a transparent PNG/WebP with no
grey background,** so there was no grey to sample. `--plate` `#E6E6E6` is the value from the brief, and the
transparent logo blends into it (and into `--paper`/`--surface`) with clean edges. Only dark and cyan
pixels exist at the antialiased edges, so there is no halo.

## Type

- **Archivo Variable** (`@fontsource-variable/archivo`, `wdth.css`, self-hosted, OFL). Axes: weight 100-900,
  width 62-125%.
- **Wide (`font-stretch: 125%`, token `--font-wide`)** for page titles (`h1`-`h3`), the top-bar page title,
  sidebar group labels, status chips and `.label` captions. Small labels are uppercase with
  `letter-spacing: 0.06em`.
- **Normal width (100%)** for body text and numbers.
- **Tabular figures** are on globally (`font-variant-numeric: tabular-nums`). Archivo has a real `tnum`
  OpenType feature (verified with fontTools), so no numeral fallback font is used.
- Do not use Inter, Roboto, Poppins or Space Grotesk.
- Note: the CSS `font:` shorthand resets `font-stretch`. When a component styles a title with `font:`,
  set `font-stretch: var(--font-wide)` afterwards.

## Interactive states

- **Primary button:** `--ink` fill, white text. **Secondary:** `--surface` fill, `--ink` hairline border.
- **Focus ring (everything):** `outline: 2px solid var(--brand-deep)` with a 2px offset. Sidebar rows draw it
  inside (`-2px`) so the drawer edge can't clip it. Text inputs show the ring as a `--brand-deep` notched border.
- **Hover / selected background:** `--brand-tint`. The active sidebar row has no fill.

## Logo

Files in `frontend/public/brand/` (served at `/brand/...`):

| File | Use |
| --- | --- |
| `arqus-logo.png` (484x284, transparent) | Sidebar/drawer top (max 168px wide), login panel (max 220px) |
| `arqus-emblem.png` (285x143, transparent) | Mobile top bar (28px high) |
| `favicon-32.png`, `icon-192.png`, `icon-512.png`, `favicon.ico` | Emblem centred on a rounded `--paper` square so the black ring stays visible on dark browser tabs |

Rules:

- Only proportional scaling. Never recolour, stretch, crop the wordmark, or add effects.
- Put it on `--plate`, `--paper` or `--surface`. Never on a dark or cyan background.
- Give the full logo `alt="ARQUS Sports Consultancy"`. The emblem next to a page title uses `alt="ARQUS"`.
- The emblem was cut from the logo by cropping above the wordmark and erasing wordmark pixels that touched
  the swoosh tails. Regenerate assets from the original with Pillow rather than editing the PNGs by hand.

## Contrast

Checked by `npm run check:contrast` (`frontend/scripts/check-contrast.mjs`), which reads the tokens file and
exits non-zero on any failure. Text needs 4.5:1. Focus rings, control borders and meaningful graphics need 3:1.
Re-run it after changing any token, and paste the fresh table here (`node scripts/check-contrast.mjs --md`).

Cyan (`--brand`) is **not** gated: it is 1.6-2.0:1 on the light surfaces, which is why it is decorative only.
The active nav item is also bold and the login line is purely an accent, so nothing depends on seeing cyan.

| Foreground | Background | Ratio | Needs | Use | Result |
| --- | --- | --- | --- | --- | --- |
| `--ink` #0b0d0f | `--paper` #f4f5f6 | 17.83:1 | 4.5:1 | text on paper | pass |
| `--ink` #0b0d0f | `--surface` #ffffff | 19.47:1 | 4.5:1 | text on surface | pass |
| `--ink` #0b0d0f | `--plate` #e6e6e6 | 15.60:1 | 4.5:1 | text on plate | pass |
| `--ink` #0b0d0f | `--brand-tint` #e3f6fd | 17.49:1 | 4.5:1 | text on brand-tint | pass |
| `--ink` #0b0d0f | `--brand` #32c5f3 | 9.66:1 | 4.5:1 | text on brand | pass |
| `--on-ink` #ffffff | `--ink` #0b0d0f | 19.47:1 | 4.5:1 | primary button label | pass |
| `--ink-2` #3a4147 | `--paper` #f4f5f6 | 9.49:1 | 4.5:1 | secondary text on paper | pass |
| `--ink-2` #3a4147 | `--surface` #ffffff | 10.36:1 | 4.5:1 | secondary text on surface | pass |
| `--ink-2` #3a4147 | `--plate` #e6e6e6 | 8.30:1 | 4.5:1 | secondary text on plate | pass |
| `--ink-2` #3a4147 | `--brand-tint` #e3f6fd | 9.31:1 | 4.5:1 | secondary text on brand-tint | pass |
| `--ink-3` #565e66 | `--paper` #f4f5f6 | 6.03:1 | 4.5:1 | muted text on paper | pass |
| `--ink-3` #565e66 | `--surface` #ffffff | 6.59:1 | 4.5:1 | muted text on surface | pass |
| `--ink-3` #565e66 | `--plate` #e6e6e6 | 5.28:1 | 4.5:1 | muted text on plate | pass |
| `--ink-3` #565e66 | `--brand-tint` #e3f6fd | 5.92:1 | 4.5:1 | muted text on brand-tint | pass |
| `--brand-deep` #086f92 | `--paper` #f4f5f6 | 5.20:1 | 4.5:1 | link/icon on paper | pass |
| `--brand-deep` #086f92 | `--surface` #ffffff | 5.68:1 | 4.5:1 | link/icon on surface | pass |
| `--brand-deep` #086f92 | `--plate` #e6e6e6 | 4.55:1 | 4.5:1 | link/icon on plate | pass |
| `--brand-deep` #086f92 | `--brand-tint` #e3f6fd | 5.10:1 | 4.5:1 | link/icon on brand-tint | pass |
| `--positive` #17663a | `--positive-bg` #ddf1e4 | 5.93:1 | 4.5:1 | positive chip text | pass |
| `--positive` #17663a | `--surface` #ffffff | 7.00:1 | 4.5:1 | positive text on surface | pass |
| `--negative` #a82a1e | `--negative-bg` #fbe4e1 | 5.73:1 | 4.5:1 | negative chip text | pass |
| `--negative` #a82a1e | `--surface` #ffffff | 6.97:1 | 4.5:1 | negative text on surface | pass |
| `--warning` #7a4b00 | `--warning-bg` #fdefcf | 6.50:1 | 4.5:1 | warning chip text | pass |
| `--warning` #7a4b00 | `--surface` #ffffff | 7.41:1 | 4.5:1 | warning text on surface | pass |
| `--brand-deep` #086f92 | `--paper` #f4f5f6 | 5.20:1 | 3:1 | focus ring on paper | pass |
| `--brand-deep` #086f92 | `--surface` #ffffff | 5.68:1 | 3:1 | focus ring on surface | pass |
| `--brand-deep` #086f92 | `--plate` #e6e6e6 | 4.55:1 | 3:1 | focus ring on plate | pass |
| `--brand-deep` #086f92 | `--brand-tint` #e3f6fd | 5.10:1 | 3:1 | focus ring on brand-tint | pass |
| `--ink` #0b0d0f | `--surface` #ffffff | 19.47:1 | 3:1 | outline button border on surface | pass |
| `--ink` #0b0d0f | `--plate` #e6e6e6 | 15.60:1 | 3:1 | outline button border on plate | pass |
| `--ink` #0b0d0f | `--paper` #f4f5f6 | 17.83:1 | 3:1 | outline button border on paper | pass |
| `--line-strong` #6b737b | `--surface` #ffffff | 4.81:1 | 3:1 | form field border on surface | pass |
| `--line-strong` #6b737b | `--plate` #e6e6e6 | 3.86:1 | 3:1 | form field border on plate | pass |
| `--line-strong` #6b737b | `--paper` #f4f5f6 | 4.41:1 | 3:1 | form field border on paper | pass |
| `--brand` #32c5f3 | `--paper` #f4f5f6 | 1.85:1 | n/a | cyan bar on paper (decorative) | info |
| `--brand` #32c5f3 | `--surface` #ffffff | 2.02:1 | n/a | cyan bar on surface (decorative) | info |
| `--brand` #32c5f3 | `--plate` #e6e6e6 | 1.62:1 | n/a | cyan bar on plate (decorative) | info |

Tightest margins: `--brand-deep` on `--plate` 4.55:1 (text minimum 4.5) and `--line-strong` on `--plate` 3.86:1.
If `--plate` gets darker, `--brand-deep` must be darkened too.

## Not built yet (documented so it isn't forgotten)

These parts of the brand brief describe UI that does not exist in the app yet. Apply the rules above when they
are built:

- **Mobile bottom tab bar:** `--surface`, hairline top border, active tab = ink icon + label with a 2px
  `--brand` bar above. Mobile currently uses the hamburger drawer.
- **Dashboard:** hero "Received" figure in `--ink`; progress bar `--brand` on a `--line` track; trend chart
  Collected = `--brand` fill with 1px `--brand-deep` outline, Spent = `--ink`; ranked bars `--brand-deep` on
  `--line`; green/red only for signs, chips and negative margin.
- **Dark theme:** a future override of the same variable names.
