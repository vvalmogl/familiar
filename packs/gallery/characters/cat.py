"""«Котик»: a round ginger cat with a swaying tail."""
import math

from PIL import ImageDraw

from rig import BASE, CX, S, SS, Character, Face, fill, mask_new

TOP, BOTTOM, LINE = (255, 196, 120), (238, 138, 58), (140, 72, 28)
INNER = (255, 170, 180)
R = S * 0.25


def draw(img, p):
    cy = BASE - R * 0.98
    # tail behind the body: a thick curve from the right hip, swinging with the phase
    sway = math.sin(p.t) * (0.5 if p.mood != "happy" else 1.0)
    pts = []
    for i in range(24):
        u = i / 23
        x = CX + R * (0.75 + 0.55 * u + 0.25 * sway * u * u)
        y = BASE - R * (0.25 + 1.15 * u) + R * 0.35 * math.sin(u * math.pi) * 0.4
        x -= R * 0.35 * sway * u ** 2
        pts.append((x, y))
    tail = mask_new()
    td = ImageDraw.Draw(tail)
    td.line(pts, fill=255, width=int(R * 0.26), joint="curve")
    x, y = pts[-1]
    td.ellipse((x - R * 0.13, y - R * 0.13, x + R * 0.13, y + R * 0.13), fill=255)
    fill(img, tail, TOP, BOTTOM, LINE, shine=False)

    body = mask_new()
    d = ImageDraw.Draw(body)
    d.ellipse((CX - R * 1.08, cy - R * 0.95, CX + R * 1.08, cy + R * 0.98), fill=255)
    for side in (-1, 1):  # ears
        bx = CX + side * R * 0.62
        d.polygon([(bx - side * R * 0.38, cy - R * 0.62), (bx + side * R * 0.3, cy - R * 1.38), (bx + side * R * 0.45, cy - R * 0.45)], fill=255)
    fill(img, body, TOP, BOTTOM, LINE, y0=cy - R * 1.4, y1=cy + R)

    d = ImageDraw.Draw(img)
    for side in (-1, 1):  # inner ears
        bx = CX + side * R * 0.62
        d.polygon([(bx - side * R * 0.18, cy - R * 0.72), (bx + side * R * 0.26, cy - R * 1.18), (bx + side * R * 0.32, cy - R * 0.62)], fill=INNER)
    for i in (-1, 0, 1):  # forehead stripes
        x = CX + i * R * 0.22
        d.line([(x, cy - R * 0.9), (x, cy - R * (0.66 if i else 0.58))], fill=BOTTOM + (255,), width=int(SS * 4))
    ey, my = cy - R * 0.12, cy + R * 0.32
    for side in (-1, 1):  # whiskers
        for k in (-1, 1):
            x0 = CX + side * R * 0.55
            d.line([(x0, my + k * R * 0.05), (x0 + side * R * 0.5, my + k * R * 0.14 - R * 0.04)], fill=LINE + (255,), width=SS * 2)
    d.polygon([(CX - R * 0.08, my - R * 0.17), (CX + R * 0.08, my - R * 0.17), (CX, my - R * 0.07)], fill=(230, 110, 130))
    return Face(CX, ey, R * 0.38, R * 0.15, my + R * 0.03), (CX + R * 0.35, cy - R * 0.75, R)


CHARACTER = Character("familiar.cat", "Котик", "Рыжий круглый кот: машет хвостом, задумчиво смотрит вверх и подпрыгивает от радости.", draw)
