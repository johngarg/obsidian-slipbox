import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  cardIndexConfig,
  cardIndexConfigChange,
  settingsRefreshImpact,
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
      inferAddressBranches: true,
    }), {
      addressProperty: "zettel-id",
      ordering: "lexicographic",
      duplicatePolicy: "problem",
      explicitBranchLinks: true,
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

  test("classifies settings refresh impact without serializing settings", () => {
    assert.equal(
      settingsRefreshImpact(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS }),
      "none",
    );
    assert.equal(settingsRefreshImpact(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      showBranchLabels: !DEFAULT_SETTINGS.showBranchLabels,
    }), "branch-presentation");
    assert.equal(settingsRefreshImpact(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      emphasiseBranchLinks: !DEFAULT_SETTINGS.emphasiseBranchLinks,
    }), "branch-presentation");
    assert.equal(settingsRefreshImpact(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      hideBranchLinkMarkers: !DEFAULT_SETTINGS.hideBranchLinkMarkers,
    }), "branch-presentation");
    assert.equal(settingsRefreshImpact(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      explicitBranchLinks: !DEFAULT_SETTINGS.explicitBranchLinks,
    }), "index");
    assert.equal(settingsRefreshImpact(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      deckOrdering: "lexicographic",
    }), "ordering");
    assert.equal(settingsRefreshImpact(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      showTooltips: !DEFAULT_SETTINGS.showTooltips,
    }), "full");
    assert.equal(settingsRefreshImpact(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      showBranchLabels: !DEFAULT_SETTINGS.showBranchLabels,
      showTooltips: !DEFAULT_SETTINGS.showTooltips,
    }), "full");
  });

  test("detects nested presentation settings", () => {
    assert.equal(settingsRefreshImpact(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      cardHeaderButtons: {
        ...DEFAULT_SETTINGS.cardHeaderButtons,
        deck: {
          ...DEFAULT_SETTINGS.cardHeaderButtons.deck,
          "open-note": !DEFAULT_SETTINGS.cardHeaderButtons.deck["open-note"],
        },
      },
    }), "full");
    assert.equal(settingsRefreshImpact(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      deckKeybindings: {
        ...DEFAULT_SETTINGS.deckKeybindings,
        "next-card": [],
      },
    }), "full");
  });
});
