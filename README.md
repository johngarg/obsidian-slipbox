# Luhmann Zettelkasten

Pure TypeScript domain logic for a Luhmann-inspired Obsidian plugin.

The current package implements only canonical Zettelkasten address parsing,
formatting, ordering, and filing. It intentionally has no dependency on the
Obsidian API, vault files, or frontmatter.

## Public API

- `parseZettelId` and `formatZettelId` convert between canonical strings and
  an immutable, explicitly tokenized representation.
- `isValidZettelId` provides non-throwing validation.
- `compareZettelIds` orders canonical IDs for physical filing.
- `incrementAlphaToken` implements the unbounded sequence `a` through `z`,
  then `aa`, `ab`, and so on.
- `generateFiledId` prefers the attachment's next sibling. If that address is
  occupied, it fills the first free direct-child address, alternating child
  token type between letters and numbers.
- `generateNextSectionId` returns `<highest existing section + 1>/1`.

Malformed addresses, malformed existing collections, and absent attachment
points throw `ZettelIdError`. Duplicate existing IDs are normalized without
affecting generation.

Numeric components use JavaScript numbers and are restricted to positive safe
integers so parsing, formatting, and comparison cannot lose precision.
Alphabetic components have no artificial length limit.

## Development

```sh
npm install
npm run typecheck
npm test
```

The test command performs a clean TypeScript build before running the compiled
tests with Node's built-in test runner. No lint tool is currently configured.
