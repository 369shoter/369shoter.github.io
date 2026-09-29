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
      const text = discord.username || "";
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        const ta = el("textarea", { readonly: "", style: "position:fixed;opacity:0" });
        ta.value = text;
        document.body.append(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (_) {}
        ta.remove();
      }
      label.textContent = "Skopiowano";
      copyBtn.classList.add("is-done");
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
  (D.videos || []).forEach((v) => pool.set(v.id, { id: v.id, title: v.title, views: v.views }));
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

  function videoCard(v) {
    const title = v.title || "Film";
    const img = el("img", { src: v.cover || "assets/covers/" + v.id + ".webp", alt: "", width: "360", height: "640", loading: "lazy" });
    img.addEventListener("error", () => img.remove(), { once: true });
    const media = el("button", { class: "vcard-media", type: "button", "aria-label": "Odtwórz film: " + title, "data-id": v.id, "data-title": title }, [
      img,
      el("span", { class: "play" }, [icon("play")]),
    ]);
    media.addEventListener("click", () => openPlayer(v));
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
      const t = Math.min(1, (now - start) / dur);
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
      const card = videoCard(v);
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
      const card = videoCard(v);
      card.setAttribute("data-reveal", "");
      card.style.setProperty("--d", i * 0.07 + "s");
      latestGrid.append(card);
    });
  }

  /* ---------- Odtwarzacz filmu ---------- */
  const dlg = $("#player");
  const stage = $("#player-stage");
  const frame = $("#player-frame");
  const dlgLink = $("#player-link");
  const fallback = $("#player-fallback");
  const fallbackLink = $("#player-fallback-link");
  const PLAYER_ORIGIN = "https://www.tiktok.com";

  /* Czysty odtwarzacz TikToka (sam film i proste sterowanie, bez opisu, muzyki i polecanych filmow) */
  const playerUrl = (id) =>
    PLAYER_ORIGIN + "/player/v1/" + encodeURIComponent(id) +
    "?autoplay=1&loop=1&rel=0&description=0&music_info=0&controls=1&progress_bar=1&play_button=1" +
    "&volume_control=1&fullscreen_button=1&timestamp=0&native_context_menu=0&closed_caption=0";

  function openPlayer(v) {
    // videoMode: "tiktok" w config.js otwiera film od razu na TikToku, bez okna na stronie
    if (C.videoMode === "tiktok" || !dlg || typeof dlg.showModal !== "function") {
      window.open(videoUrl(v.id), "_blank", "noopener");
      return;
    }
    stage.style.backgroundImage = 'url("' + (v.cover || "assets/covers/" + v.id + ".webp") + '")';
    stage.classList.remove("is-ready");
    fallback.hidden = true;
    dlgLink.href = fallbackLink.href = videoUrl(v.id);
    frame.src = playerUrl(v.id);
    dlg.showModal();
  }

  if (dlg) {
    $("#player-close").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => {
      frame.removeAttribute("src"); // zatrzymuje odtwarzanie
      stage.classList.remove("is-ready");
    });
    frame.addEventListener("load", () => stage.classList.add("is-ready"));

    // Polecenia dla odtwarzacza TikToka (play, pause, mute, unMute)
    const command = (type) => {
      if (frame.contentWindow) frame.contentWindow.postMessage({ type, "x-tiktok-player": true }, PLAYER_ORIGIN);
    };

    // Odtwarzacz TikToka wysyla komunikaty do strony (start, stan, blad).
    // Autoodtwarzanie zawsze startuje z wyciszeniem, wiec zaraz po starcie wlaczamy dzwiek: przegladarka
    // pozwala na to, bo uzytkownik przed chwila kliknal w karte filmu. Gdyby jednak zablokowala dzwiek
    // (film sie zatrzymuje, zanim ruszy), wyciszamy i wznawiamy, zeby film i tak sie odtwarzal.
    let started = false;
    window.addEventListener("message", (e) => {
      if (e.origin !== PLAYER_ORIGIN || !dlg.open) return;
      let d = e.data;
      if (typeof d === "string") { try { d = JSON.parse(d); } catch (_) { return; } }
      if (!d || !d["x-tiktok-player"]) return;
      if (d.type === "onPlayerError") fallback.hidden = false;
      if (d.type === "onPlayerReady") { started = false; command("unMute"); }
      if (d.type === "onStateChange") {
        if (d.value === 1) started = true;
        else if (d.value === 2 && !started) { command("mute"); command("play"); started = true; }
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

    const note = $("#privacy");
    if (note) note.textContent = "Odwiedziny liczy GoatCounter (anonimowo, bez ciasteczek).";
  })();
})();
