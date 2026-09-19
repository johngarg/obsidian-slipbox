import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const output = await build({ stdin: { contents: `
  export { DeckView } from './src/deck-view.ts';
  export { DeckTransition } from './src/deck-transition.ts';
  export { DeckViewport } from './src/deck-viewport.ts';
  export { default as SlipboxPlugin } from './src/main.ts';
  export { DEFAULT_SETTINGS, normalizeSettings, resolvedDeckKeybindings } from './src/settings.ts';
`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'cjs', platform: 'node', external: ['obsidian'] });
const module = { exports: {} };
const actualRequire = createRequire(import.meta.url);
const notices = [];
const obsidian = new Proxy({ Notice: class { constructor(message) { notices.push(message); } } }, {
  get: (target, key) => target[key] ?? class {},
});
runInNewContext('(function(require, module, exports) {' + output.outputFiles[0].text + '\n})')(
  name => name === 'obsidian' ? obsidian : actualRequire(name), module, module.exports,
);
const { DeckView, DeckViewport, DeckTransition, SlipboxPlugin, DEFAULT_SETTINGS, normalizeSettings, resolvedDeckKeybindings } = module.exports;
const css = readFileSync('styles.css', 'utf8');

function subject(orientation = 'vertical', model = 'fan') {
  const window = new Window();
  const stage = window.document.createElement('div');
  window.document.body.append(stage);
  stage.toggleClass = (name, on) => stage.classList.toggle(name, on);
  Object.defineProperties(stage, { clientWidth: { value: 1800, configurable: true }, clientHeight: { value: 1200, configurable: true }, win: { value: window } });
  const space = window.document.createElement('div');
  stage.append(space);
  space.addClass = name => space.classList.add(name);
  space.removeClass = name => space.classList.remove(name);
  Object.defineProperty(space, 'win', { value: window });
  const cards = Array.from({ length: 20 }, (_, index) => ({ path: `${index}.md` }));
  const view = Object.create(DeckView.prototype);
  Object.assign(view, {
    stageEl: stage, contentEl: stage, spaceEl: space, spaceRecenteringTimer: null,
    deckViewport: new DeckViewport(), drawerTransition: new DeckTransition(), renderedCards: [], viewportCenteringFrame: null,
    spaceOffsetX: 70, spaceOffsetY: 90, inlineEdit: null, inlineEditStarting: false, cardFocus: null,
    viewedFilingEditor: null, deskRenderer: { filingInput: null },
    plugin: { settings: { ...DEFAULT_SETTINGS, deckOrientation: orientation, deckStackModel: model },
      index: { snapshot: { filed: cards }, filedIndexForPath: path => cards.findIndex(card => card.path === path) },
      startupDeckPositionMode: 'bottom' },
    updateActiveUi() {}, renderBookmarkEdgeTabs() {}, queueRenderWindowRefresh() {}, positionCards() { return true; },
  });
  view.deckViewport.navigate('4.md', cards);
  view.deckViewport.placeAt(3.5, cards);
  return { view, cards, window, close: () => { view.cancelSpaceRecentering(); window.happyDOM.abort(); } };
}

for (const orientation of ['horizontal', 'vertical']) {
  for (const model of ['drawer', 'fan']) {
    test(`${orientation} ${model}: positioning preserves the untouched coordinate and pan`, () => {
      const { view, cards, close } = subject(orientation, model);
      const orthogonal = orientation === 'vertical' ? 'left' : 'top';
      const along = orientation === 'vertical' ? 'bottom' : 'right';
      view.positionDeck(orthogonal);
      assert.equal(view.deckViewport.position(cards), 3.5);
      assert.equal(view.spaceOffsetX, orientation === 'vertical' ? 0 : 70);
      assert.equal(view.spaceOffsetY, orientation === 'vertical' ? 90 : 0);
      view.positionDeck(along);
      assert.equal(view.deckViewport.position(cards), 4);
      assert.equal(view.spaceOffsetX, 0);
      assert.equal(view.spaceOffsetY, 0);
      assert.equal(view.deckViewport.horizontalPositionModeOverride, orientation === 'vertical' ? 'left' : 'right');
      assert.equal(view.deckViewport.positionModeOverride, orientation === 'vertical' ? 'bottom' : 'top');
      view.spaceOffsetX = -100; view.spaceOffsetY = 80;
      view.deckViewport.placeAt(4.25, cards);
      view.positionDeck('centered');
      assert.equal(view.deckViewport.position(cards), 4);
      assert.equal(view.deckViewport.horizontalPositionModeOverride, 'centered');
      assert.equal(view.deckViewport.positionModeOverride, 'centered');
      assert.equal(view.spaceOffsetX, 0); assert.equal(view.spaceOffsetY, 0);
      close();
    });
  }
}

test('view geometry and CSS receive the same resolved horizontal anchor on resize', () => {
  const { view, window, close } = subject('horizontal');
  const card = window.document.createElement('div');
  card.dataset.index = '4';
  view.renderedCards = [card];
  view.deckCardsEl = window.document.createElement('div');
  view.updatePileAnchorFromDeck = () => true;
  view.deckViewport.setPositionMode('left');
  let geometry = view.deckGeometry();
  assert.equal(geometry.anchorCenterX, 432);
  assert.equal(geometry.anchorCoordinate, geometry.anchorCenterX);
  DeckView.prototype.positionCards.call(view, geometry);
  assert.equal(view.deckCardsEl.style.getPropertyValue('--slipbox-deck-center-x'), '432px');
  Object.defineProperty(view.stageEl, 'clientWidth', { value: 600 });
  view.deckViewport.setPositionMode('right');
  geometry = view.deckGeometry();
  assert.equal(geometry.anchorCenterX + 420, 588);
  assert.equal(geometry.anchorCoordinate, geometry.anchorCenterX);
  close();
});

test('bottom headers replace footers and restore them without replacing card elements', () => {
  const { view, window, close } = subject();
  const style = window.document.createElement('style'); style.textContent = css; window.document.head.append(style);
  const deck = window.document.createElement('div'); deck.className = 'slipbox-deck-cards'; view.stageEl.append(deck);
  const card = window.document.createElement('div'); card.className = 'slipbox-card'; deck.append(card);
  card.toggleClass = (name, on) => card.classList.toggle(name, on);
  const frame = window.document.createElement('div'); frame.className = 'slipbox-card-frame'; card.append(frame);
  for (const [className, text] of [['slipbox-card-address-row', 'Header'], ['slipbox-card-scroll', 'Body'], ['slipbox-card-footer', 'Backlinks']]) {
    const element = window.document.createElement('div'); element.className = className; element.textContent = text; frame.append(element);
  }
  const header = card.querySelector('.slipbox-card-address-row');
  const footer = card.querySelector('.slipbox-card-footer');
  const body = card.querySelector('.slipbox-card-scroll'); body.scrollTop = 100;
  view.plugin.settings = { ...view.plugin.settings, fanHeadersAtBottom: true };
  view.updateCardHeaderPlacement(card, 5, 4);
  assert.equal(window.getComputedStyle(footer).display, 'none');
  assert.equal(window.getComputedStyle(header).order, '1');
  for (const index of [4, 3]) {
    view.updateCardHeaderPlacement(card, index, 4);
    assert.notEqual(window.getComputedStyle(footer).display, 'none');
    assert.notEqual(window.getComputedStyle(header).order, '1');
  }
  for (const change of [{ deckOrientation: 'horizontal' }, { deckStackModel: 'drawer' }, { fanHeadersAtBottom: false }]) {
    const before = view.plugin.settings; view.plugin.settings = { ...before, ...change };
    view.updateCardHeaderPlacement(card, 5, 4);
    assert.notEqual(window.getComputedStyle(footer).display, 'none');
    view.plugin.settings = before;
  }
  assert.equal(card.querySelector('.slipbox-card-address-row'), header);
  assert.equal(card.querySelector('.slipbox-card-footer'), footer);
  assert.equal(body.scrollTop, 100);
  footer.remove(); view.updateCardHeaderPlacement(card, 5, 4);
  assert.equal(window.getComputedStyle(header).order, '1');
  close();
});

test('orientation toggles use settings persistence and preserve view browsing state through refresh', async () => {
  const { view, cards, close } = subject();
  const plugin = Object.create(SlipboxPlugin.prototype);
  const saved = []; const configs = [];
  Object.assign(plugin, { settings: normalizeSettings(view.plugin.settings),
    indexRuntime: { configure: config => configs.push(config) },
    persistState: async () => { saved.push(plugin.settings.deckOrientation); },
    refreshDeckViews: async () => { await view.refresh(); },
  });
  view.plugin = Object.assign(plugin, { index: view.plugin.index });
  view.deckViewport.setPositionMode('right'); view.deckViewport.setPositionMode('top');
  view.filingSession = { refresh() {}, isActive: false };
  view.reconcileScrollPositions = () => {};
  view.reconcileCardFocus = () => {};
  view.renderDeck = async () => {};
  const before = JSON.stringify(view.deckViewport.snapshot);
  for (const expected of ['horizontal', 'vertical']) {
    await plugin.toggleDeckOrientation();
    assert.equal(plugin.settings.deckOrientation, expected);
    assert.equal(JSON.stringify(view.deckViewport.snapshot), before);
    assert.equal(view.deckViewport.position(cards), 3.5);
    assert.equal(view.spaceOffsetX, 70); assert.equal(view.spaceOffsetY, 90);
    const keys = resolvedDeckKeybindings(plugin.settings)['previous-card'].map(binding => binding.key);
    assert.ok(keys.includes(expected === 'vertical' ? 'ArrowUp' : 'ArrowLeft'));
  }
  assert.deepEqual(saved, ['horizontal', 'vertical']);
  assert.equal(configs.length, 2);
  close();
});

test('failed edit completion prevents the orientation action', async () => {
  const { view, close } = subject(); let toggles = 0;
  view.plugin.toggleDeckOrientation = async () => { toggles++; };
  view.canRunActionForTarget = () => true;
  view.inlineEdit = {};
  view.runAfterInlineEditing = async () => false;
  view.runAction('toggle-deck-orientation');
  await Promise.resolve();
  assert.equal(toggles, 0);
  close();
});

test('orientation persistence errors become a settings notice', async () => {
  const { view, close } = subject();
  view.plugin.toggleDeckOrientation = async () => { throw new Error('disk full'); };
  view.performAction('toggle-deck-orientation', null, null, null);
  await Promise.resolve(); await Promise.resolve();
  assert.match(notices.at(-1), /Could not save Slipbox Desk settings/);
  assert.match(notices.at(-1), /disk full/);
  close();
});

for (const orientation of ['horizontal', 'vertical']) {
  for (const model of ['drawer', 'fan']) {
    test(`${orientation} ${model}: cached custom sizes drive geometry, steps and pile anchors`, () => {
      const { view, cards, window, close } = subject(orientation, model);
      const active = window.document.createElement('div');
      active.dataset.path = '4.md'; active.dataset.index = '4';
      view.renderedCards = [active];
      view.deckCardsEl = window.document.createElement('div');
      const before = JSON.stringify(view.deckViewport.snapshot);
      for (const dimensions of [{width:480,height:288}, {width:288,height:480}, {width:480.5,height:288.25}]) {
        view.cardDimensions = { snapshot: Object.freeze(dimensions) };
        view.drawerTransition = new DeckTransition();
        const geometry = view.deckGeometry();
        assert.equal(geometry.cardWidth, dimensions.width);
        assert.equal(geometry.cardHeight, dimensions.height);
        assert.equal(view.cardStep(), (orientation === 'vertical' ? dimensions.height : dimensions.width) * view.plugin.settings.cardSpread);
        DeckView.prototype.positionCards.call(view, geometry);
        if (orientation === 'horizontal') assert.equal(view.spaceEl.style.getPropertyValue('--slipbox-deck-top'), `${geometry.anchorCenterY - dimensions.height / 2}px`);
        assert.equal(JSON.stringify(view.deckViewport.snapshot), before);
        assert.equal(view.deckViewport.position(cards), 3.5);
        assert.equal(view.spaceOffsetX, 70); assert.equal(view.spaceOffsetY, 90);
      }
      close();
    });
  }
}
