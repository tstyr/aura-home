export const SETTING_CATALOG=[
 {label:'時計の色',aliases:'とけい いろ カラー color',tab:'display',selector:'[data-design="color"]'},
 {label:'時計のフォント',aliases:'とけい ふぉんと 書体 font',tab:'display',selector:'.design-fonts'},
 {label:'時計のサイズ・秒',aliases:'とけい おおきさ びょう size',tab:'display',selector:'#clock-size'},
 {label:'時間帯のスタイル',aliases:'31 朝 昼 夕方 夜 自動 じどう スケジュール',tab:'display',selector:'#design-schedule-controls'},
 {label:'天気別の配色',aliases:'32 てんき はいしょく 雨 晴れ 曇り 雪 霧',tab:'display',selector:'#design-weather-colors'},
 {label:'夜間モード',aliases:'33 よる やかん 暗さ 明るさ ナイト',tab:'display',selector:'#design-night-controls'},
 {label:'省エネモード',aliases:'34 しょうえね 節電 電池 バッテリー',tab:'display',selector:'#design-power-controls'},
 {label:'ガラス・ぼかし',aliases:'すりがらす ぼかし 透明 blur',tab:'display',selector:'[data-design="launcherBlur"]'},
 {label:'日付と秒の色',aliases:'ひづけ びょう 色',tab:'display',selector:'[data-design="dateColor"]'},
 {label:'保存したスタイル',aliases:'プリセット ほぞん 保存',tab:'display',selector:'#design-save-style'},
 {label:'お気に入りのアプリ',aliases:'36 おきにいり 固定 アプリ',tab:'general',selector:'#favorites-settings'},
 {label:'Dynamic Island',aliases:'ダイナミックアイランド お知らせ 通知 上部',tab:'general',selector:'#experience-controls'},
 {label:'設定を元に戻す',aliases:'40 undo もどす 元に戻す やり直し',tab:'general',selector:'#experience-undo'},
 {label:'待機画面までの時間',aliases:'ほうち 放置 待機 自動 ロック',tab:'general',selector:'#idle-setting'},
 {label:'アプリの並び順',aliases:'順番 アプリ 並び替え ならび',tab:'general',selector:'.settings-app-order'},
 {label:'ニュースの除外設定',aliases:'38 39 ニュース 新着 除外 キーワード 情報源',app:'news',selector:'.news-exclusion-settings'},
 {label:'曲カードの見た目',aliases:'37 音楽 おんがく 曲 ジャケット 位置 大きさ',app:'stats',selector:'#music-card-controls'},
 {label:'背景の天気',aliases:'はいけい てんき 背景 雨 写真',app:'background',selector:'.background-weather-controls'},
 {label:'アカウント・連携',aliases:'Google ぐーぐる アカウント れんけい ログイン',tab:'account',selector:'.account-summary'}
];
const normalized=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ja-JP').trim();
export function searchSettings(query,catalog=SETTING_CATALOG){
 const words=normalized(query).split(/\s+/).filter(Boolean);
 return words.length?catalog.filter(entry=>words.every(word=>normalized(entry.label+' '+entry.aliases).includes(word))).slice(0,12):[];
}
export function cleanExperience(value){
 const input=value&&typeof value==='object'?value:{};
 return Object.fromEntries(['enabled','music','timer','news'].map(key=>[key,typeof input[key]==='boolean'?input[key]:true]));
}
export function islandState({notice,music,timers=[],newsCount=0,online=true,now=Date.now()}){
 if(notice&&notice.until>now)return {kind:'notice',title:String(notice.message).slice(0,240),detail:'お知らせ'};
 const running=timers.filter(timer=>!timer._deleted&&!timer.done&&Number.isFinite(timer.end)&&timer.end>now).sort((a,b)=>a.end-b.end)[0];
 if(running)return {kind:'timer',title:String(running.title||'タイマー').slice(0,100),remaining:Math.max(0,Math.ceil((running.end-now)/1000)),detail:running.mode==='pomodoro'?(running.phase==='break'?'休憩の時間':'集中の時間'):'タイマー実行中'};
 if(music)return {kind:'music',title:String(music.name).slice(0,160),detail:String(music.artists||'再生中').slice(0,160),image:music.image};
 if(Number.isInteger(newsCount)&&newsCount>0)return {kind:'news',title:'新着ニュース',detail:newsCount+'件の記事を確認できます',count:newsCount};
 return {kind:'home',title:'Aura Home',detail:online?'時計・天気・音楽をひとつに':'オフライン · 保存済みの時計とタイマーを利用できます'};
}
const undoKeys=['design','background','clockSize','clockSeconds','clock24','clockWeight','idle','keepAwake','homeAgenda','favoriteApps','tileOrder','location'];
export function undoSnapshot(settings){
 return structuredClone(Object.fromEntries(undoKeys.filter(key=>Object.hasOwn(settings||{},key)).map(key=>[key,settings[key]])));
}
export function undoChange(before,after){
 return undoSnapshot(Object.fromEntries(undoKeys.filter(key=>JSON.stringify(before?.[key])!==JSON.stringify(after?.[key])&&Object.hasOwn(before||{},key)).map(key=>[key,before[key]])));
}
export function preferenceDifference(before,after){
 return undoKeys.some(key=>JSON.stringify(before?.[key])!==JSON.stringify(after?.[key]));
}
