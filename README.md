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

## v0.1 features

- A custom, read-only Deck view with rendered Obsidian Markdown.
- Free horizontal trackpad and background-drag browsing with no snap or settle,
  hysteretic centre-based card highlighting, non-repositioning card selection,
  minimal-reveal arrow navigation, and internal vertical scrolling.
- A persistent Spread control that changes spacing without resizing cards.
- A session-only thumb with an edge tab when the held card is out of view.
- Persistent named entry points with add, rename, delete, and jump actions.
- A minimal Desk dialog listing every unfiled card and starting Filing Mode.
- Deliberate filing from the active attachment point, with immutable addresses.
- Global new-card, convert-note, new-section, Deck, thumb, filing, and
  entry-point commands.
- Persistent last position and reactive vault/metadata indexing.
- Visible malformed-address and duplicate-address diagnostics.
- Windowed rendering around the active card rather than rendering the vault.

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
