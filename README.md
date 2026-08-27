# Slipbox Desk

Slipbox Desk is a paper-like _Zettelkasten_ for Obsidian: addressed cards, a browsable sequence, and a Desk to lay them out on.

![Slipbox Desk showing filed cards, Desk piles, and a viewed card](docs/assets/slipbox-hero.png)

> Warning! Slipbox Desk is under active development. If you find a bug, please [open a GitHub issue](https://github.com/johngarg/obsidian-slipbox/issues) and include the steps to reproduce it, your Obsidian version, and your operating system.

Notes become cards, organised into a single sequence by addresses that mark out lines of thought. Browse with a mouse, trackpad, or vim-like keys. Pull cards out of the Deck and stack them in piles on the Desk, where you can work out how notes connect and begin structuring your writing. The Deck map helps you find your way around and remember where ideas live.

A note becomes a card when it has the configured address property. The default is `slipbox-id`:

```yaml
---
slipbox-id: "68/1a"
---
```

The address on each note determines its place in the linear sequence of cards that constitute the Deck.

## Philosophy

My proposal is that the customary niceties of digital note-taking like search, folders, tags, following links, infinite scroll, etc. can ultimately detract from the serendipitous resurfacing of old, forgotten ideas, which is the whole point of _Zettelkasten_.

The strictest paper-like experience might be too extreme for some users. For this reason, some of the more surprising constraints can be toggled in the settings, including deleting text, pasting text, and following links. These constraints apply only while editing in the Slipbox Desk view; ordinary Markdown editing elsewhere in Obsidian is never restricted.

## Deck and Desk

| Surface | Purpose | Persistence |
| --- | --- | --- |
| **Deck** | Browse filed cards in address order | Derived from Markdown frontmatter |
| **Desk** | Work with unfiled cards and temporary piles | Current Obsidian session |

The Deck is the canonical sequence, while the Desk is a temporary working area beside it. Cards on the Desk keep their filed address and remain in the Deck. Slipbox Desk integrates with Obsidian Canvas, and piles can be moved easily to an existing or new canvas.

## Features

- Browse rendered Markdown cards with the keyboard, track your place on the Deck map, and keep bookmarks.
- Pull filed cards onto the Desk without changing their address or filing order.
- Expand, collapse, reorder, split, merge, and move Desk piles.
- View and edit Desk cards inside the Slipbox workspace.
- File an unfiled card while checking where it will enter the real Deck.
- Follow card links, copy links, insert links from an Obsidian editor, and show automatic backlinks.
- Mark explicit branches with link aliases and navigate an optional address-derived hierarchy.
- Configure card sizes, titles, header actions, ordering, shortcuts, and the paper workflow.

See the [changelog](CHANGELOG.md) for user-facing release history.

## Installation

Slipbox Desk requires Obsidian 1.13.0 or later and is available on desktop only.

The preferred installation method is **Settings → Community plugins → Browse**. If Slipbox Desk is not yet available there, install it manually from a GitHub Release:

1. Download `manifest.json`, `main.js`, and `styles.css` from the same release.
2. Put the files in `<Vault>/.obsidian/plugins/slipbox/`.
3. Reload Obsidian.
4. Enable Slipbox Desk under **Settings → Community plugins**.

Use the archive ribbon icon or run **Slipbox Desk: Open** from the command palette.

A source checkout does not include the generated `main.js`. Run `npm run build` before loading a checkout directly in Obsidian.

## Quick start

1. Enter Slipbox Desk with **Slipbox Desk: Open**.
2. Right-click anywhere to create a new note.
3. Double-click the note body to write your note.
4. Double-click the empty address field to file the card.
5. Navigate the Deck by scrolling.
6. Drag Deck cards onto the Desk to make new piles.

Cards can also be added to the Deck by adding a `slipbox-id` property to the Markdown note. This can also be done using **Slipbox Desk: Make active Markdown note a card**.

Any trimmed, nonempty, single-line string without control characters is a valid address. Slipbox cards accept addresses such as `1/2b1`, `A/1`, `Project-17`, and `α/12`.

Natural address ordering is the default, so `A/2` comes before `A/10`. Lexicographic ordering is also available. Duplicate addresses are allowed by default, but they can be optionally reported. Slipbox Desk never rewrites an existing address automatically.

## Branching and structural navigation

The optional **Recognise explicit branch links** setting treats a marked link alias such as `[[Child card|+a]]` as an asserted branch. The complete marker is configurable. Its remaining alias, `a` in this example, appears beside the child card's address and returns the Deck anchor to the source card. Wiki links require an explicit alias; Markdown links use their displayed text. Embeds, self-links, ordinary notes, and links between unfiled cards are not branch relations.

The separate **Infer branches from addresses** setting derives an ephemeral hierarchy from address extension. With natural ordering, `2a` can be a child of `2`, while `20` is not; lexicographic ordering uses every proper literal prefix. Duplicate-address cards share one structural node. Three unbound commands move to the inferred parent or cycle forward and backward through local siblings, wrapping within the same parent. Roots form their own sibling axis; equal-depth cards under different parents do not.

When **Show inferred branch navigation** is enabled, the active Deck card, the focused card in an expanded Desk pile, and the viewed card show subtle arrows beneath their lower corners. The left menu lists the inferred parent and nearest preceding sibling; the right menu lists the nearest following sibling and immediate children. Rows show canonical addresses and immediate-child counts, support keyboard operation, and preview targets according to **Preview links on hover**. Selecting one recentres the target structurally even if ordinary card-link following is disabled.

The full sibling axis remains available through **Cycle Deck anchor forward through inferred siblings** and **Cycle Deck anchor backward through inferred siblings**. These commands wrap and have no default shortcuts; assign them under **Settings → Slipbox Desk → Keyboard shortcuts** or Obsidian's hotkey settings.

Both forms of branching are derived in memory. Enabling, disabling, or navigating them never writes Markdown, frontmatter, or addresses.

## Essential keys

There are some actions that are very quick to do in the real world, but take time in the digital world. For this reason, a default set of vim-inspired keybindings tries to streamline the process of all such card actions.

| Key | Action |
| --- | --- |
| `←` / `k` | Move to the previous Deck card |
| `→` / `j` | Move to the next Deck card |
| `p` | Put the focused card on the Desk, or return it |
| `e` | Edit the focused Desk or viewed card |
| `v` | View a Desk card, or return a viewed card |
| `{` / `}` | Cycle focus through the Deck and Desk piles |
| `%` | Swap focus between the Deck and the last pile |
| `Space` | Expand or collapse the focused pile |
| `b` | Toggle the focused Deck card's bookmark |
| `y` | Copy a link to the focused card |
| `o` | Open the focused card as a Markdown note |

These shortcuts apply only while a Slipbox Desk view is active. You can change them under **Settings → Slipbox Desk**. Obsidian hotkeys take priority when bindings conflict.

## Data and privacy

Slipbox Desk works locally and offline. It makes no network requests, collects no telemetry, and does not load remote code.

To build the Deck, Slipbox Desk checks the frontmatter of Markdown files through Obsidian's metadata cache. When explicit branching is enabled, it also reads cached ordinary links and their display text; it does not scan note bodies to find branch assertions. It reads note bodies when displaying or editing cards, and writes vault files only when you create, edit, file, link, delete, or move piles to Canvas. The Desk is session-only; settings and bookmarks are stored as plugin data.

## Development

Development requires Node.js 20 or newer and npm.

```sh
npm ci
npm run check
```

`npm run check` runs TypeScript checking, tests, ESLint, a production build, and release validation. `npm run build` produces the ignored `main.js` used by Obsidian.

See the [release candidate smoke test](docs/release-candidate-smoke-test.md) for the manual verification checklist.

Feedback and contributions are welcome.

## Feedback and license

Report bugs and request features through [GitHub Issues](https://github.com/johngarg/obsidian-slipbox/issues).

Slipbox Desk is available under the [0BSD license](LICENSE).

## Support

If you find Slipbox Desk useful, you can support its development by [buying me a coffee](https://buymeacoffee.com/johngarg).
