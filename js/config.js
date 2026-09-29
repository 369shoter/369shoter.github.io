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
  // "source" mówi, skąd brać świeżą wartość: dane z TikToka odświeżają się same raz dziennie
  // (patrz README). "value" to zapas, gdyby danych z TikToka akurat nie było.
  stats: [
    { source: "followers", value: 3749,   label: "obserwujących na TikToku" },
    { source: "likes",     value: 132722, label: "polubień pod filmami" },
    { source: "bestVideo", value: 237800, label: "wyświetleń najlepszego filmu" }
  ],

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
