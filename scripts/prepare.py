"""Vendor official game/engine sources and self-host the browser runtime.

Sources are never modified: we only *add* precompiled `__pycache__/*.pyc` files next
to them (in `engine.zip` and inside the vendored wheels) so Pyodide never has to parse
and compile the ~4 MB of Python we ship on the first import of every module. The pycs
use `UNCHECKED_HASH` invalidation, so CPython accepts them regardless of the mtimes the
files end up with after being unpacked into the browser filesystem.
"""
import base64
import csv
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import py_compile
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'public'
RUNTIME = SITE / 'runtime'
WHEEL_CACHE = ROOT / '.cache/wheels'
RUNTIME.mkdir(exist_ok=True)
WHEEL_CACHE.mkdir(parents=True, exist_ok=True)

# Pyodide 0.29.3 ships CPython 3.13; its importlib.util.MAGIC_NUMBER must match this
# interpreter's or the bytecode we generate here would be silently ignored (or rejected).
PYODIDE_MAGIC_NUMBER = bytes.fromhex('f30d0d0a')
assert importlib.util.MAGIC_NUMBER == PYODIDE_MAGIC_NUMBER, (
    'This interpreter emits bytecode Pyodide cannot load: '
    f'{importlib.util.MAGIC_NUMBER.hex()} != {PYODIDE_MAGIC_NUMBER.hex()}')
CACHE_TAG = sys.implementation.cache_tag  # 'cpython-313'
PYC_TMP = Path(tempfile.mkdtemp(prefix='arc-pyc-'))

def compile_bytecode(source, dfile):
    """Compile `source` (a Path) and return the .pyc bytes, or None if it will not compile.

    `dfile` is the path baked into the code objects, so tracebacks in the browser point
    at the file where it actually lives instead of at this build machine.
    """
    out = PYC_TMP / 'out.pyc'
    try:
        py_compile.compile(str(source), cfile=str(out), dfile=dfile, doraise=True,
                           invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH)
    except (py_compile.PyCompileError, SyntaxError, ValueError, UnicodeDecodeError):
        return None
    return out.read_bytes()

def cache_path(path):
    """'games/ls20.py' -> 'games/__pycache__/ls20.cpython-313.pyc'."""
    head, _, name = path.rpartition('/')
    return (head + '/' if head else '') + '__pycache__/' + name[:-3] + '.' + CACHE_TAG + '.pyc'

for name in ['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']:
    shutil.copy2(ROOT / 'node_modules/pyodide' / name, RUNTIME / name)
lock = json.loads((RUNTIME / 'pyodide-lock.json').read_text())
needed = set()
def dependency(name):
    name = name.replace("_", "-")
    if name in needed:
        return
    needed.add(name)
    for dep in lock['packages'][name]['depends']:
        dependency(dep)
for name in ['numpy', 'pydantic']:
    dependency(name)

# Upstream (unmodified) wheel hashes for Pyodide 0.29.3, kept here for the record because
# the copies under public/runtime/ are repacked with bytecode and therefore hash differently.
# public/runtime/pyodide-lock.json is rewritten below with the hashes of the repacked wheels.
UPSTREAM_WHEEL_SHA256 = {
    'annotated_types-0.7.0-py3-none-any.whl': '107c6d0a31af3ce347cad1990976cca76373de2ef51dfbffff84fe10cb7b2c19',
    'numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl': '6eaab6a7bb658d71ebe702911a3deab715323642462eb41b65565ca6a7cc23f1',
    'pydantic-2.12.5-py3-none-any.whl': 'a56b56d0a0942fbd5cf24a9c9195eb5bdfeceea17ddb3e1cd174db43be4e88dc',
    'pydantic_core-2.41.5-cp313-cp313-pyodide_2025_0_wasm32.whl': 'dd259177c9159a866334e2ac040aca973b8205cc884b3297cb5b2dc6bef8d629',
    'typing_extensions-4.15.0-py3-none-any.whl': 'b57583f623dd3df72e6ace8a4061c3e4f0683755165ef73b4cd44ac3df92ddb9',
    'typing_inspection-0.4.2-py3-none-any.whl': '5c4d0bade04cec6ac0d03c227c8bdb7c59218e4c6d759b5ac0cea5c34f6a72aa',
}

