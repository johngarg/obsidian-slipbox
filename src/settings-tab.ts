import {
  App,
  Notice,
  Platform,
  PluginSettingTab,
  Setting,
  TFolder,
} from "obsidian";

import type SlipboxPlugin from "./main.js";
import { cardHeaderButtonDefinitionsForSurface } from "./card-header-actions.js";
import {
  DECK_ACTION_DEFINITIONS,
  DEFAULT_DECK_KEYBINDINGS,
  DEFAULT_SETTINGS,
  formatKeyBinding,
  keyBindingFromKeyboardEvent,
  keyBindingConflict,
  keyBindingSignature,
  normalizeCardSize,
  type CardButtonSurface,
  type DeckActionDefinition,
  type DeckKeyBinding,
  type SlipboxSettings,
} from "./settings.js";

export class SlipboxSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly slipbox: SlipboxPlugin,
  ) {
    super(app, slipbox);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Cards and metadata").setHeading();
    this.renderAddressProperty(containerEl);
    this.renderDeckOrdering(containerEl);

    new Setting(containerEl)
      .setName("Title source")
      .setDesc("Choose the filename or a top-level frontmatter property for note titles. New cards use the entered title in the selected location.")
      .addDropdown((dropdown) => {
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
            }).then(() => this.redisplayPreservingScroll());
          });
      });

    const titleProperty = new Setting(containerEl)
      .setName("Title property")
      .setDesc("Exact top-level YAML key. It must differ from the address property. Missing, blank, or non-text values fall back to the filename.")
      .setDisabled(this.slipbox.settings.titleSource !== "frontmatter");
    titleProperty.addText((text) => {
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
            titleProperty,
            property,
            this.slipbox.settings.addressProperty,
          );
          queueCommit();
        });
    });

    new Setting(containerEl)
      .setName("Show title in Slipbox card headers")
      .setDesc("Show resolved titles beside addresses in Deck and Desk card headers.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.slipbox.settings.showTitleInDeck)
          .onChange((value) => void this.save({
            ...this.slipbox.settings,
            showTitleInDeck: value,
          }));
      });

    new Setting(containerEl)
      .setName("Show Deck toolbar")
      .setDesc("Show the navigation, bookmark, and spread controls above the Deck.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.slipbox.settings.showDeckToolbar)
          .onChange((value) => void this.save({
            ...this.slipbox.settings,
            showDeckToolbar: value,
          }));
      });

    new Setting(containerEl)
      .setName("Show Deck map")
      .setDesc("Show a clickable overview sampled from the filed sequence, with exact anchor and bookmark positions.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.slipbox.settings.showDeckMap)
          .onChange((value) => void this.save({
            ...this.slipbox.settings,
            showDeckMap: value,
          }));
      });

    new Setting(containerEl).setName("Card sizes").setHeading();
    this.renderCardSizeSettings(containerEl);

    new Setting(containerEl).setName("New cards").setHeading();
    this.renderNewCardSettings(containerEl);

    new Setting(containerEl).setName("Card header buttons").setHeading();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Choose which actions appear in Deck, Desk, and viewed-card headers. Buttons that do not fit move into more card actions. Hidden actions remain available through commands, Slipbox shortcuts, and context menus.",
    });
    this.renderCardHeaderButtons(containerEl, "deck", "Deck cards");
    this.renderCardHeaderButtons(containerEl, "desk", "Desk cards");
    this.renderCardHeaderButtons(containerEl, "viewed", "Viewed cards");

    new Setting(containerEl).setName("Keyboard shortcuts").setHeading();
    const shortcutIntro = containerEl.createDiv({ cls: "slipbox-shortcut-intro" });
    shortcutIntro.createEl("p", {
      cls: "setting-item-description",
      text: "These shortcuts work only while Slipbox is active and never fire in text or form controls.",
    });
    const resetAll = shortcutIntro.createEl("button", {
      text: "Reset all shortcuts",
      attr: { type: "button" },
    });
    resetAll.addEventListener("click", () => {
      void this.save({
        ...this.slipbox.settings,
        deckKeybindings: DEFAULT_DECK_KEYBINDINGS,
      }).then(() => this.redisplayPreservingScroll());
    });
    for (const definition of DECK_ACTION_DEFINITIONS) {
      this.renderShortcutSetting(containerEl, definition);
    }
  }

  private renderCardSizeSettings(container: HTMLElement): void {
    new Setting(container)
      .setName("Main card size")
      .setDesc("Maximum Deck-card width: small 720 px, medium 840 px, or large 960 px.")
      .addDropdown((dropdown) => {
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

    new Setting(container)
      .setName("Desk card size")
      .setDesc("Maximum working-pile card width: small 280 px, medium 360 px, or large 440 px. Desk cards remain smaller than main cards.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("small", "Small")
          .addOption("medium", "Medium")
          .addOption("large", "Large")
          .setValue(this.slipbox.settings.trayCardSize)
          .onChange((value) => void this.save({
            ...this.slipbox.settings,
            trayCardSize: normalizeCardSize(value),
          }));
      });
  }

  private renderNewCardSettings(container: HTMLElement): void {
    const folderSetting = new Setting(container)
      .setName("New card folder")
      .setDesc("Optional vault-folder override for notes created through Slipbox. Leave empty to inherit the source note’s folder, or the vault root when no source note is active.");
    folderSetting.addDropdown((dropdown) => {
      dropdown.addOption("", "Source note’s folder");
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

    const timestamp = new Setting(container)
      .setName("Timestamp filename format")
      .setDesc("Moment format used when the title is blank, or whenever titles come from frontmatter. Filename-unsafe characters become hyphens. Example: ");
    const sample = timestamp.descEl.createEl("code");
    timestamp.addMomentFormat((component) => {
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
            timestamp,
            format !== "",
            "A non-empty timestamp format is required.",
          );
          queueCommit();
        });
    });

    const info = this.slipbox.templatesInfo();
    let templateSetting: Setting | null = null;

    new Setting(container)
      .setName("Apply a template to new cards")
      .setDesc("Use Obsidian’s templates core plugin after Slipbox creates and opens the note.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.slipbox.settings.useTemplatesForNewNotes)
          .onChange((value) => void this.save({
            ...this.slipbox.settings,
            useTemplatesForNewNotes: value,
          }).then(() => {
            templateSetting?.setDisabled(
              !value || !info.enabled || info.files.length === 0,
            );
          }));
      });

    let description = "Choose a fixed template, or ask each time a card is created.";
    if (!info.enabled) {
      description = "Enable Obsidian’s Templates core plugin to choose a template.";
    } else if (info.folder === "") {
      description = "Choose a template folder in the Templates core plugin settings first.";
    } else if (info.files.length === 0) {
      description = `No Markdown templates were found in ${info.folder}.`;
    }
    const templateDisabled =
      !this.slipbox.settings.useTemplatesForNewNotes ||
      !info.enabled ||
      info.files.length === 0;
    const template = new Setting(container)
      .setName("New card template")
      .setDesc(description)
      .setDisabled(templateDisabled);
    templateSetting = template;
    template.addDropdown((dropdown) => {
      dropdown.addOption("", "Ask each time");
      for (const file of info.files) {
        const prefix = `${info.folder}/`;
        const label = file.path.startsWith(prefix)
          ? file.path.slice(prefix.length, -3)
          : file.basename;
        dropdown.addOption(file.path, label);
      }
      const current = this.slipbox.settings.newNoteTemplatePath;
      if (
        current !== "" &&
        !info.files.some((file) => file.path === current)
      ) {
        dropdown.addOption(current, `${current} (missing)`);
      }
      dropdown
        .setValue(current)
        .setDisabled(templateDisabled)
        .onChange((value) => void this.save({
          ...this.slipbox.settings,
          newNoteTemplatePath: value,
        }));
    });
  }

  private renderAddressProperty(container: HTMLElement): void {
    const setting = new Setting(container)
      .setName("Address property")
      .setDesc(
        "Exact top-level YAML key used to identify and order cards. Changing it re-indexes immediately but does not rewrite existing notes.",
      );
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

  private renderDeckOrdering(container: HTMLElement): void {
    new Setting(container)
      .setName("Deck ordering")
      .setDesc("Controls how manually assigned addresses are arranged in the Deck. Changing this setting reorders cards but does not edit Markdown files.")
      .addDropdown((dropdown) => {
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

  private renderCardHeaderButtons(
    container: HTMLElement,
    surface: CardButtonSurface,
    heading: string,
  ): void {
    new Setting(container).setName(heading).setHeading();
    for (const definition of cardHeaderButtonDefinitionsForSurface(surface)) {
      new Setting(container)
        .setName(definition.settingLabel)
        .addToggle((toggle) => {
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
    }
  }

  private renderShortcutSetting(
    container: HTMLElement,
    definition: DeckActionDefinition,
  ): void {
    const { id: action, label } = definition;
    const setting = new Setting(container).setName(label);
    if (definition.description !== undefined) {
      setting.setDesc(definition.description);
    }
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
        }).then(() => this.redisplayPreservingScroll());
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
          const conflictLabel = DECK_ACTION_DEFINITIONS.find(
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
        }).then(() => this.redisplayPreservingScroll());
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
          const conflictLabel = DECK_ACTION_DEFINITIONS.find(
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
      }).then(() => this.redisplayPreservingScroll());
    });
  }

  private bindingFromEvent(event: KeyboardEvent): DeckKeyBinding {
    return keyBindingFromKeyboardEvent(event, Platform.isMacOS);
  }

  private redisplayPreservingScroll(): void {
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
    this.display();
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
    const empty = property === "";
    const collision = disallowedProperty !== null && property === disallowedProperty;
    this.setTextValidity(
      setting,
      !empty && !collision,
      collision
        ? "The title and address properties must use different keys."
        : "A non-empty top-level property name is required.",
    );
  }

  private setTextValidity(
    setting: Setting,
    valid: boolean,
    message: string,
  ): void {
    setting.settingEl.toggleClass("is-invalid", !valid);
    let error = setting.settingEl.querySelector<HTMLElement>(".slipbox-setting-error");
    if (!valid && error === null) {
      error = setting.settingEl.createDiv({ cls: "slipbox-setting-error" });
    }
    error?.setText(valid ? "" : message);
  }

  private async save(settings: SlipboxSettings): Promise<void> {
    try {
      await this.slipbox.updateSettings(settings);
    } catch (error) {
      new Notice(`Could not save Slipbox settings: ${errorMessage(error)}`);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
