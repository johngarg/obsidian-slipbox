# Slipbox Desk release-candidate smoke test

Test only in the supplied disposable vault. Do not use a personal vault.

## Environment

| Field | Value |
| --- | --- |
| Candidate version | |
| SHA-256 of `main.js` | |
| Operating system and version | |
| Architecture | |
| Obsidian version | |
| Linux package format, if applicable | |
| Test date | |
| Tester | |

Open **View → Toggle developer tools** and keep the Console visible during the
test. Record unexpected warnings or errors under Findings.

## Installation and lifecycle

- [ ] Open the supplied folder as an Obsidian vault and approve its use.
- [ ] Confirm Slipbox Desk is enabled under **Settings → Community plugins**.
- [ ] Open Slipbox Desk from its ribbon icon without a console error.
- [ ] Disable and re-enable Slipbox Desk without an error or stale UI.
- [ ] Quit and restart Obsidian; reopen Slipbox Desk successfully.

## Core card workflow

- [ ] Confirm the supplied filed cards appear in address order.
- [ ] Confirm unfiled cards appear in a Desk pile and ordinary notes are absent.
- [ ] Navigate the Deck with pointer, horizontal scrolling, and keyboard controls.
- [ ] With and without Desk piles, confirm `zz` centres the Deck at 50%, `zb`
  positions it near the bottom, and `zt` positions it near the top with space
  visible below. When a fixed card fits in the pane, both its header and footer
  remain inside the pane after either command, including after resizing. In a
  pane shorter than the card, `zt` exposes the header and `zb` the footer. Check
  all card sizes in both orientations and stacking models.
- [ ] Reopen Drawer with and without an automatic unfiled-card pile and confirm
  centred default alignment along the Deck axis. Horizontal Drawer retains the
  pile-dependent vertical alignment; Fan retains its previous startup alignment.
- [ ] In both Drawer orientations, pan both axes and click another card, then pan
  again and click the same card. Confirm only sequence-axis pan resets, with a
  single smooth selection/gap/return animation and no initial snap. Repeat with
  explicit `zt` / `zb` and `zh` / `zl`, including an oversized card in a short pane.
- [ ] Interrupt the return with another click, a wheel gesture, background pan,
  or header drag. Confirm continuity from the displayed position, no repeated
  recentering during gestures, and no return from the click after a drag/cancel.
  Check controls, links, editing, double-clicks and stationary Fan selection.
- [ ] With reduced motion, confirm the complete return is immediate. During normal
  motion after large pans, check cards entering and leaving the pane for popping,
  premature removal or blank gaps. Body scroll positions and perpendicular Desk
  arrangement must survive. Confirm surplus cards are released after settling.
- [ ] Before any development reload, preserve session-only Desk state and view
  state; do not reload over an active edit. Restore and compare piles, positions,
  expansion and ID sequence, settings, both alignment overrides, anchor/offset,
  pan, focus, viewed-card state, body scrolls and Branch View state afterward.
- [ ] Create an untitled card and a titled card.
- [ ] File an unfiled card at a new address and confirm its Markdown frontmatter.
- [ ] Put a filed card on the Desk, expand and collapse its pile, and drag it.
- [ ] View and edit a Desk card; confirm the body saves after leaving the editor.
- [ ] Create a Canvas from a pile and confirm its cards appear as file nodes.
- [ ] Delete a test card and confirm Obsidian uses its configured deletion policy.

## Presentation and regression checks

- [ ] Repeat representative Deck and Desk interactions in light theme.
- [ ] Repeat representative Deck and Desk interactions in dark theme.
- [ ] Resize the window and confirm cards, piles, menus, and dialogs remain usable.
- [ ] Confirm expected Windows/Linux modifier-key behavior and no shortcut trap.
- [ ] Confirm no unexpected console error occurred during the completed checks.

## Branching and structural navigation

