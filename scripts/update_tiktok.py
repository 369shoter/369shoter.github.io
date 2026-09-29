#!/usr/bin/env python3
"""Pobiera publiczne dane konta z TikToka i zapisuje je dla strony.

Co robi:
  - czyta liczbę obserwujących i polubień z publicznego profilu,
  - czyta listę ostatnich filmów (z liczbą wyświetleń) z publicznego embedu profilu,
  - pobiera okładki nowych filmów do assets/covers/ (potrzebny Pillow),
  - zapisuje wszystko do data/tiktok.js, które wczytuje strona.

Skrypt nigdy nie psuje strony: jeśli TikTok nie odpowie albo zwróci dziwne dane,
zostaje poprzedni plik data/tiktok.js, a skrypt kończy się kodem 0.

Uruchomienie lokalnie:  python scripts/update_tiktok.py
"""
import datetime
import base64
import io
import json
import os
import pathlib
import re
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
USER = "369_shoter"
DATA_FILE = ROOT / "data" / "tiktok.js"
COVERS = ROOT / "assets" / "covers"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def warn(message):
    # w GitHub Actions taka linijka pokazuje sie jako zolte ostrzezenie przy przebiegu
    print(("::warning::" if os.environ.get("GITHUB_ACTIONS") else "UWAGA: ") + message)


def fetch(url, binary=False, tries=3):
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "pl,en;q=0.8"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
            return body if binary else body.decode("utf-8", "replace")
        except Exception as exc:  # noqa: BLE001 - chcemy zlapac wszystko i sprobowac ponownie
            last = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"nie udalo sie pobrac {url}: {last}")


def script_json(html, script_id):
    m = re.search(r'<script id="%s"[^>]*>(.*?)</script>' % re.escape(script_id), html, re.S)
    if not m:
        raise RuntimeError(f"brak bloku danych {script_id}")
    return json.loads(m.group(1))


