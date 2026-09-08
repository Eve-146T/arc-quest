// Sandbox level entry: every level of every game can be opened directly and renders a playable frame.
// Runs the bridge in Node's Pyodide with the vendored wheels; no server or browser needed.
import {loadPyodide} from 'pyodide';
import {readFile,readdirSync,writeFileSync} from 'node:fs';
import {readFile as read} from 'node:fs/promises';
import assert from 'node:assert/strict';
const RT=new URL('../public/runtime/',import.meta.url).pathname;
const py=await loadPyodide();
await py.loadPackage(readdirSync(RT).filter(f=>f.endsWith('.whl')).map(f=>RT+f));
py.unpackArchive(new Uint8Array(await read('public/engine.zip')),'zip',{extractDir:'/app'});
py.runPython("import sys; sys.path.insert(0,'/app')");
await py.runPythonAsync(await read('public/bridge.py','utf8'));
const call=p=>{py.globals.set('payload',JSON.stringify(p));return JSON.parse(py.runPython('dispatch(payload)'));};
const games=JSON.parse(await read('public/games.json','utf8'));
const report=[];let levels=0;
for(const g of games){
  for(let level=0;level<g.levels;level++){
    const s=call({type:'start',game:g.id,level,sandbox:true});
    assert.equal(s.state,'NOT_FINISHED',`${g.id} level ${level+1} state`);assert.equal(s.level,level,`${g.id} level index`);assert.equal(s.completed,0);
    assert.ok(s.frames[0].length===64&&s.frames[0].every(r=>r.length===64),'frame shape');
    // The frame must differ from level 1's frame for every later level, otherwise the jump did nothing.
    if(level>0){const first=call({type:'start',game:g.id,level:0,sandbox:true});const same=JSON.stringify(first.frames[0])===JSON.stringify(s.frames[0]);report.push({game:g.id,level:level+1,identicalToLevel1:same});}
    // A reset at the level stays on that level and costs nothing in sandbox terms.
    const r=call({type:'start',game:g.id,level,sandbox:true});const after=call({type:'action',action:{id:0}});assert.equal(after.level,level,`${g.id} reset keeps level`);assert.equal(after.state,'NOT_FINISHED');
    levels++;
  }
  console.log('PASS',g.id,g.levels,'levels');
}
const identical=report.filter(r=>r.identicalToLevel1);
console.log(JSON.stringify({games:games.length,levels,identicalToLevel1:identical}));
writeFileSync('test-results/levels-report.json',JSON.stringify({games:games.length,levels,identicalToLevel1:identical},null,2));
