import type {
  CardButtonSurface,
  CardHeaderButtonAction,
  CardHeaderButtonSettings,
  SlipboxAction,
} from "./settings.js";

export interface CardHeaderActionContext {
  readonly surface: CardButtonSurface;
  readonly viewedReturnSurface: "deck" | "desk" | null;
  readonly filed: boolean;
  readonly onDesk: boolean;
  readonly bookmarked: boolean;
  readonly canMoveLeft: boolean;
  readonly canMoveRight: boolean;
}

export interface CardHeaderActionPresentation {
  readonly action: CardHeaderButtonAction;
  readonly icon: string;
  readonly label: string;
  readonly pressed?: boolean;
  readonly warning?: boolean;
}

export interface CardHeaderButtonDefinition {
  readonly action: CardHeaderButtonAction;
  readonly settingLabel: string;
  readonly surfaces: readonly CardButtonSurface[];
}

export const CARD_BUTTON_DEFINITIONS: readonly CardHeaderButtonDefinition[] = [
  { action: "edit-card", settingLabel: "Edit card", surfaces: ["deck", "desk", "viewed"] },
  { action: "open-note", settingLabel: "Open Markdown note", surfaces: ["deck", "desk", "viewed"] },
  { action: "toggle-viewed-card", settingLabel: "View or return card to its source", surfaces: ["desk", "viewed"] },
  { action: "show-card-in-deck", settingLabel: "Show card in Deck", surfaces: ["desk", "viewed"] },
  { action: "toggle-tray", settingLabel: "Put on or return from Desk", surfaces: ["deck", "desk", "viewed"] },
  { action: "file-card", settingLabel: "File card", surfaces: ["desk", "viewed"] },
  { action: "copy-link", settingLabel: "Copy card link", surfaces: ["deck", "desk", "viewed"] },
  { action: "toggle-bookmark", settingLabel: "Toggle bookmark", surfaces: ["deck"] },
  { action: "move-desk-card-left", settingLabel: "Move card left within pile", surfaces: ["desk"] },
  { action: "move-desk-card-right", settingLabel: "Move card right within pile", surfaces: ["desk"] },
  { action: "delete-card", settingLabel: "Delete card", surfaces: ["deck", "desk", "viewed"] },
];

export const CARD_BUTTON_ORDER: Readonly<Record<
  CardButtonSurface,
  readonly CardHeaderButtonAction[]
>> = {
  deck: [
    "edit-card",
    "open-note",
    "toggle-tray",
    "copy-link",
    "toggle-bookmark",
    "delete-card",
  ],
  desk: [
    "toggle-viewed-card",
    "edit-card",
    "open-note",
    "show-card-in-deck",
    "file-card",
    "toggle-tray",
    "copy-link",
    "move-desk-card-left",
    "move-desk-card-right",
    "delete-card",
  ],
  viewed: [
    "edit-card",
    "open-note",
    "show-card-in-deck",
    "file-card",
    "toggle-viewed-card",
    "toggle-tray",
    "copy-link",
    "delete-card",
  ],
};

const definitionByAction = new Map(
  CARD_BUTTON_DEFINITIONS.map((definition) => [definition.action, definition]),
);

export function cardHeaderButtonDefinitionsForSurface(
  surface: CardButtonSurface,
): readonly CardHeaderButtonDefinition[] {
  return CARD_BUTTON_ORDER[surface].flatMap((action) => {
    const definition = definitionByAction.get(action);
    return definition === undefined ? [] : [definition];
  });
}

export function cardHeaderActionPresentation(
  action: SlipboxAction,
  context: CardHeaderActionContext,
): CardHeaderActionPresentation | null {
  const definition = definitionByAction.get(action as CardHeaderButtonAction);
  if (
    definition === undefined ||
    !definition.surfaces.includes(context.surface)
  ) {
    return null;
  }

  switch (definition.action) {
    case "edit-card":
      return {
        action: definition.action,
        icon: "file-pen-line",
        label: context.surface === "deck" ||
            (context.surface === "viewed" && context.viewedReturnSurface === "deck")
          ? "Edit on Desk"
          : "Edit card",
      };
    case "open-note":
      return { action: definition.action, icon: "file-text", label: "Open Markdown note" };
    case "toggle-viewed-card":
      return context.surface === "viewed"
        ? {
            action: definition.action,
            icon: "minimize-2",
            label: context.viewedReturnSurface === "deck"
              ? "Return to Deck"
              : "Return to Desk",
          }
        : { action: definition.action, icon: "maximize-2", label: "View" };
    case "show-card-in-deck":
      return context.filed && context.surface !== "deck"
        ? { action: definition.action, icon: "locate-fixed", label: "Show in Deck" }
        : null;
    case "toggle-tray":
      if (!context.filed) {
        return null;
      }
      return context.onDesk
        ? {
            action: definition.action,
            icon: "undo-2",
            label: "Return from Desk",
            pressed: true,
          }
        : {
            action: definition.action,
            icon: "bring-to-front",
            label: "Put on Desk",
            pressed: false,
          };
    case "file-card":
      return !context.filed && context.surface !== "deck"
        ? { action: definition.action, icon: "archive-restore", label: "File card" }
        : null;
    case "copy-link":
      return context.filed
        ? { action: definition.action, icon: "copy", label: "Copy card link" }
        : null;
    case "toggle-bookmark":
      return context.filed
        ? {
            action: definition.action,
            icon: "bookmark",
            label: context.bookmarked ? "Remove bookmark" : "Add bookmark",
            pressed: context.bookmarked,
          }
        : null;
    case "move-desk-card-left":
      return context.surface === "desk" && context.canMoveLeft
        ? { action: definition.action, icon: "arrow-left", label: "Move left within pile" }
        : null;
    case "move-desk-card-right":
      return context.surface === "desk" && context.canMoveRight
        ? { action: definition.action, icon: "arrow-right", label: "Move right within pile" }
        : null;
    case "delete-card":
      return { action: definition.action, icon: "trash-2", label: "Delete card", warning: true };
  }
}

export function applicableCardHeaderActions(
  context: CardHeaderActionContext,
): readonly CardHeaderActionPresentation[] {
  return CARD_BUTTON_ORDER[context.surface].flatMap((action) => {
    const presentation = cardHeaderActionPresentation(action, context);
    return presentation === null ? [] : [presentation];
  });
}

export function enabledCardHeaderActions(
  settings: CardHeaderButtonSettings,
  context: CardHeaderActionContext,
): readonly CardHeaderActionPresentation[] {
  return applicableCardHeaderActions(context).filter(
    ({ action }) => settings[context.surface][action],
  );
}

export function cardHeaderVisibleActionCount(
  buttonWidths: readonly number[],
  moreButtonWidth: number,
  gap: number,
  availableWidth: number,
): number {
  const normalizedWidths = buttonWidths.map((width) => Math.max(0, width));
  const normalizedGap = Math.max(0, gap);
  const available = Math.max(0, availableWidth);
  const total = normalizedWidths.reduce((sum, width) => sum + width, 0) +
    normalizedGap * Math.max(0, normalizedWidths.length - 1);
  if (total <= available) {
    return normalizedWidths.length;
  }
  const moreWidth = Math.max(0, moreButtonWidth);
  let used = 0;
  let visibleCount = 0;
  for (const width of normalizedWidths) {
    const next = used + (visibleCount > 0 ? normalizedGap : 0) + width;
    if (next + normalizedGap + moreWidth > available) {
      break;
    }
    used = next;
    visibleCount += 1;
  }
  return visibleCount;
}
