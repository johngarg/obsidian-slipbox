# Slipbox

Slipbox is a desktop Obsidian plugin for browsing and filing ordinary Markdown
notes as a tactile, sequential card index. By default, a note
participates when its frontmatter contains `zettel-id`:

```yaml
---
zettel-id: ""
---
```

## Requirements and installation

Slipbox requires the desktop Obsidian app at version 1.13.0 or newer. Download
`manifest.json`, `main.js`, and `styles.css` from the same GitHub Release and
place them in `<Vault>/.obsidian/plugins/slipbox/`. Reload Obsidian, then enable
Slipbox under **Settings → Community plugins**.

The source repository does not track the generated `main.js`. A source checkout
must run the production build described under [Development](#development)
before Obsidian can load it directly.

An empty value is an unfiled card. Any trimmed, nonempty, single-line string
without control characters is a filed address: `1/2b1`, `A/1`, `Project-17`,
and `α/12` are all valid. Because the address domain is that open, an unfiled
card draws an empty dashed slot where its address would go rather than any
placeholder word, which a card could equally hold as a real address. Filed cards are identified internally by their
vault-relative Markdown path. Their address determines filing order, with the
path as a deterministic tie-breaker when several files share one address.
Addresses are case-sensitive, need not be unique, and have no other grammar.
Slipbox stores no hidden sequence and imposes no folder.

Two cards may share an address. Every valid duplicate remains independently
selectable and actionable, and duplicate groups appear together in deterministic
code-unit path order, whichever policy is set. The **Duplicate addresses**
setting decides only how they are treated: `Allowed`, the default, reports
nothing, while `Report as a problem` emits one non-blocking warning per
duplicate address listing all affected paths, counts them in the status bar, and
refuses to file onto an address a card already occupies. Neither policy rewrites
existing notes, and the vault can acquire duplicates from outside Slipbox under
either. Invalid stored values—including non-text values and text with outer
whitespace—are diagnosed and excluded regardless of the policy, but never
rewritten automatically.

## Card problems

Slipbox keeps a status bar item showing the number of outstanding card problems.
It is hidden entirely when there are none, takes an error tone when any card is
excluded and a warning tone otherwise, and opens the problem list when clicked.
The `Show card problems` command opens the same list and is unavailable while
the vault is clean. Invalid addresses are always counted; duplicates are counted
only under the `Report as a problem` policy.

## Slipbox workspace, Desk, and Canvas

- **Slipbox** is the shared, pannable workspace containing the permanent
  canonical Deck of filed cards and the current Desk.
- **Desk** is the transient, session-only surface containing working piles. It
  contains all unfiled cards and any filed cards put there for current work,
  without appearing as a separate panel.
- **Canvas** is Obsidian's vault-native persistent spatial workspace. A working
  pile can be laid out there when the arrangement should survive a restart or
  needs Canvas nodes and connections.

The Desk is deliberately not saved. On startup, Slipbox reconstructs one
pile from all unfiled cards, newest-modified first. Filed cards put on the Desk for
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

Card focus can also move between the Deck and Desk piles without changing the
Deck anchor. `{` and `}` cycle backward and forward through the Deck and every
visible pile, wrapping at both ends and landing on each pile's top card without
expanding it. A viewed card on the Desk participates as its pile, so cycling
continues normally after a pile's ghost redirects focus to the viewed card. If
the Deck has no filed cards, cycling skips it. `%` swaps between the Deck and the
last pile that received card focus, falling back to the first pile when that
history is absent or stale; swap is unavailable when the Deck is empty. When a
viewed card was the last focus in a pile, `%` returns to that viewed card rather
than its placeholder. `Space` expands or collapses the pile containing the
focused Desk card.
In an expanded pile, `h` and `l` move card focus through its cards and wrap at
both ends. In a collapsed pile they rotate the top card exactly like the hover
arrows.

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
move them to adjacent piles or split them. Putting a filed card on the Desk does not
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
movement is wanted. Deck cards retain their whole-card identity tooltips,
including when focused. The viewed-card drag handle and individual controls
retain their own tooltips.

The Deck anchor is separate. It records the Deck position used by scrolling,
the map, bookmark jumps, and Deck navigation. When card focus is on the
Desk or a viewed card, the anchor keeps a neutral grey outline while the focused
presentation alone keeps the accent outline. Horizontal scrolling, `Left`/
`Right`, `j`/`k`, the address-initial jump, and bookmark jumps always move the
anchor. Focus follows only if it already belongs to the Deck. `c` centres the
anchor without transferring focus.

`Enter` is only the configurable shortcut for **Show focused card in Deck**. It
centres a filed Desk or viewed card. A normal Desk card transfers focus to its
Deck presentation; a viewed card keeps focus because its Deck representation is
only a placeholder. It does nothing for a Deck-focused or unfiled card.
Removing or rebinding this action in Settings also removes or changes the Enter
behaviour. `e` is the separate default editing shortcut, and `v` views a
focused Desk card or returns a viewed card to its exact Desk pile.

Slipbox viewing and editing are Desk-only. A Deck card has no View or Edit
action, and ignores `e`, `v`, and body double-click. Press `p` to put it on the
Desk and transfer focus to the pulled card; `p` followed by `e` therefore begins
editing, while `p` followed by `v` opens the view-only presentation. The
separate action that toggles the focused Deck card on the Desk without moving
focus has no default shortcut; assign one in Slipbox settings if desired.

## Card header actions

Deck, Desk, and viewed cards share one action presentation model. The edit
action uses the pen-on-file icon and is available only on Desk and viewed cards.
**Open Markdown note** uses the plain file-text icon. **Put on Desk** uses the
layered `bring-to-front` icon; once the card is on the Desk the same action
becomes **Return from Desk**. Desk and viewed cards also expose **Show in Deck**
when filed, while unfiled cards expose **File card**. Buttons always transfer
card focus to their own presentation before running their shared action.

The defaults keep the main workflow controls visible:

- Deck: Open Markdown note, Put on/return from Desk, Copy link, and Bookmark;
- filed Desk: View, Edit, Open Markdown note, Show in Deck, and Return from
  Desk;
- unfiled Desk: View, Edit, Open Markdown note, and File card;
- filed viewed: Edit, Open Markdown note, Show in Deck, and Return to Desk; and
- unfiled viewed: Edit, Open Markdown note, File card, and Return to Desk.

Copy on Desk/viewed cards, Desk movement, viewed-card return, and Delete
are available as opt-in header buttons. Bookmarking is Deck-only: the bookmark
button, command, and `b` shortcut act only when a filed Deck card has focus.
When enabled actions do not
fit, Slipbox keeps the highest-priority prefix in the header and moves the rest
into **More card actions** in their original order. Context menus, commands, and
Slipbox shortcuts are unaffected by header visibility.

## Inline card editing

The movable viewed card is Slipbox's only inline-editing surface. Double-click
the body of a Desk card to view it and immediately edit its raw Markdown; with
the Slipbox workspace focused, `e` does the same for a focused Desk or viewed
card. Deck bodies never open Slipbox's viewer or editor: pull the card with `p`
first. `Escape`, an
outside Slipbox action, navigation, a view change, or closing Slipbox saves the
latest draft before editing ends. Typing also saves after 500 ms of inactivity.
Links, card controls, headers, footers, and filing/address fields keep their
normal behavior instead of opening the editor.

The Desk `View` action brings a card closer without editing, while `v` provides
the same view-only transition for focused Desk cards. Deck headers and context
menus expose neither View nor Edit.
Other presentations of the viewed card become muted placeholders. Attempts to
focus either placeholder return focus to the viewed card. Clicking away saves
and ends editing but leaves the viewed card
open, so the Deck can still be browsed behind it. Drag the viewed card by its
header and press `v` while it has focus—or choose `Return to Desk`—when
finished. Only one card can be viewed per Slipbox
view. An unfiled viewed card can be filed directly in the viewed card without
returning to its Desk placeholder first.

Edits replace only the note body. Frontmatter is neither parsed nor rewritten,
so comments, key order, spacing, and line endings remain byte-for-byte intact,
including frontmatter-only changes made by another editor. Slipbox flushes open
Markdown views before editing and before the final save, serializes autosaves,
and refuses to overwrite a body that changed elsewhere. A conflict or write
failure keeps the textarea and draft available for copying or retrying and
cancels the pending Slipbox action. Draft recovery lasts only while the plugin
remains loaded; it is intentionally not persisted across reloads or crashes.

The paper-workflow defaults apply only to this viewed-card textarea. Restricted
paste accepts one trimmed word, one complete Wiki link/embed, or one complete
inline/reference-style Markdown link/image; longer prose is reduced to its
first non-whitespace token. Filed-card protection fixes the body present when
the editing session begins as an ordered baseline. Text may be inserted or
wrapped in Markdown anywhere, and text added during the current session may be
revised or removed, but baseline text cannot be deleted, replaced, or reordered.
Closing and reopening the editor establishes a new baseline from the saved body.
Ordinary Obsidian Markdown editors are never subject to either policy.

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

- Rendered Markdown cards with raw-Markdown inline editing and optional
  scrolling and automatic-backlink footers.
- Free background panning, horizontal trackpad browsing, minimal-reveal arrow
  navigation, and persistent card spread configured in Settings.
- A subtle ordinal Deck map with at most 512 evenly sampled neutral markers,
  exact anchor and bookmark overlays, compact address-section labels, and
  full-order click resolution to exact file paths.
- One persistent bookmark per filed file.
- Configurable Deck, Desk, and viewed-card header actions for editing, opening,
  filing, Desk placement, Deck location, links, bookmarks, movement, and deletion.
- Inline manual filing in the existing working card, with optional real-Deck
  placement inspection, plus ordinary-note conversion workflows.
- Filename- or frontmatter-derived centred titles, with a configurable new-card
  folder and timestamp naming.
- Visible malformed-address errors and non-blocking duplicate-address warnings.
- Windowed Slipbox rendering around the Deck anchor rather than the whole vault.
- `Return` activates the affirmative action in Slipbox prompt and confirmation
  dialogs, including card creation and bookmark edits.

Backlinks come from Obsidian's resolved-link graph and are never written to card
frontmatter or plugin state. Only valid filed source files are shown;
ordinary notes, unfiled cards, self-links, and unresolved links are excluded.

Bookmarks, working piles, backlinks, and direct card actions
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
The title property must differ exactly from the address property. Migration
switches an existing collision to filename titles without renaming or
removing either property.

Browser-style Back/Forward history and the Deck toolbar were removed by design
in 0.8.0. The Desk is the analogue surface for retaining working cards, while
bookmarks provide persistent landmarks. **Manage bookmarks** and **Show card
problems** remain available through Obsidian's command palette.

`Show Deck map` is enabled by default. The map derives card and bookmark
positions from the complete configured Deck order and exact file paths. It
renders at most 512 evenly sampled neutral markers, but clicks resolve against
the complete order. The Deck anchor and every bookmark are overlaid at their
exact positions; unobtrusive labels mark changes in the address section.
Numeric addresses use their complete leading ASCII digit run (`10/2a`
and `10,5/3t` both display `10`); other addresses use their first Unicode
character. Disabling the map removes the overlay.

`Card spread` sets the separation between neighbouring Deck cards from `0.18`
to `1.12` in steps of `0.01`; the default is `0.58`. Schema 8 migrates the
previous persistent spread value from workspace state without changing it,
subject to those bounds.

`Card header buttons` contains separate Deck, Desk, and viewed-card groups.
Every supported action can be enabled or disabled independently on each
surface; state-inapplicable actions remain absent. Buttons that do not fit move
into **More card actions**. Hidden actions remain available through commands,
Slipbox shortcuts, and card context menus. Schema 7 migrated the former
Deck-only Open, Copy, Desk, and Bookmark preferences without changing explicit
off choices.

Main-card and Desk-card sizes each have small, medium, and large presets. Medium
preserves the default 840 px main-card cap and 360 px Desk-card cap. Desk
presets remain smaller than main-card presets, including on narrow views.

`Paper workflow` contains six Slipbox-only controls. Fresh installations
restrict viewed-card paste and protect a filed card's session-start text by
default. Link previews and link following are off by default. Preview and follow
are independent: disabling previews suppresses Page Preview hover events, while
disabling following makes rendered body links and backlink links inert without
hiding their text, footers, overflow entries, or context menus. The settings
cover Deck, Desk, and viewed cards, including their backlink footers; explicit
Slipbox actions such as **Open Markdown note**, header buttons, commands,
bookmarks, and Deck navigation remain available. Link-setting changes refresh
open Slipbox views, while paste and protection choices are captured when the
next viewed-card editing session starts.

`Show automatic backlinks` is on by default. Turning it off removes the complete
36 px backlink footer from filed Deck and viewed cards, including its blank
geometry when no backlinks exist. Obsidian's link graph and links written in the
card body are unchanged. `Allow scrolling in cards` is also on by default.
Turning it off resets remembered positions and clips excess rendered content at
the bottom edge of Deck and viewed cards. Desk cards already clip. The raw
viewed-card editor and ordinary Obsidian Markdown views remain scrollable.
Both display settings refresh open Slipbox views immediately.

Every note created through Slipbox is placed in the configured `New card folder`.
The empty default follows Obsidian's own **Default location for new notes**
under Settings → Files and links, rather than reimplementing that preference.
Slipbox supplies the source path, so Obsidian's **Same folder as current file**
option resolves against the Deck's active card when a Slipbox view is focused,
and against the active note otherwise. A configured folder that is missing, or
that names a note rather than a folder, is reported instead of being silently
recreated elsewhere.

**New card** creates immediately with the default timestamp-derived title and
does not open the title prompt. **New card with title** asks for a title;
filename-derived titles use a sanitised nonblank title as the filename, while
frontmatter-derived titles use the configured Moment timestamp filename and
write the entered title property. Submitting a blank prompted title uses the
same default-title behaviour, while cancelling creates nothing. A filename
already in use gains a numeric suffix starting at 1, matching Obsidian's own
collision numbering.

**New card on Desk** and **New card with title on Desk** create an unfiled card
and open no note at all. The card is placed by ordinary Desk reconciliation, so
it joins the Desk's home pile exactly like any other newly discovered unfiled
card. Slipbox is opened first if no Slipbox view is present.

The Desk background context menu offers the same two workflows as **New card
here** and **New card with title here**, differing only in placing the card at
the clicked position instead of the home pile.

Every Desk creation path gives the new card the card focus, so `e` begins
inline editing immediately. Both paths leave the card at the top of its pile,
so that focus survives later reconciliation. A Desk card's title still comes
from its filename or title property, and inline editing only edits the body, so
changing the title means opening the note.

**New card** and **New card with title** open the created note the way Obsidian
itself opens a file. Slipbox reuses a navigable leaf rather than always spawning
a tab, so the result matches the core New note command and respects a pinned
tab.

The Slipbox view declares itself non-navigable, as Obsidian's own static views
do. Obsidian therefore never navigates the Slipbox leaf away, whether from an
Escape arriving while a modal holds focus or from reusing a leaf to open a
note, and the view does not need to be pinned to survive.

Slipbox applies no template of its own. Obsidian's Templates core plugin
provides an **Insert template** command that works in any editor, including a
newly created card.

## Default Slipbox keys

| Key | Action |
| --- | --- |
| `←` / `k` | Move the Deck anchor to the previous card |
| `→` / `j` | Move the Deck anchor to the next card |
| `[` | Move the Deck anchor to the closest bookmark on the left |
| `]` | Move the Deck anchor to the closest bookmark on the right |
| `c` | Centre the Deck anchor without transferring focus |
| `Enter` | Show the focused filed Desk/viewed card in the Deck |
| `e` | Edit the focused Desk/viewed card |
| `v` | View the focused Desk card, or return the viewed card to its Desk pile |
| `b` | Toggle the focused Deck card's bookmark |
| `y` | Copy a link to the focused card |
| `0` | Jump to the first card |
| `$` | Jump to the last card |
| `Ctrl+d` | Move forward ten Deck positions |
| `Ctrl+u` | Move backward ten Deck positions |
| `o` | Open the focused card in Markdown |
| `p` | Put the focused filed card on the Desk and focus it, or return it from the Desk |
| Unassigned | Toggle the focused Deck card on the Desk without moving focus |
| `{` / `}` | Cycle card focus backward/forward through the Deck and Desk piles |
| `%` | Swap focus between the Deck and the last focused pile |
| `Space` | Expand or collapse the focused Desk card's pile |
| `h` / `l` | Focus the previous/next card in a pile, wrapping at both ends |
| `Alt+←` / `Alt+→` | Move the focused Desk card within its pile |
| `g` then a character | Find the first card from the start whose address begins with that character |
| `P` then a pile number and `Enter` | Put or move the focused filed card into that one-based visible pile |
| `m` | Toggle this Slipbox view's Deck map |

Address-initial searches are case-sensitive, use the first Unicode character of
the configured address, and do not wrap. `Escape` cancels a pending multi-key
command. In pile-number mode, digits accumulate, `Backspace` removes the last
digit, and invalid or nonexistent pile numbers leave the Desk unchanged. `P`
never returns a filed card to the Deck; lower-case `p` retains that toggle.

The Deck-map shortcut is session-only and independent in each open Slipbox
view. Each map initially follows the global `Show Deck map` setting, while `m`
can temporarily override that default in the active view. The retired `H`, `L`,
and `t` bindings are left unassigned.

On macOS, `Ctrl+d` and `Ctrl+u` use the literal Control key, not Command. Slipbox
keeps `Ctrl` distinct from the platform-aware `Mod` modifier in custom bindings.

Every stable Slipbox action can have multiple scoped shortcuts. Changes apply to
open Slipbox views immediately, and duplicate bindings are rejected. They remain
scoped to the active Slipbox view, so ordinary typing and editor navigation are
unaffected in Markdown and viewed-card editors. Slipbox yields each candidate
key to Obsidian first. If an Obsidian hotkey handles it, Slipbox leaves the key
alone and shows a conflict warning; otherwise the scoped Slipbox action runs.
Slipbox actions are also exposed as unassigned commands in Obsidian's Hotkeys
settings. The previous Legacy Desk shortcut is removed rather than repurposed.

## Manual filing and address domain

`File active unfiled Markdown note`, the File action, or a double-click on an
unfiled address starts inline filing. A Desk card stays at its ordinary size and
position; a viewed card stays open above the workspace. In either case the
source gains a light accent treatment and replaces its empty address slot with
the same address field. The active filed card's address is prefilled when one is
available. Validation and an expandable duplicate-path summary appear compactly
on the source card; there is no separate card-in-hand, bottom bar, or Deck ghost.

While the address field owns native focus, `Enter` confirms the current valid
address and `Escape` cancels without changing Markdown or working-pile
membership. `Tab` moves focus to the Deck and selects the real card immediately
before the prospective insertion point. At the beginning it selects the first
filed card for context. The ordinary Deck shortcuts and horizontal scrolling
then work normally. The previewed Deck card receives focus, while `Shift+Tab`
returns directly to the inline address field. Editing an address alone never
moves the Deck. Hovering the empty slot explains the double-click affordance,
and the address field's placement-aware tooltip explains `Tab`, `Shift+Tab`, and
`Enter`. Successful viewed-card filing closes the viewed card and focuses the
newly filed real card in the Deck.

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

**Insert link to card…** writes the same link at the cursor of a Markdown
editor, replacing the selection when there is one. It opens a suggester over
every filed card, listing each card's address above its resolved title, so the
title follows the `Title source` setting and shows the configured title
property rather than the filename when frontmatter titles are chosen. Matching
is literal rather than fuzzy: an exact address ranks first, then addresses
beginning with the query, then addresses containing it, and finally titles
containing it, with Deck order preserved inside each group. Typing a complete
address and pressing Enter therefore always inserts that card. Cards sharing an
address are listed separately and show their vault paths.

This is an ordinary Obsidian editor command, so it can be bound to a hotkey in
Obsidian's own settings and is available wherever an editor is: ordinary notes
and Canvas card editors alike. It is deliberately unavailable in the Slipbox
inline card editor, which is a plain textarea rather than an Obsidian editor,
and is unavailable when no card is filed.

## Compatibility notes

No Markdown migration is performed. Existing canonical Luhmann addresses remain
valid, while strings rejected by the former grammar now participate in the main
Deck. Existing addresses are never trimmed, normalised, deduplicated, or
renumbered. The default Natural comparator intentionally differs from the old
Luhmann comparator in alphabetic rollover cases—for example, `1/1aa` may now
precede `1/1z`. Renaming a file may reorder it within an exact-address duplicate
group because path order is the deterministic tie-breaker.

Schema 9 silently purges the retired `useTemplatesForNewNotes` and
`newNoteTemplatePath` settings, retaining every other compatible setting and all
state. Card notes written while template support existed are unaffected; the
template content is already part of those files.

Schema 10 adds the four paper-workflow settings. Existing schema-9 and legacy
plugin data migrate to the previous permissive behavior—unrestricted paste,
link previews and following enabled, and no filed-text protection—unless an
explicit boolean was already stored. Only genuinely fresh installations receive
the paper-based defaults.

Schema 11 adds automatic-backlink visibility and rendered-card scrolling.
Missing or invalid values preserve the previous display: automatic backlink
footers and scrolling remain enabled.

## Privacy and security

Slipbox operates locally and offline. The plugin does not make network
requests, load remote code, collect telemetry, display advertising, require an
account, or access files outside the active Obsidian vault. It reads and writes
vault files only for the card, filing, linking, and Canvas actions initiated by
the user.

## Development

Development requires Node.js 20 or newer and npm. Install the locked dependency
set and run the complete verification pipeline:

```sh
npm ci
npm run check
```

`npm run check` performs strict TypeScript checking, the Node test suite,
warning-free ESLint, a production build, and release-metadata validation.
`npm run build` produces the ignored `main.js`. The installable plugin consists
of `manifest.json`, `main.js`, and `styles.css`.

[`AGENTS.md`](AGENTS.md) is a byte-for-byte mirror of the official Obsidian
sample plugin file at commit
[`07ceb81`](https://github.com/obsidianmd/obsidian-sample-plugin/commit/07ceb81d1fb3384af611ebf665a1ec42a7e5926d).
Refresh it deliberately from that upstream file; do not add Slipbox-only rules
to the mirror.

For repeatable large-vault profiling, generate a standalone synthetic vault:

```sh
npm run generate:scale-vault -- --notes 25000 --output /tmp/SlipboxScaleVault
```

The generator refuses to write into a non-empty directory, installs the current
plugin bundle into the fixture, and creates a deterministic mix of filed cards,
unfiled cards, ordinary notes, resolved-link traffic, and a high-backlink hub.

## Releases

Run `npm version patch`, `npm version minor`, or `npm version major` from a clean
`main` branch. The version lifecycle runs the complete check, synchronises
`package.json`, `package-lock.json`, `manifest.json`, and `versions.json`, and
creates an exact version tag without a leading `v`. Pushing that tag builds and
refreshes a draft GitHub Release containing `main.js`, `manifest.json`, and
`styles.css`.

Draft releases created while the repository is private are not publishable.
After making the repository public, manually rerun the release workflow for the
tag so GitHub can attest the rebuilt artifacts. Inspect the refreshed assets and
attestations before publishing the draft.

## Support and license

Report defects and request features through the repository's GitHub Issues.
Slipbox is available under the [0BSD license](LICENSE).
