export interface ViewedCardState {
  readonly path: string;
  readonly x: number;
  readonly y: number;
  readonly scrollTop: number;
}

export interface ViewedCardBounds {
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly margin?: number;
}

export function createViewedCardState(path: string): ViewedCardState {
  return { path, x: 0, y: 0, scrollTop: 0 };
}

export function moveViewedCardState(
  state: ViewedCardState,
  x: number,
  y: number,
  bounds: ViewedCardBounds,
): ViewedCardState {
  const margin = Math.max(0, bounds.margin ?? 16);
  const maxX = Math.max(
    0,
    (Math.max(0, bounds.stageWidth) - Math.max(0, bounds.cardWidth)) / 2 - margin,
  );
  const maxY = Math.max(
    0,
    (Math.max(0, bounds.stageHeight) - Math.max(0, bounds.cardHeight)) / 2 - margin,
  );
  return {
    ...state,
    x: clamp(x, -maxX, maxX),
    y: clamp(y, -maxY, maxY),
  };
}

export function scrollViewedCardState(
  state: ViewedCardState,
  scrollTop: number,
): ViewedCardState {
  return { ...state, scrollTop: Math.max(0, scrollTop) };
}

export function renameViewedCardState(
  state: ViewedCardState,
  path: string,
): ViewedCardState {
  return path === state.path ? state : { ...state, path };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
