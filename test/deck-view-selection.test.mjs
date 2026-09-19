import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const output = await build({ stdin: { contents: `
  export { LocalBranchViewController } from './src/local-branch-view.ts';
  export { DeckView } from './src/deck-view.ts';
  export { DeckViewport } from './src/deck-viewport.ts';
  export { DeckTransition } from './src/deck-transition.ts';
  export { DeckFrameScheduler } from './src/deck-frame.ts';
  export { DeckWheelController } from './src/deck-wheel.ts';
  export { ViewedCardSession } from './src/viewed-card.ts';
  export { DEFAULT_SETTINGS } from './src/settings.ts';
  export { cardMotionStyle, cardFootprint } from './src/deck-motion.ts';
  export { deckRenderedIndices } from './src/deck-render-window.ts';
  export { attachRenderedLinkInteractions } from './src/rendered-link-interactions.ts';
`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'cjs', platform: 'node', external: ['obsidian'] });
const actualRequire = createRequire(import.meta.url);
const tick = () => new Promise(resolve => setImmediate(resolve));
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const stylesheet = readFileSync('styles.css', 'utf8');

// Real navigation, mounting, retention, listeners and animation scheduling;
// only host services and browser layout are substituted.
async function subject(t, orientation = 'vertical', model = 'drawer', withStyles = false) {
  const window = new Window();
  if (withStyles) {
    const style = window.document.createElement('style');
    style.textContent = stylesheet;
    window.document.head.append(style);
  }
  let now = 1000, reduced = false, sequence = 0;
  const pending = new Map(), calls = { actions: [], links: 0, gates: 0 };
  Object.defineProperty(window, 'performance', { value: { now: () => now } });
  window.matchMedia = () => ({ matches: reduced });
  window.requestAnimationFrame = callback => { pending.set(++sequence, callback); return sequence; };
  window.cancelAnimationFrame = id => pending.delete(id);
  // Happy DOM lacks this CSSOM accessor; browsers reflect it into the declaration.
  Object.defineProperty(window.CSSStyleDeclaration.prototype, 'translate', {
    configurable: true,
    get() { return this.getPropertyValue('translate'); },
    set(value) { this.setProperty('translate', value); },
  });
  Object.defineProperties(window.Node.prototype, {
    win: { configurable: true, get() { return this.ownerDocument?.defaultView ?? window; } },
    doc: { configurable: true, get() { return this.ownerDocument; } },
    instanceOf: { configurable: true, value(Type) { return this instanceof Type; } },
  });
  Object.defineProperties(window.Event.prototype, {
    win: { configurable: true, get: () => window }, targetNode: { configurable: true, get() { return this.target; } },
  });
  Object.assign(window.HTMLElement.prototype, {
    addClass(name) { this.classList.add(name); }, removeClass(name) { this.classList.remove(name); },
    toggleClass(name, on) { this.classList.toggle(name, on); }, hasClass(name) { return this.classList.contains(name); },
    setAttr(name, value) { this.setAttribute(name, value); },
    setCssProps(props) { for (const [name, value] of Object.entries(props)) this.style.setProperty(name, value); },
    createEl(tag, options = {}) { const el = window.document.createElement(tag); el.className = options.cls ?? ''; el.textContent = options.text ?? ''; for (const [name, value] of Object.entries(options.attr ?? {})) el.setAttribute(name, value); this.append(el); return el; },
    createDiv(options) { return this.createEl('div', options); }, createSpan(options) { return this.createEl('span', options); },
    setPointerCapture(id) { this.capture = id; }, hasPointerCapture(id) { return this.capture === id; }, releasePointerCapture() { this.capture = null; },
  });
  const module = { exports: {} };
  const obsidian = new Proxy({ setIcon() {}, Notice: class {} }, { get: (target, key) => target[key] ?? class {} });
  const globals = { HTMLElement: window.HTMLElement, Element: window.Element, CSS: window.CSS,
    DOMMatrixReadOnly: class { constructor(text) { const values = text.match(/matrix\((.*)\)/)[1].split(',').map(Number); this.m41 = values[4]; this.m42 = values[5]; } } };
  runInNewContext('(function(require, module, exports) {' + output.outputFiles[0].text + '\n})', globals)(
    name => name === 'obsidian' ? obsidian : actualRequire(name), module, module.exports,
  );
  const { DeckView, DeckViewport, DeckTransition, DeckFrameScheduler, DeckWheelController, ViewedCardSession, DEFAULT_SETTINGS, attachRenderedLinkInteractions } = module.exports;
  const content = window.document.body.createDiv({ cls: 'view-content slipbox-deck-view' });
  Object.assign(content.dataset, { deckOrientation: orientation, deckStackModel: model, mainCardSize: 'medium' });
  const stage = content.createDiv({ cls: 'slipbox-deck-stage' });
  Object.defineProperties(stage, { clientWidth: { value: 1800, configurable: true }, clientHeight: { value: 1200, configurable: true } });
  const space = stage.createDiv({ cls: 'slipbox-space' });
  const deck = space.createDiv({ cls: 'slipbox-deck-cards' });
  const cards = Array.from({ length: 1000 }, (_, index) => ({ path: `${index}.md`, address: String(index), file: { path: `${index}.md`, basename: String(index) } }));
  const view = Object.create(DeckView.prototype);
  Object.assign(view, {
    localBranchView: { updatePosition() {} },
    stageEl: stage, contentEl: content, spaceEl: space, deckCardsEl: deck, renderedCards: [],
    deckViewport: new DeckViewport(), drawerTransition: new DeckTransition(), wheelController: new DeckWheelController(),
    viewedCardSession: new ViewedCardSession(), viewedCardEl: null, viewedFilingEditor: null,
    spaceOffsetX: 70, spaceOffsetY: 90, spaceRecenteringTimer: null, viewportCenteringFrame: null,
    pointerLastX: null, pointerLastY: null, suppressDeckCardClickUntil: 0,
    inlineEdit: null, inlineEditStarting: false, filingSession: { isActive: false, snapshot: null },
    cardFocus: { surface: 'deck', path: '400.md' }, viewedFocusFromDeckNavigation: false,
    deckRenderVersion: 1, renderVersion: 1, renderRefreshFrame: null, renderRefreshPending: false, renderRefreshRunning: false, renderRefreshQueued: false,
    renderComponents: new Map(), cardScrollPositions: new Map(), deckInteractivity: new WeakMap(),
    cardHeaderControllers: new Map(), cardHeaderButtonControllers: new Set(),
    cardFooters: { removeCard() {}, setInteractive() {} },
    cardSignatures: { render() {}, removeCard() {}, setInteractive() {} },
    deskRenderer: { filingInput: null, beginCoveredDeskDrag: () => false, positionPiles: () => true },
    plugin: { settings: { ...DEFAULT_SETTINGS, deckOrientation: orientation, deckStackModel: model, cardSpread: 0.1,
      showAutomaticBacklinks: false, showTooltips: false, wheelOverCardBody: 'deck', allowCardScrolling: true },
      index: { snapshot: { filed: cards }, filedIndexForPath: path => cards.findIndex(card => card.path === path), filedByPath: path => cards.find(card => card.path === path) },
      startupDeckPositionMode: 'bottom', bookmarks: { items: [], at: () => undefined },
      deskService: { snapshot: { piles: [], expandedPileIds: [] }, contains: () => false },
      cards: { color: () => null, displayTitle: file => file.basename },
    },
    renderBookmarkEdgeTabs() {}, updateDeckMapActiveUi() {}, syncLocalBranchViewOwner() {},
    runCardAction(action) { calls.actions.push(action); },
    runAfterInlineEditing(_reason, action) { calls.gates++; return Promise.resolve(action()).then(() => true); },
    async renderMarkdownCard(card, body) {
      body.createEl('p', { text: `Body ${card.path}` });
      body.createEl('a', { text: 'Link', attr: { href: 'example.md' } });
      attachRenderedLinkInteractions(body, { previewEnabled: false, followEnabled: true, showTooltips: false, preview() {}, follow() { calls.links++; } });
    },
  });
  view.deckFrames = new DeckFrameScheduler({ request: cb => window.requestAnimationFrame(cb), cancel: id => window.cancelAnimationFrame(id), flush: changed => view.flushDeckMotion(changed) });
  view.deckViewport.navigate('400.md', cards);
  view.deckViewport.placeAt(399.75, cards);
  view.attachBrowsingEvents(stage);
  view.applySpaceOffset();
  await view.refreshDeckCardWindow();
  const frame = async time => { now = time; const jobs = [...pending.values()]; pending.clear(); jobs.forEach(job => job(now)); await tick(); };
  await frame(now);
  t.after(() => { view.deckFrames.cancel(); view.cancelRenderWindowRefresh(); view.cancelSpaceRecentering(); for (const controller of view.cardHeaderButtonControllers) controller.disconnect(); window.happyDOM.abort(); });
  return { view, cards, window, calls, pending, frame, ...module.exports,
    time: () => now, reduced: value => { reduced = value; },
    card: index => view.renderedCards.find(card => card.dataset.path === `${index}.md`),
    click: async (target, options = {}) => { const event = new window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, ...options }); target.dispatchEvent(event); await tick(); return event; },
    pointer(target, type, x, y) { target.dispatchEvent(new window.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y })); },
  };
}

