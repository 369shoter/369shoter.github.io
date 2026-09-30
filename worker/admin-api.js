/* 369_shoter: API panelu admina (Cloudflare Worker, darmowy plan).

   Co robi: sprawdza haslo (i opcjonalnie kod 2FA), wydaje krotka sesje, a potem w Twoim imieniu odczytuje
   i zapisuje plik data/admin.js w repozytorium GitHub. Token GitHub jest tylko w sekretach Cloudflare i nigdy
   nie trafia do przegladarki. Zapis przechodzi ostra walidacje: przez ten Worker da sie zmienic wylacznie znane
   ustawienia strony, nie kod.

   Osobno (i bez hasla, bo to same publiczne dane) Worker oddaje stronie swieze liczby i liste filmow z TikToka pod /live:
   patrz "Dane z TikToka na zywo" nizej. Nie wymaga zadnych sekretow.

   Sekrety (Cloudflare -> Worker -> Settings -> Variables and Secrets), wszystkie typu "Secret":
     ADMIN_PASSWORD  haslo do panelu (min. 5 znakow)
     SESSION_SECRET  losowy ciag do podpisywania sesji (min. 32 znaki), wygenerujesz go na /admin/setup.html
     GITHUB_TOKEN    fine-grained token: tylko repo tymonekk.github.io, Contents: Read and write
     TOTP_SECRET     (opcjonalnie, polecane) sekret 2FA w base32 z /admin/setup.html
     GOATCOUNTER_TOKEN  (opcjonalnie) token GoatCounter z uprawnieniem "Read statistics"; wlacza karte statystyk w panelu
   Powiazanie KV (Settings -> Bindings -> KV namespace), nazwa zmiennej: KV. Trzyma liczniki nieudanych logowan. */

const ORIGIN = "https://tymonekk.github.io"; // jedyna strona, ktora moze uzywac tego API
const REPO = "tymonekk/tymonekk.github.io";
const BRANCH = "main";
const FILE = "data/admin.js";

const SESSION_TTL_S = 20 * 60;              // sesja wygasa po 20 minutach
const IP_MAX_FAILS = 5;                     // po 5 blednych probach blokada tego adresu IP...
const IP_WINDOW_S = 15 * 60;                // ...na 15 minut
const GLOBAL_MAX_FAILS = 40;                // 40 blednych prob od kogokolwiek w godzine blokuje logowanie...
const GLOBAL_WINDOW_S = 60 * 60;            // ...do konca tej godziny (ochrona przed zgadywaniem z wielu adresow)
const FAIL_DELAY_MS = 400;                  // kazda nieudana proba trwa min. tyle (spowalnia zgadywanie)
const MAX_BODY_BYTES = 32 * 1024;

const enc = new TextEncoder();
const ID_RE = /^\d{15,25}$/;

/* ---------- pomocnicze: odpowiedzi i CORS ---------- */
function allowedOrigin(env) { return env.ALLOWED_ORIGIN || ORIGIN; }

function baseHeaders(env) {
  return {
    "access-control-allow-origin": allowedOrigin(env),
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
    "access-control-max-age": "600",
    vary: "Origin",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  };
}

function reply(env, data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...baseHeaders(env), "content-type": "application/json; charset=utf-8", ...extra },
  });
}

/* ---------- pomocnicze: kryptografia ---------- */
const toB64u = (buf) => {
  let s = "";
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmacKey(secret, hash = "SHA-256") {
  return crypto.subtle.importKey("raw", typeof secret === "string" ? enc.encode(secret) : secret, { name: "HMAC", hash }, false, ["sign"]);
}
async function hmac(secret, data) {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data)));
}

/* Porownanie w stalym czasie: oba napisy przepuszczamy przez HMAC, wiec maja te sama dlugosc i nie ma "wczesnego wyjscia". */
async function safeEqual(a, b, secret) {
  const [x, y] = await Promise.all([hmac(secret, String(a)), hmac(secret, String(b))]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/* ---------- 2FA (TOTP, RFC 6238: HMAC-SHA1, 30 s, 6 cyfr) ---------- */
function base32Decode(s) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of clean) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}

async function totpCode(secretBytes, step) {
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setUint32(4, step >>> 0);
  new DataView(counter.buffer).setUint32(0, Math.floor(step / 2 ** 32));
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const o = h[19] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, "0");
}

