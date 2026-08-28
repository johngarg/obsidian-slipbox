export const CARD_COLOR_PROPERTY = "slipbox-card-color";

export const CARD_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "pink",
] as const;

export type CardColor = typeof CARD_COLORS[number];

const CARD_COLOR_VALUES = new Set<string>(CARD_COLORS);

/** Accept only the fixed lowercase palette stored by Slipbox. */
export function parseCardColor(value: unknown): CardColor | null {
  return typeof value === "string" && CARD_COLOR_VALUES.has(value)
    ? value as CardColor
    : null;
}

/** Keep card identity in the DOM while leaving all visual decisions to CSS. */
export function applyCardColor(
  element: HTMLElement,
  color: CardColor | null,
): void {
  if (color === null) {
    delete element.dataset.slipboxCardColor;
    return;
  }
  element.dataset.slipboxCardColor = color;
}
