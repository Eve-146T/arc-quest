"""Generate one vector puzzle mark for Android launchers, themed icons and startup.

Foreground geometry stays inside the central 66dp safe circle of a 108dp layer.
Raster exports and shape previews are produced by scripts/icon-previews.mjs.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NS = 'xmlns:android="http://schemas.android.com/apk/res/android"'
COLORS = ['#3EC6FF', '#FF6BAB', '#2EE6A6', '#FFD23F']
PATHS = [
    'M36,30h10a6,6 0 0 1 6,6v10a6,6 0 0 1 -6,6h-10a6,6 0 0 1 -6,-6v-10a6,6 0 0 1 6,-6z',
    'M62,30h10a6,6 0 0 1 6,6v10a6,6 0 0 1 -6,6h-10a6,6 0 0 1 -6,-6v-10a6,6 0 0 1 6,-6z',
    'M36,56h10a6,6 0 0 1 6,6v10a6,6 0 0 1 -6,6h-10a6,6 0 0 1 -6,-6v-10a6,6 0 0 1 6,-6z',
    'M65,55Q67,53 69,55L79,65Q81,67 79,69L69,79Q67,81 65,79L55,69Q53,67 55,65z',
]
CENTERS = [(41, 41), (67, 41), (41, 67), (67, 67)]
res = ROOT / 'android/res'
def vector(body, size=108):
    return f'<vector {NS} android:width="{size}dp" android:height="{size}dp" android:viewportWidth="108" android:viewportHeight="108">\n{body}\n</vector>\n'

def paths(monochrome=False, animate=False):
    parts = []
    for i, (path, color, (x, y)) in enumerate(zip(PATHS, COLORS, CENTERS)):
        fill = '#FFFFFF' if monochrome else color
        shape = f'    <path android:fillColor="{fill}" android:pathData="{path}"/>'
        if animate:
            shape = f'    <group android:name="tile{i}" android:pivotX="{x}" android:pivotY="{y}">\n{shape}\n    </group>'
        parts.append(shape)
    return '\n'.join(parts)

(res / 'drawable/ic_launcher_foreground.xml').write_text(vector(paths()))
(res / 'drawable/ic_launcher_background.xml').write_text(vector('    <path android:fillColor="#2B1F5E" android:pathData="M0,0h108v108H0z"/>'))
(res / 'drawable/ic_launcher_mono.xml').write_text(vector(paths(monochrome=True)))
(res / 'drawable/splash_mark.xml').write_text(vector(paths(animate=True), 288))
(res / 'drawable/splash_animated.xml').write_text(f'<animated-vector {NS} android:drawable="@drawable/splash_mark">\n'+''.join(f'    <target android:name="tile{i}" android:animation="@animator/splash_tile_{i}"/>\n' for i in range(4))+'</animated-vector>\n')
for path in (res / 'animator').glob('splash_tile_*.xml'):
    path.unlink()
for i in range(4):
    (res / f'animator/splash_tile_{i}.xml').write_text(f'''<set {NS} android:ordering="together">
    <objectAnimator android:propertyName="scaleX" android:valueFrom="0.5" android:valueTo="1" android:valueType="floatType" android:duration="400" android:startOffset="{i*60}" android:interpolator="@android:interpolator/fast_out_slow_in"/>
    <objectAnimator android:propertyName="scaleY" android:valueFrom="0.5" android:valueTo="1" android:valueType="floatType" android:duration="400" android:startOffset="{i*60}" android:interpolator="@android:interpolator/fast_out_slow_in"/>
    <objectAnimator android:propertyName="rotation" android:valueFrom="{-18 if i % 2 == 0 else 18}" android:valueTo="0" android:valueType="floatType" android:duration="400" android:startOffset="{i*60}" android:interpolator="@android:interpolator/fast_out_slow_in"/>
    <objectAnimator android:propertyName="translateY" android:valueFrom="{-10 if i < 2 else 10}" android:valueTo="0" android:valueType="floatType" android:duration="400" android:startOffset="{i*60}" android:interpolator="@android:interpolator/fast_out_slow_in"/>
</set>
''')
svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72"><rect x="0" y="0" width="108" height="108" fill="#2b1f5e"/>'+''.join(f'<path d="{path}" fill="{color}"/>' for path,color in zip(PATHS,COLORS))+'</svg>\n'
(ROOT / 'public/assets/icon.svg').write_text(svg)
