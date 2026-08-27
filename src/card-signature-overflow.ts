import { Menu } from "obsidian";

import type { CardSignatureOverflowItem } from "./card-signature.js";

export function showCardSignatureOverflowMenu(
  target: HTMLButtonElement,
  items: readonly CardSignatureOverflowItem[],
): () => void {
  let menu: Menu | null = new Menu().setUseNativeMenu(false);
  for (const candidate of items) {
    menu.addItem((item) => {
      item.setTitle(candidate.title).onClick(candidate.activate);
    });
  }
  menu.onHide(() => {
    menu = null;
  });
  const rect = target.getBoundingClientRect();
  menu.showAtPosition({ x: rect.left, y: rect.bottom, overlap: true });
  return () => {
    const openMenu = menu;
    menu = null;
    openMenu?.hide();
  };
}
