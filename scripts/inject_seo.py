#!/usr/bin/env python3
"""Dopisuje do zlozonej strony dane strukturalne o filmach (schema.org VideoObject), z ktorych korzysta Google.

Wywolywane w workflow po zlozeniu katalogu _site:  python scripts/inject_seo.py _site

Co robi:
  - czyta _site/data/tiktok.js (lista filmow z tytulami i liczba wyswietlen),
  - pomija filmy ukryte w panelu admina (_site/data/admin.js) i te bez okladki w _site/assets/covers/,
  - buduje blok <script type="application/ld+json"> i wstawia go w miejsce znacznika <!--VIDEO_LD--> w _site/index.html.

Gdy cos pojdzie nie tak (brak danych, brak znacznika), skrypt nic nie psuje: zostawia index.html bez zmian
i konczy sie kodem 0, a znacznik w HTML to zwykly komentarz.
"""
import datetime
import json
import pathlib
import re
import sys

MARKER = "<!--VIDEO_LD-->"
TIKTOK_USER = "369_shoter"
MAX_VIDEOS = 15


def read_js_object(path, variable):
    """Wyciaga obiekt JSON z pliku 'window.ZMIENNA = {...};'."""
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


def upload_date(video):
    """Godzina publikacji z danych ("t", ze strony filmu), a bez niej czas wgrania z numeru filmu (pierwsze 32 bity)."""
    t = video.get("t") if isinstance(video.get("t"), int) else int(video["id"]) >> 32
    return datetime.datetime.fromtimestamp(t, datetime.timezone.utc).isoformat()


def safe_json(obj):
    """JSON bezpieczny do wstawienia w <script>: bez sekwencji, ktore moglyby zamknac blok albo zepsuc HTML."""
    text = json.dumps(obj, ensure_ascii=False, indent=2)
    for raw, esc in (("<", "\\u003c"), (">", "\\u003e"), ("&", "\\u0026"), (" ", "\\u2028"), (" ", "\\u2029")):
        text = text.replace(raw, esc)
    return text


def build(site):
    index = site / "index.html"
    html = index.read_text("utf-8")
    if MARKER not in html:
        print(f"Brak znacznika {MARKER} w {index.name}, pomijam.")
        return None
    canonical = re.search(r'<link rel="canonical" href="([^"]+)"', html)
    base = (canonical.group(1) if canonical else "").rstrip("/")
    if not base.startswith("https://"):
        print("Brak adresu strony (link canonical), pomijam.")
        return None

    data = read_js_object(site / "data" / "tiktok.js", "TIKTOK_DATA")
    hidden = set(str(x) for x in (read_js_object(site / "data" / "admin.js", "SITE_OVERRIDES").get("hidden") or []))
    videos = []
    for v in data.get("videos") or []:
        vid = str(v.get("id", "")) if isinstance(v, dict) else ""
        if not re.fullmatch(r"\d{15,25}", vid) or vid in hidden:
            continue
        if not (site / "assets" / "covers" / f"{vid}.webp").exists():
            continue  # thumbnailUrl jest wymagane przez Google, wiec bez okladki filmu nie opisujemy
        title = re.sub(r"\s+", " ", str(v.get("title") or "")).strip() or "Film"
        views = v.get("views")
        item = {
            "@type": "VideoObject",
            "name": title,
            "description": title + ("" if title[-1] in ".!?…" else ".") + f" Klip z CS2 od {TIKTOK_USER}.",
            "thumbnailUrl": [f"{base}/assets/covers/{vid}.webp"],
            "uploadDate": upload_date({**v, "id": vid}),
            "embedUrl": f"https://www.tiktok.com/player/v1/{vid}",
            "url": f"https://www.tiktok.com/@{TIKTOK_USER}/video/{vid}",
            "author": {"@type": "Person", "name": TIKTOK_USER, "url": base + "/"},
        }
        if isinstance(views, int) and views > 0:
            item["interactionStatistic"] = {
                "@type": "InteractionCounter",
                "interactionType": {"@type": "WatchAction"},
                "userInteractionCount": views,
            }
        videos.append((views if isinstance(views, int) else 0, item))
    if not videos:
        print("Brak filmow z okladkami, pomijam.")
        return None
    videos.sort(key=lambda x: x[0], reverse=True)
    graph = {"@context": "https://schema.org", "@graph": [item for _, item in videos[:MAX_VIDEOS]]}
    block = '<script type="application/ld+json">\n' + safe_json(graph) + "\n  </script>"
    index.write_text(html.replace(MARKER, block, 1), "utf-8")
    return min(len(videos), MAX_VIDEOS)


def main():
    site = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
    try:
        count = build(site)
    except Exception as exc:  # noqa: BLE001 - dane dla Google to dodatek, nie moga zepsuc publikacji
        print(f"::warning::Dane o filmach dla Google nie dodane ({exc})")
        return 0
    if count:
        print(f"Dodano dane strukturalne o {count} filmach.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
