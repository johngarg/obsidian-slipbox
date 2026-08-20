import { validateAddress } from "./address-order.js";
import { normalizeBookmarks, type StoredBookmark } from "./bookmarks.js";
import { normalizeDeskCards, type DeskCardState } from "./desk-state.js";
import {
  DEFAULT_SETTINGS,
  SLIPBOX_DATA_SCHEMA_VERSION,
  normalizeSettings,
  type SlipboxSettings,
} from "./settings.js";

export interface EntryPoint {
  readonly name: string;
  readonly address: string;
}

export interface SlipboxPluginState {
  readonly entryPoints: readonly EntryPoint[];
  readonly bookmarks: readonly StoredBookmark[];
  /** Retained only until an old persistent Desk has been exported to Canvas. */
  readonly legacyDeskCards?: readonly DeskCardState[];
  readonly spread: number;
}

export interface SlipboxPluginData {
  readonly schemaVersion: number;
  readonly settings: SlipboxSettings;
  readonly state: SlipboxPluginState;
}

export const DEFAULT_SPREAD = 0.58;
export const MIN_SPREAD = 0.18;
export const MAX_SPREAD = 1.12;

export const DEFAULT_STATE: SlipboxPluginState = {
  entryPoints: [],
  bookmarks: [],
  spread: DEFAULT_SPREAD,
};

export const DEFAULT_DATA: SlipboxPluginData = {
  schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
  settings: DEFAULT_SETTINGS,
  state: DEFAULT_STATE,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Tolerant loading for plugin data written by this or an older release. */
export function normalizePluginState(value: unknown): SlipboxPluginState {
  if (!isRecord(value)) {
    return DEFAULT_STATE;
  }

  const entryPoints = Array.isArray(value.entryPoints)
    ? value.entryPoints.flatMap((entry): EntryPoint[] => {
        if (!isRecord(entry)) {
          return [];
        }
        const address = typeof entry.address === "string"
          ? entry.address
          : entry.id;
        if (
          typeof entry.name !== "string" ||
          entry.name.trim() === "" ||
          typeof address !== "string" ||
          !validateAddress(address).valid
        ) {
          return [];
        }
        return [{ name: entry.name.trim(), address }];
      })
    : [];

  const rawSpread =
    typeof value.spread === "number" && Number.isFinite(value.spread)
      ? value.spread
      : DEFAULT_SPREAD;

  const legacyDeskCards = normalizeDeskCards(
    Object.prototype.hasOwnProperty.call(value, "legacyDeskCards")
      ? value.legacyDeskCards
      : value.deskCards,
  );
  return {
    entryPoints,
    bookmarks: normalizeBookmarks(value.bookmarks),
    ...(legacyDeskCards.length > 0 ? { legacyDeskCards } : {}),
    spread: Math.min(MAX_SPREAD, Math.max(MIN_SPREAD, rawSpread)),
  };
}

/** Load current versioned data or migrate the legacy flat workspace state. */
export function normalizePluginData(value: unknown): SlipboxPluginData {
  if (!isRecord(value)) {
    return DEFAULT_DATA;
  }
  const versioned = isRecord(value.state) || isRecord(value.settings);
  return {
    schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
    settings: normalizeSettings(versioned ? value.settings : undefined),
    state: normalizePluginState(versioned ? value.state : value),
  };
}
