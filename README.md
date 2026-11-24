# BLOK 7

Przeglądarkowy survival horror w pixel arcie. Z piwnicy przez osiem pięter mieszkań na dach: znajdź klucze, pokonaj Wielkiego i wezwij śmigłowiec. React, TypeScript, Canvas 2D i Web Audio.

## Uruchomienie

```sh
npm install
npm run dev
```

`npm run build` przygotowuje wersję produkcyjną (pojedynczy plik `dist/index.html` z wbudowanymi grafikami, fontami i kodem). Muzyka powstaje lokalnie w przeglądarce.

## Scenariusze pięter i przemieszczanie między kondygnacjami

Piętra przeplatają rozbudowane zadania (3–5 etapów) ze spokojniejszymi kondygnacjami (Piwnica, Piętro III, Piętro VI, Piętro VIII). Każdy scenariusz w obrębie wyprawy losowany jest deterministycznie od `seed` (bez powtórek na sąsiednich piętrach) i ma działające alternatywy:

- **A. Przywrócenie zasilania windy (`repair-lift`, Parter)** — rozpoznanie martwego panelu, odłączenie zwarcia w warsztacie, zabranie bezpiecznika B-4, montaż w panelu i przywołanie kabiny (hałas może zwabić zombie). Pierwszy przejazd w trybie awaryjnym dociera na wyższe piętro, po czym następuje wyreżyserowana awaria z przygaśnięciem światła, światłem awaryjnym i otwarciem drzwi czerwoną dźwignią wewnątrz kabiny.
- **B. Zniszczona klatka schodowa (`broken-stairs`)** — górny bieg na półpiętrze Klatki A jest zawalony gruzem; na podeście można odsunąć przeszkodę do zaplecza technicznego (**Przytrzymaj E**) albo wybrać Klatkę B / windę.
- **C. Zalane przejście (`flooded-route`)** — podejście do pionu technicznego wymaga wyłączenia zwarcia i zamknięcia zaworu pary (w dowolnej kolejności, z rozpoznaniem wcześniejszych działań).
- **D. Zombie blokujące wyjście (`lure-horde`)** — grupa pilnuje klatki; w bocznym pomieszczeniu działa konsola rozgłoszeniowa odciągająca przeciwników hałasem (alternatywnie: walka lub inna trasa).
- **E. Pion techniczny (`service-shaft`)** — zamknięte drzwi serwisowe można otworzyć cicho kodem z odnalezionej instrukcji (zapisywanej w **Dzienniku [J]**) albo wyważyć głośno łomem/toporkiem (**Przytrzymaj E**).
- **F. Przejście przez mieszkanie do Klatki B (`apartment-bypass`)** — plan ewakuacyjny wskazuje wschodnie skrzydło; przesunięcie przeszkody trwale otwiera dostęp do drugiej klatki.

### Szyby, klatki schodowe i winda

- **Spójny układ pionów:** Winda osobowa (zachodni szyb, `y = 42..44`), Klatka B (wschodni szyb, `y = 18..20`) i Pion techniczny (wschodni szyb, `y = 34..36`) leżą w tych samych miejscach na wszystkich kondygnacjach `0..9`.
- **Grywalna klatka i półpiętro:** Wejście na schody otwiera rzeczywistą przestrzeń z dolnym biegiem, półpiętrem (okno, schowek konserwatora, przeszkoda, ślady lub zawalony bieg), górnym biegiem, ruchem postaci, latarką, możliwością wycofania i własną minimapą przestrzeni pośredniej.
- **Grywalna winda i warianty podróży:** Przywołanie, rozsunięcie drzwi, wejście do kabiny, wybór piętra, rozruch, przejazd z przesuwającym się szybem i wskaźnikiem kondygnacji, zatrzymanie oraz wyjście. Warianty: rutynowy, przejazd z napięciem (`rattle`), nieplanowany postój (`stop`), przyjazd z zagrożeniem (`threat`), podest techniczny (`mid-shaft`) i awaria po osiągnięciu piętra (`fault`). Winda zachowuje wspólny stan między piętrami (po awarii można zresetować przekaźnik na piętrze ≥ 2).
- **Dziennik (`J` lub ikona książki w HUD):** Zapisuje aktualny etap zadania i kolejne wskazówki; zapis gry podniesiono do `CHECKPOINT_VERSION = 2` (zachowuje stan windy, przejść, scenariuszy i dziennika).

