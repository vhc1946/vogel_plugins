---
name: vogel-theme
description: >
  Build a Vogel-branded deliverable using the official Vogel design system -
  the eight-colour navy/red palette, the V-mark and wordmark logos, Barlow
  Condensed mastheads, and three layouts (Ledger for rosters and tables, Field
  guide for how-tos and step-by-step instructions, Report for metrics and
  summaries). Carries a brand switch for Vogel Heating and Cooling (red) and
  BEE / Building Envelope Experts (blue). Produces self-contained HTML,
  branded Word .docx, or a published Artifact. Use whenever someone asks for
  something "Vogel themed", "Vogel branded", "BEE branded", "in the Vogel
  style", "matching the contact list", "matching the other Vogel pages", or
  asks for a guide, handout, roster, reference sheet, FAQ, one-pager or report
  for Vogel or BEE staff that will be emailed, printed, or opened on a phone.
  Also use when editing or extending a page previously built from this theme.
  Internal skill - Vogel brand assets and palette.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Artifact
---

# Vogel theme

One design system, two brands, three layouts, three output targets.

## First: find the skill folder

The scripts and assets live beside this file. `${CLAUDE_PLUGIN_ROOT}` does not
expand in SKILL.md body text, so resolve the path once and reuse it:

```bash
SKILL=$(ls -d "$CLAUDE_PLUGIN_ROOT"/skills/vogel-theme 2>/dev/null \
  || ls -d ~/.claude/plugins/*/*/plugins/vogel-tools/skills/vogel-theme 2>/dev/null \
  || ls -d ./plugins/vogel-tools/skills/vogel-theme 2>/dev/null \
  || ls -d ~/vogel_plugins/plugins/vogel-tools/skills/vogel-theme 2>/dev/null | head -1)
SKILL=$(realpath "$SKILL"); SKILLW=$(cygpath -w "$SKILL"); echo "$SKILL"; echo "$SKILLW"
```

`realpath` matters: the third branch resolves to something like
`./plugins/...`, and a relative path breaks the moment a later command runs
from a different directory.

The four branches cover, in order: the plugin environment variable (the
documented path, and the only one guaranteed correct); an installed copy under
`~/.claude/plugins/`, whose subdirectory is `marketplaces/` or `cache/`
depending on how it was installed; the repo itself when the session's working
directory is `vogel_plugins`; and the repo by its usual location. **If the echo
is empty, stop and say so** rather than guessing a path - every script call
below depends on it.

Everything after this assumes `$SKILL` holds the POSIX path (for `cat`) and
`$SKILLW` the Windows one (for the Python variable).

## Three decisions, in order

### 1. Which layout

| If the content is | Use | Skeleton |
|---|---|---|
| A roster, price list, table, directory - many rows, scanned not read | **Ledger** | `assets/skeleton-ledger.html` |
| Instructions, a how-to, an onboarding packet, an FAQ | **Field guide** | `assets/skeleton-guide.html` |
| Metrics, a month-end summary, anything with figures and a chart | **Report** | `assets/skeleton-report.html` |

Pick one. They share the palette, the type and the masthead, so they look like
one family, but mixing their components on one page does not read well - a
ledger with step cards in it is two documents stapled together.

### 2. Which brand

`<html data-brand="vhc">` for Vogel Heating and Cooling. `<html data-brand="bee">`
for Building Envelope Experts. Navy carries the masthead in both; only the
accent moves - red for Vogel, the blue ramp for BEE. **Default to `vhc`** and
say which you assumed. Ask only if the content genuinely straddles both.

`.warn` stays red in both brands. It means "this will cost you", not "this is
our colour".

### 3. Which output

| Target | How |
|---|---|
| **Self-contained HTML** - emailed, printed, opened on a phone, works offline | The workflow below. This is the default and the best-tested path. |
| **Word .docx** | Read [references/docx.md](references/docx.md), then use the `docx` skill for the mechanics. |
| **Published Artifact** | Read [references/artifact.md](references/artifact.md) first - the palette needs explicit dark-mode pairs, and bundled PNGs cannot be referenced by path. |

## HTML workflow

1. **Copy** the skeleton to the scratchpad as a working page. Each skeleton is
   an annotated **gallery**, not a form - delete every component you do not
   need before filling anything in.
2. **Write the content** with the Write tool. Never a shell heredoc: it
   truncates silently around 9 KB on this machine.
3. **Build.** The build inlines the CSS, base64s the logo, sets the brand
   attribute, strips the skeleton's authoring comments, and refuses to write if
   any `__TOKEN__` is still unfilled.
4. **Verify.** Then the browser pass. Neither is optional.
5. **Deliver** with `SendUserFile`, and say plainly which fill-in blanks are
   still outstanding.

