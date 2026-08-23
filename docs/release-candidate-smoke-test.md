# Slipbox release-candidate smoke test

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
- [ ] Confirm Slipbox is enabled under **Settings → Community plugins**.
- [ ] Open Slipbox from its ribbon icon without a console error.
- [ ] Disable and re-enable Slipbox without an error or stale UI.
- [ ] Quit and restart Obsidian; reopen Slipbox successfully.

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

## Minimum-version compatibility subset

Complete this section on Obsidian 1.13.0 on at least one tested platform.

- [ ] Enable and open Slipbox.
- [ ] Confirm filed and unfiled cards are indexed correctly.
- [ ] Create, file, view, and edit a disposable card.
- [ ] Create a Canvas from a pile.
- [ ] Restart Obsidian and reopen Slipbox without a console error.

## Findings

For each finding, record the step, expected result, actual result, severity,
console output, and a screenshot when useful.

## Sign-off

- [ ] Pass: no blocking findings.
- [ ] Fail: one or more blocking findings remain.

Tester notes:

