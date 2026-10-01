# 369_shoter

Strona z linkami do TikToka, Instagrama i Discorda oraz filmami (najpopularniejszymi
i najnowszymi). Zwykły HTML, CSS i JavaScript, bez instalowania czegokolwiek
i bez kosztów.

## Publikacja za darmo (GitHub Pages), jednorazowo

1. Wejdź w repozytorium na GitHubie: **Settings** -> **Pages**.
2. W polu **Build and deployment** -> **Source** wybierz **GitHub Actions**.
3. Wejdź w zakładkę **Actions**, wybierz **Publikacja strony** i kliknij **Run workflow**
   (albo poczekaj: strona publikuje się też sama po każdej zmianie i co kilka minut).
4. Po minucie strona jest pod adresem `https://369shoter.github.io/`.

Hosting i adres `github.io` są darmowe. Adres bez dopisku po ukośniku działa dlatego, że
repozytorium należy do darmowej organizacji `369shoter` (konto `tymonekk` jest jej właścicielem i nie zmienia
nazwy) i nazywa się dokładnie `369shoter.github.io`. Przy każdej innej nazwie strona byłaby pod
`https://369shoter.github.io/nazwa-repozytorium/`.

Stary adres `https://tymonekk.github.io/` przenosi na nowy (z zachowaniem reszty adresu, np. `?film=...`).
Robi to osobne repozytorium `tymonekk/tymonekk.github.io` z dwoma plikami z folderu [`redirect/`](redirect/).

### Własny, ładniejszy adres

- **Za darmo:** podłącz to samo repozytorium do Cloudflare Pages albo Netlify
  i wybierz nazwę, np. `369shoter.pages.dev`. Katalog główny repozytorium to gotowa strona,
  ale bez automatycznego odświeżania danych (to robi workflow z GitHuba).
- **Własna domena** (np. `369shoter.pl`) kosztuje zwykle kilkadziesiąt zł rocznie.
  Wpiszesz ją w Settings -> Pages -> Custom domain.

Jeśli zmienisz adres strony, zmień go wszędzie, gdzie występuje `369shoter.github.io`: w `index.html`
(`canonical`, `og:url`, `og:image`, `twitter:image`, dane dla Google), `sitemap.xml`, `robots.txt` oraz
w stałych `ORIGIN` i `REPO` w `worker/admin-api.js` (potem wklej Workera w Cloudflare).

## Automatyczne odświeżanie

Dane z TikToka (liczby, opisy, wyświetlenia, nowe klipy) trafiają na stronę dwiema drogami:

1. **Na żywo, przy każdym wejściu.** Strona pyta Workera z Cloudflare (`/live`, patrz `worker/README.md`),
   a on czyta publiczny profil TikToka. Nowy klip i jego opis widać więc zwykle w ciągu kilku minut od wrzucenia (zależy od tego, jak szybko TikTok
   odświeża swój publiczny profil), bez żadnej publikacji. Wymaga jednorazowo wklejenia aktualnego `worker/admin-api.js` do Workera. Gdy Worker
   nie odpowie, strona używa danych z punktu 2.
2. **Publikacja z GitHuba.** Przy każdej zmianie w repozytorium i według harmonogramu (co 5 minut, ale GitHub
   trzyma się go luźno: w praktyce bywa co kilka godzin) GitHub sam:

   - pobiera z publicznego profilu TikToka liczbę obserwujących i polubień,
   - pobiera listę ostatnich filmów razem z liczbą wyświetleń i okładkami (okładki nowych filmów trafiają na stronę na stałe),
   - składa stronę na nowo i ją publikuje.

   Publikację możesz też uruchomić ręcznie: **Actions** -> **Publikacja strony** -> **Run workflow**.

Dzięki temu liczby pod hero, lista **Najczęściej oglądane** (filmy z największą liczbą
wyświetleń) i sekcja **Najnowsze filmy** aktualizują się bez Twojego udziału.
Data w stopce to dzień ostatniego odświeżenia (przy danych na żywo: dzisiejszy).

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