Both scripts run inline, because new `.py` files are blocked from executing on
this machine - that is also why they are `.pysrc`:

```bash
python -c "
SKILL = r'C:\path\to\skills\vogel-theme'
PAGE  = r'C:\path\to\working_page.html'
OUT   = r'C:\path\to\Deliverable_v1.html'
BRAND = 'vhc'
LOGO  = 'wordmark-white'
SUBS  = {'__TITLE__': '...', '__HEADING__': '...'}
$(cat "$SKILL/scripts/build.pysrc")"
```

```bash
python -c "
OUT = r'C:\path\to\Deliverable_v1.html'
$(cat "$SKILL/scripts/verify.pysrc")"
```

`python -c "$(cat file.pysrc)"` is the reliable way to run multi-line Python
here. Note the Python calls take **Windows** paths even from the Bash tool.

### Logo options

`LOGO` picks which asset gets embedded:

| Value | File | Use on |
|---|---|---|
| `wordmark-white` | `vogel-wordmark-white.png` | The navy masthead. **The default.** |
| `wordmark-color` | `vogel-wordmark-color.png` | A white header - the Report layout. |
| `v-mark` | `v-mark.png` | The square V badge, when the title carries the name already. |
| `bee` | `bee-logo-color.png` | BEE deliverables. Colour only - there is no white BEE variant. |
| `None` | - | No logo; delete the `<img>` from the page too. |

All four are pre-trimmed and downscaled (18-37 KB). Do not embed two variants to
solve printing - the print block keeps the navy block with
`print-color-adjust: exact`, so white-on-navy prints correctly.

## Non-negotiable rules

### 1. The palette is closed

Ten values, listed in [references/palette.md](references/palette.md). Every
tint, hover, hairline, wash and stripe is `rgba()` over one of them. `verify`
fails the build on any other hex, and on shorthand `#fff`.

**Three of the eight colours cannot carry body text.** `--v-gray` misses AA by
0.01, `--v-blue-bright` is 3.84:1, `--v-red-bright` is 3.52:1, and
`--v-blue-pale` is 1.48:1. Read the contrast table before using any of them as
a `color:`. The verify gate holds a named allowlist of the places this has
already been checked; adding to it is a deliberate act, not a workaround.

### 2. Zero JavaScript in HTML deliverables

The switcher is a radio group, the accordion is checkboxes, both pure
`:checked ~ sibling`. Four reasons, in order of how much they hurt:

- Inline `element.style.display` beats every print rule short of `!important`,
  so one line of JS can silently break printing.
- `onbeforeprint` and `matchMedia('print')` are unreliable on iOS Safari, so
  the JS-expands-before-print approach never worked anyway.
- Radios and checkboxes bring native keyboard and screen-reader behaviour free.
  A hand-rolled `role="tablist"` owes AT users a roving-`tabindex` and arrow-key
  contract that is easy to promise and hard to deliver.
- The page renders correctly with scripting off - Outlook's preview pane, some
  mobile mail clients.

Native `<details>`/`<summary>` is also out: a closed `<details>` cannot be
reliably force-opened by CSS across engines, because modern browsers apply
`content-visibility` to the slot. That breaks printing.

**Markup constraints this imposes.** The radios must be *flat siblings* of the
panels and must appear *before* them, with the ids `sw-a` and `sw-b` exactly -
the stylesheet targets them by id, and renaming them makes the page silently
stop switching while still rendering. One radio carries `checked` in the markup
so the page is correct on first paint. Same for accordion items: checkbox, then
label, then body, all siblings, unique ids.

### 3. All hiding goes in `@media screen`

The most important structural rule and the easiest to get wrong.

```css
@media screen {
  .panel { display: none; }
  #sw-a:checked ~ .panel-a { display: block; }
  .acc-a { display: none; }
  .acc-toggle:checked ~ .acc-a { display: block; }
}
```

Because nothing is hidden in the print context, **printing reveals both
switcher panels and every accordion answer with no override at all.** The
`@media print` block only ever *hides* interactive chrome.

Do not hide content globally and un-hide it in print. That needs `!important`
(an author `display:none` outranks an equal-specificity print rule), and it
multiplies: every hiding mechanism needs a matching un-hiding rule, and the one
you forget silently drops content from the printout.

Related trap: `[hidden] { display: revert }` does **not** reveal a hidden
element. `display:none` for `[hidden]` originates in the UA stylesheet, so
reverting returns it to `none`. Use `display: block`.

### 4. Print headings live inside their panel

Each switcher panel contains one real `<h2 class="panel-title">`, clipped on
screen with `position:absolute; clip-path:inset(50%)` and revealed in print.

