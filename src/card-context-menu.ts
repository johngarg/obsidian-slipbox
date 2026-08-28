import {
  Menu,
  type App,
  type TFile,
  type WorkspaceLeaf,
} from "obsidian";

import {
  applicableCardHeaderActions,
  type CardHeaderActionContext,
} from "./card-header-actions.js";
import type { SlipboxAction } from "./settings.js";

export interface CardContextMenuOptions {
  readonly app: App;
  readonly event: MouseEvent;
  readonly file: TFile;
  readonly address: string | null;
  readonly surface: CardHeaderActionContext["surface"];
  readonly viewedReturnSurface?: CardHeaderActionContext["viewedReturnSurface"];
  readonly source: string;
  readonly leaf: WorkspaceLeaf;
  readonly title: string;
  readonly bookmarked: boolean;
  readonly onDesk: boolean;
  run(action: SlipboxAction): void;
}

export interface CardContextMenuItemOptions {
  readonly menu: Menu;
  readonly title: string;
  readonly surface: CardHeaderActionContext["surface"];
  readonly viewedReturnSurface?: CardHeaderActionContext["viewedReturnSurface"];
  readonly filed: boolean;
  readonly bookmarked: boolean;
  readonly onDesk: boolean;
  readonly canMoveLeft?: boolean;
  readonly canMoveRight?: boolean;
  readonly sectioned?: boolean;
  run(action: SlipboxAction): void;
}

export function addCardContextMenuItems(
  options: CardContextMenuItemOptions,
): void {
  for (const presentation of applicableCardHeaderActions({
    surface: options.surface,
    viewedReturnSurface: options.viewedReturnSurface ?? null,
    filed: options.filed,
    onDesk: options.onDesk,
    bookmarked: options.bookmarked,
    canMoveLeft: options.canMoveLeft ?? false,
    canMoveRight: options.canMoveRight ?? false,
  })) {
    options.menu.addItem((item) => {
      item
        .setTitle(presentation.action === "delete-card"
          ? `Delete ${options.title}`
          : presentation.label)
        .setIcon(presentation.icon)
        .setWarning(presentation.warning === true);
      if (options.sectioned === true) {
        item.setSection(presentation.warning === true
          ? "slipbox-card-danger"
          : "slipbox-card");
      }
      item.onClick(() => options.run(presentation.action));
    });
  }
}

/** Present the shared card menu without depending on the plugin lifecycle. */
export function showCardContextMenu(options: CardContextMenuOptions): void {
  const { event } = options;
  event.preventDefault();
  event.stopPropagation();

  const menu = Menu.forEvent(event);
  addCardContextMenuItems({
    menu,
    title: options.title,
    surface: options.surface,
    ...(options.viewedReturnSurface === undefined
      ? {}
      : { viewedReturnSurface: options.viewedReturnSurface }),
    filed: options.address !== null,
    onDesk: options.onDesk,
    bookmarked: options.bookmarked,
    sectioned: true,
    run: (action) => options.run(action),
  });

  // Preserve Obsidian's canonical file actions and third-party contributions.
  options.app.workspace.trigger(
    "file-menu",
    menu,
    options.file,
    options.source,
    options.leaf,
  );
  menu.showAtMouseEvent(event);
}
