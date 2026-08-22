import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildCardLinkSuggestions,
  matchCardLinkSuggestions,
  type CardLinkCandidate,
} from "../src/card-link-suggestions.js";

const cards: readonly CardLinkCandidate[] = [
  { path: "Cards/One.md", address: "1", title: "Communication" },
  { path: "Cards/Two.md", address: "1a", title: "Second-order observation" },
  { path: "Cards/Three.md", address: "1a1", title: "Reference to 1a" },
  { path: "Cards/Four.md", address: "10", title: "Autopoiesis" },
  { path: "Cards/Five.md", address: "10,5/3t", title: "Structural coupling" },
];

function addresses(matched: readonly CardLinkCandidate[]): string[] {
  return matched.map((card) => card.address);
}

describe("matchCardLinkSuggestions", () => {
  test("returns every card in Deck order for a blank query", () => {
    assert.deepEqual(
      addresses(matchCardLinkSuggestions(cards, "   ")),
      ["1", "1a", "1a1", "10", "10,5/3t"],
    );
  });

  test("ranks an exact address ahead of longer addresses that extend it", () => {
    assert.deepEqual(
      addresses(matchCardLinkSuggestions(cards, "1a")),
      ["1a", "1a1"],
    );
    assert.deepEqual(
      addresses(matchCardLinkSuggestions(cards, "10")),
      ["10", "10,5/3t"],
    );
  });

  test("ranks a prefix match ahead of an interior match", () => {
    assert.deepEqual(
      addresses(matchCardLinkSuggestions(cards, "1a1")),
      ["1a1"],
    );
    assert.deepEqual(
      addresses(matchCardLinkSuggestions(cards, ",5")),
      ["10,5/3t"],
    );
  });

  test("matches punctuated addresses literally rather than fuzzily", () => {
    assert.deepEqual(
      addresses(matchCardLinkSuggestions(cards, "10,5/3t")),
      ["10,5/3t"],
    );
    assert.deepEqual(addresses(matchCardLinkSuggestions(cards, "153")), []);
  });

  test("falls back to titles below every address match", () => {
    assert.deepEqual(
      addresses(matchCardLinkSuggestions(cards, "1a")),
      ["1a", "1a1"],
    );
    assert.deepEqual(
      addresses(matchCardLinkSuggestions(cards, "coupling")),
      ["10,5/3t"],
    );
  });

  test("puts an exact address first even when a title also matches", () => {
    const withTitleClash: readonly CardLinkCandidate[] = [
      { path: "Cards/Note.md", address: "2", title: "See 1a for detail" },
      ...cards,
    ];
    assert.deepEqual(
      addresses(matchCardLinkSuggestions(withTitleClash, "1a")),
      ["1a", "1a1", "2"],
    );
  });

  test("ignores case in both addresses and titles", () => {
    assert.deepEqual(
      addresses(matchCardLinkSuggestions(cards, "10,5/3T")),
      ["10,5/3t"],
    );
    assert.deepEqual(
      addresses(matchCardLinkSuggestions(cards, "AUTOPOIESIS")),
      ["10"],
    );
  });

  test("trims surrounding whitespace from a pasted address", () => {
    assert.deepEqual(
      addresses(matchCardLinkSuggestions(cards, "  1a  ")),
      ["1a", "1a1"],
    );
  });
});

describe("buildCardLinkSuggestions", () => {
  test("flags only the cards that share an address", () => {
    const built = buildCardLinkSuggestions([
      { path: "Cards/One.md", address: "1", title: "Communication" },
      { path: "Cards/Duplicate.md", address: "1", title: "Communication" },
      { path: "Cards/Two.md", address: "1a", title: "Observation" },
    ]);

    assert.deepEqual(
      built.map((card) => [card.path, card.ambiguous]),
      [
        ["Cards/One.md", true],
        ["Cards/Duplicate.md", true],
        ["Cards/Two.md", false],
      ],
    );
  });

  test("preserves Deck order and the resolved titles", () => {
    const built = buildCardLinkSuggestions(cards);
    assert.deepEqual(addresses(built), ["1", "1a", "1a1", "10", "10,5/3t"]);
    assert.equal(built.at(0)?.title, "Communication");
  });

  test("offers both duplicates to the suggester", () => {
    const built = buildCardLinkSuggestions([
      { path: "Cards/One.md", address: "1", title: "First" },
      { path: "Cards/Duplicate.md", address: "1", title: "Second" },
    ]);

    assert.deepEqual(
      matchCardLinkSuggestions(built, "1").map((card) => card.path),
      ["Cards/One.md", "Cards/Duplicate.md"],
    );
  });
});
