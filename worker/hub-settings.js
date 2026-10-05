const fail=()=>{throw Object.assign(Error('情報アプリの設定を確認してください。'),{status:400})};
const text=(v,max=100)=>typeof v==='string'&&v.length<=max?v.trim():fail();
const oneOf=(v,values)=>values.includes(v)?v:fail();
export const HUB_APPS=['news','today','transit','sports','entertainment','worldclock'];
export const NEWS_TOPICS=['top','society','science','business','world','sports','culture'];
export function cleanHub(value){
 if(!value||typeof value!=='object'||Array.isArray(value))fail();const out={};
 for(const[k,v]of Object.entries(value))switch(k){
  case'displayName':out[k]=text(v,80);break;
  case'newsTopic':out[k]=oneOf(v,NEWS_TOPICS);break;
  case'newsSource':out[k]=oneOf(v,['nhk','google']);break;
  case'musicService':out[k]=oneOf(v,['spotify','apple','youtube']);break;
  case'widgets':if(!Array.isArray(v)||v.length>4||new Set(v).size!==v.length)fail();out[k]=v.map(x=>oneOf(x,['weather','agenda','news','worldclock']));break;
  case'timezones':if(!Array.isArray(v)||v.length>6||new Set(v).size!==v.length)fail();out[k]=v.map(x=>{text(x,80);try{new Intl.DateTimeFormat('ja-JP',{timeZone:x})}catch{fail()}return x});break;
  case'notifications':if(!v||typeof v!=='object'||Array.isArray(v))fail();out[k]={};for(const[a,b]of Object.entries(v)){oneOf(a,['agenda','weather','news']);if(typeof b!=='boolean')fail();out[k][a]=b}break;
  case'transit':if(!Array.isArray(v)||v.length>8)fail();out[k]=v.map(r=>{const times=Array.isArray(r.times)?r.times:[];if(times.length>30||times.some(t=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))fail();return{name:text(r.name,80),operator:oneOf(r.operator,['TokyoMetro','JR-East','Toei']),times:[...new Set(times)].sort()}});break;
  case'sportsTeam':if(!v||typeof v!=='object'||!/^[0-9]{1,10}$/.test(v.id))fail();out[k]={id:v.id,name:text(v.name,80)};break;
  case'watchlist':if(!Array.isArray(v)||v.length>40)fail();out[k]=v.map(r=>{const date=text(r.date||'',10);if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))fail();let link='';if(r.url){const u=new URL(text(r.url,1024));if(u.protocol!=='https:'||u.username||u.password)fail();link=u.href}return{id:text(r.id,100),title:text(r.title,160),date,type:oneOf(r.type,['movie','anime','tv']),url:link}});break;
  case'savedNews':if(!Array.isArray(v)||v.length>40)fail();out[k]=v.map(r=>{const u=new URL(text(r.url,2048));if(u.protocol!=='https:'||u.username||u.password)fail();return{title:text(r.title,300),url:u.href,source:text(r.source||'',80)}});break;
  default:fail();
 }return out;
}