/* Zwraca numer kroku (30 s), ktory pasuje do kodu, albo null. Dopuszczamy przesuniecie zegara o jeden krok. */
async function matchTotp(env, code, nowMs = Date.now()) {
  const secret = base32Decode(env.TOTP_SECRET);
  const step = Math.floor(nowMs / 30000);
  let found = null;
  for (const delta of [-1, 0, 1]) {
    const expected = await totpCode(secret, step + delta);
    if (await safeEqual(expected, code, env.SESSION_SECRET) && found === null) found = step + delta;
  }
  return found;
}

/* ---------- sesje: podpisany token "dane.podpis" ---------- */
async function signSession(env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = toB64u(enc.encode(JSON.stringify({ iat: now, exp: now + SESSION_TTL_S })));
  const sig = toB64u(await hmac(env.SESSION_SECRET + "|session", payload));
  return payload + "." + sig;
}

async function verifySession(env, request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expected = toB64u(await hmac(env.SESSION_SECRET + "|session", parts[0]));
  if (!(await safeEqual(expected, parts[1], env.SESSION_SECRET))) return false;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64u(parts[0])));
    return Number.isFinite(p.exp) && p.exp > Math.floor(Date.now() / 1000);
  } catch (_) { return false; }
}

/* ---------- limity nieudanych logowan (KV) ---------- */
async function isLocked(env, ip) {
  const [a, g] = await Promise.all([env.KV.get("fail:ip:" + ip), env.KV.get("fail:all")]);
  return (Number(a) || 0) >= IP_MAX_FAILS || (Number(g) || 0) >= GLOBAL_MAX_FAILS;
}
async function registerFail(env, ip) {
  const [a, g] = await Promise.all([env.KV.get("fail:ip:" + ip), env.KV.get("fail:all")]);
  await Promise.all([
    env.KV.put("fail:ip:" + ip, String((Number(a) || 0) + 1), { expirationTtl: IP_WINDOW_S }),
    env.KV.put("fail:all", String((Number(g) || 0) + 1), { expirationTtl: GLOBAL_WINDOW_S }),
  ]);
}

/* ---------- walidacja ustawien (musi byc zgodna z js/main.js, ale tutaj jest ostrzejsza: zle dane = odrzucenie) ---------- */
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const cleanStr = (v, max) => typeof v === "string" && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
function httpsUrl(v, max = 200) {
  if (v === "") return true;
  if (!cleanStr(v, max)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password;
  } catch (_) { return false; }
}
const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

function validateOverrides(o) {
  const bad = (m) => ({ error: m });
  if (!isObj(o)) return bad("Ustawienia muszą być obiektem.");
  const allowed = ["analytics", "discord", "email", "partner", "videoMode", "topCount", "latestCount", "videos", "hidden"];
  for (const k of Object.keys(o)) if (!allowed.includes(k)) return bad("Nieznane pole: " + k);
  const out = {};

  if ("analytics" in o) {
    const a = o.analytics;
    if (!isObj(a) || Object.keys(a).some((k) => k !== "goatcounter")) return bad("analytics: nieprawidłowe pola.");
    if (typeof a.goatcounter !== "string" || !/^([a-z0-9-]{2,40})?$/.test(a.goatcounter)) return bad("analytics.goatcounter: 2-40 znaków a-z, 0-9 i myślnik.");
    out.analytics = { goatcounter: a.goatcounter };
  }
  if ("discord" in o) {
    const d = o.discord;
    if (!isObj(d) || Object.keys(d).some((k) => !["username", "invite"].includes(k))) return bad("discord: nieprawidłowe pola.");
    const v = {};
    if ("username" in d) { if (!cleanStr(d.username, 40)) return bad("discord.username: maks. 40 znaków."); v.username = d.username.trim(); }
    if ("invite" in d) { if (!httpsUrl(d.invite)) return bad("discord.invite: wymagany adres https."); v.invite = d.invite; }
    out.discord = v;
  }
  if ("email" in o) {
    if (!cleanStr(o.email, 120) || (o.email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email))) return bad("email: nieprawidłowy adres.");
    out.email = o.email;
  }
  if ("partner" in o) {
    const p = o.partner;
    if (!isObj(p) || Object.keys(p).some((k) => !["enabled", "label", "name", "url", "note"].includes(k))) return bad("partner: nieprawidłowe pola.");
    const v = {};
    if ("enabled" in p) { if (typeof p.enabled !== "boolean") return bad("partner.enabled: true/false."); v.enabled = p.enabled; }
    for (const k of ["label", "name", "note"]) if (k in p) { if (!cleanStr(p[k], 200)) return bad("partner." + k + ": maks. 200 znaków."); v[k] = p[k].trim(); }
    if ("url" in p) { if (!httpsUrl(p.url)) return bad("partner.url: wymagany adres https."); v.url = p.url; }
    out.partner = v;
  }
  if ("videoMode" in o) {
    if (!["player", "tiktok"].includes(o.videoMode)) return bad("videoMode: player albo tiktok.");
    out.videoMode = o.videoMode;
  }
  for (const k of ["topCount", "latestCount"]) if (k in o) { if (!intIn(o[k], 1, 12)) return bad(k + ": liczba od 1 do 12."); out[k] = o[k]; }
  if ("videos" in o) {
    if (!Array.isArray(o.videos) || o.videos.length > 60) return bad("videos: maks. 60 filmów.");
    out.videos = [];
    for (const v of o.videos) {
      if (!isObj(v) || Object.keys(v).some((k) => !["id", "title"].includes(k)) || typeof v.id !== "string" || !ID_RE.test(v.id)) return bad("videos: nieprawidłowy film.");
      if ("title" in v && !cleanStr(v.title, 120)) return bad("videos: tytuł maks. 120 znaków.");
      out.videos.push("title" in v && v.title.trim() ? { id: v.id, title: v.title.trim() } : { id: v.id });
    }
  }
  if ("hidden" in o) {
    if (!Array.isArray(o.hidden) || o.hidden.length > 200 || o.hidden.some((id) => typeof id !== "string" || !ID_RE.test(id))) return bad("hidden: lista numerów filmów.");
    out.hidden = [...new Set(o.hidden)];
  }
  return { value: out };
}

