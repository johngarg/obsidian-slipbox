import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  cardIndexConfig,
  cardIndexConfigChange,
  type CardIndexConfig,
} from "../src/card-index-config.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";

const BASE_CONFIG = cardIndexConfig(DEFAULT_SETTINGS);

describe("card index configuration", () => {
  test("maps every index-affecting setting", () => {
    assert.deepEqual(cardIndexConfig({
      ...DEFAULT_SETTINGS,
      addressProperty: "zettel-id",
      deckOrdering: "lexicographic",
      duplicateAddresses: "problem",
      explicitBranchLinks: true,
      branchLinkMarker: "branch:",
      inferAddressBranches: true,
    }), {
      addressProperty: "zettel-id",
      ordering: "lexicographic",
      duplicatePolicy: "problem",
      explicitBranchLinks: true,
      branchLinkMarker: "branch:",
      inferAddressBranches: true,
    });
  });

  test("treats equal, separately created configurations as unchanged", () => {
    assert.equal(
      cardIndexConfigChange(
        cardIndexConfig(DEFAULT_SETTINGS),
        cardIndexConfig({ ...DEFAULT_SETTINGS }),
      ),
      "unchanged",
    );
  });

  test("classifies every non-ordering change as an index refresh", () => {
    const changes: readonly CardIndexConfig[] = [
      { ...BASE_CONFIG, addressProperty: "zettel-id" },
      { ...BASE_CONFIG, duplicatePolicy: "problem" },
      { ...BASE_CONFIG, explicitBranchLinks: true },
      { ...BASE_CONFIG, branchLinkMarker: "branch:" },
      { ...BASE_CONFIG, inferAddressBranches: true },
    ];

    for (const next of changes) {
      assert.equal(cardIndexConfigChange(BASE_CONFIG, next), "index");
    }
  });

  test("gives ordering changes precedence over other index changes", () => {
    assert.equal(cardIndexConfigChange(BASE_CONFIG, {
      ...BASE_CONFIG,
      ordering: "lexicographic",
    }), "ordering");
    assert.equal(cardIndexConfigChange(BASE_CONFIG, {
      ...BASE_CONFIG,
      ordering: "lexicographic",
      explicitBranchLinks: true,
    }), "ordering");
  });
});
