import {XMLParser} from 'fast-xml-parser';
import {NEWS_TOPICS} from './hub-settings.js';
const cache=new Map();
const userError=e=>e?.name==='TimeoutError'||e?.name==='AbortError'?'情報の取得に時間がかかっています。もう一度更新してください。':e?.message==='fetch failed'?'情報元に接続できませんでした。もう一度更新してください。':e?.message||'情報を取得できませんでした。';
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private,no-store'}});
const str=(v,max=300)=>typeof v==='string'?v.slice(0,max):'';
const https=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
const date=v=>{const d=new Date(v);return v&&Number.isFinite(d.getTime())?d.toISOString():null};
async function limited(response,max=2*1024*1024){const reader=response.body.getReader();let size=0,chunks=[];while(true){const{done,value}=await reader.read();if(done)break;if((size+=value.length)>max){await reader.cancel();throw Error('情報が大きすぎます。')}chunks.push(value)}return new TextDecoder().decode(Buffer.concat(chunks))}
async function external(url,{json=true,redirectHosts=[],...options}={}){let response;for(let hop=0;hop<4;hop++){response=await fetch(url,{...options,signal:AbortSignal.timeout(12000),redirect:'manual'});if(![301,302,303,307,308].includes(response.status))break;const target=new URL(response.headers.get('location')||'',url);await response.body?.cancel();if(target.protocol!=='https:'||target.username||target.password||!redirectHosts.includes(target.hostname))throw Error('情報元の転送先を確認できません。');url=target.href}if(!response?.ok)throw Object.assign(Error(response?.status===429?'取得回数の上限です。少し待って更新してください。':'情報元から取得できませんでした。'),{status:response?.status});const raw=await limited(response);if(!json)return raw;try{return JSON.parse(raw)}catch{throw Error('情報元の形式を読み込めませんでした。')}}
async function cached(key,loader){const old=cache.get(key),now=Date.now();if(old&&now-old.at<300000)return old.value;if(old?.retryAt>now)return{...old.value,stale:true,error:old.error};try{const value={...await loader(),updatedAt:new Date().toISOString(),stale:false};if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,{at:now,value});return value}catch(e){if(old){cache.set(key,{...old,retryAt:now+60000,error:userError(e)});return{...old.value,stale:true,error:userError(e)}}throw e}}
export function parseRSS(raw){
 if(/<!DOCTYPE|<!ENTITY/i.test(raw))throw Error('フィードの形式を確認できませんでした。');
 const parsed=new XMLParser({parseTagValue:false,ignoreAttributes:false,processEntities:false}).parse(raw);
 const list=parsed.rss?.channel?.item;if(!list)return[];
 return(Array.isArray(list)?list:[list]).slice(0,25).map(r=>({title:str(r.title).replace(/&amp;/g,'&').replace(/&quot;/g,'"'),url:https(r.link),date:date(r.pubDate),source:str(r.source?.['#text']||'NHK',80)})).filter(x=>x.title&&x.url);
}
export async function handleInfo(request,env,url){
 if(request.method!=='GET')return reply({error:'対応していない操作です。'},405);
 try{
  const kind=url.pathname.split('/').pop();
  if(kind==='news'){
   const topic=url.searchParams.get('topic')||'top',source=url.searchParams.get('source')||'nhk';if(!NEWS_TOPICS.includes(topic)||!['nhk','google'].includes(source))return reply({error:'ジャンルを選んでください。'},400);
   const cats={top:0,society:1,science:3,business:5,world:6,sports:7,culture:2};
   return reply(await cached('news:'+source+':'+topic,async()=>{
    const topics={top:'',society:'社会',science:'科学 技術',business:'経済',world:'国際',sports:'スポーツ',culture:'文化 音楽'};
    const feed=source==='nhk'?'https://www.nhk.or.jp/rss/news/cat'+cats[topic]+'.xml':(topic==='top'?'https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja':'https://news.google.com/rss/search?hl=ja&gl=JP&ceid=JP:ja&q='+encodeURIComponent(topics[topic]));
    const redirectHosts=source==='nhk'?['www.nhk.or.jp','www3.nhk.or.jp','news.web.nhk']:[];
    let raw;try{raw=await external(feed,{json:false,redirectHosts})}catch(e){if(source!=='nhk')throw e;raw=await external('https://www3.nhk.or.jp/rss/news/cat'+cats[topic]+'.xml',{json:false,redirectHosts})}
    return{source:source==='nhk'?'NHK':'Googleニュース',items:parseRSS(raw)};
   }));
  }
  if(kind==='sports'){
   const id=url.searchParams.get('team')||'133604';if(!/^\d{1,10}$/.test(id))return reply({error:'チームを選んでください。'},400);
   const key=env.SPORTSDB_API_KEY||'123';return reply(await cached('sports:'+id,async()=>{
    const base='https://www.thesportsdb.com/api/v1/json/'+encodeURIComponent(key)+'/';
    const outcomes=await Promise.allSettled([external(base+'lookupteam.php?id='+id),external(base+'eventsnext.php?id='+id),external(base+'eventslast.php?id='+id)]);
    const team=outcomes[0].status==='fulfilled'?outcomes[0].value.teams?.[0]:null;
    const events=(r,upcoming)=>r.status==='fulfilled'?(r.value.events||r.value.results||[]).slice(0,10).map(e=>({id:str(e.idEvent),title:str(e.strEvent),date:date(e.strTimestamp)||date(e.dateEvent),home:str(e.strHomeTeam),away:str(e.strAwayTeam),homeScore:e.intHomeScore,awayScore:e.intAwayScore,upcoming})):[];
    if(outcomes.every(r=>r.status==='rejected'))throw Error('スポーツ情報を取得できませんでした。');
    return{source:'TheSportsDB',team:team?{id:str(team.idTeam),name:str(team.strTeam),sport:str(team.strSport),league:str(team.strLeague)}:null,items:[...events(outcomes[1],true),...events(outcomes[2],false)],limited:!env.SPORTSDB_API_KEY,errors:outcomes.filter(r=>r.status==='rejected').map(r=>r.reason.message)};
   }));
  }
  if(kind==='entertainment'){
   const mode=url.searchParams.get('mode')||'anime';if(!['anime','movie'].includes(mode))return reply({error:'種類を選んでください。'},400);
   if(mode==='movie'&&!env.TMDB_TOKEN)return reply({source:'TMDB',configured:false,items:[],message:'映画の自動取得にはTMDB接続が必要です。気になる作品は手動でも保存できます。'});
   return reply(await cached('entertainment:'+mode,async()=>{
    if(mode==='movie'){const data=await external('https://api.themoviedb.org/3/movie/upcoming?language=ja-JP&region=JP',{headers:{Authorization:'Bearer '+env.TMDB_TOKEN}});return{source:'TMDB',configured:true,items:(data.results||[]).slice(0,20).map(r=>({id:String(r.id),title:str(r.title),date:r.release_date||null,url:'https://www.themoviedb.org/movie/'+r.id,type:'movie'}))}}
    try{const data=await external('https://api.jikan.moe/v4/anime?status=upcoming&sfw=true&order_by=start_date&sort=asc&limit=20&start_date='+new Date().toISOString().slice(0,10));return{source:'Jikan / MyAnimeList',configured:true,items:(data.data||[]).slice(0,20).map(r=>({id:'mal-'+r.mal_id,title:str(r.title_japanese||r.title),date:r.aired?.from?.slice(0,10)||null,url:https(r.url),type:'anime'})).filter(r=>r.url)}}catch{
     const data=await external('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'{ Page(perPage:20) { media(type:ANIME,status:NOT_YET_RELEASED,isAdult:false,startDate_greater:'+ (Number(new Date().toISOString().slice(0,10).replaceAll('-',''))-1) +',sort:START_DATE) { id title { native romaji } startDate { year month day } siteUrl } } }'})});if(data.errors||!Array.isArray(data.data?.Page?.media))throw Error('アニメ情報を取得できませんでした。');return{source:'AniList',configured:true,items:data.data.Page.media.map(r=>({id:'anilist-'+r.id,title:str(r.title?.native||r.title?.romaji),date:r.startDate?.year&&r.startDate?.month&&r.startDate?.day?[r.startDate.year,String(r.startDate.month).padStart(2,'0'),String(r.startDate.day).padStart(2,'0')].join('-'):null,url:https(r.siteUrl),type:'anime'})).filter(r=>r.url)};
    }
   }));
  }
  if(kind==='transit'){
   const operator=url.searchParams.get('operator')||'TokyoMetro';if(!['TokyoMetro','JR-East','Toei'].includes(operator))return reply({error:'交通事業者を選んでください。'},400);
   if(!env.ODPT_KEY)return reply({source:'ODPT',configured:false,items:[],message:'リアルタイム運行情報は未接続です。登録した出発時刻と公式情報へのリンクを利用できます。'});
   return reply(await cached('transit:'+operator,async()=>{const data=await external('https://api.odpt.org/api/v4/odpt:TrainInformation?odpt:operator=odpt.Operator:'+operator+'&acl:consumerKey='+encodeURIComponent(env.ODPT_KEY));if(!Array.isArray(data))throw Error('運行情報の形式を確認できません。');return{source:'ODPT',configured:true,items:data.slice(0,30).map(r=>({title:str(r['odpt:railway']||r['odpt:operator']),text:str(r['odpt:trainInformationText']?.ja,1000),date:date(r['dc:date'])}))}}));
  }
  return reply({error:'見つかりません。'},404);
 }catch(e){return reply({error:userError(e)},e.status===429?429:502)}
}