const serialize = (o) =>
  "/* Plik zapisywany przez panel admina (admin/). Nie edytuj recznie. */\nwindow.SITE_OVERRIDES = " + JSON.stringify(o, null, 2) + ";\n";

function parseOverrides(text) {
  const m = text.match(/window\.SITE_OVERRIDES\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!m) return {};
  try { const o = JSON.parse(m[1]); return isObj(o) ? o : {}; } catch (_) { return {}; }
}

/* ---------- GitHub ---------- */
function gh(env, path, init = {}) {
  return fetch((env.GITHUB_API || "https://api.github.com") + path, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "369shoter-admin",
      authorization: "Bearer " + env.GITHUB_TOKEN,
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
}
const b64Decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
const b64Encode = (text) => { let s = ""; enc.encode(text).forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };

async function readFile(env) {
  const r = await gh(env, `/repos/${REPO}/contents/${FILE}?ref=${BRANCH}`);
  if (r.status === 404) return { overrides: {}, sha: null };
  if (!r.ok) throw new Error("github-" + r.status);
  const j = await r.json();
  return { overrides: parseOverrides(b64Decode(j.content || "")), sha: j.sha };
}

/* ---------- Statystyki (GoatCounter) ---------- */
const GC_SITE = "https://369shoter.goatcounter.com";
const STATS_DAYS = [7, 30, 90];
const GC_GAP_MS = 300;                      // GoatCounter limituje API do ok. 4 zapytan na sekunde

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanText = (v, n = 80) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, n);
const count = (v) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
const isoHour = (d) => d.toISOString().replace(/\.\d+Z$/, "Z");
const dayStr = (d) => d.toISOString().slice(0, 10);
const byCount = (a, b) => b.count - a.count;

async function gcGet(env, path, params) {
  const url = (env.GOATCOUNTER_URL || GC_SITE) + "/api/v0" + path + "?" + new URLSearchParams(params);
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers: { authorization: "Bearer " + env.GOATCOUNTER_TOKEN, accept: "application/json" } });
    if (r.status === 429) { await sleep(1100); continue; }
    if (r.status === 401 || r.status === 403) throw new Error("gc-auth");
    if (!r.ok) throw new Error("gc-" + r.status);
    return r.json();
  }
  throw new Error("gc-429");
}

