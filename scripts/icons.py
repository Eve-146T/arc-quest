"""App icons: a white ARC board with a 3x3 colour grid on candy pink (matches public/assets/icon.svg)."""
from PIL import Image, ImageDraw
from pathlib import Path
CELLS = ['#1e93ff', '#ffdc00', '#4fcc30', '#f93c31', '#2b1f5e', '#a356d6', '#ff851b', '#88d8f1', '#e53aa3']
for size in [192, 512]:
    im = Image.new('RGB', (size, size), '#ff4fa3')
    d = ImageDraw.Draw(im)
    s = size / 192
    r = lambda x, y, w, h: [x * s, y * s, (x + w) * s, (y + h) * s]
    d.rounded_rectangle(r(29, 29, 134, 134), radius=27 * s, fill='#2b1f5e')
    d.rounded_rectangle(r(39, 39, 114, 114), radius=18 * s, fill='#ffffff')
    for i, color in enumerate(CELLS):
        d.rounded_rectangle(r(52 + (i % 3) * 31, 52 + (i // 3) * 31, 26, 26), radius=5 * s, fill=color)
    im.save(Path('public/assets') / f'icon-{size}.png')
Image.open('public/assets/icon-192.png').save('android/res/drawable/icon.png')
