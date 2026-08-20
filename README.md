# Zettelkasten Deck

Zettelkasten Deck is a desktop Obsidian plugin for browsing ordinary Markdown
notes as a physical, sequential Luhmann-style card index. A note participates
only when its frontmatter contains `zettel-id`:

```yaml
---
zettel-id: ""
---
```

An empty value is an unfiled card on the Desk. A canonical nonempty value such
as `1/2b1` is a permanently filed card. The address is the sole source of Deck
order; the plugin stores no hidden filing sequence and imposes no folder.

## v0.2 features

- A custom, read-only Deck view with rendered Obsidian Markdown.
- Free horizontal trackpad and background-drag browsing with no snap or settle,
  hysteretic centre-based card highlighting, non-repositioning card selection,
  minimal-reveal arrow navigation, and internal vertical scrolling.
- A persistent Spread control that changes spacing without resizing cards.
- A session-only thumb with an edge tab when the held card is out of view.
- Persistent named entry points with add, rename, delete, and jump actions.
- Persistent coloured bookmark tabs with optional labels, one per filed card.
- Browser-style session history for filed links, entry points, and bookmarks;
  ordinary physical Deck browsing does not create history entries.
- A bounded spatial Desk with fixed-size rendered cards, persistent positions
  and stacking order, overlap, and one Desk representation per Markdown note.
- An unfiled-card tray and Filing Mode integration that keeps a newly filed
  card at the same Desk position.
- Deliberate filing from the active attachment point, with immutable addresses.
- Global commands for Deck, Desk, bookmarks, Back/Forward, new cards,
  conversion, filing, sections, the thumb, entry points, and Desk placement.
- Deterministic Deck startup at the first available entry point or first card;
  browsing position is deliberately not persisted.
- Visible malformed-address and duplicate-address diagnostics.
- Windowed rendering around the active card rather than rendering the vault.

Bookmark and Desk layout state is stored in plugin data, never in Markdown
frontmatter. Back/Forward history and the thumb are session-local. Existing
v0.1 `lastActiveId` data is ignored and removed when v0.2 normalizes state.

## Deck keys

| Key | Action |
| --- | --- |
| `←` / `k` | Select the previous card |
| `→` / `j` | Select the next card |
| `c` | Centre the active card |
| `h` | Toggle the hold at the active card |
| `H` | Return to the held card |
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