- [ ] Enable supplementary branch links and confirm marked Wiki and Markdown aliases
  show incoming labels on the active Deck card, expanded Desk cards, and the
  viewed card.
- [ ] File a card at `+12`. Confirm a normal link displayed as `+12` remains
  ordinary, while a supplementary alias `++12` is indexed and presented as a branch
  with label `+12`.
- [ ] With **Outline branch links in cards** enabled, confirm marked aliases
  receive a quiet outline in Deck, Desk, and viewed-card bodies but not in
  ordinary Reading view, Live Preview, source mode, or Slipbox inline editing.
  Confirm an alias inside authored bold Markdown remains bold.
  Confirm unresolved, unfiled-target, and self-link aliases are outlined while
  `[[+a]]`, embeds, external links, and unmarked aliases remain ordinary.
- [ ] Disable ordinary card-link following and confirm outlined aliases remain
  visible but do not acquire a clickable hover treatment. Toggle outlining and
  confirm existing cards update without moving focus, scroll, or card layout.
- [ ] With **Hide branch-link markers in cards** enabled, confirm `+` disappears
  from marked aliases in Deck, Desk, and viewed card bodies while their labels
  and link targets remain intact. Toggle it and confirm `+` returns in place;
  ordinary Markdown views and inline editing remain unchanged.
- [ ] Use a long label and several incoming branches; confirm the header keeps
  clear of the title and a `+N` menu exposes every hidden annotation.
- [ ] Turn off ordinary card-link following and confirm visible branch-label
  buttons and overflow-menu items no longer recenter their source cards or
  receive keyboard focus. With hover previews enabled, confirm the visible
  labels can still preview their sources. Confirm ordinary rendered card links
  lose their underlines while enabled links retain the active theme's styling.
- [ ] Edit a branch alias inline, leave with `Escape`, and confirm its label
  updates without flashing or remounting the card.
- [ ] Put a labelled card on the Desk and hover/focus it repeatedly; confirm
  the address, annotation, title, and action toolbar remain stationary while
  annotations fit into the `+N` menu. A short annotation should reserve only
  its content width so the title can use the remaining header space.
- [ ] Disable **Show supplementary branch labels on cards** or inspect a card
  without incoming branch annotations and confirm no separator dot follows its
  canonical address.
- [ ] Change the branching toggles; confirm the UI refreshes and no
  Markdown or frontmatter changes.
- [ ] Confirm the local Branch View and its floating `git-branch` control appear
  only beneath the active ordinary Deck card. Hide and show the diagram with
  the icon and with **Toggle Branch View** in the command palette and its default
  `b` shortcut. Turn off **Show local Branch View** and confirm the diagram,
  control rail, command action, and `b` behavior are all absent; turn it back on
  and confirm the diagram starts shown.
  While shown, confirm six standard movement icons extend left from the toggle.
  Move the Deck anchor, open a viewed card, focus expanded Desk piles, and move
  cards without seeing a second control rail or remounting card bodies.
- [ ] On `8b` in a strand `8a`, `8b`, `8c`, use the six Branch View commands
  from the command palette and the default `N`, `n`, and `^` shortcuts. Confirm
  they move backward to `8a`, forward to `8c`, and to the known beginning `8a`
  without wrapping. At root level, confirm the beginning command is unavailable.
- [ ] Add two cards at `8a` in normal Deck order before `8b`. Confirm the
  Branch View shows both exact cards consecutively; forward and backward move
  through each one in order, beginning selects the first, and entering a higher
  strand with duplicate cards selects its first card without opening a chooser.
- [ ] Add inserted children and several outgoing `+` branches to the active
  card. Confirm all departures appear below it, supplementary labels omit the `+`,
  and the default `>`, `+`, and `<` shortcuts enter an inserted branch, enter a
  supplementary branch, and move to a higher strand. Confirm each movement
  retains one icon, a sole supplementary destination navigates directly, and
  several supplementary or duplicate-address destinations open a searchable
  exact-path chooser. Confirm supplementary aliases appear as chooser options
  and filtering by an alias finds the corresponding destination. Add several
  incoming supplementary parents and confirm the view quietly uses one stable
  higher context.
