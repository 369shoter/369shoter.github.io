#!/usr/bin/env python3
"""Robi male strony do udostepniania klipow: _site/k/<numer filmu>/index.html.

Wywolywane w workflow po zlozeniu katalogu _site:  python scripts/make_share_pages.py _site

Link https://369shoter.github.io/k/NUMER/ wklejony na Discordzie, w Messengerze itp. pokazuje okladke (obraz 1200x630 z
assets/og/NUMER.jpg), tytul i liczbe wyswietlen TEGO klipu, a czlowieka od razu przenosi na strone z otwartym filmem
(https://369shoter.github.io/?film=NUMER). Dla filmow, ktorych jeszcze nie ma na tej liscie (swiezo dodanych),
przycisk "Kopiuj link" na stronie uzywa adresu Workera (/k/NUMER w Cloudflare), ktory robi to samo na zywo.

Czyta _site/data/tiktok.js, pomija filmy ukryte w panelu admina (_site/data/admin.js). Gdy cos pojdzie nie tak,
nic nie psuje: konczy sie kodem 0, a bez tych stron strona dziala normalnie.
"""
import html
import json
import pathlib
import re
import sys


def read_js_object(path, variable):
    if not path.exists():
        return {}
    m = re.search(r"window\.%s\s*=\s*(\{.*\})\s*;?\s*$" % re.escape(variable), path.read_text("utf-8"), re.S)
    if not m:
        return {}
    try:
        data = json.loads(m.group(1))
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def short(n):
    """Tak samo jak short() w js/main.js: 3749 -> 3,7K, 237800 -> 237K (zawsze w dol)."""
    if n >= 1_000_000:
        return str(n // 100_000 / 10).replace(".", ",") + "M"
    if n >= 100_000:
        return f"{n // 1000}K"
    if n >= 1000:
        return str(n // 100 / 10).replace(".", ",") + "K"
    return str(n)


def page(base, vid, title, views, image, wide):
    esc = lambda v: html.escape(str(v), quote=True)  # noqa: E731
    target = f"{base}/?film={vid}"
    self_url = f"{base}/k/{vid}/"
    desc = "Klip z CS2 od 369_shoter" + (f" · {short(views)} wyświetleń" if views else "")
    dims = '\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' if wide else ""
    return f"""<!doctype html>
<html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)} | 369_shoter</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0b0c0d">
<meta property="og:type" content="website">
<meta property="og:site_name" content="369_shoter">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{esc(self_url)}">
<meta property="og:image" content="{esc(image)}">{dims}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{esc(image)}">
<meta http-equiv="refresh" content="0;url={esc(target)}">
</head><body style="background:#0b0c0d;color:#edefec;font-family:system-ui,sans-serif"><p><a style="color:#57e02c" href="{esc(target)}">{esc(title)}: otwórz klip na stronie 369_shoter</a></p></body></html>
"""


def build(site):
    index = site / "index.html"
    if not index.exists():
        print("Brak index.html w katalogu strony, pomijam.")
        return 0
    canonical = re.search(r'<link rel="canonical" href="([^"]+)"', index.read_text("utf-8"))
    base = (canonical.group(1) if canonical else "").rstrip("/")
    if not base.startswith("https://"):
        print("Brak adresu strony (link canonical), pomijam.")
        return 0

    data = read_js_object(site / "data" / "tiktok.js", "TIKTOK_DATA")
    hidden = set(str(x) for x in (read_js_object(site / "data" / "admin.js", "SITE_OVERRIDES").get("hidden") or []))
    made = 0
    for v in data.get("videos") or []:
        vid = str(v.get("id", "")) if isinstance(v, dict) else ""
        if not re.fullmatch(r"\d{15,25}", vid) or vid in hidden:
            continue
        title = re.sub(r"\s+", " ", str(v.get("title") or "")).strip() or "Klip z CS2"
        views = v.get("views") if isinstance(v.get("views"), int) else 0
        own = (site / "assets" / "og" / f"{vid}.jpg").exists()
        image = f"{base}/assets/og/{vid}.jpg" if own else f"{base}/assets/og.jpg"
        out = site / "k" / vid
        out.mkdir(parents=True, exist_ok=True)
        (out / "index.html").write_text(page(base, vid, title, views, image, True), "utf-8")  # oba obrazy maja 1200x630
        made += 1
    return made


def main():
    site = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
    try:
        made = build(site)
    except Exception as exc:  # noqa: BLE001 - strony do udostepniania to dodatek, nie moga zepsuc publikacji
        print(f"::warning::Strony do udostepniania klipow nie powstaly ({exc})")
        return 0
    print(f"Strony do udostepniania klipow: {made} w k/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
