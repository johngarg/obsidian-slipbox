import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

// Exercise the real view's wheel-to-frame wiring without requiring Obsidian's UI.
const output = await build({ stdin: { contents: `
  export { CardDimensionsController } from './src/card-dimensions.ts';
  export { DeckView } from './src/deck-view.ts';
  export { DeckViewport } from './src/deck-viewport.ts';
  export { DeckFrameScheduler } from './src/deck-frame.ts';
  export { DeckTransition } from './src/deck-transition.ts';
  export { DeckWheelController } from './src/deck-wheel.ts';
`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'cjs', platform: 'node', external: ['obsidian'] });
const module = { exports: {} };
const actualRequire = createRequire(import.meta.url);
const obsidian = new Proxy({}, { get: () => class {} });
runInNewContext('(function(require, module, exports) {' + output.outputFiles[0].text + '\n})')(
  name => name === 'obsidian' ? obsidian : actualRequire(name), module, module.exports,
);
const { CardDimensionsController, DeckView, DeckViewport, DeckFrameScheduler, DeckTransition, DeckWheelController } = module.exports;

function subject(model = 'drawer') {
  const window = new Window();
  const stage = window.document.createElement('div');
  window.document.body.append(stage);
  Object.defineProperties(stage, { clientWidth: { value: 1200 }, clientHeight: { value: 800 }, win: { value: window } });
  const cards = Array.from({ length: 20 }, (_, index) => ({ path: `${index}.md` }));
  const pending = new Map();
  const calls = { positions: 0, active: 0, bookmarks: 0, windows: 0, gates: 0 };
  let sequence = 0;
  const view = Object.create(DeckView.prototype);
  Object.assign(view, {
    localBranchView: { updatePosition() {} },
    stageEl: stage, contentEl: stage, spaceEl: null, renderedCards: [], inlineEdit: null,
    deckViewport: new DeckViewport(), wheelController: new DeckWheelController(), wheelGestureTimer: null,
    drawerTransition: new DeckTransition(),
    deskRenderer: { positionPiles: () => true },
    plugin: { settings: { deckOrientation: 'vertical', deckStackModel: model, mainCardSize: 'medium', cardSpread: 0.1,
      cardSplay: 0, cardFadeStrength: 1, wheelOverCardBody: 'deck', allowCardScrolling: true },
      index: { snapshot: { filed: cards }, filedIndexForPath: path => cards.findIndex(card => card.path === path) },
      startupDeckPositionMode: 'centered', bookmarks: { items: [] } },
    spaceOffsetX: 0, spaceOffsetY: 0, pointerLastX: null, viewportCenteringFrame: null,
    viewedCardSession: { snapshot: null }, cardFocus: null, viewedFocusFromDeckNavigation: false,
    positionCards: () => { calls.positions++; return true; },
    updateActiveUi: () => { calls.active++; },
    renderBookmarkEdgeTabs: () => { calls.bookmarks++; },
    queueRenderWindowRefresh: () => { calls.windows++; },
    runAfterInlineEditing: (_reason, action) => { calls.gates++; action(); return Promise.resolve(true); },
  });
  view.deckFrames = new DeckFrameScheduler({
    request: callback => { pending.set(++sequence, callback); return sequence; },
    cancel: handle => pending.delete(handle),
    flush: changed => view.flushDeckMotion(changed),
  });
  view.deckViewport.navigate('4.md', cards);
  view.attachBrowsingEvents(stage);
  return { view, calls, pending, cards,
    wheel(delta, target = stage) { const event = new window.WheelEvent('wheel', {
      deltaX: view.plugin.settings.deckOrientation === 'horizontal' ? delta : 0,
      deltaY: view.plugin.settings.deckOrientation === 'vertical' ? delta : 0,
      bubbles: true, cancelable: true,
    }); target.dispatchEvent(event); return event; },
    frame() { const jobs = [...pending.values()]; pending.clear(); jobs.forEach(job => job()); },
  };
}

for (const model of ['drawer', 'fan']) {
  test(`${model}: retain only the gesture target until idle, then refresh the rendered window`, (t) => {
    const value = subject(model);
    const { view } = value;
    const timers = new Map();
    let sequence = 0;
    t.mock.method(view.contentEl.win, 'setTimeout', (callback, delay) => {
      assert.equal(delay, 180);
      timers.set(++sequence, callback);
      return sequence;
    });
    t.mock.method(view.contentEl.win, 'clearTimeout', handle => timers.delete(handle));
    const card = view.stageEl.ownerDocument.createElement('article');
    card.dataset.path = '4.md'; card.className = 'slipbox-card';
    card.hasClass = name => card.classList.contains(name);
    const body = card.appendChild(view.stageEl.ownerDocument.createElement('div'));
    body.className = 'slipbox-card-scroll';
    view.stageEl.append(card); view.renderedCards = [card];
    const other = view.stageEl.ownerDocument.createElement('article');
    other.hasClass = () => false;
    value.wheel(56, body); value.wheel(56, body);
    assert.equal(view.retainMountedCard(card, view.deckGeometry(), false), true);
    assert.equal(view.retainMountedCard(other, view.deckGeometry(), false), false);
    assert.equal(timers.size, 1);
    [...timers.values()][0]();
    assert.equal(view.retainMountedCard(card, view.deckGeometry(), false), false);
    assert.equal(timers.size, 0);
    assert.equal(value.calls.windows, 1);
    // Header targets stay connected too, and a view reset cancels their timer.
    value.wheel(56, card);
    assert.equal(view.retainMountedCard(card, view.deckGeometry(), false), true);
    view.resetWheelGesture();
    assert.equal(view.retainMountedCard(card, view.deckGeometry(), false), false);
    assert.equal(timers.size, 0);
    view.deckFrames.cancel();
  });

  test(`${model}: a wheel transaction keeps browsing after its starting body loses focus`, () => {
    for (const policy of ['body-first', 'deck']) {
      const value = subject(model);
      const { view } = value;
      view.plugin.settings.wheelOverCardBody = policy;
      view.renderedCards = value.cards.map(({ path }) => {
        const card = view.stageEl.ownerDocument.createElement('article');
        card.dataset.path = path;
        const body = card.appendChild(view.stageEl.ownerDocument.createElement('div'));
        body.className = 'slipbox-card-scroll';
        view.stageEl.append(card);
        return card;
      });
      const body = view.renderedCards[4].firstChild;
      for (let i = 0; i < 8; i++) assert.equal(value.wheel(56, body).defaultPrevented, true);
      assert.equal(view.deckViewport.position(value.cards), 12);
      assert.equal(view.deckViewport.anchorPath, '12.md');
      assert.equal(value.calls.gates, 8);
      assert.equal(value.pending.size, 1);
      view.deckFrames.cancel();
    }
  });

  test(`${model}: boundary resistance forwards a large event's excess immediately`, () => {
    const value = subject(model);
    const { view } = value;
    view.plugin.settings.wheelOverCardBody = 'body-first';
    const card = view.stageEl.ownerDocument.createElement('article');
    card.dataset.path = '4.md';
    const body = card.appendChild(view.stageEl.ownerDocument.createElement('div'));
    body.className = 'slipbox-card-scroll';
    Object.defineProperties(body, { scrollHeight: { value: 1000 }, clientHeight: { value: 400 } });
    body.scrollTop = 600;
    view.stageEl.append(card);
    view.renderedCards = [card];
    value.wheel(320, body); value.wheel(16, body);
    assert.ok(Math.abs(view.deckViewport.position(value.cards) - (4 + 288 / 56)) < 1e-9);
    assert.equal(value.calls.gates, 2);
    view.deckFrames.cancel();
  });

  test(`${model}: actual wheel listener preserves ordered selection and paints one frame per burst`, () => {
    const value = subject(model);
    assert.equal(value.wheel(33.6).defaultPrevented, true);
    value.wheel(-5.6);
    assert.equal(value.view.deckViewport.anchorPath, '5.md');
    assert.equal(value.view.deckViewport.position(value.cards), 4.5);
    assert.equal(value.pending.size, 1);
    assert.equal(value.calls.positions, 0);
    value.frame();
    assert.equal(value.calls.positions, 1);
    assert.equal(value.calls.active, 1);
    assert.equal(value.calls.windows, 1);
    assert.equal(value.calls.gates, 2);
    value.view.deckFrames.cancel();
  });
  test(`${model}: fractional motion leaves selection UI alone`, () => {
    const value = subject(model);
    value.wheel(1); value.wheel(1); value.wheel(1);
    value.frame();
    assert.equal(value.calls.positions, 1);
    assert.equal(value.calls.active, 0);
    assert.equal(value.calls.bookmarks, 1);
    value.view.deckFrames.cancel();
  });
}

for (const orientation of ['vertical', 'horizontal']) {
  test(`${orientation}: trackpad bursts translate the stack immediately through anchor changes and reversal`, (t) => {
    const value = subject();
    const { view } = value;
    view.plugin.settings.deckOrientation = orientation;
    // No elapsed animation time: direct gesture displacement must still appear
    // on the next frame, even when every input restarts the reading-gap animation.
    t.mock.method(view.contentEl.win.performance, 'now', () => 0);
    const card = view.contentEl.ownerDocument.createElement('div');
    card.dataset.index = '0'; card.dataset.path = '0.md';
    view.renderedCards = [card];
    view.positionCards = geometry => DeckView.prototype.positionCards.call(view, geometry);
    view.positionCards();
    const start = view.drawerTransition.displayedPose('0.md').along;
    const step = view.cardStep();
    value.wheel(step); value.wheel(step); value.wheel(-step / 2);
    value.frame();
    assert.equal(view.deckViewport.position(value.cards), 5.5);
    assert.equal(view.drawerTransition.displayedPose('0.md').along, start - 1.5 * step);
    // Small momentum events within one anchor must move the transition origin too.
    value.wheel(step / 10); value.frame();
    assert.ok(Math.abs(view.drawerTransition.displayedPose('0.md').along - (start - 1.6 * step)) < 1e-9);
    // Only the accepted distance at the end of the deck translates the stack.
    value.wheel(100000); value.frame();
    assert.equal(view.deckViewport.position(value.cards), 19);
    assert.ok(Math.abs(view.drawerTransition.displayedPose('0.md').along - (start - 15 * step)) < 1e-9);
    value.wheel(-100000); value.frame();
    assert.equal(view.deckViewport.position(value.cards), 0);
    assert.ok(Math.abs(view.drawerTransition.displayedPose('0.md').along) < 1e-9);
    view.deckFrames.cancel();
  });
}

test('a failed inline-edit gate prevents wheel movement and scheduling', () => {
  const value = subject();
  value.view.runAfterInlineEditing = () => Promise.resolve(false);
  value.wheel(80);
  assert.equal(value.view.deckViewport.anchorPath, '4.md');
  assert.equal(value.view.deckViewport.position(value.cards), 4);
  assert.equal(value.pending.size, 0);
});

test('selection interactivity updates even when focus already updated the anchor CSS class', () => {
  const value = subject('fan');
  const { view } = value;
  const cards = ['4.md', '5.md'].map((path, index) => {
    const element = view.stageEl.ownerDocument.createElement('div');
    element.dataset.path = path; element.dataset.filedIndex = String(index + 4);
    element.toggleClass = (name, enabled) => element.classList.toggle(name, enabled);
    element.hasClass = name => element.classList.contains(name);
    element.toggleClass('is-deck-anchor', index === 0);
    view.stageEl.append(element);
    return element;
  });
  const interactive = [];
  view.renderedCards = cards;
  view.deckInteractivity = new WeakMap([[cards[0], true], [cards[1], false]]);
  view.viewedCardEl = null;
  view.cardFooters = { setInteractive: (card, active) => interactive.push([card.dataset.path, active]) };
  view.cardSignatures = { setInteractive() {} };
  view.syncLocalBranchViewOwner = () => {};
  view.updateDeckMapActiveUi = () => {};
  value.wheel(33.6);
  view.applyCardFocusClasses();
  DeckView.prototype.updateActiveUi.call(view);
  assert.deepEqual(interactive, [['4.md', false], ['5.md', true]]);
  DeckView.prototype.updateActiveUi.call(view);
  assert.equal(interactive.length, 2);
  view.deckFrames.cancel();
});


test('steady wheel input uses cached fractional CSS dimensions without reading layout', () => {
  const value = subject('fan');
  const stage = value.view.stageEl;
  stage.createDiv = () => { const element = stage.ownerDocument.createElement('div'); stage.append(element); return element; };
  let reads = 0;
  const dimensions = new CardDimensionsController({width:840,height:560}, {
    requestLayout() {}, changed() {}, measure() { reads++; return {width:480.5,height:288.25}; },
  });
  dimensions.mount(stage);
  value.view.cardDimensions = dimensions;
  assert.equal(reads, 1);
  for (let n = 0; n < 100; n++) {
    value.wheel(0.28825); value.frame();
    value.wheel(-0.28825); value.frame();
  }
  assert.equal(reads, 1);
  assert.ok(Math.abs(value.view.deckViewport.position(value.cards) - 4) < 1e-10);
  assert.equal(value.view.cardStep(), 288.25 * 0.1);
  dimensions.dispose(); value.view.deckFrames.cancel();
});