def repack_wheel(pristine, target):
    """Copy `pristine` to `target`, adding a __pycache__ .pyc for every module it ships.

    Pyodide installs wheels by plain extraction into site-packages, so bytecode that sits
    in the archive lands next to the sources and is picked up by the normal import path.
    RECORD is kept consistent by appending the new entries.
    """
    added = 0
    with zipfile.ZipFile(pristine) as src:
        infos = src.infolist()
        record_name = next((i.filename for i in infos if i.filename.endswith('.dist-info/RECORD')), None)
        extra = {}
        for info in infos:
            path = info.filename
            if not path.endswith('.py') or '.dist-info/' in path or '.data/' in path:
                continue
            scratch = PYC_TMP / 'src.py'
            scratch.write_bytes(src.read(info))
            pyc = compile_bytecode(scratch, '/lib/python3.13/site-packages/' + path)
            if pyc is not None:
                extra[cache_path(path)] = pyc
        record = None
        if record_name:
            rows = list(csv.reader(io.StringIO(src.read(record_name).decode())))
            for path, data in extra.items():
                digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b'=').decode()
                rows.append([path, 'sha256=' + digest, str(len(data))])
            buffer = io.StringIO()
            csv.writer(buffer, lineterminator='\n').writerows(rows)
            record = buffer.getvalue().encode()
        with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as out:
            for info in infos:
                data = record if (record is not None and info.filename == record_name) else src.read(info)
                out.writestr(info.filename, data)
            for path, data in extra.items():
                out.writestr(path, data)
                added += 1
    return added

