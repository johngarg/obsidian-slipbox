export type TrayCardKind = "filed" | "unfiled";

export interface TrayCard {
  readonly cardRef: string;
  readonly kind: TrayCardKind;
}

export interface TrayCardCandidate extends TrayCard {
  readonly modifiedTime: number;
}

export interface TrayPile {
  readonly id: string;
  readonly cards: readonly TrayCard[];
}

export interface TrayState {
  readonly piles: readonly TrayPile[];
  readonly expandedPileId: string | null;
  /** The startup pile that receives newly discovered unfiled cards while it exists. */
  readonly unfiledPileId: string | null;
}

export const EMPTY_TRAY: TrayState = {
  piles: [],
  expandedPileId: null,
  unfiledPileId: null,
};

export function initialTrayFromUnfiled(
  candidates: readonly TrayCardCandidate[],
  pileId: string,
): TrayState {
  return reconcileTray(EMPTY_TRAY, candidates, pileId);
}

export function createPile(
  state: TrayState,
  pileId: string,
  cards: readonly TrayCard[],
  pileIndex = state.piles.length,
): TrayState {
  if (pileId === "" || state.piles.some((pile) => pile.id === pileId)) {
    return state;
  }
  const occupied = new Set(allTrayCardRefs(state));
  const unique: TrayCard[] = [];
  for (const card of cards) {
    if (card.cardRef !== "" && !occupied.has(card.cardRef)) {
      occupied.add(card.cardRef);
      unique.push(card);
    }
  }
  if (unique.length === 0) {
    return state;
  }
  const piles = [...state.piles];
  piles.splice(clampIndex(pileIndex, piles.length + 1), 0, {
    id: pileId,
    cards: unique,
  });
  return cleanTray({ ...state, piles });
}

export function removeEmptyPiles(state: TrayState): TrayState {
  return cleanTray(state);
}

export function addUniqueCardToPile(
  state: TrayState,
  pileId: string,
  card: TrayCard,
  cardIndex = Number.POSITIVE_INFINITY,
): TrayState {
  if (card.cardRef === "" || trayContains(state, card.cardRef)) {
    return state;
  }
  const pileIndex = state.piles.findIndex((pile) => pile.id === pileId);
  if (pileIndex < 0) {
    return state;
  }
  const piles = [...state.piles];
  const cards = [...piles[pileIndex]!.cards];
  cards.splice(clampIndex(cardIndex, cards.length + 1), 0, card);
  piles[pileIndex] = { ...piles[pileIndex]!, cards };
  return cleanTray({ ...state, piles });
}

export function removeCard(state: TrayState, cardRef: string): TrayState {
  return cleanTray({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.filter((card) => card.cardRef !== cardRef),
    })),
  });
}

export function moveCardWithinPile(
  state: TrayState,
  pileId: string,
  fromIndex: number,
  toIndex: number,
): TrayState {
  const pileIndex = state.piles.findIndex((pile) => pile.id === pileId);
  const pile = state.piles[pileIndex];
  if (
    pile === undefined ||
    fromIndex < 0 ||
    fromIndex >= pile.cards.length ||
    pile.cards.length < 2
  ) {
    return state;
  }
  const cards = [...pile.cards];
  const [card] = cards.splice(fromIndex, 1);
  if (card === undefined) {
    return state;
  }
  cards.splice(clampIndex(toIndex, cards.length + 1), 0, card);
  const piles = [...state.piles];
  piles[pileIndex] = { ...pile, cards };
  return cleanTray({ ...state, piles });
}

export function moveCardBetweenPiles(
  state: TrayState,
  cardRef: string,
  targetPileId: string,
  targetIndex = Number.POSITIVE_INFINITY,
): TrayState {
  const source = cardPosition(state, cardRef);
  const targetPile = state.piles.find((pile) => pile.id === targetPileId);
  if (source === null || targetPile === undefined) {
    return state;
  }
  if (source.pileId === targetPileId) {
    return moveCardWithinPile(
      state,
      source.pileId,
      source.cardIndex,
      targetIndex,
    );
  }
  const card = state.piles[source.pileIndex]!.cards[source.cardIndex];
  if (card === undefined) {
    return state;
  }
  let next = removeCard(state, cardRef);
  next = addUniqueCardToPile(next, targetPileId, card, targetIndex);
  return next;
}

