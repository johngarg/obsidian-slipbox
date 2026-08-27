import { fnv1a } from "./hash.js";

export type DeskCardKind = "filed" | "unfiled";

export interface DeskCard {
  readonly cardRef: string;
  readonly kind: DeskCardKind;
}

export interface DeskCardCandidate extends DeskCard {
  readonly modifiedTime: number;
}

export interface DeskPile {
  readonly id: string;
  readonly cards: readonly DeskCard[];
  readonly position?: DeskPilePosition;
}

export interface DeskPilePosition {
  readonly x: number;
  readonly y: number;
}

export interface DeskState {
  readonly piles: readonly DeskPile[];
  /** Expanded piles in activation order; the last is the active pull-out target. */
  readonly expandedPileIds: readonly string[];
  /** The startup pile that receives newly discovered unfiled cards while it exists. */
  readonly unfiledPileId: string | null;
}

/**
 * A primary click selects a visible Desk card. Collapsed cards additionally
 * expand their pile; showing a filed card in the Deck is always an explicit
 * registered action.
 */
export function deskCardPrimaryClickIntent(
  expanded: boolean,
): "focus-only" | "expand-pile" {
  return expanded ? "focus-only" : "expand-pile";
}

export interface DeskStackJitter {
  readonly rotationDegrees: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export const EMPTY_DESK: DeskState = {
  piles: [],
  expandedPileIds: [],
  unfiledPileId: null,
};

export function initialDeskFromUnfiled(
  candidates: readonly DeskCardCandidate[],
  pileId: string,
): DeskState {
  return reconcileDesk(EMPTY_DESK, candidates, pileId);
}

export function createPile(
  state: DeskState,
  pileId: string,
  cards: readonly DeskCard[],
  pileIndex = state.piles.length,
): DeskState {
  if (pileId === "" || state.piles.some((pile) => pile.id === pileId)) {
    return state;
  }
  const occupied = new Set(allDeskCardRefs(state));
  const unique: DeskCard[] = [];
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
  piles.splice(clampInsertionIndex(pileIndex, piles.length), 0, {
    id: pileId,
    cards: unique,
  });
  return cleanDesk({ ...state, piles });
}

export function removeEmptyPiles(state: DeskState): DeskState {
  return cleanDesk(state);
}

export function addUniqueCardToPile(
  state: DeskState,
  pileId: string,
  card: DeskCard,
  cardIndex = Number.POSITIVE_INFINITY,
): DeskState {
  if (card.cardRef === "" || deskContains(state, card.cardRef)) {
    return state;
  }
  const pileIndex = state.piles.findIndex((pile) => pile.id === pileId);
  if (pileIndex < 0) {
    return state;
  }
  const piles = [...state.piles];
  const cards = [...piles[pileIndex]!.cards];
  cards.splice(clampInsertionIndex(cardIndex, cards.length), 0, card);
  piles[pileIndex] = { ...piles[pileIndex]!, cards };
  return cleanDesk({ ...state, piles });
}

export function removeCard(state: DeskState, cardRef: string): DeskState {
  return cleanDesk({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.filter((card) => card.cardRef !== cardRef),
    })),
  });
}

export function moveCardWithinPile(
  state: DeskState,
  pileId: string,
  fromIndex: number,
  toIndex: number,
): DeskState {
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
  cards.splice(clampInsertionIndex(toIndex, cards.length), 0, card);
  const piles = [...state.piles];
  piles[pileIndex] = { ...pile, cards };
  return cleanDesk({ ...state, piles });
}

/** Rotate a pile so its previous or next card becomes the visible top card. */
export function cyclePileTopCard(
  state: DeskState,
  pileId: string,
  direction: -1 | 1,
): DeskState {
  const pileIndex = state.piles.findIndex((pile) => pile.id === pileId);
  const pile = state.piles[pileIndex];
  if (pile === undefined || pile.cards.length < 2) {
    return state;
  }
  const cards = [...pile.cards];
  if (direction === 1) {
    const top = cards.shift();
    if (top !== undefined) {
      cards.push(top);
    }
  } else {
    const previous = cards.pop();
    if (previous !== undefined) {
      cards.unshift(previous);
    }
  }
  const piles = [...state.piles];
  piles[pileIndex] = { ...pile, cards };
  return { ...state, piles };
}

