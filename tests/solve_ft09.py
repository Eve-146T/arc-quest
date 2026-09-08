"""Create a completion test trace. Solver is test-only and never shipped."""
import importlib.util
import itertools
import json
from pathlib import Path
import numpy as np
from arcengine import ActionInput, GameAction, GameState
path=next(Path('vendor/environments/ft09').glob('*/*.py'))
spec=importlib.util.spec_from_file_location('ft09_test',path);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
g=mod.Ft09();g.perform_action(ActionInput(id=GameAction.RESET))
trace=[]
while g._state!=GameState.WIN:
    level=g.level_index
    cells=g.fhc+g.mou;n=len(cells);k=len(g.gqb)
    print('Solving level',level+1,'cells',n,'colors',k,flush=True)
    allowed=np.ones((n,k),dtype=bool)
    for target in g.gig:
        color=g.gqb.index(int(target.pixels[1][1]))
        for ci,c in enumerate(cells):
            dx=(c.x-target.x)//4;dy=(c.y-target.y)//4
            if abs(dx)<=1 and abs(dy)<=1 and (dx or dy):
                if int(target.pixels[dy+1][dx+1])==0:
                    allowed[ci,:]=False;allowed[ci,color]=True
                else:allowed[ci,color]=False
    effect=np.zeros((n,n),dtype=int)
    for a,c in enumerate(cells):
        pattern=g.irw if c in g.fhc else [[int(c.pixels[y][x]==6 or (x==1 and y==1)) for x in range(3)] for y in range(3)]
        for ci,other in enumerate(cells):
            dx=(other.x-c.x)//4;dy=(other.y-c.y)//4
            if abs(dx)<=1 and abs(dy)<=1:effect[a,ci]=pattern[dy+1][dx+1]
    from z3 import Int, Solver, Or, sat
    counts=[Int(f'click_{i}') for i in range(n)]
    solver=Solver()
    for c in counts:solver.add(c>=0,c<k)
    for ci in range(n):
        value=sum(counts[a]*int(effect[a,ci]) for a in range(n)) % k
        solver.add(Or([value==color for color in range(k) if allowed[ci,color]]))
    assert solver.check()==sat
    model=solver.model()
    best=np.array([model[c].as_long() for c in counts])
    assert best is not None
    actions=[]
    for c,count in zip(cells,best):
        for _ in range(int(count)):
            # Invert the public display-to-grid mapping without assuming a scale.
            xy=next((x,y) for y in range(64) for x in range(64) if g.camera.display_to_grid(x,y)==(c.x+1,c.y+1))
            actions.append({'id':6,'x':xy[0],'y':xy[1]})
    for action in actions:
        f=g.perform_action(ActionInput(id=GameAction.ACTION6,data={'x':action['x'],'y':action['y']}))
        trace.append(action)
        if g.level_index!=level or f.state==GameState.WIN:break
    assert g.level_index!=level or g._state==GameState.WIN, 'Solution did not advance'
Path('test-results/ft09-solution.json').write_text(json.dumps(trace))
print('All six levels solved in',len(trace),'actions')
