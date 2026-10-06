import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const sources=await Promise.all(['hub','features','app'].map(name=>readFile(new URL('../web/'+name+'.js',import.meta.url),'utf8')));
const [hubSource,featuresSource,appSource]=sources;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
function hubHarness(panel){
 const elements=new Map(),requests=[];
 const get=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',value:'',setAttribute(){},querySelector(){return null}});return elements.get(selector)};
 const context=vm.createContext({URL,AbortController,structuredClone,currentPanel:panel,settingsTab:'account',$:get,$$:()=>[],esc:escape,get:(_,fallback)=>fallback,set(){},keepPanelDrafts:render=>render(),toast(){},Home:{api:(url,options)=>{const request={url,options,...deferred()};requests.push(request);return request.promise}}});
 vm.runInContext(hubSource+'\nglobalThis.hub=AuraHub;',context);
 return{context,elements,requests,hub:context.hub};
}
test('changing news criteria while a request is pending keeps the newest result',async()=>{
 const h=hubHarness('news');h.hub.opened('news');
 assert.equal(h.requests.length,1);
 h.elements.get('#news-topic').onchange({target:{value:'science'}});
 assert.equal(h.requests.length,2);assert.match(h.requests[1].url,/topic=science/);
 assert.equal(h.requests[0].options.signal.aborted,true);
 h.requests[1].resolve({items:[{title:'Science result',source:'Fixture',url:'https://example.com/science'}]});await settle();
 h.requests[0].resolve({items:[{title:'Old result',source:'Fixture',url:'https://example.com/old'}]});await settle();
 const html=h.elements.get('#panel-content').innerHTML;
 assert.match(html,/Science result/);assert.doesNotMatch(html,/Old result|更新中/);
});
test('switching entertainment mode during loading requests and displays the selected mode',async()=>{
 const h=hubHarness('entertainment');h.hub.opened('entertainment');
 h.elements.get('#movie-upcoming').onclick();
 assert.equal(h.requests.length,2);assert.match(h.requests[1].url,/mode=movie/);
 h.requests[0].reject(new Error('Stale request failed'));await settle();
 h.requests[1].resolve({items:[{id:'fixture',type:'movie',title:'Movie result',date:'2026-10-06',url:'https://example.com/movie'}]});await settle();
 const html=h.elements.get('#panel-content').innerHTML;
 assert.match(html,/Movie result/);assert.doesNotMatch(html,/Stale request failed/);
 assert.match(html,/id="movie-upcoming"[^>]*aria-pressed="true"/);
});
test('API timeout still works when a caller provides its own cancellation signal',async()=>{
 const timers=[],signals=[];
 const context=vm.createContext({AbortController,setTimeout:callback=>{timers.push(callback);return timers.length},clearTimeout(){},fetch:(_,options)=>{signals.push(options.signal);return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))}});
 vm.runInContext(featuresSource+'\nglobalThis.home=Home;',context);
 const external=new AbortController();const pending=context.home.api('/fixture',{signal:external.signal});
 timers[0]();await assert.rejects(pending,/接続に時間がかかっています/);
 assert.equal(signals[0].aborted,true);assert.equal(external.signal.aborted,false);
 const external2=new AbortController();const pending2=context.home.api('/fixture',{signal:external2.signal});
 external2.abort();await assert.rejects(pending2,/接続に時間がかかっています/);assert.equal(signals[1].aborted,true);
});
test('background redraw preserves unsaved fields, focus, cursor, open details, and scroll',()=>{
 const helper=appSource.slice(appSource.indexOf('function keepPanelDrafts('),appSource.indexOf('function toast('));
 const context=vm.createContext({currentPanel:'tasks',settingsTab:'general',document:{activeElement:null}});
 let fields,details;
 const input=(id,value)=>({id,type:'text',value,attributes:[],matches:()=>false,selectionStart:3,selectionEnd:5,selectionDirection:'forward',focus(){context.document.activeElement=this},setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction}});
 const detail=open=>({id:'connections',open});
 const before=input('title','Unsent draft'),other=input('due','2026-10-06');fields=[before,other];details=[detail(true)];context.document.activeElement=before;
 const host={scrollTop:120,contains:element=>fields.includes(element),querySelectorAll:selector=>selector==='details'?details:fields};context.$=()=>host;
 vm.runInContext(helper+'\nglobalThis.preserve=keepPanelDrafts;',context);
 context.preserve(()=>{fields=[input('title',''),input('due','')];details=[detail(false)];host.scrollTop=0;context.document.activeElement=null});
 assert.equal(fields[0].value,'Unsent draft');assert.equal(fields[1].value,'2026-10-06');
 assert.equal(context.document.activeElement,fields[0]);assert.equal(fields[0].selectionStart,3);assert.equal(fields[0].selectionEnd,5);
 assert.equal(details[0].open,true);assert.equal(host.scrollTop,120);
});
test('a superseded weather request cannot put its failure on the new location',async()=>{
 const start=appSource.indexOf('async function refreshWeather('),end=appSource.indexOf('function locationControls('),requests=[];
 const context=vm.createContext({URL,AbortController,setTimeout,clearTimeout,weather:null,locationData:{name:'A',lat:1,lon:2},weatherBusy:false,weatherError:'',weatherSeq:0,navigator:{onLine:true},keepPanelDrafts:render=>render(),renderPanel(){},updateWeatherUI(){},set(){},AuraHub:{weatherUpdated(){}},fetch:()=>{const request=deferred();requests.push(request);return request.promise}});
 vm.runInContext(appSource.slice(start,end)+'\nglobalThis.refresh=refreshWeather;',context);
 const old=context.refresh(true);context.locationData={name:'B',lat:3,lon:4};context.weatherSeq++;context.weatherBusy=false;
 const latest=context.refresh(true);requests[0].reject(new Error('Old location failed'));await old;
 assert.equal(context.weatherError,'');
 requests[1].resolve({ok:true,json:async()=>({current:{temperature_2m:20}})});await latest;
 assert.equal(context.weather.place,'B');assert.equal(context.weatherBusy,false);assert.equal(context.weatherError,'');
});
