"""«Звёздочка»: a soft five-pointed star."""
import math

from PIL import ImageDraw

from rig import BASE, CX, S, Character, Face, fill, mask_new

TOP, BOTTOM, LINE = (255, 236, 130), (250, 178, 48), (168, 104, 18)
R = S * 0.34


def draw(img, p):
    cy = BASE - R * 0.92
    rot = math.sin(p.t) * 0.04
    pts = []
    for i in range(300):
        th = 2 * math.pi * i / 300
        k = (math.cos(5 * (th - math.pi / 2 + rot)) + 1) / 2   # 1 on a point, 0 between points
        r = R * (0.56 + 0.44 * k ** 1.6)
        pts.append((CX + r * math.cos(th), cy - r * math.sin(th)))
    m = mask_new()
    ImageDraw.Draw(m).polygon(pts, fill=255)
    fill(img, m, TOP, BOTTOM, LINE)
    return Face(CX, cy - R * 0.05, R * 0.2, R * 0.095, cy + R * 0.18), (CX, cy - R * 0.55, R * 0.7)


CHARACTER = Character("familiar.star", "Звёздочка", "Мягкая жёлтая звезда: покачивается, мечтательно смотрит вверх и рассыпает искры.", draw)