## Hero i kafelek Discord

- **Okładki w hero** po najechaniu myszą powiększają się w całości (razem z ramką) i płynnie wracają po zjechaniu kursora.
  Kolejność warstw się nie zmienia, więc karta nie wskakuje na sąsiednie. Reguła `.is-live .shot:hover` w `css/style.css`.
- **Kafelek Discord** w trybie kopiowania nicku (bez zaproszenia na serwer) kopiuje nick po kliknięciu w dowolne miejsce kafelka, nie tylko
  w przycisk. Gdy w `config.js` jest `discord.invite`, kafelek jest linkiem do serwera.

## Udostępnianie klipów

W odtwarzaczu jest przycisk **Kopiuj link** (na wąskim telefonie sama ikona, potwierdzenie pokazuje się na filmie).
Skopiowany adres to zwykle `https://369shoter.github.io/k/NUMER_FILMU/`. Wklejony na Discordzie, w Messengerze itp.
pokazuje **okładkę i tytuł właśnie tego klipu** (obraz 1200x630 z okładką, tytułem i liczbą wyświetleń), a kliknięty
przenosi od razu na stronę z otwartym filmem (`https://369shoter.github.io/?film=NUMER_FILMU`). Możesz też sam wpisać
`?film=NUMER` na końcu adresu strony: tak otwiera się dowolny film, także spoza list (ukryte w panelu się nie otwierają).

- **Strony `/k/NUMER/`:** `scripts/make_share_pages.py` robi je przy każdej publikacji dla wszystkich filmów z `data/tiktok.js`
  (bez ukrytych w panelu), razem z obrazami `assets/og/NUMER.jpg` z `scripts/make_previews.py`. Nie ma ich w repozytorium,
  powstają tylko w publikowanej stronie. Działają bez Workera.
- **Świeżo dodany film** nie ma jeszcze takiej strony (powstanie przy najbliższej publikacji). Dla niego przycisk kopiuje adres
  Workera (`https://TWOJ-WORKER.workers.dev/k/NUMER`), który robi ten sam podgląd na żywo i też przenosi na film. Gdyby ktoś
  wszedł w `/k/NUMER/` zanim strona powstanie, `404.html` przeniesie go na film (tylko bez ładnego podglądu).
- **Skąd tytuł i wyświetlenia w Workerze:** z tych samych danych co strona (`/live`), a dla starszych filmów z oEmbed TikToka
  (najwyżej 20 takich zapytań na minutę, wynik trzymany 10 minut).
- Bez Workera (`liveApi: ""`) świeży film dostaje zwykły adres strony z `?film=`, bez osobnego podglądu.
- Worker wpisuje się na stronę przez `worker/README.md`, krok 9.

## Widoczność w Google

W repozytorium są: `robots.txt`, `sitemap.xml` (data odświeżana przy każdej publikacji), adres
kanoniczny, dane strukturalne (`ProfilePage` z linkami do TikToka, Instagrama i YouTube),
`site.webmanifest` z ikonami oraz własna strona `404.html`.

Przy każdej publikacji `scripts/inject_seo.py` dopisuje też do strony opis filmów w formacie schema.org
(`VideoObject`: tytuł, okładka, data dodania, liczba wyświetleń, link do TikToka), w miejsce znacznika
`<!--VIDEO_LD-->` w `index.html`. Pomijane są filmy ukryte w panelu i takie, które nie mają okładki. To pomaga
Google zrozumieć, co jest na stronie, ale **nie gwarantuje** wyników z filmami: Google pokazuje je zwykle tylko
dla stron, na których film jest główną treścią. Sprawdzisz, co Google widzi, w Search Console (raport „Filmy”)
albo w https://search.google.com/test/rich-results. Podgląd linku (Discord, Messenger) bierze obraz z
`assets/og.jpg` (okładki najlepszych filmów i logo); możesz go podmienić na inny plik 1200x630.

