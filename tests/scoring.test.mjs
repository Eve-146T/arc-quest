import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const cases=JSON.parse(readFileSync('test-results/score-fixtures.json','utf8'));
// Independent implementation of the published equations, used only as a test oracle.
const grade=(baselines,actions,completed)=>{let earned=0,cap=0;const weights=baselines.length*(baselines.length+1)/2;for(let i=0;i<baselines.length;i++){if(i<completed&&actions[i]>0){earned+=(i+1)*Math.min(115,100*(baselines[i]/actions[i])**2);cap+=(i+1)*100;}}return Math.min(earned,cap)/weights;};
test('1,000 official scoring results match the published squared ratio, 115% cap, level weights and completion cap',()=>{for(const c of cases)assert.ok(Math.abs(grade(c.baselines,c.actions,c.completed)-c.expected)<1e-10)});
test('doubling the human action count earns 25%',()=>assert.equal(grade([10],[20],1),25));
test('first four of five levels cap at 66.6667%, even with shortcuts',()=>assert.ok(Math.abs(grade([10,10,10,10,10],[1,1,1,1,0],4)-200/3)<1e-10));
test('all uncompleted levels count as zero',()=>assert.equal(grade([10,20,30],[0,0,0],0),0));
test('a fast level offsets a slower level only up to the 115% limit',()=>assert.equal(grade([10,10],[1,20],2),55));

test('sandbox level percentages match all official per-level fixture results', async () => {
  const {levelScore} = await import('../public/progress.js');
  for (const c of cases) for (let i = 0; i < c.baselines.length; i++) {
    const score = levelScore(c.baselines[i], i < c.completed ? c.actions[i] : null);
    assert.ok(Math.abs(score - c.level_scores[i]) < 1e-10);
  }
});
