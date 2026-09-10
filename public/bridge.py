"""Android WebView adapter. Original games and scoring remain unmodified."""
import base64
import importlib
import json
import os
import random
import numpy as np
from arcengine import ActionInput, GameAction, GameState
from arc_agi.models import EnvironmentInfo
from arc_agi.scorecard import Scorecard, EnvironmentScorecard

MANIFEST = json.load(open(os.getenv('ARC_MANIFEST', '/app/manifest.json')))
game = None
card = None
meta = None
last = None
GUID = 'local-player'
tap_masks = {}

def start(key, history=None, level=0, sandbox=False):
    """Open a game. `level` > 0 (sandbox) jumps straight to that level after the
    initial full reset, then resets that level so the engine renders its first frame."""
    global game, card, meta, last
    tap_masks.clear()
    meta = next(m for m in MANIFEST if m['id'] == key)
    random.seed(0)
    np.random.seed(0)
    module = importlib.import_module('games.' + key)
    game = getattr(module, key.capitalize())()
    card = Scorecard(card_id='sandbox' if sandbox else 'local-practice')
    os.environ.pop('ONLY_RESET_LEVELS', None)
    last = game.perform_action(ActionInput(id=GameAction.RESET), raw=True)
    last.game_id = meta['version']
    card.update_scorecard(GUID, last, True)
    os.environ['ONLY_RESET_LEVELS'] = 'true'
    if level:
        if not 0 <= level < len(meta['baseline']):
            raise ValueError('Level out of range')
        game.set_level(level)
        last = game.perform_action(ActionInput(id=GameAction.RESET), raw=True)
        last.game_id = meta['version']
        card.update_scorecard(GUID, last, False)
    for action in history or []:
        act(action['id'], action.get('x'), action.get('y'), snapshot=False)
    return snapshot()

def act(action_id, x=None, y=None, snapshot=True):
    global last
    if game is None:
        raise ValueError('Choose a game first')
    if last.state == GameState.WIN:
        return globals()['snapshot'](False) if snapshot else None
    if last.state == GameState.GAME_OVER and action_id != 0:
        return globals()['snapshot'](False) if snapshot else None
    if action_id != 0 and action_id not in last.available_actions:
        raise ValueError('Action unavailable in this environment')
    data = {}
    if action_id == 6:
        if type(x) is not int or type(y) is not int or not 0 <= x <= 63 or not 0 <= y <= 63:
            raise ValueError('Tap coordinates must be integers between 0 and 63')
        data = {'x':x,'y':y}
    result = game.perform_action(ActionInput(id=GameAction.from_id(action_id), data=data), raw=True)
    if result.frame:
        result.game_id = meta['version']
        card.update_scorecard(GUID, result, False)
        last = result
    return globals()['snapshot']() if snapshot else None

def tap_mask():
    """Expose FT09's actual targets for UI hit testing, without filtering engine actions.

    FT09 only recolors these sprites during play; geometry is fixed for each level.
    Use the same camera conversion and sprite tags as its original step method.
    """
    if meta['id'] != 'ft09':
        return None
    if game.level_index not in tap_masks:
        cells = []
        for y in range(64):
            for x in range(64):
                point = game.camera.display_to_grid(x, y)
                hit = point and any(game.current_level.get_sprite_at(*point, tag)
                                    for tag in ('Hkx', 'NTi'))
                cells.append('1' if hit else '0')
        tap_masks[game.level_index] = ''.join(cells)
    return tap_masks[game.level_index]

def snapshot(accepted=True):
    info = EnvironmentInfo(game_id=meta['version'], baseline_actions=meta['baseline'])
    score = EnvironmentScorecard.from_scorecard(card, [info]).environments[0].runs[-1].model_dump(mode='json')
    return json.dumps({'id':meta['id'], 'state':last.state.value, 'completed':last.levels_completed,
        'levels':len(meta['baseline']), 'level':game.level_index, 'accepted':accepted, 'frames':[last.frame[-1].tolist()],
        'animation':base64.b64encode(np.asarray(last.frame, dtype=np.uint8).tobytes()).decode() if len(last.frame)>1 else None,
        'available':last.available_actions, 'score':score, 'fps':meta['fps'], 'tap_mask':tap_mask()})

def dispatch(payload):
    p = json.loads(payload)
    if p['type'] == 'start':
        return start(p['game'], p.get('history', []), int(p.get('level') or 0), bool(p.get('sandbox')))
    if p['type'] == 'action':
        return act(p['action']['id'],p['action'].get('x'),p['action'].get('y'))
    raise ValueError('Unknown command')
