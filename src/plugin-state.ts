import { isValidZettelId } from "./zettel-id.js";
import { normalizeBookmarks, type DeckBookmark } from "./bookmarks.js";
import { normalizeDeskCards, type DeskCardState } from "./desk-state.js";

export interface EntryPoint {
  readonly name: string;
  readonly id: string;
}

export interface SlipboxPluginState {
  readonly entryPoints: readonly EntryPoint[];
  readonly bookmarks: readonly DeckBookmark[];
  readonly deskCards: readonly DeskCardState[];
  readonly spread: number;
}

export const DEFAULT_SPREAD = 0.58;

export const DEFAULT_STATE: SlipboxPluginState = {
  entryPoints: [],
  bookmarks: [],
  deskCards: [],
  spread: DEFAULT_SPREAD,
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
        if (
          !isRecord(entry) ||
          typeof entry.name !== "string" ||
          entry.name.trim() === "" ||
          typeof entry.id !== "string" ||
          !isValidZettelId(entry.id)
        ) {
          return [];
        }
        return [{ name: entry.name.trim(), id: entry.id }];
      })
    : [];

  const rawSpread =
    typeof value.spread === "number" && Number.isFinite(value.spread)
      ? value.spread
      : DEFAULT_SPREAD;

  return {
    entryPoints,
    bookmarks: normalizeBookmarks(value.bookmarks),
    deskCards: normalizeDeskCards(value.deskCards),
    spread: Math.min(1.12, Math.max(0.28, rawSpread)),
  };
}
