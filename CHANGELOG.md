# Changelog

This file records notable user-facing changes to Slipbox Desk. The project uses
[Semantic Versioning](https://semver.org/), and the history begins with the
initial public beta.

## [Unreleased]

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
