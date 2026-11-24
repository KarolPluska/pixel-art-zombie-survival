import { useEffect, useState } from "react";
import { WEAPONS, WEAPON_IDS, type InventoryState, type WeaponId } from "../game/inventory";
import { Icon, WeaponArt } from "./Art";
import { Dialog } from "./Dialog";

export function QuickSlots({ pack, onSlot, mode = "view", selected, disabled = false }: {
  pack: InventoryState; onSlot: (n: number) => void; mode?: "view" | "assign" | "play";
  selected?: WeaponId; disabled?: boolean;
}) {
  return <div className={`quick-slots ${mode}`}>
    {pack.slots.map((id, i) => <button key={i} className={`quick-slot ${id ? "" : "empty"} ${mode === "play" && i === pack.active ? "equipped" : ""}`}
      onClick={() => onSlot(i)} disabled={disabled}
      aria-label={mode === "assign" && selected ? `Przypisz: ${WEAPONS[selected].name}, slot ${i + 1}` : `Slot ${i + 1}: ${id ? WEAPONS[id].name : "pusty"}`}>
      <kbd className="slot-key">{i + 1}</kbd>
      <span className="slot-art">{id ? <WeaponArt id={id} /> : <span className="empty-cross"><Icon name="plus" size={22} /></span>}</span>
      <span className="slot-copy"><strong>{id ? WEAPONS[id].name : "Wolny slot"}</strong><small>{id ? WEAPONS[id].category : "Do przypisania"}</small></span>
      {mode === "assign" && <Icon name="swap" size={13} className="slot-swap" />}
    </button>)}
  </div>;
}

export function Inventory({ pack, initial, onAssign, onClose, playing }: {
  pack: InventoryState; initial?: WeaponId; onAssign: (i: number, id: WeaponId | null) => void; onClose: () => void; playing: boolean;
}) {
  const [filter, setFilter] = useState<"owned" | "hidden">("owned");
  const [selected, setSelected] = useState<WeaponId>(initial ?? pack.slots[pack.active] ?? "crowbar");
  const [notice, setNotice] = useState("");
  const spec = WEAPONS[selected];
  const owned = pack.owned.includes(selected);
  const assigned = pack.slots.indexOf(selected);
  const list = WEAPON_IDS.filter(w => filter === "owned" ? pack.owned.includes(w) : !pack.owned.includes(w));
  const assign = (i: number) => {
    if (!owned) return;
    onAssign(i, selected);
    setNotice(`${spec.name}: przypisano do slotu ${i + 1}.`);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^Digit[123]$/.test(e.code) && !e.repeat && owned) {
        e.preventDefault();
        const i = Number(e.code.slice(-1)) - 1;
        onAssign(i, selected);
        setNotice(`${WEAPONS[selected].name}: przypisano do slotu ${i + 1}.`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [owned, onAssign, selected]);
  function changeFilter(f: "owned" | "hidden") {
    setFilter(f);
    setSelected(WEAPON_IDS.find(id => f === "owned" ? pack.owned.includes(id) : !pack.owned.includes(id)) ?? "crowbar");
    setNotice("");
  }
  return <Dialog title="Ekwipunek" eyebrow={playing ? "PLECAK OCALAŁEGO / PAUZA" : "PRZYGOTOWANIE DO WYPRAWY"} onClose={onClose} wide>
    <p className="dialog-intro">Wybierz broń, a następnie przypisz ją do jednego z trzech slotów.</p>
    <div className="inventory-workbench">
      <div className="collection">
        <div className="inventory-tabs" role="tablist" aria-label="Kolekcja broni">
          <button role="tab" aria-selected={filter === "owned"} onClick={() => changeFilter("owned")}>W plecaku <b>{pack.owned.length}</b></button>
          <button role="tab" disabled={pack.owned.length === WEAPON_IDS.length} aria-selected={filter === "hidden"} onClick={() => changeFilter("hidden")}>Do odkrycia <b>{WEAPON_IDS.length - pack.owned.length}</b></button>
        </div>
        <div className="weapon-list" role="tabpanel">
          {list.map(id => <button key={id} onClick={() => { setSelected(id); setNotice(""); }} className={`weapon-row ${selected === id ? "selected" : ""}`} aria-pressed={selected === id}>
            <WeaponArt id={id}/><span><strong>{WEAPONS[id].name}</strong><small>{WEAPONS[id].category}</small></span>
            {pack.slots.includes(id) ? <kbd className="slot-key">{pack.slots.indexOf(id) + 1}</kbd> : <Icon name={filter === "hidden" ? "lock" : "pack"} size={14}/>}
          </button>)}
          {!list.length && <p className="empty-message">Wszystkie typy broni zostały odkryte.</p>}
        </div>
      </div>
      <div className="weapon-detail">
        <div className="item-blueprint"><span className="micro">{spec.category.toUpperCase()}</span><WeaponArt id={selected}/><span className="blueprint-number">0{WEAPON_IDS.indexOf(selected) + 1} / 07</span></div>
        <div className="detail-copy"><h3>{spec.name}</h3><p>{spec.description}</p>
          <dl><div><dt>Obrażenia</dt><dd>{spec.damage}{spec.pellets > 1 && ` × ${spec.pellets}`}</dd></div>
          <div><dt>{spec.ammo ? "Magazynek" : "Amunicja"}</dt><dd>{spec.ammo ? (owned ? `${pack.magazines[selected]} / ${spec.capacity}` : `${spec.capacity} szt.`) : "Nie wymaga"}</dd></div>
          {owned && spec.ammo && <div><dt>Zapas</dt><dd>{pack.stock[spec.ammo]} szt.</dd></div>}</dl>
          {!owned && <div className="find-hint"><Icon name="pin" size={15}/>{spec.location}</div>}
          {owned && assigned >= 0 && <button className="stow-btn" disabled={pack.slots.filter(Boolean).length <= 1} onClick={() => { onAssign(assigned, null); setNotice(`${spec.name}: odłożono do plecaka.`); }}><Icon name="pack" size={14}/>Odłóż do plecaka</button>}
        </div>
      </div>
    </div>
    <div className="assignment"><div className="section-label"><Icon name="pack" size={16}/>{owned ? "PRZYPISZ DO SLOTU" : "WYPOSAŻENIE PODRĘCZNE"}</div>
      <QuickSlots pack={pack} onSlot={assign} mode="assign" selected={selected} disabled={!owned}/></div>
    <footer className="dialog-bottom"><span className="inventory-notice" aria-live="polite">{notice || (owned ? "Kliknij slot lub naciśnij 1, 2, 3." : "Odszukaj tę broń podczas rozgrywki.")}</span>
      <button className="action-primary small" onClick={onClose}>{playing ? "WRÓĆ DO GRY" : "GOTOWE"}<Icon name="check" size={16}/></button></footer>
  </Dialog>;
}