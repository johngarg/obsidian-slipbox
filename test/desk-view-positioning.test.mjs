import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const output = await build({ stdin: { contents: `
  export { default as Plugin } from './src/main.ts';
  export { DeckView } from './src/deck-view.ts';
  export { DeckViewport } from './src/deck-viewport.ts';
  export { DeskRenderer } from './src/desk-view.ts';
  export { DeskService } from './src/desk-service.ts';
  export { DEFAULT_SETTINGS } from './src/settings.ts';
`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['obsidian'] });
const actualRequire = createRequire(import.meta.url);
const stylesheet = readFileSync('styles.css', 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));

// Real settings publication, Deck refresh, Desk rendering, and pointer handlers.
// The fixture supplies the Deck pane shell, host services and browser measurements.
async function subject(t, { orientation = 'horizontal', model = 'drawer', positions = [{ x: 400, y: 250 }, { x: -800, y: 200 }], expanded = false, hidden = false } = {}) {
  const window = new Window(), doc = window.document, menus = [], frames = new Map();
  let frameId = 0;
  window.requestAnimationFrame = cb => { frames.set(++frameId, cb); return frameId; };
  window.cancelAnimationFrame = id => frames.delete(id);
  Object.defineProperty(window.CSSStyleDeclaration.prototype, 'translate', { configurable: true,
    get() { return this.getPropertyValue('translate'); }, set(value) { this.setProperty('translate', value); } });
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
    removeClasses(names) { this.classList.remove(...names); }, hasClass(name) { return this.classList.contains(name); },
    toggleClass(name, on) { this.classList.toggle(name, on); }, setAttr(name, value) { this.setAttribute(name, value); },
    setText(value) { this.textContent = value; },
    setCssProps(props) { for (const [name, value] of Object.entries(props)) this.style.setProperty(name, value); },
    createEl(tag, options = {}) { const el = doc.createElement(tag); el.className = options.cls ?? ''; el.textContent = options.text ?? ''; for (const [name, value] of Object.entries(options.attr ?? {})) el.setAttribute(name, value); this.append(el); return el; },
    createDiv(options) { return this.createEl('div', options); }, createSpan(options) { return this.createEl('span', options); },
    setPointerCapture(id) { this.capture = id; }, hasPointerCapture(id) { return this.capture === id; }, releasePointerCapture() { this.capture = null; },
  });
  class TFile { constructor(path) { this.path = path; this.basename = path.replace('.md', ''); this.extension = 'md'; } }
  class Menu {
    constructor() { this.items = []; menus.push(this); }
    static forEvent() { return new Menu(); }
    addSeparator() { return this; }
    addItem(callback) { const item = { setTitle(title) { this.title = title; return this; }, setIcon() { return this; }, setSection() { return this; }, setWarning() { return this; }, setDisabled(value) { this.disabled = value; return this; }, onClick(cb) { this.click = cb; return this; } }; callback(item); this.items.push(item); return this; }
    showAtMouseEvent() {}
  }
  const obsidian = new Proxy({ TFile, Menu, setIcon() {}, Notice: class {}, Component: class { load() {} unload() {} },
    MarkdownRenderer: { async render(_app, body, el) { el.textContent = body; } } }, { get: (target, key) => target[key] ?? class {} });
  const module = { exports: {} };
  runInNewContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})', { HTMLElement: window.HTMLElement, Element: window.Element, CSS: window.CSS })(
    name => name === 'obsidian' ? obsidian : actualRequire(name), module, module.exports);
  const { Plugin, DeckView, DeckViewport, DeskRenderer, DeskService, DEFAULT_SETTINGS } = module.exports;
  const files = ['A.md', 'B.md', 'C.md'].map(path => new TFile(path));
  const filed = files.map((file, index) => ({ file, path: file.path, address: String(index + 1) }));
  const style = doc.createElement('style'); style.textContent = stylesheet; doc.head.append(style);
  const p = Object.create(Plugin.prototype), views = [], notices = [], created = [];
  Object.assign(p, { settings: { ...DEFAULT_SETTINGS, deckOrientation: orientation, deckStackModel: model, showTooltips: false, showBranchLabels: false, highlightBranchLinks: false },
    index: { snapshot: { filed }, fileAtPath: path => files.find(f => f.path === path), filedByFile: file => filed.find(c => c.file === file),
      filedByPath: path => filed.find(c => c.path === path), filedIndexForPath: path => filed.findIndex(c => c.path === path), readBody: async () => 'Card body', incomingBranchesForPath:()=>[], branchLinksForPath:()=>[] },
    indexRuntime: { configure() {} }, persistState: async () => {}, updateProblemStatusBarItem() {},
    cards: { color: () => null, displayTitle: file => file.basename, title: file => file.basename,
      async createAtDeskPosition(position) { created.push(plain(position)); } },
    bookmarks: { at: () => undefined }, deskCanvas: { hasActiveCanvas: () => false },
    app: { workspace: { getLeavesOfType: () => views.map(view => ({ view })) }, metadataCache: {} },
  });
  p.deskService = new DeskService({ indexRuntime: p.indexRuntime, refreshViews: () => p.refreshDeckViews(), notify: message => notices.push(message) });
  await p.deskService.replace({ piles: positions.map((position, i) => ({ id: `p${i}`, cards: [{cardRef: files[i].path, kind: 'filed'}], ...(position ? {position} : {}) })), expandedPileIds: expanded ? ['p0'] : [], unfiledPileId: null });
  async function addView(width = 1200, height = 800, pan = [37, -19]) {
    const content = doc.body.createDiv({cls:'view-content slipbox-deck-view'}), stage = content.createDiv({cls:'slipbox-deck-stage'}), space = stage.createDiv({cls:'slipbox-space'});
    const view = Object.create(DeckView.prototype);
    Object.assign(view, {localBranchView:{updatePosition(){}},plugin:p,contentEl:content,stageEl:stage,spaceEl:space,deckViewport:new DeckViewport(),
      inlineEdit:null,inlineEditStarting:false,recentInlineEditRefresh:null,viewportCenteringFrame:null,
      filingSession:{refresh(){},snapshot:null,isActive:false},cardScrollPositions:new Map(),viewedCardSession:{isViewing:()=>false,snapshot:null},viewedFilingEditor:null,
      cardFocus:{surface:'desk',path:'A.md',pileId:'p0'},spaceOffsetX:pan[0],spaceOffsetY:pan[1]});
    view.deckViewport.navigate('A.md',filed);
    const actions = {addDeckOrderingMenuItems: menu => view.addDeckOrderingMenuItems(menu),runAfterEditing:async (_reason,action)=>{await action();return true;},isDeskCardFocused:(path,pileId)=>view.cardFocus?.path===path&&view.cardFocus?.pileId===pileId,
      focusDeskCard:(path,pileId)=>{view.cardFocus={surface:'desk',path,pileId};},canRunAction:()=>false,runAction:()=>false,runCardAction:()=>false,filingInputFocusChanged(){}};
    view.deskRenderer=new DeskRenderer(p.app,p,actions);
    view.measure = {width,height,pileWidth:376,pileHeight:258,hidden,defaultTop:228};
    const rect=(x,y,w,h)=>new window.DOMRect(x,y,w,h);
    stage.getBoundingClientRect=()=>rect(0,0,view.measure.width,view.measure.height);
    space.getBoundingClientRect=()=>rect(pan[0],pan[1],view.measure.width,view.measure.height);
    Object.defineProperties(stage,{clientWidth:{get:()=>view.measure.hidden?0:view.measure.width},clientHeight:{get:()=>view.measure.hidden?0:view.measure.height}});
    view.installMeasurements=()=>{
      const {width:w,height:h,pileWidth:pw,pileHeight:ph,defaultTop:dt}=view.measure;
      const anchor=view.deskRenderer.pilesAnchorEl,guide=space.querySelector('.slipbox-desk-default-anchor');
      if(anchor)anchor.getBoundingClientRect=()=>rect(pan[0]+w/2-pw/2,pan[1]+h/2-ph/2,pw,ph);
      if(guide)guide.getBoundingClientRect=()=>p.settings.deckOrientation==='vertical'?rect(pan[0]+w-24-pw,pan[1]+24,pw,ph):rect(pan[0]+w/2-pw/2,pan[1]+dt-24-ph,pw,ph);
      for(const el of space.querySelectorAll('.slipbox-desk-pile'))el.getBoundingClientRect=()=>rect(pan[0]+w/2+parseFloat(el.style.getPropertyValue('--slipbox-pile-x'))-pw/2,pan[1]+h/2+parseFloat(el.style.getPropertyValue('--slipbox-pile-y'))-ph/2,pw,ph);
    };
    view.renderDeck=async()=>{
      view.deskRenderer.clear();space.replaceChildren();
      Object.assign(content.dataset,{deckOrientation:p.settings.deckOrientation,deckStackModel:p.settings.deckStackModel,deskCardSize:p.settings.deskCardSize});
      space.style.transform=`translate(${pan[0]}px, ${pan[1]}px)`;space.style.setProperty('--slipbox-deck-top',view.measure.defaultTop+'px');
      await view.deskRenderer.render(stage,space,null,null,()=>true);
      view.installMeasurements();
      view.deskRenderer.positionPiles?.();
    };
    views.push(view);await view.refresh();return view;
  }
  const view=await addView();await tick();
  t.after(()=>{for(const v of views)v.deskRenderer.clear();window.happyDOM.abort();});
  return {p,view,views,window,menus,notices,created,addView,
    pointer(target,type,x,y){target.dispatchEvent(new window.PointerEvent(type,{bubbles:true,cancelable:true,pointerId:7,button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y}));},
    pile:(id='p0',v=view)=>[...v.spaceEl.querySelectorAll('.slipbox-desk-pile')].find(el=>el.dataset.pileId===id),
    frame:async()=>{const jobs=[...frames.values()];frames.clear();jobs.forEach(cb=>cb(1000));await tick();},
  };
}