Jednorazowo trzeba potwierdzić własność strony w Google Search Console:

1. Wejdź na https://search.google.com/search-console i dodaj zasób typu **Prefiks adresu URL**:
   `https://369shoter.github.io/`.
2. Wybierz weryfikację **plikiem HTML**, pobierz plik `googleXXXXXXXX.html` i wrzuć go do głównego
   folderu repozytorium (workflow sam go opublikuje), potem kliknij „Zweryfikuj”.
3. W zakładce „Mapy witryn” dodaj `sitemap.xml`.

## Panel admina (`/admin/`)

Adres: `https://369shoter.github.io/admin/`. Pozwala zmienić bez grzebania w kodzie: nazwę GoatCounter,
nick i zaproszenie na Discorda, e-mail, blok z tsxnine.pl, tryb otwierania filmów, liczbę filmów,
dodać starsze filmy (samym linkiem) i ukryć wybrane filmy. Zapis publikuje stronę w 1-2 minuty.

Po zalogowaniu panel pokazuje też **statystyki odwiedzin** (odwiedzający, dzienny wykres, kliknięcia w linki i filmy,
źródła, kraje, urządzenia; 7 / 30 / 90 dni). Dane pobiera z GoatCountera Worker, a klucz (token *Read statistics*
z menu użytkownika w GoatCounter -> API, sekret `GOATCOUNTER_TOKEN` w Cloudflare) nie trafia do przeglądarki. Jak to włączyć: krok 8 w [`worker/README.md`](worker/README.md).

Kolejna karta to **Obserwujący**: wykres liczby obserwujących i polubień w czasie (7 / 30 / 90 dni), z przyrostem
w wybranym okresie, dymkiem po najechaniu lub stuknięciu (na klawiaturze strzałki) i tabelą wartości. Punkty zapisuje Worker
w KV przy wejściach na stronę, najwyżej jeden na 3 godziny (kilka zapisów na dobę, w darmowym limicie), więc wykres
zaczyna się w dniu wgrania nowej wersji Workera i jest tym gęstszy, im więcej wejść.

Ustawienia z panelu trafiają do `data/admin.js`, a to, co panel zmienia, ma pierwszeństwo przed
`js/config.js`. Pole nietknięte w panelu nadal pochodzi z `config.js`.

**Logowanie: hasło + kod 2FA.** Strona statyczna nie może sama bezpiecznie sprawdzić hasła, więc sprawdza je
darmowy Worker w Cloudflare (`worker/admin-api.js`, adres w stałej `WORKER` w `admin/admin.js`). Token GitHub leży
tylko w sekretach Cloudflare, nie w przeglądarce. Wejście wymaga hasła i kodu z aplikacji na telefonie, są limity
błędnych prób, sesja trwa 20 minut (10 minut bezczynności), a serwer jeszcze raz waliduje każdy zapis. Instalacja
i zarządzanie hasłem: [`worker/README.md`](worker/README.md). Sekrety (hasło, klucz sesji, klucz 2FA) wygenerujesz na
`https://369shoter.github.io/admin/setup.html` (działa lokalnie w przeglądarce, niczego nie wysyła).

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

## Szybkość i dostępność (ostatni przegląd)

Zmierzone Lighthouse'em (telefon, wolne łącze 4G): wydajność 83 -> 91, dostępność 100, dobre praktyki 100, SEO 100;
waga strony 435 -> 394 KiB, najdłuższe „największe wyrenderowanie” (LCP) 4,4 -> 3,3 s. Dodatkowo `axe-core` nie znajduje
naruszeń dostępności (strona, otwarty odtwarzacz i ekran logowania panelu), każdy element ma widoczny fokus z klawiatury,
a najsłabszy kontrast tekstu (szary na ciemnym tle) to 6,6:1, czyli ponad wymagane 4,5:1.