export function moveCardBetweenPiles(
  state: DeskState,
  cardRef: string,
  targetPileId: string,
  targetIndex = Number.POSITIVE_INFINITY,
): DeskState {
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

/**
 * Add or move a filed card to a one-based pile in the current visible order.
 * Invalid ordinals and same-pile requests preserve object identity.
 */
export function placeFiledCardInPileOrdinal(
  state: DeskState,
  cardRef: string,
  ordinal: number,
): DeskState {
  if (!Number.isInteger(ordinal) || ordinal <= 0 || cardRef === "") {
    return state;
  }
  const target = state.piles[ordinal - 1];
  if (target === undefined) {
    return state;
  }
  const source = cardPosition(state, cardRef);
  if (source?.pileId === target.id) {
    return state;
  }
  if (source === null) {
    return addUniqueCardToPile(state, target.id, {
      cardRef,
      kind: "filed",
    });
  }
  const card = state.piles[source.pileIndex]?.cards[source.cardIndex];
  if (card?.kind !== "filed") {
    return state;
  }
  return moveCardBetweenPiles(state, cardRef, target.id);
}

export function splitCardIntoNewPile(
  state: DeskState,
  cardRef: string,
  newPileId: string,
  pileIndex?: number,
): DeskState {
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
  state: DeskState,
  sourcePileId: string,
  targetPileId: string,
): DeskState {
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
  const piles = state.piles.flatMap((pile): DeskPile[] => {
    if (pile.id === sourcePileId) {
      return [];
    }
    if (pile.id === targetPileId) {
      return [{ ...pile, cards: [...pile.cards, ...source.cards] }];
    }
    return [pile];
  });
  return cleanDesk({
    ...state,
    piles,
    expandedPileIds: state.expandedPileIds.map((pileId) =>
      pileId === sourcePileId ? targetPileId : pileId),
    unfiledPileId: state.unfiledPileId === sourcePileId
      ? null
      : state.unfiledPileId,
  });
}

export function reorderPiles(
  state: DeskState,
  fromIndex: number,
  toIndex: number,
): DeskState {
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
  piles.splice(clampInsertionIndex(toIndex, piles.length), 0, pile);
  return cleanDesk({ ...state, piles });
}

export function movePileToOrdinalBoundary(
  state: DeskState,
  pileId: string,
  boundary: "front" | "back",
): DeskState {
  const fromIndex = state.piles.findIndex((pile) => pile.id === pileId);
  if (fromIndex < 0) {
    return state;
  }
  const toIndex = boundary === "front" ? state.piles.length - 1 : 0;
  return fromIndex === toIndex
    ? state
    : reorderPiles(state, fromIndex, toIndex);
}

export function setPilePosition(
  state: DeskState,
  pileId: string,
  position: DeskPilePosition,
): DeskState {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return state;
  }
  const pileIndex = state.piles.findIndex((pile) => pile.id === pileId);
  const pile = state.piles[pileIndex];
  if (pile === undefined) {
    return state;
  }
  const piles = [...state.piles];
  piles[pileIndex] = {
    ...pile,
    position: { x: position.x, y: position.y },
  };
  return { ...state, piles };
}

export function placeFiledCardAtPosition(
  state: DeskState,
  cardRef: string,
  newPileId: string,
  position: DeskPilePosition,
): DeskState {
  if (
    cardRef === "" ||
    deskContains(state, cardRef) ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y)
  ) {
    return state;
  }
  const withPile = createPile(state, newPileId, [{
    cardRef,
    kind: "filed",
  }]);
  return withPile === state
    ? state
    : setPilePosition(withPile, newPileId, position);
}

export function placeUnfiledCardAtPosition(
  state: DeskState,
  cardRef: string,
  newPileId: string,
  position: DeskPilePosition,
): DeskState {
  const withoutCard = removeCard(state, cardRef);
  const withPile = createPile(withoutCard, newPileId, [{
    cardRef,
    kind: "unfiled",
  }]);
  return setPilePosition(withPile, newPileId, position);
}

export function clearFiledCardsFromPile(
  state: DeskState,
  pileId: string,
): DeskState {
  return cleanDesk({
    ...state,
    piles: state.piles.map((pile) => pile.id === pileId
      ? { ...pile, cards: pile.cards.filter((card) => card.kind === "unfiled") }
      : pile),
  });
}

export function clearFiledCardsFromDesk(state: DeskState): DeskState {
  return cleanDesk({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.filter((card) => card.kind === "unfiled"),
    })),
  });
}

