import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import roofScene from "./assets/roof-flare.webp";
import hall from "./assets/concept-hall.jpg";
import roof from "./assets/concept-roof.jpg";
import { Game } from "./game/engine";
import { layoutProfile } from "./game/generate";
import { Sfx } from "./game/audio";
import { CHECKPOINT_KEY, parseCheckpoint, type RunCheckpoint } from "./game/checkpoint";
import { FLOOR_META } from "./game/palette";
import { assignSlot, starterInventory, type Slots, type WeaponId } from "./game/inventory";
import type { HudState, RunStats } from "./game/types";
import { Hud } from "./Hud";
import { BuildingMark, Icon, Wordmark } from "./ui/Art";
import { Inventory } from "./ui/Inventory";
import { Dialog } from "./ui/Dialog";
import { Guide } from "./ui/Guide";

type Screen = "menu" | "play" | "dead" | "won";
type Modal = "inventory" | "guide" | "audio" | "journal" | null;

function readSetting(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function saveSetting(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Storage is optional in private browsing. */ }
}
function initialPack() {
  try { return starterInventory(JSON.parse(readSetting("blok7-loadout") ?? "null")); } catch { return starterInventory(); }
}
function duration(t: number) {
  return `${Math.floor(t / 60)}:${String(Math.floor(t) % 60).padStart(2, "0")}`;
}

