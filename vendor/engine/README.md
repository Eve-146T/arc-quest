# Original ARC engine sources

The Python modules here are the unmodified sources packaged in ARC Quest 1.0's
`engine.zip`: ARCEngine 0.9.3 and the ARC-AGI Toolkit 0.9.9 `models.py` and
`scorecard.py`. The empty `arc_agi/__init__.py` intentionally avoids importing
the toolkit's network client in this offline player.

Upstream source distributions:

- [ARCEngine 0.9.3](https://pypi.org/project/arcengine/0.9.3/):
  SHA-256 `76441c15fde092a071ca95edce5e643385ab270304f59c1172b460048fffcdfe`.
- [ARC-AGI 0.9.9](https://pypi.org/project/arc-agi/0.9.9/):
  SHA-256 `ee822d83f4ea4ccb96377ecbc81ffe1e9e7ded15300aedf88150b7f4743a2bc8`.

Copyright ARC Prize Foundation, MIT license. See
[the bundled license](../../public/licenses/ARC-MIT.txt).
Games remain in `vendor/environments/` with their original versioned sources.
`scripts/package-runtime.py` creates the runtime archive and Python bytecode
from these sources during the F-Droid build.
