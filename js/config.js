/*
  TUTAJ ZMIENIASZ TREŚCI STRONY. Reszta plików może zostać jak jest.
  Pamiętaj o cudzysłowach i przecinkach na końcu linijek.
*/
window.SITE_CONFIG = {
  tiktok: {
    handle: "369_shoter",
    url: "https://www.tiktok.com/@369_shoter"
  },

  instagram: {
    handle: "369_shoter",
    url: "https://www.instagram.com/369_shoter/"
  },

  youtube: {
    handle: "369_shoter",
    url: "https://www.youtube.com/@369_shoter"
  },

  discord: {
    // Twój nick na Discordzie. Pokazuje się z przyciskiem "Skopiuj nick".
    username: "tymon3kk",

    // Masz swój serwer? Wklej tutaj link zaproszenia (np. "https://discord.gg/abcdefg").
    // Wtedy cały kafelek zamieni się w przycisk "Dołącz do serwera".
    invite: "",

    // Opcjonalnie: ID serwera, żeby pokazać ile osób jest online.
    // Trzeba włączyć "Widget serwera" w ustawieniach serwera na Discordzie.
    serverId: ""
  },

  // Statystyki odwiedzin i kliknięć (GoatCounter: darmowy, bez ciasteczek, nie wymaga banera zgód).
  // 1. Załóż konto na https://www.goatcounter.com/signup i wybierz nazwę, np. "369shoter".
  // 2. Wpisz ją tutaj (albo w panelu admina). Puste "" = statystyki wyłączone.
  analytics: {
    goatcounter: "369shoter"
  },

  // Adres e-mail do współpracy. Zostaw puste "", jeśli nie chcesz go pokazywać.
  email: "",

  // Duży blok na samym dole strony, pod "Najnowsze filmy": strona streamera, dla którego robisz klipy.
  // Zostaw url puste "", żeby go schować. Puste "note" chowa tylko opis.
  partner: {
    label: "Robię klipy dla",
    name: "tsxnine.pl",
    url: "https://tsxnine.pl",
    note: "Streamer na Kicku. Transmisje i wszystkie linki w jednym miejscu."
  },

  // Dodatkowe małe linki w stopce, np. { label: "Nazwa", url: "https://..." }.
  extraLinks: [],

  // Liczby pod hero. Strona sama je skróci (3749 -> 3,7K+) i zaokrągla w dół.
  // "source" mówi, skąd brać świeżą wartość: dane z TikToka odświeżają się same
  // (patrz README). "value" to zapas, gdyby danych z TikToka akurat nie było.
  // "weekViews" to suma wyświetleń klipów opublikowanych w ostatnich 7 dniach (wszystkie padły w tym tygodniu,
  // więc to uczciwe minimum). "hideBelow" chowa liczbę, gdy jest mniejsza (np. tydzień bez nowych klipów).
  stats: [
    { source: "followers", value: 3749,   label: "obserwujących na TikToku" },
    { source: "likes",     value: 132722, label: "polubień pod filmami" },
    { source: "weekViews", value: 0,      label: "wyświetleń w ostatnim tygodniu", hideBelow: 10000 },
    { source: "bestVideo", value: 237800, label: "wyświetleń najlepszego filmu" }
  ],

  // Świeże dane z TikToka przy każdym wejściu na stronę: nowy klip, opis i liczby widać od razu, bez czekania
  // na publikację. To adres Workera z Cloudflare (tego samego co panel admina) plus /live.
  // Puste "" wyłącza tę funkcję: strona pokazuje wtedy dane z ostatniej publikacji (patrz README).
  liveApi: "https://369-panel.369shoter.workers.dev/live",

  // Dopisek "+287 w tym tygodniu" pod liczbą obserwujących (przyrost z ostatnich 7 dni). false wyłącza.
  followersGrowth: true,

  // "Klip tygodnia" pod statystykami: najczęściej oglądany klip opublikowany w ostatnich 7 dniach.
  // Sam się chowa, gdy w tym tygodniu nie było klipów. false wyłącza.
  weeklyClip: true,

  // Filmy z ostatnich tylu godzin dostają na okładce zielony znaczek "Nowe". 0 wyłącza znaczek.
  newBadgeHours: 24,

  // Pasek pod statystykami: "Do 5K obserwujących brakuje 1,1K" z paskiem postępu i linkiem do TikToka.
  // false wyłącza pasek.
  milestone: true,

  // Co się dzieje po kliknięciu w film: "player" otwiera go w oknie na tej stronie,
  // "tiktok" od razu przenosi na TikToka (w nowej karcie, na telefonie zwykle do aplikacji).
  videoMode: "player",

  // Ile filmów pokazać w "Najczęściej oglądane" i w "Najnowsze filmy".
  topCount: 6,
  latestCount: 4,

  // Filmy, które strona ma znać ZAWSZE, nawet gdy zejdą z listy ostatnich filmów TikToka
  // (np. starsze hity). Liczby wyświetleń i nowe filmy dokładają się same, tu dopisujesz tylko
  // rzeczy starsze albo chcesz własny tytuł.
  // id to długi numer z linku do filmu: tiktok.com/@369_shoter/video/7671803781754965281
  // Okładka jest brana z assets/covers/<id>.webp. Jeśli jej nie ma, karta pokaże ciemne tło,
  // a film i tak zadziała po kliknięciu.
  videos: [
    { id: "7671803781754965281", title: "Najgorsza firma myszek",     views: 237800 },
    { id: "7690351493794237728", title: "Najgorszy nawyk Mamm0na",    views: 233700 },
    { id: "7690337751027256608", title: "Zdildosowali serwer FACEIT", views: 214100 },
    { id: "7683144346140445985", title: "369 o proszeniu o skiny",    views: 212300 },
    { id: "7690350161498819872", title: "Mamm0n nie rzuci smoke'a",   views: 201000 },
    { id: "7690349278299966753", title: "Mamm0n włączył aimbota?",    views: 170200 }
  ]
};
