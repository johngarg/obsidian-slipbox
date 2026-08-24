# Slipbox

A tactile, keyboard-driven card index for Obsidian.

![Slipbox showing filed cards, Desk piles, and a viewed card](docs/assets/slipbox-hero.png)

> Slipbox is under active development. It requires Obsidian 1.13.0 or newer on desktop and is not yet available through Community plugins.

Slipbox treats ordinary Markdown notes as cards. Filed cards sit in a sequential Deck. Pull a card onto the Desk when you want it nearby, then use Obsidian Canvas when an arrangement should persist.

A note becomes a card when it has the configured address property. The default is `zettel-id`:

```yaml
---
zettel-id: "68/1a"
---
```

Slipbox does not impose a folder structure or store a hidden filing sequence. The address in each note determines its place in the Deck.

## Deck, Desk, and Canvas

| Surface | Purpose | Persistence |
| --- | --- | --- |
| **Deck** | Browse filed cards in address order | Derived from Markdown frontmatter |
| **Desk** | Work with unfiled cards and temporary piles | Current Obsidian session |
| **Canvas** | Keep a spatial arrangement of cards | Saved in the vault |

The Deck is the canonical sequence. The Desk is a temporary working area beside it. Cards on the Desk keep their filed address and remain in the Deck. Slipbox can lay out any working pile on an existing or new Canvas.

## Features

- Browse rendered Markdown cards with the keyboard, track your place on the Deck map, and keep bookmarks.
- Pull filed cards onto the Desk without changing their address or filing order.
- Expand, collapse, reorder, split, merge, and move Desk piles.
- View and edit Desk cards inside the Slipbox workspace.
- File an unfiled card while checking where it will enter the real Deck.
- Follow card links, copy links, insert links from an Obsidian editor, and show automatic backlinks.
- Configure card sizes, titles, header actions, ordering, shortcuts, and the paper workflow.

## Installation

Until Slipbox is published through Community plugins, install it from a GitHub Release:

1. Download `manifest.json`, `main.js`, and `styles.css` from the same release.
2. Put the files in `<Vault>/.obsidian/plugins/slipbox/`.
3. Reload Obsidian.
4. Enable Slipbox under **Settings → Community plugins**.

Use the archive ribbon icon or run **Slipbox: Open** from the command palette.

A source checkout does not include the generated `main.js`. Run `npm run build` before loading a checkout directly in Obsidian.

## Quick start

1. Add `zettel-id` to a Markdown note, or use **Slipbox: Make active Markdown note a card**.
2. Leave the value empty to put the unfiled card on the Desk.
3. Enter an address to file it in the Deck.
4. Open Slipbox and use `j` and `k` to browse.
5. Press `p` to pull the focused Deck card onto the Desk.

Any trimmed, nonempty, single-line string without control characters is a valid address. Slipbox accepts addresses such as `1/2b1`, `A/1`, `Project-17`, and `α/12`.

Natural address ordering is the default, so `A/2` comes before `A/10`. Lexicographic ordering is also available. Duplicate addresses are allowed by default, or they can be reported as card problems. Slipbox never rewrites an existing address automatically.

## Essential keys

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

Slipbox shortcuts apply only while a Slipbox view is active. You can change them under **Settings → Slipbox**. Obsidian hotkeys take priority when bindings conflict.

## Data and privacy

Slipbox works locally and offline. It makes no network requests, collects no telemetry, and does not load remote code.

Cards remain ordinary Markdown files. Slipbox reads and writes vault files only for actions you start, such as editing, filing, linking, and Canvas layout. The Desk is session-only and is not written to Markdown or plugin data.

## Development

Development requires Node.js 20 or newer and npm.

```sh
npm ci
npm run check
```

`npm run check` runs TypeScript checking, tests, ESLint, a production build, and release validation. `npm run build` produces the ignored `main.js` used by Obsidian.

See the [release candidate smoke test](docs/release-candidate-smoke-test.md) for the manual verification checklist.

## Support and license

Report bugs and request features through GitHub Issues.

Slipbox is available under the [0BSD license](LICENSE).
