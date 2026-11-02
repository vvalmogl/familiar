"""App icon from the «Капля» character: the drop on a dark rounded square.

    python make_icon.py OUT.png        # 1024×1024; then `npx tauri icon OUT.png`
"""
import sys

from PIL import Image, ImageDraw

import make

N = 1024
make.SIZE = 880
make.S = make.SIZE * make.SS

bg = Image.new("RGBA", (N, N), (0, 0, 0, 0))
m = 100                                    # macOS icon grid margin
tile = Image.new("RGBA", (N, N), (0, 0, 0, 0))
d = ImageDraw.Draw(tile)
for i in range(N - 2 * m):                 # vertical gradient, dark violet to near-black
    t = i / (N - 2 * m)
    c = tuple(int(a + (b - a) * t) for a, b in zip((44, 34, 62), (16, 14, 22)))
    d.line([(m, m + i), (N - m, m + i)], fill=c + (255,))
mask = Image.new("L", (N, N), 0)
ImageDraw.Draw(mask).rounded_rectangle((m, m, N - m, N - m), radius=185, fill=255)
bg.paste(tile, (0, 0), mask)

drop = make.frame(look=(0.2, 0))
bg.alpha_composite(drop, ((N - make.SIZE) // 2, (N - make.SIZE) // 2 - 30))
bg.save(sys.argv[1])
