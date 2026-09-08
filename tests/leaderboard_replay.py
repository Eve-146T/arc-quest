"""Check the public record sequences against each bundled game, without shipping them."""
import importlib.util
import json
import os
import random
from pathlib import Path
import numpy as np
from arcengine import ActionInput, GameAction, GameState

root = Path(__file__).resolve().parents[1]
snapshot = json.loads((root / 'public/diamonds.json').read_text())
sequences = json.loads((root / 'test-results/leaderboard-sequences.json').read_text())
report = []
for game_id, record in snapshot['games'].items():
    path = next((root / 'vendor/environments' / game_id).glob('*/*.py'))
    spec = importlib.util.spec_from_file_location(game_id + '_record', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for level, sequence in enumerate(sequences[game_id]):
        if not sequence:
            continue
        random.seed(0)
        np.random.seed(0)
        os.environ.pop('ONLY_RESET_LEVELS', None)
        game = getattr(mod, game_id.capitalize())()
        game.perform_action(ActionInput(id=GameAction.RESET))
        os.environ['ONLY_RESET_LEVELS'] = 'true'
        if level:
            game.set_level(level)
            game.perform_action(ActionInput(id=GameAction.RESET))
        for step, action in enumerate(sequence):
            args = {'id': GameAction.ACTION6, 'data': {'x': action[0], 'y': action[1]}} if isinstance(action, list) else {'id': GameAction.from_id(action)}
            frame = game.perform_action(ActionInput(**args))
            if game.level_index != level or frame.state == GameState.WIN:
                break
        cleared = game.level_index != level or frame.state == GameState.WIN
        report.append({'game': game_id, 'level': level + 1, 'actions': step + 1, 'record': len(sequence), 'cleared': cleared})
        assert cleared and step + 1 == len(sequence), report[-1]
    print('PASS', game_id, flush=True)
(root / 'test-results/leaderboard-replay-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(f'All {len(report)} public records replayed successfully')