async function collectStats(env, days) {
  const now = Date.now();
  const first = new Date(now - (days - 1) * 86400e3);
  first.setUTCHours(0, 0, 0, 0);
  const range = { start: isoHour(first), end: isoHour(new Date(Math.ceil(now / 3600e3) * 3600e3)) };

  const hits = await gcGet(env, "/stats/hits", { ...range, limit: 100, group: "day" });
  const pages = [], clicks = [], perDay = new Map();
  for (const h of Array.isArray(hits.hits) ? hits.hits : []) {
    if (!isObj(h)) continue;
    const item = { name: cleanText(h.title) || cleanText(h.path), path: cleanText(h.path, 120), count: count(h.count) };
    if (h.event) { clicks.push(item); continue; }
    pages.push(item);
    for (const s of Array.isArray(h.stats) ? h.stats : []) {
      if (isObj(s) && typeof s.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.day)) perDay.set(s.day, (perDay.get(s.day) || 0) + count(s.daily));
    }
  }

  // Wszystkie dni z zakresu (takze te bez odwiedzin), najnowszy na koncu.
  const daily = [];
  for (let i = 0; i < days; i++) {
    const d = dayStr(new Date(first.getTime() + i * 86400e3));
    daily.push({ day: d, count: perDay.get(d) || 0 });
    perDay.delete(d);
  }
  for (const [day, c] of perDay) daily.push({ day, count: c }); // dni w innej strefie czasowej niz UTC
  daily.sort((a, b) => (a.day < b.day ? -1 : 1));
  const shown = daily.slice(-days);

  // Listy dodatkowe: gdy ich pobranie sie nie uda, panel po prostu pokaze pusta liste (poza bledem klucza).
  const list = async (page) => {
    await sleep(GC_GAP_MS);
    try {
      const j = await gcGet(env, "/stats/" + page, { ...range, limit: 10 });
      return (Array.isArray(j.stats) ? j.stats : []).filter(isObj).slice(0, 10)
        .map((s) => ({ name: cleanText(s.name) || "(brak)", id: cleanText(s.id, 10), count: count(s.count) })).sort(byCount);
    } catch (e) { if (e.message === "gc-auth") throw e; return []; }
  };
  const refs = await list("toprefs");
  const countries = await list("locations");
  const devices = await list("sizes");

  return {
    days,
    from: shown.length ? shown[0].day : dayStr(first),
    visitors: pages.reduce((n, p) => n + p.count, 0),
    today: shown.length ? shown[shown.length - 1].count : 0,
    daily: shown,
    pages: pages.sort(byCount).slice(0, 10),
    clicks: clicks.sort(byCount).slice(0, 25),
    refs,
    countries,
    devices,
  };
}

async function handleStats(request, env) {
  if (!env.GOATCOUNTER_TOKEN) {
    return reply(env, { error: "Statystyki nie są jeszcze włączone. Dodaj sekret GOATCOUNTER_TOKEN w Cloudflare (instrukcja w worker/README.md).", setup: true }, 501);
  }
  const days = Number(new URL(request.url).searchParams.get("days") || 30);
  if (!STATS_DAYS.includes(days)) return reply(env, { error: "days: 7, 30 albo 90." }, 400);
  try {
    return reply(env, await collectStats(env, days));
  } catch (e) {
    if (e.message === "gc-auth") return reply(env, { error: "GoatCounter odrzucił klucz. Sprawdź, czy token ma uprawnienie „Read statistics” i czy jest z konta 369shoter." }, 502);
    return reply(env, { error: "Nie udało się pobrać statystyk z GoatCountera." }, 502);
  }
}

/* ---------- Dane z TikToka na zywo (GET /live, publiczne, bez logowania) ----------
   Strona pyta o to przy kazdym wejsciu, dzieki czemu nowy klip, opis i liczby widac od razu, bez czekania na publikacje.
   Worker czyta ten sam publiczny embed profilu co scripts/update_tiktok.py i oddaje z niego tylko to, co potrzebne stronie.
   Odpowiedz jest trzymana LIVE_TTL_S sekund (w pamieci Workera i w cache Cloudflare), wiec TikTok dostaje co najwyzej
   jedno zapytanie na minute z jednego centrum danych, niezaleznie od liczby odwiedzin. Adres jest staly, nic z zewnatrz
   nie trafia do zapytania. Gdy TikTok nie odpowie, strona zostaje przy danych z ostatniej publikacji. */
const TT_EMBED = "https://www.tiktok.com/embed/@369_shoter";
const TT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const LIVE_TTL_S = 60;
const LIVE_FAIL_TTL_S = 20;                 // po nieudanym pobraniu chwile odczekujemy, zeby nie zasypywac TikToka
const LIVE_CACHE_KEY = "https://live.internal/369shoter/tiktok";
const LIVE_MAX_VIDEOS = 30;
const CDN_HOST = /(^|\.)tiktokcdn(-[a-z]+)?\.com$/;

let liveMem = null; // { until, ok, body }: pamiec podreczna tej instancji Workera

