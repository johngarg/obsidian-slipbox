const MINIMUM_INSET = 36;
const STATUS_BAR_GAP = 12;
const MINIMUM_RAIL_HEIGHT = 48;

type Bounds = Pick<DOMRectReadOnly, "top" | "right" | "bottom" | "left" | "height">;

/** Equal end margins keep the map centred while clearing an overlapping status bar. */
export function verticalDeckMapInset(
  pane: Bounds,
  map: Pick<Bounds, "left" | "right">,
  statusBar: Bounds | null,
): number {
  const overlaps = statusBar !== null && statusBar.height > 0 &&
    statusBar.left < map.right && statusBar.right > map.left &&
    statusBar.top < pane.bottom && statusBar.bottom > pane.top;
  const clearance = overlaps ? pane.bottom - statusBar.top + STATUS_BAR_GAP : 0;
  const maximumInset = Math.max(0, (pane.height - MINIMUM_RAIL_HEIGHT) / 2);
  return Math.min(maximumInset, Math.max(MINIMUM_INSET, clearance));
}
