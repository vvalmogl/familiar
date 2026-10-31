"""Draws «Капля» (familiar.droplet), an original character for the gallery, frame by frame.

    python make.py OUT_DIR        # needs Pillow; writes PNG frames + pack.json + preview.png

The art is generated from code, so the pack is reproducible and free of third-party assets.
"""
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SIZE = 256          # output frame size
SS = 4              # supersampling factor for smooth edges
S = SIZE * SS

TOP = (140, 240, 214)
BOTTOM = (38, 170, 150)
OUTLINE = (24, 104, 96)
EYE = (28, 36, 48)
CHEEK = (255, 128, 150, 110)
MOUTH = (60, 30, 44)
TONGUE = (255, 120, 130)
SPARK = (255, 214, 90)


def body_points(cx, cy, r, sx, sy, wobble, phase):
    pts = []
    for i in range(160):
        th = 2 * math.pi * i / 160
        x, y = math.cos(th), -math.sin(th)          # y up is negative on screen
        up = max(0.0, -y)                          # 0 at the middle, 1 at the very top
        x *= 1 - 0.55 * up ** 2                    # narrow towards the tip
        y *= 1 + 0.38 * up ** 3                    # and pull the tip up
        k = 1 + wobble * math.sin(3 * th + phase)
        pts.append((cx + x * r * sx * k, cy + y * r * sy * k))
    return pts


def frame(*, sx=1.0, sy=1.0, lift=0.0, tilt=0.0, wobble=0.0, phase=0.0, look=(0.0, 0.0), blink=0.0,
          happy_eyes=False, mouth=0.0, smile=True, dots=0, sparkles=(), scale=1.0):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    r = S * 0.28 * scale
    base = S * 0.86                                 # ground line
    cy = base - r * sy - lift * S
    cx = S / 2

    # ground shadow shrinks as the drop jumps
    if scale > 0.05:
        sh = Image.new("L", (S, S), 0)
        w = r * 0.95 * (1 - min(lift * 2.2, 0.6))
        ImageDraw.Draw(sh).ellipse((cx - w, base - S * 0.025, cx + w, base + S * 0.03), fill=70)
        sh = sh.filter(ImageFilter.GaussianBlur(SS * 3))
        img.paste((10, 40, 40, 255), (0, 0), sh)

    pts = body_points(cx, cy, r, sx, sy, wobble, phase)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)

    grad = Image.linear_gradient("L").resize((S, S))
    body = Image.composite(Image.new("RGBA", (S, S), BOTTOM + (255,)), Image.new("RGBA", (S, S), TOP + (255,)), grad)
    # soft inner shade at the bottom
    shade = Image.new("L", (S, S), 0)
    ImageDraw.Draw(shade).ellipse((cx - r * 1.2, cy + r * 0.25, cx + r * 1.2, cy + r * 1.6), fill=90)
    shade = ImageChops.multiply(shade.filter(ImageFilter.GaussianBlur(SS * 10)), mask)
    body.paste(OUTLINE + (255,), (0, 0), shade)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    layer.paste(body, (0, 0), mask)

    d = ImageDraw.Draw(layer)
    d.line(pts + [pts[0]], fill=OUTLINE + (255,), width=SS * 3, joint="curve")

    # glossy highlight
    hl = Image.new("L", (S, S), 0)
    ImageDraw.Draw(hl).ellipse((cx - r * 0.62, cy - r * 0.62, cx - r * 0.22, cy - r * 0.18), fill=150)
    hl = ImageChops.multiply(hl.filter(ImageFilter.GaussianBlur(SS * 2)), mask)
    layer.paste((255, 255, 255, 255), (0, 0), hl)

    # face
    ex, ey = look
    eye_y = cy + r * 0.05 + ey * r * 0.08
    for side in (-1, 1):
        x = cx + side * r * 0.36 * sx + ex * r * 0.1
        if happy_eyes:
            d.arc((x - r * 0.14, eye_y - r * 0.08, x + r * 0.14, eye_y + r * 0.16), 200, 340, fill=EYE, width=SS * 4)
            continue
        h = r * 0.15 * (1 - blink) + SS
        d.ellipse((x - r * 0.1, eye_y - h, x + r * 0.1, eye_y + h), fill=EYE)
        if blink < 0.5:
            d.ellipse((x - r * 0.02 + ex * r * 0.03, eye_y - h * 0.65, x + r * 0.05 + ex * r * 0.03, eye_y - h * 0.2), fill="white")
        cheek = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(cheek).ellipse((x + side * r * 0.12 - r * 0.1, eye_y + r * 0.2, x + side * r * 0.12 + r * 0.1, eye_y + r * 0.3), fill=CHEEK)
        layer.alpha_composite(cheek.filter(ImageFilter.GaussianBlur(SS * 1.5)))
    if happy_eyes:
        for side in (-1, 1):
            x = cx + side * r * 0.5 * sx
            cheek = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            ImageDraw.Draw(cheek).ellipse((x - r * 0.11, eye_y + r * 0.16, x + r * 0.11, eye_y + r * 0.28), fill=CHEEK)
            layer.alpha_composite(cheek.filter(ImageFilter.GaussianBlur(SS * 1.5)))

    my = eye_y + r * 0.3
    mx = cx + ex * r * 0.08
    if mouth > 0.05:
        w, h = r * (0.12 + 0.05 * mouth), r * (0.04 + 0.16 * mouth)
        d.ellipse((mx - w, my - h * 0.4, mx + w, my + h), fill=MOUTH)
        d.ellipse((mx - w * 0.6, my + h * 0.35, mx + w * 0.6, my + h * 0.95), fill=TONGUE)
    elif smile:
        d.arc((mx - r * 0.13, my - r * 0.1, mx + r * 0.13, my + r * 0.08), 20, 160, fill=MOUTH, width=SS * 3)
    else:
        d.ellipse((mx - r * 0.04, my - r * 0.01, mx + r * 0.04, my + r * 0.07), fill=MOUTH)

    if tilt:
        layer = layer.rotate(tilt, resample=Image.BICUBIC, center=(cx, base))
    img.alpha_composite(layer)

    d = ImageDraw.Draw(img)
    # thinking dots above the head, to the right
    for i in range(dots):
        x = cx + r * (0.55 + 0.32 * i)
        y = cy - r * (1.15 + 0.22 * i)
        rr = r * (0.06 + 0.025 * i)
        d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=(255, 255, 255, 235), outline=OUTLINE + (255,), width=SS * 2)
    for (ax, ay, a) in sparkles:
        x, y, rr = cx + ax * r, cy + ay * r, r * 0.12 * a
        if rr <= 0:
            continue
        d.polygon([(x, y - rr), (x + rr * 0.3, y - rr * 0.3), (x + rr, y), (x + rr * 0.3, y + rr * 0.3),
                   (x, y + rr), (x - rr * 0.3, y + rr * 0.3), (x - rr, y), (x - rr * 0.3, y - rr * 0.3)], fill=SPARK)
    return img.resize((SIZE, SIZE), Image.LANCZOS)


