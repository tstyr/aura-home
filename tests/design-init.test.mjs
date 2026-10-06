import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['client/design.js'],bundle:true,write:false,format:'iife',platform:'browser',target:'chrome110'});
function boot(featurePrefs){
 const nodes=new Map();
 function element(){
  let id='';const classes=new Set(),properties=new Map();
  return {get id(){return id},set id(value){id=value;nodes.set('#'+id,this)},classList:{add(...values){values.forEach(v=>classes.add(v))},contains(value){return classes.has(value)},toggle(value,force){if(force===false)classes.delete(value);else classes.add(value)}},style:{setProperty(k,v){properties.set(k,String(v))},getPropertyValue(k){return properties.get(k)||''}},dataset:{},hidden:false,scrollWidth:200,
   setAttribute(){},prepend(){},appendChild(){},addEventListener(){},replaceChildren(){},querySelector(){return null}};
 }
 for(const name of ['#aura-app','#clock-seconds','#panel','.time','.bottom-bar','.slide-controls'])nodes.set(name,element());
 nodes.get('#clock-seconds').hidden=true;
 const sandbox={Date,URL,structuredClone,performance:{now:()=>0},document:{hidden:false,createElement:element,querySelector:selector=>nodes.get(selector)||null,querySelectorAll:()=>[],addEventListener(){}},window:{},navigator:{onLine:false},innerWidth:360,innerHeight:800,devicePixelRatio:1,
  get:(key,fallback)=>key==='feature-prefs'?featurePrefs:key==='design'?null:fallback,set(){},prefs:{clock24:true},weather:null,locationData:null,currentPanel:null,backgroundChoice:{kind:'preset',id:'gray'},backgroundPresets:[{id:'gray',color:'#383838'}],statsState:{config:null},
  Home:{getState(){throw Error('Home preferences have not initialized yet')}},matchMedia:()=>({matches:true,addEventListener(){}}),getComputedStyle:()=>({fontSize:'100px'}),cancelAnimationFrame(){},requestAnimationFrame:()=>1,addEventListener(){},setInterval:()=>1,toast(){}};
 vm.runInNewContext(bundle.outputFiles[0].text,sandbox);sandbox.window.AuraDesign.init();return {api:sandbox.window.AuraDesign,nodes};
}
test('display initializes before Home preferences without accessing Home.getState',()=>{
 const {api,nodes}=boot({clockSize:1.2,clockSeconds:true});
 assert.equal(nodes.get('#aura-app').style.getPropertyValue('--clock-scale'),'1.2');assert.equal(nodes.get('#clock-seconds').hidden,false);assert.equal(api.snapshot().schedule.enabled,false);assert.ok(nodes.has('#weather-scene'));assert.ok(nodes.has('#music-peek'));
 assert.doesNotThrow(()=>api.tick());
});
test('display boots with missing or malformed cached clock preferences and uses bounded defaults',()=>{
 for(const value of [null,{},'bad',{clockSize:'2'},{clockSize:Infinity}]){const {nodes}=boot(value);assert.equal(nodes.get('#aura-app').style.getPropertyValue('--clock-scale'),'1');assert.equal(nodes.get('#clock-seconds').hidden,true)}
 assert.equal(boot({clockSize:4}).nodes.get('#aura-app').style.getPropertyValue('--clock-scale'),'1.4');assert.equal(boot({clockSize:0}).nodes.get('#aura-app').style.getPropertyValue('--clock-scale'),'0.7');
});
