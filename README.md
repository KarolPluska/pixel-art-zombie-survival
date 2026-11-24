# BLOK 7

Przeglądarkowy survival horror w pixel arcie. Z piwnicy przez osiem pięter mieszkań na dach: znajdź klucze, pokonaj Wielkiego i wezwij śmigłowiec. React, TypeScript, Canvas 2D i Web Audio.

## Uruchomienie

```sh
npm install
npm run dev
```

`npm run build` przygotowuje wersję produkcyjną. Grafika i fonty są dołączone do aplikacji, a muzyka powstaje lokalnie w przeglądarce.

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

## Otoczenie i światło

Każde piętro ma własną paletę podłóg i ścian, a na murach pojawiają się działające urządzenia: migoczące rozdzielnice z iskrami, zwijacze węża strażackiego, domofony z pulsującą zieloną diodą i kapiące rury z kręgami na podłodze. Światło z okien przelewa się po kafelkach w głąb pomieszczeń, kałuże kołyszą się falami, a lampy mają własną poświatę i krążące przy nich ćmy.

Odkryta część piętra pojawia się na minimapie. Złoty znacznik wskazuje aktualny cel, zielony oznacza znalezione zapasy, czerwony widoczne zombie, a turkusowy ocalałych. Szafy, alarmy i obozowiska również otrzymują znaczniki.

Pełna bateria latarki wystarcza na około 14 minut ciągłego światła. Latarka zapala się automatycznie po wejściu do ciemnego pomieszczenia lub w czasie awarii zasilania. Można zgasić ją klawiszem **F**; pozostaje zgaszona w tym samym pomieszczeniu, a automatyka zadziała ponownie w kolejnym ciemnym obszarze. Znalezione baterie doładowują ją o połowę.

## Zdarzenia losowe

Na każdym piętrze (poza dachem) reżyser zdarzeń może uruchomić maksymalnie dwa spotkania, z przerwą kilkudziesięciu sekund i bez powtórek tego samego typu. Część z nich jest spokojna lub korzystna.

- **Uciekający ocalali** — trzech cywilów biegnie korytarzem przed grupą zombie. Możesz ich obronić, wyminąć albo schować się w szafie (**E**). Zombie, które widziało moment wejścia do szafy, podejdzie i zacznie szarpać drzwiczki. Uratowani dziękują, oddają zapasy i biegną do wyjścia.
- **Krzyczące zombie** — po zauważeniu gracza wzywają posiłki z ciemnych pokoi. Posiłki są ograniczone (7 na piętro), mają własny odstęp czasu i pojawiają się wyłącznie poza polem widzenia, po czym realnie docierają na miejsce. Licznik „na piętrze” obejmuje tylko stałych przeciwników; dodatkowe sztuki pokazujemy osobno.
- **Obozowisko** — grupa przy ognisku w losowym pokoju. Wariant przyjazny (dają zapasy), wymiana (śrut za naboje) albo nieufny (żądają zapasów; odmowa kończy się walką). Jeden z obozowiczów zawsze ma broń palną. Niezależnie od nastawienia grupa walczy z pobliskimi zombie, a po zagrożeniu wraca na miejsca przy ogniu.
- **Pozostałe** — awaria oświetlenia, syrena alarmowa do wyłączenia (**E**), kołatanie za drzwiami (ocalały, zombie albo puste pomieszczenie), eskorta ocalałego na klatkę oraz barykada ustępująca pod naporem, którą można podeprzeć.

## Testy

```sh
node scripts/check-equipment.mjs
node scripts/check-interface.mjs
npx tsc --noEmit
npm run build
```

Testy obejmują zamianę i zwalnianie slotów, odkrywanie broni bez duplikatów, stan amunicji i 704 wygenerowane piętra wraz z lokalizacjami ich zapasów.