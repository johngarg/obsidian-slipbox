import { getLinkpath, type App, type TFile } from "obsidian";
import type { CardIndex } from "./card-index.js";
import { renderedLinkAction, resolveFiledCardLink } from "./card-links.js";
import type { CardService } from "./card-service.js";
import type { CardSignatureBranch } from "./card-signature.js";
import { applyRenderedBranchLinkOutlines } from "./rendered-branch-links.js";
import { attachRenderedLinkInteractions } from "./rendered-link-interactions.js";
import type { SlipboxSettings } from "./settings.js";

export interface CardLinkEnvironment {
  readonly app: App;
  readonly index: CardIndex;
  readonly cards: Pick<CardService, "title">;
  settings(): SlipboxSettings;
  preview(event: MouseEvent, target: HTMLElement, linktext: string, sourcePath: string): void;
  activate(path: string): Promise<void>;
  runAfterEditing(reason: string, action: () => void | Promise<void>): Promise<boolean>;
}

/** Shared host adaptation; pointer policy and link semantics remain in their pure modules. */
export class CardLinkPresenter {
  constructor(private readonly environment: CardLinkEnvironment) { }

  branchesForPath(path: string): readonly CardSignatureBranch[] {
    const { app, index, cards } = this.environment;
    return index.incomingBranchesForPath(path).flatMap((branch) => {
      const source = index.filedByPath(branch.sourcePath);
      return source === undefined ? [] : [{
        label: branch.label,
        sourcePath: source.path,
        sourceAddress: source.address,
        sourceTitle: cards.title(source.file),
        linktext: app.metadataCache.fileToLinktext(source.file, path),
      }];
    });
  }

  attach(target: HTMLElement, sourcePath: string, reason: string): void {
    const environment = this.environment;
    const { app } = environment;
    const current = this.environment.settings();
    attachRenderedLinkInteractions(target, {
      previewEnabled: current.previewLinksOnHover,
      followEnabled: current.followLinksFromCards,
      showTooltips: current.showTooltips,
      preview: (event, link, linktext) => environment.preview(event, link, linktext, sourcePath),
      follow: (event, link, linktext) => {
        const internal = link.matches(".internal-link");
        const newLeaf = event.metaKey || event.ctrlKey || event.button === 1;
        void environment.runAfterEditing(reason, async () => {
          const filed = internal ? this.resolve(linktext, sourcePath) : undefined;
          const action = renderedLinkAction(internal, newLeaf, linktext, filed);
          if (action.kind === "card") await environment.activate(action.path);
          else if (action.kind === "note") await app.workspace.openLinkText(action.linktext, sourcePath, newLeaf);
          else link.win.open(link.href, "_blank", "noopener");
        });
      },
    });
  }

  outline(target: HTMLElement, file: TFile): void {
    const { app, index } = this.environment;
    const current = this.environment.settings();
    applyRenderedBranchLinkOutlines(target, {
      enabled: current.explicitBranchLinks,
      outline: current.outlineBranchLinks,
      hideMarker: current.hideBranchLinkMarkers,
      links: app.metadataCache.getFileCache(file)?.links ?? [],
      targetAddressForLink: (link) => {
        const resolved = this.resolve(link, file.path);
        return resolved === undefined ? undefined : index.filedByPath(resolved.path)?.address;
      },
    });
  }

  private resolve(link: string, sourcePath: string) {
    const { app, index } = this.environment;
    return resolveFiledCardLink(getLinkpath(link), sourcePath, {
      resolveFile: (path, source) => app.metadataCache.getFirstLinkpathDest(path, source),
      filedPathForFile: (file) => index.filedByFile(file)?.path,
      firstFiledPathAtAddress: (address) => index.firstFiledAtAddress(address)?.path,
    });
  }
}
