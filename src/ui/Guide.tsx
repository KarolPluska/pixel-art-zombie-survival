import { useState } from "react";
import { Icon } from "./Art";
import { Dialog } from "./Dialog";
const CONTROLS = [
  ["W A S D", "Ruch postaci"], ["SHIFT", "Bieg"], ["MYSZ", "Celowanie"],
  ["LPM", "Użyj wybranej broni"], ["E", "Przeszukaj, otwórz, schowaj się w szafie"], ["TAB", "Otwórz ekwipunek"],
  ["TRZYMAJ E", "Przesuń przeszkodę, gdy widzisz podpowiedź"],
  ["1  2  3", "Wybierz slot broni"], ["Q", "Następny zajęty slot"], ["R", "Przeładuj"], ["F", "Latarka"],
  ["J", "Dziennik wskazówek"], ["M", "Muzyka"], ["ESC", "Pauza / powrót"],
];
export function Guide({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  return <Dialog title="Poradnik ocalałego" eyebrow="BLOK 7 / INSTRUKCJA" onClose={onClose}>
    <div className="inventory-tabs guide-tabs" role="tablist" aria-label="Poradnik">
      {["Sterowanie", "Gdzie szukać", "Misja", "Zagrożenia"].map((t,i) => <button role="tab" aria-selected={i===page} key={t} onClick={() => setPage(i)}>{t}</button>)}
    </div>
    {page === 0 && <div className="control-table" role="tabpanel">{CONTROLS.map(([key,text]) => <div key={key}><kbd>{key}</kbd><span>{text}</span></div>)}</div>}
    {page === 1 && <div className="guide-prose" role="tabpanel"><p>Wyposażenie ma swoje miejsce. Podświetlone przedmioty możesz przeszukać klawiszem <kbd>E</kbd>.</p>
      <dl><dt>Apteczki</dt><dd>W szafkach medycznych przy klatkach, w łazienkach i pralniach.</dd>
      <dt>Amunicja</dt><dd>W kasetach i skrzyniach ustawionych przy ścianach schowków oraz warsztatów.</dd>
      <dt>Baterie i klucze</dt><dd>Baterii szukaj w szafkach technicznych i kuchennych szufladach. Klucze do schodów czekają w szafce na korytarzu.</dd>
      <dt>Nowa broń</dt><dd>Zajrzyj do szafki warsztatowej w piwnicy. Wskazówki do kolejnych znalezisk znajdziesz w ekwipunku, w zakładce „Do odkrycia”.</dd></dl></div>}
    {page === 2 && <div className="guide-prose mission-prose" role="tabpanel">
      <h3>Budynek żyje własnym życiem.</h3>
      <p>Na piętrach uruchamiają się losowe zdarzenia: uciekający ocalali, obozowisko przy ognisku, prośba o eskortę, kołatanie za drzwiami, awaria światła, wyjąca syrena i barykada ustępująca pod naporem. Nie zobaczysz wszystkich w jednej nocy.</p>
      <p>Niektóre zombie po zauważeniu cię krzyczą i ściągają posiłki z ciemnych pokoi. Licznik „na piętrze” pokazuje tylko stałych mieszkańców piętra — dodatkowe sztuki oznaczamy osobno i nie musisz ich wybijać.</p>
      <p>W szafie możesz przeczekać pościg klawiszem <kbd>E</kbd>; tym samym wychodzisz na zewnątrz. Jeśli zombie widziało, jak się chowasz, zacznie szarpać drzwiczki.</p><p>Latarka zapala się sama po wejściu do ciemnego pomieszczenia lub podczas awarii światła. Ręcznie przełączasz ją klawiszem <kbd>F</kbd>; po zgaszeniu pozostanie wyłączona do wejścia w kolejny ciemny obszar.</p><span className="section-label"><Icon name="pin" size={16}/>OSIEDLE / BLOK 7</span><h3>Z piwnicy na dach.</h3><p>Zaczynasz pod ziemią. Przejdź przez parter i osiem pięter mieszkań. Szukaj kluczy, oszczędzaj amunicję i nasłuchuj kroków za drzwiami.</p><p>Na dachu czeka Wielki. Pokonaj go i przytrzymaj <kbd>E</kbd> przy flarze, żeby wezwać śmigłowiec ratunkowy.</p></div>}
    {page === 3 && <div className="guide-prose" role="tabpanel"><dl>
      <dt>Iskry i para</dt><dd>Bursztynowe iskry i cienka smuga ostrzegają przed impulsem. Odsuń się, przeczekaj lub odłącz bezpiecznik albo zawór. Odłączenie prądu gasi też lampy.</dd>
      <dt>Pęknięcia i przejścia</dt><dd>Wycofaj się z obszaru zaznaczonego na podłodze. Zwróć uwagę na framugi i ślady szorowania. Przy zastawionych drzwiach trzymaj <kbd>E</kbd>; po przerwaniu mebel zostanie na miejscu.</dd>
      <dt>Hałas i opary</dt><dd>Idź bez <kbd>SHIFT</kbd> po szkle, puszkach i deskach. Huk ściąga zombie. Omijaj zielonkawe opary, nie strzelaj w ich obrębie i poszukaj zaworu.</dd>
    </dl></div>}
    <footer className="dialog-bottom"><span className="micro">PODRĘCZNIK TERENOWY / 0{page+1}</span><button className="action-secondary compact" onClick={onClose}>WRÓĆ<Icon name="back" size={15}/></button></footer>
  </Dialog>;
}