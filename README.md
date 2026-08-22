# Slipbox

Slipbox is a desktop Obsidian plugin for browsing and filing ordinary Markdown
notes as a tactile, sequential card index. By default, a note
participates when its frontmatter contains `zettel-id`:

```yaml
---
zettel-id: ""
---
```

An empty value is an unfiled card. Any trimmed, nonempty, single-line string
without control characters is a filed address: `1/2b1`, `A/1`, `Project-17`,
and `α/12` are all valid. Filed cards are identified internally by their
vault-relative Markdown path. Their address determines filing order, with the
path as a deterministic tie-breaker when several files share one address.
Addresses are case-sensitive, need not be unique, and have no other grammar.
Slipbox stores no hidden sequence and imposes no folder.

Duplicate addresses are allowed. Every valid duplicate remains independently
selectable and actionable, and duplicate groups appear together in deterministic
code-unit path order. Slipbox reports one non-blocking warning per duplicate
address and lists all affected paths. Invalid stored values—including non-text
values and text with outer whitespace—are diagnosed and excluded, but never
rewritten automatically.

## Slipbox workspace, Desk, and Canvas

- **Slipbox** is the shared, pannable workspace containing the permanent
  canonical Deck of filed cards and the current Desk.
- **Desk** is the transient, session-only surface containing working piles. It
  contains all unfiled cards and any filed cards pulled out for current work,
  without appearing as a separate panel.
- **Canvas** is Obsidian's vault-native persistent spatial workspace. A working
  pile can be laid out there when the arrangement should survive a restart or
  needs Canvas nodes and connections.

The Desk is deliberately not saved. On startup, Slipbox reconstructs one
pile from all unfiled cards, newest-modified first. Filed cards pulled out for
current work, pile positions, expansion, and manual ordering last only for the
current Obsidian session. No pile state is written to Markdown or plugin data.

Piles are anonymous and float directly beside the filed cards in the same
workspace. Their initial positions form a compact vertical stack immediately
above the filed cards, and collapsed piles can be dragged anywhere. A collapsed
pile shows its readable top card and count, with the slightly varied corners of
the cards beneath it exposed. Hover a multi-card pile and use the side arrows to
cycle its top card without opening it. Click the pile itself to expand its
ordered, gently tilted card miniatures directly onto the workspace—there is no
panel, expanded-pile box, or disclosure control. An expanded pile has a small
handle to its upper left: click it to collapse the pile, or drag it to move the
complete expanded row. Piles expand and collapse independently, so several can
remain open at once. Card actions appear in each miniature's header, matching
the filed-card controls.

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
change its address, Slipbox filing order, bookmark, or Canvas membership. Its
filed card is dimmed in light themes or slightly lightened in dark themes, and
its Deck-map dot becomes invisible while it is in a working pile. The unchanged
map position remains clickable, and the current-position marker remains visible.

Right-click a pile for `Return filed cards in this pile`, or right-click empty
workspace to `Collapse all piles` or `Return all filed cards`. Return actions
affect only manually pulled filed cards; unfiled cards remain, and empty piles
disappear. Inline filing leaves the source card in its existing pile and leaves
every pile visible. Successful filing removes only the newly filed card from its
former pile.

## Card focus and the Deck anchor

Each Slipbox view has one logical card focus. It belongs to exactly one card
presentation in the Deck, on the Desk, or in the movable viewed-card layer.
The focused presentation has the accent outline and is the target of card
actions. Tabbing into a card control, clicking a card, or opening a card for
viewing transfers focus to that presentation. Native focus-visible rings remain
on individual buttons and fields. Clicking an expanded Desk card only focuses
it; it never moves the Deck anchor. Use **Show focused card in Deck** when that
movement is wanted. Deck and viewed-card surfaces do not repeat their visible
header identity in a hover label; individual controls retain their tooltips.