One node, no duplication drift, and on screen it gives screen-reader users
heading navigation the switcher buttons do not provide. **Never** convert it to
`display:none`, and never reuse the switcher button labels as the print heading
instead - those sit outside the panel, so on a multi-page printout the heading
can land pages away from the steps it labels, and the checked/unchecked styling
leaks, making one section read as "does not apply to you".

### 5. Fill-in blanks are visible and announced

A value someone must supply before distributing goes in a `.fillin` box as
`[ VALUE GOES HERE ]` - square brackets, never a `__TOKEN__`, which the build
gate rejects. Every `.fillin` gets a matching line in the screen-only
`.admin-note` block at the top, so the file cannot be distributed without
noticing. Say the same thing in your closing message.

### 6. Single file, always

Never link the CSS or the logo. The only network request in a built page is the
webfont, which has a full fallback stack.

## Class inventory

**Shared**

| Class | Use |
|---|---|
| `.page` / `.page--narrow` | The content column: 960px, or 860px for the guide. |
| `.masthead` + `-brand` / `-logo` / `-eyebrow` / `-title` / `-sub` / `-right` / `-label` / `-badge` | Navy header with a brand stripe under it. `.masthead-title em` tints one letter, the way the contact list does. |
| `.masthead-accent` / `.masthead-fade` | Stripe above / gradient below. A masthead followed by `.masthead-fade` must also carry `.masthead--faded`, or you get both rules stacked. |
| `.body-pad` | Page padding for guide and report bodies. |
| `.admin-note` | Screen-only "before you hand this out" reminder. |
| `.eyebrow` | Condensed uppercase micro-label. |
| `.ui` | An on-screen label the reader must find: `<span class="ui">My Work</span>`. |
| `code.mono` | Text the reader must type exactly. |
| `.tbl-scroll` > `table.data` | Data table. **Always** wrapped - it scrolls sideways on a phone instead of forcing the page to. |
| `.btn` / `.btn-url` / `.action-row` | Primary button plus the URL as printable text, because a printed page cannot be clicked. |
| `.qr-box` / `.qr` / `.qr-cap` | QR at 30 mm with a 4 mm white quiet zone. |
| `.help` | Navy closing contact block. |
| `.footer-accent` / `.footer` | Brand stripe plus the navy one-liner. |
| `.sr-only` | Visually hidden, still announced. |

**Ledger**

| Class | Use |
|---|---|
| `.ledger` | The grid container. Set `--cols` on it **once** - the header, every row and the print rules all read it. |
| `.ledger-head` | Column headers. Must be a `<header>`, not a `<div>`: `:nth-of-type` counts by element type, so a `<div>` shifts the zebra by one. |
| `.row` / `.row--divider` | A data row; the divider modifier closes a group with a heavier brand rule. |
| `.row-num` / `.cell-key` / `.cell-key--muted` / `.cell` / `.cell--clip` / `.cell-num` | The cells. `--clip` ellipsises on desktop and wraps on mobile. |
| `.cell-hide-sm` / `.row-meta` / `.meta-label` | Columns that collapse into a mobile restatement. `.row-meta` is the one piece of duplicate content the theme hides. |
| `.badge` / `.badge--quiet` | Extension numbers and short codes. |
| `.empty` | The em-dash placeholder for a missing value. |

**Field guide**

| Class | Use |
|---|---|
| `.step` / `.step--alt` + `-head` / `-num` / `-title` / `-body` | Numbered step card, brand left rule; `--alt` is navy, for sections that are not numbered steps. |
| `.section-title` | Condensed uppercase rule-under heading. |
| `.warn` + `.warn-label` | Red callout. Consequences. Red in both brands. |
| `.tip` + `.tip-label` | Blue callout. Helpful, not load-bearing. |
| `.switcher` / `.sw-radio` / `.sw-btn` / `.sw-btn-sub` / `.panel` / `.panel-a` / `.panel-b` / `.panel-title` | The two-way switcher. Rename the panel modifiers if the axis is not the one in the skeleton, but keep the `sw-a` / `sw-b` ids. |
| `.acc-item` / `.acc-toggle` / `.acc-q` / `.acc-chevron` / `.acc-a` | Accordion item. |
| `.fillin` + `-label` / `-value` / `-hint` | Dashed-red fill-in box. |

**Report**

