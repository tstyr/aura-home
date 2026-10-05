// This script is served only after server-side authentication. Never cache it.
// Storage keys are scoped to the verified Auth user, including offline timers.
export function localStateScript(userId,migrateLegacy=false){
 const id=JSON.stringify(userId).replaceAll('<','\\u003c');
 return `(()=>{const prefix='aura-user:'+${id}+':';try{if(${Boolean(migrateLegacy)}&&!localStorage.getItem(prefix+'migrated')){for(const key of Object.keys(localStorage)){if(key.startsWith('aura-')&&!key.startsWith('aura-user:')&&localStorage.getItem(prefix+key)===null)localStorage.setItem(prefix+key,localStorage.getItem(key))}localStorage.setItem(prefix+'migrated','true')}}catch{}window.AuraLocal={getItem(key){return localStorage.getItem(prefix+key)},setItem(key,value){localStorage.setItem(prefix+key,value)}}})();`;
}
