# Custom card styling

Slipbox supports CSS snippets for card dimensions, paper and typography. These
hooks are available in Slipbox Desk 0.16.0 and later.
The default Small/Medium/Large presets and appearance apply when no overrides are
set. No extra plugin or settings change is needed.

Download [the ruled index-card snippet](snippets/ruled-index-cards.css), place it
in your vault's `.obsidian/snippets/` folder, and enable it under **Settings →
Appearance → CSS snippets**. Disable that snippet to restore the defaults.
Do not modify the plugin's installed `styles.css`, which updates replace.

The example makes Deck and Viewed cards 480 × 288 CSS pixels, including borders,
and keeps Desk previews independently sized. Its responsive variant is included
as a commented block. This is an illustrative design, not a reproduction of any
particular user's original snippet.

## Supported properties

Set dimension properties on `.view-content.slipbox-deck-view`. All cards within
each surface share its dimensions; different dimensions per note are unsupported.
Widths accept positive CSS lengths (`px`, `in`, `rem`, `vw`, `cqw`) and valid
`calc()`, `min()`, `max()` and `clamp()` expressions. Use `cqw` for pane-relative
width: `100cqw` is the Slipbox view's width. Percentage overrides and `auto` widths
are outside this interface. Aspect ratio accepts a positive **number**, for
example `calc(5 / 3)`, not the bare token sequence `5 / 3`.

| Property | Default and scope |
| --- | --- |
| `--slipbox-deck-card-width` | Small 720px, Medium 840px, Large 960px; Deck only |
| `--slipbox-viewed-card-width` | Existing responsive width from the main-card preset; Viewed only |
| `--slipbox-desk-card-width` | Small `min(280px, 30cqw)`, Medium `min(360px, 36cqw)`, Large `min(440px, 42cqw)` |
| `--slipbox-card-aspect-ratio` | `1.5`; Deck, Viewed and all Desk card/shell/stack geometries |
| `--slipbox-viewed-card-max-height` | `calc(100% - 54px)`; use `none` to preserve fixed Viewed-card dimensions |
| `--slipbox-card-radius` | 10px on Deck/Viewed, 7px on Desk cards and decorative layers |
| `--slipbox-card-paper-color` | Theme `--background-primary`; all paper surfaces |
| `--slipbox-card-paper-image` | `none`; rendered bodies, Desk previews and textarea; scrolls with content |
| `--slipbox-card-chrome-color` | Theme `--background-primary-alt`; base for headers/footers, retaining colour/bookmark tints |
| `--slipbox-card-text-color` | Theme `--text-normal`; body text and textarea |
| `--slipbox-card-padding-x` | Deck/Viewed/editor `clamp(22px, 4vw, 58px)`; Desk 9px |
| `--slipbox-card-padding-y` | Deck/Viewed/editor `clamp(20px, 3.2vw, 42px)`; Desk 7px |
| `--slipbox-card-font-size` | Theme `--font-text-size` on Deck/Viewed/editor; Desk `0.65rem` |
| `--slipbox-card-line-height` | Theme `--line-height-normal` on Deck/Viewed/editor; Desk `1.3` |

The Viewed width defaults are Small `min(50%, 720px)`, Medium `min(58%, 840px)`
and Large `min(66%, 960px)`. In windows at most 850px wide, Small and Large
use 60% and 76%; Medium retains its default above. These percentage *defaults*
remain supported internally.

New width properties override the legacy `--slipbox-fixed-deck-width` (Deck) and
`--slipbox-main-card-width` (Viewed), which in turn override preset defaults.
Preset changes and media queries never replace your explicit overrides.
`--slipbox-desk-pile-height` remains an advanced override; by default the pile
height follows its card height plus 18px stack clearance. Avoid overriding it
unless you are deliberately changing pile decoration too.

Appearance properties may be scoped to `.slipbox-card` (Deck and Viewed),
`.slipbox-viewed-card`, or `.slipbox-desk-card` to override a surface's inherited
style. The example uses this to retain compact Desk typography. Dimensional
properties must stay on the view root so the sizing probe and cards agree.

## Finer styling targets

Scope all selectors beneath `.view-content.slipbox-deck-view`:

| Target | Selector |
| --- | --- |
| Main Deck cards | `.slipbox-deck-cards > .slipbox-card` |
| Floating Viewed card | `.slipbox-viewed-card-layer > .slipbox-viewed-card` |
| Deck/Viewed paper frame | `.slipbox-card-frame` |
| Deck/Viewed header and footer | `.slipbox-card-address-row`, `.slipbox-card-footer` |
| Rendered Deck/Viewed body | `.slipbox-card-scroll.markdown-rendered` |
| Actual editing surface | `.slipbox-viewed-card .slipbox-inline-editor` |
| Desk header and rendered body | `.slipbox-desk-card-identity`, `.slipbox-desk-card-preview` |

Editing takes place in the Viewed layer, outside `.slipbox-deck-cards`. During
editing the body container has zero padding; the textarea supplies the shared
padding. Do not add the padding to both. Rules based on `.markdown-rendered` can
already apply to rendered cards; rules requiring `.markdown-preview-view` or a
Markdown leaf do not match the custom card frame. A ruled background is decorative:
headings, mathematics, images and paragraph margins do not snap to its lines.

Use the properties for dimensions. Leave transforms, positioning, z-index,
structural overflow, containment and motion caching under plugin control. Internal
selectors beyond the documented appearance targets may change between releases.

## Physical scale and small panes

CSS defines `1in = 96px`, so `5in` and `480px` describe the same reference size.
Neither guarantees a physical five inches on a monitor. Calibrate the selected,
unscaled card against a ruler at your normal OS/app zoom; multiply both dimensions
by the same factor (changing width while retaining aspect ratio does this). Changing
monitor or zoom can require recalibration. Fan neighbours can be visually scaled.

Fixed cards can extend outside the pane. Deck positioning commands and panning
let you expose their edges. Responsive widths deliberately trade constant size
for fitting the pane, and do not guarantee vertical fit. The Viewed height cap
can reduce its height and change its proportions; use `none` for exact dimensions.
Supply valid positive dimensions. Hidden/unmeasurable views retain their last
valid layout measurements until visible again.
