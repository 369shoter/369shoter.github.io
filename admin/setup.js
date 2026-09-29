/* Generator sekretow dla panelu z haslem. Dziala wylacznie lokalnie (CSP: connect-src 'none'),
   niczego nie zapisuje i niczego nie wysyla. Losowosc pochodzi z crypto.getRandomValues. */
(() => {
  "use strict";

  // Ochrona przed clickjackingiem: w ramce strona sie nie wyswietli.
  if (window.top !== window.self) {
    document.documentElement.textContent = "Ta strona nie może być wyświetlana w ramce.";
    throw new Error("framed");
  }
  document.documentElement.classList.add("unframed");

  const $ = (id) => document.getElementById(id);
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  // Bez znakow latwych do pomylenia (0/O, 1/l/I), zeby haslo dalo sie przepisac z telefonu.
  const PASS_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const PASS_LEN = 22; // 22 * log2(57) = ok. 128 bitow

  const bytes = (n) => crypto.getRandomValues(new Uint8Array(n));

  // Losowy znak z alfabetu bez przesuniecia statystycznego (odrzucanie wartosci poza pelnym zakresem).
  function randomString(alphabet, length) {
    const limit = 256 - (256 % alphabet.length);
    let out = "";
    while (out.length < length) {
      for (const b of bytes(length * 2)) {
        if (b < limit && out.length < length) out += alphabet[b % alphabet.length];
      }
    }
    return out;
  }

  function base32Encode(u8) {
    let bits = "", out = "";
    u8.forEach((b) => { bits += b.toString(2).padStart(8, "0"); });
    for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
    return out;
  }
  function base32Decode(s) {
    let bits = "";
    for (const c of s.replace(/=+$/, "")) bits += B32.indexOf(c).toString(2).padStart(5, "0");
    const out = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
    return new Uint8Array(out);
  }

  // RFC 6238 (HMAC-SHA1, 30 s, 6 cyfr): ten sam algorytm co w Workerze i w aplikacjach 2FA.
  async function totp(secret, step) {
    const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const counter = new DataView(new ArrayBuffer(8));
    counter.setUint32(0, Math.floor(step / 2 ** 32));
    counter.setUint32(4, step >>> 0);
    const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
    const o = h[19] & 15;
    const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
    return String(n % 1e6).padStart(6, "0");
  }

  let totpSecret = "";

  function generate() {
    const password = randomString(PASS_CHARS, PASS_LEN);
    const session = randomString("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 48);
    totpSecret = base32Encode(bytes(20)); // 160 bitow = 32 znaki base32
    const grouped = totpSecret.match(/.{1,4}/g).join(" ");

    $("out-password").textContent = password;
    $("out-session").textContent = session;
    // Do Cloudflare wklejasz klucz bez spacji, w aplikacji spacje sa dozwolone.
    $("out-totp").textContent = totpSecret;
    $("out-uri").textContent = "otpauth://totp/369_shoter%20panel?secret=" + totpSecret + "&issuer=369_shoter&algorithm=SHA1&digits=6&period=30";
    $("out-totp").title = "Dla czytelności w aplikacji możesz wpisać: " + grouped;
    $("result").hidden = false;
    $("verify-code").value = "";
    $("verify-result").textContent = "";
    $("generate").textContent = "Wygeneruj od nowa (poprzednie zostaną zapomniane)";
    $("result").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function copy(id, btn) {
    const text = $(id).textContent;
    const done = (label) => {
      const old = btn.dataset.label || btn.textContent;
      btn.dataset.label = old;
      btn.textContent = label;
      setTimeout(() => { btn.textContent = old; }, 1600);
    };
    try {
      await navigator.clipboard.writeText(text);
      done("Skopiowano");
    } catch (_) {
      // Schowek zablokowany: zaznacz tekst, zeby dalo sie skopiowac recznie.
      const r = document.createRange();
      r.selectNodeContents($(id));
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      done("Zaznaczono, skopiuj ręcznie");
    }
  }

  async function verify(e) {
    e.preventDefault();
    const out = $("verify-result");
    const code = $("verify-code").value.replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) { out.textContent = "Wpisz 6 cyfr."; return; }
    if (!totpSecret) { out.textContent = "Najpierw wygeneruj sekrety."; return; }
    const step = Math.floor(Date.now() / 30000);
    // Okno +-1 (30 s): tak samo jak Worker, na wypadek niedokladnego zegara telefonu.
    const codes = await Promise.all([step - 1, step, step + 1].map((s) => totp(totpSecret, s)));
    out.textContent = codes.includes(code)
      ? "Zgadza się. Aplikacja ma poprawny klucz."
      : "Kod się nie zgadza. Sprawdź klucz w aplikacji i czy zegar telefonu jest ustawiony automatycznie.";
  }

  $("generate").addEventListener("click", generate);
  $("verify-form").addEventListener("submit", verify);
  document.querySelectorAll("[data-copy]").forEach((btn) => btn.addEventListener("click", () => copy(btn.dataset.copy, btn)));
})();