export function splitCardIntoNewPile(
  state: TrayState,
  cardRef: string,
  newPileId: string,
  pileIndex?: number,
): TrayState {
  const source = cardPosition(state, cardRef);
  if (
    source === null ||
    newPileId === "" ||
    state.piles.some((pile) => pile.id === newPileId)
  ) {
    return state;
  }
  const card = state.piles[source.pileIndex]!.cards[source.cardIndex];
  if (card === undefined) {
    return state;
  }
  const sourcePileId = source.pileId;
  const insertAt = pileIndex ?? source.pileIndex + 1;
  const withoutCard = removeCard(state, cardRef);
  const adjustedIndex = state.piles[source.pileIndex]!.cards.length === 1 &&
      insertAt > source.pileIndex
    ? insertAt - 1
    : insertAt;
  const next = createPile(withoutCard, newPileId, [card], adjustedIndex);
  return sourcePileId === state.unfiledPileId &&
      !next.piles.some((pile) => pile.id === sourcePileId)
    ? { ...next, unfiledPileId: null }
    : next;
}

export function mergePiles(
  state: TrayState,
  sourcePileId: string,
  targetPileId: string,
): TrayState {
  if (sourcePileId === targetPileId) {
    return state;
  }
  const sourceIndex = state.piles.findIndex((pile) => pile.id === sourcePileId);
  const targetIndex = state.piles.findIndex((pile) => pile.id === targetPileId);
  const source = state.piles[sourceIndex];
  const target = state.piles[targetIndex];
  if (source === undefined || target === undefined) {
    return state;
  }
  const piles = state.piles.flatMap((pile): TrayPile[] => {
    if (pile.id === sourcePileId) {
      return [];
    }
    if (pile.id === targetPileId) {
      return [{ ...pile, cards: [...pile.cards, ...source.cards] }];
    }
    return [pile];
  });
  return cleanTray({
    ...state,
    piles,
    expandedPileId: state.expandedPileId === sourcePileId
      ? targetPileId
      : state.expandedPileId,
    unfiledPileId: state.unfiledPileId === sourcePileId
      ? null
      : state.unfiledPileId,
  });
}

export function reorderPiles(
  state: TrayState,
  fromIndex: number,
  toIndex: number,
): TrayState {
  if (
    fromIndex < 0 ||
    fromIndex >= state.piles.length ||
    state.piles.length < 2
  ) {
    return state;
  }
  const piles = [...state.piles];
  const [pile] = piles.splice(fromIndex, 1);
  if (pile === undefined) {
    return state;
  }
  piles.splice(clampIndex(toIndex, piles.length + 1), 0, pile);
  return cleanTray({ ...state, piles });
}

export function clearFiledCardsFromPile(
  state: TrayState,
  pileId: string,
): TrayState {
  return cleanTray({
    ...state,
    piles: state.piles.map((pile) => pile.id === pileId
      ? { ...pile, cards: pile.cards.filter((card) => card.kind === "unfiled") }
      : pile),
  });
}

export function clearFiledCardsFromTray(state: TrayState): TrayState {
  return cleanTray({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.filter((card) => card.kind === "unfiled"),
    })),
  });
}

export function renameTrayPath(
  state: TrayState,
  oldPath: string,
  newPath: string,
): TrayState {
  const prefix = `${oldPath.replace(/\/$/, "")}/`;
  const seen = new Set<string>();
  return cleanTray({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.flatMap((card): TrayCard[] => {
        const cardRef = card.cardRef === oldPath
          ? newPath
          : card.cardRef.startsWith(prefix)
            ? `${newPath.replace(/\/$/, "")}/${card.cardRef.slice(prefix.length)}`
            : card.cardRef;
        if (cardRef === "" || seen.has(cardRef)) {
          return [];
        }
        seen.add(cardRef);
        return [{ ...card, cardRef }];
      }),
    })),
  });
}

export function removeTrayPath(state: TrayState, path: string): TrayState {
  const prefix = `${path.replace(/\/$/, "")}/`;
  return cleanTray({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.filter(
        (card) => card.cardRef !== path && !card.cardRef.startsWith(prefix),
      ),
    })),
  });
}

export function pruneTrayCards(
  state: TrayState,
  eligibleCards: readonly TrayCard[],
): TrayState {
  const eligible = new Map(
    eligibleCards
      .filter((card) => card.cardRef !== "")
      .map((card) => [card.cardRef, card.kind] as const),
  );
  const seen = new Set<string>();
  return cleanTray({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.flatMap((card): TrayCard[] => {
        const kind = eligible.get(card.cardRef);
        if (
          kind === undefined ||
          seen.has(card.cardRef) ||
          (card.kind === "unfiled" && kind === "filed")
        ) {
          return [];
        }
        seen.add(card.cardRef);
        return [{ cardRef: card.cardRef, kind }];
      }),
    })),
  });
}

