import { isValidZettelId } from "./zettel-id.js";

export interface EntryPoint {
  readonly name: string;
  readonly id: string;
}

export interface ZettelkastenPluginState {
  readonly entryPoints: readonly EntryPoint[];
  readonly lastActiveId: string | null;
  readonly spread: number;
}

export const DEFAULT_SPREAD = 0.58;

export const DEFAULT_STATE: ZettelkastenPluginState = {
  entryPoints: [],
  lastActiveId: null,
  spread: DEFAULT_SPREAD,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Tolerant loading for plugin data written by this or an older release. */
export function normalizePluginState(value: unknown): ZettelkastenPluginState {
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

  const lastActiveId =
    typeof value.lastActiveId === "string" &&
    isValidZettelId(value.lastActiveId)
      ? value.lastActiveId
      : null;

  const rawSpread =
    typeof value.spread === "number" && Number.isFinite(value.spread)
      ? value.spread
      : DEFAULT_SPREAD;

  return {
    entryPoints,
    lastActiveId,
    spread: Math.min(1.12, Math.max(0.28, rawSpread)),
  };
}
