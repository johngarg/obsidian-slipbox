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

- [ ] Enable explicit branch links and confirm marked Wiki and Markdown aliases
  show incoming labels on the active Deck card, expanded Desk cards, and the
  viewed card.
- [ ] File a card at `+12`. Confirm a normal link displayed as `+12` remains
  ordinary, while an explicit alias `++12` is indexed and presented as a branch
  with label `+12`.
- [ ] With **Outline branch links in cards** enabled, confirm marked aliases
  receive a quiet outline in Deck, Desk, and viewed-card bodies but not in
  ordinary Reading view, Live Preview, source mode, or Slipbox inline editing.
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
- [ ] Disable labels or inspect a card without incoming branch annotations and
  confirm no separator dot follows its canonical address.
- [ ] Change the branching toggles; confirm the UI refreshes and no
  Markdown or frontmatter changes.
- [ ] Enable address-derived inference for roots `7`, `8`, and `17`; confirm forward
  cycling produces `8 → 17 → 7 → 8` and backward cycling reverses it.
- [ ] With `8a`, `8b`, `8a1`, `8a2`, and an unrelated equal-depth branch,
  confirm sibling cycling wraps locally and never crosses between parents.
- [ ] Confirm the local Branch View appears expanded only beneath the active
  ordinary Deck card. Move the Deck anchor, open a viewed card, focus expanded
  Desk piles, and move cards without seeing a second view or remounting card
  bodies. Collapse it, move the anchor, and confirm the per-view collapsed
  state is retained.
- [ ] On `8b` in a strand `8a`, `8b`, `8c`, confirm the toolbar moves backward
  to `8a`, forward to `8c`, and to the known beginning `8a` without wrapping.
  At root level, confirm the beginning control remains disabled. Verify the
  existing `n`, `N`, and `-` commands retain their previous wrapping/parent
  behavior.
- [ ] Add inferred children and several outgoing `+` branches to the active
  card. Confirm all departures appear below it, explicit labels omit the `+`,
  repeated supplementary controls navigate directly, and a duplicate-address
  destination opens an exact-path chooser. Add several incoming explicit
  parents and confirm the view quietly uses one stable higher context.
- [ ] Create long higher, current, and departure strands. Narrow the pane and
  confirm the active node, branch attachment points, and known ends survive;
  omitted runs become counted gaps while hidden departures remain short stubs.
  Activate a gap to reveal only that run with horizontal scrolling, then
  activate a stub and confirm its sole departure expands or its several
  departures open a chooser from which only one is expanded.
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
