export const DESK_WIDTH = 2400;
export const DESK_HEIGHT = 1600;
export const DESK_CARD_WIDTH = 520;
export const DESK_CARD_HEIGHT = 346;

export interface DeskCardState {
  readonly cardRef: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clampDeskPosition(
  x: number,
  y: number,
): Readonly<{ x: number; y: number }> {
  return {
    x: Math.round(Math.max(0, Math.min(DESK_WIDTH - DESK_CARD_WIDTH, x))),
    y: Math.round(Math.max(0, Math.min(DESK_HEIGHT - DESK_CARD_HEIGHT, y))),
  };
}

export function normalizeDeskCards(value: unknown): readonly DeskCardState[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const cards: DeskCardState[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.cardRef !== "string" ||
      candidate.cardRef.trim() === "" ||
      !finiteNumber(candidate.x) ||
      !finiteNumber(candidate.y) ||
      !finiteNumber(candidate.z)
    ) {
      continue;
    }
    const cardRef = candidate.cardRef.trim();
    if (seen.has(cardRef)) {
      continue;
    }
    seen.add(cardRef);
    const position = clampDeskPosition(candidate.x, candidate.y);
    cards.push({
      cardRef,
      ...position,
      z: Math.max(0, Math.round(candidate.z)),
    });
  }
  return cards;
}

/** Remove a deleted note or every note beneath a deleted folder path. */
export function removeDeskPath(
  cards: readonly DeskCardState[],
  deletedPath: string,
): readonly DeskCardState[] {
  const prefix = `${deletedPath.replace(/\/$/, "")}/`;
  return cards.filter(
    (card) => card.cardRef !== deletedPath && !card.cardRef.startsWith(prefix),
  );
}

export function renameDeskCard(
  cards: readonly DeskCardState[],
  oldRef: string,
  newRef: string,
): readonly DeskCardState[] {
  const oldPrefix = `${oldRef.replace(/\/$/, "")}/`;
  const newPrefix = `${newRef.replace(/\/$/, "")}/`;
  const renamed = cards.map((card) => {
    if (card.cardRef === oldRef) {
      return { ...card, cardRef: newRef };
    }
    if (card.cardRef.startsWith(oldPrefix)) {
      return { ...card, cardRef: `${newPrefix}${card.cardRef.slice(oldPrefix.length)}` };
    }
    return card;
  });
  return normalizeDeskCards(renamed);
}
