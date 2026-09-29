/* 369_shoter - logika strony. Teksty i dane zmieniasz w js/config.js, nie tutaj.
   Dane z TikToka (liczby, lista filmow) odswieza automatycznie scripts/update_tiktok.py
   i trafiaja do data/tiktok.js. */
(() => {
  "use strict";

  const C = window.SITE_CONFIG || {};
  const D = window.TIKTOK_DATA || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isExternal = (url) => /^https?:\/\//i.test(url);

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
    const media = el("button", { class: "vcard-media", type: "button", "aria-label": "Odtwórz film: " + title }, [
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
    const go = (dir) => track.scrollBy({ left: dir * step() * 2, behavior: reduceMotion ? "auto" : "smooth" });
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
  const frame = $("#player-frame");
  const dlgLink = $("#player-link");

  function openPlayer(v) {
    if (!dlg || typeof dlg.showModal !== "function") {
      window.open(videoUrl(v.id), "_blank", "noopener");
      return;
    }
    frame.src = "https://www.tiktok.com/embed/v2/" + encodeURIComponent(v.id) + "?lang=pl-PL";
    dlgLink.href = videoUrl(v.id);
    dlg.showModal();
  }

  if (dlg) {
    $("#player-close").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => frame.removeAttribute("src")); // zatrzymuje odtwarzanie
  }

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

  /* Tylko mysz i bez "ogranicz ruch": glebia w hero i podswietlenie kafelkow pod kursorem.
     Zapisujemy tylko zmienne CSS, a ruch robi CSS (transform), wiec nie ma przeliczania ukladu. */
  if (!reduceMotion && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const hero = $(".hero");
    const visual = $(".hero-visual");
    if (hero && visual) {
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
  // Przy "ogranicz ruch" sekcje tez pojawiaja sie przy przewijaniu (samo przejscie przezroczystosci,
  // patrz CSS), tylko liczby zostaja od razu w koncowej wartosci.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        obs.unobserve(e.target);
        if (e.target === statsEl && !reduceMotion) {
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
})();