// Keep the clock stationary while checking reparenting, independently of animation.
async function prepareDeskDrag(s, modes = ['left', 'top']) {
  const { view } = s;
  s.reduced(true);
  for (const mode of modes) view.positionDeck(mode);
  view.spaceOffsetX = 70; view.spaceOffsetY = -90;
  view.applySpaceOffset();
  await view.refreshDeckCardWindow();
  await s.frame(s.time());
  return s.card(400);
}

function cardLayout(s, card) {
  const style = s.window.getComputedStyle(card);
  return { top: style.top, left: style.left, transform: style.transform, width: style.width, height: style.height };
}

async function startDeskDrag(s, card) {
  const header = card.querySelector('.slipbox-card-address-row');
  s.pointer(header, 'pointerdown', 20, 20);
  await tick();
  s.pointer(header, 'pointermove', 30, 22);
  return header;
}

function assertDragCleared(s, card) {
  assert.equal(card.parentElement, s.view.deckCardsEl);
  assert.equal(card.classList.contains('is-dragging-to-desk'), false);
  assert.equal(s.view.stageEl.classList.contains('is-dragging'), false);
  assert.equal(card.style.translate, '');
  assert.equal(s.view.stageEl.querySelector('.is-card-drop-target'), null);
}

for (const orientation of ['horizontal', 'vertical']) {
  for (const model of ['drawer', 'fan']) {
    for (const modes of [['left'], ['right'], ['top'], ['bottom'], ['centered'],
      ['left', 'top'], ['left', 'bottom'], ['right', 'top'], ['right', 'bottom']]) {
      test(`${orientation} ${model}: Desk drag preserves positioned coordinates after ${modes.join('/')}`, async t => {
        const s = await subject(t, orientation, model, true);
        const card = await prepareDeskDrag(s, modes);
        s.window.document.elementsFromPoint = () => [];
        const before = cardLayout(s, card);
        assert.match(before.top, /px$/);
        assert.match(before.left, /px$/);
        const pan = s.view.spaceEl.style.transform;
        const header = await startDeskDrag(s, card);
        assert.equal(card.parentElement, s.view.spaceEl);
        assert.deepEqual(cardLayout(s, card), before);
        assert.equal(card.style.translate, '10px 2px');
        assert.equal(s.view.spaceEl.style.transform, pan);
        s.pointer(header, 'pointermove', 64, 31);
        assert.equal(card.style.translate, '44px 11px');
        assert.deepEqual(cardLayout(s, card), before);
        s.pointer(header, 'pointercancel', 64, 31);
        assertDragCleared(s, card);
        assert.deepEqual(cardLayout(s, card), before);
      });
    }

    for (const [size, width, height] of [['small', 720, 480], ['medium', 840, 560],
      ['large', 960, 640], ['custom', 480.5, 288.25]]) {
      test(`${orientation} ${model}: ${size} drag coordinates follow pane resize`, async t => {
        const s = await subject(t, orientation, model, true), { view } = s;
        view.cardDimensions = { snapshot: { width, height }, flush() {} };
        if (size === 'custom') {
          view.contentEl.style.setProperty('--slipbox-deck-card-width', `${width}px`);
          view.contentEl.style.setProperty('--slipbox-card-aspect-ratio', String(width / height));
        } else {
          view.plugin.settings.mainCardSize = size;
          view.contentEl.dataset.mainCardSize = size;
        }
        s.window.document.elementsFromPoint = () => [];
        const card = await prepareDeskDrag(s, ['right', 'bottom']);
        for (const [paneWidth, paneHeight] of [[1200, 800], [320, 240]]) {
          Object.defineProperties(view.stageEl, { clientWidth: { value: paneWidth, configurable: true },
            clientHeight: { value: paneHeight, configurable: true } });
          view.positionCards();
          const before = cardLayout(s, card), geometry = view.deckGeometry();
          closeTo(parseFloat(before.width), width);
          closeTo(parseFloat(before.left), geometry.anchorCenterX);
          closeTo(parseFloat(before.top), geometry.anchorCenterY);
          const header = await startDeskDrag(s, card);
          assert.deepEqual(cardLayout(s, card), before);
          // Resizing during the drag must update the same coordinates as the Deck.
          Object.defineProperties(view.stageEl, { clientWidth: { value: paneWidth + 40, configurable: true },
            clientHeight: { value: paneHeight + 30, configurable: true } });
          view.positionCards();
          const during = cardLayout(s, card);
          closeTo(parseFloat(during.left), view.deckGeometry().anchorCenterX);
          closeTo(parseFloat(during.top), view.deckGeometry().anchorCenterY);
          assert.equal(during.width, before.width);
          assert.equal(card.style.translate, '10px 2px');
          s.pointer(header, 'pointercancel', 30, 22);
          assertDragCleared(s, card);
          assert.deepEqual(cardLayout(s, card), during);
        }
      });
    }

    for (const outcome of ['workspace', 'pile', 'invalid', 'cancel']) {
      test(`${orientation} ${model}: Desk drag ${outcome} uses normal drop logic and clears presentation`, async t => {
        const s = await subject(t, orientation, model, true), { view } = s;
        const card = await prepareDeskDrag(s);
        const pile = view.spaceEl.createDiv({ cls: 'slipbox-desk-pile is-collapsed' });
        pile.dataset.pileId = 'existing';
        const original = { piles: [{ id: 'existing', cards: [{ cardRef: '399.md', kind: 'filed' }],
          position: { x: 12, y: 34 } }], expandedPileIds: [], unfiledPileId: null };
        const replacements = [];
        view.plugin.deskService.snapshot = original;
        view.plugin.deskService.createPileId = () => 'new';
        view.plugin.deskService.replace = async state => { replacements.push(state); view.plugin.deskService.snapshot = state; };
        view.deskRenderer.positionDeckCardAtPoint = () => ({ x: -42, y: 65 });
        s.window.document.elementsFromPoint = () => outcome === 'workspace' ? [view.stageEl]
          : outcome === 'invalid' ? [card, view.stageEl] : [pile, view.stageEl];
        const before = cardLayout(s, card);
        const header = await startDeskDrag(s, card);
        if (outcome === 'pile' || outcome === 'cancel') assert.equal(pile.classList.contains('is-card-drop-target'), true);
        s.pointer(header, outcome === 'cancel' ? 'pointercancel' : 'pointerup', 30, 22);
        await tick();
        assertDragCleared(s, card);
        assert.deepEqual(cardLayout(s, card), before);
        assert.equal(header.hasPointerCapture(7), false);
        if (outcome === 'workspace' || outcome === 'pile') {
          assert.equal(replacements.length, 1);
          const state = view.plugin.deskService.snapshot;
          const destination = state.piles.find(p => p.id === (outcome === 'workspace' ? 'new' : 'existing'));
          assert.deepEqual(Array.from(destination.cards, c => c.cardRef), outcome === 'workspace' ? ['400.md'] : ['399.md', '400.md']);
          assert.equal(JSON.stringify(destination.position), JSON.stringify(outcome === 'workspace' ? { x: -42, y: 65 } : { x: 12, y: 34 }));
        } else {
          assert.equal(replacements.length, 0);
          assert.equal(view.plugin.deskService.snapshot, original);
        }
      });
    }

    test(`${orientation} ${model}: movement below the drag threshold still permits a card click`, async t => {
      const s = await subject(t, orientation, model, true), { view } = s;
      await prepareDeskDrag(s);
      const card = s.card(399), header = card.querySelector('.slipbox-card-address-row');
      const before = cardLayout(s, card);
      s.pointer(header, 'pointerdown', 20, 20); await tick();
      s.pointer(header, 'pointermove', 22, 21); s.pointer(header, 'pointerup', 22, 21);
      assertDragCleared(s, card);
      assert.deepEqual(cardLayout(s, card), before);
      assert.equal(header.hasPointerCapture(7), false);
      await s.click(header);
      assert.equal(view.deckViewport.anchorPath, '399.md');
    });
  }
}