Co zmieniło się w plikach:

- Czcionki `*-latin-ext.woff2` to podzbiór tylko z polskimi literami (ok. 4 KB zamiast 16-29 KB), zakres znaków w `@font-face`
  w `css/style.css` jest dopasowany. Podzbiór powstał narzędziem `pyftsubset` z fonttools. Gdybyś potrzebował innych liter
  (np. czeskich), weź oryginalne pliki z Google Fonts albo zrób szerszy podzbiór.
- `assets/avatar.webp` i `assets/grain.png` są mocniej skompresowane (bez widocznej różnicy).
- Link „369_shoter” w stopce ma w opisie dla czytników ekranu jego widoczny tekst.

Czego nie zmieniałem świadomie: **ekran wczytywania trwa co najmniej 1,5 s** (tak jest zaprojektowany) i to on najbardziej
wydłuża LCP; skrócenie do ok. 1 s poprawiłoby wynik o kolejne pół sekundy, kosztem krótszej animacji. Serwer GitHub Pages
ustawia krótki czas cache (10 minut) i nie da się tego zmienić bez własnej domeny za Cloudflare.

## Ekran wczytywania i stały ciemny motyw

Przy wejściu strona pokazuje na ok. 2 sekundy ekran z logo i zielonym pierścieniem, potem płynnie się odsłania,
a dopiero wtedy wjeżdża tytuł. Kończy się, gdy strona jest załadowana (najwcześniej po ok. 1,5 s), stuknięcie go pomija,
a najdłużej trwa 4,5 s, więc nigdy nie zablokuje strony (bez JavaScriptu też znika sam). Kod: sekcja „Ekran wczytywania”
w `css/style.css` i znacznik `#intro` z małym skryptem na początku `<body>` w `index.html`. Żeby go wyłączyć,
usuń ten znacznik i skrypt oraz klasę `intro-on` w skrypcie w `<head>`.

Strona jest zawsze ciemna, niezależnie od ustawień telefonu.

Menu, przyciski ze strzałką i logo (wraca na samą górę, w nagłówku i w stopce) przewijają stronę płynną animacją. Jest własna (`smoothAnchors` w `js/main.js`), więc działa też przy włączonym w systemie „ogranicz ruch”, kiedy natywne przewijanie bywa wyłączone. Zatrzymuje się, gdy sam zaczniesz przewijać.

## Efekty wizualne i jak je usunąć

Każdy efekt jest osobnym kawałkiem kodu, więc jeśli któryś Ci się nie spodoba, usuwasz tylko jego:

