import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {cleanSettingsPatch} from '../worker/home.js';

test('favorite apps accept a bounded ordered list and reject duplicates or unsupported apps',()=>{
 const selected=['stats','weather','news','calendar','timer','worldclock'];
 const result=cleanSettingsPatch({favoriteApps:selected});
 assert.deepEqual(result.favoriteApps,selected);assert.notEqual(result.favoriteApps,selected);
 assert.deepEqual(cleanSettingsPatch({favoriteApps:[]}),{favoriteApps:[]});
 for(const favoriteApps of [null,'stats',{},['unknown'],['stats','stats'],[null],Array(7).fill('clock'),[...selected,'tasks']])assert.throws(()=>cleanSettingsPatch({favoriteApps}));
});

test('favorites render separately, sync in order, and undo through the regular settings pipeline',async()=>{
 const source=await readFile(new URL('../web/features.js',import.meta.url),'utf8');
 const appIds=['clock','weather','timer','stats','background','settings','calendar','tasks','news','today','transit','sports','entertainment','worldclock'];
 const tiles=appIds.map(id=>({dataset:{app:id},style:{setProperty(){}},focus(){}}));
 const storage=new Map(),elements=new Map(),hooks=[],writes=[],intervals=[];
 let context,favoriteRenders=0;
 const element=()=>{
  let markup='';
  return{style:{setProperty(){}},setAttribute(){},addEventListener(){},querySelector(){return null},insertAdjacentHTML(){},hidden:false,get innerHTML(){return markup},set innerHTML(value){markup=value;if(this.id==='favorite-apps'){favoriteRenders++;if(context?.document.activeElement?.parentElement===this)context.document.activeElement=null}}};
 };
 const rail={...element(),before:node=>elements.set('#'+node.id,node),appendChild:tile=>{const index=tiles.indexOf(tile);tiles.splice(index,1);tiles.push(tile)},querySelector:selector=>tiles.find(tile=>selector.includes('"'+tile.dataset.app+'"'))};
 elements.set('#tiles',rail);
 const query=selector=>{if(selector==='#favorite-apps')return elements.get(selector)||null;if(!elements.has(selector))elements.set(selector,element());return elements.get(selector)};
 let saved={},revision=1,now=Date.now(),powerSaving=false,stateReads=0;
 const MockDate=class extends Date{static now(){return now}};
 const contextData={AbortController,structuredClone,Date:MockDate,currentPanel:'',settingsTab:'general',settingsTabs:[],selectedTile:0,prefs:{idle:45,clock24:true,keepAwake:false},locationData:null,backgroundChoice:{kind:'preset',id:'gray',dim:.3},wakeLock:null,navigator:{onLine:true},document:{activeElement:null,hidden:false,createElement:element,addEventListener(){}},
  $:query,$$:selector=>selector==='#tiles .tile'?tiles:[],icon:id=>'<svg aria-hidden="true" data-icon="'+id+'"></svg>',get:(key,fallback)=>storage.has(key)?storage.get(key):fallback,set:(key,value)=>{storage.set(key,value);context.home?.preferenceChanged(key)},applyBackground:value=>{context.backgroundChoice=value;contextData.set('background',value)},selectTile(){},keepPanelDrafts:render=>render(),
  AuraDesign:{init(){},snapshot:()=>({}),powerSaving:()=>powerSaving,tick(){},apply(){},applyRemote(){}},AuraHub:{init(){},titles:{news:'ニュース',today:'今日のまとめ',transit:'交通',sports:'スポーツ',entertainment:'映画・アニメ',worldclock:'世界時計'},snapshot:()=>({}),update(){},apply(){}},GoogleCalendar:{init(){}},
  setTimeout:()=>1,clearTimeout(){},setInterval:callback=>{intervals.push(callback);return intervals.length},
  window:{addEventListener(){},AuraExperience:{init(){},preferenceChanged:(key,current,previous)=>hooks.push({key,current,previous})}},
  fetch:async(url,options)=>{if(url==='/api/settings'){const body=JSON.parse(options.body);writes.push(body.patch);saved={...saved,...body.patch};return{ok:true,json:async()=>({settings:saved,revision:++revision,updatedAt:new Date().toISOString()})}}stateReads++;return{ok:true,json:async()=>({settings:saved,revision,updatedAt:null,tasks:[],timers:[],events:[],calendars:[],account:{}})}}
 };
 context=vm.createContext(contextData);vm.runInContext(source+'\nglobalThis.home=Home;',context);context.home.init();await new Promise(resolve=>setImmediate(resolve));
 const originalOrder=tiles.map(tile=>tile.dataset.app);
 context.home.setFavorites(['stats','weather','news']);
 assert.deepEqual(Array.from(context.home.favorites()),['stats','weather','news']);
 assert.deepEqual(tiles.map(tile=>tile.dataset.app),originalOrder);
 const markup=elements.get('#favorite-apps').innerHTML;
 assert.match(markup,/data-app="stats"/);assert.match(markup,/data-app="weather"/);assert.equal(elements.get('#favorite-apps').hidden,false);
 assert.deepEqual(Array.from(context.home.getState().settings.favoriteApps),['stats','weather','news']);
 assert.equal(hooks.length,1);assert.equal(hooks[0].key,'favorite-apps');assert.deepEqual(Array.from(hooks[0].previous.favoriteApps),[]);
 assert.equal(await context.home.syncSettings(),true);assert.deepEqual(writes.at(-1).favoriteApps,['stats','weather','news']);
 const favoriteFocus={parentElement:elements.get('#favorite-apps'),closest:()=>null},renderCount=favoriteRenders;context.document.activeElement=favoriteFocus;
 await context.home.reload();assert.equal(favoriteRenders,renderCount);assert.equal(context.document.activeElement,favoriteFocus);
 context.document.activeElement=null;
 assert.equal(context.home.restorePreferences(hooks[0].previous),true);assert.equal(hooks.length,1);assert.equal(elements.get('#favorite-apps').hidden,true);
 assert.equal(await context.home.syncSettings(),true);assert.deepEqual(writes.at(-1).favoriteApps,[]);
 const baselineReads=stateReads;
 powerSaving=true;now+=30000;intervals[0]();assert.equal(stateReads,baselineReads);
 now+=90000;intervals[0]();await new Promise(resolve=>setImmediate(resolve));assert.equal(stateReads,baselineReads+1);
 powerSaving=false;now+=30000;intervals[0]();await new Promise(resolve=>setImmediate(resolve));assert.equal(stateReads,baselineReads+2);
});
