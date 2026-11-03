"""Shared rig for the procedurally drawn gallery characters (cat, ghost, robot, …).

    python rig.py OUT_DIR [name ...]     # needs Pillow; one folder per pack + preview.png

Every character is drawn by code in its own module under `characters/`, so the art is original,
reproducible and free of third-party assets. A character draws itself once in a fixed pose; the rig
adds squash and stretch, tilt, jumps, blinking, the face, thought bubbles and sparkles, and renders
the same five moods for all of them: idle, thinking, talking, happy, intro.
"""
import importlib
import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SIZE = 256           # output frame size
SS = 4               # supersampling for smooth edges
S = SIZE * SS
BASE = S * 0.88      # ground line
CX = S / 2

EYE = (28, 36, 48)
MOUTH = (60, 30, 44)
TONGUE = (255, 120, 130)
SPARK = (255, 214, 90)


# ───────────── drawing helpers ─────────────

def mask_new():
    return Image.new("L", (S, S), 0)


def gradient(top, bottom, y0=0.0, y1=float(S)):
    """Vertical RGBA gradient from `top` at y0 to `bottom` at y1."""
    g = Image.new("RGBA", (1, S))
    for y in range(S):
        t = min(1.0, max(0.0, (y - y0) / max(1.0, y1 - y0)))
        g.putpixel((0, y), tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,))
    return g.resize((S, S))


def fill(img, mask, top, bottom, outline, *, width=SS * 3, y0=None, y1=None, shine=True):
    """Paint `mask` with a vertical gradient, a soft highlight and an outline ring."""
    box = mask.getbbox()
    if not box:
        return
    y0 = box[1] if y0 is None else y0
    y1 = box[3] if y1 is None else y1
    body = gradient(top, bottom, y0, y1)
    if shine:
        w, h = box[2] - box[0], box[3] - box[1]
        hl = mask_new()
        ImageDraw.Draw(hl).ellipse((box[0] + w * 0.16, box[1] + h * 0.1, box[0] + w * 0.36, box[1] + h * 0.26), fill=120)
        hl = hl.filter(ImageFilter.GaussianBlur(SS * 3))
        body.paste((255, 255, 255, 255), (0, 0), hl)
    ring = mask.filter(ImageFilter.MaxFilter(width * 2 + 1))
    img.paste(outline + (255,), (0, 0), ring)
    img.paste(body, (0, 0), mask)


def soft(img, xy, color, alpha, blur=SS * 3):
    """Blurred ellipse (cheeks, glows)."""
    m = mask_new()
    ImageDraw.Draw(m).ellipse(xy, fill=alpha)
    img.paste(color + (255,), (0, 0), m.filter(ImageFilter.GaussianBlur(blur)))


@dataclass
class Pose:
    """What the rig asks a character to draw (all in the neutral, untransformed pose)."""
    t: float = 0.0               # phase in radians for secondary motion (tails, waves, antennas)
    look: tuple = (0.0, 0.0)     # pupils, -1…1
    blink: float = 0.0
    happy_eyes: bool = False
    mouth: float = 0.0           # 0 closed … 1 wide open
    smile: bool = True
    mood: str = "idle"


@dataclass
class Face:
    """Where a character wants its face; the rig draws it in a shared style."""
    cx: float
    y: float                     # eye line
    sep: float                   # half the distance between the eyes
    r: float                     # eye radius
    mouth_y: float
    style: str = "eyes"          # "eyes" or "led" (screen face)
    eye: tuple = EYE
    cheeks: bool = True
    cheek: tuple = (255, 128, 150)


@dataclass
class Character:
    id: str
    name: str
    description: str
    draw: object                 # draw(img, pose) -> (Face | None, head=(x, y, r))
    floating: bool = False       # hovers above the ground (ghost, cloud)
    shadow: tuple = (10, 30, 40)
    extras: dict = field(default_factory=dict)


