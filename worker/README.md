# Panel z prawdziwym hasłem (Cloudflare Worker)

Strona na GitHub Pages jest statyczna, więc nie może sama bezpiecznie sprawdzić hasła (widziałby je
każdy, kto otworzy kod strony). Dlatego hasło sprawdza malutki, darmowy serwer w Cloudflare
(`admin-api.js` w tym folderze). Panel (`/admin/`) rozmawia tylko z nim.

Co to daje względem logowania samym tokenem GitHub:

- Token GitHub **nie trafia do przeglądarki**. Leży tylko w sekretach Cloudflare.
- Wejście wymaga **hasła i kodu z aplikacji na telefonie (2FA)**. Samo hasło nie wystarczy.
- Hasło sprawdza serwer, ze stałym czasem porównania. Po 5 błędnych próbach z jednego adresu IP
  logowanie jest blokowane na 15 minut, każda błędna próba trwa min. 0,4 s.
- Ten sam kod 2FA nie zadziała drugi raz, a sesja wygasa po 20 minutach (i po 10 minutach bezczynności).
- Serwer sam jeszcze raz sprawdza wszystko, co panel zapisuje (tylko znane pola, tylko adresy `https`,
  limity długości), więc zapis idzie wyłącznie do pliku `data/admin.js`.
- Odpowiada wyłącznie na zapytania ze strony `https://tymonekk.github.io` (CORS i sprawdzanie `Origin`).

Koszt: 0 zł (plan darmowy: 100 000 zapytań dziennie, a panel zużywa kilka).

## Instalacja (jednorazowo, ok. 15 minut)

Nazwy przycisków w Cloudflare czasem się zmieniają, ale kolejność jest taka sama.

### 1. Konto Cloudflare

