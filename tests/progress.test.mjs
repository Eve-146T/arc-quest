import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nextRunGame, completedRecord, sandboxRating, allGold} from '../public/progress.js';
const games=[{id:'a',levels:2,baseline:[10,20],version:'a-v1',sha256:'sha-a'},{id:'b',levels:1,baseline:[5],version:'b-v1',sha256:'sha-b'}];
const records={games:{a:{version:'a-v1',sha256:'sha-a',recordActions:[4,8]}}};
test('benchmark resumes the first unfinished game even with legacy out-of-order progress',()=>{
 const run={lastGame:'b',games:{b:{history:[{id:1}],summary:{state:'NOT_FINISHED'}}}};
 assert.equal(nextRunGame(games,run),'a');run.games.a={summary:{state:'WIN'}};
 assert.equal(nextRunGame(games,run),'b');run.games.b.summary.state='WIN';assert.equal(nextRunGame(games,run),null);
});
test('records exclude abandoned partial runs, include a finished current run immediately',()=>{
 const partial={score:80,games:1,levels:2}, full={score:60,games:2,levels:3};
 assert.equal(completedRecord(games,{games:{}},[partial],0),null);
 assert.equal(completedRecord(games,{games:{}},[partial,full],0).score,60);
 assert.equal(completedRecord(games,{games:{a:{summary:{state:'WIN'}},b:{summary:{state:'WIN'}}}},[partial,full],75).score,75);
});
test('diamonds stay secret until every level is gold, then reveal earlier records too',()=>{
 const s={a:{0:4,1:20},b:{0:6}};
 assert.equal(allGold(games,s),false);assert.equal(sandboxRating(games,s,records,'a',0),'gold');
 s.b[0]=5;assert.equal(allGold(games,s),true);assert.equal(sandboxRating(games,s,records,'a',0),'diamond');
 assert.equal(sandboxRating(games,s,records,'a',0,9),'gold');
 s.a[0]=3;assert.equal(sandboxRating(games,s,records,'a',0),'diamond');
 s.a[0]=5;assert.equal(sandboxRating(games,s,records,'a',0),'gold');
 assert.equal(sandboxRating(games,s,records,'b',0),'gold');
 assert.equal(sandboxRating(games,s,{games:{a:{...records.games.a,sha256:'wrong'}}},'a',0),'gold');
 delete s.a[1];assert.equal(allGold(games,s),false);assert.equal(sandboxRating(games,s,records,'a',1),'');
});
test('bundled records cover exactly the version-pinned games with valid counts or explicit gaps',()=>{
 const manifest=JSON.parse(readFileSync('public/games.json')), snapshot=JSON.parse(readFileSync('public/diamonds.json'));
 assert.equal(snapshot.source,'https://arc3.games/');assert.ok(!Number.isNaN(Date.parse(snapshot.fetchedAt)));
 for(const g of manifest){const r=snapshot.games[g.id];assert.equal(r.version,g.version);assert.equal(r.sha256,g.sha256);assert.equal(r.recordActions.length,g.levels);assert.ok(r.recordActions.every(n=>n===null||Number.isInteger(n)&&n>0));}
});
