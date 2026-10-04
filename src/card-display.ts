export const CLIPPED_CARD_BODY_CLASS = "is-card-scroll-clipped";

/** Automatic backlink chrome exists only for filed cards when enabled. */
export function shouldRenderAutomaticBacklinks(
  enabled: boolean,
  filed: boolean,
): boolean {
  return enabled && filed;
}

/** Apply rendered-card scrolling without affecting the raw textarea editor. */
export function configureRenderedCardBody(
  body: HTMLElement,
  allowScrolling: boolean,
  requestedScrollTop: number,
): number {
  body.classList.toggle(CLIPPED_CARD_BODY_CLASS, !allowScrolling);
  const scrollTop = allowScrolling && Number.isFinite(requestedScrollTop)
    ? Math.max(0, requestedScrollTop)
    : 0;
  body.scrollTop = scrollTop;
  return scrollTop;
}

/** Static card previews show saved task state without offering unsaved toggles. */
export function disableRenderedCardTaskCheckboxes(element: HTMLElement): void {
  if (element.closest(".slipbox-card-scroll, .slipbox-desk-card-preview") === null) {
    return;
  }
  element.querySelectorAll<HTMLInputElement>("input.task-list-item-checkbox")
    .forEach((checkbox) => {
      checkbox.disabled = true;
    });
}
