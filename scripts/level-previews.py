"""Render each level's actual initial frame as a lossless thumbnail."""
import importlib.util
import json
import os
import random
from pathlib import Path
import numpy as np
from PIL import Image
from arcengine import ActionInput, GameAction

root = Path(__file__).resolve().parents[1]
colors = ['FFFFFF','CCCCCC','999999','666666','333333','000000','E53AA3','FF7BCC','F93C31','1E93FF','88D8F1','FFDC00','FF851B','921231','4FCC30','A356D6']
palette = [int(c[i:i+2],16) for c in colors for i in (0,2,4)]
for meta in json.loads((root / 'public/games.json').read_text()):
    game_id = meta['id']
    path = next((root / 'vendor/environments' / game_id).glob('*/*.py'))
    spec = importlib.util.spec_from_file_location(game_id + '_preview', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    target = root / 'public/assets/levels' / game_id
    target.mkdir(parents=True, exist_ok=True)
    for level in range(meta['levels']):
        random.seed(0)
        np.random.seed(0)
        os.environ.pop('ONLY_RESET_LEVELS', None)
        game = getattr(mod, game_id.capitalize())()
        frame = game.perform_action(ActionInput(id=GameAction.RESET))
        os.environ['ONLY_RESET_LEVELS'] = 'true'
        if level:
            game.set_level(level)
            frame = game.perform_action(ActionInput(id=GameAction.RESET))
        pixels = np.asarray(frame.frame[-1], dtype=np.uint8)
        image = Image.frombytes('P', (64,64), pixels.tobytes())
        image.putpalette(palette + [0] * (768 - len(palette)))
        image.save(target / f'{level + 1}.png', optimize=True)
    print(game_id, meta['levels'], flush=True)
