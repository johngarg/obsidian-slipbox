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
- [ ] Turn off ordinary card-link following and confirm a branch-label button
  still recentres its source card without closing or flashing the viewed card.
- [ ] Edit a branch alias inline, leave with `Escape`, and confirm its label
  updates without flashing or remounting the card.
- [ ] Put a labelled card on the Desk and hover/focus it repeatedly; confirm
  the address, annotation, title, and action toolbar remain stationary while
  annotations fit into the `+N` menu. A short annotation should reserve only
  its content width so the title can use the remaining header space.
- [ ] Disable labels or inspect a card without incoming branch annotations and
  confirm no separator dot follows its canonical address.
- [ ] Change the marker and branching toggles; confirm the UI refreshes and no
  Markdown or frontmatter changes.
- [ ] Enable address-derived inference for roots `7`, `8`, and `17`; confirm forward
  cycling produces `8 → 17 → 7 → 8` and backward cycling reverses it.
- [ ] With `8a`, `8b`, `8a1`, `8a2`, and an unrelated equal-depth branch,
  confirm sibling cycling wraps locally and never crosses between parents.
- [ ] On `8`, confirm the left menu shows `7`; the right menu shows `17`, a
  gap, then immediate children `8a` and `8b`, with no visible headings or
  current-card row. Add more roots on either side and confirm each menu still
  shows only the nearest sibling in its direction.
- [ ] Confirm inferred-navigation arrows appear only on the active Deck card,
  the focused card in an expanded Desk pile, and the viewed card; moving Desk
  focus transfers the arrows without remounting either card. Disabled sides
  remain subtly visible, and the presentation toggle hides both arrows without
  rebuilding the index.
- [ ] Verify click, hover, keyboard opening, `Escape`, child counts, preview
  policy, structural activation with body-link following off, and long-list
  scrolling in both light and dark themes.
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