for (const model of ['drawer', 'fan']) {
  test(`vertical ${model}: predominantly vertical header movement pans without lifting the card`, async t => {
    const s = await subject(t, 'vertical', model, true), { view } = s;
    const card = await prepareDeskDrag(s), before = cardLayout(s, card);
    const header = card.querySelector('.slipbox-card-address-row');
    const position = view.deckViewport.position(s.cards);
    s.pointer(header, 'pointerdown', 20, 20); await tick();
    s.pointer(header, 'pointermove', 22, 60);
    assert.equal(card.parentElement, view.deckCardsEl);
    assert.equal(card.classList.contains('is-dragging-to-desk'), false);
    assert.equal(card.style.translate, '');
    assert.deepEqual(cardLayout(s, card), before);
    assert.equal(view.spaceOffsetX, 72); assert.equal(view.spaceOffsetY, -50);
    s.pointer(header, 'pointerup', 22, 60);
    assertDragCleared(s, card);
    assert.equal(view.deckViewport.position(s.cards), position);
  });
}

for (const orientation of ['vertical', 'horizontal']) {
  for (const selected of [400, 399]) {
    test(`${orientation}: click ${selected === 400 ? 'same anchor' : 'different card'} returns pan and gap in one motion without remounting`, async t => {
      const s = await subject(t, orientation); const { view } = s;
      const card = s.card(selected), body = card.querySelector('.slipbox-card-scroll'); body.scrollTop = 123;
      const before = card.style.transform;
      const from = view.drawerTransition.displayedPose(card.dataset.path).along;
      await s.click(card.querySelector('p'));
      assert.equal(view.deckViewport.anchorPath, card.dataset.path);
      assert.equal(view.deckViewport.position(s.cards), selected);
      assert.equal(card.style.transform, before);
      assert.equal(view.spaceOffsetX, 70); assert.equal(view.spaceOffsetY, 90);
      const target = s.cardMotionStyle({ ...view.deckGeometry(), cardIndex: selected });
      await s.frame(1090);
      closeTo(view.drawerTransition.displayedPose(card.dataset.path).along, from + (target.along - from) * 0.875);
      closeTo(view.spaceOffsetX, orientation === 'horizontal' ? 70 * 0.125 : 70);
      closeTo(view.spaceOffsetY, orientation === 'vertical' ? 90 * 0.125 : 90);
      await s.frame(1180); await s.frame(1181);
      assert.equal(view.spaceOffsetX, orientation === 'horizontal' ? 0 : 70);
      assert.equal(view.spaceOffsetY, orientation === 'vertical' ? 0 : 90);
      closeTo(view.drawerTransition.displayedPose(card.dataset.path).along, 0);
      assert.equal(s.card(selected), card); assert.equal(body.scrollTop, 123);
      assert.equal(view.drawerTransition.active(1181, 180), false);
    });
  }
  for (const alignment of [null, 'before', 'after']) {
    test(`${orientation}: ${alignment ?? 'default centred'} alignment preserves the perpendicular choice`, async t => {
      const s = await subject(t, orientation); const { view } = s;
      view.deckViewport.setPositionMode(orientation === 'vertical' ? 'right' : 'bottom');
      if (alignment !== null) view.deckViewport.setPositionMode(orientation === 'vertical' ? (alignment === 'before' ? 'top' : 'bottom') : (alignment === 'before' ? 'left' : 'right'));
      const original = view.deckViewport.snapshot;
      view.positionCards();
      const geometry = view.deckGeometry();
      if (alignment === null) assert.equal(geometry.anchorCoordinate, geometry.paneExtent / 2);
      else assert.ok(alignment === 'before' ? geometry.anchorCoordinate < geometry.paneExtent / 2 : geometry.anchorCoordinate > geometry.paneExtent / 2);
      s.reduced(true); await s.click(s.card(400));
      assert.equal(view.deckViewport.positionModeOverride, original.positionModeOverride);
      assert.equal(view.deckViewport.horizontalPositionModeOverride, original.horizontalPositionModeOverride);
      assert.equal(view.deckGeometry().anchorCoordinate, geometry.anchorCoordinate);
      assert.equal(view.spaceOffsetX, orientation === 'vertical' ? 70 : 0);
      assert.equal(view.spaceOffsetY, orientation === 'vertical' ? 0 : 90);
    });
  }
  test(`${orientation}: interrupted clicks resume displayed positions and reduced motion settles all work`, async t => {
    const s = await subject(t, orientation); const { view } = s;
    await s.click(s.card(399)); await s.frame(1060);
    const card = s.card(400), pose = card.style.transform;
    const x = view.spaceOffsetX, y = view.spaceOffsetY;
    await s.click(card);
    assert.equal(card.style.transform, pose); assert.equal(view.spaceOffsetX, x); assert.equal(view.spaceOffsetY, y);
    await s.frame(1100);
    s.reduced(true); await s.frame(1110); await s.frame(1111);
    assert.equal(view.spaceOffsetX, orientation === 'vertical' ? 70 : 0);
    assert.equal(view.spaceOffsetY, orientation === 'vertical' ? 0 : 90);
    assert.equal(view.drawerTransition.active(1111, 180), false);
    closeTo(view.drawerTransition.displayedPose('400.md').along, 0);
  });
  test(`${orientation}: interactive controls, modifiers, multiple clicks and failed editing gates do not recenter`, async t => {
    const s = await subject(t, orientation); const { view } = s; const card = s.card(400);
    await s.click(card.querySelector('button[data-slipbox-action]'));
    assert.equal(s.calls.actions.length, 1);
    await s.click(card.querySelector('a')); assert.equal(s.calls.links, 1);
    for (const tag of ['button', 'input', 'textarea', 'select']) await s.click(card.createEl(tag));
    await s.click(card.createDiv({ attr: { contenteditable: 'true' } }));
    for (const option of [{ detail: 2 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) await s.click(card, option);
    card.addEventListener('click', event => event.preventDefault(), { capture: true, once: true }); await s.click(card);
    assert.equal(s.calls.gates, 0);
    view.runAfterInlineEditing = () => Promise.resolve(false); await s.click(card);
    assert.equal(view.spaceOffsetX, 70); assert.equal(view.spaceOffsetY, 90);
    assert.equal(view.deckViewport.position(s.cards), 399.75);
  });
  test(`${orientation}: Fan remains stationary and navigation keeps workspace pan`, async t => {
    const s = await subject(t, orientation, 'fan'); const { view } = s;
    for (const index of [400, 399]) await s.click(s.card(index));
    assert.equal(view.deckViewport.position(s.cards), 399.75);
    assert.equal(view.spaceOffsetX, 70); assert.equal(view.spaceOffsetY, 90);
    assert.equal(view.deckVerticalPositionMode(), 'bottom');
    view.plugin.settings.deckStackModel = 'drawer';
    await view.jumpToPath('400.md'); await s.frame(1180);
    assert.equal(view.spaceOffsetX, 70); assert.equal(view.spaceOffsetY, 90);
    view.moveBy(1); await s.frame(1360);
    assert.equal(view.spaceOffsetX, 70); assert.equal(view.spaceOffsetY, 90);
  });
  test(`${orientation}: wheel and background pan interrupt the return without restarting it`, async t => {
    const s = await subject(t, orientation); const { view } = s;
    await s.click(s.card(400)); await s.frame(1060);
    const x = view.spaceOffsetX, y = view.spaceOffsetY;
    view.stageEl.dispatchEvent(new s.window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: orientation === 'horizontal' ? 3 : 0, deltaY: orientation === 'vertical' ? 3 : 0 }));
    const position = view.deckViewport.position(s.cards);
    await s.frame(1150);
    assert.ok(position > 400); assert.equal(view.spaceOffsetX, x); assert.equal(view.spaceOffsetY, y);
    await s.click(s.card(400)); await s.frame(1190);
    const px = view.spaceOffsetX, py = view.spaceOffsetY;
    s.pointer(view.stageEl, 'pointerdown', 20, 20); s.pointer(view.stageEl, 'pointermove', 55, 75); s.pointer(view.stageEl, 'pointerup', 55, 75);
    await s.frame(1400);
    closeTo(view.spaceOffsetX, px + 35); closeTo(view.spaceOffsetY, py + 55);
    assert.equal(view.deckViewport.position(s.cards), 400);
  });
  test(`${orientation}: header drag and cancellation suppress their generated selection click`, async t => {
    const s = await subject(t, orientation); const { view } = s;
    const card = s.card(400), header = card.querySelector('.slipbox-card-address-row');
    view.updateDeckCardDropCue = () => {}; view.deckCardDropResult = () => null;
    await s.click(card); await s.frame(1060);
    s.pointer(header, 'pointerdown', 20, 20); await tick(); await s.frame(1070);
    const x = view.spaceOffsetX, y = view.spaceOffsetY;
    s.pointer(header, 'pointermove', orientation === 'vertical' ? 22 : 60, 60);
    s.pointer(header, 'pointerup', orientation === 'vertical' ? 22 : 60, 60);
    const event = await s.click(card); assert.equal(event.defaultPrevented, true);
    await s.frame(1280);
    closeTo(view.spaceOffsetX, orientation === 'vertical' ? x + 2 : x);
    closeTo(view.spaceOffsetY, orientation === 'vertical' ? y + 40 : y);
    assert.equal(card.parentElement, view.deckCardsEl);
    await s.frame(1600);
    s.pointer(header, 'pointerdown', 20, 20); await tick(); s.pointer(header, 'pointercancel', 20, 20);
    assert.equal((await s.click(card)).defaultPrevented, true);
  });
}

