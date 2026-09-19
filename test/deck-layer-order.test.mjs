import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const output = await build({stdin:{contents:`
  export { DeckView } from './src/deck-view.ts';
  export { DeskRenderer } from './src/desk-view.ts';
`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',external:['obsidian']});
const actualRequire=createRequire(import.meta.url),css=readFileSync('styles.css','utf8');

function subject(t) {
  const window=new Window(),doc=window.document,menus=[],gates=[],actions=[];
  Object.assign(window.HTMLElement.prototype,{toggleClass(name,on){this.classList.toggle(name,on);},setCssProps(props){for(const [name,value] of Object.entries(props))this.style.setProperty(name,value);}});
  class Menu {
    constructor(){this.items=[];menus.push(this);}
    static forEvent(){return new Menu();}
    addItem(callback){const item={setTitle(value){this.title=value;return this;},setIcon(value){this.icon=value;return this;},setDisabled(value){this.disabled=value;return this;},setSection(value){this.section=value;return this;},setWarning(){return this;},onClick(callback){this.click=callback;return this;}};callback(item);this.items.push(item);return this;}
    addSeparator(){return this;}
    showAtMouseEvent(){}
  }
  const module={exports:{}};
  const obsidian=new Proxy({Menu},{get:(target,key)=>target[key]??class{}});
  runInNewContext('(function(require,module,exports){'+output.outputFiles[0].text+'\n})')(
    name=>name==='obsidian'?obsidian:actualRequire(name),module,module.exports);
  const {DeckView,DeskRenderer}=module.exports;
  const style=doc.createElement('style');style.textContent=css;doc.head.append(style);
  function view() {
    const content=doc.createElement('div');content.className='view-content slipbox-deck-view';
    const el=(tag,cls,parent,text='')=>{const node=doc.createElement(tag);node.className=cls;node.textContent=text;parent.append(node);return node;};
    const stage=el('div','slipbox-deck-stage',content),space=el('div','slipbox-space',stage);
    const deck=el('div','slipbox-deck-cards',space),card=el('article','slipbox-card',deck);
    el('div','slipbox-card-scroll',card,'Card text');
    const desk=el('div','slipbox-desk',space),piles=el('div','slipbox-desk-piles',desk);
    el('div','slipbox-desk-pile is-expanded',piles);
    const branchLayer=el('div','slipbox-local-branch-layer',space),branch=el('section','slipbox-local-branch-view',branchLayer);
    el('button','',branch,'Branch');
    doc.body.append(content);
    const v=Object.create(DeckView.prototype);
    Object.assign(v,{contentEl:content,stageEl:content.querySelector('.slipbox-deck-stage'),spaceEl:content.querySelector('.slipbox-space'),deckCardsEl:content.querySelector('.slipbox-deck-cards'),deckInFront:false,allow:true,
      app:{workspace:{trigger(name,menu){assert.equal(name,'file-menu');menu.addItem(i=>i.setTitle('Host file action'));}}},
      plugin:{cards:{title:()=> 'Example'},bookmarks:{at:()=>undefined},deskService:{contains:()=>false,snapshot:{piles:[{id:'p',position:{x:10.25,y:-40.5},cards:[{cardRef:'B.md',kind:'filed'}]}],expandedPileIds:['p']}}},
      runAfterInlineEditing:async(reason,action)=>{gates.push(reason);if(!v.allow)return false;await action();return true;},runAction:action=>actions.push(action),
    });
    const renderer=Object.create(DeskRenderer.prototype);
    Object.assign(renderer,{workspaceEl:v.stageEl,pilesAnchorEl:content.querySelector('.slipbox-desk-piles'),
      actions:{addDeckOrderingMenuItems:menu=>v.addDeckOrderingMenuItems(menu),canRunAction:()=>false,runAction:action=>actions.push(action)}});
    renderer.attachBackgroundMenu(v.stageEl);
    return v;
  }
  const v=view();t.after(()=>window.happyDOM.abort());
  const menu=(target=v,kind='deck')=>{
    const event=new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:200});
    if(kind==='workspace')target.stageEl.dispatchEvent(event);
    else target.showCardMenu(event,{path:'A.md'},'1',kind);
    return menus.at(-1);
  };
  return {v,view,window,menus,gates,actions,menu,front:m=>m.items.find(i=>i.title==='Bring Deck to front'),back:m=>m.items.find(i=>i.title==='Send Deck to back')};
}

for(const surface of ['deck','workspace']) {
  test(`${surface} menu raises and lowers only the Deck without replacing cards or changing Desk state`,async t=>{
    const s=subject(t),v=s.v,deck=v.deckCardsEl,body=deck.querySelector('.slipbox-card-scroll');
    const branch=v.spaceEl.querySelector('.slipbox-local-branch-layer'),desk=v.spaceEl.querySelector('.slipbox-desk');
    const snapshot=JSON.stringify(v.plugin.deskService.snapshot),branchStyle=branch.style.cssText,deskStyle=desk.style.cssText;
    body.scrollTop=123;v.spaceEl.setCssProps({transform:'translate(30px, -20px)'});
    let m=s.menu(v,surface);
    assert.equal(s.front(m).disabled,false);assert.equal(s.back(m).disabled,true);
    assert.equal(s.front(m).icon,'bring-to-front');assert.equal(s.back(m).icon,'send-to-back');
    await s.front(m).click();
    assert.equal(v.deckInFront,true);assert.equal(deck.classList.contains('is-in-front'),true);
    m=s.menu(v,surface);assert.equal(s.front(m).disabled,true);assert.equal(s.back(m).disabled,false);
    await s.back(m).click();
    assert.equal(v.deckInFront,false);assert.equal(deck.classList.contains('is-in-front'),false);
    assert.equal(v.deckCardsEl,deck);assert.equal(deck.querySelector('.slipbox-card-scroll'),body);assert.equal(body.scrollTop,123);
    assert.equal(branch.style.cssText,branchStyle);assert.equal(desk.style.cssText,deskStyle);
    assert.equal(v.spaceEl.style.transform,'translate(30px, -20px)');assert.equal(JSON.stringify(v.plugin.deskService.snapshot),snapshot);
    if(surface==='deck')assert(m.items.some(i=>i.title==='Host file action'));
    assert.deepEqual(s.gates,['deck-layer-order','deck-layer-order']);
  });
}

test('Deck ordering stays independent between panes and respects a failed editing gate',async t=>{
  const s=subject(t),other=s.view();
  s.v.allow=false;await s.front(s.menu()).click();assert.equal(s.v.deckInFront,false);
  s.v.allow=true;await s.front(s.menu()).click();
  assert.equal(s.v.deckInFront,true);assert.equal(other.deckInFront,false);assert.equal(other.deckCardsEl.classList.contains('is-in-front'),false);
  assert.equal(s.back(s.menu(other)).disabled,true);
});

test('viewed-card menus retain their own actions without offering Deck ordering',t=>{
  const s=subject(t),m=s.menu(s.v,'viewed');
  assert.equal(s.front(m),undefined);assert.equal(s.back(m),undefined);
  assert(m.items.some(i=>i.title==='Host file action'));
});

for(const orientation of ['horizontal','vertical'])for(const model of ['drawer','fan']) {
  test(`${orientation} ${model}: resting Deck order stays below Branch View and active drags`,async t=>{
    const s=subject(t),v=s.v;
    Object.assign(v.contentEl.dataset,{deckOrientation:orientation,deckStackModel:model});
    const z=el=>Number(s.window.getComputedStyle(el).zIndex);
    const desk=v.spaceEl.querySelector('.slipbox-desk'),branch=v.spaceEl.querySelector('.slipbox-local-branch-layer');
    assert(z(v.deckCardsEl)<z(desk));
    await s.front(s.menu()).click();assert(z(v.deckCardsEl)>z(desk));assert(z(v.deckCardsEl)<z(branch));
    desk.classList.add('is-dragging-item');assert(z(desk)>z(v.deckCardsEl));assert(z(desk)<z(branch));
    await s.back(s.menu()).click();desk.classList.remove('is-dragging-item');assert(z(v.deckCardsEl)<z(desk));
  });
}