| Efekt | Co usunąć |
| --- | --- |
| Karuzela filmów w stylu „coverflow” (telefon) | funkcja `coverflow` w `js/main.js` i blok „Telefon: karta przyciąga się do środka” w `css/style.css` |
| Tło w klimacie CS2 (siatka, celownik, ziarno, dryfująca poświata) | sekcja „Tło w klimacie CS2” w `css/style.css` oraz `assets/grain.png` |
| Zielone światło krążące po ramce bloku z tsxnine.pl, z poświatą (dwa świetliste odcinki po przeciwnych stronach, jadą po 2-pikselowej ramce ze stałą prędkością i stałą długością, także po zaokrąglonych rogach; tempo: `LAP_MS`, długość: `LIGHT` w funkcji `partnerTrail` w `js/main.js`; siła poświaty: `filter` w `.partner-fx`; bez JS zamiast tego obraca się pasek `.partner-beam`) | element `<span class="partner-fx">` w `index.html`, funkcja `partnerTrail` w `js/main.js` i reguły `.partner-fx`, `.partner-ring`, `.partner-beam`, `.partner-trail` w `css/style.css` |
| Najechanie myszką na blok z tsxnine.pl (blok się unosi, ramka zapala się na zielono z poświatą, napis zalewa się zielenią od lewej, strzałka obraca się w zielonym kółku) | reguły `.partner-link:hover…`, `.partner-link::after` i blok `@supports` z `.partner-name` w `css/style.css` |
| Znaczek „Nowe” na okładkach filmów opublikowanych w ostatnich 24 godzinach (liczone od publikacji, także zaplanowanej: godzinę bierze ze strony filmu `scripts/update_tiktok.py`, pole `t` w danych) | `newBadgeHours: 0` w `js/config.js` (godziny da się zmienić tą samą liczbą); wygląd: reguła `.vbadge` w `css/style.css` |
| Liczba „wyświetleń w ostatnim tygodniu” w statystykach (suma wyświetleń klipów opublikowanych w ostatnich 7 dniach; chowa się poniżej 10K, np. po tygodniu bez klipów) | wiersz `weekViews` w `stats` w `js/config.js` (tam też próg `hideBelow`) |
| „Klip tygodnia” pod statystykami (najczęściej oglądany klip opublikowany w ostatnich 7 dniach, z okładką, liczbą wyświetleń i przyciskami; sam się chowa, gdy w tym tygodniu nie było klipów) | `weeklyClip: false` w `js/config.js`; całkiem: sekcja `#klip-tygodnia` w `index.html`, funkcja `weeklyClip` w `js/main.js` i reguły `.weekly*` w `css/style.css` |
| Dopisek „+287 w tym tygodniu” pod liczbą obserwujących (przyrost z ostatnich 7 dni; dopóki historia jest krótsza niż tydzień: „od 29.09”). Historię zapisuje `scripts/update_tiktok.py` w danych strony (pole `fh`, punkt najwyżej co 3 godziny, 9 dni wstecz) | `followersGrowth: false` w `js/config.js`; wygląd: reguła `.stat-delta` w `css/style.css` |
| Pasek „Do 5K obserwujących brakuje…” pod statystykami (wypełnia się z odliczaniem liczby, ma połysk płynący po nim bez przerwy i pulsującą kropkę na końcu; cel sam przeskakuje na kolejny próg: 7,5K, 10K, 15K, 25K, 50K…) | `milestone: false` w `js/config.js`; całkiem: blok `#milestone` w `index.html`, funkcja `milestone` w `js/main.js` i reguły `.milestone*` w `css/style.css`. Samo światło i pulsowanie: `.milestone-fill::after` i `.milestone-tip::before` |
| Rozmyty podgląd okładek przed załadowaniem | reguły `.vcard-media::before` i `.vcard-media img` (opacity) w `css/style.css`; skrypt `scripts/update_tiktok.py` może dalej zapisywać `lqip` w danych, nic to nie psuje |

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
| Znaczek „Nowe” (po ilu godzinach znika, 0 = wyłączony) | `newBadgeHours` |
| Pasek do kolejnego progu obserwujących | `milestone` (`false` wyłącza) |
| Świeże dane z TikToka przy każdym wejściu (adres Workera) | `liveApi` (puste wyłącza) |
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
scripts/inject_seo.py            dane o filmach dla Google (schema.org), dopisywane przy publikacji
scripts/make_previews.py         obrazy podglądu linków do klipów (assets/og/NUMER.jpg), robione przy publikacji
scripts/make_share_pages.py      strony k/NUMER/ z podglądem do udostępniania klipów, robione przy publikacji
.github/workflows/pages.yml      publikacja i odświeżanie danych (co 5 min)
robots.txt, sitemap.xml, site.webmanifest, 404.html   widoczność w Google, ikona, strona błędu
assets/                          awatar, okładki, czcionki, obraz podglądu linku
```

## Licencje zasobów

- Czcionki: Big Shoulders Display i Geist (SIL Open Font License), hostowane lokalnie (pliki `latin-ext` to podzbiór z polskimi literami).
- Ikony marek: Simple Icons (CC0). Pozostałe ikony: Phosphor Icons (MIT).
