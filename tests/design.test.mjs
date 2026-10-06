import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cleanDesign,normalizeDesign,weatherScene,selectedWeatherScene,playingTrack,readableColor} from '../worker/design-settings.js';
import {cleanSettingsPatch} from '../worker/home.js';
import worker from '../worker/index.js';

test('display settings are bounded, safe, syncable and saved styles cannot recurse',()=>{
 const value=normalizeDesign({font:'serif',color:'#f2d4aa',launcherBlur:0,panelBlurs:{news:0},styles:[{name:'夜',value:{font:'mono',clockSize:1.2,clockSeconds:true,clock24:false}}]});
 assert.equal(cleanSettingsPatch({design:value}).design.font,'serif');assert.equal(value.panelBlurs.weather,18);assert.equal(value.launcherBlur,0);
 for(const invalid of [{font:'url(x)'},{color:'red;position:fixed'},{spacing:1},{panelBlurs:{news:-1}},{motion:'fast'},{weatherPhotoOverlay:true},{styles:[{name:'bad',value:{styles:[]}}]}])assert.throws(()=>cleanDesign(invalid));
 assert.equal(readableColor('#303030','#383838'),'#f3f0eb');assert.equal(readableColor('#f3f0eb','#ffffff'),'#20252b');assert.equal(readableColor('#303030','#383838',false),'#303030');
});
test('weather follows selected location, actual day/night, rain strength and freshness',()=>{
 const now=Date.now(),input={place:'東京',fetchedAt:now,current:{weather_code:61,is_day:0}};
 assert.deepEqual(weatherScene(input,'東京',now),{kind:'rain',day:false,intensity:.35});
 assert.equal(weatherScene({...input,current:{weather_code:65,is_day:1}},'東京',now).intensity,1);
 for(const[code,kind]of [[0,'sun'],[3,'cloud'],[45,'fog'],[75,'snow'],[95,'storm']])assert.equal(weatherScene({...input,current:{weather_code:code}},'東京',now).kind,kind);
 assert.equal(weatherScene(input,'大阪',now),null);assert.equal(weatherScene(input,'東京',now+7200001),null);
 assert.equal(selectedWeatherScene(normalizeDesign({weatherMode:'off'}),input,'東京',now),null);
 assert.deepEqual(selectedWeatherScene(normalizeDesign({weatherMode:'manual',weatherTheme:'rain',weatherDay:'night'}),null,null,now),{kind:'rain',day:false,intensity:.65});
 assert.equal(selectedWeatherScene(normalizeDesign({weatherMode:'manual',weatherTheme:'storm',weatherDay:'day'}),null,null,now).intensity,1);
 assert.equal(normalizeDesign({weatherAuto:false}).weatherMode,'off');
 for(const mode of ['off','auto','manual'])assert.equal(normalizeDesign({weatherMode:mode,weatherAuto:mode!=='auto'}).weatherAuto,mode==='auto');
 const manual=normalizeDesign({weatherMode:'manual',weatherTheme:'snow',weatherDay:'auto'});
 assert.equal(selectedWeatherScene(manual,null,null,new Date(2026,9,6,17,59).getTime()).day,true);
 assert.equal(selectedWeatherScene(manual,null,null,new Date(2026,9,6,18,0).getTime()).day,false);
 assert.throws(()=>cleanDesign({weatherMode:'unknown'}));assert.throws(()=>cleanDesign({weatherTheme:'url(...)'}));
});
test('footer music appears only for current playback and accepts safe artwork',()=>{
 const now=Date.now(),input={fetchedAt:new Date(now).toISOString(),sections:{current:{available:true,isPlaying:true,items:[{name:'Song',artists:'Artist',image:'https://cdn.example.test/album.jpg'}]}}};
 assert.equal(playingTrack(input,now).name,'Song');assert.equal(playingTrack(input,now).image,'https://cdn.example.test/album.jpg');
 assert.equal(playingTrack(input,now+75001),null);assert.equal(playingTrack({...input,fetchedAt:'invalid'},now),null);
 assert.equal(playingTrack({...input,sections:{current:{...input.sections.current,isPlaying:false}}},now),null);
 assert.equal(playingTrack({...input,sections:{current:{...input.sections.current,items:[{name:'Song',image:'javascript:alert(1)'}]}}},now).image,null);
});
test('current music endpoint reads only the authenticated profile and a single provider route',async()=>{
 const original=globalThis.fetch,paths=[];globalThis.fetch=async url=>{paths.push(String(url));return Response.json({item:{isPlaying:true,track:{name:'Private selection',albums:[{image:'https://cdn.example.test/album.jpg'}],artists:[{name:'Artist'}]}}})};
 const env={BUCKET:{get:async key=>key==='settings/alice/statsfm.json'?{json:async()=>({id:'alice-profile'})}:null}};
 try{
  const call=user=>worker.fetch(new Request('https://aura.test/api/stats/current',{headers:user?{'oai-authenticated-user-id':user}:{}}),env);
  assert.equal((await call(null)).status,401);
  assert.deepEqual(await(await call('bob')).json(),{configured:false});assert.equal(paths.length,0);
  const response=await call('alice');assert.equal(response.status,200);assert.equal(playingTrack(await response.json()).name,'Private selection');
  assert.equal(paths.length,1);assert.ok(paths[0].endsWith('/users/alice-profile/streams/current'));
 }finally{globalThis.fetch=original}
});
