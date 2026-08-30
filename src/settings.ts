import type { DeckOrdering } from "./address-order.js";
import type { DuplicateAddressPolicy } from "./card-metadata.js";

export const SLIPBOX_DATA_SCHEMA_VERSION = 14;

export const DEFAULT_CARD_SPREAD = 0.58;
export const MIN_CARD_SPREAD = 0.18;
export const MAX_CARD_SPREAD = 1.12;

export function metadataPropertyError(
  property: string,
  disallowedProperty: string | null,
): string | null {
  if (property === "") {
    return "A non-empty top-level property name is required.";
  }
  if (disallowedProperty !== null && property === disallowedProperty) {
    return "The title and address properties must use different keys.";
  }
  return null;
}

export type TitleSource = "filename" | "frontmatter";
export type CardSize = "small" | "medium" | "large";

export type CardButtonSurface = "deck" | "desk" | "viewed";

export type CardHeaderButtonAction =
  | "edit-card"
  | "open-note"
  | "toggle-viewed-card"
  | "show-card-in-deck"
  | "toggle-desk"
  | "file-card"
  | "copy-link"
  | "toggle-bookmark"
  | "move-desk-card-left"
  | "move-desk-card-right"
  | "delete-card";

export type CardHeaderButtonSettings = Readonly<Record<
  CardButtonSurface,
  Readonly<Record<CardHeaderButtonAction, boolean>>
>>;

export const CARD_HEADER_BUTTON_ACTIONS: readonly CardHeaderButtonAction[] = [
  "edit-card",
  "open-note",
  "toggle-viewed-card",
  "show-card-in-deck",
  "toggle-desk",
  "file-card",
  "copy-link",
  "toggle-bookmark",
  "move-desk-card-left",
  "move-desk-card-right",
  "delete-card",
];

export type SlipboxAction =
  | "previous-card"
  | "next-card"
  | "move-backward-local-strand"
  | "move-forward-local-strand"
  | "move-to-local-strand-beginning"
  | "enter-address-inferred-strand"
  | "enter-explicit-supplementary-strand"
  | "move-to-higher-strand"
  | "toggle-local-branch-view"
  | "previous-bookmark"
  | "next-bookmark"
  | "forward-ten-cards"
  | "backward-ten-cards"
  | "position-deck"
  | "position-deck-top"
  | "centre-card"
  | "position-deck-bottom"
  | "first-card"
  | "last-card"
  | "open-note"
  | "copy-link"
  | "toggle-desk"
  | "toggle-desk-without-focus"
  | "toggle-bookmark"
  | "find-address-first"
  | "pull-into-pile"
  | "next-pile"
  | "previous-pile"
  | "swap-deck-pile"
  | "toggle-pile"
  | "previous-card-in-pile"
  | "next-card-in-pile"
  | "toggle-deck-map"
  | "bookmarks"
  | "problems"
  | "confirm-filing"
  | "cancel-filing"
  | "edit-card"
  | "show-card-in-deck"
  | "toggle-viewed-card"
  | "file-card"
  | "move-desk-card-left"
  | "move-desk-card-right"
  | "delete-card"
  | "collapse-all-piles"
  | "return-all-filed-cards";

export type KeyModifier = "Mod" | "Ctrl" | "Meta" | "Alt" | "Shift";

export interface DeckKeyBinding {
  readonly modifiers: readonly KeyModifier[];
  readonly key: string;
}

export type SlipboxActionScope = "active-view" | "global";
export type SlipboxActionTarget = "deck-anchor" | "focused-card" | "view" | "global";

export interface SlipboxActionDefinition {
  readonly id: SlipboxAction;
  readonly label: string;
  readonly description?: string;
  readonly repeatable: boolean;
  readonly defaultBindings: readonly DeckKeyBinding[];
  readonly commandId: string;
  readonly commandName: string;
  readonly scope: SlipboxActionScope;
  readonly target: SlipboxActionTarget;
}

const binding = (
  key: string,
  modifiers: readonly KeyModifier[] = [],
): DeckKeyBinding => ({ key, modifiers });

const BASE_ACTION_DEFINITIONS: readonly Omit<
  SlipboxActionDefinition,
  "commandId" | "commandName" | "scope" | "target"
