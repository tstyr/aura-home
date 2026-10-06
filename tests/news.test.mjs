import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {cleanHub} from '../worker/hub-settings.js';

const source=fs.readFileSync(new URL('../web/hub.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const settings={newsExclusions:{keywords:[' Spam ','ＳＰＡＭ','経済'],sources:['NHK','nhk']}};
assert.deepEqual(cleanHub(settings).newsExclusions,{keywords:['Spam','経済'],sources:['NHK']});
assert.deepEqual(cleanHub({newsExclusions:{keywords:[],sources:[]}}).newsExclusions,{keywords:[],sources:[]});
for(const value of [null,[],{keywords:'word'},{keywords:null},{keywords:false},{keywords:['']},{keywords:['a'.repeat(81)]},{keywords:Array.from({length:21},(_,i)=>String(i))},{sources:Array.from({length:11},(_,i)=>String(i))},{sources:['bad\nsource']},{keywords:[],unknown:true}])assert.throws(()=>cleanHub({newsExclusions:value}));
assert.equal(cleanHub({newsExclusions:{keywords:['a'.repeat(80)]}}).newsExclusions.keywords[0].length,80);

function client(stored=new Map()){
 const elements=new Map(),lists=new Map(),messages=[];
 for(const id of ['panel-content','home-widgets','news-topic','news-source','news-refresh','news-read-visible','news-unread-count','news-exclusions-form','news-exclude-keywords','news-exclusions-clear','today-weather','today-calendar','today-tasks','today-news','today-music','today-transit'])elements.set('#'+id,{innerHTML:'',value:'',textContent:'',disabled:false,addEventListener(){}});
 let response={source:'Googleニュース',items:[]};
 const context=vm.createContext({URL,AbortController,structuredClone,Set,Map,Date,Intl,console,currentPanel:'news',settingsTab:'account',weather:null,locationData:null,
  $:selector=>elements.get(selector)||null,$$:selector=>lists.get(selector)||[],esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  get:(key,fallback)=>stored.has(key)?structuredClone(stored.get(key)):fallback,set:(key,value)=>stored.set(key,structuredClone(value)),setInterval:()=>1,toast:value=>messages.push(value),keepPanelDrafts:fn=>fn(),openPanel(){},refreshWeather(){},window:{},navigator:{},
  Home:{api:async()=>{if(response instanceof Error)throw response;return structuredClone(response)},syncSettings:async()=>true,dayString:()=> '2026-10-06',eventsForDay:()=>[],loadCalendar:async()=>{}},
 });
 vm.runInContext(source,context);
 const hub=vm.runInContext('AuraHub',context),model=vm.runInContext('AuraNews',context);
 const settle=async()=>{for(let n=0;n<20;n++){await new Promise(setImmediate);if(!hub.newsSummary().pending)return}throw Error('News request did not settle')};
 hub.init();return{hub,model,elements,lists,stored,messages,setResult:value=>response=value,settle};
}
const stored=new Map([['hub',{newsSource:'google',widgets:['news'],savedNews:[{title:'Keep saved article',source:'Example',url:'https://example.test/saved'}]}]]),c=client(stored),m=c.model;
const a={title:'Alpha story',description:'Public report',source:'NHK',url:'https://example.test/a'},b={title:'Beta story',description:'ＳＰＡＭ announcement',source:'Example News',url:'https://example.test/b'},d={title:'New item',description:'Fresh report',source:'Other News',url:'https://example.test/new'};
const items=Object.freeze([Object.freeze(a),Object.freeze(b)]),original=JSON.stringify(items);
assert.deepEqual(plain(m.filter(items,{keywords:['spam'],sources:[]})),{items:[a],hidden:1});
assert.deepEqual(plain(m.filter(items,{keywords:['NHK'],sources:[]})),{items:[b],hidden:1});
assert.deepEqual(plain(m.filter(items,{keywords:[],sources:['example news']})),{items:[a],hidden:1});
assert.equal(m.filter(items,{keywords:['.*'],sources:[]}).hidden,0,'Keywords are literal text, not regular expressions.');
assert.equal(JSON.stringify(items),original,'Filtering must preserve the acquired items.');
let reading=m.receive({},'google:top',items);assert.equal(m.unread(reading,'google:top',items).length,0);
reading=m.receive(reading,'google:top',[d,...items]);assert.deepEqual(plain(m.unread(reading,'google:top',[d,...items])),[d]);
assert.equal(m.unread(reading,'google:top',[d,{...d},...items]).length,1,'Repeated article URLs count as one new story.');
const beforeStale=plain(reading);assert.deepEqual(plain(m.receive(reading,'google:world',[d],true)),beforeStale);
reading=m.read(reading,[d]);assert.equal(m.unread(reading,'google:top',[d,...items]).length,0);
reading=m.receive(reading,'nhk:top',[{...d,url:'https://example.test/nhk'}]);assert.equal(m.unread(reading,'nhk:top',[{...d,url:'https://example.test/nhk'}]).length,0,'A newly chosen feed establishes its own initial baseline.');
assert.equal(m.cleanReading({seen:Array.from({length:400},(_,i)=>'https://example.test/'+i),feeds:['invalid','google:top']}).seen.length,300);
assert.deepEqual(plain(m.cleanReading({seen:['javascript:alert(1)','https://u:p@example.test/','http://example.test/'],feeds:['other:top']})),{seen:[],feeds:[]});

c.setResult({source:'Googleニュース',items:[a,b]});c.hub.opened('news');await c.settle();
assert.equal(c.hub.newsSummary().newCount,0);assert.ok(c.elements.get('#panel-content').innerHTML.includes('記事の提供元'));assert.ok(c.elements.get('#panel-content').innerHTML.includes('Example News'));
assert.ok(c.stored.get('news-reading').feeds.includes('google:top'));
c.hub.apply({...plain(c.hub.snapshot()),newsExclusions:{keywords:['alpha'],sources:[]}});
assert.equal(c.hub.newsSummary().hiddenCount,1);assert.equal(c.hub.newsSummary().first.title,b.title);
assert.ok(!c.elements.get('#home-widgets').innerHTML.includes(a.title));assert.ok(c.elements.get('#home-widgets').innerHTML.includes(b.title));
c.hub.render('today');assert.ok(!c.elements.get('#panel-content').innerHTML.includes(a.title));assert.ok(c.elements.get('#panel-content').innerHTML.includes(b.title));assert.equal(c.hub.snapshot().savedNews.length,1);
const detail={open:true,dataset:{newsRead:'1'}};c.lists.set('[data-news-read]',[detail]);
c.setResult({source:'Googleニュース',items:[a,b,d]});c.hub.opened('news');await c.settle();
assert.equal(c.hub.newsSummary().newCount,1);assert.ok(c.elements.get('#home-widgets').innerHTML.includes('新着 1'));assert.ok(!c.stored.get('news-reading').seen.includes(d.url));
detail.ontoggle();assert.equal(c.hub.newsSummary().newCount,0);assert.equal(detail.open,true,'Marking a detail read must leave the article open.');assert.ok(c.stored.get('news-reading').seen.includes(d.url));
const another={...d,title:'Another new item',url:'https://example.test/another'};
c.setResult({source:'Googleニュース',items:[a,b,d,another]});c.hub.opened('news');await c.settle();assert.equal(c.hub.newsSummary().newCount,1);
c.elements.get('#news-read-visible').onclick();assert.equal(c.hub.newsSummary().newCount,0);
const savedReading=JSON.stringify(c.stored.get('news-reading'));
c.setResult(Error('Fixture connection failed'));c.hub.opened('news');await c.settle();assert.equal(JSON.stringify(c.stored.get('news-reading')),savedReading);assert.equal(c.hub.newsSummary().error,'Fixture connection failed');
c.setResult({source:'Googleニュース',items:[a,b,another],stale:true,error:'Previous headlines'});c.hub.opened('news');await c.settle();assert.equal(JSON.stringify(c.stored.get('news-reading')),savedReading);
c.elements.get('#news-exclude-keywords').value='Alpha\nBeta';c.elements.get('#news-exclusions-form').onsubmit({preventDefault(){}});assert.deepEqual(plain(c.hub.snapshot().newsExclusions).keywords,['Alpha','Beta']);
assert.ok(c.elements.get('#panel-content').innerHTML.includes('Alpha\nBeta'),'Editable keyword lines must use actual newlines.');
c.elements.get('#news-exclusions-clear').onclick();assert.deepEqual(plain(c.hub.snapshot().newsExclusions),{keywords:[],sources:[]});assert.equal(c.hub.snapshot().newsSource,'google');assert.equal(c.hub.snapshot().savedNews.length,1);assert.equal(c.hub.newsSummary().hiddenCount,0);
const other=client(new Map([['hub',{newsSource:'google'}]]));other.setResult({source:'Googleニュース',items:[a,b,d]});other.hub.opened('news');await other.settle();assert.equal(other.hub.newsSummary().newCount,0);assert.notDeepEqual(plain(other.stored.get('news-reading')),plain(c.stored.get('news-reading')));
console.log('PASS: bounded news exclusion validation, literal/case-normalized filtering, unchanged provider data, first-feed baseline, new-item/read tracking, local user isolation, stale/error preservation, consistent widgets/summary, filter editing/reset, saved-news preservation.');