### Sprawdzenia (rzeczywiście wykonane)

- `node scripts/check-vertical.mjs`: 264 piętra (24 pełne budynki) — spójne szyby, brak powtórek scenariuszy na sąsiednich piętrach, spokojniejsze piętra, rozmaitość półpięter oraz serializacja zapisu v2.
- `node scripts/check-vertical-play.mjs`: Chromium — pełny przebieg Klatki A z odwrotem i przejściem, Scenariusz A z naprawą windy, przywołaniem, pauzą w trakcie jazdy (zamrożenie czasu), awarią na osiągniętym piętrze, dźwignią awaryjną, odpornością na spam **E**, Dziennikiem (`J`), wczytaniem po odświeżeniu oraz Scenariuszami B, D, E i F.
- Wszystkie wcześniejsze testy i build (`tsc --noEmit`, `check-equipment`, `check-environment`, `check-interface`, `check-events`, `check-exploration`, `npm run build`, `check-build`) przeszły bez regresji.
- **Nie sprawdzono:** długiej ręcznej rozgrywki przez wszystkie 10 pięter pod kątem tempa i trudności, Safari/Firefoksa ani fizycznego telefonu.

## Eksploracja budynku

Zagrożenia są częścią układu piętra, nie kolejki zdarzeń losowych. Rozmieszczenie, warianty, skrytki i nagrody wynikają z ziarna mapy. Generator sprawdza drogę do klucza, schodów i standardowego łupu nawet przy pominięciu wszystkich nowych niebezpiecznych pól. Bezpieczne strefy startowe, klatki i dach nie dostają zagrożeń.

- **Przewody.** Odsłonięte końcówki są na ścianach, suficie i podłodze. Niebieskie iskry wskazują obszar pod napięciem; w wariancie okresowym najpierw widać bursztynowe ostrzeżenie. W zalanym magazynie przewodzi tylko zaznaczona, połączona część kałuży. Prąd rani i spowalnia gracza i zombie, z przerwą co najmniej 1,15 s między porażeniami danej postaci. **E** przy bezpieczniku odłącza obwód i gasi miejscowe lampy.
- **Pęknięta ściana.** Od strony dostępnego przejścia rozpoczyna się dwusekundowe ostrzeżenie. Po wycofaniu ściana i tak upada; gruz rani w zaznaczonych polach, a huk ściąga zombie. Pozostaje przełom, przez który można przejść i odkryć pokój na minimapie.
- **Zastawione drzwi.** Fragment framugi i ślady na podłodze zdradzają szafy, lodówki, komody, regały, deski i przewrócone meble. **Przytrzymaj E** i obserwuj pasek. Uwolnienie klawisza albo ruch przerywa pchanie, zachowując położenie. Cięższe meble zużywają więcej sił, lodówka jest najgłośniejsza, a łom lub toporek w plecaku pomaga zdejmować deski. Mebel nie przesunie się przez postać stojącą mu na drodze.
- **Para i gaz.** Przed wyrzutem pary słychać syczenie i widać cienką smugę; silny strumień czasowo zamyka przejście. Zawór zatrzymuje wyciek. Zielonkawe opary gazu można ominąć lub odciąć zaworem; po odcięciu zanikają stopniowo. Zapłon w grze (strzał, ognisko lub zwarcie w obrębie chmury) ma osobne ostrzeżenie i nie sięga za zaznaczone pola.
- **Deski, regały i hałas.** Spróchniała podłoga ugina się i zapada po ostrzeżeniu. Wyrwa pozostaje przeszkodą na tym samym piętrze. Niestabilny regał przewrócisz **E** lub uderzeniem; po upadku może odsłonić skrytkę i zatrzymać zombie. Puszki, szkło i luźne deski zdradzają pozycję, a szkło rani tylko przy biegu. Chodzenie bez **SHIFT** ogranicza hałas.

