import {searchSettings,cleanExperience,islandState,undoChange,preferenceDifference} from './experience-model.js';

const AuraExperience=(()=>{
 const q=selector=>document.querySelector(selector);
 const safe=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 let initialized=false,prefs,root,expanded=false,notice=null,history=[],restoring=false,searchQuery='',searchFocused=false,searchCaret=0,decorationFrame=0,lastKind='',lastImage='',lastActions='',lastAnnouncement='';
 const preferenceKeys=new Set(['design','background','prefs','feature-prefs','tile-order','favorite-apps','location']);
 function preferenceChanged(key,current,previous){
  if(!initialized||restoring||!preferenceKeys.has(key)||!preferenceDifference(previous,current))return;
  const now=Date.now(),record=history[history.length-1];
  const before=undoChange(previous,current);
  if(record&&record.key===key&&now-record.at<900){record.at=now;for(const field of Object.keys(before))if(!Object.hasOwn(record.before,field))record.before[field]=before[field]}
  else history.push({key,at:now,before});
  if(history.length>20)history.shift();
  updateUndo();
 }
 function updateUndo(){
  for(const button of document.querySelectorAll('[data-experience-undo]'))button.disabled=!history.length;
  const label=q('#experience-undo-note');if(label)label.textContent=history.length?'この画面を開いてからの変更を、'+history.length+'段階戻せます。':'色・背景などを変更すると、その直前の設定へ戻せます。';
 }
 function undo(){
  const record=history.pop();if(!record)return;
  restoring=true;
  try{Home.restorePreferences(record.before);toast('設定を元に戻しました。')}
  catch{history.push(record);toast('設定を戻せませんでした。もう一度お試しください。')}
  finally{restoring=false;updateUndo();tick()}
 }
 function setExpanded(value,focus=false){
  expanded=value;root?.classList.toggle('expanded',value);
  q('#island-toggle')?.setAttribute('aria-expanded',String(value));
  const detail=q('#island-detail');if(detail){detail.hidden=!value;detail.inert=!value}
  if(focus)q('#island-toggle')?.focus({preventScroll:true});
 }
 function announce(message){
  if(!initialized||!prefs.enabled)return false;
  notice={message:String(message).slice(0,240),until:Date.now()+5000};
  setExpanded(true);tick();
  const live=q('#island-live');if(live)live.textContent=notice.message;
  return true;
 }
 function savePrefs(){set('experience',prefs);syncHost();tick()}
 function syncHost(){
  if(!root)return;
  const preview=q('#design-full-preview[open]'),panel=q('#panel'),target=panel?.open?panel:document.body;
  const visible=prefs.enabled&&!preview;
  if(root.parentElement!==target){try{root.hidePopover?.()}catch{}target.appendChild(root)}
  root.hidden=!visible;
  if(!visible){try{root.hidePopover?.()}catch{}return}
  if(typeof root.showPopover==='function'){root.setAttribute('popover','manual');try{root.showPopover()}catch{}}
 }
 function positionPanel(){if(!root||root.hidden)return;const top=parseFloat(getComputedStyle(root).top)||14;document.documentElement.style.setProperty('--island-panel-top',Math.max(82,Math.ceil(top+root.getBoundingClientRect().height+12))+'px')}
 function setText(selector,value){const element=q(selector);if(element&&element.textContent!==value)element.textContent=value}
 function renderActions(kind){
  const key=kind+':'+Boolean(history.length);if(key===lastActions)return;lastActions=key;
  const actions=q('#island-actions'),focused=actions?.contains(document.activeElement);if(!actions)return;
  const options=kind==='timer'?[['timer','タイマーを開く']]:kind==='music'?[['stats','音楽を開く']]:kind==='news'?[['news','ニュースを開く']]:kind==='home'?[['launcher','アプリを開く'],['settings','設定']]:[];
  if(kind==='notice'&&history.length)options.push(['undo','設定を元に戻す']);
  options.push(['collapse','閉じる']);
  actions.innerHTML=options.map(([id,label])=>'<button type="button" data-island-action="'+id+'">'+label+'</button>').join('');
  for(const button of actions.querySelectorAll('button'))button.onclick=()=>{
   const action=button.dataset.islandAction;
   if(action==='undo'){undo();return}
   setExpanded(false);
   if(action==='launcher')wake();else if(action!=='collapse'){if(action==='settings')settingsTab='general';openPanel(action,q('#island-toggle'))}
  };
  if(focused)q('#island-toggle')?.focus({preventScroll:true});
 }
 function tick(){
  if(!initialized||document.hidden||!root)return;
  if(notice&&notice.until<=Date.now()){notice=null;setExpanded(false)}
  const news=prefs.news?AuraHub.newsSummary?.():null;
  const state=islandState({notice,music:prefs.music?AuraDesign.currentMusic?.():null,timers:prefs.timer?Home.getState().timers:[],newsCount:news?.newCount||0,online:navigator.onLine});
  root.dataset.kind=state.kind;
  const timerValue=state.kind==='timer'?durationText(state.remaining):state.kind==='news'?state.count+'件':'';
  setText('#island-title',state.title);setText('#island-value',timerValue);setText('#island-caption',state.detail);
  const imageKey=state.kind+':'+(state.image||'');
  if(lastImage!==imageKey){lastImage=imageKey;const mark=q('#island-mark');mark.innerHTML=state.image?'<img alt="" referrerpolicy="no-referrer" src="'+safe(state.image)+'">':icon(state.kind==='timer'?'timer':state.kind==='news'?'news':state.kind==='music'?'stats':'clock');const image=mark.querySelector('img');if(image)image.onerror=()=>{mark.innerHTML=icon('stats')}}
  if(state.kind!==lastKind&&lastKind){root.classList.remove('island-attention');requestAnimationFrame(()=>root.classList.add('island-attention'))}
  if(state.kind==='music'&&state.title!==lastAnnouncement){lastAnnouncement=state.title;const live=q('#island-live');if(live)live.textContent='再生中：'+state.title}
  lastKind=state.kind;renderActions(state.kind);syncHost();
 }
 function renderSearchResults(){
  const results=q('#settings-search-results');if(!results)return;
  const entries=searchSettings(searchQuery);results.hidden=!searchQuery.trim();
  results.innerHTML=entries.length?entries.map((entry,index)=>'<button type="button" data-settings-result="'+index+'"><span>'+safe(entry.label)+'</span><small>'+(entry.app?'アプリを開く':entry.tab==='display'?'表示':entry.tab==='account'?'アカウント':'一般')+' →</small></button>').join(''):'<p class="help">見つかりません。「時計」「天気」「ぼかし」などで検索できます。</p>';
  for(const button of results.querySelectorAll('button'))button.onclick=()=>openSetting(entries[Number(button.dataset.settingsResult)]);
 }
 function openSetting(entry){
  searchFocused=false;searchQuery='';
  if(entry.app)openPanel(entry.app,q('#settings-search-input'));
  else{settingsTab=entry.tab;renderSettingsPanel()}
  requestAnimationFrame(()=>{
   decorate();renderSearchResults();
   const target=q(entry.selector);if(!target)return;
   const details=target.closest('details');if(details)details.open=true;
   target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
   const control=target.matches('button,input,select,textarea')?target:target.querySelector('button,input,select,textarea');
   control?.focus({preventScroll:true});
   target.classList.add('settings-search-highlight');setTimeout(()=>target.classList.remove('settings-search-highlight'),1800);
  });
 }
 function decorate(){
  syncHost();
  const header=q('.panel-header-end');
  if(header&&!q('#prefs-undo')){
   const button=document.createElement('button');button.type='button';button.id='prefs-undo';button.className='icon-button';button.title='設定を元に戻す';button.setAttribute('aria-label','設定を元に戻す');button.setAttribute('data-experience-undo','');button.textContent='↶';button.onclick=undo;header.prepend(button);
  }
  const undoButton=q('#prefs-undo');if(undoButton)undoButton.hidden=!['settings','background','stats'].includes(currentPanel);
  if(currentPanel!=='settings'){searchFocused=false;updateUndo();return}
  const content=q('#panel-content'),layout=q('.settings-layout');
  if(layout&&!q('#settings-search-form')){
   const wrapper=document.createElement('form');wrapper.id='settings-search-form';wrapper.className='settings-search';wrapper.setAttribute('role','search');
   wrapper.innerHTML='<label for="settings-search-input">設定を検索</label><div class="settings-search-row"><input id="settings-search-input" type="search" autocomplete="off" placeholder="時計の色・ぼかし・省エネ…" value="'+safe(searchQuery)+'"><button type="button" id="settings-search-clear" aria-label="設定の検索を消す">×</button></div><div id="settings-search-results" class="settings-search-results" aria-label="設定の検索結果" hidden></div>';
   content.insertBefore(wrapper,layout);wrapper.onsubmit=event=>{event.preventDefault();const entry=searchSettings(searchQuery)[0];if(entry)openSetting(entry)};
   const input=q('#settings-search-input');input.oninput=()=>{searchQuery=input.value;searchCaret=input.selectionStart||0;renderSearchResults()};input.onfocus=()=>searchFocused=true;input.onblur=event=>{if(event.relatedTarget)searchFocused=false};input.onkeydown=event=>{if(event.key==='Escape'&&input.value){event.preventDefault();event.stopPropagation();input.value='';searchQuery='';renderSearchResults()}if(event.key==='ArrowDown'){const result=q('[data-settings-result]');if(result){event.preventDefault();searchFocused=false;result.focus()}}};
   q('#settings-search-clear').onclick=()=>{input.value='';searchQuery='';renderSearchResults();input.focus()};
   renderSearchResults();
   if(searchFocused&&q('#panel')?.open){input.focus({preventScroll:true});try{input.setSelectionRange(searchCaret,searchCaret)}catch{}}
  }
  if(settingsTab==='general'&&!q('#experience-controls')){
   const card=document.createElement('section');card.id='experience-controls';card.className='settings-card';
   card.innerHTML='<h4>Dynamic Island</h4><p class="help">上部から滑らかに現れる、曲・タイマー・新着・お知らせの表示です。</p>'+[['enabled','Dynamic Islandを表示'],['music','再生中の曲'],['timer','実行中のタイマー'],['news','ニュースの新着']].map(([key,label])=>'<label class="hub-check"><input type="checkbox" data-island-setting="'+key+'" '+(prefs[key]?'checked':'')+'>'+label+'</label>').join('')+'<button class="secondary" type="button" id="island-preview">動きをプレビュー</button><h4>設定を元に戻す</h4><p id="experience-undo-note" class="help"></p><button class="secondary" id="experience-undo" type="button" data-experience-undo>直前の設定に戻す</button>';
   const view=q('#settings-view'),heading=view?.querySelector('h3');if(heading)heading.after(card);else view?.prepend(card);
   for(const input of card.querySelectorAll('[data-island-setting]'))input.onchange=()=>{prefs[input.dataset.islandSetting]=input.checked;savePrefs()};
   q('#island-preview').onclick=()=>{if(!prefs.enabled){prefs.enabled=true;const toggle=q('[data-island-setting="enabled"]');if(toggle)toggle.checked=true;savePrefs()}announce('Dynamic Islandの動きのプレビューです。')};
   q('#experience-undo').onclick=undo;
  }
  updateUndo();
 }
 function scheduleDecoration(){if(decorationFrame)return;decorationFrame=requestAnimationFrame(()=>{decorationFrame=0;decorate()})}
 function init(){
  if(initialized)return;initialized=true;prefs=cleanExperience(get('experience',{}));
  root=document.createElement('aside');root.id='aura-island';root.className='aura-island';root.setAttribute('aria-label','Aura Homeのお知らせ');
  root.innerHTML='<button id="island-toggle" type="button" aria-expanded="false" aria-controls="island-detail" aria-label="Dynamic Islandを開く"><span id="island-mark" class="island-mark"></span><span id="island-title" class="island-title"></span><span id="island-value" class="island-value"></span><span class="island-dot" aria-hidden="true"></span></button><section id="island-detail" hidden inert><p id="island-caption"></p><div id="island-actions" class="island-actions"></div></section><span id="island-live" class="visually-hidden" aria-live="polite" aria-atomic="true"></span>';
  document.body.appendChild(root);if(typeof ResizeObserver==='function')new ResizeObserver(positionPanel).observe(root);q('#island-toggle').onclick=()=>setExpanded(!expanded);
  document.addEventListener('pointerdown',event=>{if(expanded&&!root.contains(event.target))setExpanded(false)},{passive:true});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&expanded&&root.contains(event.target)){event.preventDefault();event.stopPropagation();setExpanded(false,true)}},true);
  const observer=new MutationObserver(records=>{if(records.some(record=>!record.target.closest?.('#aura-island,#settings-search-form,#experience-controls')))scheduleDecoration()});
  const content=q('#panel-content');if(content)observer.observe(content,{childList:true,subtree:true});
  const panel=q('#panel');if(panel)observer.observe(panel,{attributes:true,attributeFilter:['open']});
  const app=q('#aura-app');if(app)observer.observe(app,{childList:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncHost();tick()}});
  tick();decorate();requestAnimationFrame(()=>root.classList.add('island-ready'));setInterval(tick,1000);
 }
 return {init,preferenceChanged,announce,tick,undo};
})();
window.AuraExperience=AuraExperience;
