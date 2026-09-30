#!/usr/bin/env python3
"""Robi obrazy podgladu linku (1200x630) dla kazdego filmu: assets/og/<numer filmu>.jpg.

Wywolywane w workflow po pobraniu danych z TikToka:  python scripts/make_previews.py

Taki obraz pokazuje sie na Discordzie, w Messengerze itp., gdy ktos wklei link do konkretnego klipu (adres
https://TWOJ-WORKER.workers.dev/k/NUMER, patrz worker/README.md). Na obrazie: okladka klipu, jego tytul, liczba
wyswietlen i nazwa konta. Powstaje z okladek w assets/covers/ oraz czcionek strony (assets/fonts/).

Pliki nie sa zapisywane w repozytorium (assets/og/ jest w .gitignore), tylko dokladane do publikowanej strony.
Gdy cos pojdzie nie tak z jednym filmem, skrypt go pomija i idzie dalej; kod wyjscia zawsze 0.
"""
import json
import pathlib
import re
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets" / "fonts"
COVERS = ROOT / "assets" / "covers"
OUT = ROOT / "assets" / "og"
W, H = 1200, 630

BG = (11, 12, 13)
ACCENT = (87, 224, 44)
TEXT = (237, 239, 236)
MUTED = (155, 163, 156)
ON_ACCENT = (7, 17, 10)


class FontSet:
    """Czcionka strony w dwoch plikach (podstawowe litery i polskie znaki): kazdy znak bierzemy z pierwszego pliku, ktory go ma."""

    def __init__(self, names, size, weight):
        self.fonts = []
        for name in names:
            font = ImageFont.truetype(str(FONTS / f"{name}.woff2"), size)
            try:
                font.set_variation_by_axes([weight])
            except Exception:  # noqa: BLE001 - czcionka bez osi wagi: zostaje domyslna
                pass
            self.fonts.append((font, bytes(font.getmask("￿")), font.getmask("￿").size))
        self.size = size

    def pick(self, ch):
        for font, notdef, notdef_size in self.fonts:
            mask = font.getmask(ch)
            if not (mask.size == notdef_size and bytes(mask) == notdef):
                return font
        return None

    def length(self, text):
        total = 0.0
        for ch in text:
            font = self.pick(ch)
            total += font.getlength(ch) if font else 0
        return total

    def draw(self, draw, xy, text, fill):
        x, y = xy
        for ch in text:
            font = self.pick(ch)
            if not font:
                continue
            draw.text((x, y), ch, font=font, fill=fill)
            x += font.getlength(ch)