def get_stats():
    html = fetch(f"https://www.tiktok.com/@{USER}")
    state = script_json(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__")
    info = state["__DEFAULT_SCOPE__"]["webapp.user-detail"]["userInfo"]
    stats = info.get("statsV2") or info["stats"]
    return {
        "followers": int(stats["followerCount"]),
        "likes": int(stats.get("heartCount") or stats.get("heart") or 0),
        "videos": int(stats.get("videoCount") or 0),
    }


def walk_videos(node):
    if isinstance(node, dict):
        if "playCount" in node and "id" in node:
            yield node
        for value in node.values():
            yield from walk_videos(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk_videos(value)


def clean_title(desc):
    text = re.sub(r"#\w+", "", desc or "")
    text = re.sub(r"\s+", " ", text).strip()
    letters = [c for c in text if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.7:
        text = text.lower()
        text = text[:1].upper() + text[1:]
    return text or "Film"


def get_videos():
    html = fetch(f"https://www.tiktok.com/embed/@{USER}")
    state = script_json(html, "__FRONTITY_CONNECT_STATE__")
    found = {}
    for item in walk_videos(state):
        vid = str(item["id"])
        if not vid.isdigit():
            continue
        found[vid] = {
            "id": vid,
            "title": clean_title(item.get("desc")),
            "views": int(item.get("playCount") or 0),
            "_cover": item.get("originCoverUrl") or item.get("coverUrl"),
        }
    return list(found.values())


def save_cover(video):
    """Zapisuje okladke 360x640 jako webp. Zwraca True, jesli plik istnieje po tej operacji."""
    target = COVERS / f"{video['id']}.webp"
    if target.exists():
        return True
    url = video.get("_cover")
    if not url:
        return False
    try:
        from PIL import Image, ImageOps  # Pillow jest doinstalowywany w workflow
    except ImportError:
        print("  (brak Pillow, pomijam okladki)")
        return False
    try:
        raw = fetch(url, binary=True)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img = ImageOps.fit(img, (360, 640), Image.LANCZOS)
        COVERS.mkdir(parents=True, exist_ok=True)
        img.save(target, "WEBP", quality=80, method=6)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"  okladka {video['id']} nie pobrana: {exc}")
        return False


def make_lqip(video_id):
    """Mikro-miniatura okladki (18x32, ok. 200-300 B) jako data: URI. Strona pokazuje ja rozmyta, zanim zaladuje sie prawdziwa okladka."""
    target = COVERS / f"{video_id}.webp"
    if not target.exists():
        return None
    try:
        from PIL import Image
        img = Image.open(target).convert("RGB").resize((18, 32), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=35, method=6)
        return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception as exc:  # noqa: BLE001 - miniatura jest dodatkiem
        print(f"  miniatura {video_id} nie powstala: {exc}")
        return None


ADMIN_FILE = ROOT / "data" / "admin.js"


def read_admin_video_ids():
    """Numery filmow dodanych recznie w panelu admina (data/admin.js)."""
    if not ADMIN_FILE.exists():
        return []
    m = re.search(r"window\.SITE_OVERRIDES\s*=\s*(\{.*\})\s*;?\s*$", ADMIN_FILE.read_text("utf-8"), re.S)
    if not m:
        return []
    try:
        overrides = json.loads(m.group(1))
    except ValueError:
        return []
    ids = []
    for v in (overrides.get("videos") or [])[:30]:
        vid = str(v.get("id", "")) if isinstance(v, dict) else ""
        if re.fullmatch(r"\d{15,25}", vid) and vid not in ids:
            ids.append(vid)
    return ids


def fetch_video_info(vid):
    """Tytul, adres okladki i liczba wyswietlen dowolnego publicznego filmu po jego numerze."""
    oembed = json.loads(fetch("https://www.tiktok.com/oembed?url=https://www.tiktok.com/@_/video/" + vid))
    info = {"id": vid, "title": clean_title(oembed.get("title")), "views": 0, "_cover": oembed.get("thumbnail_url")}
    try:
        page = fetch(f"https://www.tiktok.com/embed/v2/{vid}")
        m = re.search(r'"playCount":(\d+)', page)
        if m:
            info["views"] = int(m.group(1))
    except Exception:  # noqa: BLE001 - liczba wyswietlen jest dodatkiem
        pass
    return info


def read_previous():
    if not DATA_FILE.exists():
        return {}
    m = re.search(r"window\.TIKTOK_DATA\s*=\s*(\{.*\})\s*;", DATA_FILE.read_text("utf-8"), re.S)
    return json.loads(m.group(1)) if m else {}


def main():
    previous = read_previous()
    result = {"stats": previous.get("stats", {}), "videos": previous.get("videos", [])}
    changed = False

    try:
        stats = get_stats()
        if stats["followers"] > 0:
            result["stats"] = stats
            changed = True
            print(f"statystyki: {stats}")
        else:
            warn("profil zwrocil 0 obserwujacych, zostawiam stare statystyki")
    except Exception as exc:  # noqa: BLE001
        warn(f"statystyki nie zaktualizowane ({exc})")

    try:
        videos = get_videos()
        if videos:
            # zachowaj znane wczesniej filmy, ktore nie weszly do najnowszej listy
            # (filmy dodane recznie w panelu i potem usuniete stamtad znikaja)
            extras = read_admin_video_ids()
            merged = {v["id"]: v for v in previous.get("videos", []) if not v.get("extra") or v["id"] in extras}
            latest_ids = set()
            for v in videos:
                merged[v["id"]] = v
                latest_ids.add(v["id"])
            for vid in extras:
                if vid in latest_ids:
                    continue
                try:
                    info = fetch_video_info(vid)
                    info["extra"] = True
                    merged[vid] = info
                    print(f"  film z panelu {vid}: {info['title']!r}, {info['views']} wyswietlen")
                except Exception as exc:  # noqa: BLE001
                    warn(f"film {vid} z panelu nie pobrany ({exc})")
                time.sleep(0.4)
            result["videos"] = []
            for v in sorted(merged.values(), key=lambda x: int(x["id"]), reverse=True):
                save_cover(v)
                item = {"id": v["id"], "title": v["title"], "views": v["views"]}
                lqip = make_lqip(v["id"])
                if lqip:
                    item["lqip"] = lqip
                if v.get("extra"):
                    item["extra"] = True
                result["videos"].append(item)
            changed = True
            print(f"filmy: {len(videos)} z embedu, {len(extras)} z panelu, {len(result['videos'])} razem")
        else:
            warn("embed nie zwrocil zadnych filmow, zostawiam stare")
    except Exception as exc:  # noqa: BLE001
        warn(f"filmy nie zaktualizowane ({exc})")

    if not changed:
        print("Nic nie zaktualizowano, dane zostaja bez zmian.")
        return 0

    result["updated"] = datetime.date.today().isoformat()
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(
        "/* Plik generowany przez scripts/update_tiktok.py. Nie edytuj recznie. */\n"
        "window.TIKTOK_DATA = " + json.dumps(result, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"Zapisano {DATA_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
