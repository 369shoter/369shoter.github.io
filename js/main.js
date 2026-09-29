/* 369_shoter - logika strony. Teksty i dane zmieniasz w js/config.js, nie tutaj.
   Dane z TikToka (liczby, lista filmow) odswieza automatycznie scripts/update_tiktok.py
   i trafiaja do data/tiktok.js. */
(() => {
  "use strict";

  const D = window.TIKTOK_DATA || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isExternal = (url) => /^https?:\/\//i.test(url);

  /* ---------- Ustawienia z panelu admina (data/admin.js) ----------
     Panel zapisuje tylko wybrane pola. Kazde jest tu sprawdzane: tylko znane klucze, ograniczona dlugosc,
     adresy wylacznie https. Cokolwiek innego jest ignorowane, wiec zly wpis nie popsuje strony. */
  const check = {
    str: (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : undefined),
    url: (v) => {
      if (typeof v !== "string") return undefined;
      if (!v.trim()) return "";
      try { const u = new URL(v.trim()); return u.protocol === "https:" ? u.href : undefined; } catch (_) { return undefined; }
    },
    int: (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : undefined),
    id: (v) => (typeof v === "string" && /^\d{15,25}$/.test(v) ? v : undefined),
  };

  function withOverrides(base, o) {
    if (!o || typeof o !== "object") return base;
    const out = { ...base };
    const gc = o.analytics && check.str(o.analytics.goatcounter, 40);
    if (typeof gc === "string") out.analytics = { ...(base.analytics || {}), goatcounter: gc };
    if (o.discord && typeof o.discord === "object") {
      const d = { ...(base.discord || {}) };
      const name = check.str(o.discord.username, 40);
      if (name !== undefined) d.username = name;
      const invite = check.url(o.discord.invite);
      if (invite !== undefined) d.invite = invite;
      out.discord = d;
    }
    const email = check.str(o.email, 120);
    if (email !== undefined && (email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) out.email = email;
    if (o.partner && typeof o.partner === "object") {
      const p = { ...(base.partner || {}) };
      for (const k of ["label", "name", "note"]) {
        const s = check.str(o.partner[k], 200);
        if (s !== undefined) p[k] = s;
      }
      const url = check.url(o.partner.url);
      if (url !== undefined) p.url = url;
      if (o.partner.enabled === false) p.url = "";
      out.partner = p;
    }
    if (o.videoMode === "player" || o.videoMode === "tiktok") out.videoMode = o.videoMode;
    const top = check.int(o.topCount, 1, 12);
    if (top !== undefined) out.topCount = top;
    const latest = check.int(o.latestCount, 1, 12);
    if (latest !== undefined) out.latestCount = latest;
    if (Array.isArray(o.videos)) {
      const extra = [];
      for (const v of o.videos.slice(0, 60)) {
        const id = v && check.id(v.id);
        if (!id) continue;
        const item = { id };
        const title = check.str(v.title, 120);
        if (title) item.title = title;
        if (Number.isInteger(v.views) && v.views > 0 && v.views < 1e10) item.views = v.views;
        extra.push(item);
      }
      out.videos = [...(base.videos || []), ...extra];
    }
    if (Array.isArray(o.hidden)) out.hidden = o.hidden.slice(0, 200).map(check.id).filter(Boolean);
    return out;
  }

  const C = withOverrides(window.SITE_CONFIG || {}, window.SITE_OVERRIDES);

  /* Skrocone liczby: 3749 -> "3,7K", 237800 -> "237K". Zawsze w dol, zeby liczba pozostawala prawdziwa. */
  function short(n) {
    if (n >= 1e6) return (Math.floor(n / 1e5) / 10).toString().replace(".", ",") + "M";
    if (n >= 1e5) return Math.floor(n / 1e3) + "K";
    if (n >= 1e3) return (Math.floor(n / 100) / 10).toString().replace(".", ",") + "K";
    return String(n);
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (v !== undefined && v !== null) node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c) node.append(c);
    return node;
  }

  function svgUse(name, cls) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", cls);
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-" + name);
    svg.append(use);
    return svg;
  }
  const icon = (name) => svgUse(name, "icon");

  /* Kopiowanie do schowka: nowe API, a w starszych przegladarkach (np. w aplikacjach) zapasowy sposob.
     Zwraca true, gdy sie udalo. */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* probujemy zapasowo */ }
    const ta = el("textarea", { readonly: "", style: "position:fixed;top:0;left:0;opacity:0" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS
    let done = false;
    try { done = document.execCommand("copy"); } catch (_) { /* brak zgody */ }
    ta.remove();
    return done;
  }

  /* ---------- Linki (TikTok, Instagram, Discord) ---------- */
  const discord = C.discord || {};
  const linkTargets = {
    tiktok: C.tiktok && C.tiktok.url,
    instagram: C.instagram && C.instagram.url,
    youtube: C.youtube && C.youtube.url,
    discord: discord.invite || "#discord",
  };
  document.querySelectorAll("[data-link]").forEach((a) => {
    const url = linkTargets[a.dataset.link];
    if (!url) return;
    a.setAttribute("href", url);
    if (isExternal(url)) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
    else { a.removeAttribute("target"); a.removeAttribute("rel"); }
  });
  document.querySelectorAll("[data-handle]").forEach((n) => {
    const cfg = C[n.dataset.handle];
    if (cfg && cfg.handle) n.textContent = "@" + cfg.handle;
  });

  /* ---------- Discord: zaproszenie albo nick do skopiowania ---------- */
  (function setupDiscord() {
    const handle = $("#discord-handle");
    const copyBtn = $("#discord-copy");
    const hit = $("#discord-hit");
    const arrow = $("#discord-arrow");
    const label = $("#discord-copy-label");
    const online = $("#discord-online");
    if (!handle) return;

    if (discord.invite) {
      handle.textContent = "Dołącz do serwera";
      copyBtn.hidden = true;
      hit.hidden = false;
      arrow.hidden = false;
      hit.setAttribute("href", discord.invite);
    } else {
      handle.textContent = discord.username || "";
      hit.hidden = true;
      copyBtn.hidden = !discord.username;
    }

    if (discord.serverId) {
      fetch("https://discord.com/api/guilds/" + encodeURIComponent(discord.serverId) + "/widget.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && typeof d.presence_count === "number") {
            online.textContent = d.presence_count + " online";
            online.hidden = false;
          }
        })
        .catch(() => {});
    }

    let timer;
    copyBtn.addEventListener("click", async () => {
      const done = await copyText(discord.username || "");
      label.textContent = done ? "Skopiowano" : "Nie udało się";
      copyBtn.classList.toggle("is-done", done);
      clearTimeout(timer);
      timer = setTimeout(() => {
        label.textContent = "Skopiuj nick";
        copyBtn.classList.remove("is-done");
      }, 2000);
    });
  })();

  /* ---------- Filmy: laczymy liste z config.js z danymi z TikToka ---------- */
  const idDesc = (a, b) => (b.id.length - a.id.length) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  const pool = new Map();
  (D.videos || []).forEach((v) => pool.set(v.id, { id: v.id, title: v.title, views: v.views, lqip: v.lqip }));
  (C.videos || []).forEach((v) => {
    const known = pool.get(v.id) || {};
    // tytul z config.js ma pierwszenstwo, liczba wyswietlen: wieksza z dwoch (rosna tylko w gore)
    pool.set(v.id, { ...known, ...v, views: Math.max(known.views || 0, v.views || 0) || undefined });
  });
  (C.hidden || []).forEach((id) => pool.delete(id)); // filmy ukryte w panelu admina
  const allVideos = [...pool.values()];
  const topVideos = allVideos
    .slice()
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, C.topCount || 6);
  const latestVideos = allVideos.slice().sort(idDesc).slice(0, C.latestCount || 4);

  const tiktokBase = (C.tiktok && C.tiktok.url) || "https://www.tiktok.com/";
  const videoUrl = (id) => tiktokBase.replace(/\/$/, "") + "/video/" + id;

  function videoCard(v, list) {
    const title = v.title || "Film";
    const img = el("img", { src: v.cover || "assets/covers/" + v.id + ".webp", alt: "", width: "360", height: "640", loading: "lazy" });
    img.addEventListener("error", () => img.remove(), { once: true });
    const done = () => img.classList.add("is-loaded");
    if (img.complete && img.naturalWidth) done(); else img.addEventListener("load", done, { once: true });
    const media = el("button", { class: "vcard-media", type: "button", "aria-label": "Odtwórz film: " + title, "data-id": v.id, "data-title": title }, [
      img,
      el("span", { class: "play" }, [icon("play")]),
    ]);
    // rozmyty podglad (mikro-miniatura): tylko poprawny obraz webp w data: URI, ktory sami wygenerowalismy
    if (typeof v.lqip === "string" && v.lqip.length < 2500 && /^data:image\/webp;base64,[A-Za-z0-9+\/=]+$/.test(v.lqip)) {
      media.style.setProperty("--lqip", 'url("' + v.lqip + '")');
    }
    media.addEventListener("click", () => openPlayer(v, list));
    return el("article", { class: "vcard" }, [
      media,
      el("h3", { class: "vcard-title", text: title }),
      v.views ? el("p", { class: "vcard-views", text: short(v.views) + " wyświetleń" }) : null,
    ]);
  }

  /* ---------- Statystyki ---------- */
  const live = {
    followers: D.stats && D.stats.followers,
    likes: D.stats && D.stats.likes,
    bestVideo: allVideos.reduce((m, v) => Math.max(m, v.views || 0), 0),
  };
  const statsEl = $("#stats");
  if (statsEl && Array.isArray(C.stats)) {
    C.stats.forEach((s) => {
      const value = (s.source && live[s.source]) || s.value || 0;
      const num = el("span", { class: "num", text: short(value) });
      num.dataset.target = value;
      const dd = el("dd", {}, [num, el("span", { class: "suffix", text: "+" })]);
      statsEl.append(el("div", { class: "stat" }, [el("dt", { text: s.label }), dd]));
    });
  }

  function countUp(node) {
    const target = Number(node.dataset.target);
    const start = performance.now();
    const dur = 1300;
    (function tick(now) {
      const t = Math.max(0, Math.min(1, (now - start) / dur)); // klatka animacji bywa starsza niz start: bez ujemnych liczb
      const eased = 1 - Math.pow(1 - t, 4);
      node.textContent = short(Math.floor(target * eased));
      if (t < 1) requestAnimationFrame(tick);
      else node.textContent = short(target);
    })(start);
  }

  /* ---------- Karuzela "Najczesciej ogladane" ---------- */
  const track = $("#track");
  if (track) {
    topVideos.forEach((v, i) => {
      const card = videoCard(v, topVideos);
      card.setAttribute("data-reveal", "x");
      card.style.setProperty("--d", Math.min(i, 5) * 0.08 + "s");
      track.append(card);
    });
    const more = el("a", { class: "vcard-more", href: tiktokBase, target: "_blank", rel: "noopener" }, [
      svgUse("tiktok", "tile-mark"),
      el("span", { class: "tile-arrow" }, [icon("arrow-up-right")]),
      el("span", { class: "vcard-more-title", text: "Wszystkie filmy" }),
    ]);
    track.append(el("div", { class: "vcard" }, [more]));
  }

  /* Strzalki karuzeli: wylaczane na krancach (IntersectionObserver zamiast nasluchu scrolla) */
  const prev = $("#prev");
  const next = $("#next");
  if (track && prev && next) {
    const step = () => {
      const card = track.querySelector(".vcard");
      return card ? card.getBoundingClientRect().width + 16 : 280;
    };
    const go = (dir) => track.scrollBy({ left: dir * step() * 2, behavior: "smooth" });
    prev.addEventListener("click", () => go(-1));
    next.addEventListener("click", () => go(1));

    if ("IntersectionObserver" in window && track.children.length) {
      const edgeObserver = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          const btn = e.target === track.firstElementChild ? prev : next;
          btn.disabled = e.isIntersecting;
        });
      }, { root: track, threshold: 0.98 });
      edgeObserver.observe(track.firstElementChild);
      edgeObserver.observe(track.lastElementChild);
    }
  }

  /* ---------- Siatka "Najnowsze filmy" ---------- */
  const latestSection = $("#najnowsze");
  const latestGrid = $("#latest-grid");
  if (latestGrid) {
    if (!latestVideos.length) {
      latestSection.hidden = true;
      document.querySelectorAll('a[href="#najnowsze"]').forEach((a) => (a.hidden = true));
    }
    latestVideos.forEach((v, i) => {
      const card = videoCard(v, latestVideos);
      card.setAttribute("data-reveal", "");
      card.style.setProperty("--d", i * 0.07 + "s");
      latestGrid.append(card);
    });
  }

  /* ---------- Hero: okladki losowane sposrod 6 najlepszych filmow ----------
     Przy kazdym wejsciu (i odswiezeniu) losujemy 3 z 6 najczesciej ogladanych. Potem sie nie zmieniaja.
     Klikniecie w okladke otwiera ten film w odtwarzaczu (albo na TikToku, zaleznie od videoMode); lista do przewijania
     zaczyna sie od tej szostki. Jesli filmow jest mniej niz 3, zostaja okladki wpisane na stale w index.html. */
  (function heroCovers() {
    const visual = $(".hero-visual");
    const shots = document.querySelectorAll(".hero-visual .shot");
    if (!visual || shots.length !== 3) return;
    const best = allVideos.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 6);
    if (best.length < 3) return;
    const pick = best.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    shots.forEach((shot, i) => {
      const v = pick[i];
      const img = shot.querySelector("img");
      if (img) img.src = v.cover || "assets/covers/" + v.id + ".webp";
      shot.setAttribute("role", "button");
      shot.setAttribute("tabindex", "0");
      shot.setAttribute("aria-label", "Odtwórz film: " + (v.title || "Film"));
      shot.addEventListener("click", () => openPlayer(v, best));
      shot.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPlayer(v, best); }
      });
    });
    visual.classList.add("is-live");
    visual.removeAttribute("aria-hidden"); // teraz to przyciski, nie sama dekoracja
  })();

  /* ---------- Odtwarzacz filmu ----------
     Okno z filmem z TikToka. Filmy z sekcji, z ktorej je otwarto (i reszta), tworza liste do przewijania:
     na telefonie palcem w gore/dol jak na TikToku, na tablecie i komputerze strzalkami obok filmu albo klawiszami.
     Stuniecie filmu na telefonie to pauza/play (warstwa gestow przykrywa odtwarzacz, z wyjatkiem jego dolnego paska). */
  const dlg = $("#player");
  const stage = $("#player-stage");
  const frame = $("#player-frame");
  const dlgLink = $("#player-link");
  const fallback = $("#player-fallback");
  const fallbackLink = $("#player-fallback-link");
  const swipe = $("#player-swipe");
  const countEl = $("#player-count");
  const hintEl = $("#player-hint");
  const flashEl = $("#player-flash");
  const flashIcon = $("#player-flash-icon");
  const navEl = $("#player-nav");
  const prevBtn = $("#player-prev");
  const nextBtn = $("#player-next");
  const PLAYER_ORIGIN = "https://www.tiktok.com";

  /* Czysty odtwarzacz TikToka (sam film i proste sterowanie, bez opisu, muzyki i polecanych filmow) */
  const playerUrl = (id) =>
    PLAYER_ORIGIN + "/player/v1/" + encodeURIComponent(id) +
    "?autoplay=1&loop=1&rel=0&description=0&music_info=0&controls=1&progress_bar=1&play_button=1" +
    "&volume_control=1&fullscreen_button=1&timestamp=0&native_context_menu=0&closed_caption=0";
  const coverOf = (v) => v.cover || "assets/covers/" + v.id + ".webp";

  let playlist = [];
  let index = 0;
  let busy = false;      // trwa animacja przejscia
  let playing = false;   // ostatni znany stan odtwarzacza (z jego komunikatow)

  // Lista do przewijania: najpierw filmy z sekcji, z ktorej otwarto film, potem pozostale (bez powtorzen)
  const queueFor = (list) => {
    const seen = new Set();
    return [...list, ...topVideos, ...latestVideos].filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
  };

  // Polecenia dla odtwarzacza TikToka (play, pause, mute, unMute)
  const command = (type) => {
    if (frame.contentWindow) frame.contentWindow.postMessage({ type, "x-tiktok-player": true }, PLAYER_ORIGIN);
  };

  function setFallback(show) {
    fallback.hidden = !show;
    stage.classList.toggle("is-fallback", show);
  }

  function updateNav() {
    const n = playlist.length;
    countEl.hidden = n < 2;
    countEl.textContent = (index + 1) + " / " + n;
    navEl.hidden = n < 2;
    prevBtn.disabled = index <= 0;
    nextBtn.disabled = index >= n - 1;
  }

  function showClip(i) {
    const v = playlist[i];
    index = i;
    playing = false;
    stage.style.backgroundImage = 'url("' + coverOf(v) + '")';
    stage.classList.remove("is-ready");
    setFallback(false);
    dlgLink.href = fallbackLink.href = videoUrl(v.id);
    frame.src = playerUrl(v.id);
    updateNav();
    // okladki sasiednich filmow: przejscie bez pustego tla
    [playlist[i + 1], playlist[i - 1]].forEach((n) => { if (n) new Image().src = coverOf(n); });
  }

  function openPlayer(v, list) {
    // videoMode: "tiktok" w config.js otwiera film od razu na TikToku, bez okna na stronie
    if (C.videoMode === "tiktok" || !dlg || typeof dlg.showModal !== "function") {
      window.open(videoUrl(v.id), "_blank", "noopener");
      return;
    }
    playlist = queueFor(list || [v]);
    showClip(Math.max(0, playlist.findIndex((x) => x.id === v.id)));
    dlg.showModal();
    document.documentElement.classList.add("modal-open");
    showHintOnce();
  }

  /* Wskazowka "Przesun w gore": raz na przegladarke, tylko na dotyku, tylko gdy jest co przewijac */
  let hintSeen = false;
  const hideHint = () => hintEl.classList.remove("is-on");
  function showHintOnce() {
    if (hintSeen || playlist.length < 2 || !window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
    hintSeen = true;
    try { if (localStorage.getItem("swipe-hint")) return; localStorage.setItem("swipe-hint", "1"); } catch (_) { return; }
    hintEl.classList.add("is-on");
    setTimeout(hideHint, 3400);
  }

  // Film ogladany po przewinieciu tez trafia do statystyk (pierwszy liczy sie z klikniecia w karte)
  function countView(v) {
    const gc = window.goatcounter;
    if (gc && typeof gc.count === "function") gc.count({ path: "film/" + v.id, title: "Film: " + (v.title || v.id), event: true });
  }

  /* Przejscie do kolejnego/poprzedniego filmu: obecny odjezdza, nowy wjezdza z przeciwnej strony.
     dir: +1 nastepny, -1 poprzedni. fromY: gdzie palec zostawil scene (przy przeciaganiu). */
  function go(dir, fromY = 0) {
    const to = index + dir;
    if (busy || to < 0 || to >= playlist.length) return false;
    busy = true;
    hideHint();
    const swap = () => { stage.style.transform = ""; showClip(to); countView(playlist[to]); };
    if (typeof stage.animate !== "function") { swap(); busy = false; return true; }
    stage.animate(
      [{ transform: "translateY(" + fromY + "px)", opacity: 1 }, { transform: "translateY(" + (-dir * 90) + "px)", opacity: 0 }],
      { duration: 170, easing: "ease-in", fill: "forwards" }
    ).finished
      .then(() => {
        swap();
        stage.getAnimations().forEach((a) => a.cancel());
        return stage.animate(
          [{ transform: "translateY(" + (dir * 90) + "px)", opacity: 0 }, { transform: "none", opacity: 1 }],
          { duration: 300, easing: "cubic-bezier(.16, 1, .3, 1)" }
        ).finished;
      })
      .catch(() => { /* animacje anulowane, np. przy zamknieciu okna */ })
      .finally(() => { stage.getAnimations().forEach((a) => a.cancel()); stage.style.transform = ""; busy = false; });
    return true;
  }

  // Wrocenie sceny na miejsce, gdy gest byl za krotki albo nie ma dokad przewijac
  function snapBack(fromY) {
    if (typeof stage.animate === "function" && fromY) {
      stage.style.transform = "";
      stage.animate([{ transform: "translateY(" + fromY + "px)" }, { transform: "none" }], { duration: 240, easing: "cubic-bezier(.16, 1, .3, 1)" });
    } else {
      stage.style.transform = "";
    }
  }

  // Blysk ikony pauzy/play po stuknieciu
  function flash(name) {
    flashIcon.setAttribute("href", "#i-" + name);
    flashEl.classList.remove("is-on");
    void flashEl.offsetWidth; // ponowne uruchomienie animacji
    flashEl.classList.add("is-on");
  }

  if (dlg) {
    $("#player-close").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => {
      document.documentElement.classList.remove("modal-open");
      frame.removeAttribute("src"); // zatrzymuje odtwarzanie
      stage.classList.remove("is-ready");
      stage.getAnimations && stage.getAnimations().forEach((a) => a.cancel());
      stage.style.transform = "";
      busy = false;
      hideHint();
    });
    frame.addEventListener("load", () => stage.classList.add("is-ready"));

    prevBtn.addEventListener("click", () => go(-1));
    nextBtn.addEventListener("click", () => go(1));
    dlg.addEventListener("keydown", (e) => {
      const next = e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "j";
      const prev = e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "k";
      if (!next && !prev) return;
      e.preventDefault();
      go(next ? 1 : -1);
    });

    /* Gesty palcem: przeciaganie sceny, po puszczeniu przejscie do innego filmu albo powrot.
       Krotkie stuniecie (bez ruchu) to pauza/play. Na krancach listy scena "gumowo" wraca. */
    let startY = 0, startT = 0, dy = 0, dragging = false, moved = false, swallowClickUntil = 0;
    const atEnd = (d) => (d < 0 && index >= playlist.length - 1) || (d > 0 && index <= 0);
    const shown = () => (atEnd(dy) ? dy * 0.25 : dy);

    swipe.addEventListener("pointerdown", (e) => {
      if (busy || !e.isPrimary) return;
      dragging = true; moved = false; dy = 0;
      startY = e.clientY; startT = e.timeStamp;
      try { swipe.setPointerCapture(e.pointerId); } catch (_) { /* brak przechwytywania: gest dziala i tak */ }
    });
    swipe.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dy = e.clientY - startY;
      if (!moved && Math.abs(dy) > 8) { moved = true; hideHint(); }
      if (moved) stage.style.transform = "translateY(" + shown() + "px)";
    });
    const finish = (e) => {
      if (!dragging) return;
      dragging = false;
      const dt = Math.max(e.timeStamp - startT, 1); // czas zdarzen, nie obslugi: odporne na chwilowe zacinanie strony
      const speed = dy / dt; // px/ms, ujemna = w gore
      const from = shown();
      if (!moved && e.type === "pointerup" && dt < 600) {
        playing = !playing; // od razu, prawdziwy stan poprawi komunikat odtwarzacza
        command(playing ? "play" : "pause");
        flash(playing ? "play" : "pause");
        return;
      }
      swallowClickUntil = performance.now() + 350;
      // dluzsze przeciagniecie albo krotkie, ale szybkie machniecie (ok. 0,3 px/ms i wiecej)
      const forward = dy < -60 || (dy < -24 && speed < -0.3);
      const back = dy > 60 || (dy > 24 && speed > 0.3);
      if (e.type === "pointerup" && (forward || back) && go(forward ? 1 : -1, from)) return;
      snapBack(from);
    };
    swipe.addEventListener("pointerup", finish);
    swipe.addEventListener("pointercancel", finish);
    // po przesunieciu przegladarka moze wygenerowac "click": nie ma on zamknac okna
    swipe.addEventListener("click", (e) => { if (performance.now() < swallowClickUntil) { e.stopPropagation(); e.preventDefault(); } }, true);

    // Odtwarzacz TikToka wysyla komunikaty do strony (start, stan, blad).
    // Autoodtwarzanie zawsze startuje z wyciszeniem, wiec zaraz po starcie wlaczamy dzwiek: przegladarka
    // pozwala na to, bo uzytkownik przed chwila kliknal w karte filmu albo przesunal palcem. Gdyby jednak
    // zablokowala dzwiek (film sie zatrzymuje, zanim ruszy), wyciszamy i wznawiamy, zeby film i tak sie odtwarzal.
    let started = false;
    window.addEventListener("message", (e) => {
      if (e.origin !== PLAYER_ORIGIN || !dlg.open) return;
      let d = e.data;
      if (typeof d === "string") { try { d = JSON.parse(d); } catch (_) { return; } }
      if (!d || !d["x-tiktok-player"]) return;
      if (d.type === "onPlayerError") setFallback(true);
      if (d.type === "onPlayerReady") { started = false; command("unMute"); }
      if (d.type === "onStateChange") {
        if (d.value === 1) { started = true; playing = true; }
        else if (d.value === 2) {
          playing = false;
          if (!started) { command("mute"); command("play"); started = true; }
        }
      }
    });
  }

  /* ---------- Blok na dole: strona streamera (z config.js, bez adresu = ukryty) ---------- */
  (function setupPartner() {
    const section = $("#tsxnine");
    if (!section) return;
    const p = C.partner || {};
    if (!p.url) { section.hidden = true; return; }
    $("#partner-link").setAttribute("href", p.url);
    if (p.label) $("#partner-label").textContent = p.label;
    if (p.name) $("#partner-name").textContent = p.name;
    const note = $("#partner-note");
    if (typeof p.note === "string") { note.textContent = p.note; note.hidden = !p.note; }
  })();

  /* ---------- Blok tsxnine.pl: zielone swiatlo biegnace wokol ramki ----------
     Dwa elementy poruszane po obwodzie zaokraglonego prostokata ze stala predkoscia (jedno okrazenie co 7 s, bez wzgledu na
     rozmiar bloku): jasny punkt na ramce (maska 2 px w CSS) i miekka poswiata wewnatrz. Stoi, gdy blok jest poza ekranem
     albo zakladka w tle. Przy najechaniu myszka blask znika (zielone wypelnienie). */
  (function partnerGlow() {
    const link = $("#partner-link");
    if (!link) return;
    const ring = el("span", { class: "partner-ring", "aria-hidden": "true" }, [el("span", { class: "partner-run" })]);
    const glow = el("span", { class: "partner-glow", "aria-hidden": "true" }, [el("span", { class: "partner-run-soft" })]);
    link.prepend(glow, ring);
    const dot = ring.firstElementChild, soft = glow.firstElementChild;
    const LAP = 7; // sekund na okrazenie
    let w = 0, h = 0, r = 19, perimeter = 1, offset = 0, last = 0, raf = 0, visible = true;

    function measure() {
      w = link.clientWidth; h = link.clientHeight;
      r = Math.min(19, w / 2, h / 2);
      perimeter = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
    }
    // punkt na obwodzie (0 = lewy gorny koniec prostego odcinka gornego, dalej zgodnie z ruchem wskazowek)
    function pointAt(s) {
      const sw = w - 2 * r, sh = h - 2 * r, arc = (Math.PI * r) / 2;
      let a;
      if (s < sw) return [r + s, 0];
      s -= sw; if (s < arc) { a = s / r; return [w - r + r * Math.sin(a), r - r * Math.cos(a)]; }
      s -= arc; if (s < sh) return [w, r + s];
      s -= sh; if (s < arc) { a = s / r; return [w - r + r * Math.cos(a), h - r + r * Math.sin(a)]; }
      s -= arc; if (s < sw) return [w - r - s, h];
      s -= sw; if (s < arc) { a = s / r; return [r - r * Math.sin(a), h - r + r * Math.cos(a)]; }
      s -= arc; if (s < sh) return [0, h - r - s];
      s -= sh; a = s / r; return [r - r * Math.cos(a), r - r * Math.sin(a)];
    }
    function render() {
      const [x, y] = pointAt(((offset % perimeter) + perimeter) % perimeter);
      dot.style.transform = "translate(" + (x - 90).toFixed(1) + "px," + (y - 90).toFixed(1) + "px)";
      soft.style.transform = "translate(" + (x - 170).toFixed(1) + "px," + (y - 170).toFixed(1) + "px)";
    }
    function frame(now) {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      offset += (perimeter / LAP) * dt;
      render();
      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
    }
    const start = () => { if (!raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } };
    measure(); render();
    if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }).observe(link);
    document.addEventListener("visibilitychange", start);
    window.addEventListener("resize", () => { measure(); render(); });
    start();
  })();

  /* ---------- Stopka ---------- */
  (function buildFooter() {
    const list = $("#footer-links");
    const year = $("#year");
    if (year) year.textContent = new Date().getFullYear();

    const updated = $("#updated");
    if (updated && D.updated) {
      const [y, m, d] = D.updated.split("-");
      updated.textContent = "Statystyki z dnia " + d + "." + m + "." + y + ".";
    }
    if (!list) return;

    const add = (href, label, iconName) => {
      const a = el("a", { href }, [iconName ? icon(iconName) : null, document.createTextNode(label)]);
      if (isExternal(href)) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
      list.append(el("li", {}, [a]));
    };
    if (C.tiktok && C.tiktok.url) add(C.tiktok.url, "TikTok", "tiktok");
    if (C.instagram && C.instagram.url) add(C.instagram.url, "Instagram", "instagram");
    if (C.youtube && C.youtube.url) add(C.youtube.url, "YouTube", "youtube");
    if (discord.invite) add(discord.invite, "Discord", "discord");
    if (C.email) add("mailto:" + C.email, C.email, "envelope-simple");
    (C.extraLinks || []).forEach((l) => add(l.url, l.label, null));
  })();

  /* ---------- Plynne przewijanie: menu, przyciski ze strzalka i logo (na gore) ----------
     Wlasna animacja (rAF), wiec dziala takze przy wlaczonym w systemie "ogranicz ruch", gdy natywne przewijanie
     bywa wylaczone i strona tylko "przeskakuje". Konczy sie, gdy uzytkownik sam zacznie przewijac (kolko, dotyk,
     klawisze). Laduje pod naglowkiem sekcji, a "#top" (logo) oznacza sam poczatek strony. */
  (function smoothAnchors() {
    const root = document.documentElement;
    let raf = 0;
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; root.style.scrollBehavior = ""; } };
    ["wheel", "touchstart", "mousedown", "keydown"].forEach((t) => window.addEventListener(t, stop, { passive: true }));
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // start i hamowanie

    function scrollToY(y) {
      stop();
      const from = window.scrollY;
      const to = Math.max(0, Math.min(y, root.scrollHeight - window.innerHeight));
      const dist = to - from;
      if (Math.abs(dist) < 2) return;
      const dur = Math.min(1100, Math.max(450, 380 + Math.abs(dist) * 0.22)); // dalej = dluzej, ale bez przesady
      const t0 = performance.now();
      root.style.scrollBehavior = "auto"; // wylacza CSS-owe wygladzanie, zeby nie nakladalo sie na klatki animacji
      const step = (now) => {
        const t = Math.max(0, Math.min(1, (now - t0) / dur));
        window.scrollTo(0, from + dist * ease(t));
        if (t < 1) raf = requestAnimationFrame(step);
        else { raf = 0; root.style.scrollBehavior = ""; }
      };
      raf = requestAnimationFrame(step);
    }

    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || a.classList.contains("skip") || a.target === "_blank") return;
      const id = decodeURIComponent(a.getAttribute("href").slice(1));
      if (!id) return;
      let y = 0;
      if (id !== "top") {
        const el = document.getElementById(id);
        if (!el) return;
        const headerH = parseFloat(getComputedStyle(root).getPropertyValue("--header-h")) || 64;
        // sekcje maja duzy odstep u gory: ladujemy na ich tresci, nie na pustym miejscu
        y = el.getBoundingClientRect().top + window.scrollY + (parseFloat(getComputedStyle(el).paddingTop) || 0) - headerH - 20;
      }
      e.preventDefault();
      scrollToY(y);
      try { history.replaceState(null, "", id === "top" ? location.pathname + location.search : "#" + id); } catch (_) { /* np. strona otwarta z pliku */ }
    });
  })();

  /* ---------- Karuzela filmow na telefonie w stylu "coverflow" ----------
     Dla kazdej karty liczymy odleglosc od srodka karuzeli (p: 0 = w srodku, +-1 = jedna karta obok) i zapisujemy
     zmienne CSS (--p, --s, --o). Reszte (skala, przygaszenie, przesuniecie okladki) robi CSS. Tylko wasne ekrany. */
  (function coverflow() {
    const strip = $("#track");
    if (!strip) return;
    const mq = window.matchMedia("(max-width: 819px)");
    const cards = () => [...strip.querySelectorAll(".vcard")];
    let queued = false;
    function update() {
      queued = false;
      if (!mq.matches) return;
      const tr = strip.getBoundingClientRect();
      const mid = tr.left + tr.width / 2;
      cards().forEach((c) => {
        const r = c.getBoundingClientRect();
        const p = Math.max(-1.6, Math.min(1.6, (r.left + r.width / 2 - mid) / r.width));
        const d = Math.min(1, Math.abs(p));
        c.style.setProperty("--p", p.toFixed(3));
        c.style.setProperty("--s", (1 - 0.13 * d).toFixed(3));
        c.style.setProperty("--o", (1 - 0.45 * d).toFixed(3));
      });
    }
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    function apply() {
      if (mq.matches) { strip.setAttribute("data-flow", ""); queue(); return; }
      strip.removeAttribute("data-flow");
      cards().forEach((c) => ["--p", "--s", "--o"].forEach((k) => c.style.removeProperty(k)));
    }
    strip.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    if (mq.addEventListener) mq.addEventListener("change", apply); else if (mq.addListener) mq.addListener(apply);
    apply();
  })();

  /* ---------- Ruch: naglowek, wjazd sekcji, licznik ---------- */
  const header = $(".site-header");
  const sentinel = $("#sentinel");
  if ("IntersectionObserver" in window && header && sentinel) {
    new IntersectionObserver(([e]) => header.classList.toggle("is-stuck", !e.isIntersecting)).observe(sentinel);
  }

  /* Tylko mysz: glebia w hero i podswietlenie kafelkow pod kursorem.
     Zapisujemy tylko zmienne CSS, a ruch robi CSS (transform), wiec nie ma przeliczania ukladu.
     Glebia (paralaksa) jest pomijana u osob z "ogranicz ruch" w systemie, reszta dziala u wszystkich. */
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const hero = $(".hero");
    const visual = $(".hero-visual");
    if (!reduceMotion && hero && visual) {
      let px = 0, py = 0, frame = 0;
      const apply = () => {
        frame = 0;
        visual.style.setProperty("--px", px.toFixed(3));
        visual.style.setProperty("--py", py.toFixed(3));
      };
      const queue = () => { if (!frame) frame = requestAnimationFrame(apply); };
      hero.addEventListener("pointermove", (e) => {
        const r = hero.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width - 0.5;
        py = (e.clientY - r.top) / r.height - 0.5;
        queue();
      });
      hero.addEventListener("pointerleave", () => { px = 0; py = 0; queue(); });
    }

    const bento = $(".bento");
    if (bento) {
      bento.addEventListener("pointermove", (e) => {
        const tile = e.target.closest(".tile");
        if (!tile) return;
        const r = tile.getBoundingClientRect();
        tile.style.setProperty("--mx", e.clientX - r.left + "px");
        tile.style.setProperty("--my", e.clientY - r.top + "px");
      });
    }
  }

  const revealables = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        obs.unobserve(e.target);
        if (e.target === statsEl) {
          // liczby wskakuja jedna po drugiej: najpierw zero, potem odliczanie z opoznieniem
          e.target.querySelectorAll(".num").forEach((n, i) => {
            n.textContent = "0";
            setTimeout(() => countUp(n), 250 + i * 160);
          });
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
    revealables.forEach((n) => io.observe(n));
  } else {
    revealables.forEach((n) => n.classList.add("in"));
  }

  /* ---------- Statystyki odwiedzin: GoatCounter (anonimowe, bez ciasteczek) ----------
     Wlaczane kodem z config.js albo z panelu admina. Skrypt liczy wejscia, a kliknieciami sterujemy
     atrybutami data-goatcounter-click, ktore tu dopisujemy (nazwy widac potem w panelu GoatCounter). */
  (function analytics() {
    const code = C.analytics && C.analytics.goatcounter;
    if (typeof code !== "string" || !/^[a-z0-9-]{2,40}$/.test(code)) return;

    const mark = (sel, name, title) => document.querySelectorAll(sel).forEach((n) => {
      n.setAttribute("data-goatcounter-click", "klik/" + name);
      n.setAttribute("data-goatcounter-title", title);
    });
    mark(".header-socials [data-link=tiktok]", "tiktok-naglowek", "TikTok (nagłówek)");
    mark(".header-socials [data-link=instagram]", "instagram-naglowek", "Instagram (nagłówek)");
    mark(".header-socials [data-link=youtube]", "youtube-naglowek", "YouTube (nagłówek)");
    mark(".header-socials [data-link=discord]", "discord-naglowek", "Discord (nagłówek)");
    mark(".hero-cta [data-link=tiktok]", "tiktok-hero", "TikTok (przycisk na górze)");
    mark(".tile-tiktok", "tiktok-kafelek", "TikTok (kafelek)");
    mark(".tile-ig", "instagram-kafelek", "Instagram (kafelek)");
    mark(".tile-yt", "youtube-kafelek", "YouTube (kafelek)");
    mark("#discord-copy", "discord-kopiuj-nick", "Discord (skopiowanie nicku)");
    mark("#discord-hit", "discord-zaproszenie", "Discord (zaproszenie na serwer)");
    mark("#partner-link", "partner", "Strona streamera (blok na dole)");
    mark(".vcard-more", "tiktok-wszystkie-filmy", "TikTok (Wszystkie filmy)");
    mark("#player-link, #player-fallback-link", "film-otworz-tiktok", "Film otwarty na TikToku");
    document.querySelectorAll("#footer-links a").forEach((a) => {
      const slug = a.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "link";
      a.setAttribute("data-goatcounter-click", "klik/stopka-" + slug);
      a.setAttribute("data-goatcounter-title", "Stopka: " + a.textContent.trim());
    });
    document.querySelectorAll(".vcard-media").forEach((b) => {
      b.setAttribute("data-goatcounter-click", "film/" + b.dataset.id);
      b.setAttribute("data-goatcounter-title", "Film: " + (b.dataset.title || b.dataset.id));
    });

    const s = document.createElement("script");
    s.async = true;
    s.src = "https://gc.zgo.at/count.js";
    s.dataset.goatcounter = "https://" + code + ".goatcounter.com/count";
    document.head.append(s);

  })();

  // Skrypt doszedl do konca: mozna zostawic ukrywanie sekcji przed animacja wjazdu (patrz index.html)
  window.__app = true;
})();
