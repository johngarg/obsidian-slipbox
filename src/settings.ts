import type { DeckOrdering } from "./address-order.js";

export const SLIPBOX_DATA_SCHEMA_VERSION = 5;

export type TitleSource = "filename" | "frontmatter";
export type CardSize = "small" | "medium" | "large";

export type DeckHeaderButton =
  | "open-note"
  | "copy-link"
  | "tray"
  | "bookmark";

export type DeckAction =
  | "previous-card"
  | "next-card"
  | "centre-card"
  | "first-card"
  | "last-card"
  | "open-note"
  | "copy-link"
  | "toggle-tray"
  | "toggle-bookmark"
  | "back"
  | "forward"
  | "entry-points"
  | "bookmarks"
  | "problems"
  | "confirm-filing"
  | "cancel-filing";

export type KeyModifier = "Mod" | "Ctrl" | "Meta" | "Alt" | "Shift";

export interface DeckKeyBinding {
  readonly modifiers: readonly KeyModifier[];
  readonly key: string;
}

export interface DeckActionDefinition {
  readonly id: DeckAction;
  readonly label: string;
  readonly repeatable: boolean;
  readonly defaultBindings: readonly DeckKeyBinding[];
}

const binding = (
  key: string,
  modifiers: readonly KeyModifier[] = [],
): DeckKeyBinding => ({ key, modifiers });

export const DECK_ACTION_DEFINITIONS: readonly DeckActionDefinition[] = [
  {
    id: "previous-card",
    label: "Previous card",
    repeatable: true,
    defaultBindings: [binding("ArrowLeft"), binding("k")],
  },
  {
    id: "next-card",
    label: "Next card",
    repeatable: true,
    defaultBindings: [binding("ArrowRight"), binding("j")],
  },
  {
    id: "centre-card",
    label: "Centre active card",
    repeatable: false,
    defaultBindings: [binding("c")],
  },
  {
    id: "first-card",
    label: "First card",
    repeatable: false,
    defaultBindings: [binding("g")],
  },
  {
    id: "last-card",
    label: "Last card",
    repeatable: false,
    defaultBindings: [binding("g", ["Shift"])],
  },
  {
    id: "open-note",
    label: "Open Markdown note",
    repeatable: false,
    defaultBindings: [binding("o")],
  },
  {
    id: "toggle-tray",
    label: "Pull out or return card",
    repeatable: false,
    defaultBindings: [binding("p")],
  },
  {
    id: "toggle-bookmark",
    label: "Toggle bookmark",
    repeatable: false,
    defaultBindings: [binding("b")],
  },
  { id: "back", label: "Back", repeatable: false, defaultBindings: [] },
  { id: "forward", label: "Forward", repeatable: false, defaultBindings: [] },
  {
    id: "entry-points",
    label: "Manage entry points",
    repeatable: false,
    defaultBindings: [],
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
    label: "Copy card link",
    repeatable: false,
    defaultBindings: [binding("y")],
  },
];

export interface SlipboxSettings {
  readonly addressProperty: string;
  readonly deckOrdering: DeckOrdering;
  readonly titleSource: TitleSource;
  readonly titleProperty: string;
  readonly mainCardSize: CardSize;
  readonly trayCardSize: CardSize;
  readonly newCardFolder: string;
  readonly newNoteTimestampFormat: string;
  readonly useTemplatesForNewNotes: boolean;
  readonly newNoteTemplatePath: string;
  readonly showTitleInDeck: boolean;
  readonly showDeckMap: boolean;
  readonly deckHeaderButtons: Readonly<Record<DeckHeaderButton, boolean>>;
  readonly deckKeybindings: Readonly<Record<DeckAction, readonly DeckKeyBinding[]>>;
}

export const DEFAULT_DECK_HEADER_BUTTONS: Readonly<Record<DeckHeaderButton, boolean>> = {
  "open-note": true,
  "copy-link": true,
  tray: true,
  bookmark: true,
};

export const DEFAULT_DECK_KEYBINDINGS = Object.fromEntries(
  DECK_ACTION_DEFINITIONS.map((definition) => [
    definition.id,
    definition.defaultBindings,
  ]),
) as Readonly<Record<DeckAction, readonly DeckKeyBinding[]>>;

