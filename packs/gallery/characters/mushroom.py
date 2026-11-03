"""«Грибок»: a red-capped mushroom with a face on its stem."""
import math

from PIL import ImageDraw

from rig import BASE, CX, S, Character, Face, fill, mask_new

CAP_T, CAP_B, CAP_L = (250, 104, 96), (204, 52, 64), (120, 24, 36)
STEM_T, STEM_B, STEM_L = (255, 244, 226), (236, 212, 184), (140, 108, 80)
R = S * 0.24


def draw(img, p):
    st = mask_new()
    top_y = BASE - R * 1.45
    ImageDraw.Draw(st).rounded_rectangle((CX - R * 0.78, top_y, CX + R * 0.78, BASE - R * 0.02), radius=R * 0.45, fill=255)
    fill(img, st, STEM_T, STEM_B, STEM_L)

    wob = math.sin(p.t) * R * 0.03
    cap = mask_new()
    cb = top_y + R * 0.2
    pts = []
    for i in range(120):
        th = math.pi + math.pi * i / 119
        pts.append((CX + R * 1.35 * math.cos(th), cb + (R * 1.15 + wob) * math.sin(th)))
    for i in range(41):  # slightly curved rim
        u = i / 40
        pts.append((CX + R * 1.35 - 2.7 * R * u, cb + R * 0.12 * math.sin(math.pi * u)))
    ImageDraw.Draw(cap).polygon(pts, fill=255)
    fill(img, cap, CAP_T, CAP_B, CAP_L)
    d = ImageDraw.Draw(img)
    for (ax, ay, ar) in [(-0.7, -0.55, 0.2), (0.15, -0.88, 0.17), (0.75, -0.45, 0.22), (-0.2, -0.35, 0.13), (0.4, -0.15, 0.1), (-0.95, -0.12, 0.1)]:
        x, y, r = CX + ax * R, cb + ay * R, ar * R
        d.ellipse((x - r, y - r * 0.85, x + r, y + r * 0.85), fill=(255, 246, 236))
    ey = top_y + R * 0.62
    return Face(CX, ey, R * 0.3, R * 0.14, ey + R * 0.4), (CX, cb - R * 0.8, R)


CHARACTER = Character("familiar.mushroom", "Грибок", "Красная шляпка в белый горошек: кивает, когда думает, и прыгает, когда всё получилось.", draw)