for(const orientation of ['horizontal','vertical'])for(const model of ['drawer','fan']){
  test(`${orientation} ${model}: automatic piles are placed once; new piles follow the new orientation`,async t=>{
    const s=await subject(t,{orientation,model,positions:[null,null],expanded:true});
    const original=plain(s.p.deskService.snapshot);
    assert.deepEqual(original.piles[0].position,orientation==='horizontal'?{x:0,y:-325}:{x:388,y:-247});
    assert.equal(s.pile().classList.contains('is-awaiting-position'),false);
    const before=coordinates(s);
    await s.p.toggleDeckOrientation();await tick();
    assert.deepEqual(coordinates(s),before);
    assert.deepEqual(plain(s.p.deskService.snapshot),original);
    await s.p.deskService.replace({...original,piles:[...original.piles,{id:'new',cards:[{cardRef:'C.md',kind:'filed'}]}]});await tick();
    const initialized=plain(s.p.deskService.snapshot),last=initialized.piles[2].position;
    assert.ok(Math.abs(last.x-(orientation==='horizontal'?433.12:45.12))<1e-9);
    assert.equal(last.y,orientation==='horizontal'?-175:-253);
    assert.deepEqual(initialized.piles.slice(0,2),original.piles);
    await s.p.deskService.replace({...initialized,piles:[initialized.piles[2],...initialized.piles.slice(0,2)]});
    await s.p.toggleDeckOrientation();await tick();
    assert.deepEqual(plain(s.p.deskService.snapshot.piles.map(p=>p.position)),[last,...original.piles.map(p=>p.position)]);
  });

  test(`${orientation} ${model}: size, pane and alignment changes do not rewrite Desk coordinates`,async t=>{
    const s=await subject(t,{orientation,model,positions:[{x:180.125,y:-110.375},{x:-150.25,y:100.875}],expanded:true});
    const original=plain(s.p.deskService.snapshot);
    for(const [width,height] of [[296,205],[376,258],[456,311],[311.75,206.5]])for(const top of [12,120,228]){
      Object.assign(s.view.measure,{pileWidth:width,pileHeight:height,defaultTop:top});
      await s.view.refresh();const before=coordinates(s);
      await s.p.toggleDeckOrientation();assert.deepEqual(coordinates(s),before);
      Object.assign(s.view.measure,{width:240,height:180});await s.view.refresh();
      const small=coordinates(s);await s.p.toggleDeckOrientation();assert.deepEqual(coordinates(s),small);
      assert.deepEqual(plain(s.p.deskService.snapshot),original);
      Object.assign(s.view.measure,{width:1200,height:800});
    }
  });
}

