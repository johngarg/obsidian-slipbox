export interface DeckChromeVisibility {
  readonly toolbarOverride: boolean | null;
  readonly deckMapOverride: boolean | null;
}

export const DEFAULT_DECK_CHROME_VISIBILITY: DeckChromeVisibility = {
  toolbarOverride: null,
  deckMapOverride: null,
};

export function toolbarIsVisible(
  state: DeckChromeVisibility,
  showDeckToolbarSetting: boolean,
): boolean {
  return state.toolbarOverride ?? showDeckToolbarSetting;
}

export function deckMapIsVisible(
  state: DeckChromeVisibility,
  showDeckMapSetting: boolean,
  cardCount: number,
): boolean {
  return cardCount > 0 && (state.deckMapOverride ?? showDeckMapSetting);
}

export function toggleToolbarVisibility(
  state: DeckChromeVisibility,
  showDeckToolbarSetting: boolean,
): DeckChromeVisibility {
  return {
    ...state,
    toolbarOverride: !(state.toolbarOverride ?? showDeckToolbarSetting),
  };
}

export function toggleDeckMapVisibility(
  state: DeckChromeVisibility,
  showDeckMapSetting: boolean,
): DeckChromeVisibility {
  return {
    ...state,
    deckMapOverride: !(state.deckMapOverride ?? showDeckMapSetting),
  };
}

export function applyDeckChromeVisibility(
  toolbar: HTMLElement | null,
  deckMap: HTMLElement | null,
  state: DeckChromeVisibility,
  showDeckToolbarSetting: boolean,
  showDeckMapSetting: boolean,
  cardCount: number,
): void {
  if (toolbar !== null) {
    toolbar.hidden = !toolbarIsVisible(state, showDeckToolbarSetting);
  }
  if (deckMap !== null) {
    deckMap.hidden = !deckMapIsVisible(state, showDeckMapSetting, cardCount);
  }
}