def draw_face(img, f: Face, p: Pose):
    d = ImageDraw.Draw(img)
    lx, ly = p.look
    for side in (-1, 1):
        x = f.cx + side * f.sep
        if f.style == "led":
            col = f.eye
            if p.happy_eyes:
                d.line([(x - f.r, f.y + f.r * 0.4), (x, f.y - f.r * 0.5), (x + f.r, f.y + f.r * 0.4)], fill=col, width=int(f.r * 0.45), joint="curve")
            elif p.blink > 0.5:
                d.rounded_rectangle((x - f.r, f.y - f.r * 0.15, x + f.r, f.y + f.r * 0.15), radius=f.r * 0.15, fill=col)
            else:
                ox, oy = lx * f.r * 0.3, ly * f.r * 0.3
                d.rounded_rectangle((x - f.r * 0.7 + ox, f.y - f.r + oy, x + f.r * 0.7 + ox, f.y + f.r + oy), radius=f.r * 0.35, fill=col)
            continue
        if p.happy_eyes:
            d.arc((x - f.r, f.y - f.r * 0.6, x + f.r, f.y + f.r * 1.2), 200, 340, fill=f.eye, width=int(f.r * 0.42))
        elif p.blink > 0.5:
            d.line([(x - f.r * 0.8, f.y), (x + f.r * 0.8, f.y)], fill=f.eye, width=int(f.r * 0.35))
        else:
            ex, ey = x + lx * f.r * 0.35, f.y + ly * f.r * 0.3
            d.ellipse((ex - f.r * 0.72, ey - f.r, ex + f.r * 0.72, ey + f.r), fill=f.eye)
            hr = f.r * 0.26
            d.ellipse((ex - f.r * 0.05 - hr, ey - f.r * 0.45 - hr, ex - f.r * 0.05 + hr, ey - f.r * 0.45 + hr), fill=(255, 255, 255))
    if f.cheeks and f.style != "led":
        for side in (-1, 1):
            x = f.cx + side * (f.sep + f.r * 0.9)
            soft(img, (x - f.r * 0.9, f.y + f.r * 1.05, x + f.r * 0.9, f.y + f.r * 1.65), f.cheek, 120, blur=SS * 2)
    d = ImageDraw.Draw(img)
    my, mw = f.mouth_y, f.r * 1.15
    col = f.eye if f.style == "led" else MOUTH
    if p.mouth > 0.05:
        h = f.r * (0.35 + 1.05 * p.mouth)
        if f.style == "led":
            d.rounded_rectangle((f.cx - mw, my - h / 2, f.cx + mw, my + h / 2), radius=h * 0.4, outline=col, width=int(f.r * 0.3))
        else:
            d.ellipse((f.cx - mw * 0.8, my - h * 0.5, f.cx + mw * 0.8, my + h * 0.5), fill=col)
            d.ellipse((f.cx - mw * 0.45, my + h * 0.05, f.cx + mw * 0.45, my + h * 0.5), fill=TONGUE)
    elif p.smile:
        d.arc((f.cx - mw * 0.7, my - mw * 0.55, f.cx + mw * 0.7, my + mw * 0.35), 25, 155, fill=col, width=int(max(SS * 2.5, f.r * 0.2)))
    else:
        d.line([(f.cx - mw * 0.4, my), (f.cx + mw * 0.4, my)], fill=col, width=int(max(SS * 2.5, f.r * 0.2)))


# ───────────── frame ─────────────

def frame(ch: Character, *, sx=1.0, sy=1.0, lift=0.0, tilt=0.0, scale=1.0, dots=0, sparkles=(), **pose):
    p = Pose(**pose)
    if ch.floating:
        lift += 0.07 + 0.018 * math.sin(p.t)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    face, (hx, hy, hr) = ch.draw(layer, p)
    if face:
        draw_face(layer, face, p)

    # squash/stretch and intro scale around the ground point, then lift and tilt
    kx, ky = sx * scale, sy * scale
    w, h = max(1, int(S * kx)), max(1, int(S * ky))
    small = layer.resize((w, h), Image.BICUBIC)
    body = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    body.paste(small, (int(CX - CX * kx), int(BASE - BASE * ky - lift * S)), small)
    if tilt:
        body = body.rotate(tilt, resample=Image.BICUBIC, center=(CX, BASE - lift * S))

    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if scale > 0.05:
        sh = mask_new()
        sw = S * 0.22 * kx * (1 - min(lift * 2.4, 0.65))
        ImageDraw.Draw(sh).ellipse((CX - sw, BASE - S * 0.022, CX + sw, BASE + S * 0.026), fill=int(70 * min(1, scale)))
        out.paste(ch.shadow + (255,), (0, 0), sh.filter(ImageFilter.GaussianBlur(SS * 3)))
    out.alpha_composite(body)

    # effects in screen space, next to where the head ended up
    hx = CX + (hx - CX) * kx
    hy = BASE - (BASE - hy) * ky - lift * S
    hr *= kx
    d = ImageDraw.Draw(out)
    for i in range(dots):
        x = min(S * 0.95, hx + hr * (0.95 + 0.28 * i))
        y = max(S * 0.04, hy - hr * (0.35 + 0.25 * i))
        rr = S * (0.016 + 0.007 * i)
        d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=(255, 255, 255, 240), outline=(60, 60, 80, 255), width=SS * 2)
    for (ax, ay, a) in sparkles:
        x, y, rr = hx + ax * hr, max(S * 0.05, hy + ay * hr), S * 0.035 * a
        if rr <= 0:
            continue
        d.polygon([(x, y - rr), (x + rr * 0.3, y - rr * 0.3), (x + rr, y), (x + rr * 0.3, y + rr * 0.3),
                   (x, y + rr), (x - rr * 0.3, y + rr * 0.3), (x - rr, y), (x - rr * 0.3, y - rr * 0.3)], fill=SPARK)
    return out.resize((SIZE, SIZE), Image.LANCZOS)


