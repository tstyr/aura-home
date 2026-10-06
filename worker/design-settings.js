export const FONTS={
 rounded:{name:'まるい数字',family:'ui-rounded,"SF Pro Rounded","Arial Rounded MT Bold",system-ui,sans-serif'},
 clean:{name:'すっきり',family:'"Segoe UI",Helvetica,Arial,sans-serif'},
 serif:{name:'明朝',family:'"Yu Mincho","Hiragino Mincho ProN",Georgia,serif'},
 mono:{name:'デジタル',family:'"Cascadia Code",Consolas,"Courier New",monospace'}
};
export const WEATHER_PALETTES={sun:{clock:'#f2d4aa',sky:'#819cab',ground:'#506b76'},cloud:{clock:'#dce1e6',sky:'#8e9ba8',ground:'#4a5b6c'},rain:{clock:'#b9d6dc',sky:'#627e90',ground:'#263c50'},storm:{clock:'#d3c4e5',sky:'#48546c',ground:'#20263b'},snow:{clock:'#e7f2f7',sky:'#a1b8c6',ground:'#536f86'},fog:{clock:'#e0e6db',sky:'#98aaa4',ground:'#5b706b'}};
export const TIME_SLOTS=[['morning','朝',6],['day','昼',12],['evening','夕方',18],['night','夜',22]];
export const DEFAULT_DESIGN={color:'#f3f0eb',font:'rounded',weight:600,spacing:-.055,position:'center',dateColor:'#d2d0cc',dateSize:18,dateVisible:true,secondsColor:'#d2d0cc',secondsSize:32,autoContrast:true,launcherBlur:14,panelBlurs:{news:22,weather:18,settings:18,other:18},glass:'standard',edgeLight:true,tileMotion:true,weatherAuto:true,weatherMode:'auto',weatherTheme:'rain',weatherDay:'auto',musicPeek:true,motion:'subtle',styles:[],schedule:{enabled:false,morning:'',day:'',evening:'',night:''},weatherColors:{enabled:false,palettes:WEATHER_PALETTES},night:{mode:'off',start:22,end:6,dim:.35},powerSave:false,musicCard:{size:'standard',layout:'artwork',position:'weather'}};
const bad=()=>{throw Object.assign(Error('表示の設定を確認してください。'),{status:400})};
const choice=(v,values)=>values.includes(v)?v:bad();
const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:bad();
const color=v=>typeof v==='string'&&/^#[a-f0-9]{6}$/i.test(v)?v:bad();
export function cleanDesign(value,nested=false){
 if(!value||typeof value!=='object'||Array.isArray(value))bad();const out={};
 for(const [key,v] of Object.entries(value))switch(key){
  case'color':case'dateColor':case'secondsColor':out[key]=color(v);break;
  case'font':out[key]=choice(v,Object.keys(FONTS));break;
  case'weight':out[key]=number(v,200,900);break;
  case'clockSize':out[key]=number(v,.7,1.4);break;
  case'clockSeconds':case'clock24':if(typeof v!=='boolean')bad();out[key]=v;break;
  case'spacing':out[key]=number(v,-.09,.15);break;
  case'position':out[key]=choice(v,['center','left','right']);break;
  case'dateSize':out[key]=number(v,12,36);break;
  case'secondsSize':out[key]=number(v,16,60);break;
  case'autoContrast':case'dateVisible':case'edgeLight':case'tileMotion':case'weatherAuto':case'musicPeek':case'powerSave':if(typeof v!=='boolean')bad();out[key]=v;break;
  case'backgroundPreset':out[key]=choice(v,['gray','graphite','silver','charcoal']);break;
  case'schedule':{
   if(!v||typeof v!=='object'||Array.isArray(v))bad();out[key]={};
   for(const[k,n]of Object.entries(v)){if(k==='enabled'){if(typeof n!=='boolean')bad();out[key][k]=n}else{choice(k,TIME_SLOTS.map(s=>s[0]));if(typeof n!=='string'||n.length>40)bad();out[key][k]=n.trim()}}break;
  }
  case'weatherColors':{
   if(!v||typeof v!=='object'||Array.isArray(v))bad();out[key]={};
   for(const[k,n]of Object.entries(v)){if(k==='enabled'){if(typeof n!=='boolean')bad();out[key][k]=n}else if(k==='palettes'){if(!n||typeof n!=='object'||Array.isArray(n))bad();out[key][k]={};for(const[theme,palette]of Object.entries(n)){choice(theme,Object.keys(WEATHER_PALETTES));if(!palette||typeof palette!=='object'||Array.isArray(palette))bad();out[key][k][theme]={};for(const[part,hex]of Object.entries(palette)){choice(part,['clock','sky','ground']);out[key][k][theme][part]=color(hex)}}}else bad()}break;
  }
  case'night':{
   if(!v||typeof v!=='object'||Array.isArray(v))bad();out[key]={};for(const[k,n]of Object.entries(v)){if(k==='mode')out[key][k]=choice(n,['off','auto','on']);else if(k==='start'||k==='end'){out[key][k]=number(n,0,23);if(!Number.isInteger(n))bad()}else if(k==='dim')out[key][k]=number(n,0,.75);else bad()}break;
  }
  case'musicCard':{
   if(!v||typeof v!=='object'||Array.isArray(v))bad();out[key]={};for(const[k,n]of Object.entries(v)){if(k==='size')out[key][k]=choice(n,['compact','standard','large']);else if(k==='layout')out[key][k]=choice(n,['artwork','text']);else if(k==='position')out[key][k]=choice(n,['weather','bottom-left','bottom-right']);else bad()}break;
  }
  case'weatherMode':out[key]=choice(v,['off','auto','manual']);break;
  case'weatherTheme':out[key]=choice(v,['sun','cloud','rain','storm','snow','fog']);break;
  case'weatherDay':out[key]=choice(v,['auto','day','night']);break;
  case'launcherBlur':out[key]=number(v,0,32);break;
  case'panelBlurs':if(!v||typeof v!=='object'||Array.isArray(v))bad();out[key]={};for(const[k,n]of Object.entries(v)){choice(k,['news','weather','settings','other']);out[key][k]=number(n,0,32)}break;
  case'glass':out[key]=choice(v,['light','standard','smoke']);break;
  case'motion':out[key]=choice(v,['still','subtle','normal']);break;
  case'styles':if(nested||!Array.isArray(v)||v.length>8)bad();out[key]=v.map(item=>{if(!item||typeof item.name!=='string'||!item.name.trim()||item.name.length>40)bad();return{name:item.name.trim(),value:cleanDesign(item.value,true)}});break;
  default:bad();
 }return out;
}
export function normalizeDesign(value){let clean={};try{clean=cleanDesign(value||{})}catch{}if(!clean.weatherMode)clean.weatherMode=clean.weatherAuto===false?'off':'auto';clean.weatherAuto=clean.weatherMode==='auto';return{...structuredClone(DEFAULT_DESIGN),...clean,panelBlurs:{...DEFAULT_DESIGN.panelBlurs,...clean.panelBlurs},schedule:{...DEFAULT_DESIGN.schedule,...clean.schedule},weatherColors:{enabled:clean.weatherColors?.enabled??false,palettes:Object.fromEntries(Object.entries(WEATHER_PALETTES).map(([key,palette])=>[key,{...palette,...clean.weatherColors?.palettes?.[key]}]))},night:{...DEFAULT_DESIGN.night,...clean.night},musicCard:{...DEFAULT_DESIGN.musicCard,...clean.musicCard},styles:clean.styles||[]}}
export function scheduledStyle(design,now=Date.now()){
 if(!design.schedule.enabled)return null;const hour=new Date(now).getHours(),slot=hour<6?'night':hour<12?'morning':hour<18?'day':hour<22?'evening':'night';const name=design.schedule[slot];return name?design.styles.find(s=>s.name===name)||null:null;
}
export function nightActive(night,now=Date.now()){
 if(night.mode!=='auto')return night.mode==='on';if(night.start===night.end)return true;const hour=new Date(now).getHours();return night.start<night.end?hour>=night.start&&hour<night.end:hour>=night.start||hour<night.end;
}
const scheduledKeys=['color','font','weight','spacing','position','dateColor','dateSize','dateVisible','secondsColor','secondsSize','autoContrast','launcherBlur','panelBlurs','glass','edgeLight','tileMotion','weatherMode','weatherTheme','weatherDay','motion','backgroundPreset','clockSize','clockSeconds'];
export function styleSnapshot(value,clock={}){const out={};for(const key of [...scheduledKeys,'clock24']){const item=Object.hasOwn(clock,key)?clock[key]:value[key];if(item!==undefined)out[key]=structuredClone(item)}return cleanDesign(out,true)}
export function effectiveDesign(value,{weather=null,place=null,now=Date.now()}={}){
 const base=normalizeDesign(value),out=structuredClone(base),style=scheduledStyle(base,now);delete out.clockSize;delete out.clockSeconds;delete out.backgroundPreset;
 if(style)for(const key of scheduledKeys)if(style.value[key]!==undefined)out[key]=key==='panelBlurs'?{...out.panelBlurs,...style.value.panelBlurs}:structuredClone(style.value[key]);
 if(style&&style.value.weatherMode===undefined&&style.value.weatherAuto!==undefined)out.weatherMode=style.value.weatherAuto?'auto':'off';
 out.weatherAuto=out.weatherMode==='auto';out.activeStyle=style?.name||'';out.nightActive=nightActive(out.night,now);
 const scene=selectedWeatherScene(out,weather,place,now);out.weatherPalette=out.weatherColors.enabled&&scene?structuredClone(out.weatherColors.palettes[scene.kind]):null;if(out.weatherPalette)out.color=out.weatherPalette.clock;
 if(out.powerSave){out.motion='still';out.tileMotion=false;out.launcherBlur=0;out.panelBlurs={news:0,weather:0,settings:0,other:0}}return out;
}
export const musicPollingMs=design=>design.powerSave?120000:30000;
export function weatherScene(weather,place,now=Date.now()){
 if(!weather?.current||weather.place!==place||!Number.isFinite(weather.fetchedAt)||now-weather.fetchedAt>7200000)return null;
 const code=weather.current.weather_code;if(!Number.isInteger(code)||code<0||code>99)return null;
 const kind=code===0?'sun':code<=3?'cloud':code<=48?'fog':[71,73,75,77,85,86].includes(code)?'snow':code>=95?'storm':'rain';
 const heavy=[65,67,75,82,86,95,96,99].includes(code),light=[51,53,56,61,66,71,77,80,85].includes(code);
 const day=weather.current.is_day===0?false:weather.current.is_day===1?true:new Date(now).getHours()>=6&&new Date(now).getHours()<18;
 return{kind,day,intensity:heavy?1:light?.35:.65};
}
export function selectedWeatherScene(design,weather,place,now=Date.now()){
 if(design.weatherMode==='off')return null;
 if(design.weatherMode!=='manual')return weatherScene(weather,place,now);
 const day=design.weatherDay==='day'?true:design.weatherDay==='night'?false:new Date(now).getHours()>=6&&new Date(now).getHours()<18;
 return{kind:design.weatherTheme,day,intensity:design.weatherTheme==='storm'?1:.65};
}
export function playingTrack(data,now=Date.now()){
 const at=Date.parse(data?.fetchedAt),section=data?.sections?.current;if(!Number.isFinite(at)||!section?.available||section.isPlaying!==true||!Array.isArray(section.items)||now-at>75000)return null;
 const row=section.items[0];if(!row||typeof row.name!=='string'||!row.name.trim())return null;
 let image=null;try{const u=new URL(row.image);if(u.protocol==='https:'&&!u.username&&!u.password)image=u.href}catch{}
 return{name:row.name.slice(0,160),artists:String(row.artists||'').slice(0,160),image};
}
export function readableColor(value,background,enabled=true){
 if(!enabled)return value;
 const lum=hex=>{const v=hex.replace('#','');const c=[0,2,4].map(i=>parseInt(v.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};
 const a=lum(value),b=lum(background);if((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=3)return value;
 return b>.3?'#20252b':'#f3f0eb';
}