>[] = [
  {
    id: "previous-card",
    label: "Move Deck anchor to previous card",
    repeatable: true,
    defaultBindings: [binding("ArrowLeft"), binding("k")],
  },
  {
    id: "next-card",
    label: "Move Deck anchor to next card",
    repeatable: true,
    defaultBindings: [binding("ArrowRight"), binding("j")],
  },
  {
    id: "move-backward-local-strand",
    label: "Move backward on local branch strand",
    repeatable: true,
    defaultBindings: [binding("n", ["Shift"])],
  },
  {
    id: "move-forward-local-strand",
    label: "Move forward on local branch strand",
    repeatable: true,
    defaultBindings: [binding("n")],
  },
  {
    id: "move-to-local-strand-beginning",
    label: "Move to beginning of local branch strand",
    repeatable: false,
    defaultBindings: [binding("^", ["Shift"])],
  },
  {
    id: "enter-address-inferred-strand",
    label: "Enter inserted strand",
    repeatable: false,
    defaultBindings: [binding(">", ["Shift"])],
  },
  {
    id: "enter-explicit-supplementary-strand",
    label: "Enter supplementary strand",
    repeatable: false,
    defaultBindings: [binding("+", ["Shift"])],
  },
  {
    id: "move-to-higher-strand",
    label: "Move to higher local branch strand",
    repeatable: false,
    defaultBindings: [binding("<", ["Shift"])],
  },
  {
    id: "toggle-local-branch-view",
    label: "Toggle local Branch View visibility",
    repeatable: false,
    defaultBindings: [binding("b")],
  },
  {
    id: "previous-bookmark",
    label: "Move Deck anchor to previous bookmark",
    repeatable: false,
    defaultBindings: [binding("[")],
  },
  {
    id: "next-bookmark",
    label: "Move Deck anchor to next bookmark",
    repeatable: false,
    defaultBindings: [binding("]")],
  },
  {
    id: "position-deck",
    label: "Position Deck vertically…",
    description: "Type z to centre, t for the top, or b for the bottom.",
    repeatable: false,
    defaultBindings: [binding("z")],
  },
  {
    id: "position-deck-top",
    label: "Position Deck near top",
    repeatable: false,
    defaultBindings: [],
  },
  {
    id: "centre-card",
    label: "Centre Deck vertically",
    repeatable: false,
    defaultBindings: [],
  },
  {
    id: "position-deck-bottom",
    label: "Position Deck near bottom",
    repeatable: false,
    defaultBindings: [],
  },
  {
    id: "first-card",
    label: "Move Deck anchor to first card",
    repeatable: false,
    defaultBindings: [binding("0")],
  },
  {
    id: "last-card",
    label: "Move Deck anchor to last card",
    repeatable: false,
    defaultBindings: [binding("$", ["Shift"])],
  },
  {
    id: "forward-ten-cards",
    label: "Move Deck anchor forward ten cards",
    repeatable: true,
    defaultBindings: [binding("d", ["Ctrl"])],
  },
  {
    id: "backward-ten-cards",
    label: "Move Deck anchor backward ten cards",
    repeatable: true,
    defaultBindings: [binding("u", ["Ctrl"])],
  },
  {
    id: "open-note",
    label: "Open focused card in Markdown",
    repeatable: false,
    defaultBindings: [binding("o")],
  },
  {
    id: "toggle-desk",
    label: "Put focused card on or return it from Desk",
    repeatable: false,
    defaultBindings: [binding("p")],
  },
  {
    id: "toggle-desk-without-focus",
    label: "Put focused Deck card on or return it from Desk without moving focus",
    repeatable: false,
    defaultBindings: [],
  },
  {
    id: "toggle-bookmark",
    label: "Toggle bookmark on focused Deck card",
    repeatable: false,
    defaultBindings: [binding("m")],
  },
  {
    id: "find-address-first",
    label: "Move Deck anchor to first address initial",
    description: "Type the address's first character after this prefix.",
    repeatable: false,
    defaultBindings: [binding("g")],
  },
  {
    id: "pull-into-pile",
    label: "Put focused card into numbered pile",
    description: "Type a one-based pile number, then press Enter.",
    repeatable: false,
    defaultBindings: [binding("p", ["Shift"])],
  },
  {
    id: "next-pile",
    label: "Focus the next Desk pile",
    repeatable: true,
    defaultBindings: [binding("}", ["Shift"])],
  },
  {
    id: "previous-pile",
    label: "Focus the previous Desk pile",
    repeatable: true,
    defaultBindings: [binding("{", ["Shift"])],
  },
  {
    id: "swap-deck-pile",
    label: "Swap focus between the Deck and the last pile",
    repeatable: false,
    defaultBindings: [binding("%", ["Shift"])],
  },
  {
    id: "toggle-pile",
    label: "Expand or collapse the focused card's pile",
    repeatable: false,
    defaultBindings: [binding(" ")],
  },
  {
    id: "previous-card-in-pile",
    label: "Focus the previous card in the pile",
    repeatable: true,
    defaultBindings: [binding("h")],
  },
  {
    id: "next-card-in-pile",
    label: "Focus the next card in the pile",
    repeatable: true,
    defaultBindings: [binding("l")],
  },
  {
    id: "toggle-deck-map",
    label: "Toggle Deck-map visibility",
    repeatable: false,
    defaultBindings: [binding("o", ["Shift"])],
  },
  {
    id: "bookmarks",
    label: "Manage bookmarks",
    repeatable: false,
    defaultBindings: [],
  },
  {
    id: "problems",
    label: "Show card problems",
    repeatable: false,
    defaultBindings: [],
  },
  {
    id: "confirm-filing",
    label: "File card",
    repeatable: false,
    defaultBindings: [],
  },
  {
    id: "cancel-filing",
    label: "Cancel filing",
    repeatable: false,
    defaultBindings: [],
  },
  {
    id: "copy-link",
    label: "Copy link to focused card",
    repeatable: false,
    defaultBindings: [binding("y")],
  },
  {
    id: "edit-card",
    label: "Edit focused card on Desk",
    repeatable: false,
    defaultBindings: [binding("i")],
  },
  {
    id: "show-card-in-deck",
    label: "Show focused card in Deck",
    repeatable: false,
    defaultBindings: [binding("Enter")],
  },
  {
    id: "toggle-viewed-card",
    label: "View focused card or return it to its source",
    repeatable: false,
    defaultBindings: [binding("v")],
  },
  {
    id: "file-card",
    label: "File focused card",
    repeatable: false,
    defaultBindings: [],
  },
  {
    id: "move-desk-card-left",
    label: "Move focused Desk card left",
    repeatable: true,
    defaultBindings: [binding("ArrowLeft", ["Alt"])],
  },
  {
    id: "move-desk-card-right",
    label: "Move focused Desk card right",
    repeatable: true,
    defaultBindings: [binding("ArrowRight", ["Alt"])],
  },
  {
    id: "delete-card",
    label: "Delete focused card",
    repeatable: false,
    defaultBindings: [],
  },
  {
    id: "collapse-all-piles",
    label: "Collapse all Desk piles",
    repeatable: false,
    defaultBindings: [],
  },
  {
    id: "return-all-filed-cards",
    label: "Return all filed Desk cards",
    repeatable: false,
    defaultBindings: [],
  },
];