test('hidden and zero-size panes defer placement; the first visible pane wins for all views',async t=>{
  const s=await subject(t,{positions:[null,null],hidden:true});
  assert.equal(s.p.deskService.snapshot.piles[0].position,undefined);
  assert.equal(s.pile().classList.contains('is-awaiting-position'),true);
  const other=await s.addView(900,700,[-60.25,18.75]);other.measure.hidden=false;
  assert.equal(other.deskRenderer.positionPiles(),true);await tick();
  const initialized=plain(s.p.deskService.snapshot);
  assert.deepEqual(initialized.piles[0].position,{x:0,y:-275});
  s.view.measure.hidden=false;await s.view.refresh();
  const firstBefore=coordinates(s),secondBefore=coordinates(s,other);
  await s.p.toggleDeckOrientation();
  assert.deepEqual(coordinates(s),firstBefore);assert.deepEqual(coordinates(s,other),secondBefore);
  assert.deepEqual(plain(s.p.deskService.snapshot),initialized);
});

test('unavailable guide measurements and an unsettled Deck cannot initialize or reveal piles',async t=>{
  const s=await subject(t,{positions:[null],hidden:true});s.view.measure.hidden=false;
  assert.equal(s.view.deskRenderer.positionPiles(false),false);
  s.view.deskRenderer.defaultAnchorEl.getBoundingClientRect=()=>new s.window.DOMRect(0,0,0,258);
  assert.equal(s.view.deskRenderer.positionPiles(),false);
  assert.equal(s.p.deskService.snapshot.piles[0].position,undefined);
  assert.equal(s.pile().classList.contains('is-awaiting-position'),true);
  s.view.installMeasurements();assert.equal(s.view.deskRenderer.positionPiles(),true);await tick();
  assert.deepEqual(plain(s.p.deskService.snapshot.piles[0].position),{x:0,y:-325});
});