- [ ] From `17,1`, add a supplementary branch to `17,1,1` alongside `17,1,2`,
  `17,1A`, and `17,1a`. Confirm the supplementary row contains only
  `17,1,1 → 17,1,2`, the appended-letter cards remain a separate inserted row,
  and backward, forward, and beginning commands never cross between them.
  Remove `17,1,2` and confirm the supplementary row becomes a singleton.
- [ ] Create long higher, current, and departure strands. Narrow the pane and
  confirm the active node, branch attachment points, and known ends survive;
  omitted runs of two or more become counted ellipses, singleton omissions stay
  visible, and hidden departures remain short stubs. Scroll the tray, then
  activate a gap to reveal only that run without resetting horizontal position;
  then activate a stub and confirm its sole departure expands or its several
  departures open a chooser from which only one is expanded. Confirm that
  auxiliary row has no further stubs, then drag blank diagram space to pan the
  Deck without breaking node, gap, stub, or scrollbar interaction.
- [ ] Verify mouse and keyboard node activation, visible focus, disabled
  controls, full address/path tooltips, hover-preview policy, structural
  activation with body-link following off, long labels, light/dark/community
  themes, forced colours, and narrow/tall-card clipping.
- [ ] Switch between natural and lexicographic Deck ordering and confirm numeric
  prefix ancestry changes immediately.

## Minimum-version compatibility subset

Complete this section on Obsidian 1.13.0 on at least one tested platform.

- [ ] Enable and open Slipbox Desk.
- [ ] Confirm filed and unfiled cards are indexed correctly.
- [ ] Create, file, view, and edit a disposable card.
- [ ] Create a Canvas from a pile.
- [ ] Restart Obsidian and reopen Slipbox Desk without a console error.

## Findings

For each finding, record the step, expected result, actual result, severity,
console output, and a screenshot when useful.

## Sign-off

- [ ] Pass: no blocking findings.
- [ ] Fail: one or more blocking findings remain.

Tester notes:

## Vertical Deck and layout matrix

- [ ] Exercise Horizontal/Vertical × Drawer/Fan at spreads 0.10, 0.58, and 1.12,
  with splay 0 and 5, using both a small card set and the large development corpus.
- [ ] Check all three card sizes in full-width and narrow split panes. Resizing,
  browsing, and `zt`/`zz`/`zb` must preserve card dimensions. Pan to reach clipped content.
- [ ] In overlapping untilted vertical Drawer, both sides expose header edges.
  Wide spacing and splay may expose body/footer content legitimately.
- [ ] Click neighbours, jump with the map/bookmarks, hold navigation keys, and
  reverse wheel direction mid-transition. Drawer must not flash or abruptly jump
  its reading gap. Fan keeps stationary click selection.
- [ ] Pan far along and across the Deck at minimum spread. Visible context must
  fill in while dragging, without an artificial 24-neighbour boundary.
- [ ] Open a long card: scroll to both body boundaries, continue into the Deck,
  reverse direction, and retry after a pause. Test Body first, Deck, and disabled
  body scrolling. Editor and Branch View wheels must remain contained.
- [ ] Drag a vertical card header vertically to pan and sideways to create a Desk
  pile. Check cancellation, short clicks, double clicks, and existing pile drops.
- [ ] Verify vertical map hover/click, Up/Down, Home/End, and bookmark edge tabs.
  Pan the workspace and confirm offscreen bookmark targets update.
- [ ] In the vertical Deck map, confirm bookmark, active, colour, Desk, and
  clustered marks share the rail’s horizontal centre with the section notches.
  Switch back to horizontal and confirm the marks remain centred on its rail.
