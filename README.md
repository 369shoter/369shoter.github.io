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

## Statystyki odwiedzin (GoatCounter)

Strona potrafi liczyć odwiedziny i kliknięcia (TikTok, Instagram, YouTube, Discord, poszczególne
filmy, blok z tsxnine.pl) przez GoatCounter: darmowe, anonimowe, bez ciasteczek, więc nie potrzeba
banera zgód. Jest włączone dla konta `369shoter` (`analytics.goatcounter` w `js/config.js`, można je
też zmienić w panelu admina; puste pole wyłącza statystyki).

Wyniki oglądasz na https://369shoter.goatcounter.com. Kliknięcia to ścieżki zaczynające się od
`klik/` (linki i przyciski) oraz `film/` (poszczególne filmy). Część osób z blokerem reklam nie
zostanie policzona, więc liczby są zaniżone.

## Widoczność w Google

W repozytorium są: `robots.txt`, `sitemap.xml` (data odświeżana przy każdej publikacji), adres
kanoniczny, dane strukturalne (`ProfilePage` z linkami do TikToka, Instagrama i YouTube),
`site.webmanifest` z ikonami oraz własna strona `404.html`.

Jednorazowo trzeba potwierdzić własność strony w Google Search Console:

1. Wejdź na https://search.google.com/search-console i dodaj zasób typu **Prefiks adresu URL**:
   `https://tymonekk.github.io/`.
2. Wybierz weryfikację **plikiem HTML**, pobierz plik `googleXXXXXXXX.html` i wrzuć go do głównego
   folderu repozytorium (workflow sam go opublikuje), potem kliknij „Zweryfikuj”.
3. W zakładce „Mapy witryn” dodaj `sitemap.xml`.

## Panel admina (`/admin/`)

Adres: `https://tymonekk.github.io/admin/`. Pozwala zmienić bez grzebania w kodzie: nazwę GoatCounter,
nick i zaproszenie na Discorda, e-mail, blok z tsxnine.pl, tryb otwierania filmów, liczbę filmów,
dodać starsze filmy (samym linkiem) i ukryć wybrane filmy. Zapis publikuje stronę w 1-2 minuty.

Po zalogowaniu panel pokazuje też **statystyki odwiedzin** (odwiedzający, dzienny wykres, kliknięcia w linki i filmy,
źródła, kraje, urządzenia; 7 / 30 / 90 dni). Dane pobiera z GoatCountera Worker, a klucz (token *Read statistics*
z menu użytkownika w GoatCounter -> API, sekret `GOATCOUNTER_TOKEN` w Cloudflare) nie trafia do przeglądarki. Jak to włączyć: krok 8 w [`worker/README.md`](worker/README.md).

Ustawienia z panelu trafiają do `data/admin.js`, a to, co panel zmienia, ma pierwszeństwo przed
`js/config.js`. Pole nietknięte w panelu nadal pochodzi z `config.js`.

**Logowanie: hasło + kod 2FA.** Strona statyczna nie może sama bezpiecznie sprawdzić hasła, więc sprawdza je
darmowy Worker w Cloudflare (`worker/admin-api.js`, adres w stałej `WORKER` w `admin/admin.js`). Token GitHub leży
tylko w sekretach Cloudflare, nie w przeglądarce. Wejście wymaga hasła i kodu z aplikacji na telefonie, są limity
błędnych prób, sesja trwa 20 minut (10 minut bezczynności), a serwer jeszcze raz waliduje każdy zapis. Instalacja
i zarządzanie hasłem: [`worker/README.md`](worker/README.md). Sekrety (hasło, klucz sesji, klucz 2FA) wygenerujesz na
`https://tymonekk.github.io/admin/setup.html` (działa lokalnie w przeglądarce, niczego nie wysyła).

Pozostałe zabezpieczenia:

- Ścisła polityka CSP: tylko własne skrypty, żadnych obcych bibliotek, żadnego `innerHTML`, a połączenia
  wyłącznie z tym jednym Workerem (nie z GitHubem ani z żadną inną domeną).
- Panel nie da się wyświetlić w ramce (ochrona przed podszywaniem się) i ma `noindex`.
- Strona publiczna nie ufa zapisanym ustawieniom: przyjmuje tylko znane pola, ogranicza długości
  i akceptuje wyłącznie adresy `https` (wpisy typu `javascript:` są ignorowane).

**Uczciwe ograniczenie:** token GitHub w Cloudflare ma prawo zapisu do całego repozytorium (GitHub nie pozwala
ograniczyć go do jednego pliku), więc kto przejmie konto Cloudflare, mógłby zmienić kod strony. Zmiany widać w historii
i cofnie się je jednym kliknięciem. Konto Cloudflare zabezpiecz 2FA (albo 2FA na koncie Google, jeśli logujesz się
przez Google). Mocniejsza wersja to osobne repozytorium wyłącznie na dane panelu. Gdyby panel przestał działać,
wszystko można nadal zmienić ręcznie w `js/config.js` na GitHubie.

## Wygoda na telefonie

Strona jest projektowana głównie pod telefony (większość osób wchodzi z linku w opisie TikToka lub Instagrama):