/* Tak samo jak clean_title() w scripts/update_tiktok.py: bez #hasztagow, bez zbednych spacji, KRZYCZENIE -> zwykle zdanie. */
function liveTitle(desc) {
  let t = String(desc == null ? "" : desc).replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim();
  const letters = [...t].filter((c) => c.toLowerCase() !== c.toUpperCase());
  if (letters.length && letters.filter((c) => c === c.toUpperCase()).length / letters.length > 0.7) {
    t = t.toLowerCase();
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  return cleanText(t, 120) || "Film";
}

function coverUrl(v) {
  const u = typeof v.originCoverUrl === "string" && v.originCoverUrl ? v.originCoverUrl : v.coverUrl;
  try {
    const p = new URL(u);
    return p.protocol === "https:" && CDN_HOST.test(p.hostname) ? p.href : "";
  } catch (_) { return ""; }
}

function parseLive(html) {
  const m = html.match(/<script id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("brak-danych");
  const state = JSON.parse(m[1]);

  let stats = null;
  const found = new Map();
  const stack = [state];
  for (let n = 0; stack.length && n < 200000; n++) {
    const node = stack.pop();
    if (Array.isArray(node)) { for (const x of node) stack.push(x); continue; }
    if (!isObj(node)) continue;
    if (!stats && Number.isInteger(node.followerCount) && node.followerCount > 0) {
      const likes = node.heartCount != null ? node.heartCount : node.heart;
      stats = { followers: node.followerCount, likes: Number.isInteger(likes) && likes >= 0 ? likes : 0 };
    }
    if ("playCount" in node && "id" in node && node.privateItem !== true) {
      const id = String(node.id);
      if (ID_RE.test(id)) {
        const views = Number(node.playCount);
        found.set(id, { id, title: liveTitle(node.desc), views: Number.isFinite(views) && views >= 0 ? Math.round(views) : 0, cover: coverUrl(node) });
      }
    }
    for (const k in node) if (isObj(node[k]) || Array.isArray(node[k])) stack.push(node[k]);
  }
  const videos = [...found.values()].sort((a, b) => (b.id.length - a.id.length) || (a.id < b.id ? 1 : -1)).slice(0, LIVE_MAX_VIDEOS);
  if (!stats && !videos.length) throw new Error("pusto");
  return { ok: true, at: Date.now(), stats, videos };
}

async function fetchLive(env) {
  const r = await fetch(env.TIKTOK_EMBED_URL || TT_EMBED, {
    headers: { "user-agent": TT_UA, "accept-language": "pl,en;q=0.8", accept: "text/html" },
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error("tiktok-" + r.status);
  const html = await r.text();
  if (html.length > 5e6) throw new Error("za-duze");
  return parseLive(html);
}

async function handleLive(env, ctx) {
  const now = Date.now();
  let entry = liveMem && liveMem.until > now ? liveMem : null;
  let source = "memory";

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(LIVE_CACHE_KEY);
  if (!entry && cache) {
    try {
      const hit = await cache.match(key);
      if (hit) {
        const j = await hit.json();
        entry = { until: now + 5000, ok: j.ok === true, body: j }; // z cache Cloudflare: krotko trzymamy tez w pamieci
        source = "cache";
      }
    } catch (_) { /* cache jest dodatkiem */ }
  }

  if (!entry) {
    source = "fresh";
    let ok = true;
    let body;
    try { body = await fetchLive(env); } catch (_) { ok = false; body = { ok: false }; }
    const ttl = ok ? LIVE_TTL_S : LIVE_FAIL_TTL_S;
    entry = { until: now + ttl * 1000, ok, body };
    liveMem = entry;
    if (cache) {
      const put = cache.put(key, new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json", "cache-control": "public, max-age=" + ttl },
      })).catch(() => {});
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(put); else await put;
    }
  }
  return reply(env, entry.body, entry.ok ? 200 : 502, { "x-live-source": source });
}

/* ---------- start i konfiguracja ---------- */
function configError(env) {
  const missing = ["ADMIN_PASSWORD", "SESSION_SECRET", "GITHUB_TOKEN"].filter((k) => !env[k]);
  if (!env.KV) missing.push("KV (powiązanie)");
  if (missing.length) return "Brakuje ustawień w Cloudflare: " + missing.join(", ") + ".";
  if (env.ADMIN_PASSWORD.length < 5) return "ADMIN_PASSWORD jest za krótkie (minimum 5 znaków).";
  if (env.SESSION_SECRET.length < 32) return "SESSION_SECRET jest za krótki (minimum 32 znaki).";
  if (env.TOTP_SECRET && base32Decode(env.TOTP_SECRET).length < 10) return "TOTP_SECRET jest nieprawidłowy.";
  return "";
}

async function handleLogin(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (await isLocked(env, ip)) {
    return reply(env, { error: "Za dużo nieudanych prób. Spróbuj ponownie za kilkanaście minut." }, 429, { "retry-after": String(IP_WINDOW_S) });
  }
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 2048) throw new Error("za duze");
    body = JSON.parse(raw);
  } catch (_) { return reply(env, { error: "Nieprawidłowe żądanie." }, 400); }
  if (!isObj(body)) return reply(env, { error: "Nieprawidłowe żądanie." }, 400);
  const password = typeof body.password === "string" ? body.password : "";
  const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";

  const started = Date.now();
  const passOk = await safeEqual(password, env.ADMIN_PASSWORD, env.SESSION_SECRET);
  let totpStep = null;
  let codeOk = true;
  if (env.TOTP_SECRET) {
    totpStep = /^\d{6}$/.test(code) ? await matchTotp(env, code) : null;
    const last = Number(await env.KV.get("totp:last")) || 0;
    codeOk = totpStep !== null && totpStep > last; // ten sam kod nie zadziala drugi raz
  }

  if (!(passOk && codeOk)) {
    await registerFail(env, ip);
    const wait = FAIL_DELAY_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return reply(env, { error: "Nieprawidłowe dane logowania." }, 401);
  }
  if (totpStep !== null) await env.KV.put("totp:last", String(totpStep), { expirationTtl: 600 });
  await env.KV.delete("fail:ip:" + ip);
  return reply(env, { token: await signSession(env), expiresIn: SESSION_TTL_S });
}