Ukryte warsztaty, magazyny, schowki i kryjówki zawierają różne zapasy. Broń występuje na odpowiednim etapie gry; jeśli już ją masz, zabierasz amunicję. Niektóre kryjówki są zamieszkane. Na wybranych piętrach przejście obok pary i szkła skraca drogę względem bezpiecznego obejścia.

### Wznowienie wyprawy

Menu pauzy ma akcję **Zapisz i wróć do menu**, a ekran tytułowy **Wznów wyprawę**, gdy istnieje zapis. Kopia lokalna odświeża się także przy pauzie, opuszczeniu strony i co osiem sekund gry. Zapis zachowuje wyposażenie, otwarte skrytki, odkrytą mapę, stan przeszkód i wyłączone instalacje. Rozpoczęcie nowej nocy zastępuje zapis. Efekty chwilowe, rozmowy zdarzeń losowych i trwająca animacja ewakuacji nie są wznawiane w połowie. Wersja zapisu znajduje się w `src/game/checkpoint.ts`; przy niekompatybilnych zmianach układu należy ją podnieść.

### Sprawdzenia tej iteracji

- `node scripts/check-environment.mjs`: 352 piętra, w tym 105 układów ze skrótem parowym. Sprawdza bezpieczne drogi, deterministyczne skrytki, warianty i stany zagrożeń, zasięg, odstęp trafień oraz zachowanie przy przerwaniu interakcji.
- `node scripts/check-exploration.mjs`: Chromium. Sprawdza długie naciśnięcie klawiaturą i dotykiem, przejście i łup za drzwiami, odwrót przed zawaleniem, obrażenia zombie, odcięcie instalacji i wczytanie trwałych zmian po odświeżeniu strony. `CAPTURE_UI=1` zapisuje podglądy `exploration-*.png` w `.qa/`.
- Również zakończone pomyślnie: `npx tsc --noEmit`, `check-equipment` (704 piętra), `check-interface` (w tym skala kamery i finał), `check-events`, `npm run build` i `check-build`.

Nie wykonano ręcznej rozgrywki od piwnicy po dach, pomiarów długofalowego balansu ani testów na fizycznym telefonie, Safari czy Firefoksie. Wyrwy nie przenoszą na niższą kondygnację: sąsiednie piętra mają niezależne rzuty.

## Stan projektu przed rozbudową eksploracji

