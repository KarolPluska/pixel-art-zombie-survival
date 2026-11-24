import { Icon, WeaponArt } from "./ui/Art";
import { WEAPONS } from "./game/inventory";
import type { HudState } from "./game/types";

function Bar({ value, segs, cls }: { value: number; segs: number; cls: string }) {
  const on = Math.ceil(Math.max(0, Math.min(1, value)) * segs - 0.001);
  return (
    <div className={`bar ${cls}`}>
      {Array.from({ length: segs }, (_, i) => (
        <i key={i} className={i < on ? "on" : ""} />
      ))}
    </div>
  );
}

function fmt(t: number) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Hud({ hud, onInventory, onSlot, onPause, onInteract, onChoose, onHint, hintLock }: {
  hud: HudState; onInventory: () => void; onSlot: (slot: number) => void; onPause: () => void;
  onInteract: () => void; onChoose: (index: number) => void; onHint: (a: string) => void; hintLock: boolean;
}) {
  const spec = WEAPONS[hud.weapon];
  const ask = hud.prompt.match(/^(\S+)\s+(.*)$/);
  const hpFrac = hud.hp / hud.maxHp;
  return (
    <div className="hud">
      {hud.banner && (
        <div className="banner">
          <strong>{hud.banner}</strong>
          <span>{hud.bannerSub}</span>
        </div>
      )}

      {hud.bossMax > 0 && hud.bossHp > 0 && (
        <div className="bossbar">
          <span className="tag">WIELKI — PAN DACHU</span>
          <div className="bar boss">
            {Array.from({ length: 24 }, (_, i) => (
              <i key={i} className={i < Math.ceil((hud.bossHp / hud.bossMax) * 24) ? "on" : ""} />
            ))}
          </div>
        </div>
      )}

      <div className="hud-min-top">
        <div className="mini-vitals" aria-label="Stan postaci">
          <span className="vital-row" title={`Życie ${hud.hp}/${hud.maxHp}`} aria-label={`Życie ${hud.hp} z ${hud.maxHp}`}>
            <Icon name="heart" size={13} /><span className={`mini-bar hp ${hud.lowHp ? "low" : ""}`}><i style={{ width: `${Math.max(0, hpFrac) * 100}%` }} /></span><em>{hud.hp}</em>
          </span>
          <span className="vital-row" title={`Siły ${Math.round(hud.stamina * 100)}%`} aria-label={`Siły ${Math.round(hud.stamina * 100)} procent`}>
            <Icon name="stamina" size={13} /><span className="mini-bar st"><i style={{ width: `${hud.stamina * 100}%` }} /></span><em>{Math.round(hud.stamina * 100)}</em>
          </span>
          <span className="vital-row" title={`Bateria latarki ${Math.round(hud.battery * 100)}%`} aria-label={`Bateria latarki ${Math.round(hud.battery * 100)} procent`}>
            <Icon name="flashlight" size={13} /><span className={`mini-bar bt ${hud.flashOn ? "on" : ""}`}><i style={{ width: `${hud.battery * 100}%` }} /></span><em>{Math.round(hud.battery * 100)}</em>
          </span>
        </div>
        <div className="mini-goal">
          <span>{hud.objective}</span>
          <small>{hud.floorName}{hud.zoneName ? ` · ${hud.zoneName}` : ""}</small>
        </div>
        <div className="mini-status">
          {hud.hasKey && <Icon name="keyIcon" size={13} className="has-key" />}
          <span className="mini-time">{fmt(hud.time)}</span>
          <span className="mini-zombies" title="Zombie na piętrze"><Icon name="skull" size={12} />{hud.zombiesLeft}{hud.extraZombies > 0 && <b>+{hud.extraZombies}</b>}</span>
          <button className="hud-pause" onClick={onPause} aria-label="Wstrzymaj grę"><Icon name="pause" size={14} /></button>
        </div>
      </div>

      {(hud.hidden || hud.blackout > 0 || hud.alarm || hud.escort >= 0) && (
        <div className="state-strip">
          {hud.hidden && <span className="state hide">W KRYJÓWCE · E wychodzi</span>}
          {hud.blackout > 0 && <span className="state dark">AWARIA ŚWIATŁA</span>}
          {hud.alarm && <span className="state danger">ALARM — WYŁĄCZ</span>}
          {hud.escort >= 0 && <span className="state good">OCALAŁY → KLATKA {hud.escort} m</span>}
        </div>
      )}

      {hud.event && (
        <div className={`event-toast ${hud.event.tone}`} key={hud.event.title + hud.event.text}>
          <b>{hud.event.title}</b>
          <span>{hud.event.text}</span>
        </div>
      )}

      {!hud.choice && !hud.dialog && <div className="key-hints" aria-label="Skróty klawiszowe">
        <button onClick={() => onHint("flash")} className={hud.flashOn ? "active" : hintLock ? "" : "dim"}>
          <kbd>F</kbd>Latarka <small>{hud.flashOn ? (hud.flashAuto ? "AUTO" : "WŁ.") : "WYŁ."}</small>
        </button>
        <button onClick={() => onHint("interact")} className={hud.hidden ? "active" : ""}>
          <kbd>E</kbd>{hud.hidden ? "Wyjdź z szafy" : "Użyj / szafa"}
        </button>
        <button onClick={() => onHint("inventory")}><kbd>TAB</kbd>Plecak</button>
      </div>}

      <div className="h-bot">
        {!hud.choice && !hud.dialog && <section className="hud-kit" aria-label="Aktywna broń">
          <div className="kit-main">
            <span className="kit-art"><WeaponArt id={hud.weapon} /></span>
            <div className="kit-copy">
              <b>{spec.name}</b>
              <em>{spec.ammo ? `${hud.ammo} / ${hud.reserve}` : "broń biała"}</em>
            </div>
            <button className="kit-pack" onClick={onInventory} aria-label="Otwórz plecak (TAB)"><Icon name="pack" size={13} /></button>
          </div>
          <div className="kit-slots">
            {hud.inventory.slots.map((id, i) => (
              <button key={i} className={`kit-slot ${hud.inventory.active === i ? "on" : ""} ${id ? "" : "empty"}`}
                onClick={() => hud.inventory.slots[i] ? onSlot(i) : onInventory()}
                aria-label={`Slot ${i + 1}: ${id ? WEAPONS[id].name : "pusty"}`}>
                <kbd>{i + 1}</kbd><span>{id ? WEAPONS[id].name : "—"}</span>
              </button>
            ))}
          </div>
          {hud.reloading > 0 && <div className="kit-reload"><i style={{ width: `${hud.reloading * 100}%` }} /></div>}
        </section>}

        <div className="h-mid">
          {hud.choice && (
            <section className="panel choice">
              <strong>{hud.choice.speaker}</strong>
              <p>„{hud.choice.text}”</p>
              <div className="choice-options">
                {hud.choice.options.map((o, i) => (
                  <button key={o.label} disabled={!o.enabled} onClick={() => onChoose(i)}>
                    <kbd>{i + 1}</kbd>
                    {o.label}
                  </button>
                ))}
              </div>
            </section>
          )}
          {!hud.choice && hud.dialog && (
            <section className="panel dialog">
              <div className="dialog-head">
                <strong>{hud.dialog.speaker}</strong>
                <span>
                  SZEPT · {hud.dialog.index}/{hud.dialog.total}
                </span>
              </div>
              <p className="dialog-line">„{hud.dialog.line}”</p>
              <div className="dialog-foot">
                <span>DAR: +{hud.dialog.gift}</span>
                <button className="dialog-next" onClick={onInteract}><kbd>E</kbd> {hud.dialog.index < hud.dialog.total ? "Dalej" : "Zakończ rozmowę"}</button>
              </div>
            </section>
          )}
          {!hud.choice && hud.flare > 0 && (
            <section className="panel flarebar">
              <span className="tag">ODPALANIE FLARY — TRZYMAJ E</span>
              <Bar value={hud.flare} segs={16} cls="rs" />
            </section>
          )}
          {!hud.dialog && !hud.choice && ask && (
            <button className="ask" onClick={onInteract}>
              <kbd className="k">{ask[1]}</kbd>
              {ask[2]}
            </button>
          )}
          {!hud.choice && !hud.dialog && hud.message && <div className={`say ${hud.message.startsWith("WASD:") ? "keyboard-summary" : ""}`}>{hud.message}</div>}
        </div>
        <div />
      </div>
    </div>
  );
}
