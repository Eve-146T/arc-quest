# Building the offline runtime from source

ARC Quest runs the original Python games in a local Android WebView. Its release
build compiles the Python/WebAssembly runtime from source rather than downloading
the distributable Pyodide or NumPy binaries.

## Sources

| Component | Pinned source |
| --- | --- |
| Pyodide 0.29.3 | `vendor/pyodide`, commit `72e3c78d53a32a76e0aca7443ad24e5cae1042d3` |
| Pyodide build tools | Nested submodule, commit `0eb494ffb3536971da3309d98ac56f6515f985a4` |
| Package recipes | `vendor/pyodide-recipes`, commit `c768cb28b5bf128642b9aa5aebd7114a4cfc17ce` |
| CPython 3.13.2 | Source archive and SHA-256 in Pyodide's `Makefile.envs`; upstream patches in `cpython/patches/` |
| NumPy 2.2.5 and pydantic-core 2.41.5 | Source archives, checksums and patches in the pinned package recipes |
| Pydantic 2.12.5 and its three pure Python dependencies | Source archives and checksums in the same recipes |
| ARCEngine 0.9.3 and ARC-AGI Toolkit 0.9.9 | [Original vendored modules](../vendor/engine/README.md) |
| All 25 games | Original versioned sources in `vendor/environments/`, checked against `public/games.json` |

The compiler toolchain uses Emscripten 4.0.9 with the upstream Pyodide patches,
emsdk commit `5eb0bde7585670252e8ba05e9d361627bffd08b5`, and Rust
`nightly-2025-02-01` with Pyodide's matching Emscripten exception-handling sysroot.
These are build tools, separate from the runtime compiled and shipped in the APK.
Host Python is pinned to 3.13.2 through uv. Python build tools and isolated package
backends are pinned in `scripts/runtime-*-requirements.txt` and
`scripts/runtime-package-constraints.txt`.

## Build

Use Linux with a native C/C++ toolchain, autoconf, automake, libtool, pkg-config,
cmake, ccache, texinfo, zip, wget, Node.js/npm, uv and rustup installed. All generated
files, toolchain installations and caches stay in `.scratch/` or `.cache/`.

```sh
git submodule update --init --recursive
bash scripts/build-runtime.sh
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
  PATH=/usr/lib/jvm/java-17-openjdk-amd64/bin:$PATH \
  bash scripts/build-android.sh
```

The first build downloads the pinned tools and source archives and takes longer
than packaging the APK. Set `PYODIDE_JOBS`, `EMCC_CORES` and `EMSDK_NUM_CORE` to
control parallelism. The defaults are four workers each. Remove
`.scratch/runtime-build/` when changing source pins or compiler configuration.

`scripts/package-runtime.py` packages the newly compiled distribution and creates
`engine.zip` from vendored `.py` sources. It also generates CPython bytecode for
startup speed. It performs no downloads. The module list used to warm the standard
library is committed so that import-probe timing cannot change the output.

The checked-in `public/runtime/` assets support quick local APK builds and offline
development. F-Droid removes those assets and `engine.zip` before scanning and
rebuilds them from source. Its recipe does not suppress scanner findings.

## Reproducibility

Runtime ZIPs have a fixed entry order, timestamp and permissions. Bytecode uses a
fixed Python version, hash seed and runtime paths. Compiler paths are mapped to
`/build/arc-quest`; APK packaging removes local uid/gid and timestamp fields and
preserves ZIP alignment when signing.

The release CI source-build job checks that regenerated assets match the committed
runtime, builds an unsigned APK, and passes that artifact to the signing job.
F-Droid rebuilds the same APK and verifies it against the Eve-signed release using
`Binaries` and `AllowedAPKSigningKeys` in the metadata recipe.

To test an independently rebuilt APK locally:

```sh
apksigcopier compare --unsigned arc-quest-v1.0.1.apk android/build/arc-quest-unsigned.apk
```

Set `TMPDIR` to a directory in the workspace before running validation tools.
See [VERIFICATION.md](../VERIFICATION.md) for completed checks and any limitations.