- [ ] Explore Left Branch View in a split: pan to every departure column, expand
  omitted runs and hidden branches, scroll long strands, and activate nodes by
  pointer and keyboard. Text stays upright and node/stub hit areas stay distinct.
- [ ] Check Auto, Left, Below, Hidden, and the session visibility command in both
  Deck orientations. Verify legacy hidden settings remain hidden after upgrade.
- [ ] Switch orientation repeatedly: default arrows follow it, `j`/`k` stay the
  same, custom/disabled bindings stay fixed, and reset restores automatic arrows.
- [ ] Repeat representative interactions in light/dark themes and with reduced
  motion. Verify edits save, filing/bookmarks work, and Desk/viewed cards retain
  their own sizes and interactions. Watch the developer console for errors.

### Fan painting regression

- [ ] In vertical Fan at spread 0.10 and splay 5, browse forward and backward,
  including large jumps, then hover the card header, body, and workspace. The
  anchor remains fully painted; no rectangular sections show neighboring cards.
- [ ] With a large Deck at spread 0.10, scroll continuously in both Fan and
  Drawer. Movement remains smooth, including while the focused card changes;
  the painting fix must not cause the whole stack to repaint on every step.
- [ ] Scroll a long anchor body, select a neighboring card, and return. Body
  scrolling still works and the previous scroll position is preserved.

- [ ] Enable **Show lower Fan headers at bottom** in vertical Fan. Lower cards
  expose their address/title strips at the bottom in place of the regular footer;
  selecting one restores its top header and normal footer immediately. Check wheel navigation in both directions,
  clicks, header controls/dragging, and preserved body scroll positions. Disable
  the option or switch to horizontal/Drawer and confirm all headers return to top.


### Sustained scrolling performance

- [ ] Follow [the scrolling comparison protocol](deck-scroll-performance.md) for
  both Drawer and Fan. Record input travel as well as timing; measure builds
  separately from compilation and test execution.
- [ ] Continue and reverse a dense Drawer gesture for at least 40 seconds.
  Mounted-card and transition-pose counts should remain bounded by the visible
  window and transient overlap, rather than grow with every card passed.
- [ ] Focus a bookmark edge button and scroll without changing its target. The
  same button should keep focus and its action; changed targets must update.
- [ ] Rebuild, resize and close the Deck during pending animation/render work.
  No detached card should receive later updates and the replacement view must
  remain usable.
- [ ] Replace the filed snapshot through an index refresh, rename/delete the
  anchor, and reorder cards. Navigation must resolve the anchor's new index.


### Deck positioning and appearance refinements

- [ ] Exercise `zh`, `zl`, `zt`, `zb`, and `zz`, plus their command-palette actions,
  in both orientations and models. Left/right preserve vertical pan and alignment;
  top/bottom preserve horizontal pan and alignment. `zz` clears both axes and the
  continuous viewport offset. Combine commands to reach corners.
- [ ] Resize through panes wider/narrower and taller/shorter than every card size.
  Requested edges remain visible, bookmarks remain reachable, and visible cards
  are not culled prematurely after left/right positioning.
- [ ] Toggle orientation through the palette and a custom shortcut, including an
  empty Deck and multiple views. Anchor, focus, fractional viewport position,
  pan, alignments, body scroll and custom/disabled bindings survive round trips.
  Automatic arrows, map and Branch View follow orientation. A failed edit save
  prevents the command; pending motion cannot paint into a rebuilt stage.
- [ ] Card spread retains its name and values. Card splay controls both rotation
  and transverse offsets; the focused card stays straight. Card fading at 0,
  0.5, 1 and 2 changes opacity without changing geometry, with the default model
  floors preserved. Settings take effect immediately and persist after reload.
- [ ] Lower Fan headers replace the footer with no leftover footer space. Select
  lower cards, navigate past them, disable the setting and switch layout; normal
  headers and footers return. Repeat with backlinks disabled and long scrolled
  bodies. Card DOM identity remains stable through selection changes.