const ACTION_COMMAND_IDS: Partial<Record<SlipboxAction, string>> = {
  "centre-card": "centre-active-card",
  "open-note": "open-current-card-markdown",
  "copy-link": "copy-current-card-link",
  "toggle-bookmark": "add-bookmark-current-card",
  "find-address-first": "find-first-address-initial",
  "pull-into-pile": "pull-into-numbered-pile",
  "toggle-local-branch-view": "toggle-local-branch-view-visibility",
  "toggle-deck-map": "toggle-deck-map-visibility",
  bookmarks: "manage-bookmarks",
  problems: "show-card-problems",
};

const FOCUSED_CARD_ACTIONS = new Set<SlipboxAction>([
  "open-note",
  "copy-link",
  "toggle-desk",
  "toggle-desk-without-focus",
  "toggle-bookmark",
  "pull-into-pile",
  "toggle-pile",
  "previous-card-in-pile",
  "next-card-in-pile",
  "edit-card",
  "show-card-in-deck",
  "toggle-viewed-card",
  "file-card",
  "move-desk-card-left",
  "move-desk-card-right",
  "delete-card",
]);

const GLOBAL_ACTIONS = new Set<SlipboxAction>(["bookmarks", "problems"]);

const VIEW_ACTIONS = new Set<SlipboxAction>([
  "toggle-local-branch-view",
  "toggle-deck-map",
  "confirm-filing",
  "cancel-filing",
  "collapse-all-piles",
  "return-all-filed-cards",
  "next-pile",
  "previous-pile",
  "swap-deck-pile",
]);

