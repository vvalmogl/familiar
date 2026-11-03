"""«Призрак»: a friendly little ghost that hovers, with a wavy hem."""
import math

from PIL import ImageDraw

from rig import BASE, CX, S, Character, Face, fill, mask_new

TOP, BOTTOM, LINE = (252, 252, 255), (206, 200, 240), (112, 100, 160)
R = S * 0.24


def draw(img, p):
    top = BASE - R * 2.35
    cy = top + R
    pts = []
    for i in range(80):  # dome
        th = math.pi + math.pi * i / 79
        pts.append((CX + R * math.cos(th), cy + R * math.sin(th)))
    hem = cy + R * 1.15
    for i in range(121):  # wavy hem, right to left
        u = i / 120
        x = CX + R - 2 * R * u
        y = hem + R * 0.12 * math.sin(u * 4 * 2 * math.pi + p.t * 2)
        pts.append((x, y))
    m = mask_new()
    d = ImageDraw.Draw(m)
    d.polygon(pts, fill=255)
    wave = math.sin(p.t) * 0.12
    for side in (-1, 1):  # little arms
        ax = CX + side * R * 1.02
        ay = cy + R * (0.35 - (wave if side > 0 else -wave)) - (R * 0.25 if p.mood == "happy" else 0)
        d.ellipse((ax - R * 0.2, ay - R * 0.14, ax + R * 0.2, ay + R * 0.14), fill=255)
    fill(img, m, TOP, BOTTOM, LINE)
    return Face(CX, cy - R * 0.05, R * 0.38, R * 0.17, cy + R * 0.42, cheek=(200, 150, 255)), (CX, top + R * 0.3, R)


CHARACTER = Character("familiar.ghost", "Призрак", "Добрый призрачок: парит над столом, машет ручками и колышется краем простынки.", draw,
                      floating=True, shadow=(40, 30, 70))