test('click transfers an in-flight CSS positioning command without a snap or losing its perpendicular target', async t => {
  const s = await subject(t); const { view, window } = s;
  view.spaceOffsetX = 0; view.spaceOffsetY = 0;
  view.spaceEl.addClass('is-recentering'); view.spaceRecenteringTimer = window.setTimeout(() => {}, 10000);
  const computedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = el => el === view.spaceEl ? { transform: 'matrix(1, 0, 0, 1, 30, 40)' } : computedStyle(el);
  await s.click(s.card(400));
  assert.equal(view.spaceOffsetX, 30); assert.equal(view.spaceOffsetY, 40);
  assert.equal(view.spaceEl.hasClass('is-recentering'), false);
  await s.frame(1090); closeTo(view.spaceOffsetX, 3.75); closeTo(view.spaceOffsetY, 5);
  await s.frame(1180); assert.equal(view.spaceOffsetX, 0); assert.equal(view.spaceOffsetY, 0);
});

for (const orientation of ['vertical', 'horizontal']) {
  test(`${orientation}: combined sweep mounts entering cards, retains displayed cards, then culls surplus`, async t => {
    const s = await subject(t, orientation); const { view } = s;
    // The old anchor and the visible window are far apart after workspace pan.
    if (orientation === 'vertical') view.spaceOffsetY = 6000; else view.spaceOffsetX = 6000;
    view.applySpaceOffset(); await s.frame(1001);
    const source = view.deckGeometry();
    const targetIndex = Math.round(source.viewportPosition - 6000 / view.cardStep());
    const targetCard = s.card(targetIndex);
    assert.ok(targetCard, 'a card at the panned viewport must be selectable');
    const originals = new Map(view.renderedCards.map(card => [Number(card.dataset.index), card]));
    const scroll = targetCard.querySelector('.slipbox-card-scroll'); scroll.scrollTop = 89;
    await s.click(targetCard);
    for (let step = 0; step <= 12; step++) {
      const time = 1001 + step * 15;
      await s.frame(time);
      // Allow the window reconciliation queued by this frame to mount entrants.
      await s.frame(time);
      const geometry = view.deckGeometry();
      const progress = 1 - (1 - Math.min(1, step / 12)) ** 3;
      const mounted = new Map(view.renderedCards.map(card => [Number(card.dataset.index), card]));
      for (let index = targetIndex - 40; index <= 405; index++) {
        const from = s.cardMotionStyle({ ...source, cardIndex: index });
        const to = s.cardMotionStyle({ ...geometry, cardIndex: index });
        const along = from.along + (to.along - from.along) * progress;
        const center = geometry.anchorCoordinate + geometry.panOffset + along;
        const extent = orientation === 'vertical' ? geometry.cardHeight : geometry.cardWidth;
        if (center + extent / 2 >= 0 && center - extent / 2 <= geometry.paneExtent) {
          assert.ok(mounted.has(index), `visible card ${index} missing at ${time}`);
          if (originals.has(index)) assert.equal(mounted.get(index), originals.get(index));
          closeTo(view.drawerTransition.displayedPose(`${index}.md`).along, along);
        }
      }
      assert.ok(mounted.size < 65, `unbounded render window: ${mounted.size}`);
      assert.equal(s.card(targetIndex), targetCard); assert.equal(scroll.scrollTop, 89);
    }
    await s.frame(1200); await s.frame(1201);
    assert.deepEqual(view.renderedCards.map(card => Number(card.dataset.index)).sort((a, b) => a - b), [...s.deckRenderedIndices(1000, view.deckGeometry())]);
    assert.equal(view.drawerTransition.active(1201, 180), false);
  });
}

