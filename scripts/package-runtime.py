"""Package a source-built Pyodide distribution for ARC Quest, without downloads."""
import argparse
import base64
import csv
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import py_compile
import shutil
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'public/runtime'
STAMP = (1980, 1, 1, 0, 0, 0)


def write_entry(archive, name, data):
    info = zipfile.ZipInfo(name, STAMP)
    info.create_system = 3
    info.external_attr = 0o100644 << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(info, data)


def cache_path(name):
    path = Path(name)
    return str(path.parent / '__pycache__' / (path.stem + '.cpython-313.pyc'))


def bytecode(data, filename, scratch):
    source = scratch / 'source.py'
    target = scratch / 'source.pyc'
    source.write_bytes(data)
    py_compile.compile(str(source), cfile=str(target), dfile=filename,
                       doraise=True,
                       invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH)
    return target.read_bytes()


def package_wheel(source, target, scratch):
    with zipfile.ZipFile(source) as archive:
        entries = {name: archive.read(name) for name in archive.namelist()
                   if not name.endswith('.pyc')}
    extra = {}
    for name, data in entries.items():
        if name.endswith('.py') and '.dist-info/' not in name and '.data/' not in name:
            extra[cache_path(name)] = bytecode(data, '/lib/python3.13/site-packages/' + name, scratch)
    record_name = next(name for name in entries if name.endswith('.dist-info/RECORD'))
    rows = list(csv.reader(io.StringIO(entries[record_name].decode())))
    rows = [row for row in rows if not row[0].endswith('.pyc')]
    for name, data in sorted(extra.items()):
        digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b'=').decode()
        rows.append([name, 'sha256=' + digest, str(len(data))])
    buffer = io.StringIO()
    csv.writer(buffer, lineterminator='\n').writerows(rows)
    entries[record_name] = buffer.getvalue().encode()
    entries.update(extra)
    with zipfile.ZipFile(target, 'w') as archive:
        for name, data in sorted(entries.items()):
            write_entry(archive, name, data)


def package_engine(scratch):
    entries = {}
    for path in sorted((ROOT / 'vendor/engine').rglob('*.py')):
        entries[str(path.relative_to(ROOT / 'vendor/engine'))] = path.read_bytes()
    entries['games/__init__.py'] = b''
    manifest = json.loads((ROOT / 'public/games.json').read_text())
    for game in manifest:
        name = game['id']
        version = game['version'].split('-', 1)[1]
        data = (ROOT / 'vendor/environments' / name / version / (name + '.py')).read_bytes()
        assert hashlib.sha256(data).hexdigest() == game['sha256'], name
        entries['games/' + name + '.py'] = data
    with zipfile.ZipFile(ROOT / 'public/engine.zip', 'w') as archive:
        for name, data in sorted(entries.items()):
            write_entry(archive, name, data)
            write_entry(archive, cache_path(name), bytecode(data, '/app/' + name, scratch))
        write_entry(archive, 'manifest.json', json.dumps(manifest).encode())


def package_stdlib(source, scratch):
    warm = set(json.loads((ROOT / 'scripts/runtime-stdlib-modules.json').read_text()))
    with zipfile.ZipFile(source) as archive:
        entries = {name: archive.read(name) for name in archive.namelist()
                   if not name.endswith('.pyc')}
    assert warm <= entries.keys(), 'Source runtime is missing a preloaded stdlib module'
    # Cross-compilation paths in sysconfig are build-machine details, not runtime
    # paths. Preserve the values' relative structure across clean checkouts.
    with zipfile.ZipFile(RUNTIME / 'python_stdlib.zip', 'w') as archive:
        for name, data in sorted(entries.items()):
            if name.startswith('_sysconfigdata_') and name.endswith('.py'):
                data = data.replace(str(ROOT).encode(), b'/build/arc-quest')
            write_entry(archive, name, data)
            if name in warm:
                write_entry(archive, name + 'c', bytecode(data, '/lib/python313.zip/' + name, scratch))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('distribution', type=Path)
    args = parser.parse_args()
    assert sys.version_info[:3] == (3, 13, 2), 'Use CPython 3.13.2 for repeatable bytecode'
    assert importlib.util.MAGIC_NUMBER.hex() == 'f30d0d0a'
    assert os.environ.get('PYTHONHASHSEED') == '0', 'Set PYTHONHASHSEED=0'
    distribution = args.distribution.resolve()
    lock = json.loads((distribution / 'pyodide-lock.json').read_text())
    needed = set()

    def dependency(name):
        name = name.replace('_', '-')
        if name in needed:
            return
        needed.add(name)
        for child in lock['packages'][name]['depends']:
            dependency(child)

    dependency('numpy')
    dependency('pydantic')
    RUNTIME.mkdir(parents=True, exist_ok=True)
    scratch_root = ROOT / '.scratch'
    scratch_root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=scratch_root, prefix='package-runtime-') as directory:
        scratch = Path(directory)
        for name in ('pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm'):
            shutil.copyfile(distribution / name, RUNTIME / name)
        for name in sorted(needed):
            package = lock['packages'][name]
            source = distribution / package['file_name']
            assert hashlib.sha256(source.read_bytes()).hexdigest() == package['sha256'], name
            target = RUNTIME / package['file_name']
            package_wheel(source, target, scratch)
            package['sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
        for path in RUNTIME.glob('*.whl'):
            if path.name not in {lock['packages'][name]['file_name'] for name in needed}:
                path.unlink()
        (RUNTIME / 'pyodide-lock.json').write_text(json.dumps(lock, sort_keys=True) + '\n')
        package_stdlib(distribution / 'python_stdlib.zip', scratch)
        package_engine(scratch)
    print('Packaged source-built runtime, six dependency wheels and original game sources.')


if __name__ == '__main__':
    main()