for name in sorted(needed):
    p = lock['packages'][name]
    pristine = WHEEL_CACHE / p['file_name']
    if not pristine.exists():
        legacy = RUNTIME / p['file_name']
        if legacy.exists() and hashlib.sha256(legacy.read_bytes()).hexdigest() == p['sha256']:
            shutil.copy2(legacy, pristine)
        else:
            print('Downloading', name, flush=True)
            urllib.request.urlretrieve('https://cdn.jsdelivr.net/pyodide/v0.29.3/full/' + p['file_name'], pristine)
    assert hashlib.sha256(pristine.read_bytes()).hexdigest() == p['sha256'], p['file_name']
    assert UPSTREAM_WHEEL_SHA256.get(p['file_name'], p['sha256']) == p['sha256'], p['file_name']
    target = RUNTIME / p['file_name']
    added = repack_wheel(pristine, target)
    p['sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
    print(f"{p['file_name']}: +{added} pyc, {pristine.stat().st_size} -> {target.stat().st_size} bytes")
(RUNTIME / 'pyodide-lock.json').write_text(json.dumps(lock))
for stale in RUNTIME.glob('*.whl'):
    if stale.name not in {lock['packages'][n]['file_name'] for n in needed}:
        stale.unlink()

import arcengine
import arc_agi
from arcengine import ActionInput, GameAction
from PIL import Image
engine = Path(arcengine.__file__).parent
sdk = Path(arc_agi.__file__).parent
manifest = []
colors = ['#FFFFFF','#CCCCCC','#999999','#666666','#333333','#000000','#E53AA3','#FF7BCC','#F93C31','#1E93FF','#88D8F1','#FFDC00','#FF851B','#921231','#4FCC30','#A356D6']
with zipfile.ZipFile(SITE / 'engine.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    def add_source(source, arcname):
        """Store an unmodified .py plus its precompiled bytecode."""
        z.write(source, arcname)
        pyc = compile_bytecode(source, '/app/' + arcname)
        assert pyc is not None, arcname
        z.writestr(cache_path(arcname), pyc)
    def add_empty(arcname):
        z.writestr(arcname, '')
        blank = PYC_TMP / '__init__.py'
        blank.write_text('')
        z.writestr(cache_path(arcname), compile_bytecode(blank, '/app/' + arcname))
    for p in engine.glob('*.py'):
        add_source(p, 'arcengine/' + p.name)
    add_empty('arc_agi/__init__.py')
    for name in ['models.py','scorecard.py']:
        add_source(sdk / name, 'arc_agi/' + name)
    add_empty('games/__init__.py')
    for metadata in sorted((ROOT / 'vendor/environments').glob('*/*/metadata.json')):
        m = json.loads(metadata.read_text())
        key = m['game_id'][:4]
        source = metadata.parent / (key + '.py')
        add_source(source, 'games/' + key + '.py')
        spec = importlib.util.spec_from_file_location(key, source)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        g = getattr(mod, key.capitalize())()
        f = g.perform_action(ActionInput(id=GameAction.RESET), raw=True)
        rgb = Image.new('RGB',(64,64))
        rgb.putdata([tuple(bytes.fromhex(colors[int(v)][1:])) for row in f.frame[-1] for v in row])
        rgb.save(SITE / 'assets' / (key + '.png'))
        manifest.append({'id':key, 'version':m['game_id'], 'levels':len(m['baseline_actions']), 'baseline':m['baseline_actions'], 'actions':f.available_actions,'fps':m['default_fps'],'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
    z.writestr('manifest.json', json.dumps(manifest))
(SITE / 'games.json').write_text(json.dumps(manifest, indent=2))

# The stdlib is imported from python_stdlib.zip by zipimport, which looks for a sibling
# `<module>.pyc` before `<module>.py`. Compiling every module would add ~4 MB to the
# download, so we ask a throwaway Pyodide (the identical build under node_modules) which
# modules a real boot actually touches, and precompile only those.
PROBE = '''
import {loadPyodide} from '%s';
import {readFileSync} from 'node:fs';
const py = await loadPyodide({packages:['numpy','pydantic']});
py.unpackArchive(new Uint8Array(readFileSync('%s')),'zip',{extractDir:'/app'});
py.runPython("import sys; sys.path.insert(0,'/app')");
await py.runPythonAsync(readFileSync('%s','utf8'));
const ids = JSON.parse(py.runPython("import json; json.dumps([e['id'] for e in json.load(open('/app/manifest.json'))])"));
for (const id of ids) py.runPython(`import importlib; importlib.import_module("games.${id}")`);
py.globals.set('payload', JSON.stringify({type:'start', game:ids[0]}));
py.runPython('dispatch(payload)');
py.globals.set('payload', JSON.stringify({type:'action', action:{id:1}}));
py.runPython('dispatch(payload)');
console.log(py.runPython(`
import json, sys
prefix = '/lib/python313.zip/'
json.dumps(sorted({m.__file__[len(prefix):] for m in list(sys.modules.values())
                   if getattr(m, '__file__', None) and m.__file__.startswith(prefix)}))`));
'''
def imported_stdlib_modules():
    probe = PYC_TMP / 'probe.mjs'
    probe.write_text(PROBE % ((ROOT / 'node_modules/pyodide/pyodide.mjs').as_uri(),
                              SITE / 'engine.zip', SITE / 'bridge.py'))
    out = subprocess.run([shutil.which('node') or 'node', str(probe)], cwd=ROOT,
                         capture_output=True, text=True)
    if out.returncode:
        print('stdlib probe failed, precompiling the whole stdlib', file=sys.stderr)
        return None
    return set(json.loads(out.stdout.strip().splitlines()[-1]))

warm_modules = imported_stdlib_modules()
pristine_stdlib = ROOT / 'node_modules/pyodide/python_stdlib.zip'
added = 0
with zipfile.ZipFile(pristine_stdlib) as src, \
        zipfile.ZipFile(RUNTIME / 'python_stdlib.zip', 'w', zipfile.ZIP_DEFLATED) as out:
    for info in src.infolist():
        data = b'' if info.is_dir() else src.read(info)
        out.writestr(info, data)
        if not info.filename.endswith('.py'):
            continue
        if warm_modules is not None and info.filename not in warm_modules:
            continue
        scratch = PYC_TMP / 'stdlib.py'
        scratch.write_bytes(data)
        pyc = compile_bytecode(scratch, '/lib/python313.zip/' + info.filename)
        if pyc is not None:
            # zipimport reads '<module>.pyc', not '__pycache__/<module>.<tag>.pyc'.
            out.writestr(info.filename[:-3] + '.pyc', pyc)
            added += 1
print(f"python_stdlib.zip: +{added} pyc, {pristine_stdlib.stat().st_size} -> "
      f"{(RUNTIME / 'python_stdlib.zip').stat().st_size} bytes")
shutil.rmtree(PYC_TMP, ignore_errors=True)
print('Bundled',len(manifest),'original games;',sum(m['levels'] for m in manifest),'levels')
