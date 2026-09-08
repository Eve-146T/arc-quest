"""Differential oracle: use the installed, unmodified SDK local wrapper."""
import hashlib
import json
import logging
import os
from pathlib import Path
import random
import numpy as np
from arc_agi import Arcade, OperationMode
from arcengine import GameAction, GameState
from arc_agi.scorecard import EnvironmentScoreCalculator
logging.disable(logging.CRITICAL)
os.environ['ONLY_RESET_LEVELS']='true'
root=Path(__file__).resolve().parents[1]
arc=Arcade(operation_mode=OperationMode.OFFLINE,environments_dir=str(root/'vendor/environments'))
fixtures=[]
rng=random.Random(173)
def normalized(obs, score):
    s=score.model_dump(mode='json')
    return {'frame':obs.frame[-1].tolist(),'state':obs.state.value,'completed':obs.levels_completed,
        'score':{k:s[k] for k in ['score','levels_completed','actions','resets','level_scores','level_actions','level_baseline_actions']}}
for meta in json.loads((root/'public/games.json').read_text()):
    os.environ.pop('ONLY_RESET_LEVELS',None)
    random.seed(0);np.random.seed(0)
    env=arc.make(meta['version'])
    os.environ['ONLY_RESET_LEVELS']='true'
    def snap():
        card=arc.get_scorecard().find_environment(meta['id']).runs[-1]
        return normalized(env.observation_space,card)
    trace=[{'action':None,'expected':snap()}]
    for i in range(32):
        if env.observation_space.state==GameState.WIN:break
        actions=env.observation_space.available_actions
        action={'id':0 if i in [4,5,20] or env.observation_space.state==GameState.GAME_OVER else rng.choice(actions)}
        if action['id']==6:action.update(x=rng.randrange(64),y=rng.randrange(64))
        env.step(GameAction.from_id(action['id']),data={k:v for k,v in action.items() if k!='id'})
        trace.append({'action':action,'expected':snap()})
    fixtures.append({'id':meta['id'],'trace':trace})
(root/'test-results/native-fixtures.json').write_text(json.dumps(fixtures,separators=(',',':')))
print('Generated native SDK reference traces:',len(fixtures),'games,',sum(len(f['trace']) for f in fixtures),'states')

cases=[]
for i in range(1000):
    n=rng.randint(1,10);completed=rng.randint(0,n);baselines=[rng.randint(1,500) for _ in range(n)];actions=[rng.randint(0,2000) for _ in range(n)]
    calc=EnvironmentScoreCalculator()
    for j in range(n):calc.add_level(j+1,j<completed,actions[j],baselines[j])
    expected=calc.to_score().model_dump(mode='json')
    cases.append({'baselines':baselines,'actions':actions,'completed':completed,'expected':expected['score'],'level_scores':expected['level_scores']})
(root/'test-results/score-fixtures.json').write_text(json.dumps(cases))
print('Generated 1000 official grading cases')