# ───────────── moods ─────────────

def ease(t):
    return 1 - (1 - t) ** 3


def animations(ch: Character):
    idle = []
    for i in range(16):
        t = 2 * math.pi * i / 16
        b = math.sin(t)
        idle.append((frame(ch, sy=1 + 0.03 * b, sx=1 - 0.025 * b, t=t, look=(0.3 * math.sin(t / 2), 0),
                           blink=1.0 if i in (11, 12) else 0.0), 110))
    thinking = []
    for i in range(12):
        t = 2 * math.pi * i / 12
        thinking.append((frame(ch, sy=1 + 0.02 * math.sin(t), tilt=-5 + 2 * math.sin(t), t=t, look=(0.8, -0.9),
                               smile=False, dots=1 + (i // 3) % 3 if i < 9 else 3, mood="thinking"), 130))
    talking = []
    for i, m in enumerate([0.3, 0.9, 0.5, 1.0, 0.2, 0.75, 0.45, 0.95]):
        t = 2 * math.pi * i / 8
        talking.append((frame(ch, sy=1 + 0.03 * m, sx=1 - 0.02 * m, mouth=m, look=(0.2, 0), t=t, mood="talking"), 95))
    happy = []
    for i in range(16):
        u = i / 15
        if u < 0.2:
            k = u / 0.2
            f = dict(sy=1 - 0.2 * k, sx=1 + 0.16 * k, lift=0)
        elif u < 0.7:
            k = (u - 0.2) / 0.5
            f = dict(sy=1.08 - 0.08 * k, sx=0.94 + 0.06 * k, lift=0.07 * math.sin(math.pi * k))
        else:
            k = (u - 0.7) / 0.3
            f = dict(sy=1 - 0.1 * math.sin(math.pi * k), sx=1 + 0.08 * math.sin(math.pi * k), lift=0)
        a = math.sin(math.pi * min(1, u * 1.4))
        happy.append((frame(ch, **f, happy_eyes=True, mouth=0.6, t=u * 2 * math.pi, mood="happy",
                            sparkles=[(-1.3, -0.6, a), (1.35, -0.3, a * 0.8), (1.0, -1.0, a * 0.6)]), 55))
    intro = []
    for i in range(12):
        u = i / 11
        s = ease(u) * (1 + 0.18 * math.sin(math.pi * u))
        intro.append((frame(ch, scale=max(s, 0.02), sy=1 + 0.1 * math.sin(math.pi * u * 2) * (1 - u), t=u * 4,
                            blink=1.0 if u < 0.5 else 0.0), 45))
    return {"idle": idle, "thinking": thinking, "talking": talking, "happy": happy, "intro": intro}


def build(ch: Character, out: Path, version="1.0.0"):
    pack = out / ch.id
    pack.mkdir(parents=True, exist_ok=True)
    frames = {}
    for mood, seq in animations(ch).items():
        frames[mood] = []
        for i, (img, ms) in enumerate(seq):
            name = f"{mood}-{i:02}.png"
            img.save(pack / name, optimize=True)
            frames[mood].append([name, ms])
    manifest = {"id": ch.id, "name": ch.name, "author": "Familiar", "version": version, "license": "CC-BY-4.0",
                "frames": frames, "style": {"card": False, "scale": 1.0}}
    (pack / "pack.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    frame(ch, look=(0.2, 0)).save(out / f"{ch.id}.preview.png", optimize=True)


def load(name) -> Character:
    return importlib.import_module(f"characters.{name}").CHARACTER


ALL = ["cat", "ghost", "robot", "star", "mushroom", "cloud"]

if __name__ == "__main__":
    out = Path(sys.argv[1])
    for name in sys.argv[2:] or ALL:
        build(load(name), out)
        print("built", name)
