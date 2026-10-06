import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cleanDesign,normalizeDesign,effectiveDesign,scheduledStyle,nightActive,musicPollingMs,styleSnapshot,WEATHER_PALETTES} from '../worker/design-settings.js';

const at=hour=>new Date(2026,9,6,hour,0).getTime();
test('new automation settings migrate safely and validate every nested field',()=>{
 const value=normalizeDesign({color:'#abcdef',weatherAuto:false,weatherColors:{palettes:{rain:{sky:'#123456'}}},night:{start:21},musicCard:{layout:'text'}});
 assert.equal(value.color,'#abcdef');assert.equal(value.weatherMode,'off');assert.equal(value.schedule.enabled,false);assert.equal(value.powerSave,false);assert.equal(value.night.mode,'off');assert.equal(value.night.end,6);assert.equal(value.weatherColors.palettes.rain.sky,'#123456');assert.equal(value.weatherColors.palettes.rain.ground,WEATHER_PALETTES.rain.ground);assert.equal(value.musicCard.size,'standard');
 value.weatherColors.palettes.sun.clock='#000000';assert.equal(normalizeDesign({}).weatherColors.palettes.sun.clock,WEATHER_PALETTES.sun.clock);
 for(const invalid of [{schedule:{enabled:1}},{schedule:{morning:'x'.repeat(41)}},{schedule:{dawn:'x'}},{weatherColors:{palettes:{rain:{sky:'url(x)'}}}},{weatherColors:{palettes:{wind:{clock:'#ffffff'}}}},{weatherColors:{palettes:{rain:{css:'#ffffff'}}}},{night:{start:24}},{night:{end:3.5}},{night:{dim:.8}},{night:{mode:'system'}},{powerSave:'true'},{musicCard:{size:'huge'}},{musicCard:{position:'top'}},{musicCard:{layout:'html'}},{backgroundPreset:'image'}])assert.throws(()=>cleanDesign(invalid));
 assert.deepEqual(cleanDesign(value),value);
});
test('time slots use saved style names and missing or renamed styles fall back to the base',()=>{
 const styles=['Morning','Day','Evening','Night'].map((name,i)=>({name,value:{font:['rounded','clean','serif','mono'][i]}}));
 const design=normalizeDesign({color:'#abcdef',styles,schedule:{enabled:true,morning:'Morning',day:'Day',evening:'Evening',night:'Night'}});
 for(const[hour,name]of [[0,'Night'],[5,'Night'],[6,'Morning'],[11,'Morning'],[12,'Day'],[17,'Day'],[18,'Evening'],[21,'Evening'],[22,'Night'],[23,'Night']])assert.equal(scheduledStyle(design,at(hour)).name,name);
 const missing=normalizeDesign({...design,styles:styles.filter(s=>s.name!=='Night')});assert.equal(scheduledStyle(missing,at(23)),null);assert.equal(effectiveDesign(missing,{now:at(23)}).color,'#abcdef');
 const renamed=normalizeDesign({...design,styles:styles.map(s=>s.name==='Night'?{...s,name:'Late night'}:s)});assert.equal(scheduledStyle(renamed,at(23)),null);
});
test('effective styles and weather palettes never overwrite saved manual choices or automation preferences',()=>{
 const design=normalizeDesign({color:'#abcdef',font:'rounded',clockSize:1.1,clockSeconds:false,weatherMode:'manual',weatherTheme:'rain',styles:[{name:'Night',value:{color:'#123456',font:'mono',weatherMode:'manual',weatherTheme:'snow',clockSize:1.3,clockSeconds:true,backgroundPreset:'charcoal',schedule:{enabled:false},powerSave:true}}],schedule:{enabled:true,night:'Night'},weatherColors:{enabled:true},powerSave:false});
 const before=structuredClone(design),night=effectiveDesign(design,{now:at(23)});
 assert.equal(night.font,'mono');assert.equal(night.weatherTheme,'snow');assert.equal(night.clockSize,1.3);assert.equal(night.clockSeconds,true);assert.equal(night.backgroundPreset,'charcoal');assert.equal(night.color,WEATHER_PALETTES.snow.clock);assert.equal(night.powerSave,false);assert.equal(night.schedule.enabled,true);assert.deepEqual(design,before);
 const day=effectiveDesign(design,{now:at(12)});assert.equal(day.activeStyle,'');assert.equal(day.font,'rounded');assert.equal(day.clockSize,undefined);assert.equal(day.clockSeconds,undefined);assert.equal(day.backgroundPreset,undefined);
 const manual=effectiveDesign({...design,schedule:{enabled:false},weatherColors:{enabled:false}},{now:at(23)});assert.equal(manual.color,'#abcdef');assert.equal(manual.font,'rounded');
 assert.equal(effectiveDesign({...design,weatherMode:'off',schedule:{enabled:false}},{now:at(23)}).weatherPalette,null);
 for(const kind of Object.keys(WEATHER_PALETTES))assert.deepEqual(effectiveDesign({...design,weatherMode:'manual',weatherTheme:kind,schedule:{enabled:false}},{now:at(12)}).weatherPalette,WEATHER_PALETTES[kind]);
 assert.equal(effectiveDesign({...design,styles:[{name:'Night',value:{panelBlurs:{weather:3}}}]},{now:at(23)}).panelBlurs.news,design.panelBlurs.news);
});
test('night mode honors cross-midnight, daytime and continuous schedules without changing saved settings',()=>{
 const overnight={mode:'auto',start:22,end:6};for(const hour of [0,5,22,23])assert.equal(nightActive(overnight,at(hour)),true);for(const hour of [6,12,21])assert.equal(nightActive(overnight,at(hour)),false);
 assert.equal(nightActive({mode:'auto',start:8,end:12},at(9)),true);assert.equal(nightActive({mode:'auto',start:8,end:12},at(12)),false);assert.equal(nightActive({mode:'auto',start:8,end:8},at(3)),true);assert.equal(nightActive({mode:'off'},at(23)),false);assert.equal(nightActive({mode:'on'},at(12)),true);
 const base=normalizeDesign({night:{mode:'auto'}}),copy=structuredClone(base);assert.equal(effectiveDesign(base,{now:at(23)}).nightActive,true);assert.equal(effectiveDesign(base,{now:at(12)}).nightActive,false);assert.deepEqual(base,copy);
});
test('power saving stops expensive motion and blur and reduces automatic music polling',()=>{
 const base=normalizeDesign({motion:'normal',launcherBlur:20,powerSave:true}),saved=structuredClone(base),effective=effectiveDesign(base,{now:at(12)});
 assert.equal(effective.motion,'still');assert.equal(effective.tileMotion,false);assert.equal(effective.launcherBlur,0);assert.deepEqual(effective.panelBlurs,{news:0,weather:0,settings:0,other:0});assert.equal(musicPollingMs(effective),120000);assert.equal(musicPollingMs({powerSave:false}),30000);assert.deepEqual(base,saved);
});
test('saved style snapshots exclude automatic preferences, music settings and recursive saved styles',()=>{
 const base=normalizeDesign({schedule:{enabled:true},weatherColors:{enabled:true},night:{mode:'on'},powerSave:true,musicCard:{size:'large'},styles:[{name:'old',value:{color:'#ffffff'}}]});
 const snapshot=styleSnapshot(base,{clockSize:1.25,clockSeconds:true,clock24:false,backgroundPreset:'silver'});
 assert.equal(snapshot.clockSize,1.25);assert.equal(snapshot.clock24,false);assert.equal(snapshot.backgroundPreset,'silver');for(const key of ['styles','schedule','weatherColors','night','powerSave','musicCard','activeStyle','nightActive'])assert.equal(snapshot[key],undefined);assert.deepEqual(cleanDesign(snapshot,true),snapshot);
 assert.equal(styleSnapshot({...base,backgroundPreset:'charcoal'},{backgroundPreset:undefined}).backgroundPreset,undefined);
 assert.throws(()=>cleanDesign({styles:Array.from({length:9},(_,i)=>({name:String(i),value:{}}))}));assert.throws(()=>cleanDesign({styles:[{name:'recursive',value:{styles:[]}}]}));
});