The Deck anchor is separate. It records the Deck position used by scrolling,
the map, history, bookmark jumps, and Deck navigation. When card focus is on the
Desk or a viewed card, the anchor keeps a neutral grey outline while the focused
presentation alone keeps the accent outline. Horizontal scrolling, `Left`/
`Right`, `j`/`k`, address jumps, history, and bookmark jumps always move the
anchor. Focus follows only if it already belongs to the Deck. `c` centres the
anchor without transferring focus.

`Enter` is only the configurable shortcut for **Show focused card in Deck**. It
centres a filed Desk or viewed card and transfers focus to its Deck
presentation; a floating viewed card remains open. It does nothing for a
Deck-focused or unfiled card. Removing or rebinding this action in Settings also
removes or changes the Enter behaviour. `e` is the separate default editing
shortcut, and `v` views a Desk card or puts back a viewed card. Putting a viewed
card back restores focus to that exact card in its Desk pile.

## Inline card editing

Double-click the body of a card to edit its raw Markdown in place. With the
Slipbox workspace focused, `e` edits the focused card. `Escape`, an
outside Slipbox action, navigation, a view change, or closing Slipbox saves the
latest draft before editing ends. Typing also saves after 500 ms of inactivity.
Links, card controls, headers, footers, and filing/address fields keep their
normal behavior instead of opening the editor.

Double-clicking a Desk card first brings it into a single movable viewed
card, then starts editing. The `View` action brings it closer without editing.
Its original Desk position becomes a muted magnifying-glass placeholder; a
filed card's Deck position does the same. Clicking away saves and ends editing
but leaves the viewed card open, so the Deck can still be browsed behind it.
Drag the viewed card by its header and press `v` anywhere in the active Slipbox
view—or choose `Put back`—when finished. Only one card can be viewed per Slipbox
view. Filing an unfiled viewed card puts it back before opening its existing
inline filing control.

Edits replace only the note body. Frontmatter is neither parsed nor rewritten,
so comments, key order, spacing, and line endings remain byte-for-byte intact,
including frontmatter-only changes made by another editor. Slipbox flushes open
Markdown views before editing and before the final save, serializes autosaves,
and refuses to overwrite a body that changed elsewhere. A conflict or write
failure keeps the textarea and draft available for copying or retrying and
cancels the pending Slipbox action. Draft recovery lasts only while the plugin
remains loaded; it is intentionally not persisted across reloads or crashes.

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

- Rendered Markdown cards with raw-Markdown inline editing, internal scrolling,
  and fixed backlink footers.
- Free background panning, horizontal trackpad browsing, minimal-reveal arrow
  navigation, and a persistent Spread control.
- A subtle ordinal Deck map with at most 512 evenly sampled neutral markers,
  exact anchor and bookmark overlays, compact address-section labels, and
  full-order click resolution to exact file paths.
- Browser-style session history for filed links and bookmarks.
- One persistent bookmark per filed file.
- Card-header and context-menu actions for opening notes, pulling cards out or
  returning them, bookmarking, and deletion.
- Inline manual filing in the existing working card, with optional real-Deck
  placement inspection, plus ordinary-note conversion workflows.
- Filename- or frontmatter-derived centred titles, configurable new-card folder
  and timestamp naming, and Obsidian Templates integration.
- Visible malformed-address errors and non-blocking duplicate-address warnings.
- Windowed Slipbox rendering around the Deck anchor rather than the whole vault.
- `Return` activates the affirmative action in Slipbox prompt and confirmation
  dialogs, including card creation and bookmark edits.

Backlinks come from Obsidian's resolved-link graph and are never written to card
frontmatter or plugin state. Only valid filed source files are shown;
ordinary notes, unfiled cards, self-links, and unresolved links are excluded.

Bookmarks, navigation history, working piles, backlinks, and direct card actions
retain exact file paths. File and folder renames rewrite those path references.

## Settings

`Address property` is an exact top-level YAML key and defaults to `zettel-id`.
Changing it immediately re-indexes the vault without rewriting notes. Newly
created, converted, and filed cards always use the configured property.

