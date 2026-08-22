export interface DeckMapVisibility {
  readonly deckMapOverride: boolean | null;
}

export const DEFAULT_DECK_MAP_VISIBILITY: DeckMapVisibility = {
  deckMapOverride: null,
};

export function deckMapIsVisible(
  state: DeckMapVisibility,
  showDeckMapSetting: boolean,
  cardCount: number,
): boolean {
  return cardCount > 0 && (state.deckMapOverride ?? showDeckMapSetting);
}

export function toggleDeckMapVisibility(
  state: DeckMapVisibility,
  showDeckMapSetting: boolean,
): DeckMapVisibility {
  return {
    ...state,
    deckMapOverride: !(state.deckMapOverride ?? showDeckMapSetting),
  };
}

export function applyDeckMapVisibility(
  deckMap: HTMLElement | null,
  state: DeckMapVisibility,
  showDeckMapSetting: boolean,
  cardCount: number,
): void {
  if (deckMap !== null) {
    deckMap.hidden = !deckMapIsVisible(state, showDeckMapSetting, cardCount);
  }
}