export const SLIPBOX_ACTION_DEFINITIONS: readonly SlipboxActionDefinition[] =
  BASE_ACTION_DEFINITIONS.map((definition) => ({
    ...definition,
    commandId: ACTION_COMMAND_IDS[definition.id] ?? definition.id,
    commandName: definition.label,
    scope: GLOBAL_ACTIONS.has(definition.id) ? "global" : "active-view",
    target: GLOBAL_ACTIONS.has(definition.id)
      ? "global"
      : FOCUSED_CARD_ACTIONS.has(definition.id)
        ? "focused-card"
        : VIEW_ACTIONS.has(definition.id)
          ? "view"
          : "deck-anchor",
  }));

export interface SlipboxSettings {
  readonly addressProperty: string;
  readonly deckOrdering: DeckOrdering;
  readonly duplicateAddresses: DuplicateAddressPolicy;
  readonly explicitBranchLinks: boolean;
  readonly outlineBranchLinks: boolean;
  readonly hideBranchLinkMarkers: boolean;
  readonly showBranchLabels: boolean;
  readonly inferAddressBranches: boolean;
  readonly showLocalBranchView: boolean;
  readonly titleSource: TitleSource;
  readonly titleProperty: string;
  readonly mainCardSize: CardSize;
  readonly deskCardSize: CardSize;
  readonly newCardFolder: string;
  readonly newNoteTimestampFormat: string;
  readonly showTitleInDeck: boolean;
  readonly showTooltips: boolean;
  readonly showDeckMap: boolean;
  readonly restrictViewedCardPaste: boolean;
  readonly previewLinksOnHover: boolean;
  readonly followLinksFromCards: boolean;
  readonly protectFiledCardText: boolean;
  readonly showAutomaticBacklinks: boolean;
  readonly allowCardScrolling: boolean;
  readonly cardSpread: number;
  readonly cardHeaderButtons: CardHeaderButtonSettings;
  readonly deckKeybindings: Readonly<Record<SlipboxAction, readonly DeckKeyBinding[]>>;
}

const allCardHeaderButtons = (
  enabled: readonly CardHeaderButtonAction[],
): Readonly<Record<CardHeaderButtonAction, boolean>> => Object.fromEntries(
  CARD_HEADER_BUTTON_ACTIONS.map((action) => [action, enabled.includes(action)]),
) as Readonly<Record<CardHeaderButtonAction, boolean>>;

export const DEFAULT_CARD_HEADER_BUTTONS: CardHeaderButtonSettings = {
  deck: allCardHeaderButtons([
    "open-note",
    "toggle-desk",
    "copy-link",
    "toggle-bookmark",
  ]),
  desk: allCardHeaderButtons([
    "toggle-viewed-card",
    "edit-card",
    "open-note",
    "show-card-in-deck",
    "file-card",
    "toggle-desk",
  ]),
  viewed: allCardHeaderButtons([
    "edit-card",
    "open-note",
    "show-card-in-deck",
    "file-card",
    "toggle-viewed-card",
  ]),
};

export const DEFAULT_DECK_KEYBINDINGS = Object.fromEntries(
  SLIPBOX_ACTION_DEFINITIONS.map((definition) => [
    definition.id,
    definition.defaultBindings,
  ]),
) as Readonly<Record<SlipboxAction, readonly DeckKeyBinding[]>>;

const RETIRED_UNRELEASED_DEFAULT_DECK_KEYBINDINGS: Partial<Readonly<Record<
  SlipboxAction,
  readonly DeckKeyBinding[]