`Deck ordering` has exactly two choices. Natural ordering is the default and
compares alternating ASCII digit and non-digit runs, so `A/2` precedes `A/10`.
Lexicographic ordering compares the complete exact string, so `A/10` precedes
`A/2`. Both are case-sensitive, locale-independent, and use the exact path as
the final tie-breaker. Changing this setting immediately reorders cards around
the active path and never edits Markdown.

Titles use the filename by default. They may instead use `title`, or another
configured top-level frontmatter property, with a filename fallback for missing,
blank, or non-text values. Slipbox card titles are hidden by default. Visible
titles are centred between the left-aligned address and right-aligned actions.
The title property must differ exactly from the address property. Schema-6
migration switches an existing collision to filename titles without renaming or
removing either property.

`Show Deck toolbar` is enabled by default. Disabling it hides the navigation,
bookmark, problem, and spread controls above the Deck while leaving
their commands and shortcuts available.

`Show Deck map` is enabled by default. The map derives card and bookmark
positions from the complete configured Deck order and exact file paths. It
renders at most 512 evenly sampled neutral markers, but clicks resolve against
the complete order. The Deck anchor and every bookmark are overlaid at their
exact positions; unobtrusive labels mark changes in the address section.
Numeric addresses use their complete leading ASCII digit run (`10/2a`
and `10,5/3t` both display `10`); other addresses use their first Unicode
character. Disabling the map removes the overlay.

Header-button settings affect filed Deck-card headers only. Hidden actions
remain available through commands, Slipbox shortcuts, and card context menus.

Main-card and Desk-card sizes each have small, medium, and large presets. Medium
preserves the default 840 px main-card cap and 360 px Desk-card cap. Desk
presets remain smaller than main-card presets, including on narrow views.

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
| `←` / `k` | Move the Deck anchor to the previous card |
| `→` / `j` | Move the Deck anchor to the next card |
| `[` | Move the Deck anchor to the closest bookmark on the left |
| `]` | Move the Deck anchor to the closest bookmark on the right |
| `c` | Centre the Deck anchor without transferring focus |
| `Enter` | Show the focused filed Desk/viewed card in the Deck |
| `e` | Edit the focused card |
| `v` | View the focused Desk card, or put back the focused viewed card |
| `b` | Toggle the focused-card bookmark |
| `y` | Copy a link to the focused card |
| `H` | Go Back in Slipbox history |
| `L` | Go Forward in Slipbox history |
| `0` | Jump to the first card |
| `$` | Jump to the last card |
| `Ctrl+d` | Move forward ten Deck positions |
| `Ctrl+u` | Move backward ten Deck positions |
| `o` | Open the focused card in Markdown |
| `p` | Pull out or return the focused card |
| `Alt+←` / `Alt+→` | Move the focused Desk card within its pile |
| `f` then a character | Find the next card whose address begins with that character |
| `F` then a character | Find the previous card whose address begins with that character |
| `g` then a character | Find the first card from the start whose address begins with that character |
| `P` then a pile number and `Enter` | Pull or move the focused filed card into that one-based visible pile |
| `t` | Toggle this Slipbox view's toolbar |
| `m` | Toggle this Slipbox view's Deck map |

Address-initial searches are case-sensitive, use the first Unicode character of
the configured address, and do not wrap. `Escape` cancels a pending multi-key
command. In pile-number mode, digits accumulate, `Backspace` removes the last
digit, and invalid or nonexistent pile numbers leave the Desk unchanged. `P`
never returns a filed card to the Deck; lower-case `p` retains that toggle.

The toolbar and Deck-map shortcuts are session-only and independent in each open
Slipbox view. Each initially follows its global `Show Deck toolbar` or `Show Deck
map` setting, but `t` and `m` can temporarily override those defaults in the
active view.

On macOS, `Ctrl+d` and `Ctrl+u` use the literal Control key, not Command. Slipbox
keeps `Ctrl` distinct from the platform-aware `Mod` modifier in custom bindings.

Every stable Slipbox action can have multiple scoped shortcuts. Changes apply to
open Slipbox views immediately, and duplicate bindings are rejected. The previous
Legacy Desk shortcut is removed rather than repurposed.

