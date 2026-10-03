import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const actualRequire = createRequire(import.meta.url);

// Bundle once, then load isolated host services for each fixture.
export async function bundleFixture(contents) {
  const output = await build({
    stdin: { contents, resolveDir: process.cwd() },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['obsidian']
  });
  return (obsidian = {}, globals = {}) => {
    const module = { exports: {} };
    const host = new Proxy(obsidian, { get: (target, key) => target[key] ?? class { } });
    runInNewContext('(function(require, module, exports) {' + output.outputFiles[0].text + '\n})', globals)(
      name => name === 'obsidian' ? host : actualRequire(name), module, module.exports);
    return module.exports;
  };
}

export function installDomShims(window) {
  Object.defineProperty(window.CSSStyleDeclaration.prototype, 'translate', {
    configurable: true,
    get() { return this.getPropertyValue('translate'); },
    set(value) { this.setProperty('translate', value); }
  });
  Object.defineProperties(window.Node.prototype, {
    win: { configurable: true, get() { return this.ownerDocument?.defaultView ?? window; } },
    doc: { configurable: true, get() { return this.ownerDocument; } },
    instanceOf: { configurable: true, value(Type) { return this instanceof Type; } },
  });
  Object.defineProperties(window.Event.prototype, {
    win: { configurable: true, get: () => window },
    targetNode: { configurable: true, get() { return this.target; } },
  });
  Object.assign(window.HTMLElement.prototype, {
    addClass(...names) { this.classList.add(...names); },
    removeClass(...names) { this.classList.remove(...names); },
    removeClasses(names) { this.classList.remove(...names); },
    hasClass(name) { return this.classList.contains(name); },
    toggleClass(name, on) { this.classList.toggle(name, on); },
    setAttr(name, value) { this.setAttribute(name, value); },
    setText(value) { this.textContent = value; },
    empty() { this.replaceChildren(); },
    setCssProps(props) { for (const [name, value] of Object.entries(props)) this.style.setProperty(name, value); },
    createEl(tag, options = {}) {
      const el = this.ownerDocument.createElement(tag);
      el.className = options.cls ?? '';
      el.textContent = options.text ?? '';
      for (const [name, value] of Object.entries(options.attr ?? {})) el.setAttribute(name, value);
      this.append(el);
      return el;
    },
    createDiv(options) { return this.createEl('div', options); },
    createSpan(options) { return this.createEl('span', options); },
    setPointerCapture(id) { this.capture = id; },
    hasPointerCapture(id) { return this.capture === id; },
    releasePointerCapture() { this.capture = null; },
  });
}

// Focused orchestration fixtures have no mounted editor; component tests use the constructor.
export function idleInlineEditor() {
  return {
    isEditing: false,
    isStarting: false,
    path: null,
    textarea: null,
    deferRendering() { return this.isEditing || this.isStarting; },
    onRefresh() { return 'render'; },
    async runAfter(_reason, action) {
      await action();
      return true;
    }
  };
}

export function deckDragFixture(view, Controller) {
  return new Controller({
    root: view.contentEl,
    desk: view.plugin.deskService,
    index: view.plugin.index,
    stage: () => view.stageEl,
    space: () => view.spaceEl,
    cardsContainer: () => view.deckCardsEl,
    orientation: () => view.plugin.settings.deckOrientation,
    offset: () => ({ x: view.spaceOffsetX, y: view.spaceOffsetY }),
    panTo(x, y) {
      view.spaceOffsetX = x;
      view.spaceOffsetY = y;
      view.applySpaceOffset();
    },
    cancelMotion() {
      view.cancelViewportCentering();
      view.cancelSpaceRecentering();
    },
    afterPan() { view.renderBookmarkEdgeTabs(view.stageEl); },
    updateBranchPosition() { view.localBranchView.updatePosition(); },
    positionAtPoint: (x, y) => view.deskRenderer.positionDeckCardAtPoint(x, y),
    assignFocus: (path, pileId) => view.assignCardFocus({ surface: 'desk', path, pileId }),
    runAfterEditing: (reason, action) => view.inlineEditor.runAfter(reason, action),
  });
}