for(const orientation of ['horizontal','vertical']){
  for(const outcome of ['move','cancel'])test(`${orientation}: whole-pile ${outcome} after toggling uses workspace coordinates`,async t=>{
    const s=await subject(t,{orientation});await s.p.toggleDeckOrientation();
    const pile=s.pile(),state=plain(s.p.deskService.snapshot);
    s.window.document.elementsFromPoint=()=>[s.view.stageEl];
    s.pointer(pile,'pointerdown',20,20);await tick();s.pointer(pile,'pointermove',34,27);
    assert.equal(pile.style.translate,'14px 7px');
    s.pointer(pile,outcome==='cancel'?'pointercancel':'pointerup',34,27);await tick();
    assert.equal(pile.style.translate,'');assert.equal(pile.classList.contains('is-dragging'),false);
    if(outcome==='cancel')assert.deepEqual(plain(s.p.deskService.snapshot),state);
    else assert.deepEqual(plain(s.p.deskService.snapshot.piles[0].position),{x:414,y:257});
  });

  for(const outcome of ['workspace','pile','invalid','cancel'])test(`${orientation}: Desk-card ${outcome} after toggling`,async t=>{
    const s=await subject(t,{orientation,expanded:true});await s.p.toggleDeckOrientation();
    const card=s.pile().querySelector('.slipbox-desk-card'),state=plain(s.p.deskService.snapshot),target=s.pile('p1');
    s.window.document.elementsFromPoint=()=>outcome==='pile'?[target,s.view.stageEl]:[s.view.stageEl];
    s.pointer(card,'pointerdown',20,20);await tick();s.pointer(card,'pointermove',34,27);
    const end=outcome==='invalid'?[-10,100]:[90,100];
    s.pointer(card,outcome==='cancel'?'pointercancel':'pointerup',...end);await tick();
    assert.equal(card.style.translate,'');assert.equal(card.classList.contains('is-dragging'),false);
    const next=plain(s.p.deskService.snapshot);
    if(outcome==='invalid'||outcome==='cancel')assert.deepEqual(next,state);
    else if(outcome==='pile'){
      assert.equal(next.piles.length,1);assert.deepEqual(next.piles[0].position,state.piles[1].position);
      assert.equal(next.piles[0].cards.length,2);
    }else assert.deepEqual(next.piles.find(p=>p.cards.some(c=>c.cardRef==='A.md')).position,{x:-547,y:-281});
  });

  test(`${orientation}: Deck header drop, background creation and splitting share the stable frame`,async t=>{
    const s=await subject(t,{orientation});await s.p.toggleDeckOrientation();
    const deck=s.view.spaceEl.createDiv({cls:'slipbox-deck-cards'}),card=deck.createDiv({cls:'slipbox-card'}),header=card.createDiv({cls:'slipbox-card-address-row'});
    s.view.deckCardsEl=deck;s.view.runAfterInlineEditing=async(_reason,action)=>{await action();return true;};
    s.view.attachDeckCardDragging(header,card,s.p.index.filedByPath('C.md'));
    s.window.document.elementsFromPoint=()=>[s.view.stageEl];
    s.pointer(header,'pointerdown',20,20);await tick();s.pointer(header,'pointermove',30,20);s.pointer(header,'pointerup',90,100);await tick();
    assert.equal(card.parentElement,deck);assert.equal(card.style.translate,'');
    assert.deepEqual(plain(s.p.deskService.snapshot.piles.find(p=>p.cards.some(c=>c.cardRef==='C.md')).position),{x:-547,y:-168});
    s.view.stageEl.dispatchEvent(new s.window.MouseEvent('contextmenu',{bubbles:true,clientX:90,clientY:100}));
    await s.menus.at(-1).items.find(i=>i.title==='New card here').click();
    assert.deepEqual(s.created,[{x:-547,y:-281}]);
    const state=plain(s.p.deskService.snapshot),a=state.piles.find(p=>p.id==='p0');
    await s.p.deskService.replace({...state,piles:[{...a,cards:[...a.cards,{cardRef:'C.md',kind:'filed'}]},state.piles.find(p=>p.id==='p1')],expandedPileIds:['p0']});
    const source=s.pile().querySelector('[data-card-ref="C.md"]');
    source.dispatchEvent(new s.window.MouseEvent('contextmenu',{bubbles:true}));
    const split=s.menus.at(-1).items.find(i=>i.title==='Split into new pile');
    assert.ok(split,JSON.stringify(s.menus.at(-1).items.map(i=>i.title)));
    await split.click();await tick();
    assert.deepEqual(plain(s.p.deskService.snapshot.piles.find(p=>p.cards.some(c=>c.cardRef==='C.md')).position),{x:438,y:288});
  });
}

function coordinates(s,view=s.view){
  const root=s.window.getComputedStyle(view.deskRenderer.pilesAnchorEl);
  return {top:root.top,left:root.left,right:root.right,transform:root.transform,
    piles:[...view.spaceEl.querySelectorAll('.slipbox-desk-pile')].map(el=>({id:el.dataset.pileId,x:el.style.getPropertyValue('--slipbox-pile-x'),y:el.style.getPropertyValue('--slipbox-pile-y')}))};
}

for(const orientation of ['horizontal','vertical'])for(const model of ['drawer','fan']){
  test(`${orientation} ${model}: toggling with positioned edge piles preserves their coordinate frame`,async t=>{
    const s=await subject(t,{orientation,model}), before=coordinates(s), state=plain(s.p.deskService.snapshot),focus=plain(s.view.cardFocus),pan=s.view.spaceEl.style.transform;
    for(let i=0;i<4;i++){
      await s.p.toggleDeckOrientation();
      assert.deepEqual(coordinates(s),before);
      assert.deepEqual(plain(s.p.deskService.snapshot),state);
      assert.deepEqual(plain(s.view.cardFocus),focus);
      assert.equal(s.view.spaceEl.style.transform,pan);
    }
  });
}