export function renameDeskPath(
  state: DeskState,
  oldPath: string,
  newPath: string,
): DeskState {
  const prefix = `${oldPath.replace(/\/$/, "")}/`;
  const seen = new Set<string>();
  return cleanDesk({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.flatMap((card): DeskCard[] => {
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

export function removeDeskPath(state: DeskState, path: string): DeskState {
  const prefix = `${path.replace(/\/$/, "")}/`;
  return cleanDesk({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.filter(
        (card) => card.cardRef !== path && !card.cardRef.startsWith(prefix),
      ),
    })),
  });
}

export function pruneDeskCards(
  state: DeskState,
  eligibleCards: readonly DeskCard[],
): DeskState {
  const eligible = new Map(
    eligibleCards
      .filter((card) => card.cardRef !== "")
      .map((card) => [card.cardRef, card.kind] as const),
  );
  const seen = new Set<string>();
  return cleanDesk({
    ...state,
    piles: state.piles.map((pile) => ({
      ...pile,
      cards: pile.cards.flatMap((card): DeskCard[] => {
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

export function reconcileDesk(
  state: DeskState,
  candidates: readonly DeskCardCandidate[],
  newUnfiledPileId: string,
): DeskState {
  const eligible = uniqueCandidates(candidates);
  let next = pruneDeskCards(state, eligible);
  const present = new Set(allDeskCardRefs(next));
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
    return cleanDesk({ ...next, piles });
  }
  next = createPile(next, newUnfiledPileId, missing);
  return next.piles.some((pile) => pile.id === newUnfiledPileId)
    ? { ...next, unfiledPileId: newUnfiledPileId }
    : next;
}

export function toggleFiledCard(
  state: DeskState,
  card: DeskCard,
  newPileId: string,
): DeskState {
  if (card.kind !== "filed") {
    return state;
  }
  if (deskContains(state, card.cardRef)) {
    return removeCard(state, card.cardRef);
  }
  const activePileId = state.expandedPileIds[state.expandedPileIds.length - 1];
  const expanded = activePileId === undefined
    ? undefined
    : state.piles.find((pile) => pile.id === activePileId);
  return expanded === undefined
    ? createPile(state, newPileId, [card])
    : addUniqueCardToPile(state, expanded.id, card);
}

export function setPileExpanded(
  state: DeskState,
  pileId: string,
  expanded: boolean,
): DeskState {
  if (!state.piles.some((pile) => pile.id === pileId)) {
    return state;
  }
  const withoutPile = state.expandedPileIds.filter((id) => id !== pileId);
  if (!expanded && withoutPile.length === state.expandedPileIds.length) {
    return state;
  }
  return {
    ...state,
    expandedPileIds: expanded ? [...withoutPile, pileId] : withoutPile,
  };
}

export function collapseAllPiles(state: DeskState): DeskState {
  return state.expandedPileIds.length === 0
    ? state
    : { ...state, expandedPileIds: [] };
}

export function deskContains(state: DeskState, cardRef: string): boolean {
  return state.piles.some((pile) =>
    pile.cards.some((card) => card.cardRef === cardRef));
}

export function deskHasFiledCards(state: DeskState): boolean {
  return state.piles.some((pile) =>
    pile.cards.some((card) => card.kind === "filed"));
}

/** Stable pseudo-random offsets keep a pile tactile without flickering on rerender. */
export function deskStackJitter(cardRef: string, depth: number): DeskStackJitter {
  let hash = fnv1a(cardRef);
  hash ^= Math.imul(Math.max(0, Math.trunc(depth)) + 1, -1640531527);
  const unsigned = hash >>> 0;
  return {
    rotationDegrees: ((unsigned % 401) - 200) / 100,
    offsetX: ((unsigned >>> 9) % 9) - 4,
    offsetY: Math.max(0, Math.max(0, Math.trunc(depth)) * 2 + ((unsigned >>> 17) % 3) - 1),
  };
}

export function cardPosition(
  state: DeskState,
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
  const index = itemCentres.findIndex((centre) => point < centre);
  return index < 0 ? itemCentres.length : index;
}

function cleanDesk(state: DeskState): DeskState {
  const piles = state.piles.filter((pile) => pile.cards.length > 0);
  const ids = new Set(piles.map((pile) => pile.id));
  return {
    piles,
    expandedPileIds: state.expandedPileIds.filter(
      (pileId, index, expandedPileIds) =>
        ids.has(pileId) && expandedPileIds.indexOf(pileId) === index,
    ),
    unfiledPileId: state.unfiledPileId !== null && ids.has(state.unfiledPileId)
      ? state.unfiledPileId
      : null,
  };
}

function allDeskCardRefs(state: DeskState): string[] {
  return state.piles.flatMap((pile) => pile.cards.map((card) => card.cardRef));
}

function clampInsertionIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) {
    return index < 0 ? 0 : Math.max(0, length);
  }
  return Math.max(0, Math.min(Math.max(0, length), Math.trunc(index)));
}

function uniqueCandidates(
  candidates: readonly DeskCardCandidate[],
): DeskCardCandidate[] {
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
  left: DeskCardCandidate,
  right: DeskCardCandidate,
): number {
  return right.modifiedTime - left.modifiedTime ||
    left.cardRef.localeCompare(right.cardRef);
}