export const DEFAULT_SETTINGS: SlipboxSettings = {
  addressProperty: "zettel-id",
  deckOrdering: "natural",
  titleSource: "filename",
  titleProperty: "title",
  mainCardSize: "medium",
  trayCardSize: "medium",
  newCardFolder: "",
  newNoteTimestampFormat: "YYYYMMDDTHHmmss",
  useTemplatesForNewNotes: false,
  newNoteTemplatePath: "",
  showTitleInDeck: false,
  showDeckMap: true,
  deckHeaderButtons: DEFAULT_DECK_HEADER_BUTTONS,
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
  return [...bindingValue.modifiers, key].join("+");
}

export function normalizeDeckKeybindings(
  value: unknown,
): Readonly<Record<DeckAction, readonly DeckKeyBinding[]>> {
  const source = isRecord(value) ? value : {};
  const claimed = new Set<string>();
  const result = {} as Record<DeckAction, readonly DeckKeyBinding[]>;

  for (const definition of DECK_ACTION_DEFINITIONS) {
    const candidate = source[definition.id];
    const rawBindings = Array.isArray(candidate)
      ? candidate
      : definition.defaultBindings;
    const normalized: DeckKeyBinding[] = [];
    for (const rawBinding of rawBindings) {
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

export function normalizeSettings(value: unknown): SlipboxSettings {
  const source = isRecord(value) ? value : {};
  return {
    addressProperty: normalizePropertyName(
      source.addressProperty,
      DEFAULT_SETTINGS.addressProperty,
    ),
    deckOrdering:
      source.deckOrdering === "lexicographic" ? "lexicographic" : "natural",
    titleSource: source.titleSource === "frontmatter" ? "frontmatter" : "filename",
    titleProperty: normalizePropertyName(
      source.titleProperty,
      DEFAULT_SETTINGS.titleProperty,
    ),
    mainCardSize: normalizeCardSize(source.mainCardSize),
    trayCardSize: normalizeCardSize(source.trayCardSize),
    newCardFolder: normalizeFolderPath(source.newCardFolder),
    newNoteTimestampFormat: normalizePropertyName(
      source.newNoteTimestampFormat,
      DEFAULT_SETTINGS.newNoteTimestampFormat,
    ),
    useTemplatesForNewNotes:
      typeof source.useTemplatesForNewNotes === "boolean"
        ? source.useTemplatesForNewNotes
        : DEFAULT_SETTINGS.useTemplatesForNewNotes,
    newNoteTemplatePath:
      typeof source.newNoteTemplatePath === "string"
        ? source.newNoteTemplatePath.trim()
        : DEFAULT_SETTINGS.newNoteTemplatePath,
    showTitleInDeck:
      typeof source.showTitleInDeck === "boolean"
        ? source.showTitleInDeck
        : DEFAULT_SETTINGS.showTitleInDeck,
    showDeckMap:
      typeof source.showDeckMap === "boolean"
        ? source.showDeckMap
        : DEFAULT_SETTINGS.showDeckMap,
    deckHeaderButtons: normalizeBooleanRecord(
      source.deckHeaderButtons,
      DEFAULT_DECK_HEADER_BUTTONS,
    ),
    deckKeybindings: normalizeDeckKeybindings(source.deckKeybindings),
  };
}

/** Keep ignored legacy/unknown keys when writing a normalized settings object. */
export function settingsForPersistence(
  rawValue: unknown,
  settings: SlipboxSettings,
): Readonly<Record<string, unknown>> {
  const raw = isRecord(rawValue) ? rawValue : {};
  const rawButtons = isRecord(raw.deckHeaderButtons)
    ? raw.deckHeaderButtons
    : {};
  const rawKeybindings = isRecord(raw.deckKeybindings)
    ? raw.deckKeybindings
    : {};
  return {
    ...raw,
    ...settings,
    deckHeaderButtons: {
      ...rawButtons,
      ...settings.deckHeaderButtons,
    },
    deckKeybindings: {
      ...rawKeybindings,
      ...settings.deckKeybindings,
    },
  };
}

export function keyBindingConflict(
  keybindings: Readonly<Record<DeckAction, readonly DeckKeyBinding[]>>,
  action: DeckAction,
  bindingValue: DeckKeyBinding,
): DeckAction | null {
  const signature = keyBindingSignature(bindingValue);
  for (const definition of DECK_ACTION_DEFINITIONS) {
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
