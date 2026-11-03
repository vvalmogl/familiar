"""«Робот»: a boxy robot with a screen face and a blinking antenna."""
import math

from PIL import ImageDraw

from rig import BASE, CX, S, SS, Character, Face, fill, mask_new, soft

TOP, BOTTOM, LINE = (214, 226, 242), (140, 160, 196), (56, 70, 100)
SCREEN = (22, 32, 48)
LED = (110, 240, 255)
R = S * 0.25


def draw(img, p):
    # antenna: stalk with a glowing ball that bounces with the phase
    hy0 = BASE - R * 2.05
    tip = (CX + R * 0.12 * math.sin(p.t), hy0 - R * 0.55)
    d = ImageDraw.Draw(img)
    d.line([(CX, hy0), tip], fill=LINE + (255,), width=int(SS * 5))
    glow = {"thinking": (255, 200, 80), "happy": (255, 120, 170)}.get(p.mood, LED)
    on = p.mood != "thinking" or math.sin(p.t * 2) > 0
    if on:
        soft(img, (tip[0] - R * 0.3, tip[1] - R * 0.3, tip[0] + R * 0.3, tip[1] + R * 0.3), glow, 140, blur=SS * 4)
    ball = mask_new()
    ImageDraw.Draw(ball).ellipse((tip[0] - R * 0.13, tip[1] - R * 0.13, tip[0] + R * 0.13, tip[1] + R * 0.13), fill=255)
    fill(img, ball, glow if on else (120, 130, 150), glow if on else (90, 100, 120), LINE, shine=False)

    m = mask_new()
    md = ImageDraw.Draw(m)
    md.rounded_rectangle((CX - R * 1.05, hy0, CX + R * 1.05, hy0 + R * 1.45), radius=R * 0.32, fill=255)  # head
    md.rounded_rectangle((CX - R * 0.7, hy0 + R * 1.5, CX + R * 0.7, BASE - R * 0.02), radius=R * 0.18, fill=255)  # body
    for side in (-1, 1):  # ear bolts
        md.rounded_rectangle((CX + side * R * 1.0 - R * 0.12, hy0 + R * 0.45, CX + side * R * 1.0 + R * 0.12, hy0 + R * 0.95), radius=R * 0.08, fill=255)
    fill(img, m, TOP, BOTTOM, LINE)

    d = ImageDraw.Draw(img)
    d.rounded_rectangle((CX - R * 0.82, hy0 + R * 0.2, CX + R * 0.82, hy0 + R * 1.22), radius=R * 0.22, fill=SCREEN)
    d.line([(CX - R * 0.7, hy0 + R * 1.47), (CX + R * 0.7, hy0 + R * 1.47)], fill=LINE + (255,), width=SS * 3)  # neck
    by = hy0 + R * 1.78
    for i, c in enumerate([(255, 120, 120), (255, 210, 90), (120, 230, 160)]):  # chest lights
        x = CX - R * 0.3 + i * R * 0.3
        lit = p.mood != "idle" or i == int(p.t / (2 * math.pi) * 3) % 3
        d.ellipse((x - R * 0.08, by - R * 0.08, x + R * 0.08, by + R * 0.08), fill=c if lit else (90, 100, 120))
    return Face(CX, hy0 + R * 0.6, R * 0.36, R * 0.16, hy0 + R * 0.98, style="led", eye=LED), (CX, hy0 + R * 0.3, R)


CHARACTER = Character("familiar.robot", "Робот", "Квадратный робот с экраном вместо лица: мигает антенной, когда думает, и светится от радости.", draw)