- **Przewijanie filmów jak na TikToku:** w oknie z filmem przesunięcie palcem w górę/dół daje następny/poprzedni film
  z listy (filmy z sekcji, z której otwarto film, potem reszta), a stuknięcie to pauza/play. Na tablecie i komputerze są
  strzałki obok filmu i klawisze strzałek. Dolny pasek odtwarzacza TikToka (przewijanie, głośność) zostaje dostępny.
  Filmy obejrzane po przewinięciu liczą się w statystykach jako `film/<id>`.
- Cele dotykowe mają co najmniej 44 px wysokości, treść nie wchodzi pod notch i pasek gestów, tło nie przewija się pod
  otwartym odtwarzaczem, efekty `:hover` działają tylko tam, gdzie jest mysz.
- Starsze przeglądarki w aplikacjach: style mają zapasowe wersje (`color-mix`, `dvh`, `overflow: clip`), a gdyby
  `js/main.js` się nie uruchomił, po 5 sekundach cała treść i tak staje się widoczna.

## Ekran wczytywania i stały ciemny motyw

Przy wejściu strona pokazuje na ok. 2 sekundy ekran z logo i zielonym pierścieniem, potem płynnie się odsłania,
a dopiero wtedy wjeżdża tytuł. Kończy się, gdy strona jest załadowana (najwcześniej po ok. 1,5 s), stuknięcie go pomija,
a najdłużej trwa 4,5 s, więc nigdy nie zablokuje strony (bez JavaScriptu też znika sam). Kod: sekcja „Ekran wczytywania”
w `css/style.css` i znacznik `#intro` z małym skryptem na początku `<body>` w `index.html`. Żeby go wyłączyć,
usuń ten znacznik i skrypt oraz klasę `intro-on` w skrypcie w `<head>`.

Strona jest zawsze ciemna, niezależnie od ustawień telefonu.

Menu, przyciski ze strzałką i logo (wraca na samą górę, w nagłówku i w stopce) przewijają stronę płynną animacją. Jest własna (`smoothAnchors` w `js/main.js`), więc działa też przy włączonym w systemie „ogranicz ruch”, kiedy natywne przewijanie bywa wyłączone. Zatrzymuje się, gdy sam zaczniesz przewijać.

## Animacje i ustawienie systemu „ogranicz ruch”

Animacje (wejście strony, wjazd sekcji, karty filmów, liczby, kafelki, pasek postępu)
działają u wszystkich, także gdy w systemie jest włączone „ogranicz ruch” (u wielu osób
włącza się ono przypadkiem, np. przez wyłączone „Animacje w systemie” w Windowsie).
Tylko dwa efekty, które najczęściej powodują zawroty głowy, są pomijane przy tym ustawieniu:
przesuwanie okładek za kursorem oraz dryf okładek przy przewijaniu. Odpowiadają za to bloki
z `prefers-reduced-motion` na końcu `css/style.css` i warunek `reduceMotion` w `js/main.js`.

## Co zmieniasz ręcznie

Prawie wszystko jest w jednym pliku: **`js/config.js`**. Można go edytować
prosto na GitHubie (ikona ołówka).

| Co | Gdzie w `config.js` |
| --- | --- |
| Adresy TikToka, Instagrama i YouTube | `tiktok`, `instagram`, `youtube` |
| Zaproszenie na serwer Discord | `discord.invite` |
| Licznik osób online na Discordzie | `discord.serverId` (włącz "Widget serwera" w ustawieniach serwera) |
| E-mail do współpracy | `email` |
| Co po kliknięciu w film: okno na stronie czy od razu TikTok | `videoMode` (`"player"` albo `"tiktok"`) |
| Ile filmów w rankingu i w "Najnowsze" | `topCount`, `latestCount` |
| Starsze filmy do rankingu, własne tytuły | `videos` |
| Duży blok na dole (strona streamera, dla którego robisz klipy) | `partner` (puste `url` chowa blok) |
| Dodatkowe małe linki w stopce | `extraLinks` |

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

## Struktura (skrót)

```
index.html                       treść strony
css/style.css                    wygląd (strona jest zawsze ciemna)
js/config.js                     Twoje dane (linki, liczba filmów, starsze filmy)
js/main.js                       działanie (odtwarzacz, karuzela, kopiowanie nicku)
data/tiktok.js                   dane z TikToka (generowane automatycznie)
data/admin.js                    ustawienia zapisane przez panel admina
admin/                           panel admina (index.html, admin.js, admin.css) i generator sekretów (setup.html)
worker/                          serwer hasła dla panelu w Cloudflare (admin-api.js) i instrukcja
scripts/update_tiktok.py         pobieranie danych z TikToka (także dla filmów dodanych w panelu)
.github/workflows/pages.yml      publikacja i codzienne odświeżanie
robots.txt, sitemap.xml, site.webmanifest, 404.html   widoczność w Google, ikona, strona błędu
assets/                          awatar, okładki, czcionki, obraz podglądu linku
```

## Licencje zasobów

- Czcionki: Big Shoulders Display i Geist (SIL Open Font License), hostowane lokalnie.
- Ikony marek: Simple Icons (CC0). Pozostałe ikony: Phosphor Icons (MIT).