| Class | Use |
|---|---|
| `.report` / `.report-head` / `.report-title` | The lighter shell. White header, not navy. |
| `.tiles` / `.tile` / `.tile--2` / `--3` / `--4` / `--flag` | Stat tiles. The ramp runs navy → blue-mid → blue-bright → blue-pale; `--flag` is red and is for the **one** figure that needs attention. `--3` and `--4` keep navy value text because their rule colours cannot carry a number. |
| `.tile-label` / `.tile-value` / `.tile-note` | |
| `.bars` / `.bar` / `.bar--2` / `--3` / `--4` / `--flag` / `.bar-labels` | CSS-only bar chart. Each bar sets `style="--h: 72%"`. Good for one series of 4-12 values; more than that is a table, so say so rather than forcing it. Put the real numbers in the `aria-label` - the bars are empty divs with nothing to read. |
| `.legend` / `.legend-item` / `.legend-swatch` | Only if colour encodes something. If the bars are one series over time, the colours are decorative and a legend is noise. |

## QR codes

Only if the deliverable will be printed and scanned. Generation happens at
build time so the page stays offline. Both `segno` and `qrcode` are installed
but **blocked from importing** by this machine's AV, so fetch SVG from a QR web
service and re-emit a compact run-length path.

**Verifying a QR is not optional and has two specific traps:**

- **Compare decoded payloads, not module grids.** Mask-pattern selection is a
  penalty heuristic; two correct encoders legitimately differ. Two services once
  produced grids differing in 526 of 2025 cells, and both decoded correctly.
- **Decode all segments.** Encoders mode-chain by default - a URL ending in
  digits comes out as `byte(n) + numeric(m)`, because numeric mode packs 3
  digits into 10 bits. A decoder that stops after the first segment reports a
  clean, plausible, wrong answer, truncated exactly where the trailing ID begins.

After embedding, `path.getTotalLength()` on a run-length QR path equals the dark
module count - a free check that the right geometry shipped. Then have someone
scan a **printed** copy; a screen scan passes where a print scan fails, so say
the print test is outstanding rather than implying it was done.

## Pre-flight checklist

Run every item before delivering. Do not skip on the grounds that the change
was small.

1. `verify.pysrc` exits zero.
2. Open the built file in the Browser pane and run the **CSSOM print audit**.
   Walk `document.styleSheets`, collect every rule setting `display:none`, and
   assert the set hidden *outside* any media block is **empty**. This is the
   authoritative form of rule 3. Wrap each sheet in try/catch - the Google Fonts
   sheet is cross-origin and throws - then assert the **inline** sheet was the
   one actually audited, not skipped.
3. `document.scripts.length === 0`.
4. Click each switcher button; confirm the correct panel shows and the other
   reports computed `display: none`. Expand and collapse one accordion item.
5. At 375 px, `document.body.scrollWidth === document.documentElement.clientWidth`.
   Tables may scroll inside `.tbl-scroll`; the page may not.
6. Every `<h2 class="panel-title">` exists in the DOM and sits inside its panel.
7. Each `.fillin` has a matching `.admin-note` line.
8. The logo `<img>` reports `complete && naturalWidth > 0`. A broken data URI
   renders as nothing, not as an error.
9. Tell the user what is still outstanding: the fill-in blanks, and any printed
   QR scan.

**Two measurement traps in steps 4 and 5.** Browsers restore radio and checkbox
state across a reload, so a fresh `navigate` is *not* a state reset - assert the
state before measuring. And `getBoundingClientRect()` returns zeros for hidden
elements, so a `0 x 0` result means "hidden or broken" and never proves a layout
bug on its own.

**Local files cannot be scripted** in the Browser pane. Serve the scratchpad
over HTTP to run the checks above:

```bash
python -m http.server 8777 --bind 127.0.0.1
```

## When changing the theme itself

Adding a colour means editing `:root` in `assets/vogel-theme.css` **and**
`PALETTE` in `scripts/verify.pysrc`. Adding a text use of a low-contrast token
means adding it to `COLOR_ALLOW` with the background you checked it against.
Both are two-place edits on purpose: the rule is "the palette is closed", and
the list is only its membership.

After any change to the stylesheet or the scripts, **prove the gate still
rejects.** Build a good page, then mutate copies of it - a ninth hex, a bare
`display:none`, a `<script>`, a renamed switcher id, a low-contrast token used
as body text - and confirm each one fails with a message that says what to do.
A gate never seen to reject anything is not a gate.

## Do not

- Link the CSS or the logo.
- Add a `<script>` to an HTML deliverable.
- Add a colour outside the palette.
- Use `--v-gray`, `--v-blue-bright`, `--v-blue-pale` or `--v-red-bright` as body
  text without checking what it sits on.
- Recolour the logo artwork, or butt a `--v-red` fill against the red inside it -
  the logo red is `#D02030`, two points off the palette, and the seam shows.
- Reproduce Apple App Store or Google Play download badges - those are
  trademarked assets. Use a `.btn` with plain text.
- Round-trip a built file through PowerShell 5.1 `Get-Content`, which decodes as
  cp1252 and produces mojibake. Read and write with Python or the Bash tool.
