import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  SLIPBOX_ACTION_DEFINITIONS,
  DEFAULT_CARD_SPREAD,
  MAX_CARD_SPREAD,
  MIN_CARD_SPREAD,
  DEFAULT_SETTINGS,
  formatKeyBinding,
  hasTitleAddressPropertyCollision,
  keyBindingFromKeyboardEvent,
  keyBindingConflict,
  metadataPropertyError,
  normalizeDeckKeybindings,
  normalizeKeyBinding,
  normalizeCardSize,
  normalizeCardSpread,
  normalizeFolderPath,
  normalizeSettings,
} from "../src/settings.js";

describe("Slipbox settings", () => {
  test("validates metadata property names independently of the settings UI", () => {
    assert.equal(
      metadataPropertyError("", null),
      "A non-empty top-level property name is required.",
    );
    assert.equal(
      metadataPropertyError("title", "title"),
      "The title and address properties must use different keys.",
    );
    assert.equal(metadataPropertyError("signature", "title"), null);
  });

  test("uses the complete default settings for unknown input", () => {
    assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
    assert.equal(DEFAULT_SETTINGS.addressProperty, "slipbox-id");
    assert.equal(DEFAULT_SETTINGS.titleProperty, "slipbox-title");
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["previous-card"], [
      { key: "ArrowLeft", modifiers: [] },
      { key: "k", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["previous-bookmark"], [
      { key: "[", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["next-bookmark"], [
      { key: "]", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["open-note"], [
      { key: "o", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["toggle-desk"], [
      { key: "p", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["toggle-desk-without-focus"], []);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["copy-link"], [
      { key: "y", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["edit-card"], [
      { key: "e", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["show-card-in-deck"], [
      { key: "Enter", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["toggle-viewed-card"], [
      { key: "v", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["first-card"], [
      { key: "0", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["last-card"], [
      { key: "$", modifiers: ["Shift"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["forward-ten-cards"], [
      { key: "d", modifiers: ["Ctrl"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["backward-ten-cards"], [
      { key: "u", modifiers: ["Ctrl"] },
    ]);
    assert.equal("find-address-forward" in DEFAULT_SETTINGS.deckKeybindings, false);
    assert.equal("find-address-backward" in DEFAULT_SETTINGS.deckKeybindings, false);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["find-address-first"], [
      { key: "g", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["pull-into-pile"], [
      { key: "p", modifiers: ["Shift"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["next-pile"], [
      { key: "}", modifiers: ["Shift"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["previous-pile"], [
      { key: "{", modifiers: ["Shift"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["swap-deck-pile"], [
      { key: "%", modifiers: ["Shift"] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["toggle-pile"], [
      { key: " ", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["previous-card-in-pile"], [
      { key: "h", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["next-card-in-pile"], [
      { key: "l", modifiers: [] },
    ]);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["toggle-deck-map"], [
      { key: "m", modifiers: [] },
    ]);
    assert.equal(DEFAULT_SETTINGS.cardHeaderButtons.deck["copy-link"], true);
    assert.equal(DEFAULT_SETTINGS.cardHeaderButtons.deck["edit-card"], false);
    assert.equal(DEFAULT_SETTINGS.cardHeaderButtons.deck["toggle-viewed-card"], false);
    assert.equal(DEFAULT_SETTINGS.cardHeaderButtons.deck["delete-card"], false);
    assert.equal(DEFAULT_SETTINGS.cardHeaderButtons.desk["show-card-in-deck"], true);
    assert.equal(DEFAULT_SETTINGS.cardHeaderButtons.viewed["toggle-viewed-card"], true);
    assert.equal(DEFAULT_SETTINGS.newNoteTimestampFormat, "YYYYMMDDTHHmmss");
    assert.equal(DEFAULT_SETTINGS.newCardFolder, "");
    assert.equal(DEFAULT_SETTINGS.mainCardSize, "medium");
    assert.equal(DEFAULT_SETTINGS.deskCardSize, "medium");
    assert.equal(DEFAULT_SETTINGS.deckOrdering, "natural");
    assert.equal(DEFAULT_SETTINGS.explicitBranchLinks, false);
    assert.equal(DEFAULT_SETTINGS.emphasiseBranchLinks, true);
    assert.equal(DEFAULT_SETTINGS.hideBranchLinkMarkers, true);
    assert.equal(DEFAULT_SETTINGS.showBranchLabels, true);
    assert.equal(DEFAULT_SETTINGS.inferAddressBranches, false);
    assert.equal(DEFAULT_SETTINGS.showInferredBranchNavigation, true);
    assert.deepEqual(DEFAULT_SETTINGS.deckKeybindings["jump-inferred-parent"], [
      { key: "-", modifiers: [] },
    ]);
    assert.deepEqual(
      DEFAULT_SETTINGS.deckKeybindings["cycle-forward-inferred-siblings"],
      [{ key: "n", modifiers: [] }],
    );
    assert.deepEqual(
      DEFAULT_SETTINGS.deckKeybindings["cycle-backward-inferred-siblings"],
      [{ key: "n", modifiers: ["Shift"] }],
    );
    assert.equal(DEFAULT_SETTINGS.showTooltips, false);
    assert.equal(DEFAULT_SETTINGS.showDeckMap, true);
    assert.equal(DEFAULT_SETTINGS.restrictViewedCardPaste, true);
    assert.equal(DEFAULT_SETTINGS.previewLinksOnHover, false);
    assert.equal(DEFAULT_SETTINGS.followLinksFromCards, false);
    assert.equal(DEFAULT_SETTINGS.protectFiledCardText, true);
    assert.equal(DEFAULT_SETTINGS.showAutomaticBacklinks, true);
    assert.equal(DEFAULT_SETTINGS.allowCardScrolling, true);
    assert.equal(DEFAULT_SETTINGS.cardSpread, DEFAULT_CARD_SPREAD);
  });

  test("normalizes property names, buttons, and configured shortcuts", () => {
    const settings = normalizeSettings({
      addressProperty: " signature ",
      deckOrdering: "lexicographic",
      titleSource: "frontmatter",
      titleProperty: " display-name ",
      mainCardSize: "large",
      deskCardSize: "small",
      newCardFolder: " /Cards\\Slipbox/ ",
      newNoteTimestampFormat: " YYYYMMDD-HHmmss ",
      showTitleInDeck: true,
      showTooltips: true,
      showDeckMap: false,
      cardSpread: 0.73,
      cardHeaderButtons: {
        deck: { "toggle-bookmark": false, "toggle-desk": false },
      },
      deckKeybindings: {
        "previous-card": [
          { key: "K", modifiers: [] },
          { key: "k", modifiers: [] },
        ],
        "next-card": [{ key: "K", modifiers: [] }],
        "open-note": [],
      },
    });

    assert.equal(settings.addressProperty, "signature");
    assert.equal(settings.deckOrdering, "lexicographic");
    assert.equal(settings.titleSource, "frontmatter");
    assert.equal(settings.titleProperty, "display-name");
    assert.equal(settings.mainCardSize, "large");
    assert.equal(settings.deskCardSize, "small");
    assert.equal(settings.newCardFolder, "Cards/Slipbox");
    assert.equal(settings.newNoteTimestampFormat, "YYYYMMDD-HHmmss");
    assert.equal(settings.showTitleInDeck, true);
    assert.equal(settings.showTooltips, true);
    assert.equal(settings.showDeckMap, false);
    assert.equal(settings.cardSpread, 0.73);
    assert.equal(settings.cardHeaderButtons.deck["toggle-bookmark"], false);
    assert.equal(settings.cardHeaderButtons.deck["toggle-desk"], false);
    assert.equal("desk" in settings.cardHeaderButtons, true);
    assert.equal("showTitleInDesk" in settings, false);
    assert.equal("deskHeaderButtons" in settings, false);
    assert.deepEqual(settings.deckKeybindings["previous-card"], [
      { key: "k", modifiers: [] },
    ]);
    assert.deepEqual(settings.deckKeybindings["next-card"], []);
    assert.deepEqual(settings.deckKeybindings["open-note"], []);
    assert.deepEqual(settings.deckKeybindings["copy-link"], [
      { key: "y", modifiers: [] },
    ]);
    assert.equal(settings.cardHeaderButtons.deck["copy-link"], true);
  });

  test("uses only canonical Desk settings and ignores Tray names", () => {
    const legacyOnly = normalizeSettings({
      trayCardSize: "small",
      cardHeaderButtons: {
        deck: { "toggle-tray": false },
        desk: { "toggle-tray": true },
      },
      deckKeybindings: {
        "toggle-tray": [{ key: "q", modifiers: ["Alt"] }],
        "toggle-tray-without-focus": [{ key: "w", modifiers: ["Alt"] }],
      },
    });
    assert.equal(legacyOnly.deskCardSize, DEFAULT_SETTINGS.deskCardSize);
    assert.equal(
      legacyOnly.cardHeaderButtons.deck["toggle-desk"],
      DEFAULT_SETTINGS.cardHeaderButtons.deck["toggle-desk"],
    );
    assert.deepEqual(
      legacyOnly.deckKeybindings["toggle-desk"],
      DEFAULT_SETTINGS.deckKeybindings["toggle-desk"],
    );
    assert.deepEqual(
      legacyOnly.deckKeybindings["toggle-desk-without-focus"],
      DEFAULT_SETTINGS.deckKeybindings["toggle-desk-without-focus"],
    );

    const canonical = normalizeSettings({
      deskCardSize: "large",
      trayCardSize: "small",
      cardHeaderButtons: {
        deck: { "toggle-desk": true, "toggle-tray": false },
      },
      deckKeybindings: {
        "toggle-desk": [{ key: "d", modifiers: ["Alt"] }],
        "toggle-tray": [{ key: "t", modifiers: ["Alt"] }],
      },
    });
    assert.equal(canonical.deskCardSize, "large");
    assert.equal(canonical.cardHeaderButtons.deck["toggle-desk"], true);
    assert.deepEqual(canonical.deckKeybindings["toggle-desk"], [{
      key: "d",
      modifiers: ["Alt"],
    }]);
  });

  test("normalizes branching settings and ignores the retired marker field", () => {
    const settings = normalizeSettings({
      explicitBranchLinks: true,
      branchLinkMarker: "  →→  ",
      emphasiseBranchLinks: false,
      hideBranchLinkMarkers: false,
      showBranchLabels: false,
      inferAddressBranches: true,
      showInferredBranchNavigation: false,
    });
    assert.equal(settings.explicitBranchLinks, true);
    assert.equal(Object.hasOwn(settings, "branchLinkMarker"), false);
    assert.equal(settings.emphasiseBranchLinks, false);
    assert.equal(settings.hideBranchLinkMarkers, false);
    assert.equal(settings.showBranchLabels, false);
    assert.equal(settings.inferAddressBranches, true);
    assert.equal(settings.showInferredBranchNavigation, false);

    assert.equal(
      normalizeSettings({ showInferredBranchNavigation: "invalid" })
        .showInferredBranchNavigation,
      true,
    );
    assert.equal(
      normalizeSettings({ emphasiseBranchLinks: "invalid" }).emphasiseBranchLinks,
      DEFAULT_SETTINGS.emphasiseBranchLinks,
    );
    assert.equal(
      normalizeSettings({ hideBranchLinkMarkers: "invalid" })
        .hideBranchLinkMarkers,
      DEFAULT_SETTINGS.hideBranchLinkMarkers,
    );
    assert.equal(
      normalizeSettings({ inferApparentBranches: true }).inferAddressBranches,
      DEFAULT_SETTINGS.inferAddressBranches,
    );
  });

  test("ignores retired inference bindings", () => {
    const legacy = {
      "jump-apparent-parent": [{ key: "u", modifiers: ["Alt"] }],
      "cycle-backward-apparent-siblings": [{ key: "[", modifiers: ["Alt"] }],
      "jump-next-apparent-peer": [{ key: "]", modifiers: ["Alt"] }],
      "jump-past-apparent-descendants": [{ key: "p", modifiers: ["Alt"] }],
      "jump-first-apparent-child": [{ key: "c", modifiers: ["Alt"] }],
    };
    const normalized = normalizeDeckKeybindings(legacy);
    assert.deepEqual(
      normalized["jump-inferred-parent"],
      DEFAULT_SETTINGS.deckKeybindings["jump-inferred-parent"],
    );
    assert.deepEqual(
      normalized["cycle-backward-inferred-siblings"],
      DEFAULT_SETTINGS.deckKeybindings["cycle-backward-inferred-siblings"],
    );
    assert.deepEqual(
      normalized["cycle-forward-inferred-siblings"],
      DEFAULT_SETTINGS.deckKeybindings["cycle-forward-inferred-siblings"],
    );
    assert.equal(
      Object.values(normalized).flat().some((binding) =>
        binding.key === "p" && binding.modifiers.includes("Alt")
      ),
      false,
    );
  });

  test("falls back to filename titles when title and address keys collide", () => {
    const raw = {
      addressProperty: " card-key ",
      titleSource: "frontmatter",
      titleProperty: "card-key",
    };
    assert.equal(hasTitleAddressPropertyCollision(raw), true);
    const normalized = normalizeSettings(raw);
    assert.equal(normalized.addressProperty, "card-key");
    assert.equal(normalized.titleProperty, "card-key");
    assert.equal(normalized.titleSource, "filename");
    assert.equal(hasTitleAddressPropertyCollision({
      ...raw,
      titleSource: "filename",
    }), false);
  });

  test("gives every registered action a unique command and target", () => {
    const commandIds = SLIPBOX_ACTION_DEFINITIONS.map((definition) =>
      definition.commandId
    );
    assert.equal(new Set(commandIds).size, commandIds.length);
    assert.equal(
      SLIPBOX_ACTION_DEFINITIONS.find((definition) =>
        definition.id === "toggle-desk"
      )?.commandId,
      "toggle-desk",
    );
    assert.equal(
      SLIPBOX_ACTION_DEFINITIONS.find((definition) =>
        definition.id === "toggle-desk-without-focus"
      )?.commandId,
      "toggle-desk-without-focus",
    );
    assert.equal(
      SLIPBOX_ACTION_DEFINITIONS.find((definition) =>
        definition.id === "return-all-filed-cards"
      )?.commandId,
      "return-all-filed-cards",
    );
    assert.equal(
      SLIPBOX_ACTION_DEFINITIONS.every((definition) =>
        definition.commandName !== "" && definition.target !== undefined
      ),
      true,
    );
    for (const action of ["next-pile", "previous-pile", "swap-deck-pile"] as const) {
      const definition = SLIPBOX_ACTION_DEFINITIONS.find((candidate) =>
        candidate.id === action
      );
      assert.equal(definition?.scope, "active-view");
      assert.equal(definition?.target, "view");
    }
    for (const action of [
      "toggle-pile",
      "previous-card-in-pile",
      "next-card-in-pile",
    ] as const) {
      const definition = SLIPBOX_ACTION_DEFINITIONS.find((candidate) =>
        candidate.id === action
      );
      assert.equal(definition?.scope, "active-view");
      assert.equal(definition?.target, "focused-card");
    }
    const inferredDefaults = {
      "jump-inferred-parent": [{ key: "-", modifiers: [] }],
      "cycle-forward-inferred-siblings": [{ key: "n", modifiers: [] }],
      "cycle-backward-inferred-siblings": [{
        key: "n",
        modifiers: ["Shift"],
      }],
    } as const;
    for (const action of Object.keys(inferredDefaults) as Array<
      keyof typeof inferredDefaults
    >) {
      const definition = SLIPBOX_ACTION_DEFINITIONS.find((candidate) =>
        candidate.id === action
      );
      assert.equal(definition?.scope, "active-view");
      assert.equal(definition?.target, "deck-anchor");
      assert.deepEqual(definition?.defaultBindings, inferredDefaults[action]);
    }
    assert.equal(
      SLIPBOX_ACTION_DEFINITIONS.find((definition) =>
        definition.id === "jump-inferred-parent"
      )?.repeatable,
      false,
    );
    for (const action of [
      "cycle-forward-inferred-siblings",
      "cycle-backward-inferred-siblings",
    ] as const) {
      assert.equal(
        SLIPBOX_ACTION_DEFINITIONS.find((definition) => definition.id === action)
          ?.repeatable,
        true,
      );
    }
  });

  test("preserves customized and deliberately empty copy-link settings", () => {
    const customized = normalizeSettings({
      cardHeaderButtons: {
        deck: { "copy-link": false },
      },
      deckKeybindings: {
        "copy-link": [{ key: "L", modifiers: ["Mod"] }],
      },
    });
    assert.equal(customized.cardHeaderButtons.deck["copy-link"], false);
    assert.deepEqual(customized.deckKeybindings["copy-link"], [{
      key: "l",
      modifiers: ["Mod"],
    }]);

    const empty = normalizeSettings({
      deckKeybindings: { "copy-link": [] },
    });
    assert.deepEqual(empty.deckKeybindings["copy-link"], []);
  });

  test("does not let new pile-navigation defaults displace existing bindings", () => {
    const settings = normalizeSettings({
      deckKeybindings: {
        "open-note": [{ key: "h", modifiers: [] }],
        "toggle-desk": [{ key: " ", modifiers: [] }],
      },
    });
    assert.deepEqual(settings.deckKeybindings["open-note"], [{
      key: "h",
      modifiers: [],
    }]);
    assert.deepEqual(settings.deckKeybindings["toggle-desk"], [{
      key: " ",
      modifiers: [],
    }]);
    assert.deepEqual(settings.deckKeybindings["previous-card-in-pile"], []);
    assert.deepEqual(settings.deckKeybindings["toggle-pile"], []);
  });

  test("keeps background pull unbound unless it was explicitly configured", () => {
    const normalized = normalizeDeckKeybindings({
      "open-note": [{ key: "p", modifiers: ["Alt"] }],
    });
    assert.deepEqual(normalized["open-note"], [{
      key: "p",
      modifiers: ["Alt"],
    }]);
    assert.deepEqual(normalized["toggle-desk-without-focus"], []);

    const configured = normalizeDeckKeybindings({
      "toggle-desk-without-focus": [{ key: "q", modifiers: ["Alt"] }],
    });
    assert.deepEqual(configured["toggle-desk-without-focus"], [{
      key: "q",
      modifiers: ["Alt"],
    }]);
  });

  test("formats shifted pile-navigation symbols without redundant Shift text", () => {
    for (const key of ["$", "%", "{", "}"]) {
      assert.equal(formatKeyBinding({ key, modifiers: ["Shift"] }), key);
    }
    assert.equal(formatKeyBinding({ key: " ", modifiers: [] }), "Space");
  });

  test("normalizes per-surface button settings and preserves explicit false", () => {
    const settings = normalizeSettings({
      cardHeaderButtons: {
        deck: { "edit-card": false, "unknown-action": true },
        desk: { "show-card-in-deck": false, "delete-card": true },
        viewed: { "toggle-viewed-card": false },
      },
    });
    assert.equal(settings.cardHeaderButtons.deck["edit-card"], false);
    assert.equal(settings.cardHeaderButtons.deck["open-note"], true);
    assert.equal(settings.cardHeaderButtons.desk["show-card-in-deck"], false);
    assert.equal(settings.cardHeaderButtons.desk["delete-card"], true);
    assert.equal(settings.cardHeaderButtons.viewed["toggle-viewed-card"], false);
    assert.equal("unknown-action" in settings.cardHeaderButtons.deck, false);
  });

  test("makes Enter wholly configurable through Show focused card in Deck", () => {
    const removed = normalizeSettings({
      deckKeybindings: { "show-card-in-deck": [] },
    });
    assert.deepEqual(removed.deckKeybindings["show-card-in-deck"], []);
    assert.equal(
      Object.values(removed.deckKeybindings).flat().some(
        (binding) => binding.key === "Enter",
      ),
      false,
    );

    const rebound = normalizeSettings({
      deckKeybindings: {
        "show-card-in-deck": [{ key: "s", modifiers: ["Mod"] }],
      },
    });
    assert.deepEqual(rebound.deckKeybindings["show-card-in-deck"], [{
      key: "s",
      modifiers: ["Mod"],
    }]);
  });

  test("preserves explicitly unbound current actions", () => {
    const unboundInferenceDefaults = {
      ...DEFAULT_SETTINGS.deckKeybindings,
      "jump-inferred-parent": [],
      "cycle-forward-inferred-siblings": [],
      "cycle-backward-inferred-siblings": [],
    };
    const normalized = normalizeDeckKeybindings(unboundInferenceDefaults);
    assert.deepEqual(normalized["jump-inferred-parent"], []);
    assert.deepEqual(normalized["cycle-forward-inferred-siblings"], []);
    assert.deepEqual(normalized["cycle-backward-inferred-siblings"], []);
  });

  test("keeps current custom bindings and ignores unknown actions", () => {
    const normalized = normalizeDeckKeybindings({
      "first-card": [{ key: "g", modifiers: [] }],
      "last-card": [{ key: "g", modifiers: ["Shift"] }],
      back: [],
      forward: [{ key: "r", modifiers: ["Alt"] }],
      "toggle-bookmark": [],
    });
    assert.deepEqual(normalized["first-card"], [{ key: "g", modifiers: [] }]);
    assert.deepEqual(normalized["last-card"], [{ key: "g", modifiers: ["Shift"] }]);
    assert.equal("back" in normalized, false);
    assert.equal("forward" in normalized, false);
    assert.deepEqual(normalized["toggle-bookmark"], []);
    assert.deepEqual(normalized["find-address-first"], []);
    assert.equal("find-address-forward" in normalized, false);
    assert.equal("find-address-backward" in normalized, false);
    assert.equal("toggle-toolbar" in normalized, false);
  });

  test("supplies missing defaults only when existing bindings do not conflict", () => {
    const normalized = normalizeDeckKeybindings({
      bookmarks: [
        { key: "t", modifiers: [] },
        { key: "d", modifiers: ["Ctrl"] },
      ],
    });
    assert.deepEqual(normalized.bookmarks, [
      { key: "t", modifiers: [] },
      { key: "d", modifiers: ["Ctrl"] },
    ]);
    assert.deepEqual(normalized["forward-ten-cards"], []);
    assert.deepEqual(normalized["backward-ten-cards"], [{
      key: "u",
      modifiers: ["Ctrl"],
    }]);

    const siblingConflict = normalizeDeckKeybindings({
      "open-note": [{ key: "n", modifiers: [] }],
    });
    assert.deepEqual(siblingConflict["jump-inferred-parent"], [{
      key: "-",
      modifiers: [],
    }]);
    assert.deepEqual(siblingConflict["cycle-forward-inferred-siblings"], []);
    assert.deepEqual(siblingConflict["cycle-backward-inferred-siblings"], [{
      key: "n",
      modifiers: ["Shift"],
    }]);
  });

  test("normalizes, captures, and displays shifted and literal Ctrl bindings", () => {
    assert.deepEqual(normalizeKeyBinding({ key: "H", modifiers: ["Shift"] }), {
      key: "h",
      modifiers: ["Shift"],
    });
    assert.deepEqual(normalizeKeyBinding({ key: "$", modifiers: ["Shift"] }), {
      key: "$",
      modifiers: ["Shift"],
    });
    assert.equal(formatKeyBinding({ key: "$", modifiers: ["Shift"] }), "$");
    assert.equal(formatKeyBinding({ key: "h", modifiers: ["Shift"] }), "Shift+h");

    const base = { metaKey: false, altKey: false };
    assert.deepEqual(keyBindingFromKeyboardEvent({
      ...base,
      key: "d",
      ctrlKey: true,
      shiftKey: false,
    }, true), { key: "d", modifiers: ["Ctrl"] });
    assert.deepEqual(keyBindingFromKeyboardEvent({
      ...base,
      key: "d",
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
    }, true), { key: "d", modifiers: ["Mod"] });
    assert.deepEqual(keyBindingFromKeyboardEvent({
      ...base,
      key: "$",
      ctrlKey: false,
      shiftKey: true,
    }, true), { key: "$", modifiers: ["Shift"] });
  });

  test("all action resets point at their revised definition defaults", () => {
    for (const definition of SLIPBOX_ACTION_DEFINITIONS) {
      assert.deepEqual(
        DEFAULT_SETTINGS.deckKeybindings[definition.id],
        definition.defaultBindings,
      );
    }
  });

  test("defaults Deck-map visibility and card spread while preserving valid values", () => {
    assert.equal(normalizeSettings({}).showDeckMap, true);
    assert.equal(normalizeSettings({ showDeckMap: "no" }).showDeckMap, true);
    const disabled = normalizeSettings({ showDeckMap: false });
    assert.equal(disabled.showDeckMap, false);
    assert.equal(normalizeSettings({}).cardSpread, DEFAULT_CARD_SPREAD);
    assert.equal(normalizeSettings({ cardSpread: 0.42 }).cardSpread, 0.42);
    assert.equal(normalizeSettings({ cardSpread: 0 }).cardSpread, MIN_CARD_SPREAD);
    assert.equal(normalizeSettings({ cardSpread: 99 }).cardSpread, MAX_CARD_SPREAD);
  });

  test("uses only the current tooltip setting", () => {
    assert.equal(
      normalizeSettings({ showCardTooltips: true }).showTooltips,
      DEFAULT_SETTINGS.showTooltips,
    );
    assert.equal(normalizeSettings({ showTooltips: true }).showTooltips, true);
  });

  test("normalizes paper-workflow settings", () => {
    const permissive = normalizeSettings({
      restrictViewedCardPaste: false,
      previewLinksOnHover: true,
      followLinksFromCards: true,
      protectFiledCardText: false,
      showAutomaticBacklinks: false,
      allowCardScrolling: false,
    });
    assert.equal(permissive.restrictViewedCardPaste, false);
    assert.equal(permissive.previewLinksOnHover, true);
    assert.equal(permissive.followLinksFromCards, true);
    assert.equal(permissive.protectFiledCardText, false);
    assert.equal(permissive.showAutomaticBacklinks, false);
    assert.equal(permissive.allowCardScrolling, false);
  });

  test("ignores unknown settings, actions, and obsolete shortcuts", () => {
    const raw = {
      addressProperty: "slipbox-id",
      unknownSetting: { ignored: true },
      deckHeaderButtons: { "add-card": false, bookmark: false },
      useTemplatesForNewNotes: true,
      newNoteTemplatePath: "Templates/Zettel.md",
      newCardFolder: "Cards",
      deckKeybindings: {
        "add-card": [{ key: "a", modifiers: [] }],
        "new-section": [{ key: "n", modifiers: [] }],
        "entry-points": [{ key: "e", modifiers: [] }],
        back: [],
        forward: [{ key: "r", modifiers: ["Alt"] }],
        "toggle-toolbar": [{ key: "t", modifiers: [] }],
      },
    };
    const settings = normalizeSettings(raw);
    assert.equal("add-card" in settings.cardHeaderButtons.deck, false);
    assert.equal("add-card" in settings.deckKeybindings, false);
    assert.equal("new-section" in settings.deckKeybindings, false);
    assert.equal("entry-points" in settings.deckKeybindings, false);
    assert.equal("unknownSetting" in settings, false);
    assert.equal("useTemplatesForNewNotes" in settings, false);
    assert.equal("newNoteTemplatePath" in settings, false);
    assert.equal(settings.newCardFolder, "Cards");
    assert.equal(
      Object.values(settings.deckKeybindings).flat().some(
        (binding) => binding.key === "a",
      ),
      false,
    );
  });

  test("falls back from invalid property settings", () => {
    const settings = normalizeSettings({
      addressProperty: "   ",
      titleSource: "unknown",
      titleProperty: 42,
      mainCardSize: "huge",
      deskCardSize: null,
      newCardFolder: 42,
      newNoteTimestampFormat: "   ",
      showDeckMap: "yes",
      cardSpread: "wide",
    });
    assert.equal(settings.addressProperty, "slipbox-id");
    assert.equal(settings.titleSource, "filename");
    assert.equal(settings.titleProperty, "slipbox-title");
    assert.equal(settings.mainCardSize, "medium");
    assert.equal(settings.deskCardSize, "medium");
    assert.equal(settings.newCardFolder, "");
    assert.equal(settings.newNoteTimestampFormat, "YYYYMMDDTHHmmss");
    assert.equal(settings.showDeckMap, true);
    assert.equal(settings.cardSpread, DEFAULT_CARD_SPREAD);
  });

  test("normalizes vault folder paths and rejects traversal", () => {
    assert.equal(normalizeFolderPath(" /Cards//Slipbox/ "), "Cards/Slipbox");
    assert.equal(normalizeFolderPath("Cards/../Archive"), "");
    assert.equal(normalizeFolderPath(null), "");
  });

  test("normalizes the three card-size presets", () => {
    assert.equal(normalizeCardSize("small"), "small");
    assert.equal(normalizeCardSize("medium"), "medium");
    assert.equal(normalizeCardSize("large"), "large");
    assert.equal(normalizeCardSize("oversized"), "medium");
  });

  test("normalizes card spread to finite configured bounds", () => {
    assert.equal(normalizeCardSpread(0.18), 0.18);
    assert.equal(normalizeCardSpread(1.12), 1.12);
    assert.equal(normalizeCardSpread(-1), MIN_CARD_SPREAD);
    assert.equal(normalizeCardSpread(2), MAX_CARD_SPREAD);
    assert.equal(normalizeCardSpread(Number.NaN), DEFAULT_CARD_SPREAD);
  });

  test("detects cross-action conflicts and formats modifiers", () => {
    const binding = { key: "g", modifiers: ["Shift"] as const };
    assert.equal(
      keyBindingConflict(DEFAULT_SETTINGS.deckKeybindings, "open-note", binding),
      null,
    );
    assert.equal(
      keyBindingConflict(
        DEFAULT_SETTINGS.deckKeybindings,
        "open-note",
        { key: "y", modifiers: [] },
      ),
      "copy-link",
    );
    assert.equal(formatKeyBinding(binding), "Shift+g");
    assert.equal(
      keyBindingConflict(
        DEFAULT_SETTINGS.deckKeybindings,
        "open-note",
        { key: "g", modifiers: [] },
      ),
      "find-address-first",
    );
    assert.equal(
      keyBindingConflict(
        DEFAULT_SETTINGS.deckKeybindings,
        "open-note",
        { key: "d", modifiers: ["Ctrl"] },
      ),
      "forward-ten-cards",
    );
  });
});
