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
    stageEl: stage, contentEl: stage, renderedCards: [], inlineEdit: null,
    deckViewport: new DeckViewport(), wheelController: new DeckWheelController(), drawerTransition: new DeckTransition(),
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
    wheel(deltaY) { const event = new window.WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }); stage.dispatchEvent(event); return event; },
    frame() { const jobs = [...pending.values()]; pending.clear(); jobs.forEach(job => job()); },
  };
}

for (const model of ['drawer', 'fan']) {
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
