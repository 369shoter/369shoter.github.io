# 369_shoter

Strona z linkami do TikToka, Instagrama i Discorda oraz filmami (najpopularniejszymi
i najnowszymi). Zwykły HTML, CSS i JavaScript, bez instalowania czegokolwiek
i bez kosztów.

## Publikacja za darmo (GitHub Pages), jednorazowo

1. Wejdź w repozytorium na GitHubie: **Settings** -> **Pages**.
2. W polu **Build and deployment** -> **Source** wybierz **GitHub Actions**.
3. Wejdź w zakładkę **Actions**, wybierz **Publikacja strony** i kliknij **Run workflow**
   (albo poczekaj: strona publikuje się też sama po każdej zmianie i codziennie rano).
4. Po minucie strona jest pod adresem `https://tymonekk.github.io/`.

Hosting i adres `github.io` są darmowe. Adres bez dopisku po ukośniku działa dlatego, że
repozytorium nazywa się dokładnie `tymonekk.github.io`. Przy każdej innej nazwie strona
byłaby pod `https://tymonekk.github.io/nazwa-repozytorium/`.

### Własny, ładniejszy adres

- **Za darmo:** podłącz to samo repozytorium do Cloudflare Pages albo Netlify
  i wybierz nazwę, np. `369shoter.pages.dev`. Katalog główny repozytorium to gotowa strona,
  ale bez codziennego odświeżania danych (to robi workflow z GitHuba).
- **Własna domena** (np. `369shoter.pl`) kosztuje zwykle kilkadziesiąt zł rocznie.
  Wpiszesz ją w Settings -> Pages -> Custom domain.

Jeśli zmienisz adres strony, zmień go też w dwóch liniach `og:url` i `og:image`
w `index.html`, żeby podgląd linku (Discord, Messenger) działał.

## Automatyczne odświeżanie

Codziennie rano (i przy każdej publikacji) GitHub sam:

- pobiera z publicznego profilu TikToka liczbę obserwujących i polubień,
- pobiera listę ostatnich filmów razem z liczbą wyświetleń i okładkami,
- składa stronę na nowo i ją publikuje.

Dzięki temu liczby pod hero, lista **Najczęściej oglądane** (filmy z największą liczbą
wyświetleń) i sekcja **Najnowsze filmy** aktualizują się bez Twojego udziału.
Data ostatniego odświeżenia jest w stopce strony.

Jeśli TikTok kiedyś zablokuje pobieranie, nic się nie psuje: strona zostaje z ostatnimi
znanymi danymi, a w zakładce Actions przy przebiegu pojawia się żółte ostrzeżenie.
Skrypt (`scripts/update_tiktok.py`) czyta tylko publiczne dane, bez logowania.

Uwaga: lista ostatnich filmów z TikToka ma ok. 12 pozycji. Starszy hit, który z niej wypadł,
dopisz ręcznie w `videos` w `js/config.js` (patrz niżej), a strona zacznie go
uwzględniać w rankingu.

## Co zmieniasz ręcznie

Prawie wszystko jest w jednym pliku: **`js/config.js`**. Można go edytować
prosto na GitHubie (ikona ołówka).

| Co | Gdzie w `config.js` |
| --- | --- |
| Adresy TikToka, Instagrama i YouTube | `tiktok`, `instagram`, `youtube` |
| Zaproszenie na serwer Discord | `discord.invite` |
| Licznik osób online na Discordzie | `discord.serverId` (włącz "Widget serwera" w ustawieniach serwera) |
| E-mail do współpracy | `email` |
| Ile filmów w rankingu i w "Najnowsze" | `topCount`, `latestCount` |
| Starsze filmy do rankingu, własne tytuły | `videos` |
| Linki w stopce | `extraLinks` |

### Dodanie starszego filmu do rankingu

1. Skopiuj link do filmu z TikToka, np. `https://www.tiktok.com/@369_shoter/video/7671803781754965281`.
2. Długi numer na końcu to `id`. Dopisz linijkę w `videos`:
   `{ id: "7671803781754965281", title: "Tytuł filmu", views: 237800 },`
3. Opcjonalnie dodaj okładkę jako `assets/covers/<id>.webp` (pionowa, ok. 360x640 px).
   Bez okładki karta pokaże ciemne tło, a film i tak się odtworzy po kliknięciu.

## Gdyby odświeżanie przestało działać

- Zakładka **Actions** -> **Publikacja strony** -> ostatni przebieg: szukaj ostrzeżeń.
- GitHub wyłącza zaplanowane zadania po 60 dniach bez aktywności w repozytorium.
  Workflow sam temu zapobiega, ale gdyby mimo to stanęło, kliknij **Run workflow**
  albo włącz je ponownie w zakładce Actions.

## Struktura

```
index.html                       treść strony
css/style.css                    wygląd (ciemny motyw, jasny dla systemów w trybie jasnym)
js/config.js                     Twoje dane (linki, liczba filmów, starsze filmy)
js/main.js                       działanie (odtwarzacz, karuzela, kopiowanie nicku)
data/tiktok.js                   dane z TikToka (generowane automatycznie)
scripts/update_tiktok.py         pobieranie danych z TikToka
.github/workflows/pages.yml      publikacja i codzienne odświeżanie
assets/                          awatar, okładki, czcionki, obraz podglądu linku
```

## Licencje zasobów

- Czcionki: Big Shoulders Display i Geist (SIL Open Font License), hostowane lokalnie.
- Ikony marek: Simple Icons (CC0). Pozostałe ikony: Phosphor Icons (MIT).
