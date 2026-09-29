# 369_shoter

Strona z linkami do TikToka, Instagrama i Discorda oraz najpopularniejszymi filmami.
Zwykły HTML, CSS i JavaScript, bez instalowania czegokolwiek i bez kosztów.

## Jak ją opublikować za darmo (GitHub Pages)

1. Wejdź w repozytorium na GitHubie: **Settings** -> **Pages**.
2. W polu **Source** wybierz **Deploy from a branch**.
3. Wybierz gałąź, na której jest strona (najlepiej `main`), folder `/ (root)`, i kliknij **Save**.
4. Po minucie czy dwóch strona jest pod adresem:
   `https://tymonekk.github.io/369shoter/`

Hosting i adres `github.io` są darmowe. Każda zmiana zapisana w repozytorium
pojawia się na stronie automatycznie po chwili.

### Własny, ładniejszy adres

- **Za darmo:** podłącz to samo repozytorium do Cloudflare Pages, Netlify albo Vercel
  i wybierz nazwę, np. `369shoter.pages.dev`. Strona nie wymaga żadnego budowania,
  wystarczy wskazać repozytorium.
- **Własna domena** (np. `369shoter.pl`) kosztuje zwykle kilkadziesiąt zł rocznie.
  Jeśli ją kiedyś kupisz, wpiszesz ją w Settings -> Pages -> Custom domain.

Jeśli zmienisz adres strony, zmień go też w dwóch liniach `og:url` i `og:image`
w `index.html`. Dzięki temu podgląd linku (Discord, Messenger) będzie działał.

## Co gdzie zmienić

Prawie wszystko jest w jednym pliku: **`js/config.js`**. Można go edytować
prosto na GitHubie (ikona ołówka).

| Co | Gdzie w `config.js` |
| --- | --- |
| Zaproszenie na serwer Discord | `discord.invite` |
| Licznik osób online na Discordzie | `discord.serverId` (włącz "Widget serwera" w ustawieniach serwera) |
| E-mail do współpracy | `email` |
| Liczby (obserwujący, polubienia) | `stats` |
| Lista najlepszych filmów | `videos` |
| Linki w stopce | `extraLinks` |

### Dodanie filmu

1. Skopiuj link do filmu z TikToka, np. `https://www.tiktok.com/@369_shoter/video/7671803781754965281`.
2. Długi numer na końcu to `id`. Dopisz nową linijkę w `videos`:
   `{ id: "7671803781754965281", title: "Tytuł filmu", views: 237800 },`
3. Opcjonalnie dodaj okładkę jako `assets/covers/<id>.webp` (pionowa, ok. 360x640 px).
   Bez okładki karta pokaże ciemne tło, a film i tak się odtworzy po kliknięciu.

## Struktura

```
index.html        treść strony
css/style.css     wygląd (ciemny motyw, jasny dla systemów w trybie jasnym)
js/config.js      Twoje dane (linki, filmy, liczby)
js/main.js        działanie (kopiowanie nicku, odtwarzacz, karuzela)
assets/           awatar, okładki, czcionki, obraz podglądu linku
```

## Licencje zasobów

- Czcionki: Big Shoulders Display i Geist (SIL Open Font License), hostowane lokalnie.
- Ikony marek: Simple Icons (CC0). Pozostałe ikony: Phosphor Icons (MIT).