async function handleOverrides(request, env) {
  if (request.method === "GET") {
    try { return reply(env, await readFile(env)); } catch (e) { return reply(env, { error: "Nie udało się odczytać ustawień z GitHuba." }, 502); }
  }
  // PUT
  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return reply(env, { error: "Za duże żądanie." }, 413);
    body = JSON.parse(raw);
  } catch (_) { return reply(env, { error: "Nieprawidłowe żądanie." }, 400); }
  if (!isObj(body)) return reply(env, { error: "Nieprawidłowe żądanie." }, 400);
  const checked = validateOverrides(body.overrides);
  if (checked.error) return reply(env, { error: checked.error }, 400);

  try {
    let sha = typeof body.sha === "string" ? body.sha : null;
    if (!("sha" in body)) sha = (await readFile(env)).sha;
    const put = await gh(env, `/repos/${REPO}/contents/${FILE}`, {
      method: "PUT",
      body: JSON.stringify({ message: "Panel admina: aktualizacja ustawień", content: b64Encode(serialize(checked.value)), branch: BRANCH, ...(sha ? { sha } : {}) }),
    });
    if (put.status === 409 || put.status === 422) return reply(env, { error: "conflict" }, 409);
    if (!put.ok) return reply(env, { error: "GitHub odrzucił zapis (" + put.status + "). Sprawdź uprawnienia GITHUB_TOKEN." }, 502);
    const j = await put.json();
    return reply(env, { ok: true, sha: j.content && j.content.sha });
  } catch (_) { return reply(env, { error: "Nie udało się zapisać w GitHubie." }, 502); }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: baseHeaders(env) });
    if (request.headers.get("origin") !== allowedOrigin(env)) return reply(env, { error: "Zabronione." }, 403);

    // publiczne dane z TikToka: nie wymagaja hasla ani zadnych sekretow
    if (url.pathname === "/live" && request.method === "GET") return handleLive(env, ctx);

    const err = configError(env);
    if (err) return reply(env, { error: err }, 500);

    if (url.pathname === "/health" && request.method === "GET") return reply(env, { ok: true, totp: !!env.TOTP_SECRET });
    if (url.pathname === "/login" && request.method === "POST") return handleLogin(request, env);
    if (url.pathname === "/overrides" && (request.method === "GET" || request.method === "PUT")) {
      if (!(await verifySession(env, request))) return reply(env, { error: "Sesja wygasła. Zaloguj się ponownie." }, 401);
      return handleOverrides(request, env);
    }
    if (url.pathname === "/stats" && request.method === "GET") {
      if (!(await verifySession(env, request))) return reply(env, { error: "Sesja wygasła. Zaloguj się ponownie." }, 401);
      return handleStats(request, env);
    }
    return reply(env, { error: "Nie znaleziono." }, 404);
  },
};
