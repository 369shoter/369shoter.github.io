/* Panel admina 369_shoter.
   Logowanie: haslo + kod 2FA, sprawdzane przez serwer w Cloudflare (worker/admin-api.js). Token GitHub jest tylko
   tam, w sekretach Cloudflare, a nie w przegladarce. Przegladarka dostaje krotka sesje (20 min), trzymana wylacznie
   w pamieci karty. Strona ma restrykcyjne CSP (patrz index.html: laczy sie tylko z tym jednym Workerem), nie uzywa
   innerHTML i nie da sie jej wyswietlic w ramce. Kazda zmiane sprawdza jeszcze raz Worker i strona publiczna. */
(() => {
  "use strict";

  // Ochrona przed clickjackingiem: w ramce panel sie nie wyswietli.
  if (window.top !== window.self) {
    document.documentElement.textContent = "Ta strona nie może być wyświetlana w ramce.";
    throw new Error("framed");
  }
  document.documentElement.classList.add("unframed");

  // Adres Workera z Cloudflare. Ten sam adres musi byc w connect-src w admin/index.html.
  const WORKER = "https://369-panel.369shoter.workers.dev";
  const IDLE_MS = 10 * 60 * 1000;

  const CFG = window.SITE_CONFIG || {};
  const KNOWN = (window.TIKTOK_DATA && window.TIKTOK_DATA.videos) || [];

  const $ = (id) => document.getElementById(id);
  const on = (node, ev, fn) => node.addEventListener(ev, fn);

  let token = "";        // sesja z Workera, tylko w pamieci
  let fileSha = null;    // wersja pliku na GitHubie (do wykrywania konfliktow)
  let extra = [];        // dodatkowe filmy: [{id, title}]
  let hidden = new Set();
  let idleTimer = 0;
  let expireTimer = 0;   // koniec sesji Workera (ustala serwer)

  /* ---------- pomocnicze ---------- */
  function showError(node, msg) { node.textContent = msg; node.hidden = !msg; }
  function setStatus(msg) { $("status").textContent = msg || ""; }

  const isHttps = (v) => { try { return new URL(v).protocol === "https:"; } catch (_) { return false; } };
  const parseVideoId = (input) => {
    const s = String(input || "").trim();
    if (/^\d{15,25}$/.test(s)) return s;
    const m = s.match(/tiktok\.com\/@[\w.\-]+\/video\/(\d{15,25})/i);
    return m ? m[1] : null;
  };

  class Conflict extends Error {}  // ktos zmienil ustawienia w miedzyczasie
  class Expired extends Error {}   // sesja wygasla lub zostala cofnieta

  /* ---------- serwer logowania i zapisu (Worker) ---------- */
  async function workerCall(method, path, body) {
    let res;
    try {
      res = await fetch(WORKER + path, {
        method,
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (_) {
      throw new Error("Nie można połączyć się z serwerem logowania. Sprawdź internet i spróbuj ponownie.");
    }
    let json = {};
    try { json = await res.json(); } catch (_) { /* pusta odpowiedz */ }
    return { res, json: json && typeof json === "object" ? json : {} };
  }
  const serverMsg = (json, fallback) => (typeof json.error === "string" && json.error ? json.error.slice(0, 200) : fallback);

  const backend = {
    async login({ password, code }) {
      const { res, json } = await workerCall("POST", "/login", { password, code });
      if (!res.ok || typeof json.token !== "string") throw new Error(serverMsg(json, "Serwer logowania odpowiedział błędem " + res.status + "."));
      token = json.token;
      startExpiry(json.expiresIn);
      return this.load();
    },
    async load() {
      const { res, json } = await workerCall("GET", "/overrides");
      if (res.status === 401) throw new Expired();
      if (!res.ok) throw new Error(serverMsg(json, "Nie udało się wczytać ustawień (" + res.status + ")."));
      fileSha = typeof json.sha === "string" ? json.sha : null;
      const o = json.overrides;
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    },
    async save(data) {
      const { res, json } = await workerCall("PUT", "/overrides", { overrides: data, sha: fileSha });
      if (res.status === 401) throw new Expired();
      if (res.status === 409) throw new Conflict();
      if (!res.ok) throw new Error(serverMsg(json, "Nie udało się zapisać (" + res.status + ")."));
      if (typeof json.sha === "string") fileSha = json.sha;
    },
    async history() {
      const { res, json } = await workerCall("GET", "/history");
      if (res.status === 401) throw new Expired();
      if (res.status === 404) throw new Error("Serwer logowania w Cloudflare ma starszą wersję kodu bez historii obserwujących. Wgraj najnowszy plik worker/admin-api.js (Edit code -> Deploy), instrukcja w worker/README.md.");
      if (!res.ok) throw new Error(serverMsg(json, "Nie udało się pobrać historii (" + res.status + ")."));
      return json;
    },
    async stats(days) {
      const { res, json } = await workerCall("GET", "/stats?days=" + days);
      if (res.status === 401) throw new Expired();
      if (res.status === 404) throw new Error("Serwer logowania w Cloudflare ma starszą wersję kodu bez statystyk. Wgraj najnowszy plik worker/admin-api.js (Edit code -> Deploy), instrukcja w worker/README.md.");
      if (!res.ok) {
        const e = new Error(serverMsg(json, "Nie udało się pobrać statystyk (" + res.status + ")."));
        e.setup = res.status === 501;  // Worker nie ma jeszcze klucza GoatCountera
        throw e;
      }
      return json;
    },
  };

  /* ---------- sesja ---------- */
  let sessionUntil = 0;
  const clockText = (ms) => new Date(ms).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  const loggedStatus = () => "Zalogowano" + (sessionUntil ? " (sesja do " + clockText(sessionUntil) + ")" : "");

  function startExpiry(seconds) {
    clearTimeout(expireTimer);
    const s = Number(seconds);
    if (!(s > 10)) return;
    sessionUntil = Date.now() + s * 1000;
    expireTimer = setTimeout(() => lock("Sesja wygasła (limit czasu). Zaloguj się ponownie."), (s - 5) * 1000);
  }

  function clearInputs() {
    ["w-pass", "w-code"].forEach((id) => { $(id).value = ""; });
  }

  function lock(msg) {
    token = "";
    fileSha = null;
    sessionUntil = 0;
    clearInputs();
    statsSeq++;
    $("stats").hidden = true;
    $("stats-body").hidden = true;
    growthSeq++;
    growthPoints = [];
    $("growth").hidden = true;
    $("growth-body").hidden = true;
    $("editor").hidden = true;
    $("login").hidden = false;
    $("logout").hidden = true;
    clearTimeout(idleTimer);
    clearTimeout(expireTimer);
    setStatus("");
    showError($("login-error"), msg || "");
  }
  function touch() {
    if (!token) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => lock("Sesja wygasła po 10 minutach bezczynności. Zaloguj się ponownie."), IDLE_MS);
  }

  /* ---------- statystyki (dane z GoatCountera pobiera Worker) ---------- */
  const SVG_NS = "http://www.w3.org/2000/svg";
  const nf = (n) => Number(n || 0).toLocaleString("pl-PL", { useGrouping: "always" }); // "4 072", nie "4072" (pl domyslnie nie grupuje 4 cyfr)
  const int = (v) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
  const str = (v, n = 80) => (typeof v === "string" ? v.slice(0, n) : "");
  const rows = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
  let statsSeq = 0;      // odrzuca spozniona odpowiedz, gdy uzytkownik zdazyl zmienic zakres albo sie wylogowac

  const DEVICES_PL = { Phones: "Telefony", "Large phones": "Duże telefony", Tablets: "Tablety", "Computer monitors": "Komputery", "Larger monitors": "Duże monitory", "(unknown)": "Nieznane" };
  let regionNames = null;
  try { regionNames = new Intl.DisplayNames(["pl"], { type: "region" }); } catch (_) { /* starsza przegladarka: zostaja nazwy z GoatCountera */ }
  const countryName = (r) => {
    const id = str(r.id, 10).toUpperCase();
    if (regionNames && /^[A-Z]{2}$/.test(id)) { try { return regionNames.of(id) || str(r.name); } catch (_) { /* nieznany kod */ } }
    return str(r.name) || "Nieznany";
  };
  function clickLabel(c) {
    const path = str(c.path, 120), name = str(c.name, 100);
    if (path.startsWith("film/")) {
      const v = knownVideos().find((x) => x.id === path.slice(5));
      return v && v.title ? "Film: " + v.title : name && name !== path ? name : "Film " + path.slice(5);
    }
    return name && name !== path ? name : path.replace(/^klik\//, "");
  }

  function fillBars(ul, list, emptyText) {
    ul.replaceChildren();
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "adm-empty";
      li.textContent = emptyText;
      ul.append(li);
      return;
    }
    const max = Math.max(1, ...list.map((r) => r.count));
    list.forEach((r) => {
      const li = document.createElement("li");
      li.className = "adm-bar-row";
      const label = document.createElement("span");
      label.className = "adm-bar-label";
      label.textContent = r.label;
      const num = document.createElement("span");
      num.className = "adm-bar-num";
      num.textContent = nf(r.count);
      const fill = document.createElement("span");
      fill.className = "adm-bar-fill";
      fill.style.setProperty("--w", Math.max(2, Math.round((r.count / max) * 100)) + "%");
      li.append(label, num, fill);
      ul.append(li);
    });
  }

  function drawChart(daily) {
    const box = $("stats-chart");
    box.replaceChildren();
    if (!daily.length) { $("stats-axis").textContent = ""; return; }
    const W = 300, H = 90, n = daily.length, bw = W / n, gap = n > 45 ? 0.6 : 1.6;
    const max = Math.max(0, ...daily.map((d) => d.count));
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("class", "adm-chart-svg");
    daily.forEach((d, i) => {
      const h = d.count ? Math.max(2, (d.count / max) * (H - 4)) : 1;
      const r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", (i * bw + gap / 2).toFixed(2));
      r.setAttribute("y", (H - h).toFixed(2));
      r.setAttribute("width", Math.max(0.5, bw - gap).toFixed(2));
      r.setAttribute("height", h.toFixed(2));
      r.setAttribute("class", d.count ? "adm-bar" : "adm-bar adm-bar-zero");
      const t = document.createElementNS(SVG_NS, "title");
      t.textContent = d.day + ": " + nf(d.count);
      r.append(t);
      svg.append(r);
    });
    box.append(svg);
    $("stats-axis").textContent = daily[0].day + " → " + daily[n - 1].day + ", najwięcej w jeden dzień: " + nf(max);
  }

  function renderStats(data) {
    const daily = rows(data.daily).map((d) => ({ day: str(d.day, 10), count: int(d.count) }));
    const clicks = rows(data.clicks).map((c) => ({ path: str(c.path, 120), label: clickLabel(c), count: int(c.count) }));
    const film = clicks.filter((c) => c.path.startsWith("film/")).reduce((n, c) => n + c.count, 0);
    const links = clicks.filter((c) => !c.path.startsWith("film/")).reduce((n, c) => n + c.count, 0);
    const visitors = int(data.visitors);

    $("kpi-visitors").textContent = nf(visitors);
    $("kpi-today").textContent = nf(int(data.today));
    $("kpi-links").textContent = nf(links);
    $("kpi-films").textContent = nf(film);
    $("stats-empty").hidden = visitors > 0 || clicks.length > 0;
    drawChart(daily);
    fillBars($("stats-clicks"), clicks, "Jeszcze nikt niczego nie kliknął.");
    fillBars($("stats-refs"), rows(data.refs).map((r) => ({ label: str(r.name) === "(brak)" ? "Wejście bezpośrednie lub bez źródła" : str(r.name) || "Bezpośrednio", count: int(r.count) })), "Brak danych.");
    fillBars($("stats-countries"), rows(data.countries).map((r) => ({ label: countryName(r), count: int(r.count) })), "Brak danych.");
    fillBars($("stats-devices"), rows(data.devices).map((r) => ({ label: DEVICES_PL[str(r.name)] || str(r.name), count: int(r.count) })), "Brak danych.");
  }

  async function loadStats(days) {
    const seq = ++statsSeq;
    document.querySelectorAll("[data-days]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.days) === days)));
    showError($("stats-error"), "");
    $("stats-setup").hidden = true;
    $("stats-status").textContent = "Ładuję…";
    try {
      const data = await backend.stats(days);
      if (seq !== statsSeq || !token) return;
      renderStats(data);
      $("stats-body").hidden = false;
    } catch (e) {
      if (seq !== statsSeq || !token) return;
      if (e instanceof Expired) return lock("Sesja wygasła. Zaloguj się ponownie.");
      $("stats-body").hidden = true;
      if (e.setup) $("stats-setup").hidden = false;
      else showError($("stats-error"), e.message || "Nie udało się pobrać statystyk.");
    } finally {
      if (seq === statsSeq) $("stats-status").textContent = "";
    }
  }
  const currentDays = () => {
    const b = document.querySelector("[data-days][aria-pressed=true]");
    return b ? Number(b.dataset.days) : 30;
  };

  /* ---------- wzrost obserwujacych (historia zapisana przez Workera) ----------
     Linia z wypelnieniem, celownik z dymkiem (mysz, dotyk i strzalki na klawiaturze) i tabela z wartosciami. */
  let growthSeq = 0;
  let growthPoints = [];     // [{t (sekundy), followers, likes}] od najstarszego
  let growthView = null;     // to, co jest teraz narysowane: { pts, x, y } (pozycje 0..1)
  let growthIdx = -1;

  const sgn = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + nf(Math.abs(n));
  const dayText = (sec) => new Date(sec * 1000).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });
  const whenText = (sec) => new Date(sec * 1000).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const growthDays = () => {
    const b = document.querySelector("[data-gdays][aria-pressed=true]");
    return b ? Number(b.dataset.gdays) : 30;
  };
  const svgEl = (name, attrs) => {
    const n = document.createElementNS(SVG_NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  function renderGrowth() {
    const all = growthPoints;
    const hasLine = all.length >= 2;
    $("growth-empty").hidden = hasLine;
    $("growth-chart").hidden = !all.length;
    $("growth-axis").hidden = !all.length;
    hideTip();
    growthView = null;
    $("growth-plot").replaceChildren();
    $("growth-rows").replaceChildren();
    ["growth-ymax", "growth-ymin"].forEach((id) => { $(id).textContent = ""; });
    if (!all.length) {
      ["g-now", "g-delta", "g-likes", "g-likes-delta"].forEach((id) => { $(id).textContent = "–"; });
      $("g-delta-label").textContent = "Zmiana w tym okresie";
      return;
    }

    const last = all[all.length - 1];
    const days = growthDays();
    const from = last.t - days * 86400;
    const pts = all.filter((p) => p.t >= from);
    const before = all.filter((p) => p.t < from).pop();
    const base = before || pts[0];

    $("g-now").textContent = nf(last.followers);
    $("g-likes").textContent = nf(last.likes);
    const d = last.followers - base.followers, dl = last.likes - base.likes;
    $("g-delta").textContent = sgn(d);
    $("g-delta").classList.toggle("adm-delta-up", d > 0);
    $("g-likes-delta").textContent = sgn(dl);
    $("g-likes-delta").classList.toggle("adm-delta-up", dl > 0);
    $("g-delta-label").textContent = before ? "Zmiana w ciągu " + days + " dni" : "Zmiana od " + dayText(pts[0].t) + " (tyle jest danych)";

    // tabela: ostatnia wartosc z kazdego dnia, najnowsze na gorze
    const perDay = new Map();
    pts.forEach((p) => perDay.set(new Date(p.t * 1000).toLocaleDateString("sv-SE"), p));
    [...perDay.entries()].reverse().forEach(([day, p]) => {
      const tr = document.createElement("tr");
      [day, nf(p.followers), nf(p.likes)].forEach((text) => { const td = document.createElement("td"); td.textContent = text; tr.append(td); });
      $("growth-rows").append(tr);
    });

    if (!hasLine || pts.length < 2) {
      $("growth-axis").textContent = "Pierwszy zapis: " + whenText(all[0].t) + ".";
      return;
    }

    const t0 = pts[0].t, t1 = last.t;
    const vals = pts.map((p) => p.followers);
    const vmin = Math.min(...vals), vmax = Math.max(...vals);
    const pad = (vmax - vmin || 1) * 0.1;
    const lo = vmin - pad, hi = vmax + pad;
    const W = 300, H = 100;
    const X = (t) => (t1 === t0 ? 0 : (t - t0) / (t1 - t0));
    const Y = (v) => 1 - (v - lo) / (hi - lo);
    const line = pts.map((p, i) => (i ? "L" : "M") + (X(p.t) * W).toFixed(2) + "," + (Y(p.followers) * H).toFixed(2)).join(" ");
    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", "aria-hidden": "true" });
    [vmax, vmin].forEach((v) => {
      const y = (Y(v) * H).toFixed(2);
      svg.append(svgEl("line", { class: "adm-grid", x1: 0, x2: W, y1: y, y2: y }));
    });
    svg.append(svgEl("path", { class: "adm-area", d: line + " L" + W + "," + H + " L0," + H + " Z" }));
    svg.append(svgEl("path", { class: "adm-line", d: line }));
    $("growth-plot").append(svg);

    growthView = { pts, x: pts.map((p) => X(p.t)), y: pts.map((p) => Y(p.followers)) };
    $("growth-ymax").textContent = nf(vmax);
    $("growth-ymin").textContent = nf(vmin);
    const plotH = $("growth-plot").clientHeight;
    if (plotH) {
      $("growth-ymax").style.top = Math.max(0, 14 + Y(vmax) * plotH - 9) + "px";
      $("growth-ymin").style.top = "auto";
      $("growth-ymin").style.bottom = Math.max(0, 14 + (1 - Y(vmin)) * plotH - 9) + "px";
    }
    $("growth-axis").textContent = whenText(t0) + " → " + whenText(t1) + ", zakres " + nf(vmin) + " – " + nf(vmax);
  }

  function hideTip() {
    growthIdx = -1;
    $("growth-cross").hidden = true;
    $("growth-tip").hidden = true;
  }

  function showTip(i) {
    if (!growthView) return;
    i = Math.max(0, Math.min(growthView.pts.length - 1, i));
    growthIdx = i;
    const p = growthView.pts[i];
    const box = $("growth-chart"), plot = $("growth-plot");
    const left = plot.offsetLeft + growthView.x[i] * plot.clientWidth;
    const cross = $("growth-cross");
    cross.hidden = false;
    cross.style.left = left + "px";
    cross.querySelector(".adm-dot").style.top = growthView.y[i] * 100 + "%";
    $("growth-tip-value").textContent = nf(p.followers) + " obserwujących";
    $("growth-tip-when").textContent = whenText(p.t);
    $("growth-tip-likes").textContent = nf(p.likes) + " polubień";
    const tip = $("growth-tip");
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = Math.max(6, Math.min(box.clientWidth - w - 6, left + 12 > box.clientWidth - w - 6 ? left - w - 12 : left + 12)) + "px";
  }

  function bindGrowthHover() {
    const box = $("growth-chart");
    const nearest = (clientX) => {
      if (!growthView) return -1;
      const plot = $("growth-plot").getBoundingClientRect();
      const rel = (clientX - plot.left) / (plot.width || 1);
      let best = 0, dist = Infinity;
      growthView.x.forEach((x, i) => { const dd = Math.abs(x - rel); if (dd < dist) { dist = dd; best = i; } });
      return best;
    };
    on(box, "pointermove", (e) => { const i = nearest(e.clientX); if (i >= 0) showTip(i); });
    on(box, "pointerdown", (e) => { const i = nearest(e.clientX); if (i >= 0) showTip(i); });
    on(box, "pointerleave", (e) => { if (e.pointerType !== "touch" && document.activeElement !== box) hideTip(); });
    on(box, "focus", () => { if (growthView) showTip(growthView.pts.length - 1); });
    on(box, "blur", hideTip);
    on(box, "keydown", (e) => {
      if (!growthView) return;
      const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      if (e.key === "Home") { e.preventDefault(); showTip(0); }
      else if (e.key === "End") { e.preventDefault(); showTip(growthView.pts.length - 1); }
      else if (step) { e.preventDefault(); showTip((growthIdx < 0 ? growthView.pts.length - 1 : growthIdx) + step); }
      else if (e.key === "Escape") hideTip();
    });
  }

  async function loadGrowth() {
    const seq = ++growthSeq;
    showError($("growth-error"), "");
    $("growth-status").textContent = "Ładuję…";
    try {
      const data = await backend.history();
      if (seq !== growthSeq || !token) return;
      growthPoints = rows(data.points)
        .map((p) => ({ t: int(p.t), followers: int(p.followers), likes: int(p.likes) }))
        .filter((p) => p.t > 0 && p.followers > 0)
        .sort((a, b) => a.t - b.t);
      renderGrowth();
      $("growth-body").hidden = false;
    } catch (e) {
      if (seq !== growthSeq || !token) return;
      if (e instanceof Expired) return lock("Sesja wygasła. Zaloguj się ponownie.");
      $("growth-body").hidden = true;
      showError($("growth-error"), e.message || "Nie udało się pobrać historii.");
    } finally {
      if (seq === growthSeq) $("growth-status").textContent = "";
    }
  }

  /* ---------- formularz ---------- */
  const val = (id) => $(id).value.trim();

  function effective(o) {
    const d = CFG.discord || {}, p = CFG.partner || {}, a = CFG.analytics || {};
    const od = o.discord || {}, op = o.partner || {}, oa = o.analytics || {};
    return {
      goatcounter: typeof oa.goatcounter === "string" ? oa.goatcounter : a.goatcounter || "",
      discordUser: typeof od.username === "string" ? od.username : d.username || "",
      discordInvite: typeof od.invite === "string" ? od.invite : d.invite || "",
      email: typeof o.email === "string" ? o.email : CFG.email || "",
      partnerOn: op.enabled === false ? false : op.enabled === true ? true : !!(typeof op.url === "string" ? op.url : p.url),
      partnerLabel: typeof op.label === "string" ? op.label : p.label || "",
      partnerName: typeof op.name === "string" ? op.name : p.name || "",
      partnerUrl: typeof op.url === "string" ? op.url : p.url || "",
      partnerNote: typeof op.note === "string" ? op.note : p.note || "",
      mode: o.videoMode === "tiktok" || o.videoMode === "player" ? o.videoMode : CFG.videoMode || "player",
      top: Number.isInteger(o.topCount) ? o.topCount : CFG.topCount || 6,
      latest: Number.isInteger(o.latestCount) ? o.latestCount : CFG.latestCount || 4,
    };
  }

  function fill(o) {
    const e = effective(o);
    $("f-goatcounter").value = e.goatcounter;
    $("f-discord-user").value = e.discordUser;
    $("f-discord-invite").value = e.discordInvite;
    $("f-email").value = e.email;
    $("f-partner-on").checked = e.partnerOn;
    $("f-partner-label").value = e.partnerLabel;
    $("f-partner-name").value = e.partnerName;
    $("f-partner-url").value = e.partnerUrl;
    $("f-partner-note").value = e.partnerNote;
    $("f-mode").value = e.mode;
    $("f-top").value = e.top;
    $("f-latest").value = e.latest;
    extra = Array.isArray(o.videos)
      ? o.videos.filter((v) => v && parseVideoId(v.id) === v.id).map((v) => ({ id: v.id, title: typeof v.title === "string" ? v.title : "" }))
      : [];
    hidden = new Set(Array.isArray(o.hidden) ? o.hidden.filter((id) => parseVideoId(id) === id) : []);
    renderExtra();
    renderHide();
  }

  function row(text, sub, control) {
    const li = document.createElement("li");
    li.className = "adm-item";
    const box = document.createElement("div");
    box.className = "adm-item-text";
    const t = document.createElement("span");
    t.textContent = text;
    const s = document.createElement("small");
    s.textContent = sub;
    box.append(t, s);
    li.append(box, control);
    return li;
  }

  function renderExtra() {
    const list = $("extra-list");
    list.replaceChildren();
    if (!extra.length) {
      const li = document.createElement("li");
      li.className = "adm-empty";
      li.textContent = "Brak dodanych filmów.";
      list.append(li);
      return;
    }
    extra.forEach((v) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-ghost btn-sm";
      btn.textContent = "Usuń";
      on(btn, "click", () => { extra = extra.filter((x) => x.id !== v.id); renderExtra(); renderHide(); });
      list.append(row(v.title || "Tytuł pobierze się automatycznie", "ID " + v.id, btn));
    });
  }

  function knownVideos() {
    const map = new Map();
    const add = (v) => { if (v && v.id && !map.has(v.id)) map.set(v.id, v); };
    (CFG.videos || []).forEach(add);
    KNOWN.forEach(add);
    extra.forEach((v) => add({ id: v.id, title: v.title }));
    return [...map.values()];
  }

  function renderHide() {
    const list = $("hide-list");
    list.replaceChildren();
    knownVideos().forEach((v) => {
      const label = document.createElement("label");
      label.className = "adm-check";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = hidden.has(v.id);
      on(cb, "change", () => { if (cb.checked) hidden.add(v.id); else hidden.delete(v.id); });
      const span = document.createElement("span");
      span.textContent = "Ukryj";
      label.append(cb, span);
      list.append(row(v.title || "Film " + v.id, "ID " + v.id + (v.views ? " | " + v.views.toLocaleString("pl-PL") + " wyświetleń" : ""), label));
    });
  }

  function addVideo() {
    const err = $("add-error");
    showError(err, "");
    const id = parseVideoId($("new-video-url").value);
    if (!id) return showError(err, "Wklej pełny link do filmu z TikToka (tiktok.com/@konto/video/…). Skrócone linki (vm.tiktok.com) nie działają.");
    if (extra.some((v) => v.id === id)) return showError(err, "Ten film już jest na liście.");
    if (extra.length >= 60) return showError(err, "To za dużo filmów (limit 60).");
    extra.push({ id, title: val("new-video-title").slice(0, 120) });
    $("new-video-url").value = "";
    $("new-video-title").value = "";
    renderExtra();
    renderHide();
  }

  /* Zbiera ustawienia z formularza. Zapisujemy tylko to, co rozni sie od config.js, wiec zmiana w config.js
     nadal dziala tam, gdzie panel niczego nie nadpisal. Zwraca { data } albo { error }. */
  function collect() {
    const d = CFG.discord || {}, p = CFG.partner || {}, a = CFG.analytics || {};
    const gc = val("f-goatcounter");
    if (gc && !/^[a-z0-9-]{2,40}$/.test(gc)) return { error: "Nazwa GoatCounter: 2-40 znaków, małe litery, cyfry i myślniki." };
    const invite = val("f-discord-invite");
    if (invite && !isHttps(invite)) return { error: "Link zaproszenia na Discorda musi zaczynać się od https://." };
    const email = val("f-email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Adres e-mail wygląda nieprawidłowo." };
    const purl = val("f-partner-url");
    if (purl && !isHttps(purl)) return { error: "Adres w bloku na dole musi zaczynać się od https://." };
    const top = Number($("f-top").value), latest = Number($("f-latest").value);
    if (!Number.isInteger(top) || top < 1 || top > 12) return { error: "„Najczęściej oglądane”: liczba od 1 do 12." };
    if (!Number.isInteger(latest) || latest < 1 || latest > 12) return { error: "„Najnowsze”: liczba od 1 do 12." };

    const out = {};
    if (gc !== (a.goatcounter || "")) out.analytics = { goatcounter: gc };
    const discord = {};
    if (val("f-discord-user") !== (d.username || "")) discord.username = val("f-discord-user");
    if (invite !== (d.invite || "")) discord.invite = invite;
    if (Object.keys(discord).length) out.discord = discord;
    if (email !== (CFG.email || "")) out.email = email;

    const partner = {
      enabled: $("f-partner-on").checked, label: val("f-partner-label"), name: val("f-partner-name"), url: purl, note: val("f-partner-note"),
    };
    const pDefault = { enabled: !!p.url, label: p.label || "", name: p.name || "", url: p.url || "", note: p.note || "" };
    if (JSON.stringify(partner) !== JSON.stringify(pDefault)) out.partner = partner;

    if ($("f-mode").value !== (CFG.videoMode || "player")) out.videoMode = $("f-mode").value;
    if (top !== (CFG.topCount || 6)) out.topCount = top;
    if (latest !== (CFG.latestCount || 4)) out.latestCount = latest;
    if (extra.length) out.videos = extra.map((v) => (v.title ? { id: v.id, title: v.title } : { id: v.id }));
    if (hidden.size) out.hidden = [...hidden];
    return { data: out };
  }

  async function save() {
    const err = $("save-error");
    showError(err, "");
    $("save-info").textContent = "";
    const { data, error } = collect();
    if (error) return showError(err, error);

    $("save-btn").disabled = true;
    setStatus("Zapisuję…");
    try {
      await backend.save(data);
      $("save-info").textContent = "Zapisano. Strona zaktualizuje się w ciągu 1-2 minut (możesz odświeżyć ją po chwili).";
    } catch (e) {
      if (e instanceof Expired) return lock("Sesja wygasła, zmiany nie zostały zapisane. Zaloguj się i wprowadź je ponownie.");
      if (e instanceof Conflict) {
        try { fill(await backend.load()); } catch (_) { /* zostaje komunikat ponizej */ }
        return showError(err, "Ustawienia zostały w międzyczasie zmienione gdzie indziej. Wczytałem najnowszą wersję, sprawdź i zapisz ponownie.");
      }
      showError(err, e.message || "Nie udało się zapisać.");
    } finally {
      $("save-btn").disabled = false;
      setStatus(token ? loggedStatus() : "");
    }
  }

  /* ---------- start ---------- */
  async function start(cred) {
    const err = $("login-error");
    const btn = $("wlogin-btn");
    showError(err, "");
    btn.disabled = true;
    setStatus("Loguję…");
    try {
      const overrides = await backend.login(cred);
      fill(overrides);
      $("login").hidden = true;
      $("stats").hidden = false;
      loadStats(currentDays());
      $("growth").hidden = false;
      loadGrowth();
      $("editor").hidden = false;
      $("logout").hidden = false;
      setStatus(loggedStatus());
      touch();
    } catch (e) {
      token = "";
      clearTimeout(expireTimer);
      showError(err, e instanceof Expired ? "Sesja wygasła. Zaloguj się ponownie." : e.message || "Nie udało się zalogować.");
      setStatus("");
    } finally {
      clearInputs();  // haslo i kod nie zostaja w polach ani po udanym, ani po nieudanym logowaniu
      btn.disabled = false;
    }
  }

  on($("wlogin-form"), "submit", (e) => { e.preventDefault(); start({ password: $("w-pass").value, code: $("w-code").value }); });
  // Czy Worker wymaga kodu 2FA? Gdy nie odpowiada, zostawiamy pole i pokazujemy powod.
  workerCall("GET", "/health").then(({ res, json }) => {
    if (res.ok && json.totp === false) { $("w-code-wrap").hidden = true; $("w-no2fa").hidden = false; }
    else if (!res.ok) showError($("login-error"), serverMsg(json, "Serwer logowania zgłasza błąd (" + res.status + ")."));
  }).catch((e) => showError($("login-error"), e.message));
  document.querySelectorAll("[data-days]").forEach((b) => on(b, "click", () => loadStats(Number(b.dataset.days))));
  on($("stats-refresh"), "click", () => loadStats(currentDays()));
  document.querySelectorAll("[data-gdays]").forEach((b) => on(b, "click", () => {
    document.querySelectorAll("[data-gdays]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderGrowth();
  }));
  on($("growth-refresh"), "click", loadGrowth);
  bindGrowthHover();
  {
    const code = CFG.analytics && CFG.analytics.goatcounter;
    if (typeof code === "string" && /^[a-z0-9-]{2,40}$/.test(code)) $("stats-link").href = "https://" + code + ".goatcounter.com";
  }
  on($("editor"), "submit", (e) => { e.preventDefault(); save(); });
  on($("add-video"), "click", addVideo);
  on($("new-video-url"), "keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addVideo(); } });
  on($("logout"), "click", () => lock("Wylogowano."));
  ["pointerdown", "keydown", "input"].forEach((ev) => on(document, ev, touch));
  on(window, "pagehide", () => { token = ""; });
})();
