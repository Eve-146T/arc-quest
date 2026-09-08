import {cp,readdir,writeFile,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
async function walk(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())result.push(...await walk(p));else result.push(p);}return result;}
const files=(await walk('public')).map(p=>'./'+p.slice(7)).filter(p=>!p.endsWith('/sw.js'));
const hash=createHash('sha256');for(const file of [...files].sort()){hash.update(file);hash.update(await readFile(path.join('public',file)));}
const version='arc-quest-v1-'+hash.digest('hex').slice(0,16);
await writeFile('public/sw.js',`const CACHE=${JSON.stringify(version)};const ASSETS=${JSON.stringify(files)};\nself.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));\nself.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('arc-quest-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));\nself.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.match(e.request).then(async hit=>hit||(e.request.mode==='navigate'?await caches.match(new URL('index.html',self.registration.scope)):null)||fetch(e.request)));});\n`);
await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});console.log('Built',files.length+1,'self-hosted assets.');