**Stan na 2026-11-24.** W środowisku roboczym znajdował się początkowo wyłącznie pusty szkielet Vite (`App.tsx` z ekranem „Ready to build”), bez kodu gry. Pełne źródła odtworzono z archiwum `pixel-art-zombie-survival.zip` w repozytorium GitHub: `src/game/*` (silnik, generator, reżyser zdarzeń, sprite'y, audio), `src/ui/*`, `src/Hud.tsx`, `src/assets/*`, `scripts/*`, `tests/*`, `public/*`, `index.html`. Konfiguracja Vite/TypeScript w środowisku była identyczna z repozytorium i została zachowana; doinstalowano brakujące fonty (`@fontsource/*`) oraz `playwright` poleceniem `npm install`.

Działające, zweryfikowane mechaniki: menu i wynik wyprawy, generowanie pięter z dostępnym łupem, ekwipunek z trzema slotami, latarka z automatyką i baterią, minimapa z legendą, ukrywanie w szafach, ocalali, obozowiska, alarm, barykada, awaria zasilania, finał z Wielkim i śmigłowcem, sterowanie dotykowe. Skala kamery pozostaje w silniku (`Game.viewW/viewH`, canvas 1:1) i nie została zmieniona.

### Zmiany w tej iteracji

1. **Więcej losowych zdarzeń.** Reżyser ma 11 typów zdarzeń (było 7), limit 3 spotkania na piętro (było 2), przerwę 40–68 s (było 52–92 s) i nadal nie powtarza typu na jednym piętrze oraz nie uruchamia zdarzeń na dachu. Nowe:
   - **Porzucona skrzynia** — rekwizyt w niewidocznym, osiągalnym kafelku; **E** otwiera wybór: ciche przeszukanie, wyważenie wieka z większym łupem i hałasem albo rezygnacja.
   - **Radio krótkofalowe** — migająca dioda, cykliczne trzaski i wybór: odpowiedzieć (szansa na zapasy albo zasadzka), zapisać częstotliwość, wyłączyć radio.
   - **Domofon** — wybór: wpuścić ocalałego (albo to, co udaje ocalałego), podać naboje przez kratkę w zamian za bełty albo zignorować.
   - **Zasadzka** — 2–3 zombie pojawiają się poza polem widzenia z realną drogą do gracza; po kilku sekundach dostają alert i ruszają, a zdarzenie domyka się po ich likwidacji.
   
   Miejsca trzech pierwszych zdarzeń mają pikselowe rekwizyty, własną poświatę i znaczniki na minimapie (kolory z istniejącej legendy: zapasy / ludzie / obóz).

2. **Menu w stylu pixel art.** Przyciski, dialogi, zakładki, sloty, HUD i panele wyborów mają schodkowe narożniki (`clip-path`), grube ramki, twarde cienie z efektem wciśnięcia, dithering/scanline'y, nity w rogach oraz krój Pixelify Sans w nagłówkach i etykietach. Układ, nazwy klas, dostępne nazwy (`aria-*`) i geometria HUD zostały zachowane, więc istniejący test interfejsu przechodzi bez zmian. Okrągły joystick dotykowy pozostawiono celowo dla ergonomii.

3. **Grafiki broni.** Ikony w plecaku, slotach i HUD to teraz prawdziwe rastrowe sprite'y 40×18 (bloki 2×2 px, wspólna paleta, `shape-rendering="crispEdges"`, bez krzywych i gradientów) — osobny wzór dla łomu, pistoletu, toporka, rewolweru, strzelby i kuszy. Broń trzymana przez postać (`src/game/rig.ts`) dostała rozróżnialne detale: głownię toporka, hak łomu, bęben i dłuższą lufę rewolweru, ząbki zamka pistoletu, drugą lufę i łuskę strzelby, bełt i cięciwę kuszy oraz widoczną broń białą na plecach w spoczynku.

## Plecak i sloty

Rozpoczynasz z łomem i pistoletem. W trakcie wyprawy możesz znaleźć toporek w szafce warsztatowej, rewolwer w biurku dozorcy, strzelbę w szafie myśliwego i kuszę w szafie sportowca. Nowa broń trafia do plecaka, bez automatycznej podmiany aktywnej broni.

**TAB** otwiera plecak i wstrzymuje grę. Wybierz posiadaną broń, a następnie kliknij slot albo naciśnij **1**, **2** lub **3**. Zastąpiona broń pozostaje w plecaku. Przeniesienie broni z zajętego slotu zamienia miejscami oba przedmioty. W grze **1/2/3** wybierają slot, **Q** przełącza zajęte sloty. **LPM** używa aktywnej broni, **R** ją przeładowuje. **ESC** zamyka ekwipunek.

Znalezione wyposażenie i amunicja przechodzą z graczem na następne piętra w obrębie jednej wyprawy. Nowa wyprawa zaczyna się od wyposażenia startowego. Rozmieszczenie jego slotów, rekord i ustawienia dźwięku zapisywane są lokalnie.

## Rozmieszczenie wyposażenia

Najpierw powstają ściany i przejścia, następnie umeblowanie w układach właściwych dla strefy. Skrzynie występują w pomieszczeniach technicznych, przy ścianach. Liczba skrytek z zapasami jest ograniczona osobno dla każdego piętra; nie każdy mebel zawiera przedmiot. Klucze znajdują się w szafkach na korytarzach. Generator sprawdza dostęp do każdego przeszukiwalnego obiektu z sąsiadującego pola, bez przechodzenia przez meble.

## Sterowanie

- **W A S D** — ruch, **SHIFT** — bieg
- **Mysz** — celowanie, **LPM** — użycie broni
- **E** — przeszukaj, otwórz, schowaj się w szafie (i wyjdź)
- **TAB** — plecak i sloty broni
- **F** — latarka (zapala się sama w ciemnych pokojach)
- **1 2 3** — wybór slotu, **Q** — następna broń
- **R** — przeładowanie, **M** — muzyka, **ESC** — pauza

W oknach wyboru zdarzeń klawisze **1…3** wybierają opcję, a **ESC** zamyka okno ostatnią opcją.

## Otoczenie i światło

Każde piętro ma własną paletę podłóg i ścian, a na murach pojawiają się działające urządzenia: migoczące rozdzielnice z iskrami, zwijacze węża strażackiego, domofony z pulsującą zieloną diodą i kapiące rury z kręgami na podłodze. Światło z okien przelewa się po kafelkach w głąb pomieszczeń, kałuże kołyszą się falami, a lampy mają własną poświatę i krążące przy nich ćmy.

Odkryta część piętra pojawia się na minimapie. Złoty znacznik wskazuje aktualny cel, zielony znalezione zapasy, czerwony widoczne zombie, a turkusowy ocalałych. Szafy, alarmy, obozowiska oraz nowe skrzynie/radia/domofony również otrzymują znaczniki.

Pełna bateria latarki wystarcza na około 14 minut ciągłego światła. Latarka zapala się automatycznie po wejściu do ciemnego pomieszczenia lub w czasie awarii zasilania. Można zgasić ją klawiszem **F**; pozostaje zgaszona w tym samym pomieszczeniu, a automatyka zadziała ponownie w kolejnym ciemnym obszarze. Znalezione baterie doładowują ją o połowę.

## Zdarzenia losowe

Na każdym piętrze (poza dachem) reżyser zdarzeń może uruchomić maksymalnie trzy spotkania, z przerwą kilkudziesięciu sekund i bez powtórek tego samego typu. Część z nich jest spokojna lub korzystna.

- **Uciekający ocalali** — trzech cywilów biegnie korytarzem przed grupą zombie. Możesz ich obronić, wyminąć albo schować się w szafie (**E**). Zombie, które widziało moment wejścia do szafy, podejdzie i zacznie szarpać drzwiczki. Uratowani dziękują, oddają zapasy i biegną do wyjścia.
- **Krzyczące zombie** — po zauważeniu gracza wzywają posiłki z ciemnych pokoi. Posiłki są ograniczone (7 na piętro), mają własny odstęp czasu i pojawiają się wyłącznie poza polem widzenia, po czym realnie docierają na miejsce. Licznik „na piętrze” obejmuje tylko stałych przeciwników; dodatkowe sztuki pokazujemy osobno.
- **Obozowisko** — grupa przy ognisku w losowym pokoju. Wariant przyjazny (dają zapasy), wymiana (śrut za naboje) albo nieufny (żądają zapasów; odmowa kończy się walką). Jeden z obozowiczów zawsze ma broń palną. Niezależnie od nastawienia grupa walczy z pobliskimi zombie, a po zagrożeniu wraca na miejsca przy ogniu.
- **Porzucona skrzynia / radio / domofon** — trzy spotkania z fizycznym rekwizytem, znacznikiem na mapie i wyborem uruchamianym **E**; nagrody, koszty i ryzyko opisano w sekcji „Zmiany w tej iteracji”.
- **Zasadzka** — opóźniony atak 2–3 zombie spawnowanych poza polem widzenia, z realną ścieżką do gracza.
- **Pozostałe** — awaria oświetlenia, syrena alarmowa do wyłączenia (**E**), kołatanie za drzwiami (ocalały, zombie albo puste pomieszczenie), eskorta ocalałego na klatkę oraz barykada ustępująca pod naporem, którą można podeprzeć.

## Sprawdzenia — wyniki rzeczywiście wykonane

Wszystkie poniższe polecenia uruchomiono w tym środowisku; wyniki pochodzą z konsoli, nie z założeń.

| Sprawdzenie | Wersja bazowa (przed zmianami) | Po zmianach |
| --- | --- | --- |
| `npx tsc --noEmit` | ✅ brak błędów | ✅ brak błędów |
| `node scripts/check-equipment.mjs` | ✅ `OK: ... 704 floors with reachable, contextual loot.` | ✅ ponownie uruchomione, wynik bez zmian |
| `node scripts/check-interface.mjs` | ⚠️ pierwsza próba: brak `libnspr4.so`; po `npx playwright install chromium` + `sudo npx playwright install-deps chromium` ✅ pełny przebieg | ✅ `OK: title, inventory, camera scale, flashlight, E hiding, map markers, events, mobile viewport and helicopter finale.` |
| `node scripts/check-events.mjs` (nowy) | nie istniał | ✅ `OK: pixel-art panels/buttons, raster weapon icons, 4 new events, map markers, E prompts and choices.` |
| `npm run build` | ✅ `dist/index.html` 1 322,70 kB | ✅ `dist/index.html` 1 339,05 kB |
| `node scripts/check-build.mjs` (nowy, po buildzie) | nie istniał | ✅ `OK: production single-file build boots, renders a 426x266 canvas without page errors.` |

Podgląd uruchomiono przez serwer Vite (testy same startują `vite`) i przechwycono zrzuty z headless Chromium (`CAPTURE_UI=1 node scripts/check-interface.mjs` oraz `CAPTURE_UI=1 node scripts/check-events.mjs`): menu, start gry, obozowisko z wyborem, ekwipunek z obiema zakładkami (`inventory-pixel.png`, `inventory-hidden.png`), nowe zdarzenia, widok mobilny i finał. Pliki trafiają do `.qa/`.

**Czego nie sprawdzono (przypuszczenia / ryzyka, nie wyniki testów):** nie wykonano długiej, ręcznej rozgrywki od piwnicy po dach; balans nowych zdarzeń (częstotliwość, nagrody, trudność) nie jest potwierdzony pomiarami; nie testowano Safari, Firefox ani realnego urządzenia mobilnego; nie wykonano profilowania FPS przy trzech aktywnych zdarzeniach; nie mierzono wpływu nowej skóry CSS na czytelność przy bardzo małych ekranach poza ujętymi w testach 390×844.

## Testy

```sh
node scripts/check-equipment.mjs
node scripts/check-environment.mjs
node scripts/check-vertical.mjs
node scripts/check-interface.mjs
node scripts/check-events.mjs
node scripts/check-exploration.mjs
node scripts/check-vertical-play.mjs
npx tsc --noEmit
npm run build
node scripts/check-build.mjs
```

Testy `check-interface`, `check-events`, `check-exploration` i `check-build` wymagają przeglądarki Playwright:

```sh
npx playwright install chromium
# na czystym systemie Linux dodatkowo:
sudo npx playwright install-deps chromium
```

`check-equipment` obejmuje zamianę i zwalnianie slotów, odkrywanie broni bez duplikatów, stan amunicji i 704 wygenerowane piętra wraz z lokalizacjami ich zapasów. `check-interface` sprawdza ekran tytułowy, dialogi, skalę kamery, latarkę, ukrywanie, legendę mapy, zdarzenia, widok mobilny i finał. `check-events` sprawdza skórę pixel art, rastrowe ikony oraz cztery nowe zdarzenia (start, znacznik, podpowiedź E, trzy opcje, domknięcie wyboru, alert zasadzki). `check-build` uruchamia `vite preview` na gotowym `dist/index.html` i potwierdza start gry w trybie produkcyjnym bez uchwytu deweloperskiego. Zmienna `CAPTURE_UI=1` włącza zrzuty do `.qa/`.

## Znane problemy

- Środowisko startowe nie zawierało kodu gry — bez pobrania archiwum z GitHub projekt był tylko szkieletem Vite. Kolejne iteracje powinny wychodzić z już odtworzonych źródeł w tym katalogu.
- Testy przeglądarkowe wymagają natywnych bibliotek Chromium; na czystym systemie pierwsze uruchomienie kończy się błędem `libnspr4.so`. To zależność środowiska, nie błąd gry.
- Reżyser zdarzeń używa `Math.random()` (`EventWorld.rand`), więc seed mapy nie odtwarza sekwencji zdarzeń. Funkcja „POWTÓRZ MAPĘ” powtarza układ pięter, ale nie losowe spotkania.
- `src/game/sprites.ts::drawWeaponInHand` jest martwym kodem (brak wywołań) — broń w dłoni rysuje `src/game/rig.ts`. Przy dalszej pracy nie rozwijać dwóch ścieżek rysowania równolegle.
- Nowe zdarzenia zwiększają liczbę okien wyboru; przy bardzo szybkim przechodzeniu pięter mogą one blokować sterowanie do momentu wyboru opcji. Wymaga to oceny w dłuższej rozgrywce.
- Build jest jednym plikiem HTML (~1,38 MB, gzip ~0,83 MB), bo zawiera wbudowane grafiki koncepcyjne i fonty. Przy kolejnych zasobach warto rozważyć ich kompresję lub lazy-loading poza `dist/index.html`.
- Przyciski ze ściętymi narożnikami przycinają zewnętrzny outline, dlatego focus klawiatury jest przesunięty do wnętrza (`outline-offset: -6px`).

## Ustalenia do dalszego rozwoju

- Wdrażać małymi krokami; po każdym uruchamiać pełny zestaw z sekcji „Testy” i porównywać z wynikami powyżej.
- Nie zmieniać skali kamery, `viewW/viewH`, rozmiaru canvasu ani logiki `image-rendering: pixelated` — test `check-interface` pilnuje tych wartości.
- Zachować klasy (`.hud-kit`, `.vital-row`, `.key-hints kbd`, `.state.hide`, `.field-dialog`, `.weapon-sprite`) i dostępne nazwy ról (`WEJDŹ DO BLOKU`, `STEROWANIE`, `Ekwipunek`, `ŚWIT`); testy interfejsu opierają się na nich.
- Nowe zdarzenia dodawać przez `EventKind` + `start*()` + `updateEvent()` + `interact()/prompt()` + `sites()/drawProps()/eventLights()`; zachować regułę spawnowania poza polem widzenia i z realną ścieżką (`darkSpawn`/`freeSite`).
- Rozbudowę otoczenia prowadzić oddzielnie: `src/game/environment-layout.ts` układa i waliduje piętro, `src/game/environment.ts` utrzymuje stan i obszary efektów, `src/game/environment-art.ts` rysuje je w tym samym układzie współrzędnych.
- Ikony broni są rastrem z bloków w `WEAPON_BLOCKS` (`src/ui/Art.tsx`): nowe wzory dodawać jako bloki `[x, y, w, h, kolor]` w siatce 40×18, bez krzywych SVG.
- Skóra UI znajduje się w jednym bloku „Pixel-art UI skin” w `src/index.css`; reguły responsywne są po nim i mają pierwszeństwo.
- Zrzuty `.qa/` są artefaktami testów, nie zasobami gry; nie dodawać ich do bundla.
