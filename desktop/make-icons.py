"""Builds every app icon from desktop/icons/artwork.png (the cat on the books, transparent background).

Run with `python3 desktop/make-icons.py` (needs Pillow) after changing the artwork.
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / 'desktop' / 'icons'
WHITE = (255, 255, 255, 255)

art = Image.open(ICONS / 'artwork.png').convert('RGBA')
art = art.crop(art.getchannel('A').point(lambda a: 255 if a > 10 else 0).getbbox())


def fit(size: int, margin: float) -> Image.Image:
    """The artwork centred on a transparent square, with `margin` (a fraction of `size`) clear on every side."""
    room = size * (1 - 2 * margin)
    scale = room / max(art.size)
    piece = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
    out = Image.new('RGBA', (size, size))
    out.alpha_composite(piece, ((size - piece.width) // 2, (size - piece.height) // 2))
    return out


def on_white(size: int, margin: float) -> Image.Image:
    out = Image.new('RGBA', (size, size), WHITE)
    out.alpha_composite(fit(size, margin))
    return out.convert('RGB')


def app_icon(size: int = 1024) -> Image.Image:
    """Apple's layout: an 824/1024 rounded white tile with a soft shadow, the artwork inside."""
    s = size / 1024
    tile, inset, radius = round(824 * s), round(100 * s), round(185 * s)
    mask = Image.new('L', (size, size))
    ImageDraw.Draw(mask).rounded_rectangle((inset, inset, inset + tile, inset + tile), radius, fill=255)
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    shadow.putalpha(ImageChops.offset(mask, 0, round(10 * s)).point(lambda a: a * 0.32).filter(ImageFilter.GaussianBlur(14 * s)))
    out = shadow
    face = Image.new('RGBA', (size, size), WHITE)
    face.alpha_composite(fit(tile, 0.12), (inset, inset))
    out.paste(face, (0, 0), mask)
    return out


icon = app_icon()
icon.save(ICONS / 'icon.png')
icon.save(ICONS / 'icon.icns')
linux = ICONS / 'linux'
linux.mkdir(exist_ok=True)
for size in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
    icon.resize((size, size), Image.LANCZOS).save(linux / f'{size}x{size}.png', optimize=True)
icon.save(ICONS / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

public = ROOT / 'public' / 'icons'
public.mkdir(parents=True, exist_ok=True)
on_white(512, 0.1).save(public / 'icon-512.png', optimize=True)
on_white(192, 0.1).save(public / 'icon-192.png', optimize=True)
on_white(180, 0.1).save(public / 'apple-touch-icon.png', optimize=True)
on_white(64, 0.03).save(public / 'favicon-64.png', optimize=True)
on_white(32, 0.03).save(public / 'favicon-32.png', optimize=True)
on_white(144, 0.08).save(ROOT / 'src' / 'assets' / 'logo.webp', quality=88, method=6)
print('icons written')
