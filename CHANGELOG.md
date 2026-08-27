# Changelog

This file records notable user-facing changes to Slipbox Desk. The project uses
[Semantic Versioning](https://semver.org/), and the history begins with the
initial public beta.

## [Unreleased]

### Added

- Added optional explicit branch links marked through displayed aliases such as
  `[[card|+a]]`, with interactive incoming labels on Deck, Desk, and viewed
  cards. Labels that do not fit the header collapse into a `+N` menu.
- Added optional hierarchy inference from address extension, with
  commands for parent movement and wrapped forward/backward sibling cycling.
- Added low-clutter parent, sibling, and child menus beneath interactive cards
  when branches are inferred. Each direction shows only the nearest
  sibling; the commands continue to cycle through the full sibling axis.
- Added a Branching settings group. Both branch models are derived in memory
  and never rewrite notes or addresses.

### Fixed

- Kept late metadata updates from remounting a card as inline editing closes.
- Kept a viewed card mounted when one of its links moves the Deck anchor.
- Kept annotated Desk-card headers stable while labels, titles, and action
  overflow are fitted, reserved only the signature’s measured content width,
  and omitted the address separator when no annotation is present.
- Restricted inferred-navigation arrows in expanded Desk piles to the focused
  card and transferred them in place when Desk focus changes.
- Kept available Deck commands runnable from the command palette while its
  search field is focused.

### Changed

- Standardised address-derived hierarchy terminology on “inferred” throughout
  the interface, commands, settings, and documentation.
- Divided the Branching settings into explicit and inferred subsections.

## [0.12.2] - 2026-08-26

### Fixed

- Saving a changed card with `Escape` no longer flashes or remounts the card.
- Card-header actions now work on the first click while editing, after the
  current draft has been saved.

## [0.12.1] - 2026-08-25

### Fixed

- Removed the redundant product name from the Community plugin description.

## [0.12.0] - 2026-08-25

### Added

- Added optional identity and action tooltips for Deck, Desk, and viewed cards.
  They are disabled by default.

## [0.11.1] - 2026-08-24

### Changed

- Renamed the public display brand from Slipbox to Slipbox Desk. The stable
  plugin ID remains `slipbox`.

## [0.11.0] - 2026-08-24

Initial public beta.

### Added

- Added dragging filed cards from the Deck into new or existing Desk piles.
- Added settings for automatic backlink footers and card-body scrolling.

### Changed

- New installations use `slipbox-id` and `slipbox-title` as the default card
  metadata properties.
- Improved default pile placement and kept the Deck stable as cards and piles
  are added or moved.

[Unreleased]: https://github.com/johngarg/obsidian-slipbox/compare/0.12.2...HEAD
[0.12.2]: https://github.com/johngarg/obsidian-slipbox/compare/0.12.1...0.12.2
[0.12.1]: https://github.com/johngarg/obsidian-slipbox/compare/0.12.0...0.12.1
[0.12.0]: https://github.com/johngarg/obsidian-slipbox/compare/0.11.1...0.12.0
[0.11.1]: https://github.com/johngarg/obsidian-slipbox/compare/0.11.0...0.11.1
[0.11.0]: https://github.com/johngarg/obsidian-slipbox/releases/tag/0.11.0
