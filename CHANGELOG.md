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

### Changed

- Assigned Vim-style defaults for inferred navigation: `-` for the parent and
  `n`/`N` for forward/backward sibling cycling.
- Standardised address-derived hierarchy terminology on “inferred” throughout
  the interface, commands, settings, and documentation.
- Divided the Branching settings into explicit and inferred subsections.
- Coalesced metadata-driven index rebuilds and removed redundant Deck renders
  when ordering, creating Desk cards, filing, or adjusting card spread.
- Standardised the current implementation, commands, and styling hooks on
  “Desk” and the schema-14 data model.

### Removed

- Removed pre-schema-14 settings migrations, the legacy persistent Desk and
  Canvas export, Tray-named settings and styling aliases, and deprecated source
  exports. Upgrading now resets settings while retaining path bookmarks; Desk
  command hotkeys and Tray-based CSS customisations must be configured again.

### Fixed

- Stopped blank or missing frontmatter title properties from displaying the
  card filename as a Deck, Desk, or viewed-card header title.
- Kept “Return from Desk” visually consistent with the other card actions
  instead of giving it a disabled-looking grey background.
- Disabled filing confirmation while the duplicate-address policy blocks the
  entered address.
- Made the tooltip preference apply to inferred navigation, branch annotations,
  and links rendered inside Deck and Desk cards.
- Kept annotated Desk-card headers stable while labels, titles, and action
  overflow are fitted, reserved only the signature’s measured content width,
  and omitted the address separator when no annotation is present.
- Restricted inferred-navigation arrows in expanded Desk piles to the focused
  card and transferred them in place when Desk focus changes.
- Kept available Deck commands runnable from the command palette while its
  search field is focused.
- Kept text-setting validation messages on their own row beneath the input.
- Promoted explicit and inferred branching to separate top-level settings groups.
- Removed CSS constructs flagged by Obsidian's community-plugin scanner while
  preserving signature focus and drag-time navigation behavior.
- Desk piles can now be laid out on existing Canvases, including newly created
  empty Canvases.
- Kept card interactions, dragging, links, modals, and fitted controls in the
  correct window after moving Slipbox Desk to an Obsidian popout.

## [0.13.0] - 2026-08-27

### Added

- Added pile context-menu actions for bringing a pile to the highest ordinal
  or sending it to the lowest, while expanded piles remain above collapsed
  piles.

### Changed

- Replaced **Show card tooltips** with **Show tooltips**, which controls all
  Slipbox-view tooltips while retaining accessible labels when disabled.

### Fixed

- Kept late metadata updates from remounting a card as inline editing closes.
- Kept a viewed card mounted when one of its links moves the Deck anchor.
- Deleted cards now follow Obsidian's confirmation and trash workflow once,
  without a second trash attempt or an erroneous missing-file notice.
- Card-header buttons now act on their own card without first moving card
  focus or the Deck anchor.

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

[Unreleased]: https://github.com/johngarg/obsidian-slipbox/compare/0.13.0...HEAD
[0.13.0]: https://github.com/johngarg/obsidian-slipbox/compare/0.12.2...0.13.0
[0.12.2]: https://github.com/johngarg/obsidian-slipbox/compare/0.12.1...0.12.2
[0.12.1]: https://github.com/johngarg/obsidian-slipbox/compare/0.12.0...0.12.1
[0.12.0]: https://github.com/johngarg/obsidian-slipbox/compare/0.11.1...0.12.0
[0.11.1]: https://github.com/johngarg/obsidian-slipbox/compare/0.11.0...0.11.1
[0.11.0]: https://github.com/johngarg/obsidian-slipbox/releases/tag/0.11.0