>>> = {
  "move-backward-local-strand": [],
  "move-forward-local-strand": [],
  "move-to-local-strand-beginning": [],
  "enter-address-inferred-strand": [],
  "enter-explicit-supplementary-strand": [],
  "move-to-higher-strand": [],
  "toggle-local-branch-view": [],
  "centre-card": [binding("c")],
  "toggle-bookmark": [binding("b")],
  "toggle-deck-map": [binding("m")],
  "edit-card": [binding("e")],
};

export const DEFAULT_SETTINGS: SlipboxSettings = {
  addressProperty: "slipbox-id",
  deckOrdering: "natural",
  duplicateAddresses: "allowed",
  explicitBranchLinks: false,
  outlineBranchLinks: true,
  hideBranchLinkMarkers: true,
  showBranchLabels: true,
  inferAddressBranches: false,
  showLocalBranchView: true,
  titleSource: "filename",
  titleProperty: "slipbox-title",
  mainCardSize: "medium",
  deskCardSize: "medium",
  newCardFolder: "",
  newNoteTimestampFormat: "YYYYMMDDTHHmmss",
  showTitleInDeck: false,
  showTooltips: false,
  showDeckMap: true,
  restrictViewedCardPaste: true,
  previewLinksOnHover: false,
  followLinksFromCards: false,
  protectFiledCardText: true,
  showAutomaticBacklinks: true,
  allowCardScrolling: true,
  cardSpread: DEFAULT_CARD_SPREAD,
  cardHeaderButtons: DEFAULT_CARD_HEADER_BUTTONS,
  deckKeybindings: DEFAULT_DECK_KEYBINDINGS,
};

const MODIFIER_ORDER: readonly KeyModifier[] = ["Mod", "Ctrl", "Meta", "Alt", "Shift"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizePropertyName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : fallback;
}

export function normalizeFolderPath(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const segments = value
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment !== "");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return "";
  }
  return segments.join("/");
}

export function normalizeCardSize(value: unknown): CardSize {
  return value === "small" || value === "large" ? value : "medium";
}

export function normalizeCardSpread(value: unknown): number {
  const spread = typeof value === "number" && Number.isFinite(value)
    ? value
    : DEFAULT_CARD_SPREAD;
  return Math.min(MAX_CARD_SPREAD, Math.max(MIN_CARD_SPREAD, spread));
}

export function hasTitleAddressPropertyCollision(value: unknown): boolean {
  if (!isRecord(value) || value.titleSource !== "frontmatter") {
    return false;
  }
  const addressProperty = normalizePropertyName(
    value.addressProperty,
    DEFAULT_SETTINGS.addressProperty,
  );
  const titleProperty = normalizePropertyName(
    value.titleProperty,
    DEFAULT_SETTINGS.titleProperty,
  );
  return addressProperty === titleProperty;
}

export function normalizeKeyBinding(value: unknown): DeckKeyBinding | null {
  if (!isRecord(value) || typeof value.key !== "string" || value.key === "") {
    return null;
  }
  const key = value.key.length === 1 ? value.key.toLowerCase() : value.key;
  const supplied = Array.isArray(value.modifiers) ? value.modifiers : [];
  const modifiers = MODIFIER_ORDER.filter((modifier) => supplied.includes(modifier));
  return { key, modifiers };
}

export function keyBindingSignature(bindingValue: DeckKeyBinding): string {
  return `${bindingValue.modifiers.join("+")}::${bindingValue.key}`;
}

export function formatKeyBinding(bindingValue: DeckKeyBinding): string {
  const key = bindingValue.key === " " ? "Space" : bindingValue.key;
  if (
    bindingValue.modifiers.length === 1 &&
    bindingValue.modifiers[0] === "Shift" &&
    (
      key === "$" ||
      key === "%" ||
      key === "{" ||
      key === "}" ||
      key === "^" ||
      key === ">" ||
      key === "+" ||
      key === "<"
    )
  ) {
    return key;
  }
  return [...bindingValue.modifiers, key].join("+");
}

export interface KeyboardBindingEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

export function keyBindingFromKeyboardEvent(
  event: KeyboardBindingEvent,
  isMacOS: boolean,
): DeckKeyBinding {
  const modifiers: KeyModifier[] = [];
  const primary = isMacOS ? event.metaKey : event.ctrlKey;
  if (primary) {
    modifiers.push("Mod");
  }
  if (event.ctrlKey && isMacOS) {
    modifiers.push("Ctrl");
  }
  if (event.metaKey && !isMacOS) {
    modifiers.push("Meta");
  }
  if (event.altKey) {
    modifiers.push("Alt");
  }
  if (event.shiftKey) {
    modifiers.push("Shift");
  }
  return normalizeKeyBinding({ modifiers, key: event.key }) ?? {
    modifiers,
    key: event.key,
  };
}