def short(n):
    """Tak samo jak short() w js/main.js: 3749 -> 3,7K, 237800 -> 237K (zawsze w dol)."""
    if n >= 1_000_000:
        return (str(n // 100_000 / 10)).replace(".", ",") + "M"
    if n >= 100_000:
        return f"{n // 1000}K"
    if n >= 1000:
        return (str(n // 100 / 10)).replace(".", ",") + "K"
    return str(n)


def wrap(text, fonts, max_width):
    lines, line = [], ""
    for word in text.split():
        candidate = (line + " " + word).strip()
        if fonts.length(candidate) <= max_width or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def fit_title(title, max_width, max_lines, sizes):
    text = title.upper()
    for size in sizes:
        fonts = FontSet(["bsd-latin", "bsd-latin-ext"], size, 900)
        lines = wrap(text, fonts, max_width)
        if len(lines) <= max_lines and all(fonts.length(l) <= max_width for l in lines):
            return fonts, lines
    fonts = FontSet(["bsd-latin", "bsd-latin-ext"], sizes[-1], 900)
    lines = wrap(text, fonts, max_width)[:max_lines]
    while lines and fonts.length(lines[-1] + "...") > max_width and len(lines[-1]) > 1:
        lines[-1] = lines[-1][:-1]
    if lines:
        lines[-1] += "..."
    return fonts, lines


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def render(video, avatar):
    vid = video["id"]
    cover = Image.open(COVERS / f"{vid}.webp").convert("RGB")
    canvas = Image.new("RGB", (W, H), BG)

    # tlo: mocno rozmyta okladka, przyciemniona od lewej (pod tekstem)
    back = ImageOps.fit(cover, (W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(34))
    back = Image.blend(back, Image.new("RGB", (W, H), BG), 0.62)
    canvas.paste(back)
    shade = Image.new("L", (W, 1))
    for x in range(W):
        shade.putpixel((x, 0), int(210 * max(0.0, 1 - x / (W * 0.72))))
    canvas.paste(Image.new("RGB", (W, H), BG), (0, 0), shade.resize((W, H)))

    # okladka filmu po prawej: zaokraglona, z cieniem i znakiem odtwarzania
    ph = H - 84
    pw = round(ph * 9 / 16)
    px, py = W - 64 - pw, 42
    card = rounded(ImageOps.fit(cover, (pw, ph), Image.LANCZOS), 30)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((px, py + 14, px + pw, py + ph + 14), 30, fill=(0, 0, 0, 190))
    canvas.paste(shadow.filter(ImageFilter.GaussianBlur(22)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(22)))
    canvas.paste(card, (px, py), card)
    d = ImageDraw.Draw(canvas, "RGBA")
    cx, cy, r = px + pw // 2, py + ph // 2, 52
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=ACCENT + (255,))
    d.polygon([(cx - 15, cy - 26), (cx - 15, cy + 26), (cx + 30, cy)], fill=ON_ACCENT + (255,))

    # lewa strona: nazwa konta, tytul, wyswietlenia
    x0 = 72
    if avatar is not None:
        canvas.paste(avatar, (x0, 46), avatar)
    brand = FontSet(["bsd-latin", "bsd-latin-ext"], 54, 900)
    bx = x0 + (88 if avatar is not None else 0)
    brand.draw(d, (bx, 44), "369", ACCENT)
    brand.draw(d, (bx + brand.length("369"), 44), "_SHOTER", TEXT)

    max_w = px - x0 - 56
    fonts, lines = fit_title(video.get("title") or "Film", max_w, 4, [112, 98, 86, 76, 66, 58])
    line_h = round(fonts.size * 0.98)
    y = 176
    for line in lines:
        fonts.draw(d, (x0, y), line, TEXT)
        y += line_h

    small = FontSet(["geist-latin", "geist-latin-ext"], 36, 600)
    small_muted = FontSet(["geist-latin", "geist-latin-ext"], 30, 500)
    views = video.get("views") or 0
    base = H - 92
    if views:
        d.polygon([(x0, base + 6), (x0, base + 34), (x0 + 24, base + 20)], fill=ACCENT + (255,))
        small.draw(d, (x0 + 40, base), f"{short(views)} wyświetleń", TEXT)
    small_muted.draw(d, (x0, H - 50), "Klipy z CS2 · TikTok, Instagram, YouTube", MUTED)
    return canvas


def main():
    data_file = ROOT / "data" / "tiktok.js"
    if not data_file.exists():
        print("Brak data/tiktok.js, pomijam.")
        return 0
    m = re.search(r"window\.TIKTOK_DATA\s*=\s*(\{.*\})\s*;", data_file.read_text("utf-8"), re.S)
    try:
        videos = json.loads(m.group(1)).get("videos", []) if m else []
    except ValueError:
        videos = []
    hidden = set()
    admin = ROOT / "data" / "admin.js"
    if admin.exists():
        hm = re.search(r"window\.SITE_OVERRIDES\s*=\s*(\{.*\})\s*;?\s*$", admin.read_text("utf-8"), re.S)
        try:
            hidden = set(str(x) for x in (json.loads(hm.group(1)).get("hidden") or [])) if hm else set()
        except ValueError:
            hidden = set()

    avatar = None
    try:
        avatar = rounded(Image.open(ROOT / "assets" / "avatar.webp").convert("RGB").resize((72, 72), Image.LANCZOS), 36)
    except Exception as exc:  # noqa: BLE001
        print(f"  brak awatara ({exc}), obrazy beda bez niego")

    OUT.mkdir(parents=True, exist_ok=True)
    made = 0
    for v in videos:
        vid = str(v.get("id", "")) if isinstance(v, dict) else ""
        if not re.fullmatch(r"\d{15,25}", vid) or vid in hidden or not (COVERS / f"{vid}.webp").exists():
            continue
        try:
            render(v | {"id": vid}, avatar).save(OUT / f"{vid}.jpg", "JPEG", quality=86, optimize=True)
            made += 1
        except Exception as exc:  # noqa: BLE001 - jeden film nie moze zatrzymac reszty
            print(f"::warning::Podglad filmu {vid} nie powstal ({exc})")
    print(f"Podglady linkow: {made} obrazow w assets/og/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