test('a slow earlier selection cannot steal focus after a newer click finishes', async t => {
  const s = await subject(t); const { view } = s;
  const refresh = view.refreshDeckCardWindow.bind(view);
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  view.refreshDeckCardWindow = async () => {
    const anchor = view.deckViewport.anchorPath;
    await refresh();
    if (anchor === '399.md') await delayed;
  };
  await s.click(s.card(399)); await s.click(s.card(400));
  release(); await tick();
  assert.equal(view.cardFocus.path, '400.md');
});

test('the second click preserves double-click delivery without restarting motion', async t => {
  const s = await subject(t); const { view } = s; const body = s.card(400).querySelector('p');
  let doubleClicks = 0;
  body.addEventListener('dblclick', () => doubleClicks++);
  await s.click(body); await s.frame(1060);
  const from = view.drawerTransition.startedAt;
  assert.equal((await s.click(body, { detail: 2 })).defaultPrevented, false);
  body.dispatchEvent(new s.window.MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
  assert.equal(doubleClicks, 1); assert.equal(view.drawerTransition.startedAt, from);
});

test('window refresh fills a missing interior card even when the enclosing range is unchanged', async t => {
  const s = await subject(t); const { view } = s;
  const card = s.card(399), controller = view.cardHeaderControllers.get(card);
  controller.disconnect(); view.cardHeaderButtonControllers.delete(controller); view.cardHeaderControllers.delete(card);
  card.remove(); view.renderedCards = view.renderedCards.filter(item => item !== card);
  const range = view.deckViewport.snapshot.renderedWindow;
  view.queueRenderWindowRefresh(); await s.frame(1001);
  assert.ok(s.card(399));
  assert.equal(view.deckViewport.snapshot.renderedWindow.start, range.start);
  assert.equal(view.deckViewport.snapshot.renderedWindow.end, range.end);
});

test('a frame that overruns the animation deadline still schedules its final destination', async t => {
  const s = await subject(t); const { view } = s;
  await s.click(s.card(400));
  await s.frame(1170);
  const now = s.window.performance.now;
  const position = view.positionCards.bind(view);
  s.window.performance.now = () => 1175;
  view.positionCards = geometry => { position(geometry); s.window.performance.now = () => 1190; };
  assert.equal(view.flushDeckMotion(false), true);
  view.positionCards = position; s.window.performance.now = now;
  await s.frame(1200);
  assert.equal(view.spaceOffsetY, 0);
});

for (const orientation of ['vertical', 'horizontal']) {
  test(`${orientation}: interrupted large returns seed entering cards from the displayed sweep`, async t => {
    const s = await subject(t, orientation); const { view } = s;
    if (orientation === 'vertical') view.spaceOffsetY = 6000; else view.spaceOffsetX = 6000;
    view.applySpaceOffset(); await s.frame(1001);
    const original = view.deckGeometry();
    const firstIndex = Math.round(original.viewportPosition - 6000 / view.cardStep());
    await s.click(s.card(firstIndex)); await s.frame(1046); await s.frame(1046);
    const firstTarget = view.deckGeometry();
    const firstProgress = 1 - 0.75 ** 3;
    const secondIndex = firstIndex + 1;
    assert.ok(s.card(secondIndex));
    await s.click(s.card(secondIndex));
    for (const step of [0, 1, 3, 6, 9, 12]) {
      await s.frame(1046 + step * 15); await s.frame(1046 + step * 15);
      const geometry = view.deckGeometry(); const progress = 1 - (1 - step / 12) ** 3;
      for (let index = firstIndex - 35; index <= 405; index++) {
        const originalPose = s.cardMotionStyle({ ...original, cardIndex: index });
        const firstPose = s.cardMotionStyle({ ...firstTarget, cardIndex: index });
        const displayed = originalPose.along + (firstPose.along - originalPose.along) * firstProgress;
        const target = s.cardMotionStyle({ ...geometry, cardIndex: index });
        const along = displayed + (target.along - displayed) * progress;
        const center = geometry.anchorCoordinate + geometry.panOffset + along;
        const extent = orientation === 'vertical' ? geometry.cardHeight : geometry.cardWidth;
        if (center + extent / 2 >= 0 && center - extent / 2 <= geometry.paneExtent) {
          assert.ok(s.card(index), `missing ${index} at ${step}`);
          closeTo(view.drawerTransition.displayedPose(`${index}.md`).along, along);
        }
      }
      assert.ok(view.renderedCards.length < 65);
    }
  });
}

for (const orientation of ['horizontal', 'vertical']) for (const model of ['drawer', 'fan']) {
  test(`${orientation} ${model}: Branch overlay follows real Deck motion and drag cleanup`, async t => {
    const s = await subject(t, orientation, model, true), {view, window} = s;
    const card = await prepareDeskDrag(s);
    Object.assign(window, {
      createEl: tag => window.document.createElement(tag),
      createDiv: () => window.document.createElement('div'),
      createSvg: tag => window.document.createElementNS('http://www.w3.org/2000/svg', tag),
    });
    const controller = new s.LocalBranchViewController({
      activeDocument: window.document, canShowView: () => true, placement: () => 'auto', orientation: () => orientation,
      showTooltips: () => false, previewLinksOnHover: () => false, setIcon() {},
      modelForPath: path => ({activePath: path, activeAddress: path, expandedDepartureId: null, relationships: [],
        strands: [{id:'current',role:'current',nodes:[{path,address:path,title:path,duplicateIndex:0,duplicateCount:1,departures:[]}],selectedPath:path,knownBeginning:true,knownEnd:true}],
        navigation:{backward:[],forward:[],beginning:[],inferred:[],explicit:[],higher:[]}}),
      chooseDeparture: async () => null, activate() {}, preview() {}, runAfterEditing: (_, action) => action(),
    });
    view.localBranchView = controller;
    view.syncLocalBranchViewOwner = () => s.DeckView.prototype.syncLocalBranchViewOwner.call(view);
    view.updateActiveUi();
    t.after(() => controller.disconnect());
    const layer = view.spaceEl.querySelector('.slipbox-local-branch-layer');
    assert.ok(layer);
    assert.equal(layer.style.transform, card.style.transform);
    view.moveViewportByPixels(10);
    await s.frame(s.time() + 40);
    const owner = view.renderedCards.find(c => c.dataset.path === view.deckViewport.anchorPath);
    assert.equal(layer.style.transform, owner.style.transform);
    const branchRoot = layer.firstElementChild;
    for (const end of ['pointercancel', 'pointerup']) {
      window.document.elementsFromPoint = () => [];
      const header = await startDeskDrag(s, owner);
      assert.equal(layer.hidden, true);
      s.pointer(header, end, 30, 22);
      assertDragCleared(s, owner);
      assert.equal(layer.hidden, false);
      assert.equal(layer.firstElementChild, branchRoot);
      assert.equal(layer.style.transform, owner.style.transform);
    }
  });
}
