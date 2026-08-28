import {
  normalizeBookmarks,
  type DeckBookmark,
} from "./bookmarks.js";
import {
  DEFAULT_SETTINGS,
  SLIPBOX_DATA_SCHEMA_VERSION,
  normalizeSettings,
  type SlipboxSettings,
} from "./settings.js";

export interface SlipboxPluginState {
  readonly bookmarks: readonly DeckBookmark[];
}

export interface SlipboxPluginData {
  readonly schemaVersion: number;
  readonly settings: SlipboxSettings;
  readonly state: SlipboxPluginState;
}

export interface LoadedSlipboxPluginData {
  readonly data: SlipboxPluginData;
  readonly reset: boolean;
}

export const DEFAULT_STATE: SlipboxPluginState = {
  bookmarks: [],
};

export const DEFAULT_DATA: SlipboxPluginData = {
  schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
  settings: DEFAULT_SETTINGS,
  state: DEFAULT_STATE,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizePluginState(value: unknown): SlipboxPluginState {
  return {
    bookmarks: isRecord(value)
      ? normalizeBookmarks(value.bookmarks)
      : [],
  };
}

/**
 * Load the canonical schema or reset an earlier beta while retaining only
 * path-based bookmarks. Markdown files and their frontmatter are never part
 * of plugin data and are therefore unaffected by this boundary.
 */
export function loadPluginData(value: unknown): LoadedSlipboxPluginData {
  if (!isRecord(value)) {
    return { data: DEFAULT_DATA, reset: false };
  }
  if (value.schemaVersion === SLIPBOX_DATA_SCHEMA_VERSION) {
    return {
      data: {
        schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
        settings: normalizeSettings(value.settings),
        state: normalizePluginState(value.state),
      },
      reset: false,
    };
  }

  const state = isRecord(value.state)
    ? normalizePluginState(value.state)
    : DEFAULT_STATE;
  return {
    data: {
      schemaVersion: SLIPBOX_DATA_SCHEMA_VERSION,
      settings: DEFAULT_SETTINGS,
      state,
    },
    reset: true,
  };
}
