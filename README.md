# Slipbox

Slipbox is a desktop Obsidian plugin for browsing and filing ordinary Markdown
notes as a tactile, sequential Luhmann-style card index. By default, a note
participates when its frontmatter contains `zettel-id`:

```yaml
---
zettel-id: ""
---
```

An empty value is an unfiled card. A canonical nonempty value such as `1/2b1`
is a permanently filed card. The address is the sole source of filing order;
Slipbox stores no hidden sequence and imposes no folder.

## Slipbox workspace, working piles, and Canvas

- **Slipbox** is the shared, pannable workspace containing the permanent
  canonical sequence of filed cards and the current working piles.
- **Working piles** are the transient, session-only workspace. They contain all
  unfiled cards and any filed cards pulled out for current work, without
  appearing as a separate panel.
- **Canvas** is Obsidian's vault-native persistent spatial workspace. A working
  pile can be laid out there when the arrangement should survive a restart or
  needs Canvas nodes and connections.

Working piles are deliberately not saved. On startup, Slipbox reconstructs one
pile from all unfiled cards, newest-modified first. Filed cards pulled out for
current work, pile positions, expansion, and manual ordering last only for the
current Obsidian session. No pile state is written to Markdown or plugin data.

Piles are anonymous and float directly beside the filed cards in the same
workspace. Their initial positions form a compact vertical stack immediately
above the filed cards, and collapsed piles can be dragged anywhere. A collapsed
pile shows its readable top card and count, with the slightly varied corners of
the cards beneath it exposed. Click the pile itself to expand its ordered,
gently tilted card miniatures directly onto the workspace—there is no panel,
expanded-pile box, or disclosure control. An expanded pile has a small handle
to its upper left: click it to collapse the pile, or drag it to move the complete
expanded row. Only one pile is expanded at a time.

Drag empty background to pan the whole workspace, including both filed cards
and piles. This makes overlapped or off-centre piles reachable without changing
their positions relative to the filed cards. Horizontal trackpad gestures still
browse the canonical filed sequence.

Use drag and drop to:

- reorder cards within an expanded pile;
- move cards between expanded piles;
- drop a card in empty workspace to create a new pile at that point;
- move a collapsed pile freely; or
- drop a collapsed pile onto another to merge them.

Focused cards also support `Alt+Left` and `Alt+Right`, and their context menu can
move them to adjacent piles or split them. Pulling a filed card out does not
change its address, Slipbox filing order, bookmark, or Canvas membership.

Right-click a pile for `Return filed cards in this pile`, or right-click empty
workspace for `Return all filed cards`. Both return only manually pulled filed
cards; unfiled cards remain, and empty piles disappear. Piles are temporarily
hidden during Filing Mode. Successful filing removes the newly filed card from
its former pile without reorganising the rest.

## Canvas integration

Right-click a pile to choose:

- `Lay out pile on active Canvas`;
- `Lay out pile on Canvas…`;
- `Create Canvas from pile…`; or
- `Return filed cards in this pile`.

Canvas layout includes filed and unfiled cards in pile order, places file nodes
left-to-right, and wraps longer piles into rows. Existing nodes and edges are
preserved, existing file nodes are not duplicated, and the working pile remains
unchanged. Creating a Canvas prompts for a filename or vault-relative path and
opens the new file after creation.

The installed public Obsidian API does not expose the active Canvas viewport,
so nodes currently begin at a deterministic origin instead of the visible
viewport. Open Canvases are saved through their public text-view contract;
closed Canvases are updated atomically through the vault API.

Versions before 0.5 used a custom persistent Desk. If saved Desk data is found,
the command `Export legacy Desk to Canvas…` becomes available for one-way
recovery. It creates a Canvas using the old relative positions, omits and reports
missing cards, and clears the legacy state only after the Canvas succeeds and
you explicitly confirm. The old Desk view, controls, shortcuts, and settings no
longer exist.

## Other features

- Read-only rendered Markdown cards with internal scrolling and fixed backlink
  footers.
- Free background panning, horizontal trackpad browsing, minimal-reveal arrow
  navigation, and a persistent Spread control.
- Browser-style session history for filed links, entry points, and bookmarks.
- Persistent named entry points and one persistent bookmark per filed address.
- Card-header and context-menu actions for opening notes, adding from a card,
  pulling cards out or returning them, bookmarking, and deletion.
- Deliberate Filing Mode from the active attachment point, plus new-section and
  ordinary-note conversion workflows.
- Filename- or frontmatter-derived centred titles, configurable new-card folder
  and timestamp naming, and Obsidian Templates integration.
- Visible malformed-address and duplicate-address diagnostics.
- Windowed Slipbox rendering around the active card rather than the whole vault.
- `Return` activates the affirmative action in Slipbox prompt and confirmation
  dialogs, including card creation and bookmark or entry-point edits.

Backlinks come from Obsidian's resolved-link graph and are never written to card
frontmatter or plugin state. Only unique, valid filed sources are shown;
ordinary notes, unfiled cards, self-links, and unresolved links are excluded.

## Settings

`Address property` is an exact top-level YAML key and defaults to `zettel-id`.
Changing it immediately re-indexes the vault without rewriting notes. Newly
created, converted, and filed cards always use the configured property.

Titles use the filename by default. They may instead use `title`, or another
configured top-level frontmatter property, with a filename fallback for missing,
blank, or non-text values. Slipbox card titles are hidden by default. Visible titles are
centred between the left-aligned address and right-aligned actions.

Header-button settings affect presentation only. Hidden actions remain
available through commands, Slipbox shortcuts, and card context menus.

Every note created through Slipbox is placed in the configured `New card folder`.
The empty default inherits the source note's folder, or uses the vault root when
there is no source note. A missing configured folder is reported rather than
silently recreated elsewhere.

Every card-creation action asks for a title. Filename-derived titles use a
sanitised nonblank title as the filename; frontmatter-derived titles always use
the configured Moment timestamp filename and write the entered title property.
A blank title uses the timestamp. Templates support is optional and uses
Obsidian's Templates core plugin.

## Default Slipbox keys

| Key | Action |
| --- | --- |
| `←` / `k` | Select the previous card |
| `→` / `j` | Select the next card |
| `c` | Centre the active card |
| `g` | Jump to the first card |
| `G` | Jump to the last card |
| `o` | Open the active Markdown note |
| `a` | Add a card from the active card |
| `p` | Pull out or return the active card |
| `b` | Toggle the active-card bookmark |

Every stable Slipbox action can have multiple scoped shortcuts. Changes apply to
open Slipbox views immediately, and duplicate bindings are rejected. The previous
Desk shortcut is removed rather than repurposed.

## Address domain

The pure TypeScript domain in `src/zettel-id.ts` parses, formats, compares, and
generates canonical addresses. Numeric components compare numerically;
alphabetic components follow `a … z, aa, ab …`; and a prefix card precedes its
extensions. Pure address, working-pile, and Canvas layout APIs are exported from
`src/index.ts` and tested independently of Obsidian.

## Filed-card links

`generateFiledCardLink(app, file, sourcePath, zettelId)` delegates to Obsidian's
preferred Markdown-link generator and uses the address as display text. Slipbox
does not copy addresses into `aliases`, where they could become stale or
ambiguous, and does not generate bare ID links because `/` may be interpreted as
a path separator.

## Development

```sh
npm install
npm run check
```

`npm run build` produces `main.js`. The installable plugin consists of
`manifest.json`, `main.js`, and `styles.css`. Tests use Node's built-in runner,
and strict TypeScript checks the complete plugin.
