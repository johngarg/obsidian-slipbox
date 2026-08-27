import { normalizeBookmarks, type StoredBookmark } from "./bookmarks.js";
import {
  normalizeLegacyDeskCards,
  type LegacyDeskCardState,
} from "./legacy-desk-state.js";
import {
  DEFAULT_SETTINGS,
  SLIPBOX_DATA_SCHEMA_VERSION,
  hasTitleAddressPropertyCollision,
  normalizeSettings,
  type SlipboxSettings,
} from "./settings.js";

export interface SlipboxPluginState {
  readonly bookmarks: readonly StoredBookmark[];
  /** Retained only until an old persistent Desk has been exported to Canvas. */
  readonly legacyDeskCards?: readonly LegacyDeskCardState[];
}

export interface SlipboxPluginData {
  readonly schemaVersion: number;
  readonly settings: SlipboxSettings;
  readonly state: SlipboxPluginState;
}

export const DEFAULT_STATE: SlipboxPluginState = {
  bookmarks: [],
};

export const DEFAULT_DATA: SlipboxPluginData = {
  schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
  settings: DEFAULT_SETTINGS,
  state: DEFAULT_STATE,
};

const LEGACY_PAPER_WORKFLOW_SETTINGS = {
  restrictViewedCardPaste: false,
  previewLinksOnHover: true,
  followLinksFromCards: true,
  protectFiledCardText: false,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function hasRemovedEntryPointData(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const state = isRecord(value.state) ? value.state : value;
  const settings = isRecord(value.settings) ? value.settings : {};
  const keybindings = isRecord(settings.deckKeybindings)
    ? settings.deckKeybindings
    : {};
  return Object.prototype.hasOwnProperty.call(state, "entryPoints") ||
    Object.prototype.hasOwnProperty.call(keybindings, "entry-points");
}

export function hasTitleAddressCollisionData(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const settings = isRecord(value.settings) ? value.settings : {};
  return hasTitleAddressPropertyCollision(settings);
}

export function needsPluginDataMigration(value: unknown): boolean {
  return isRecord(value) && value.schemaVersion !== SLIPBOX_DATA_SCHEMA_VERSION;
}

/** Tolerant loading for plugin data written by this or an older release. */
export function normalizePluginState(value: unknown): SlipboxPluginState {
  if (!isRecord(value)) {
    return DEFAULT_STATE;
  }

  const legacyDeskCards = normalizeLegacyDeskCards(
    Object.prototype.hasOwnProperty.call(value, "legacyDeskCards")
      ? value.legacyDeskCards
      : value.deskCards,
  );
  return {
    bookmarks: normalizeBookmarks(value.bookmarks),
    ...(legacyDeskCards.length > 0 ? { legacyDeskCards } : {}),
  };
}

/** Load current versioned data or migrate the legacy flat workspace state. */
export function normalizePluginData(value: unknown): SlipboxPluginData {
  if (!isRecord(value)) {
    return DEFAULT_DATA;
  }
  const versioned = isRecord(value.state) || isRecord(value.settings);
  const rawSettings = versioned && isRecord(value.settings)
    ? value.settings
    : {};
  const rawState = versioned && isRecord(value.state) ? value.state : value;
  const schemaVersion = typeof value.schemaVersion === "number"
    ? value.schemaVersion
    : null;
  const legacyPaperWorkflow = schemaVersion === null || schemaVersion < 10
    ? LEGACY_PAPER_WORKFLOW_SETTINGS
    : {};
  const settingsWithMigratedSpread = {
    ...legacyPaperWorkflow,
    ...rawSettings,
    cardSpread: Object.prototype.hasOwnProperty.call(rawSettings, "cardSpread")
      ? rawSettings.cardSpread
      : isRecord(rawState)
        ? rawState.spread
        : undefined,
  };
  return {
    schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
    settings: normalizeSettings(settingsWithMigratedSpread),
    state: normalizePluginState(rawState),
  };
}
