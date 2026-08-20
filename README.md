# Slipbox

Slipbox is a desktop Obsidian plugin for browsing, arranging, and filing
ordinary Markdown notes as a tactile, sequential Luhmann-style card index. By
default, a note participates only when its frontmatter contains `zettel-id`:

```yaml
---
zettel-id: ""
---
```

An empty value is an unfiled card on the Desk. A canonical nonempty value such
as `1/2b1` is a permanently filed card. The address is the sole source of Deck
order; the plugin stores no hidden filing sequence and imposes no folder. The
address property can be changed in Slipbox settings without rewriting notes.

## v0.4 features

- A custom, read-only Deck view with rendered Obsidian Markdown.
- Free horizontal trackpad and background-drag browsing with no snap or settle,
  hysteretic centre-based card highlighting, non-repositioning card selection,
  minimal-reveal arrow navigation, and internal vertical scrolling.
- A persistent Spread control that changes spacing without resizing cards.
- Fixed card footers on Deck and Desk show the canonically ordered addresses
  of unique filed Zettels that link to each card. Large sets use a measured
  `+N` overflow menu, and cards with no backlinks retain a blank footer.
- Native Obsidian page previews when hovering rendered internal links or
  backlink addresses. Deck backlink clicks use browser history; Desk clicks
  open the referring note, and the backlink context menu can put it on Desk.
- Persistent named entry points with add, rename, delete, and jump actions.
- Card-header controls that add and immediately file a new card from their
  source, explicitly open the Markdown file, toggle Desk membership, and
  toggle persistent address bookmarks, plus edge-return arrows when the
  nearest bookmark on either side is out of view. Card-surface clicks only
  select the card.
- Card right-click menus on Deck and Desk provide Markdown opening, bookmark
  and Desk toggles, `Add card from here`, confirmation-backed deletion using
  the configured trash behavior, and Obsidian's native file actions including
  `Reveal file in navigation`.
- Browser-style session history for filed links, entry points, and bookmarks;
  ordinary physical Deck browsing does not create history entries.
- A bounded spatial Desk with fixed-size rendered cards, persistent positions
  and stacking order, overlap, and one Desk representation per Markdown note.
- An unfiled-card tray and Filing Mode integration that keeps a newly filed
  card at the same Desk position.
- Deliberate filing from the active attachment point, with immutable addresses.
- Global commands for Deck, Desk, bookmarks, Back/Forward, new cards,
  conversion, filing, sections, entry points, Desk placement, all stable Deck
  actions, and active-card header actions.
- Native settings for the address property, filename or frontmatter-derived
  display titles, independent Deck and Desk title display, card-header button
  visibility, new-card naming and Templates integration, and live configurable
  Deck-scoped shortcuts.
- Deterministic Deck startup at the first available entry point or first card;
  browsing position is deliberately not persisted.
- Visible malformed-address and duplicate-address diagnostics.
- Windowed rendering around the active card rather than rendering the vault.

Settings and workspace state are versioned separately in plugin data. Bookmark
and Desk layout state is never written to Markdown frontmatter. Back/Forward
history is session-local. Existing flat v0.1-v0.3 data migrates automatically;
existing v0.1
`lastActiveId` data is ignored and removed when v0.2 normalizes state.
Backlinks are derived from Obsidian's resolved file graph and are never written
to card frontmatter or plugin state. Only unique, valid filed source cards are
shown; ordinary notes, unfiled cards, self-links, and unresolved links are
excluded.

## Settings

`Address property` is an exact top-level YAML key and defaults to `zettel-id`.
Changing it immediately re-indexes the vault; it deliberately does not migrate
frontmatter using the previous key. Newly created, converted, and filed cards
always use the configured property.

Card titles use the filename by default. They may instead use `title`, or any
other configured top-level frontmatter property, with a filename fallback for
missing, empty, or non-text values. Deck titles are hidden by default; Desk
titles are shown. Visible headers use `address · title` and truncate the title
before the configured action buttons.

Header-button settings affect presentation only. Hidden actions remain
available through commands, Deck shortcuts, and card right-click menus.

Every Slipbox card-creation action asks for a title. With filename-derived
titles, a non-empty title becomes the note filename and filename-unsafe
characters are replaced with hyphens. With frontmatter-derived titles, the
filename always uses the configured Moment timestamp format and the entered
title is written to the configured title property. A blank title uses the
timestamp in either mode and leaves the frontmatter title empty when applicable.
The default timestamp format is `YYYYMMDDTHHmmss`.

Template use is off by default. When enabled, choose one fixed template in
Slipbox settings or leave `New card template` on `Ask each time`. Slipbox keeps
its address frontmatter in place while Obsidian's Templates core plugin expands
template variables and merges any template properties.

## Default Deck keys

| Key | Action |
| --- | --- |
| `←` / `k` | Select the previous card |
| `→` / `j` | Select the next card |
| `c` | Centre the active card |
| `g` | Jump to the first card |
| `G` | Jump to the last card |
| `o` | Open the active Markdown note |
| `a` | Add a card from the active card |
| `d` | Toggle active-card Desk membership |
| `b` | Toggle the active-card bookmark |

Every stable Deck action can have multiple scoped shortcuts. Changes apply to
open Deck views immediately. Duplicate bindings across actions are rejected.

## Address domain

The pure TypeScript domain in `src/zettel-id.ts` parses, formats, compares, and
generates canonical addresses. Numeric components compare numerically;
alphabetic components follow the unbounded sequence `a … z, aa, ab …`; and a
prefix card precedes all of its extensions.

The address and metadata domain APIs are exported from `src/index.ts`, remain
independent of Obsidian, and are tested separately from plugin integration.

## Filed-card links

`generateFiledCardLink(app, file, sourcePath, zettelId)` delegates to Obsidian's
`app.fileManager.generateMarkdownLink` and uses the card's address as the
display text. For example, with Wikilinks enabled it may produce
`[[Systems|1/1]]`; with Markdown links enabled it returns the equivalent format
and lets Obsidian choose an appropriate target relative to `sourcePath`.

The configured address property remains the sole canonical address.
Although copying it into `aliases` would enable native ID-based autocomplete,
Slipbox does not do so: that would duplicate address metadata and could become
stale or ambiguous. Bare ID links such as `[[1/1]]` are not generated, because
`/` may be interpreted as a path separator.

## Development

```sh
npm install
npm run check
```

`npm run build` produces the Obsidian bundle `main.js`. The installable plugin
consists of `manifest.json`, `main.js`, and `styles.css`. The test suite uses
Node's built-in test runner, while strict TypeScript checks the complete plugin.