def ease(t):
    return 1 - (1 - t) ** 3


def animations():
    idle = []
    for i in range(16):
        t = 2 * math.pi * i / 16
        b = math.sin(t)
        idle.append((frame(sy=1 + 0.035 * b, sx=1 - 0.03 * b, wobble=0.008, phase=t,
                           look=(0.3 * math.sin(t / 2), 0), blink=1.0 if i in (11, 12) else 0.0), 110))
    thinking = []
    for i in range(12):
        t = 2 * math.pi * i / 12
        thinking.append((frame(sy=1 + 0.02 * math.sin(t), tilt=-5 + 2 * math.sin(t), look=(0.8, -0.9),
                               smile=False, dots=1 + (i // 3) % 3 if i < 9 else 3, phase=t, wobble=0.006), 130))
    talking = []
    for i, m in enumerate([0.3, 0.9, 0.5, 1.0, 0.2, 0.75, 0.45, 0.95]):
        t = 2 * math.pi * i / 8
        talking.append((frame(sy=1 + 0.03 * m, sx=1 - 0.02 * m, mouth=m, look=(0.2, 0), phase=t, wobble=0.01), 95))
    happy = []
    for i in range(16):
        u = i / 15
        if u < 0.2:          # squash before the jump
            k = u / 0.2
            f = dict(sy=1 - 0.22 * k, sx=1 + 0.18 * k, lift=0)
        elif u < 0.7:        # up and down
            k = (u - 0.2) / 0.5
            f = dict(sy=1.08 - 0.08 * k, sx=0.94 + 0.06 * k, lift=0.07 * math.sin(math.pi * k))
        else:                # land and settle
            k = (u - 0.7) / 0.3
            f = dict(sy=1 - 0.12 * math.sin(math.pi * k), sx=1 + 0.1 * math.sin(math.pi * k), lift=0)
        a = math.sin(math.pi * min(1, u * 1.4))
        happy.append((frame(**f, happy_eyes=True, mouth=0.6, wobble=0.012, phase=u * 6,
                            sparkles=[(-1.2, -0.9, a), (1.25, -0.6, a * 0.8), (0.95, -1.15, a * 0.6)]), 55))
    intro = []
    for i in range(12):
        u = i / 11
        s = ease(u) * (1 + 0.18 * math.sin(math.pi * u))
        intro.append((frame(scale=max(s, 0.02), sy=1 + 0.1 * math.sin(math.pi * u * 2) * (1 - u), wobble=0.02 * (1 - u),
                            phase=u * 8, blink=1.0 if u < 0.5 else 0.0), 45))
    return {"idle": idle, "thinking": thinking, "talking": talking, "happy": happy, "intro": intro}


def main(out: Path):
    pack = out / "familiar.droplet"
    pack.mkdir(parents=True, exist_ok=True)
    frames = {}
    for mood, seq in animations().items():
        frames[mood] = []
        for i, (img, ms) in enumerate(seq):
            name = f"{mood}-{i:02}.png"
            img.save(pack / name, optimize=True)
            frames[mood].append([name, ms])
    manifest = {
        "id": "familiar.droplet",
        "name": "Капля",
        "author": "Familiar",
        "version": "1.0.0",
        "license": "CC-BY-4.0",
        "frames": frames,
        "style": {"card": False, "scale": 1.0},
    }
    (pack / "pack.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    frame(look=(0.2, 0), mouth=0.0).save(out / "preview.png", optimize=True)


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "build"))