function bindingsMatch(
  value: unknown,
  expected: readonly DeckKeyBinding[],
): boolean {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((candidate, index) => {
      const normalized = normalizeKeyBinding(candidate);
      const expectedBinding = expected[index];
      return normalized !== null &&
        expectedBinding !== undefined &&
        keyBindingSignature(normalized) === keyBindingSignature(expectedBinding);
    });
}

export function normalizeDeckKeybindings(
  value: unknown,
): Readonly<Record<SlipboxAction, readonly DeckKeyBinding[]>> {
  const source = isRecord(value) ? value : {};
  const claimed = new Set<string>();
  const result = {} as Record<SlipboxAction, readonly DeckKeyBinding[]>;

  // Existing arrays claim their bindings before missing actions receive their
  // defaults, preventing a default from displacing a current customization.
  for (const definition of SLIPBOX_ACTION_DEFINITIONS) {
    const candidate = source[definition.id];
    const retiredDefault = RETIRED_UNRELEASED_DEFAULT_DECK_KEYBINDINGS[
      definition.id
    ];
    if (
      retiredDefault !== undefined &&
      bindingsMatch(candidate, retiredDefault)
    ) {
      continue;
    }
    if (!Array.isArray(candidate)) {
      continue;
    }
    const normalized: DeckKeyBinding[] = [];
    for (const rawBinding of candidate) {
      const normalizedBinding = normalizeKeyBinding(rawBinding);
      if (normalizedBinding === null) {
        continue;
      }
      const signature = keyBindingSignature(normalizedBinding);
      if (claimed.has(signature)) {
        continue;
      }
      claimed.add(signature);
      normalized.push(normalizedBinding);
    }
    result[definition.id] = normalized;
  }

  for (const definition of SLIPBOX_ACTION_DEFINITIONS) {
    if (result[definition.id] !== undefined) {
      continue;
    }
    const normalized: DeckKeyBinding[] = [];
    for (const defaultBinding of definition.defaultBindings) {
      const signature = keyBindingSignature(defaultBinding);
      if (!claimed.has(signature)) {
        claimed.add(signature);
        normalized.push(defaultBinding);
      }
    }
    result[definition.id] = normalized;
  }

  return result;
}

function normalizeBooleanRecord<K extends string>(
  value: unknown,
  defaults: Readonly<Record<K, boolean>>,
): Readonly<Record<K, boolean>> {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      typeof source[key] === "boolean" ? source[key] : fallback,
    ]),
  ) as Readonly<Record<K, boolean>>;
}

export function normalizeCardHeaderButtons(
  value: unknown,
): CardHeaderButtonSettings {
  const source = isRecord(value) ? value : {};
  return {
    deck: normalizeBooleanRecord(source.deck, DEFAULT_CARD_HEADER_BUTTONS.deck),
    desk: normalizeBooleanRecord(
      source.desk,
      DEFAULT_CARD_HEADER_BUTTONS.desk,
    ),
    viewed: normalizeBooleanRecord(
      source.viewed,
      DEFAULT_CARD_HEADER_BUTTONS.viewed,
    ),
  };
}

