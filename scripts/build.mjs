import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url)),types={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.js':'application/javascript;charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'},assets={};
for(const name of fs.readdirSync(path.join(root,'web'))){const bytes=fs.readFileSync(path.join(root,'web',name));assets[name==='index.html'?'/':'/'+name]={type:types[path.extname(name)]||'application/octet-stream',base64:bytes.toString('base64')}}
fs.mkdirSync(path.join(root,'api'),{recursive:true});fs.mkdirSync(path.join(root,'public'),{recursive:true});
fs.writeFileSync(path.join(root,'public/robots.txt'),'User-agent: *\nDisallow: /\n');
await build({entryPoints:[path.join(root,'server/index.js')],outfile:path.join(root,'api/entry.js'),bundle:true,format:'esm',platform:'node',target:'node24',banner:{js:'const ASSETS='+JSON.stringify(assets)+';'},legalComments:'inline'});
console.log('Built protected Vercel function with '+Object.keys(assets).length+' assets');
