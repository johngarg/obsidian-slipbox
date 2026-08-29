interface LocalBranchDomWindow extends Window {
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
  ): HTMLElementTagNameMap[K];
  createDiv(): HTMLDivElement;
  createSvg<K extends keyof SVGElementTagNameMap>(
    tag: K,
  ): SVGElementTagNameMap[K];
}

/** Use Obsidian's DOM factories in the document that owns the Deck view. */
export function localBranchDomWindow(
  document: Document,
): LocalBranchDomWindow {
  return document.win as LocalBranchDomWindow;
}