function Stick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const held = useRef<number | null>(null);
  function move(e: PointerEvent<HTMLDivElement>) {
    if (held.current !== e.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width / 2) / (r.width / 2);
    const y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const len = Math.max(1, Math.hypot(x, y));
    onChange(x / len, y / len);
  }
  function release() { held.current = null; onChange(0, 0); }
  return <div className="stick" aria-label="Sterowanie ruchem" onPointerDown={e => {
    held.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); move(e);
  }} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}><span>R U C H</span></div>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [modal, setModal] = useState<Modal>(null);
  const [paused, setPaused] = useState(false);
  const [pack, setPack] = useState(initialPack);
  const [chosen, setChosen] = useState<WeaponId | undefined>();
  const [hud, setHud] = useState<HudState | null>(null);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [record, setRecord] = useState(false);
  const [best, setBest] = useState(() => Number(readSetting("blok7-best")) || 0);
  const [muted, setMuted] = useState(() => readSetting("blok7-mute") === "1");
  const [musicMuted, setMusicMuted] = useState(() => readSetting("blok7-music-mute") === "1");
  const [full, setFull] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const [session, setSession] = useState<{ seed: number; id: number; slots: Slots; saved?: RunCheckpoint } | null>(null);
  const [canResume, setCanResume] = useState(() => !!parseCheckpoint(readSetting(CHECKPOINT_KEY)));
  const checkpoint = useRef<RunCheckpoint | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const previewSound = useRef<Sfx | null>(null);
  const soundPrefs = useRef({ muted, musicMuted });
  soundPrefs.current = { muted, musicMuted };

  const saveRun = useCallback((g: Game | null) => {
    const saved = g?.checkpoint();
    if (!saved) return;
    checkpoint.current = saved;
    saveSetting(CHECKPOINT_KEY, JSON.stringify(saved));
    setCanResume(true);
  }, []);

  const clearRun = useCallback(() => {
    checkpoint.current = null;
    saveSetting(CHECKPOINT_KEY, "");
    setCanResume(false);
  }, []);

  useEffect(() => {
    saveSetting("blok7-mute", muted ? "1" : "0");
    saveSetting("blok7-music-mute", musicMuted ? "1" : "0");
    for (const audio of [game.current, previewSound.current]) {
      audio?.setMuted(muted); audio?.setMusicMuted(musicMuted);
    }
  }, [muted, musicMuted]);

  useEffect(() => {
    if (!session || !canvas.current) return;
    const g = new Game(canvas.current, {
      onHud: setHud, onPause: p => { setPaused(p); if (p) saveRun(g); },
      onInventory: open => setModal(open ? "inventory" : null),
      onJournal: () => { g.setPaused(true); setModal("journal"); },
      onEnd: s => {
        clearRun();
        const old = Number(readSetting("blok7-best")) || 0;
        const high = Math.max(old, s.score);
        saveSetting("blok7-best", String(high));
        setBest(high); setRecord(s.score > old); setStats(s);
        setPaused(false); setModal(null); setScreen(s.won ? "won" : "dead");
      },
    });
    game.current = g;
    if (import.meta.env.DEV) {
      (window as unknown as { game?: Game }).game = g;
    }
    g.setMuted(soundPrefs.current.muted); g.setMusicMuted(soundPrefs.current.musicMuted);
    g.start(session.seed, session.slots, session.saved);
    function onHidden() { if (document.hidden) g.setPaused(true); }
    const save = () => saveRun(g);
    const autosave = window.setInterval(save, 8000);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", save);
      window.clearInterval(autosave);
      g.destroy(); game.current = null;
    };
  }, [session, saveRun, clearRun]);

  useEffect(() => {
    const onFull = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFull);
    return () => { document.removeEventListener("fullscreenchange", onFull); previewSound.current?.destroy(); };
  }, []);

  function begin(same = false, saved?: RunCheckpoint) {
    if (!saved) clearRun();
    previewSound.current?.destroy(); previewSound.current = null;
    setScreen("play"); setModal(null); setPaused(false); setHud(null); setStats(null); setChosen(undefined);
    setSession(previous => {
      let seed = saved?.seed ?? (same && previous ? previous.seed : crypto.getRandomValues(new Uint32Array(1))[0]);
      if (!saved && !same) {
        const last = readSetting("blok7-layout-profile");
        for (let n = 0; n < 12; n++) {
          const p = layoutProfile(seed);
          if (`${p.family}:${p.start}` !== last) break;
          seed = crypto.getRandomValues(new Uint32Array(1))[0];
        }
        const p = layoutProfile(seed);
        saveSetting("blok7-layout-profile", `${p.family}:${p.start}`);
      }
      return { seed, id: (previous?.id ?? 0) + 1, slots: [...pack.slots], saved };
    });
  }
  function resumeRun() {
    const saved = checkpoint.current ?? parseCheckpoint(readSetting(CHECKPOINT_KEY));
    if (saved) begin(false, saved);
    else setCanResume(false);
  }
  function toMenu() {
    if (screen === "play") saveRun(game.current);
    setSession(null); setHud(null); setPaused(false); setModal(null); setScreen("menu");
  }
  function openPack(id?: WeaponId) {
    setChosen(id);
    if (screen === "play") game.current?.setInventory(true);
    else setModal("inventory");
  }
  const closeModal = useCallback(() => {
    if (game.current && modal === "inventory") game.current.setInventory(false);
    if (game.current && modal === "journal") game.current.setPaused(false);
    setModal(null); setChosen(undefined);
  }, [modal]);
  function openJournal() {
    game.current?.setPaused(true);
    setModal("journal");
  }
  const assign = useCallback((slot: number, id: WeaponId | null) => {
    if (game.current) { game.current.assignWeapon(slot, id); return; }
    setPack(current => {
      const next = assignSlot(current, slot, id);
      saveSetting("blok7-loadout", JSON.stringify(next.slots));
      return next;
    });
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === "KeyM") setMusicMuted(m => !m);
      if (screen !== "menu") return;
      if (e.code === "KeyI" && !modal) {
        e.preventDefault();
        setChosen(undefined); setModal("inventory");
      }
      if (e.key === "?" && !modal) setModal("guide");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [screen, modal, closeModal]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFullscreenError("");
    } catch { setFullscreenError("Ta przeglądarka nie udostępnia pełnego ekranu."); }
  }
  function audioSettings() {
    if (!game.current && typeof AudioContext !== "undefined" && !previewSound.current) {
      previewSound.current = new Sfx();
      previewSound.current.setMuted(muted); previewSound.current.setMusicMuted(musicMuted); previewSound.current.unlock();
    }
    setModal("audio");
  }

  return <div className="app">
    {screen === "menu" && <div className="launcher">
      <header className="terminal-header">
        <button className="brand" aria-label="BLOK 7" onClick={() => setModal(null)}><BuildingMark /><span>BLOK <b>7</b></span></button>
        <div className="header-tools">
          <button className="audio-button" onClick={audioSettings} aria-label="Ustawienia dźwięku"><Icon name={muted ? "muted" : "volume"} size={17} /></button>
          <button className="square-btn" aria-label={full ? "Wyłącz pełny ekran" : "Pełny ekran"} onClick={toggleFullscreen}><Icon name={full ? "collapse" : "expand"} size={17} /></button>
        </div>
      </header>
      <main className="title-scene" style={{ backgroundImage: `url(${roofScene})` }}>
        <div className="scene-shade" /><div className="scene-grain" />
        <section className="hero-inner">
          <div className="genre-line"><span className="hazard" />SURVIVAL HORROR · PIXEL ART</div>
          <h1><span className="sr-only">BLOK 7</span><Wordmark /></h1>
          <p className="hero-description">Zejdź w mrok opuszczonego bloku.<br />Przetrwaj noc i dotrzyj na dach.</p>
          <div className="hero-actions">
            <button className="action-primary" onClick={() => begin()}><span>WEJDŹ DO BLOKU</span><Icon name="arrow" size={18} /></button>
            <button className="action-secondary" onClick={() => setModal("guide")}>STEROWANIE</button>
          </div>
          <nav className="hero-links" aria-label="Menu">
            {canResume && <button onClick={resumeRun}><Icon name="play" size={15} /> Wznów wyprawę</button>}
            <button onClick={() => openPack()}><Icon name="pack" size={15} /> Ekwipunek</button>
            {best > 0 && <em>Rekord {String(best).padStart(6, "0")}</em>}
          </nav>
        </section>
      </main>
      {fullscreenError && <button className="fullscreen-note" onClick={() => setFullscreenError("")}>{fullscreenError} <Icon name="close" size={12}/></button>}
    </div>}

    {screen !== "menu" && <div className="stage">
      <canvas ref={canvas} aria-label="BLOK 7: plansza gry. WASD: ruch, E: interakcja i ukrywanie, F: latarka, Tab: ekwipunek." />
      <div className={`vignette ${hud?.lowHp ? "danger" : ""}`}/>
      {screen === "play" && hud && <>
        <Hud hud={hud} onInventory={() => openPack()} onJournal={openJournal} onSlot={i => game.current?.selectSlot(i)} onPause={() => game.current?.setPaused(true)} onInteract={() => game.current?.touchTap("interact")} onHold={on => game.current?.setTouchHold(on)} onChoose={i => game.current?.chooseOption(i)}
          onHint={action => {
            if (action === "flash") game.current?.touchTap("flash");
            if (action === "interact") game.current?.touchTap("interact");
            if (action === "inventory") openPack();
          }} hintLock={!!hud.hidden || hud.flashOn || hud.time > 150}/>
        {!paused && !modal && <div className="touch"><Stick onChange={(x,y) => { game.current?.setTouchMove(x,y); if (Math.hypot(x,y)>0.1) game.current?.setTouchAim(x,y); }}/>
          <div className="touch-actions"><button onClick={() => game.current?.touchTap("flash")}>Latarka</button><button onClick={() => game.current?.touchTap("reload")}>Przeładuj</button>
          <button className="touch-attack" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); game.current?.setTouchFire(true); }} onPointerUp={() => game.current?.setTouchFire(false)} onPointerCancel={() => game.current?.setTouchFire(false)}>Atak</button>
           <button onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); game.current?.setTouchHold(true); }} onPointerUp={() => game.current?.setTouchHold(false)} onPointerCancel={() => game.current?.setTouchHold(false)} onLostPointerCapture={() => game.current?.setTouchHold(false)}>Użyj</button></div></div>}
      </>}
      {screen === "play" && paused && !modal && <Dialog title="Pauza" eyebrow="BLOK 7 / CHWILA CISZY" onClose={() => game.current?.setPaused(false)}>
        <p className="dialog-intro">{hud?.floorName} · Czas przetrwania: {duration(hud?.time ?? 0)}</p>
        <div className="pause-actions"><button className="action-primary" onClick={() => game.current?.setPaused(false)}><Icon name="play"/>WZNÓW GRĘ</button>
          <button className="action-secondary" onClick={() => openPack()}><Icon name="pack"/>EKWIPUNEK</button>
          <button className="action-secondary" onClick={audioSettings}><Icon name="volume"/>DŹWIĘK</button>
          <button className="action-secondary" onClick={() => setModal("guide")}><Icon name="book"/>PORADNIK</button></div>
         <button className="abandon" onClick={toMenu}>Zapisz i wróć do menu<Icon name="arrow" size={14}/></button>
      </Dialog>}
    </div>}

    {modal === "inventory" && <Inventory pack={screen === "play" && hud ? hud.inventory : pack} initial={chosen} onAssign={assign} onClose={closeModal} playing={screen === "play"}/>}
    {modal === "guide" && <Guide onClose={closeModal}/>}
    {modal === "journal" && hud && <Dialog title="Dziennik ocalałego" eyebrow="BLOK 7 / ZAPISANE WSKAZÓWKI" onClose={closeModal}>
      {hud.quest && <section className="journal-current"><span className="micro">AKTUALNE ZADANIE</span><h3>{hud.quest.title}</h3><p>{hud.quest.step}</p></section>}
      <ol className="journal-entries" aria-label="Historia odkrytych wskazówek">
        {[...hud.journal].reverse().map((entry, i) => <li key={`${entry}-${i}`}>{entry}</li>)}
      </ol>
      <footer className="dialog-bottom"><span className="micro">WIEDZA ZAPISYWANA W TEJ WYPRAWIE</span><button className="action-primary small" onClick={closeModal}>WRÓĆ DO GRY<Icon name="check" size={15}/></button></footer>
    </Dialog>}
    {modal === "audio" && <Dialog title="Dźwięk" eyebrow="BLOK 7 / USTAWIENIA" onClose={closeModal}>
      <div className="audio-settings"><div><span><Icon name="volume"/><b>Dźwięk gry</b></span><button role="switch" aria-label="Dźwięk gry" aria-checked={!muted} className="toggle" onClick={() => setMuted(v=>!v)}><i/>{muted ? "WYŁ." : "WŁ."}</button></div>
        <div><span><Icon name="music"/><b>Muzyka w tle</b></span><button role="switch" aria-label="Muzyka w tle" aria-checked={!musicMuted} className="toggle" onClick={() => setMusicMuted(v=>!v)}><i/>{musicMuted ? "WYŁ." : "WŁ."}</button></div></div>
      <footer className="dialog-bottom"><span className="micro">USTAWIENIA ZAPISYWANE LOKALNIE</span><button className="action-primary small" onClick={closeModal}>GOTOWE<Icon name="check" size={15}/></button></footer>
    </Dialog>}
    {(screen === "dead" || screen === "won") && stats && <main className="results" style={{backgroundImage:`linear-gradient(90deg, #0b1015f0, #0b101577), url(${screen === "won" ? roof : hall})`}}>
      <div className="result-content"><div className="genre-line"><span className="hazard"/>{screen === "won" ? "EWAKUACJA ZAKOŃCZONA" : "KONIEC WYPRAWY"}</div>
      <h1>{screen === "won" ? "ŚWIT" : "KONIEC NOCY"}</h1><p>{screen === "won" ? "Wielki padł. Śmigłowiec zabiera cię z dachu, gdy nad blokiem wstaje świt." : "W klatce znów zapadła cisza. Następna noc przyniesie nowy układ mieszkań."}</p>
      <dl className="result-stats"><div><dt>WYNIK</dt><dd>{stats.score}</dd></div><div><dt>CZAS</dt><dd>{duration(stats.time)}</dd></div><div><dt>POZIOM</dt><dd>{FLOOR_META[stats.floor].name}</dd></div><div><dt>ZABICI</dt><dd>{stats.kills}</dd></div></dl>
      {record && <div className="personal-best"><Icon name="trophy"/>Nowy rekord</div>}
      <div className="hero-actions"><button className="action-primary" onClick={() => begin()}><Icon name="play"/>NOWA NOC</button><button className="action-secondary" onClick={() => begin(true)}>POWTÓRZ MAPĘ</button></div>
      <button className="return-menu" onClick={toMenu}><Icon name="back" size={16}/>Menu główne</button></div>
    </main>}
  </div>;
}