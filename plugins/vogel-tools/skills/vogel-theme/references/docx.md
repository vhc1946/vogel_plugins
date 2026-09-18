# Vogel branding in Word (.docx)

This file carries only the Vogel delta. For the mechanics of building a `.docx`
- styles, tables, headers, images, page setup - use the `docx` skill. Do not
reimplement any of that here.

## Check for reuse first

The `vogel-onboarding` skill already produces a branded Vogel `.docx` (red/blue
scheme, V-mark) from role templates. If the request is an onboarding document,
use that skill outright. If it is something else, **read how it builds its
header and colour styles before writing a new one** - matching it is worth more
than a marginally better construction, because two branded Word documents that
disagree look like a mistake rather than a choice.

## The font problem, stated plainly

**Barlow Condensed and IBM Plex Sans are not installed on Vogel machines.** A
`.docx` does not fetch webfonts. So a Word document that names them renders in
whatever Word substitutes, which for a condensed face is usually something
noticeably wider - and the layout reflows.

Three options, in order of preference:

1. **Embed the fonts** (`w:embedRegular` in `fontTable.xml`). Barlow and IBM
   Plex are both SIL Open Font License, which permits embedding. This is the
   only option that actually preserves the look. It adds roughly 200-400 KB.
2. **Substitute deliberately.** Use a font that is genuinely present and
   declare it: **Arial Narrow** for display text (present on effectively every
   Windows and Mac install, and genuinely condensed) and **Calibri** or
   **Aptos** for body. Declare the fallback chain in `w:rFonts` so the
   substitution is yours, not Word's guess.
3. **Do not use a condensed face at all** in Word, and lean on colour, weight
   and the red rule to carry the brand.

Pick one and **say which**, rather than naming Barlow Condensed and letting the
recipient discover the substitution.

## Colours

Word wants bare six-digit hex with no `#`:

| Style | Hex | Where |
|---|---|---|
| Heading 1 | `0F4577` | Navy |
| Heading 2 | `0F4577` | Navy, smaller, with a `CF152D` bottom border |
| Body text | `434343` | Not black - matches the HTML |
| Table header fill | `0F4577` | White text on it |
| Table banded row fill | `EAF4FF` | The flat equivalent of the HTML row tint, since Word has no alpha on cell shading |
| Accent rule / stripe | `CF152D` for Vogel, `2889C4` for BEE | |
| Callout border (warning) | `CF152D` | Red in both brands |
| Caption / micro-label | `74777D` | Labels only - it fails AA for body text |

**Word has no alpha channel on shading.** Every `rgba()` tint in the stylesheet
has to be pre-flattened against white. `EAF4FF` above is `--row-tint` flattened;
compute any others the same way rather than picking something that looks close.

## Masthead

Word has no `<header>` styling to match the HTML masthead, and a full-bleed
navy block in a Word header is fragile across page sizes. Two workable shapes:

- **Header band** - a single-cell borderless table, full text-width, shaded
  `0F4577`, containing `vogel-wordmark-white.png` left and the title right, with
  a `CF152D` bottom border 3pt. Repeats on every page if placed in the header.
- **First-page title block** - the same band in the body, page one only, with a
  smaller running header afterwards.

Use `assets/vogel-wordmark-white.png` on navy, `vogel-wordmark-color.png` on
white, `v-mark.png` where only the badge fits. Insert at a fixed width and let
the height follow; the assets are already sized (480px and 256px on the long
edge) so Word will not resample them badly.

## Things that do not translate

| HTML | In Word |
|---|---|
| The CSS-only switcher | Nothing equivalent. Split into two sections with real headings, or two documents. **Do not** fake it with a table. |
| The accordion | Nothing equivalent. Emit every question and answer in full - which is what printing the HTML does anyway. |
| `.fillin` | A content control or a table cell shaded `FDECEE` with `[ VALUE GOES HERE ]`. Keep the square brackets and keep the matching reminder near the top. |
| `.bars` | A real Word chart, or a table. Do not draw bars with shaded cells. |
| Hover states | Drop them. |

## Before delivering

- Open the file in Word and look at it. A `.docx` that opens with a repair
  prompt is worse than no document.
- Confirm the fonts resolved the way you intended, not the way Word guessed.
- Check page one and a page-break boundary - a header band that repeats wrongly
  is the most common defect here.