export function reconcileTray(
  state: TrayState,
  candidates: readonly TrayCardCandidate[],
  newUnfiledPileId: string,
): TrayState {
  const eligible = uniqueCandidates(candidates);
  let next = pruneTrayCards(state, eligible);
  const present = new Set(allTrayCardRefs(next));
  const missing = eligible
    .filter((card) => card.kind === "unfiled" && !present.has(card.cardRef))
    .sort(compareInitialCards)
    .map(({ cardRef, kind }) => ({ cardRef, kind }));
  if (missing.length === 0) {
    return next;
  }
  const home = next.unfiledPileId === null
    ? undefined
    : next.piles.find((pile) => pile.id === next.unfiledPileId);
  if (home !== undefined) {
    const piles = next.piles.map((pile) => pile.id === home.id
      ? { ...pile, cards: [...missing, ...pile.cards] }
      : pile);
    return cleanTray({ ...next, piles });
  }
  next = createPile(next, newUnfiledPileId, missing);
  return next.piles.some((pile) => pile.id === newUnfiledPileId)
    ? { ...next, unfiledPileId: newUnfiledPileId }
    : next;
}

export function toggleFiledCard(
  state: TrayState,
  card: TrayCard,
  newPileId: string,
): TrayState {
  if (card.kind !== "filed") {
    return state;
  }
  if (trayContains(state, card.cardRef)) {
    return removeCard(state, card.cardRef);
  }
  const expanded = state.expandedPileId === null
    ? undefined
    : state.piles.find((pile) => pile.id === state.expandedPileId);
  return expanded === undefined
    ? createPile(state, newPileId, [card])
    : addUniqueCardToPile(state, expanded.id, card);
}

export function setExpandedPile(
  state: TrayState,
  pileId: string | null,
): TrayState {
  return {
    ...state,
    expandedPileId: pileId !== null && state.piles.some((pile) => pile.id === pileId)
      ? pileId
      : null,
  };
}

export function trayContains(state: TrayState, cardRef: string): boolean {
  return state.piles.some((pile) =>
    pile.cards.some((card) => card.cardRef === cardRef));
}

export function trayHasFiledCards(state: TrayState): boolean {
  return state.piles.some((pile) =>
    pile.cards.some((card) => card.kind === "filed"));
}

export function cardPosition(
  state: TrayState,
  cardRef: string,
): Readonly<{
  pileId: string;
  pileIndex: number;
  cardIndex: number;
  pileSize: number;
}> | null {
  for (let pileIndex = 0; pileIndex < state.piles.length; pileIndex += 1) {
    const pile = state.piles[pileIndex];
    if (pile === undefined) {
      continue;
    }
    const cardIndex = pile.cards.findIndex((card) => card.cardRef === cardRef);
    if (cardIndex >= 0) {
      return { pileId: pile.id, pileIndex, cardIndex, pileSize: pile.cards.length };
    }
  }
  return null;
}

export function insertionIndexForPoint(
  point: number,
  itemCentres: readonly number[],
): number {
  return itemCentres.findIndex((centre) => point < centre) < 0
    ? itemCentres.length
    : itemCentres.findIndex((centre) => point < centre);
}

function cleanTray(state: TrayState): TrayState {
  const piles = state.piles.filter((pile) => pile.cards.length > 0);
  const ids = new Set(piles.map((pile) => pile.id));
  return {
    piles,
    expandedPileId: state.expandedPileId !== null && ids.has(state.expandedPileId)
      ? state.expandedPileId
      : null,
    unfiledPileId: state.unfiledPileId !== null && ids.has(state.unfiledPileId)
      ? state.unfiledPileId
      : null,
  };
}

function allTrayCardRefs(state: TrayState): string[] {
  return state.piles.flatMap((pile) => pile.cards.map((card) => card.cardRef));
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) {
    return index < 0 ? 0 : Math.max(0, length - 1);
  }
  return Math.max(0, Math.min(Math.max(0, length - 1), Math.trunc(index)));
}

function uniqueCandidates(
  candidates: readonly TrayCardCandidate[],
): TrayCardCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((card) => {
    if (card.cardRef === "" || seen.has(card.cardRef)) {
      return false;
    }
    seen.add(card.cardRef);
    return true;
  });
}

function compareInitialCards(
  left: TrayCardCandidate,
  right: TrayCardCandidate,
): number {
  return right.modifiedTime - left.modifiedTime ||
    left.cardRef.localeCompare(right.cardRef);
}
