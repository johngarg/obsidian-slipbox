import {
  App,
  Notice,
  Platform,
  PluginSettingTab,
  Setting,
  TFolder,
  type SettingDefinition,
  type SettingDefinitionItem,
  type Plugin,
} from "obsidian";

import { cardHeaderButtonDefinitionsForSurface } from "./card-header-actions.js";
import { setTextSettingValidity } from "./setting-validation.js";
import {
  SLIPBOX_ACTION_DEFINITIONS,
  DEFAULT_DECK_KEYBINDINGS,
  DEFAULT_SETTINGS,
  MAX_CARD_SPREAD,
  MIN_CARD_SPREAD,
  formatKeyBinding,
  keyBindingFromKeyboardEvent,
  keyBindingConflict,
  keyBindingSignature,
  metadataPropertyError,
  normalizeCardSize,
  type CardButtonSurface,
  type SlipboxActionDefinition,
  type DeckKeyBinding,
  type SlipboxSettings,
} from "./settings.js";

export interface SettingsHost {
  readonly settings: SlipboxSettings;
  setCardSpread(value: number): void;
  updateSettings(settings: SlipboxSettings): Promise<void>;
}

export class SlipboxSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly slipbox: SettingsHost,
  ) {
    super(app, plugin);
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: "Cards and metadata",
        items: [
          this.definition(
            "Address property",
            "Exact top-level YAML key used to identify and order cards. Changing it re-indexes immediately but does not rewrite existing notes.",
            (setting) => this.renderAddressProperty(setting),
          ),
          this.definition(
            "Deck ordering",
            "Controls how manually assigned addresses are arranged in the Deck. Changing this setting reorders cards but does not edit Markdown files.",
            (setting) => this.renderDeckOrdering(setting),
          ),
          this.definition(
            "Duplicate addresses",
            "Two cards may share an address. Allowed keeps them silent; Report as a problem lists them as warnings, counts them in the status bar, and refuses to file onto an occupied address. Neither setting rewrites existing notes.",
            (setting) => this.renderDuplicateAddresses(setting),
          ),
          this.definition(
            "Title source",
            "Choose the filename or a top-level frontmatter property for card titles. New card with options writes the entered title to the selected location; New card uses a timestamp filename and leaves a frontmatter title empty.",
            (setting) => this.renderTitleSource(setting),
          ),
          this.definition(
            "Title property",
            "Exact top-level YAML key. It must differ from the address property. Missing, blank, or non-text values leave the card title empty.",
            (setting) => this.renderTitleProperty(setting),
          ),
          this.definition(
            "Show title in Slipbox Desk card headers",
            "Show resolved titles beside addresses in Deck and Desk card headers.",
            (setting) => this.renderShowTitle(setting),
          ),
          this.definition(
            "Show tooltips",
            "Show descriptive tooltips throughout the Slipbox view when controls are hovered or receive keyboard focus. Accessible labels remain available.",
            (setting) => this.renderShowTooltips(setting),
          ),
          this.definition(
            "Show Deck map",
            "Show a clickable overview sampled from the filed sequence, with exact anchor and bookmark positions.",
            (setting) => this.renderShowDeckMap(setting),
          ),
          this.definition(
            "Card spread",
            "Set the visual separation between neighbouring Deck cards.",
            (setting) => this.renderCardSpread(setting),
          ),
        ],
      },
      {
        type: "group",
        heading: "Explicit branching",
        items: [
          this.definition(
            "Recognise explicit branch links",
            "Treat internal links with an explicitly displayed + alias, such as [[card|+a]], as branch assertions.",
            (setting) => this.renderExplicitBranchLinks(setting),
          ),
          this.definition(
            "Outline branch links in cards",
            "Draw a quiet outline around marked aliases in rendered Slipbox cards. This indicates branch syntax; ordinary Markdown views are unaffected.",
            (setting) => this.renderOutlineBranchLinks(setting),
          ),
          this.definition(
            "Hide branch-link markers in cards",
            "Hide the + prefix on explicit aliases in rendered Slipbox cards. Link targets and ordinary Markdown views are unaffected.",
            (setting) => this.renderHideBranchLinkMarkers(setting),
          ),
          this.definition(
            "Show branch labels",
            "Show incoming explicit branch labels beside card addresses. Clicked labels return the Deck anchor to the source card.",
            (setting) => this.renderShowBranchLabels(setting),
          ),
        ],
      },
      {
        type: "group",
        heading: "Inferred branching",
        items: [
          this.definition(
            "Infer branches from addresses",
            "Derive an inferred hierarchy from address extension and make structural navigation commands available.",
            (setting) => this.renderInferAddressBranches(setting),
          ),
        ],
      },
      {
        type: "group",
        heading: "Branch View",
        items: [
          this.definition(
            "Show local Branch View",
            "Show archive-style local branch navigation beneath the active Deck card using whichever inferred and explicit relationships are enabled.",
            (setting) => this.renderShowLocalBranchView(setting),
          ),
        ],
      },
      {
        type: "group",
        heading: "Card sizes",
        items: [
          this.definition(
            "Main card size",
            "Maximum Deck-card width: small 720 px, medium 840 px, or large 960 px.",
            (setting) => this.renderMainCardSize(setting),
          ),
          this.definition(
            "Desk card size",
            "Maximum working-pile card width: small 280 px, medium 360 px, or large 440 px. Desk cards remain smaller than main cards.",
            (setting) => this.renderDeskCardSize(setting),
          ),
        ],
      },
      {
        type: "group",
        heading: "Paper workflow",
        items: [
          this.definition(
            "Restrict pasting in viewed cards",
            "In the Slipbox Desk viewed-card editor, allow paste for only one word or one complete Wiki or Markdown link or embed. Ordinary Markdown views are unaffected.",
            (setting) => this.renderRestrictViewedCardPaste(setting),
          ),
          this.definition(
            "Preview links on hover",
            "Show Obsidian Page Preview popovers for links and backlinks inside Slipbox Desk cards.",
            (setting) => this.renderPreviewLinksOnHover(setting),
          ),
          this.definition(
            "Follow links from cards",
            "Allow links, backlinks, and explicit branch labels inside Slipbox Desk cards to navigate. Explicit Open note actions remain available.",
            (setting) => this.renderFollowLinksFromCards(setting),
          ),
          this.definition(
            "Protect text present when editing begins",
            "Prevent a filed card’s existing body text from being deleted, replaced, or reordered during a viewed-card editing session. Text added during that session remains editable. Ordinary Markdown views are unaffected.",
            (setting) => this.renderProtectFiledCardText(setting),
          ),
          this.definition(
            "Show automatic backlinks",
            "Reserve a footer on filed Deck and viewed cards for backlinks from Obsidian’s link graph. Turn off to remove the footer entirely; links written in card bodies are unaffected.",
            (setting) => this.renderShowAutomaticBacklinks(setting),
          ),
          this.definition(
            "Allow scrolling in cards",
            "Allow rendered Deck and viewed cards to scroll when their content does not fit. Turn off to show each card from the top and clip content beyond its bottom edge. Desk cards already clip; the viewed-card editor and ordinary Markdown views remain scrollable.",
            (setting) => this.renderAllowCardScrolling(setting),
          ),
        ],
      },
      {
        type: "group",
        heading: "New cards",
        items: [
          this.definition(
            "New card folder",
            "Optional vault-folder override for notes created through Slipbox Desk. Leave empty to follow Obsidian’s own default location for new notes.",
            (setting) => this.renderNewCardFolder(setting),
          ),
          this.definition(
            "Timestamp filename format",
            "Moment format used when the title is blank, or whenever titles come from frontmatter. Filename-unsafe characters become hyphens. Example: ",
            (setting) => this.renderTimestampFormat(setting),
          ),
        ],
      },
      {
        type: "group",
        heading: "Card header buttons",
        items: [
          {
            name: "Card header button visibility",
            desc: "Choose which actions appear in Deck, Desk, and viewed-card headers. Buttons that do not fit move into more card actions. Hidden actions remain available through commands, Slipbox Desk shortcuts, and context menus.",
            render: (setting) => this.renderCardHeaderIntro(setting),
          },
          ...this.cardHeaderButtonDefinitions("deck", "Deck cards"),
          ...this.cardHeaderButtonDefinitions("desk", "Desk cards"),
          ...this.cardHeaderButtonDefinitions("viewed", "Viewed cards"),
        ],
      },
      {
        type: "group",
        heading: "Keyboard shortcuts",
        items: [
          {
            name: "Slipbox Desk shortcut controls",
            desc: "Configure shortcuts scoped to Slipbox Desk. Obsidian hotkeys take priority; Slipbox Desk warns and yields when a key is already handled there.",
            render: (setting) => this.renderShortcutIntro(setting),
          },
          ...SLIPBOX_ACTION_DEFINITIONS.map((definition) => ({
            name: definition.label,
            ...(definition.description === undefined
              ? {}
              : { desc: definition.description }),
            render: (setting: Setting) =>
              this.renderShortcutSetting(setting, definition),
          })),
        ],
      },
    ];
  }

  private definition(
    name: string,
    desc: string,
    render: (setting: Setting) => void,
  ): SettingDefinition {
    return { name, desc, render };
  }

  private renderTitleSource(setting: Setting): void {
    setting.addDropdown((dropdown) => {
      dropdown
        .addOption("filename", "Filename")
        .addOption("frontmatter", "Frontmatter property")
        .setValue(this.slipbox.settings.titleSource)
        .onChange((value) => {
          if (
            value === "frontmatter" &&
            this.slipbox.settings.titleProperty ===
              this.slipbox.settings.addressProperty
          ) {
            dropdown.setValue("filename");
            new Notice(
              "The title property must be different from the address property.",
            );
            return;
          }
          void this.save({
            ...this.slipbox.settings,
            titleSource: value === "frontmatter" ? "frontmatter" : "filename",
          }).then(() => this.updatePreservingScroll());
        });
    });
  }

  private renderExplicitBranchLinks(setting: Setting): void {
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.explicitBranchLinks)
        .onChange((explicitBranchLinks) => void this.save({
          ...this.slipbox.settings,
          explicitBranchLinks,
        }).then(() => this.updatePreservingScroll()));
    });
  }

  private renderShowBranchLabels(setting: Setting): void {
    const disabled = !this.slipbox.settings.explicitBranchLinks;
    setting.setDisabled(disabled);
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.showBranchLabels)
        .setDisabled(disabled)
        .onChange((showBranchLabels) => void this.save({
          ...this.slipbox.settings,
          showBranchLabels,
        }));
    });
  }

  private renderOutlineBranchLinks(setting: Setting): void {
    const disabled = !this.slipbox.settings.explicitBranchLinks;
    setting.setDisabled(disabled);
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.outlineBranchLinks)
        .setDisabled(disabled)
        .onChange((outlineBranchLinks) => void this.save({
          ...this.slipbox.settings,
          outlineBranchLinks,
        }));
    });
  }

  private renderHideBranchLinkMarkers(setting: Setting): void {
    const disabled = !this.slipbox.settings.explicitBranchLinks;
    setting.setDisabled(disabled);
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.hideBranchLinkMarkers)
        .setDisabled(disabled)
        .onChange((hideBranchLinkMarkers) => void this.save({
          ...this.slipbox.settings,
          hideBranchLinkMarkers,
        }));
    });
  }

  private renderInferAddressBranches(setting: Setting): void {
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.inferAddressBranches)
        .onChange((inferAddressBranches) => void this.save({
          ...this.slipbox.settings,
          inferAddressBranches,
        }).then(() => this.updatePreservingScroll()));
    });
  }

  private renderShowLocalBranchView(setting: Setting): void {
    const disabled =
      !this.slipbox.settings.inferAddressBranches &&
      !this.slipbox.settings.explicitBranchLinks;
    setting.setDisabled(disabled);
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.showLocalBranchView)
        .setDisabled(disabled)
        .onChange((showLocalBranchView) => void this.save({
          ...this.slipbox.settings,
          showLocalBranchView,
        }));
    });
  }

  private renderTitleProperty(setting: Setting): void {
    setting.setDisabled(this.slipbox.settings.titleSource !== "frontmatter");
    setting.addText((text) => {
      let property = this.slipbox.settings.titleProperty;
      const queueCommit = this.debounceTextCommit(text.inputEl, () => {
        if (
          property !== "" &&
          property !== this.slipbox.settings.addressProperty &&
          property !== this.slipbox.settings.titleProperty
        ) {
          void this.save({
            ...this.slipbox.settings,
            titleProperty: property,
          });
        }
      });
      text
        .setValue(this.slipbox.settings.titleProperty)
        .setDisabled(this.slipbox.settings.titleSource !== "frontmatter")
        .onChange((value) => {
          property = value.trim();
          this.setMetadataPropertyValidity(
            setting,
            property,
            this.slipbox.settings.addressProperty,
          );
          queueCommit();
        });
    });
  }

  private renderDuplicateAddresses(setting: Setting): void {
    setting.addDropdown((dropdown) => {
      dropdown
        .addOption("allowed", "Allowed")
        .addOption("problem", "Report as a problem")
        .setValue(this.slipbox.settings.duplicateAddresses)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          duplicateAddresses: value === "problem" ? "problem" : "allowed",
        }));
    });
  }

  private renderShowTitle(setting: Setting): void {
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.showTitleInDeck)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          showTitleInDeck: value,
        }));
    });
  }

  private renderShowTooltips(setting: Setting): void {
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.showTooltips)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          showTooltips: value,
        }));
    });
  }

  private renderShowDeckMap(setting: Setting): void {
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.showDeckMap)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          showDeckMap: value,
        }));
    });
  }

  private renderRestrictViewedCardPaste(setting: Setting): void {
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.restrictViewedCardPaste)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          restrictViewedCardPaste: value,
        }));
    });
  }

  private renderPreviewLinksOnHover(setting: Setting): void {
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.previewLinksOnHover)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          previewLinksOnHover: value,
        }));
    });
  }

  private renderFollowLinksFromCards(setting: Setting): void {
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.followLinksFromCards)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          followLinksFromCards: value,
        }));
    });
  }

  private renderProtectFiledCardText(setting: Setting): void {
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.protectFiledCardText)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          protectFiledCardText: value,
        }));
    });
  }

  private renderShowAutomaticBacklinks(setting: Setting): void {
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.showAutomaticBacklinks)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          showAutomaticBacklinks: value,
        }));
    });
  }

  private renderAllowCardScrolling(setting: Setting): void {
    setting.addToggle((toggle) => {
      toggle
        .setValue(this.slipbox.settings.allowCardScrolling)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          allowCardScrolling: value,
        }));
    });
  }

  private renderCardSpread(setting: Setting): void {
    setting.addSlider((slider) => {
      slider
        .setLimits(MIN_CARD_SPREAD, MAX_CARD_SPREAD, 0.01)
        .setValue(this.slipbox.settings.cardSpread)
        .onChange((value) => this.slipbox.setCardSpread(value));
    });
  }

  private renderMainCardSize(setting: Setting): void {
    setting.addDropdown((dropdown) => {
      dropdown
        .addOption("small", "Small")
        .addOption("medium", "Medium")
        .addOption("large", "Large")
        .setValue(this.slipbox.settings.mainCardSize)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          mainCardSize: normalizeCardSize(value),
        }));
    });
  }

  private renderDeskCardSize(setting: Setting): void {
    setting.addDropdown((dropdown) => {
      dropdown
        .addOption("small", "Small")
        .addOption("medium", "Medium")
        .addOption("large", "Large")
        .setValue(this.slipbox.settings.deskCardSize)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          deskCardSize: normalizeCardSize(value),
        }));
    });
  }

  private renderNewCardFolder(setting: Setting): void {
    setting.addDropdown((dropdown) => {
      dropdown.addOption("", "Obsidian’s default location");
      const folders = this.app.vault
        .getAllLoadedFiles()
        .filter(
          (file): file is TFolder =>
            file instanceof TFolder && !file.isRoot(),
        )
        .sort((left, right) => left.path.localeCompare(right.path));
      for (const folder of folders) {
        dropdown.addOption(folder.path, folder.path);
      }
      const current = this.slipbox.settings.newCardFolder;
      if (
        current !== "" &&
        !folders.some((folder) => folder.path === current)
      ) {
        dropdown.addOption(current, `${current} (missing)`);
      }
      dropdown
        .setValue(current)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          newCardFolder: value,
        }));
    });
  }

  private renderTimestampFormat(setting: Setting): void {
    const sample = setting.descEl.createEl("code");
    setting.addMomentFormat((component) => {
      let format = this.slipbox.settings.newNoteTimestampFormat;
      const queueCommit = this.debounceTextCommit(component.inputEl, () => {
        if (
          format !== "" &&
          format !== this.slipbox.settings.newNoteTimestampFormat
        ) {
          void this.save({
            ...this.slipbox.settings,
            newNoteTimestampFormat: format,
          });
        }
      });
      component
        .setSampleEl(sample)
        .setDefaultFormat(DEFAULT_SETTINGS.newNoteTimestampFormat)
        .setValue(this.slipbox.settings.newNoteTimestampFormat)
        .onChange((value) => {
          format = value.trim();
          this.setTextValidity(
            setting,
            format !== "",
            "A non-empty timestamp format is required.",
          );
          queueCommit();
        });
    });
  }

  private renderAddressProperty(setting: Setting): void {
    setting.addText((text) => {
      let property = this.slipbox.settings.addressProperty;
      const queueCommit = this.debounceTextCommit(text.inputEl, () => {
        if (
          property !== "" &&
          !(
            this.slipbox.settings.titleSource === "frontmatter" &&
            property === this.slipbox.settings.titleProperty
          ) &&
          property !== this.slipbox.settings.addressProperty
        ) {
          void this.save({
            ...this.slipbox.settings,
            addressProperty: property,
          });
        }
      });
      text
        .setPlaceholder(DEFAULT_SETTINGS.addressProperty)
        .setValue(this.slipbox.settings.addressProperty)
        .onChange((value) => {
          property = value.trim();
          this.setMetadataPropertyValidity(
            setting,
            property,
            this.slipbox.settings.titleSource === "frontmatter"
              ? this.slipbox.settings.titleProperty
              : null,
          );
          queueCommit();
        });
    });
  }

  private renderDeckOrdering(setting: Setting): void {
    setting.addDropdown((dropdown) => {
      dropdown
        .addOption("natural", "Natural")
        .addOption("lexicographic", "Lexicographic")
        .setValue(this.slipbox.settings.deckOrdering)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          deckOrdering: value === "lexicographic"
            ? "lexicographic"
            : "natural",
        }));
    });
  }

  private renderCardHeaderIntro(setting: Setting): void {
    setting.settingEl.empty();
    setting.settingEl.createEl("p", {
      cls: "setting-item-description",
      text: "Choose which actions appear in Deck, Desk, and viewed-card headers. Buttons that do not fit move into more card actions. Hidden actions remain available through commands, Slipbox Desk shortcuts, and context menus.",
    });
  }

  private cardHeaderButtonDefinitions(
    surface: CardButtonSurface,
    heading: string,
  ): SettingDefinition[] {
    return [
      {
        name: heading,
        render: (setting) => setting.setHeading(),
      },
      ...cardHeaderButtonDefinitionsForSurface(surface).map((definition) => ({
        name: definition.settingLabel,
        render: (setting: Setting) => {
          setting.addToggle((toggle) => {
            toggle
              .setValue(
                this.slipbox.settings.cardHeaderButtons[surface][definition.action],
              )
              .onChange((value) => void this.save({
                ...this.slipbox.settings,
                cardHeaderButtons: {
                  ...this.slipbox.settings.cardHeaderButtons,
                  [surface]: {
                    ...this.slipbox.settings.cardHeaderButtons[surface],
                    [definition.action]: value,
                  },
                },
              }));
          });
        },
      })),
    ];
  }

  private renderShortcutIntro(setting: Setting): void {
    setting.settingEl.empty();
    const shortcutIntro = setting.settingEl.createDiv({
      cls: "slipbox-shortcut-intro",
    });
    shortcutIntro.createEl("p", {
      cls: "setting-item-description",
      text: "These shortcuts apply only while Slipbox Desk is active and never fire in text or form controls. Obsidian hotkeys have priority: when one handles the same key, Slipbox Desk leaves it alone and shows a conflict warning. Slipbox Desk actions are also available as unassigned commands in Obsidian’s hotkeys settings.",
    });
    const resetAll = shortcutIntro.createEl("button", {
      text: "Reset all shortcuts",
      attr: { type: "button" },
    });
    resetAll.addEventListener("click", () => {
      void this.save({
        ...this.slipbox.settings,
        deckKeybindings: DEFAULT_DECK_KEYBINDINGS,
      }).then(() => this.updatePreservingScroll());
    });
  }

  private renderShortcutSetting(
    setting: Setting,
    definition: SlipboxActionDefinition,
  ): void {
    const { id: action, label } = definition;
    setting.settingEl.addClass("slipbox-shortcut-setting");
    const bindings = setting.controlEl.createDiv({ cls: "slipbox-shortcut-bindings" });
    for (const bindingValue of this.slipbox.settings.deckKeybindings[action]) {
      const chip = bindings.createEl("button", {
        cls: "slipbox-shortcut-chip",
        attr: {
          type: "button",
          "aria-label": `Remove ${formatKeyBinding(bindingValue)} from ${label}`,
        },
      });
      chip.createSpan({ text: formatKeyBinding(bindingValue) });
      chip.createSpan({ cls: "slipbox-shortcut-remove", text: "×" });
      chip.addEventListener("click", () => {
        const signature = keyBindingSignature(bindingValue);
        void this.save({
          ...this.slipbox.settings,
          deckKeybindings: {
            ...this.slipbox.settings.deckKeybindings,
            [action]: this.slipbox.settings.deckKeybindings[action].filter(
              (candidate) => keyBindingSignature(candidate) !== signature,
            ),
          },
        }).then(() => this.updatePreservingScroll());
      });
    }

    const add = bindings.createEl("button", {
      text: "+ add shortcut",
      attr: { type: "button" },
    });
    const error = setting.settingEl.createDiv({ cls: "slipbox-setting-error" });
    add.addEventListener("click", () => {
      if (add.hasClass("is-capturing")) {
        return;
      }
      error.empty();
      add.setText("Press shortcut…");
      add.addClass("is-capturing");
      add.focus();
      const capture = (event: KeyboardEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") {
          finish();
          return;
        }
        if (["Alt", "Control", "Meta", "Shift"].includes(event.key)) {
          return;
        }
        const candidate = this.bindingFromEvent(event);
        const conflict = keyBindingConflict(
          this.slipbox.settings.deckKeybindings,
          action,
          candidate,
        );
        if (conflict !== null) {
          const conflictLabel = SLIPBOX_ACTION_DEFINITIONS.find(
            (candidate) => candidate.id === conflict,
          )?.label ?? conflict;
          error.setText(`${formatKeyBinding(candidate)} is already assigned to ${conflictLabel}.`);
          return;
        }
        if (
          this.slipbox.settings.deckKeybindings[action].some(
            (bindingValue) =>
              keyBindingSignature(bindingValue) === keyBindingSignature(candidate),
          )
        ) {
          error.setText(`${formatKeyBinding(candidate)} is already assigned here.`);
          return;
        }
        finish();
        void this.save({
          ...this.slipbox.settings,
          deckKeybindings: {
            ...this.slipbox.settings.deckKeybindings,
            [action]: [
              ...this.slipbox.settings.deckKeybindings[action],
              candidate,
            ],
          },
        }).then(() => this.updatePreservingScroll());
      };
      const finish = (): void => {
        add.removeEventListener("keydown", capture);
        add.removeEventListener("blur", finish);
        add.removeClass("is-capturing");
        add.setText("+ add shortcut");
      };
      add.addEventListener("keydown", capture);
      add.addEventListener("blur", finish);
    });

    const reset = bindings.createEl("button", {
      text: "Reset",
      attr: { type: "button", "aria-label": `Reset ${label} shortcuts` },
    });
    reset.addEventListener("click", () => {
      const defaults = definition.defaultBindings;
      for (const bindingValue of defaults) {
        const conflict = keyBindingConflict(
          this.slipbox.settings.deckKeybindings,
          action,
          bindingValue,
        );
        if (conflict !== null) {
          const conflictLabel = SLIPBOX_ACTION_DEFINITIONS.find(
            (candidate) => candidate.id === conflict,
          )?.label ?? conflict;
          error.setText(
            `${formatKeyBinding(bindingValue)} is already assigned to ${conflictLabel}.`,
          );
          return;
        }
      }
      void this.save({
        ...this.slipbox.settings,
        deckKeybindings: {
          ...this.slipbox.settings.deckKeybindings,
          [action]: defaults,
        },
      }).then(() => this.updatePreservingScroll());
    });
  }

  private bindingFromEvent(event: KeyboardEvent): DeckKeyBinding {
    return keyBindingFromKeyboardEvent(event, Platform.isMacOS);
  }

  private updatePreservingScroll(): void {
    const positions: Array<{
      readonly element: HTMLElement;
      readonly top: number;
      readonly left: number;
    }> = [];
    let element: HTMLElement | null = this.containerEl;
    while (element !== null) {
      if (
        element.scrollTop !== 0 ||
        element.scrollLeft !== 0 ||
        element.scrollHeight > element.clientHeight ||
        element.scrollWidth > element.clientWidth
      ) {
        positions.push({
          element,
          top: element.scrollTop,
          left: element.scrollLeft,
        });
      }
      element = element.parentElement;
    }

    const restore = (): void => {
      for (const position of positions) {
        position.element.scrollTop = position.top;
        position.element.scrollLeft = position.left;
      }
    };
    this.update();
    restore();
    window.requestAnimationFrame(restore);
  }

  private debounceTextCommit(
    input: HTMLInputElement,
    commit: () => void,
  ): () => void {
    let timer: number | null = null;
    const flush = (): void => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      commit();
    };
    input.addEventListener("blur", flush);
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(flush, 300);
    };
  }

  private setMetadataPropertyValidity(
    setting: Setting,
    property: string,
    disallowedProperty: string | null,
  ): void {
    const error = metadataPropertyError(property, disallowedProperty);
    this.setTextValidity(
      setting,
      error === null,
      error ?? "",
    );
  }

  private setTextValidity(
    setting: Setting,
    valid: boolean,
    message: string,
  ): void {
    setTextSettingValidity(
      setting.settingEl,
      setting.controlEl,
      valid,
      message,
    );
  }

  private async save(settings: SlipboxSettings): Promise<void> {
    try {
      await this.slipbox.updateSettings(settings);
    } catch (error) {
      new Notice(`Could not save Slipbox Desk settings: ${errorMessage(error)}`);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