export function normalizeSettings(value: unknown): SlipboxSettings {
  const source = isRecord(value) ? value : {};
  const addressProperty = normalizePropertyName(
    source.addressProperty,
    DEFAULT_SETTINGS.addressProperty,
  );
  const titleProperty = normalizePropertyName(
    source.titleProperty,
    DEFAULT_SETTINGS.titleProperty,
  );
  const requestedTitleSource = source.titleSource === "frontmatter"
    ? "frontmatter"
    : "filename";
  return {
    addressProperty,
    deckOrdering:
      source.deckOrdering === "lexicographic" ? "lexicographic" : "natural",
    duplicateAddresses:
      source.duplicateAddresses === "problem" ? "problem" : "allowed",
    explicitBranchLinks:
      typeof source.explicitBranchLinks === "boolean"
        ? source.explicitBranchLinks
        : DEFAULT_SETTINGS.explicitBranchLinks,
    outlineBranchLinks:
      typeof source.outlineBranchLinks === "boolean"
        ? source.outlineBranchLinks
        : DEFAULT_SETTINGS.outlineBranchLinks,
    hideBranchLinkMarkers:
      typeof source.hideBranchLinkMarkers === "boolean"
        ? source.hideBranchLinkMarkers
        : DEFAULT_SETTINGS.hideBranchLinkMarkers,
    showBranchLabels:
      typeof source.showBranchLabels === "boolean"
        ? source.showBranchLabels
        : DEFAULT_SETTINGS.showBranchLabels,
    inferAddressBranches:
      typeof source.inferAddressBranches === "boolean"
        ? source.inferAddressBranches
        : DEFAULT_SETTINGS.inferAddressBranches,
    showLocalBranchView:
      typeof source.showLocalBranchView === "boolean"
        ? source.showLocalBranchView
        : typeof source.showInferredBranchNavigation === "boolean"
          ? source.showInferredBranchNavigation
          : DEFAULT_SETTINGS.showLocalBranchView,
    titleSource:
      requestedTitleSource === "frontmatter" && titleProperty === addressProperty
        ? "filename"
        : requestedTitleSource,
    titleProperty,
    mainCardSize: normalizeCardSize(source.mainCardSize),
    deskCardSize: normalizeCardSize(source.deskCardSize),
    newCardFolder: normalizeFolderPath(source.newCardFolder),
    newNoteTimestampFormat: normalizePropertyName(
      source.newNoteTimestampFormat,
      DEFAULT_SETTINGS.newNoteTimestampFormat,
    ),
    showTitleInDeck:
      typeof source.showTitleInDeck === "boolean"
        ? source.showTitleInDeck
        : DEFAULT_SETTINGS.showTitleInDeck,
    showTooltips:
      typeof source.showTooltips === "boolean"
        ? source.showTooltips
        : DEFAULT_SETTINGS.showTooltips,
    showDeckMap:
      typeof source.showDeckMap === "boolean"
        ? source.showDeckMap
        : DEFAULT_SETTINGS.showDeckMap,
    restrictViewedCardPaste:
      typeof source.restrictViewedCardPaste === "boolean"
        ? source.restrictViewedCardPaste
        : DEFAULT_SETTINGS.restrictViewedCardPaste,
    previewLinksOnHover:
      typeof source.previewLinksOnHover === "boolean"
        ? source.previewLinksOnHover
        : DEFAULT_SETTINGS.previewLinksOnHover,
    followLinksFromCards:
      typeof source.followLinksFromCards === "boolean"
        ? source.followLinksFromCards
        : DEFAULT_SETTINGS.followLinksFromCards,
    protectFiledCardText:
      typeof source.protectFiledCardText === "boolean"
        ? source.protectFiledCardText
        : DEFAULT_SETTINGS.protectFiledCardText,
    showAutomaticBacklinks:
      typeof source.showAutomaticBacklinks === "boolean"
        ? source.showAutomaticBacklinks
        : DEFAULT_SETTINGS.showAutomaticBacklinks,
    allowCardScrolling:
      typeof source.allowCardScrolling === "boolean"
        ? source.allowCardScrolling
        : DEFAULT_SETTINGS.allowCardScrolling,
    cardSpread: normalizeCardSpread(source.cardSpread),
    cardHeaderButtons: normalizeCardHeaderButtons(source.cardHeaderButtons),
    deckKeybindings: normalizeDeckKeybindings(source.deckKeybindings),
  };
}

export function keyBindingConflict(
  keybindings: Readonly<Record<SlipboxAction, readonly DeckKeyBinding[]>>,
  action: SlipboxAction,
  bindingValue: DeckKeyBinding,
): SlipboxAction | null {
  const signature = keyBindingSignature(bindingValue);
  for (const definition of SLIPBOX_ACTION_DEFINITIONS) {
    if (
      definition.id !== action &&
      keybindings[definition.id].some(
        (candidate) => keyBindingSignature(candidate) === signature,
      )
    ) {
      return definition.id;
    }
  }
  return null;
}
