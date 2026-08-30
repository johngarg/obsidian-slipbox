# Changelog

This file records notable user-facing changes to Slipbox Desk. The project uses
[Semantic Versioning](https://semver.org/), and the history begins with the
initial public beta.

## [Unreleased]

### Added

- Added optional theme-aware card colours selected through the combined new-card
  options dialog. Quick creation remains uncoloured, while the prompted commands
  retain their IDs and now expose accessible circle buttons alongside the
  optional title. Headers use an adaptive light/dark tint, Deck-map markers keep
  the selected colour, and bookmarks surround those markers with an accent ring.
- Added optional supplementary branch links using the fixed canonical `+` alias
  syntax, such as `[[card|+a]]`, with interactive incoming labels on Deck,
  Desk, and viewed cards. Marked aliases can receive a quiet outline in
  rendered Slipbox card bodies and hide their `+` prefix there by default,
  while labels that do not fit the header collapse into a `+N` menu. Exact
  aliases for `+`-addressed cards remain ordinary; `++address` asserts a branch
  whose label is `+address`.
- Added optional inserted strands derived from address extension.
- Added an expanded-by-default local Branch View beneath the active Deck card.
  Its deterministic SVG shows the current strand, one higher context, active
  departures, hidden-branch stubs, responsive counted ellipses, exact duplicate
  cards, and labelled supplementary edges. Six movement actions are available
  from the command palette with Vim-inspired defaults; `b` toggles per-view
  visibility by default.
- Added a Branching settings group. Both branch models are derived in memory
  and never rewrite notes or addresses.

### Changed

- Changed the default inline-edit shortcut from `e` to Vim-style `i`.
- Reassigned the default bookmark, Branch View, and Deck-map shortcuts to `m`,
  `b`, and `O`, respectively. Saved copies of the unreleased earlier defaults
  are replaced on load, while bindings that were actually customized remain.
- Split branching settings into relationship and presentation groups, clarified
  supplementary-label scope, and shortened the Branch View action names. Turning
  off **Show local Branch View** now removes its control rail and disables its
  toggle action instead of leaving a per-view override available.
- Replaced the pile-dependent centre shortcut with Vim-style `zt`, `zz`, and
  `zb` Deck positioning at 33%, 50%, and 67% of the view, respectively. New
  views initially use `zb` when the reconstructed unfiled-card pile exists and
  otherwise use `zz`; `c` is no longer bound by default.
- Enlarged local Branch View nodes, reduced their address type, aligned each
  departure one column to the right of its source, straightened branch
  connections, and tightened the spacing between strands.
- Presented the local Branch View as an uncapped transparent diagram beneath
  its card, widened it within the Deck stage, enabled Deck panning from its
  noninteractive space, and added a card-aligned floating control rail. A
  persistent standard `git-branch` icon toggles the diagram, while its six
  standard movement icons extend to the left only while the view is shown.
- Replaced repeated supplementary movement buttons with one stable icon per
  movement. A single destination opens directly and several destinations use
  the exact-card chooser shared with command-palette navigation; supplementary
  choices now show their aliases and include them in search.
- Made duplicate-address cards consecutive strand members in normal Deck order;
  backward, forward, beginning, and higher movement now choose one exact card
  directly instead of presenting all cards at that address in a chooser.
- Adopted the archive terms “inserted” and “supplementary” throughout the
  interface, commands, settings, and documentation.
- Divided the Branching settings into supplementary and inserted subsections.
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

- Preserved supplementary strand context while navigating between exact cards
  that share one address.
- Removed whole-card identity tooltips from Deck, Desk, and viewed cards while
  retaining their accessible names and all tooltips on their controls.
- Removed duplicate native tooltips from Branch View controls and prevented its
  accessible region and toolbar names from appearing as tooltips when disabled.
- Kept a Branch View tray's horizontal position when expanding an omission and
  showed the actual card instead of an equally wide ellipsis for singleton runs.
- Kept wheel gestures over the local Branch View scroller inside the tray
  instead of moving the surrounding Deck.
- Restored higher-context hidden-branch stubs to point up and right while all
  other stubs retain the same compact down-and-right orientation.
- Kept hidden-branch stub hit targets outside their node circles, so clicking a
  node consistently activates it and reveals all of its branches instead of
  intermittently opening the single-branch expansion chooser.
- Kept supplementary Branch View continuations inside their address-extension family,
  so comma-number strands such as `17,1,1` and `17,1,2` no longer absorb a
  separate appended-letter strand such as `17,1A` and `17,1a`.
- Bounded promoted supplementary strands at the next supplementary start so diagram and
  command navigation cannot cross into a neighbouring supplementary strand.
- Made every interactive hidden-branch stub reveal one bounded auxiliary row,
  including stubs on departure rows, while suppressing stale, recursive, and
  already-visible departures.
- Reused one prepared local Branch View projection across command-availability
  checks instead of rebuilding every filed card and title for each command.
- Elided long local Branch View addresses from the beginning and reserved more
  clearance between node labels and their circles.
- Partitioned local Branch View departures at later supplementary branch starts
  so one inserted continuation is never repeated across several strands.
- Prevented pointer navigation on the Deck map from retaining DOM focus and
  later acquiring a keyboard-focus outline during ordinary Deck navigation.
- Coordinated index, Desk, and view updates after filing, and stopped reporting
  bookmark saves as successful when persistence fails.
- Kept the inline Desk filing field evenly highlighted, within the normal
  header height, and adjacent to the card title.
- Stopped blank or missing frontmatter title properties from displaying the
  card filename as a Deck, Desk, or viewed-card header title.
- Kept “Return from Desk” visually consistent with the other card actions
  instead of giving it a disabled-looking grey background.
- Disabled filing confirmation while the duplicate-address policy blocks the
  entered address.
- Made the tooltip preference apply to local Branch View controls, branch annotations,
  and links rendered inside Deck and Desk cards.
- Made **Follow links from cards** govern supplementary branch-label navigation as
  well as ordinary links and backlinks, while preserving independent previews
  and removing underlines from inert rendered card links.
- Kept annotated Desk-card headers stable while labels, titles, and action
  overflow are fitted, reserved only the signature’s measured content width,
  and omitted the address separator when no annotation is present.
- Kept available Deck commands runnable from the command palette while its
  search field is focused.
- Kept text-setting validation messages on their own row beneath the input.
- Promoted supplementary and inserted branching to separate top-level settings groups.
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
