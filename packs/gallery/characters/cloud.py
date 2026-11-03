"""«Облачко»: a fluffy little cloud that floats."""
import math

from PIL import ImageDraw

from rig import BASE, CX, S, Character, Face, fill, mask_new

TOP, BOTTOM, LINE = (255, 255, 255), (196, 222, 250), (96, 138, 196)
R = S * 0.13


def draw(img, p):
    cy = BASE - R * 3.4
    m = mask_new()
    d = ImageDraw.Draw(m)
    puffs = [(-1.6, 0.35, 1.0), (-0.75, -0.45, 1.25), (0.45, -0.75, 1.45), (1.5, 0.05, 1.1), (0.2, 0.5, 1.2), (-0.9, 0.6, 0.95), (1.1, 0.65, 0.9)]
    for i, (ax, ay, ar) in enumerate(puffs):
        k = 1 + 0.035 * math.sin(p.t + i * 1.3)
        x, y, r = CX + ax * R, cy + ay * R, ar * R * k
        d.ellipse((x - r, y - r, x + r, y + r), fill=255)
    fill(img, m, TOP, BOTTOM, LINE)
    if p.mood == "thinking":  # a few drops falling
        dd = ImageDraw.Draw(img)
        for i, ax in enumerate((-1.0, 0.1, 1.1)):
            y = cy + R * (1.9 + ((p.t / (2 * math.pi) + i * 0.33) % 1) * 1.2)
            x = CX + ax * R
            dd.ellipse((x - R * 0.11, y - R * 0.17, x + R * 0.11, y + R * 0.17), fill=(120, 180, 240))
    return Face(CX, cy + R * 0.1, R * 0.62, R * 0.27, cy + R * 0.75, cheek=(255, 150, 180)), (CX + R * 0.4, cy - R * 1.6, R * 1.6)


CHARACTER = Character("familiar.cloud", "Облачко", "Пушистое облачко: плывёт по воздуху, капает дождиком, пока думает, и сияет, когда отвечает.", draw,
                      floating=True, shadow=(30, 50, 90))
