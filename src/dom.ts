const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function createHtmlElement<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K): HTMLElementTagNameMap[K] {
  return document.createElementNS(HTML_NAMESPACE, tag) as HTMLElementTagNameMap[K];
}

export function createSvgElement<K extends keyof SVGElementTagNameMap>(document: Document, tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NAMESPACE, tag);
}

export function getResizeObserver(ownerWindow: Window | null): typeof ResizeObserver | null {
  const candidate: unknown = ownerWindow === null ? undefined : Reflect.get(ownerWindow, "ResizeObserver");
  return typeof candidate === "function" ? candidate as typeof ResizeObserver : null;
}

export function findDeskCard(root: HTMLElement | null, path: string): HTMLElement | null {
  if (root === null) return null;
  return root.querySelector<HTMLElement>(
    '.slipbox-desk-card[data-card-ref="' + (root.win as Window & { CSS: typeof CSS; }).CSS.escape(path) + '"]',
  );
}
