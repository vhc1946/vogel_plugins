# Vogel palette, contrast rules and brand switch

## The eight colours

The palette is **closed**. Ten values total — these eight plus `#FFFFFF` and `#000000` —
are the entire vocabulary. Every tint, hover state, hairline, page wash and row stripe is
`rgba()` over one of them. That single rule is why the existing Vogel pages look like one
family, and it survives regardless of how many members the palette has.

Adding a colour means adding it to **both** the `:root` block in `assets/vogel-theme.css`
**and** the `PALETTE` list in `scripts/verify.pysrc`. Never inline a hex value that is not
in that list. The verify gate fails the build if you do.

| Token | Hex | Role |
|---|---|---|
| `--v-navy` | `#0F4577` | Primary surface. Mastheads, footers, table headers, the switcher. Also the heading colour on white. |
| `--v-red` | `#CF152D` | Vogel Heating accent. Stripes, badges, step numbers, buttons, warnings. |
| `--v-blue-mid` | `#1D679B` | Secondary surface. BEE's accent fill. Second series in a chart. |
| `--v-blue-bright` | `#2889C4` | BEE's stripe. Third chart series. Hairlines and fills. |
| `--v-blue-pale` | `#A7DBFF` | Row tints, quiet badges, fourth chart series, links on a navy ground. |
| `--v-ink` | `#434343` | Body text on white. Softer than pure black and easier to read at length. |
| `--v-gray` | `#74777D` | Micro-labels and captions only. See the warning below. |
| `--v-red-bright` | `#FF3E23` | Hover and active states on red controls. Urgent highlight. Fill only. |

## Contrast — the part that is not obvious

Measured against white, WCAG 2.1. **Three of the eight cannot legally carry body text**,
and the numbers are close enough that guessing gets it wrong.

| Colour | On white | Verdict |
|---|---|---|
| `--v-ink` `#434343` | **9.89:1** | Body text. This is the default. |
| `--v-navy` `#0F4577` | **9.82:1** | Any text, any size. White on navy is the same 9.82:1. |
| `--v-blue-mid` `#1D679B` | **6.06:1** | Any text. White on it: 6.06:1. |
| `--v-red` `#CF152D` | **5.53:1** | Any text. White on it: 5.53:1. |
| `--v-gray` `#74777D` | **4.49:1** | ✗ **Fails AA by 0.01.** Large text only (≥24px, or ≥18.7px bold). |
| `--v-blue-bright` `#2889C4` | **3.84:1** | ✗ Fill and large text only. Never body text; never white text on it. |
| `--v-red-bright` `#FF3E23` | **3.52:1** | ✗ Fill only. Never text of any size. |
| `--v-blue-pale` `#A7DBFF` | **1.48:1** | ✗ Fill only. Put `--v-navy` on it (6.65:1) or `--v-ink` (6.70:1). |

`--v-gray` failing by one hundredth of a point is the trap worth remembering. It looks like
a normal body gray and it is not one. Use it only for the condensed uppercase micro-labels
(`.eyebrow`, `.tile-label`, `.bar-labels`, `.footer`) whose content is restated by the value
sitting next to them. Anything the reader actually has to read is `--v-ink`.

`--v-blue-bright` is the other trap, because it *looks* like a usable button colour. White
on it is 3.84:1. That is why BEE's accent fill is `--v-blue-mid` and `--v-blue-bright` is
demoted to the stripe.

## Brand switch

One attribute on `<html>`:

```html
<html lang="en" data-brand="vhc">   <!-- Vogel Heating and Cooling -->
<html lang="en" data-brand="bee">   <!-- Building Envelope Experts -->
```

Navy stays the masthead surface in both brands. Layout, spacing and type do not change.
Only four tokens move:

| Token | `vhc` | `bee` | What it is used for |
|---|---|---|---|
| `--brand-accent` | `--v-red` | `--v-blue-mid` | **Fills that carry white text.** Badges, step numbers, buttons. Must clear 4.5:1 against white, which is why BEE uses `--v-blue-mid` and not `--v-blue-bright`. |
| `--brand-rule` | `--v-red` | `--v-blue-bright` | **Stripes and hairlines only.** Never a text background, so it is free to be the brighter blue. |
| `--brand-hover` | `--v-red-bright` | `--v-blue-bright` | Hover state on `.btn`. |
| `--brand-tint` | red at 6% | bright blue at 10% | Callout washes. |

**`.warn` is always red in both brands.** It is a semantic role — "this will cost you" —
not a brand accent, so it must not move when `data-brand` changes. A BEE page with a blue
warning box has lost the distinction between "pay attention" and "this is our colour".

Default to `vhc` when the brand is not stated. `:root` carries the `vhc` values so a page
that forgets the attribute still renders correctly rather than falling back to unstyled.

## The logo files are not exactly the palette

Sampled from the actual artwork in `assets/`:

| Asset | Sampled | Nearest palette token | Note |
|---|---|---|---|
| `v-mark.png` | `#D02030` → `#961B1F` | `--v-red` `#CF152D` | The mark is a **gradient**, brand red into a dark maroon. Neither endpoint is a palette value. |
| `vogel-wordmark-color.png` | `#D02030` red, `#0E4677` navy | `--v-red`, `--v-navy` | Navy is effectively exact. Red is two points off in green. |
| `bee-logo-color.png` | `#104877` navy, `#686767` gray | `--v-navy` | The BEE gray is **not** `--v-gray` `#74777D` — it is its own darker neutral. |

Practical consequence: **do not butt a `--v-red` fill directly against the red in a logo.**
A `#CF152D` block flush against the `#D02030` in the wordmark shows a faint seam. Leave
whitespace, or put the logo on navy — which is what the masthead does, and why. The palette
values are authoritative for everything the CSS draws; the logo artwork is authoritative for
itself and is never recoloured.

## Tints in use

These are the only derived values, all defined once in `:root`:

```css
--wash:      rgba(var(--v-navy-rgb), 0.14);   /* page background behind .page */
--rule:      rgba(var(--v-navy-rgb), 0.12);   /* every hairline border */
--row-tint:  rgba(var(--v-blue-pale-rgb), 0.28);  /* even ledger rows, even table rows */
--row-hover: rgba(var(--v-blue-bright-rgb), 0.14);
```

`--v-ink` on `--row-tint` over white measures 8.99:1, so striped rows stay comfortably
readable. If you need a new tint, add it here rather than inline, so there is one place to
check it.

## Typography

| Face | Where | Why |
|---|---|---|
| **Barlow Condensed** (`--font-display`) | Mastheads, micro-labels, badges, step titles, numerals, table headers, footer | This is what makes a Vogel page look like a Vogel page. The condensed uppercase micro-label and the heavy numeral are doing most of the brand work. |
| **IBM Plex Sans** (`--font-sans`) | Running body prose, callout text, table cells | Reads well at length in a way a condensed face does not. |
| **IBM Plex Mono** (`--font-mono`) | `code.mono`, URLs, fill-in values | Text the reader must type or transcribe exactly. |

Both families load from Google Fonts with a full fallback stack, which is the only network
dependency in a built page. `'Arial Narrow'` is the first fallback for the display face
because it is present on effectively every Windows and macOS machine and keeps the condensed
proportions; falling straight back to a normal-width sans changes the layout noticeably.

**Barlow Condensed is not installed on most machines.** That is fine for HTML, which fetches
it. It is a real constraint for Word — see [docx.md](docx.md).
