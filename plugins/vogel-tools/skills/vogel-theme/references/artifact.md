# Vogel branding in a published Artifact

Read this before writing the page. Two things about Artifacts break the HTML
theme if you carry it across unchanged.

Load the `artifact-design` skill as well - it owns the page contract (title,
libraries, size limit, favicon). This file owns only what is Vogel-specific.

## 1. Dark mode is mandatory, and the palette does not survive it

An Artifact must work in both colour schemes. The Vogel palette is built for
white paper, and **three tokens invert badly**:

- `--v-navy` `#0F4577` is **1.8:1** on a dark background. It is unreadable as
  text. It stays a *surface* colour and never becomes text in dark mode.
- `--v-red` `#CF152D` drops to **3.2:1**. It fails as text on dark.
- `--v-gray` `#74777D` drops to **4.0:1**. It already failed on white; it fails
  worse here.

The fix is a role swap, not a tweak. In dark mode `--v-blue-pale` takes over as
the heading colour (**11.8:1**) and `--v-red-bright` takes over as the accent
(**4.9:1**) - the bright red that is fill-only on white is the *readable* red on
dark. Everything else is white at an alpha.

Declare it exactly this way, per the artifact contract - the `@media` block
guarded so an explicit light choice wins, and the `[data-theme="dark"]` block
so an explicit dark choice works too:

```css
:root {
  --surface:   #FFFFFF;
  --surface-2: #FFFFFF;
  --text:      #434343;   /* 9.9:1  */
  --text-muted:#74777D;   /* labels only */
  --heading:   #0F4577;   /* 9.8:1  */
  --accent:    #CF152D;   /* 5.5:1, white text on it */
  --rule:      rgba(15, 69, 119, 0.12);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --surface:   #030C15;               /* rgba(navy,.18) over black */
    --surface-2: #121B23;               /* + rgba(white,.06)         */
    --text:      rgba(255,255,255,.92); /* 14.8:1 on --surface-2     */
    --text-muted:rgba(255,255,255,.66); /*  8.1:1                    */
    --heading:   #A7DBFF;               /* 11.8:1                    */
    --accent:    #FF3E23;               /*  4.9:1                    */
    --rule:      rgba(255,255,255,.14);
  }
}

:root[data-theme="dark"] {
  --surface:   #030C15;
  --surface-2: #121B23;
  --text:      rgba(255,255,255,.92);
  --text-muted:rgba(255,255,255,.66);
  --heading:   #A7DBFF;
  --accent:    #FF3E23;
  --rule:      rgba(255,255,255,.14);
}

body { background: var(--surface); color: var(--text); }
```

The two dark surfaces are the closed palette applied to a dark ground rather
than new colours: `--surface` is `--v-navy` at 18% over black, `--surface-2` is
that plus white at 6%. Text is white at an alpha, the same way the light theme
uses `rgba()` over its palette.

**BEE in dark mode** keeps `--heading: #A7DBFF` and sets
`--accent: #2889C4` (4.5:1 on `--surface-2`). Do not use `--v-blue-mid` - it is
2.9:1 on dark and disappears.

**The masthead is the exception.** A navy block with white text is 9.8:1 and
works identically in both schemes, so the masthead does not need a dark variant.
Keep it navy. Same for a `--v-red` fill with white text (5.5:1) - it is the red
*text* that fails on dark, not the red *fill*.

## 2. Bundled PNGs cannot be referenced by path

A published page cannot read `assets/v-mark.png` off the plugin folder. Two
ways in:

- **Base64-inline it**, as the HTML deliverables do. The V-mark is 24 KB as
  base64 and the wordmark 29 KB - both comfortably inside the page size limit.
  Simplest, and keeps the page self-contained.
- **Upload to the artifact's asset store** (`asset: true`), declare the `assets`
  capability, and reference the returned URL exactly as given. Worth it only if
  the same logo is reused across several artifacts.

Prefer inlining unless there is a reason not to.

## 3. Fonts

Google Fonts is on the allowed stylesheet list, so
`Barlow Condensed` and `IBM Plex Sans` load normally. Keep the full fallback
stack from the theme - `'Arial Narrow'` first for the display face, because a
fallback to a normal-width sans changes the layout noticeably.

## What carries across unchanged

The layout ideas all work: the navy masthead with a brand stripe, the numbered
step card with a coloured left rule, the warning and tip callouts, the stat
tiles with the blue ramp, the dense ledger row. Rebuild them against the token
names above rather than copying the theme stylesheet wholesale - the theme is
written for print and for a fixed white ground, and half of it is print rules an
Artifact does not need.

The one rule that does carry, and matters more here than anywhere: **`.warn`
stays red in both brands and both colour schemes.** It is a semantic role.
