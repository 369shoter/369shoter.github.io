#!/usr/bin/env python3
"""Pobiera publiczne dane konta z TikToka i zapisuje je dla strony.

Co robi:
  - czyta liczbę obserwujących i polubień z publicznego profilu,
  - czyta listę ostatnich filmów (z liczbą wyświetleń) z publicznego embedu profilu,
  - pobiera okładki nowych filmów do assets/covers/ (potrzebny Pillow),
  - dla świeżych filmów czyta ze strony filmu prawdziwą godzinę publikacji (pole "t"; zaplanowany post
    wychodzi później, niż mówi numer filmu, który oznacza chwilę wgrania),
  - dopisuje liczbę obserwujących do krótkiej historii (pole "fh"), z której strona liczy przyrost w tygodniu,
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
PUBLISH_LOOKBACK_DAYS = 30  # godzine publikacji sprawdzamy tylko u filmow wgranych w tylu ostatnich dniach
PUBLISH_FETCH_MAX = 12      # najwyzej tyle stron filmow na jedno odswiezenie (reszta przy nastepnym)
# Historia liczby obserwujacych ("fh": [czas Unix, obserwujacy]) dla dopisku "+N w tym tygodniu" na stronie.
FOLLOWERS_KEEP_DAYS = 9     # starsze punkty sa usuwane (strona porownuje z ostatnimi 7 dniami)
FOLLOWERS_GAP_S = 3 * 3600  # nowy punkt najwyzej co 3 godziny
FOLLOWERS_SEED = [[1790695859, 3753]]  # pierwszy znany punkt (29.09, z logu publikacji); sam zniknie po 9 dniach
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


def get_stats_from_embed():
    """Zapasowe zrodlo liczb: embed profilu tez podaje obserwujacych i polubienia."""
    html = fetch(f"https://www.tiktok.com/embed/@{USER}")
    state = script_json(html, "__FRONTITY_CONNECT_STATE__")
    for node in walk_dicts(state):
        if "followerCount" in node:
            return {
                "followers": int(node["followerCount"]),
                "likes": int(node.get("heartCount") or node.get("heart") or 0),
            }
    raise RuntimeError("embed nie zawiera liczby obserwujacych")


def walk_dicts(node):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from walk_dicts(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk_dicts(value)


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


def id_time(vid):
    """Chwila wgrania filmu (Unix): pierwsze 32 bity jego numeru."""
    return int(vid) >> 32


def fetch_publish_time(vid):
    """Prawdziwa godzina publikacji filmu (Unix) z jego strony na TikToku. Przy zaplanowanym poscie jest pozniejsza
    (nawet o kilka dni) niz chwila wgrania zapisana w numerze filmu."""
    page = fetch(f"https://www.tiktok.com/@{USER}/video/{vid}", tries=2)
    item = script_json(page, "__UNIVERSAL_DATA_FOR_REHYDRATION__")["__DEFAULT_SCOPE__"]["webapp.video-detail"]["itemInfo"]["itemStruct"]
    if str(item.get("id")) != vid:
        raise RuntimeError("strona pokazala inny film")
    t = int(item.get("createTime") or 0)
    if not id_time(vid) - 300 <= t <= time.time() + 600:
        raise RuntimeError(f"dziwna godzina publikacji {t}")
    return t


def read_previous():
    if not DATA_FILE.exists():
        return {}
    m = re.search(r"window\.TIKTOK_DATA\s*=\s*(\{.*\})\s*;", DATA_FILE.read_text("utf-8"), re.S)
    return json.loads(m.group(1)) if m else {}


def main():
    previous = read_previous()
    result = {"stats": previous.get("stats", {}), "videos": previous.get("videos", [])}
    if isinstance(previous.get("at"), int):
        result["at"] = previous["at"]
    changed = False

    stats = None
    try:
        stats = get_stats()
    except Exception as exc:  # noqa: BLE001
        print(f"profil nie odpowiedzial ({exc}), probuje embed")
        try:
            stats = get_stats_from_embed()
            stats["videos"] = (previous.get("stats") or {}).get("videos", 0)
        except Exception as exc2:  # noqa: BLE001
            warn(f"statystyki nie zaktualizowane ({exc2})")
    if stats:
        if stats["followers"] > 0:
            result["stats"] = stats
            changed = True
            print(f"statystyki: {stats}")
        else:
            warn("TikTok zwrocil 0 obserwujacych, zostawiam stare statystyki")

    # historia obserwujacych: poprzednie punkty + nowy (gdy statystyki sa swieze i minely 3 godziny od ostatniego)
    now = int(time.time())
    points = {}
    for p in (previous.get("fh") or []) + FOLLOWERS_SEED:
        if isinstance(p, list) and len(p) == 2 and all(isinstance(x, int) and x > 0 for x in p):
            points[p[0]] = p[1]
    if stats and stats["followers"] > 0 and (not points or now - max(points) >= FOLLOWERS_GAP_S):
        points[now] = stats["followers"]
    keep = now - FOLLOWERS_KEEP_DAYS * 86400
    result["fh"] = [[t, f] for t, f in sorted(points.items()) if t >= keep]

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
            prev_by_id = {v["id"]: v for v in previous.get("videos", [])}
            prev_at = previous.get("at") if isinstance(previous.get("at"), int) else 0
            recent = time.time() - PUBLISH_LOOKBACK_DAYS * 86400
            lookups = 0
            for v in sorted(merged.values(), key=lambda x: int(x["id"]), reverse=True):
                if not v.get("_cover") and not (COVERS / f"{v['id']}.webp").exists():
                    # znany film, ktory wypadl z listy embedu, a jego okladki nie ma w repozytorium
                    try:
                        v["_cover"] = fetch_video_info(v["id"]).get("_cover")
                    except Exception:  # noqa: BLE001
                        pass
                save_cover(v)
                item = {"id": v["id"], "title": v["title"], "views": v["views"]}
                lqip = make_lqip(v["id"])
                if lqip:
                    item["lqip"] = lqip
                if v.get("extra"):
                    item["extra"] = True
                # godzina publikacji: znana z poprzednich odswiezen albo ze strony filmu (tylko swieze filmy)
                old = prev_by_id.get(v["id"], {})
                t, guess = old.get("t"), bool(old.get("tGuess"))
                if (not t or guess) and lookups < PUBLISH_FETCH_MAX and id_time(v["id"]) > recent:
                    lookups += 1
                    try:
                        t, guess = fetch_publish_time(v["id"]), False
                        time.sleep(0.4)
                    except Exception as exc:  # noqa: BLE001 - bez tej godziny strona liczy od numeru filmu
                        print(f"  godzina publikacji {v['id']} nieznana ({exc})")
                        lookups = PUBLISH_FETCH_MAX  # TikTok nie oddaje stron filmow: nie probuj reszty w tym przebiegu
                if not t and v["id"] not in prev_by_id and prev_at and recent < id_time(v["id"]) < prev_at:
                    # nowy na liscie, choc wgrany przed poprzednim odswiezeniem: zaplanowany, wyszedl po nim
                    t, guess = prev_at, True
                if isinstance(t, int) and t > 0:
                    item["t"] = t
                    if guess:
                        item["tGuess"] = True  # przyblizona; przy nastepnym odswiezeniu sprobujemy ja doczytac
                result["videos"].append(item)
            result["at"] = int(time.time())  # chwila, w ktorej lista filmow byla aktualna (main.js liczy od niej nowe filmy)
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
