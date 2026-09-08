"""Snapshot public ARC3.Games level records for the exact bundled versions.

Only action counts ship. Source sequences are review evidence in test-results/.
This calls the documented read-only getTopSequences API, never submits play.
"""
import time
import urllib.error
import datetime
import json
import urllib.parse
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
games = json.loads((root / 'public/games.json').read_text())

def fetch(entry):
    game, level = entry
    data = urllib.parse.urlencode({'action': 'getTopSequences', 'gameId': game['version'], 'level': level + 1, 'order': 'ASC', 'limit': 1}).encode()
    request = urllib.request.Request('https://arc3.games/api.php', data=data)
    for attempt in range(6):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.load(response)
            break
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 5:
                raise
            time.sleep(max(10, int(error.headers.get('Retry-After', '30'))))
    if result.get('ok') is not True or not isinstance(result.get('data'), list):
        raise ValueError(f'Invalid leaderboard response: {game["id"]} {level + 1}')
    sequences = result['data']
    sequence = sequences[0] if sequences else None
    if sequence is not None:
        assert isinstance(sequence, list) and len(sequence) > 0
        assert all((isinstance(a, int) and 1 <= a <= 7) or (isinstance(a, list) and len(a) == 2 and all(isinstance(v, int) and 0 <= v < 64 for v in a)) for a in sequence)
    return game['id'], level, sequence

records = {g['id']: {'version': g['version'], 'sha256': g['sha256'], 'recordActions': [None] * g['levels']} for g in games}
evidence = {g['id']: [None] * g['levels'] for g in games}
cache_path = root / 'test-results/leaderboard-fetch-cache.json'
cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
for game in games:
    for level in range(game['levels']):
        key = f'{game["version"]}:{level}'
        if key in cache:
            sequence = cache[key]
        else:
            game_id, _, sequence = fetch((game, level))
            cache[key] = sequence
            cache_path.write_text(json.dumps(cache))
            time.sleep(1)
        evidence[game['id']][level] = sequence
        records[game['id']]['recordActions'][level] = len(sequence) if sequence else None
    print(f'{game["id"]}: {records[game["id"]]["recordActions"]}', flush=True)
snapshot = {'source': 'https://arc3.games/', 'api': 'https://arc3.games/api/', 'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'games': records}
(root / 'test-results').mkdir(exist_ok=True)
(root / 'test-results/leaderboard-sequences.json').write_text(json.dumps(evidence) + '\n')
(root / 'public/diamonds.json').write_text(json.dumps(snapshot, indent=2) + '\n')
print(f'Saved {sum(v is not None for g in records.values() for v in g["recordActions"])} / 183 public level records')