1. Załóż darmowe konto: https://dash.cloudflare.com/sign-up (karta nie jest potrzebna).
2. Zabezpiecz samo konto, bo kto je przejmie, ten dostanie token GitHub z sekretów Workera.
   - Jeśli logujesz się do Cloudflare **e-mailem i hasłem**: włącz 2FA w Cloudflare
     (**My Profile** -> **Authentication**).
   - Jeśli logujesz się **przez Google** (albo Apple, GitHub): Cloudflare nie ma wtedy własnego hasła
     i nie da się tam włączyć 2FA. O wejściu decyduje Twoje konto Google, więc włącz na nim
     weryfikację dwuetapową (https://myaccount.google.com/security), najlepiej z powiadomieniem
     na telefonie lub kluczem dostępu zamiast SMS-a. Nie zakładaj osobnego hasła w Cloudflare
     tylko po to, żeby włączyć 2FA, bo to dodatkowa furtka do konta.

### 2. Wygeneruj sekrety

1. Otwórz https://tymonekk.github.io/admin/setup.html i kliknij **Wygeneruj nowe sekrety**.
   Strona działa tylko w Twojej przeglądarce i niczego nie wysyła ani nie zapisuje.
2. Zapisz trzy wartości w menedżerze haseł (albo w notatce, którą potem usuniesz): hasło do panelu,
   klucz sesji, klucz 2FA.
3. Dodaj klucz 2FA do aplikacji na telefonie (Google Authenticator, Microsoft Authenticator, 2FAS...):
   **Dodaj konto** -> **Wpisz klucz konfiguracyjny**. Wpisz kod z aplikacji w polu „Sprawdź” na
   tej stronie, żeby upewnić się, że klucz jest wpisany dobrze.
4. Nie zamykaj karty, dopóki nie skończysz krok 5.

### 3. Token GitHub dla Workera

To on pozwala Workerowi zapisać plik z ustawieniami w repozytorium.

1. https://github.com/settings/personal-access-tokens/new
2. **Repository access** -> **Only select repositories** -> tylko `tymonekk.github.io`.
3. **Repository permissions** -> **Contents** -> **Read and write** (nic więcej).
4. Ważność: maksymalna dozwolona (do roku). Ustaw sobie przypomnienie, żeby go odnowić.
5. Wygeneruj i skopiuj token (zaczyna się od `github_pat_`). Pokazuje się tylko raz.

### 4. Utwórz Workera

1. W Cloudflare: **Workers & Pages** -> **Create** -> **Create Worker**. Nazwa np. `369-panel`.
   Kliknij **Deploy** (z domyślnym kodem "Hello World").
2. Kliknij **Edit code**. Skasuj cały kod, otwórz na GitHubie plik `worker/admin-api.js` z tego
   repozytorium (przycisk **Copy raw file**), wklej całość i kliknij **Deploy**.

### 5. Pamięć na liczniki prób (KV)

1. W Cloudflare: **Storage & Databases** -> **KV** -> **Create** -> nazwa np. `369-panel-kv`.
2. Wróć do Workera: **Settings** -> **Bindings** -> **Add** -> **KV namespace**.
   **Variable name** wpisz dokładnie `KV`, wybierz utworzoną przestrzeń i zapisz.

### 6. Sekrety

W Workerze: **Settings** -> **Variables and Secrets** -> **Add**. Typ **Secret** (nie zwykły tekst)
dla każdej z czterech wartości, nazwy dokładnie takie:

| Nazwa | Wartość |
| --- | --- |
| `ADMIN_PASSWORD` | hasło z generatora albo własne (min. 5 znaków, im dłuższe, tym lepiej) |
| `SESSION_SECRET` | klucz sesji z generatora (min. 32 znaki) |
| `TOTP_SECRET` | klucz 2FA z generatora, bez spacji |
| `GITHUB_TOKEN` | token z kroku 3 |

Kliknij **Deploy**, żeby sekrety zaczęły działać. Bez `TOTP_SECRET` panel wpuści samym hasłem
(nie polecamy).

### 7. Sprawdzenie i podpięcie panelu

1. Adres Workera (na stronie Workera, np. `https://369-panel.twoja-nazwa.workers.dev`) otwórz
   w przeglądarce. Powinien pokazać `{"error":"Zabronione."}`: to znaczy, że działa i odrzuca
   wszystko, co nie przychodzi z Twojej strony.
2. Adres Workera jest wpisany w panelu w dwóch miejscach: stała `WORKER` w `admin/admin.js` i ten sam adres
   w `connect-src` w `admin/index.html`. Jeśli kiedyś zmienisz nazwę Workera, zmień oba.
3. `https://tymonekk.github.io/admin/` pyta o hasło i kod 2FA.

## Zmiana hasła, wylogowanie wszystkich

- **Nowe hasło**: zmień sekret `ADMIN_PASSWORD` w Cloudflare (i **Deploy**). Działa od razu.
- **Wylogować wszystkie sesje**: zmień `SESSION_SECRET`.
- **Zgubiony telefon z 2FA**: podmień `TOTP_SECRET` na nowy z generatora.
- **Podejrzenie wycieku tokenu GitHub**: unieważnij go na
  https://github.com/settings/personal-access-tokens i wstaw nowy jako `GITHUB_TOKEN`.

## Uczciwe ograniczenia

- **Token GitHub ma prawo zapisu do całego repozytorium** (GitHub nie pozwala ograniczyć go do
  jednego pliku). Bezpieczeństwo opiera się na tym, że jest w Cloudflare, za hasłem i 2FA, oraz że
  Worker zapisuje tylko `data/admin.js`. Kto przejmie Twoje konto Cloudflare, dostanie ten token,
  dlatego konto Cloudflare musi mieć 2FA. Każda zmiana w repozytorium jest w historii i cofa się
  jednym kliknięciem. Mocniejsza wersja to osobne repozytorium na same dane panelu.
- **Blokady są przybliżone.** Liczniki prób są w KV, które nie jest w pełni natychmiastowe, więc
  kilka równoległych prób może przejść nim blokada zadziała. Przy 128-bitowym haśle i 2FA to nie ma
  praktycznego znaczenia.
- **Ktoś może zablokować logowanie na godzinę.** Po 40 błędnych próbach (z dowolnych adresów)
  logowanie jest wstrzymane dla wszystkich, żeby uniemożliwić zgadywanie rozproszone. Konsekwencja
  jest taka, że ktoś złośliwy może na godzinę zablokować panel. Strona publiczna działa dalej.
- Sekrety w Cloudflare są tylko do zapisu. Po zapisaniu nikt (także Ty) ich nie odczyta w panelu
  Cloudflare, więc trzymaj kopię w menedżerze haseł.

## Testy

`admin-api.js` jest sprawdzany testami automatycznymi (hasło i 2FA według wektorów z RFC 6238, limity
prób, sesje, ochrona przed ponownym użyciem kodu, walidacja zapisu, wycieki sekretów) oraz działa
w tym samym środowisku uruchomieniowym co u Cloudflare (`workerd`).

## Opcjonalnie: wdrożenie z linii poleceń

Zamiast klikać w panelu, można użyć `wrangler` (`npm i -g wrangler`, `wrangler login`):

```
cd worker
wrangler kv namespace create KV      # wklej wypisane id do wrangler.toml
wrangler secret put ADMIN_PASSWORD
wrangler secret put SESSION_SECRET
wrangler secret put TOTP_SECRET
wrangler secret put GITHUB_TOKEN
wrangler deploy
```
