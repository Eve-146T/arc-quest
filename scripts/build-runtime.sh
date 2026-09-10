#!/usr/bin/env bash
# Build the offline Python/WebAssembly runtime from pinned, inspectable sources.
set -euo pipefail
cd "$(dirname "$0")/.."
ARC_ROOT="$PWD"
export TMPDIR="$ARC_ROOT/.scratch/runtime-tmp"
export UV_CACHE_DIR="$ARC_ROOT/.cache/uv"
export UV_PYTHON_INSTALL_DIR="$ARC_ROOT/.cache/python"
export PIP_CACHE_DIR="$ARC_ROOT/.cache/pip"
export XDG_CACHE_HOME="$ARC_ROOT/.cache"
export CCACHE_DIR="$ARC_ROOT/.cache/ccache"
export npm_config_cache="$ARC_ROOT/.cache/npm"
export RUSTUP_HOME="$ARC_ROOT/.cache/rustup"
export CARGO_HOME="$ARC_ROOT/.cache/cargo"
export SOURCE_DATE_EPOCH=315532800 PYTHONHASHSEED=0 TZ=UTC
export PYODIDE_JOBS="${PYODIDE_JOBS:-4}" EMCC_CORES="${EMCC_CORES:-4}" EMSDK_NUM_CORE="${EMSDK_NUM_CORE:-4}"
umask 022
mkdir -p "$TMPDIR" "$CARGO_HOME/bin"

test -f vendor/pyodide/pyodide-build/pyproject.toml || {
    echo 'Initialize source submodules: git submodule update --init --recursive' >&2
    exit 1
}
uv venv --allow-existing --python 3.13.2 .scratch/runtime-venv
uv pip sync --python .scratch/runtime-venv/bin/python scripts/runtime-build-requirements.txt
uv pip install --python .scratch/runtime-venv/bin/python --no-deps --no-build-isolation -e vendor/pyodide/pyodide-build
export PATH="$ARC_ROOT/.scratch/runtime-venv/bin:$CARGO_HOME/bin:$PATH"

# Keep rustup's configuration and downloads inside the build workspace.
if [ ! -x "$CARGO_HOME/bin/rustup" ]; then
    cp "$(command -v rustup)" "$CARGO_HOME/bin/rustup"
    ln -sf rustup "$CARGO_HOME/bin/rustc"
    ln -sf rustup "$CARGO_HOME/bin/cargo"
fi
rustup set auto-self-update disable
rustup toolchain install nightly-2025-02-01 --profile minimal

# Build in a disposable copy so the pinned source submodules remain unchanged.
ARC_WORK="$ARC_ROOT/.scratch/runtime-build"
if [ ! -f "$ARC_WORK/.sources-ready" ]; then
    mkdir -p "$ARC_WORK/pyodide" "$ARC_WORK/recipes"
    tar -C vendor/pyodide --exclude=.git -cf - . | tar -C "$ARC_WORK/pyodide" -xf -
    tar -C vendor/pyodide-recipes --exclude=.git -cf - . | tar -C "$ARC_WORK/recipes" -xf -
    # Upstream's Makefile otherwise clones the changing emsdk default branch.
    python - "$ARC_WORK/pyodide/emsdk/Makefile" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
source = path.read_text()
old = 'git clone --depth 1 https://github.com/emscripten-core/emsdk.git'
new = ('git init emsdk && cd emsdk && '
       'git fetch --depth 1 https://github.com/emscripten-core/emsdk.git '
       '5eb0bde7585670252e8ba05e9d361627bffd08b5 && git checkout --detach FETCH_HEAD')
assert old in source
path.write_text(source.replace(old, new))
PY
    touch "$ARC_WORK/.sources-ready"
fi
export PYODIDE_ROOT="$ARC_WORK/pyodide"
cp scripts/runtime-cpython-prefix.patch "$PYODIDE_ROOT/cpython/patches/9999-reproducible-prefix.patch"
cp scripts/runtime-package-constraints.txt "$PYODIDE_ROOT/tools/constraints.txt"
export EXTRA_CFLAGS="-ffile-prefix-map=$ARC_ROOT=/build/arc-quest"
export RUSTFLAGS="-C link-arg=-sSIDE_MODULE=2 -Z link-native-libraries=yes -Z emscripten-wasm-eh --remap-path-prefix=$ARC_ROOT=/build/arc-quest"
(
    cd "$PYODIDE_ROOT"
    touch .pyodide_build_installed
    make emsdk/emsdk/.complete
    # Emscripten discovers ports using filesystem order, which changes the
    # bzip2/zlib link order and the resulting WebAssembly between machines.
    python - <<'PY'
from pathlib import Path
path = Path('emsdk/emsdk/upstream/emscripten/tools/ports/__init__.py')
source = path.read_text()
for directory in ('ports_dir', 'contrib_dir'):
    source = source.replace(f'in os.listdir({directory}):',
                            f'in sorted(os.listdir({directory})):')
path.write_text(source)
PY
    # Upstream omits the WebAssembly files from this target's dependencies,
    # although the loader's build ID hashes them. Refresh it on cached builds.
    rm -f dist/pyodide.js
    make all-but-packages
    # The default 'always' set includes optional stdlib modules which ARC Quest
    # does not ship or import. Build only the six required dependency wheels.
    pyodide build-recipes 'numpy,pydantic,!hashlib,!liblzma,!libopenssl,!lzma,!micropip,!pydecimal,!pydoc_data,!sqlite3,!ssl,!tblib,!test' \
        --recipe-dir "$ARC_WORK/recipes/packages" --install --metadata-files --n-jobs "$PYODIDE_JOBS"
)
python scripts/package-runtime.py "$PYODIDE_ROOT/dist"
cp vendor/pyodide/LICENSE public/licenses/Pyodide-MPL-2.0.txt
cp "$PYODIDE_ROOT/cpython/build/Python-3.13.2/LICENSE" public/licenses/Python-PSF.txt