## Manual filing and address domain

`File active unfiled Markdown note`, the Desk-card File action, or a double-click
on an unfiled address starts inline filing. The existing Desk card stays at its
ordinary size and position, gains a light accent treatment, and replaces its
`unfiled` label with an address field. The active filed card's address is
prefilled when one is available. Validation and an expandable duplicate-path
summary appear compactly on the same card; there is no separate card-in-hand,
bottom bar, or Deck ghost.

While the address field owns native focus, `Enter` confirms the current valid
address and `Escape` cancels without changing Markdown or working-pile
membership. `Tab` moves focus to the Deck and selects the real card immediately
before the prospective insertion point. At the beginning it selects the first
filed card for context. The ordinary Deck shortcuts and horizontal scrolling
then work normally. The previewed Deck card receives focus, while `Shift+Tab`
returns directly to the inline address field. Editing an address alone never
moves the Deck.

Before writing, Slipbox refreshes metadata and revalidates the exact source
file, its unfiled state, the ordering mode, and the complete placement signature.
The same checks run again inside the frontmatter mutation. If concurrent
metadata, address, path, or ordering changes move the destination, no write is
made; the calculated destination is refreshed and requires another
confirmation.

The pure TypeScript domain in `src/address-order.ts` exports
`compareAddressesNatural`, `compareAddressesLexicographic`,
`addressComparatorFor`, `compareVaultPaths`, `cardComparatorFor`,
`candidateInsertionIndex`, and address validation helpers. Natural numeric runs
are compared as significant digit strings, so they are not bounded by
JavaScript's numeric range. Pure address, metadata, preview, working-pile, and
Canvas layout APIs are exported from `src/index.ts` and tested independently of
Obsidian. The Deck-map domain similarly exports its coordinate, exact-path,
click-target, and address-section helpers for independent testing.

This experiment removes the former structured-address parser and automatic
address-generation public API. That is a breaking package API change. It also
removes the short-lived ghost/display-sequence preview exports in favour of
inline filing-editor helpers and a real-card focus-path helper, along with
direct-child creation, next-section creation, `Add card from here`, the
card-header `+`, and `New section`, including their commands, settings, and
shortcuts. The old entry-point model was also removed completely by design:
entry-point controls, commands, state, and its shortcut are not part of the
current product. Schema migration purges their persisted state and shortcut
data; the former `a` shortcut is not reassigned.

## Filed-card links

`generateFiledCardLink(app, file, sourcePath, address)` delegates to Obsidian's
preferred Markdown-link generator and uses the address as display text. Slipbox
does not copy addresses into `aliases`, where they could become stale or
ambiguous, and does not generate bare address links because `/` may be
interpreted as a path separator. The command-palette action `Copy link to focused
card`, the Slipbox-scoped `y` shortcut, and the optional card-header copy button
all copy this preferred aliased link. A header button targets the exact card it
belongs to, including when that card is not the Deck anchor.

## Compatibility notes

No Markdown migration is performed. Existing canonical Luhmann addresses remain
valid, while strings rejected by the former grammar now participate in the main
Deck. Existing addresses are never trimmed, normalised, deduplicated, or
renumbered. The default Natural comparator intentionally differs from the old
Luhmann comparator in alphabetic rollover cases—for example, `1/1aa` may now
precede `1/1z`. Renaming a file may reorder it within an exact-address duplicate
group because path order is the deterministic tie-breaker.

## Development

```sh
npm install
npm run check
```

`npm run build` produces `main.js`. The installable plugin consists of
`manifest.json`, `main.js`, and `styles.css`. Tests use Node's built-in runner,
and strict TypeScript checks the complete plugin.

For repeatable large-vault profiling, generate a standalone synthetic vault:

```sh
npm run generate:scale-vault -- --notes 25000 --output /tmp/SlipboxScaleVault
```

The generator refuses to write into a non-empty directory, installs the current
plugin bundle into the fixture, and creates a deterministic mix of filed cards,
unfiled cards, ordinary notes, resolved-link traffic, and a high-backlink hub.
