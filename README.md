# Slipbox

Slipbox is a desktop Obsidian plugin for browsing, arranging, and filing
ordinary Markdown notes as a tactile, sequential Luhmann-style card index. A
note participates only when its frontmatter contains `zettel-id`:

```yaml
---
zettel-id: ""
---
```

An empty value is an unfiled card on the Desk. A canonical nonempty value such
as `1/2b1` is a permanently filed card. The address is the sole source of Deck
order; the plugin stores no hidden filing sequence and imposes no folder.

## v0.3 features

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
  source, toggle Desk membership, and toggle persistent zettel-id bookmarks,
  plus edge-return arrows when the nearest bookmark on either side is out of
  view.
- Browser-style session history for filed links, entry points, and bookmarks;
  ordinary physical Deck browsing does not create history entries.
- A bounded spatial Desk with fixed-size rendered cards, persistent positions
  and stacking order, overlap, and one Desk representation per Markdown note.
- An unfiled-card tray and Filing Mode integration that keeps a newly filed
  card at the same Desk position.
- Deliberate filing from the active attachment point, with immutable addresses.
- Global commands for Deck, Desk, bookmarks, Back/Forward, new cards,
  conversion, filing, sections, entry points, and Desk placement.
- Deterministic Deck startup at the first available entry point or first card;
  browsing position is deliberately not persisted.
- Visible malformed-address and duplicate-address diagnostics.
- Windowed rendering around the active card rather than rendering the vault.

Bookmark and Desk layout state is stored in plugin data, never in Markdown
frontmatter. Back/Forward history is session-local. Existing v0.1
`lastActiveId` data is ignored and removed when v0.2 normalizes state.
Backlinks are derived from Obsidian's resolved file graph and are never written
to card frontmatter or plugin state. Only unique, valid filed source cards are
shown; ordinary notes, unfiled cards, self-links, and unresolved links are
excluded.

## Deck keys

| Key | Action |
| --- | --- |
| `←` / `k` | Select the previous card |
| `→` / `j` | Select the next card |
| `c` | Centre the active card |
| `g` | Jump to the first card |
| `G` | Jump to the last card |

## Address domain

The pure TypeScript domain in `src/zettel-id.ts` parses, formats, compares, and
generates canonical addresses. Numeric components compare numerically;
alphabetic components follow the unbounded sequence `a … z, aa, ab …`; and a
prefix card precedes all of its extensions.

The public domain API is exported from `src/index.ts` and has no dependency on
Obsidian. Metadata classification is likewise pure and tested independently.

## Development

```sh
npm install
npm run check
```

`npm run build` produces the Obsidian bundle `main.js`. The installable plugin
consists of `manifest.json`, `main.js`, and `styles.css`. The test suite uses
Node's built-in test runner, while strict TypeScript checks the complete plugin.
