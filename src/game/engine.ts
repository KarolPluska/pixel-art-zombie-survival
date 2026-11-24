import { Sfx } from "./audio";
import { CHECKPOINT_VERSION, type RunCheckpoint, type SavedFloor } from "./checkpoint";
import { createEnvironmentState, Environment, heroId, type EnvironmentState, type EnvironmentWorld } from "./environment";
import { drawEnvironmentGround, drawEnvironmentSignals, environmentProps } from "./environment-art";
import { EventDirector, type EventWorld, type Resource } from "./events";
import { createTacticalState, TacticalDirector, type Stimulus, type TacticalState } from "./tactical";
import { noiseLabel, TACTICAL } from "./tactical-config";
import { drawCrawler, drawTacticalProps, isTacticalProp } from "./tactical-art";
import {
  defaultFloorQuestState,
  initialBuildingState,
  makeBuildingPlan,
  type BuildingPlan,
  type BuildingState,
  type Cell,
  type FloorQuestState,
  type PassageState,
} from "./vertical-layout";
import {
  PASSAGE_H,
  PASSAGE_W,
  drawLiftRideScene,
  drawPassageMinimap,
  drawPassageScene,
  drawVerticalWorld,
  floorShortName,
  floorTag,
} from "./vertical-scene";
import { WEAPONS, assignSlot, copyInventory, discover, isWeapon, starterInventory, type Slots, type WeaponId } from "./inventory";
import { generateFloor } from "./generate";
import { buildFallbackCorridorPatrol } from "./corridor-patrol";
import { astar } from "./path";
import { COL, FLOOR_COUNT, TILE, Tile } from "./palette";
import { SurvivorRig } from "./rig";
import { Art, drawSkyTile, pixLine, type Dir } from "./sprites";
import type { DoorInfo, FloorData, HudState, Prop, RunStats, WallDecal, ZombieKind } from "./types";

export interface GameHooks {
  onHud: (h: HudState) => void;
  onEnd: (s: RunStats) => void;
  onPause: (p: boolean) => void;
  onInventory?: (open: boolean) => void;
  onJournal?: () => void;
}

interface Zombie {
  x: number;
  y: number;
  kind: ZombieKind;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  dmg: number;
  attackCd: number;
  attackEvery: number;
  dir: Dir;
  animT: number;
  state: "idle" | "chase" | "dead";
  deadT: number;
  path: { x: number; y: number }[];
  pathT: number;
  alertT: number;
  alertMark: number;
  wanderT: number;
  hurtFlash: number;
  home: number;
  lastX: number;
  lastY: number;
  bashT: number;
  roarT: number;
  id: number;
  screamer: boolean;
  reinforcement: boolean;
  missionTag?: "lure";
  stimulus: "player" | "device" | "noise" | null;
  stimulusUntil: number;
  searchT: number;
  patrol: { x: number; y: number }[];
  patrolIndex: number;
  patrolPause: number;
  patrolStuck: number;
  patrolLastDist: number;
  patrolScanT: number;
  groupId?: number;
  grabWindup: number;
  grabCd: number;
  downT: number;
  bisected: boolean;
  seenWardrobe: { x: number; y: number } | null;
}

interface Bullet {
  bolt: boolean;
  foe: boolean;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  dmg: number;
  life: number;
}

interface Shell {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  col: string;
  life: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  col: string;
  size: number;
  glow?: boolean;
  gravity?: number;
}

interface DustMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

interface PopBubble {
  x: number;
  y: number;
  text: string;
  col: string;
  life: number;
  max: number;
}

interface LiveSurvivor {
  id: number;
  x: number;
  y: number;
  room: number;
  name: string;
  lines: string[];
  gift: "med" | "ammo" | "battery";
  variant: number;
  state: "hide" | "talk" | "flee" | "gone";
  vx: number;
  vy: number;
  fleeT: number;
  animT: number;
}

interface LiveFloor {
  data: FloorData;
  zombies: Zombie[];
  survivors: LiveSurvivor[];
  explored: Uint8Array;
  hasKey: boolean;
  blood: { x: number; y: number; n: number; seed: number }[];
  shells: Shell[];
  environment: EnvironmentState;
  tactical: TacticalState;
  director?: EventDirector;
}

const ZT: Record<ZombieKind, { hp: number; speed: number; dmg: number; every: number; r: number }> = {
  shambler: { hp: 48, speed: 30, dmg: 13, every: 0.95, r: 5 },
  runner: { hp: 30, speed: 62, dmg: 10, every: 0.58, r: 4.6 },
  brute: { hp: 118, speed: 22, dmg: 24, every: 1.12, r: 6.1 },
  boss: { hp: 640, speed: 27, dmg: 30, every: 1.25, r: 9 },
  crawler: { hp: 18, speed: 18, dmg: 6, every: 1.1, r: 3.5 },
};

function angDiff(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function dirFrom(a: number): Dir {
  const d = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (d < Math.PI * 0.25 || d >= Math.PI * 1.75) return "right";
  if (d < Math.PI * 0.75) return "down";
  if (d < Math.PI * 1.25) return "left";
  return "up";
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private lightCanvas: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private art: Art;
  private sfx = new Sfx();
  private hooks: GameHooks;
  private keys = new Set<string>();
  private raf = 0;
  private last = 0;
  private alive = true;

  private viewW = 320;
  private viewH = 200;
  private camX = 0;
  private camY = 0;
  private shake = 0;
  private mouseSX = 160;
  private mouseSY = 100;
  private aim = 0;
  private mouseDown = false;
  private touchMove = { x: 0, y: 0 };
  private touchAim = { x: 0, y: 0 };
  private touchAimOn = false;
  private touchFire = false;
  private touchHold = false;

  seed = 1;
  private time = 0;
  private kills = 0;
  private floorIndex = 0;
  private floor: LiveFloor | null = null;
  private lives: (LiveFloor | null)[] = [];
  private restored: (SavedFloor | null)[] = [];
  private generatorVersion: 1 | 2 = 2;
  private building: BuildingState = initialBuildingState();
  private buildingLayout: BuildingPlan = makeBuildingPlan(1);
  private verticalChoice: { targets: (number | null)[]; labels: string[]; label: string; text: string; mode?: "service" } | null = null;
  private verticalWork: { label: string; progress: number; active: boolean } | null = null;
  private px = 0;
  private py = 0;
  private hp = 100;
  private maxHp = 100;
  private stamina = 100;
  private staminaLock = false;
  private pack = starterInventory();
  private inventoryOpen = false;
  private get weapon(): WeaponId { return this.pack.slots[this.pack.active]!; }
  private reloadT = 0;
  private reloadMax = 0.8;
  private meleeCd = 0;
  private meleeT = 0;
  private shootCd = 0;
  private flashT = 0;
  private muzzleLight = 0;
  private recoil = 0;
  private invuln = 0;
  private hurt = 0;
  private environmentHit = false;
  private battery = 100;
  private flashOn = true;
  private hasKey = false;
  private dir: Dir = "down";
  private moving = false;
  private animT = 0;
  private propSolid = new Uint8Array(0);

  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private dust: DustMote[] = [];
  private fixtures: WallDecal[] = [];
  private vis = new Uint8Array(0);
  private light = new Float32Array(0);

  private paused = false;
  private dead = false;
  private won = false;
  private ended = false;
  private deadT = 0;
  private wonT = 0;
  private message = "";
  private messageT = 0;
  private bannerT = 0;
  private interactLock = 0;
  private noise = 0;
  private flareCharge = 0;
  private flareSfxT = 0;
  private transition: { dir: number; t: number; phase: "out" | "in" } | null = null;
  private fade = 0;
  private hint1 = false;
  private hint2 = false;
  private heartT = 0;
  private stepT = 0;
  private hudAcc = 0;
  private sprintPulse = 0;
  private rig = new SurvivorRig();
  private meleeDur = 0.4;
  private meleeHit = true;
  private sprinting = false;
  private lightning = 0;
  private boltT = 6;
  private fxT = 0;
  private heliPhase: "in" | "landed" | null = null;
  private heliT = 0;
  private heliPos = { x: 0, y: 0, h: 0 };
  private heliTickT = 0;
  private bossKilled = false;
  private bossWarned = false;
  private popups: PopBubble[] = [];
  private activeDialog: { npc: LiveSurvivor; lineIdx: number; charIdx: number; whisperT: number } | null = null;
  private director: EventDirector | null = null;
  private environment: Environment | null = null;
  private tactical: TacticalDirector | null = null;
  private grabbedBy: number | null = null;
  private grabStruggles = 0;
  private grabTick = 0;
  private grabProtection = 0;
  private npcWait: number = TACTICAL.npc.firstDelay;
  private npcSeenCount = 0;
  private zid = 1;
  private hideReturn = { x: 0, y: 0 };
  private wasHidden = false;
  private autoFlash = false;
  private darknessContext: string | null = null;

  constructor(private canvas: HTMLCanvasElement, hooks: GameHooks) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    this.ctx = ctx;
    this.lightCanvas = document.createElement("canvas");
    const lctx = this.lightCanvas.getContext("2d");
    if (!lctx) throw new Error("lightCanvas");
    this.lctx = lctx;
    this.hooks = hooks;
    this.art = new Art();
    this.resize();
    this.initDust();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.resize);
    canvas.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    canvas.addEventListener("contextmenu", this.onContext);
    canvas.addEventListener("pointerdown", this.onPointerDown);
  }

  private initDust() {
    this.dust = [];
    for (let i = 0; i < 34; i++) {
      this.dust.push({
        x: Math.random() * 480,
        y: Math.random() * 320,
        vx: (Math.random() - 0.5) * 4.5,
        vy: -1.5 - Math.random() * 2.5,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  start(seed: number, slots?: Slots, saved?: RunCheckpoint) {
    this.seed = seed >>> 0;
    this.generatorVersion = saved ? saved.generatorVersion ?? 1 : 2;
    this.building = saved ? structuredClone(saved.building) : initialBuildingState();
    this.buildingLayout = makeBuildingPlan(this.seed);
    this.verticalChoice = null;
    this.verticalWork = null;
    this.time = saved?.time ?? 0;
    this.kills = saved?.kills ?? 0;
    this.hp = saved?.hero.hp ?? 100;
    this.stamina = saved?.hero.stamina ?? 100;
    this.pack = saved ? copyInventory(saved.pack) : starterInventory(slots);
    this.inventoryOpen = false;
    this.battery = saved?.hero.battery ?? 100;
    this.flashOn = saved?.hero.flash ?? true;
    this.autoFlash = false;
    this.darknessContext = null;
    this.dead = false;
    this.won = false;
    this.ended = false;
    this.heliPhase = null;
    this.heliT = 0;
    this.bossKilled = saved?.bossKilled ?? false;
    this.bossWarned = false;
    this.popups = [];
    this.activeDialog = null;
    this.lives = [];
    this.restored = saved ? [...saved.floors] : [];
    this.enter(saved?.floor ?? 0, "start");
    if (saved) {
      this.px = saved.hero.x;
      this.py = saved.hero.y;
      this.unstuck();
      this.camX = this.px - this.viewW / 2;
      this.camY = this.py - this.viewH / 2;
      this.say("Wyprawa wznowiona. Rozejrzyj si\u0119, zanim ruszysz dalej.");
    }
    this.last = performance.now();
    this.loop(this.last);
  }

  checkpoint(): RunCheckpoint | null {
    if (!this.floor || this.dead || this.won || this.ended) return null;
    const floors = Array.from({ length: FLOOR_COUNT }, (_, i): SavedFloor | null => {
      const f = this.lives[i];
      if (!f) return this.restored[i] ?? null;
      return {
        layout: f.data.seed,
        hasKey: i === this.floorIndex ? this.hasKey : f.hasKey,
        environment: { clock: f.environment.clock, features: Object.fromEntries(Object.entries(f.environment.features).map(([id, s]) => [id, { ...s }])) },
        explored: f.explored.join(""),
        opened: f.data.props.filter((p) => p.opened).map((p) => p.id),
        survivorsGone: f.survivors.filter((s) => s.state === "flee" || s.state === "gone").map((s) => s.id),
        doors: f.data.doors.map((d) => ({ ...d })),
        zombies: f.zombies.map(({ x, y, hp, home, kind, state, alertT, lastX, lastY, screamer, reinforcement, missionTag, downT, bisected, seenWardrobe }) =>
          ({ x, y, hp, home, kind, state, alertT, lastX, lastY, screamer, reinforcement,
            ...(missionTag ? { missionTag } : {}), downT, bisected, seenWardrobe: seenWardrobe ? { ...seenWardrobe } : null })),
        tactical: structuredClone(f.tactical),
      };
    });
    const pos = this.director?.hidden ? this.hideReturn : { x: this.px, y: this.py };
    return { version: CHECKPOINT_VERSION, generatorVersion: this.generatorVersion, seed: this.seed, floor: this.floorIndex, time: this.time, kills: this.kills,
      hero: { ...pos, hp: this.hp, stamina: this.stamina, battery: this.battery, flash: this.flashOn },
      pack: copyInventory(this.pack), bossKilled: this.bossKilled, building: structuredClone(this.building), floors };
  }

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.sfx.destroy();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.resize);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("contextmenu", this.onContext);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
  }

  setMuted(m: boolean) {
    this.sfx.setMuted(m);
  }

  setMusicMuted(m: boolean) {
    this.sfx.setMusicMuted(m);
  }

  setPaused(p: boolean) {
    if (this.dead || this.won) return;
    this.releaseInput();
    this.paused = p;
    this.hooks.onPause(p);
  }

  togglePause() {
    this.setPaused(!this.paused);
  }

  private releaseInput() {
    this.keys.clear();
    this.mouseDown = this.touchFire = this.touchHold = false;
    this.touchMove = { x: 0, y: 0 };
    this.environment?.cancelWork();
  }

  setInventory(open: boolean) {
    if (this.dead || this.won || this.ended) return;
    this.inventoryOpen = open;
    this.releaseInput();
    this.hooks.onInventory?.(open);
    this.emitHud(true);
  }

  assignWeapon(slot: number, id: WeaponId | null) {
    if (!this.inventoryOpen) return;
    this.pack = assignSlot(this.pack, slot, id);
    this.reloadT = this.meleeT = this.flashT = 0;
    this.meleeHit = true;
    this.emitHud(true);
  }

  selectSlot(slot: number) {
    if (this.paused || this.inventoryOpen || this.dead || this.won || !this.pack.slots[slot]) return;
    this.pack.active = slot;
    this.reloadT = this.meleeT = this.flashT = 0;
    this.meleeHit = true;
    this.sfx.dry();
    this.emitHud(true);
  }

  setTouchMove(x: number, y: number) {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  setTouchAim(x: number, y: number) {
    this.touchAim.x = x;
    this.touchAim.y = y;
    this.touchAimOn = Math.hypot(x, y) > 0.25;
  }

  setTouchFire(on: boolean) {
    this.touchFire = on;
    this.sfx.unlock();
    if (on) this.shoot();
  }

  setTouchHold(on: boolean) {
    this.touchHold = on;
    if (on && this.grabbedBy !== null) { this.struggleGrab(); return; }
    if (on) this.interact();
    this.sfx.unlock();
  }

  touchTap(action: "melee" | "interact" | "flash" | "reload" | "switch") {
    this.sfx.unlock();
    if (this.paused || this.dead || this.won) return;
    if (action === "melee") this.melee();
    if (action === "interact") {
      if (this.grabbedBy !== null) this.struggleGrab(); else this.interact();
    }
    if (action === "flash") this.toggleFlash();
    if (action === "reload") this.startReload();
    if (action === "switch") this.switchWeapon();
  }

  private resize = () => {
    const scale = Math.max(2, Math.min(4, Math.floor(Math.min(window.innerWidth / 400, window.innerHeight / 260))));
    this.viewW = Math.max(180, Math.floor(window.innerWidth / scale));
    this.viewH = Math.max(140, Math.floor(window.innerHeight / scale));
    this.canvas.width = this.viewW;
    this.canvas.height = this.viewH;
    this.canvas.style.width = `${this.viewW * scale}px`;
    this.canvas.style.height = `${this.viewH * scale}px`;
    this.lightCanvas.width = this.viewW;
    this.lightCanvas.height = this.viewH;
  };

  private onContext = (e: Event) => e.preventDefault();

  private onPointerDown = () => this.sfx.unlock();

  private onMouseMove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseSX = ((e.clientX - rect.left) / rect.width) * this.viewW;
    this.mouseSY = ((e.clientY - rect.top) / rect.height) * this.viewH;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.paused || this.inventoryOpen || this.activeDialog || this.dead || this.won) return;
    this.sfx.unlock();
    this.onMouseMove(e);
    const target = this.aimWorld();
    this.aim = Math.atan2(target.y - this.py, target.x - this.px);
    if (e.button === 0) { this.mouseDown = true; this.shoot(); }
    if (e.button === 2) this.melee();
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!this.inventoryOpen && document.querySelector("dialog[open]")) return;
    this.sfx.unlock();
    if ((e.code === "Tab" || e.code === "KeyI") && !e.repeat && !this.activeDialog && !this.director?.choice && !this.inventoryOpen) {
      e.preventDefault();
      this.setInventory(!this.inventoryOpen);
      return;
    }
    if (this.grabbedBy !== null) {
      if (e.code === "KeyE" && !e.repeat) { e.preventDefault(); this.struggleGrab(); }
      else if (e.code === "Escape" && !e.repeat) this.togglePause();
      return;
    }
    if (this.inventoryOpen) {
      if (e.code === "Escape") { e.preventDefault(); this.setInventory(false); }
      else if (e.code === "KeyI" && !e.repeat) { e.preventDefault(); this.setInventory(false); }
      return;
    }
    if (this.verticalChoice) {
      if (e.code === "Tab") return;
      e.preventDefault();
      if (/^Digit[123]$/.test(e.code)) this.chooseOption(Number(e.code.slice(-1)) - 1);
      else if (e.code === "Escape") this.chooseOption(this.verticalChoice.targets.length - 1);
      else if (e.code === "KeyE" || e.code === "Enter") this.chooseOption(0);
      return;
    }
    if (this.director?.choice) {
      if (e.code === "Tab") return;
      e.preventDefault();
      if (/^Digit[123]$/.test(e.code)) this.chooseOption(Number(e.code.slice(-1)) - 1);
      else if (e.code === "Escape") this.chooseOption(this.director.choice.options.length - 1);
      else if (e.code === "KeyE" || e.code === "Enter" || e.code === "Space") this.chooseOption(0);
      return;
    }
    const block = ["Tab", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyE", "KeyR", "KeyF", "KeyH", "KeyJ"];
    if (block.includes(e.code)) e.preventDefault();
    if (e.code === "Escape") {
      e.preventDefault();
      if (!e.repeat) this.togglePause();
      return;
    }
    if (e.repeat) {
      this.keys.add(e.code);
      return;
    }
    this.keys.add(e.code);
    if (this.paused || this.dead || this.won) return;
    if (e.code === "KeyJ") { this.hooks.onJournal?.(); return; }
    if (e.code === "KeyE") this.interact();
    if (e.code === "KeyF") this.toggleFlash();
    if (e.code === "KeyR") this.startReload();
    if (e.code === "KeyQ") this.switchWeapon();
    if (/^Digit[123]$/.test(e.code)) this.selectSlot(Number(e.code.slice(-1)) - 1);
    if (e.code === "Space") this.shoot();
    if (e.code === "KeyH") this.toggleHide();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private loop = (now: number) => {
    if (!this.alive || this.ended) return;
    const dt = Math.min(0.033, (now - this.last) / 1000) || 0.016;
    this.last = now;
    this.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  private data() {
    return this.floor!.data;
  }

  private idx(x: number, y: number) {
    return y * this.data().w + x;
  }

  private inb(x: number, y: number) {
    const d = this.data();
    return x >= 0 && y >= 0 && x < d.w && y < d.h;
  }

  private tileAt(tx: number, ty: number) {
    if (!this.inb(tx, ty)) return 0;
    return this.data().tiles[this.idx(tx, ty)];
  }

  private doorAt(tx: number, ty: number): DoorInfo | undefined {
    return this.data().doors.find((d) => d.x === tx && d.y === ty);
  }

  private solidTile(tx: number, ty: number) {
    return this.solidBaseTile(tx, ty) || (this.environment?.blocksTile(tx, ty) ?? false);
  }

  private solidBaseTile(tx: number, ty: number) {
    if (!this.inb(tx, ty)) return true;
    const t = this.tileAt(tx, ty);
    if (t === Tile.Wall || t === Tile.Window || t === Tile.Sky || t === Tile.Door || t === Tile.Hole) return true;
    if (this.propSolid[this.idx(tx, ty)]) return true;
    return false;
  }

  private opaque(tx: number, ty: number) {
    if (!this.inb(tx, ty)) return true;
    const t = this.tileAt(tx, ty);
    if (t === 0 || t === 6 || t === 9) return true;
    if (t === 2) {
      const d = this.doorAt(tx, ty);
      return !(d && (d.open || d.broken));
    }
    return false;
  }

  private shoveOut(x: number, y: number, r: number, limit = 14) {
    if (this.canOccupy(x, y, r)) return { x, y };
    for (let rad = 1; rad <= limit; rad++) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const nx = x + Math.cos(a) * rad;
        const ny = y + Math.sin(a) * rad;
        if (this.canOccupy(nx, ny, r)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  }

  private canOccupy(x: number, y: number, r: number) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tx = Math.floor((x + Math.cos(a) * r) / TILE);
      const ty = Math.floor((y + Math.sin(a) * r) / TILE);
      if (this.solidBaseTile(tx, ty)) return false;
    }
    return !this.solidBaseTile(Math.floor(x / TILE), Math.floor(y / TILE)) && !this.environment?.blocksBody(x, y, r);
  }

  private moveBody(x: number, y: number, r: number, dx: number, dy: number) {
    let nx = x;
    let ny = y;
    // A live jet stops entry into its core, but a caught actor can still retreat.
    const caughtInSteam = this.environment?.inSteam(x, y);
    const canStep = (tx: number, ty: number) => this.canOccupy(tx, ty, r) && (caughtInSteam || !this.environment?.inSteam(tx, ty));
    if (canStep(x + dx, y)) nx = x + dx;
    if (canStep(nx, y + dy)) ny = y + dy;
    if (nx === x && ny === y && (dx !== 0 || dy !== 0)) {
      if (canStep(x + Math.sign(dx) * 0.8, y)) nx = x + Math.sign(dx) * 0.8;
      if (canStep(x, y + Math.sign(dy) * 0.8)) ny = y + Math.sign(dy) * 0.8;
    }
    const tx = Math.floor(nx / TILE);
    const ty = Math.floor(ny / TILE);
    const left = this.solidTile(tx - 1, ty);
    const right = this.solidTile(tx + 1, ty);
    const up = this.solidTile(tx, ty - 1);
    const down = this.solidTile(tx, ty + 1);
    const gx = left && right && !up && !down ? nx + ((tx + 0.5) * TILE - nx) * 0.45 : nx;
    const gy = up && down && !left && !right ? ny + ((ty + 0.5) * TILE - ny) * 0.45 : ny;
    if ((gx !== nx || gy !== ny) && canStep(gx, gy)) return { x: gx, y: gy };
    return { x: nx, y: ny };
  }

  private buildPropSolid() {
    const d = this.data();
    const s = new Uint8Array(d.w * d.h);
    for (const p of d.props) {
      if (!p.solid) continue;
      for (let y = p.y; y < p.y + p.h; y++) {
        for (let x = p.x; x < p.x + p.w; x++) {
          if (this.inb(x, y)) s[this.idx(x, y)] = 1;
        }
      }
    }
    return s;
  }

  private makeZombie(s: {
    x: number;
    y: number;
    kind: ZombieKind;
    room: number;
    missionTag?: Zombie["missionTag"];
    patrol?: { x: number; y: number }[];
    groupId?: number;
  }): Zombie {
    const st = ZT[s.kind];
    const mult = s.kind === "boss" ? 1 : 1 + this.floorIndex * 0.05;
    const presetPatrol = s.patrol?.length ? s.patrol.map((pt) => ({ x: pt.x, y: pt.y })) : [];
    const startIdx = presetPatrol.length >= 2 ? 1 : 0;
    return {
      x: s.x,
      y: s.y,
      kind: s.kind,
      hp: Math.round(st.hp * mult),
      maxHp: Math.round(st.hp * mult),
      r: st.r,
      speed: st.speed,
      dmg: st.dmg,
      attackCd: 0.4,
      attackEvery: st.every,
      dir: "down",
      animT: Math.random() * 2,
      state: "idle",
      deadT: 0,
      path: [],
      pathT: 0,
      alertT: 0,
      alertMark: 0,
      wanderT: 1 + Math.random() * 2,
      hurtFlash: 0,
      home: s.room,
      lastX: s.x,
      lastY: s.y,
      bashT: 0,
      roarT: 3,
      id: this.zid++,
      screamer: s.kind !== "boss" && Math.random() < 0.24,
      reinforcement: false,
      ...(s.missionTag ? { missionTag: s.missionTag } : {}),
      stimulus: null,
      stimulusUntil: 0,
      searchT: 0,
      patrol: presetPatrol,
      patrolIndex: startIdx,
      patrolPause: presetPatrol.length ? (s.groupId ? 0.35 + Math.random() * 0.7 : Math.random() * 1.1) : 0,
      patrolStuck: 0,
      patrolLastDist: Infinity,
      patrolScanT: Math.random() * 3,
      ...(s.groupId !== undefined ? { groupId: s.groupId } : {}),
      grabWindup: 0,
      grabCd: 2 + Math.random() * 5,
      downT: 0,
      bisected: s.kind === "crawler",
      seenWardrobe: null,
    };
  }

  private zombieById(id: number) {
    return this.floor?.zombies.find((z) => z.id === id) ?? null;
  }

  private spawnEventZombie(x: number, y: number, kind: ZombieKind) {
    if (!this.floor) return;
    const free = this.shoveOut(x, y, 5);
    const z = this.makeZombie({ x: free.x, y: free.y, kind, room: 0 });
    z.reinforcement = true;
    z.screamer = false;
    z.state = "chase";
    z.lastX = this.px;
    z.lastY = this.py;
    z.alertT = 8;
    this.floor.zombies.push(z);
  }

  private tacticalHint(): string {
    if (!this.floor || !this.tactical) return "";
    for (const p of this.data().props) {
      if (p.kind !== "radio" && p.kind !== "tv") continue;
      if (!this.closeEnough({ x: p.x, y: p.y }, 25)) continue;
      const d = this.tactical.ensureDevice(p.id, p.kind, (p.x + 0.5) * TILE, (p.y + 0.5) * TILE);
      return `E  ${d.on ? "wyłącz" : "włącz"} ${p.kind === "tv" ? "telewizor" : "radio"}`;
    }
    return "";
  }

  private interactTactical(): boolean {
    if (!this.floor || !this.tactical) return false;
    for (const p of this.data().props) {
      if ((p.kind !== "radio" && p.kind !== "tv") || !this.closeEnough({ x: p.x, y: p.y }, 25)) continue;
      const d = this.tactical.ensureDevice(p.id, p.kind, (p.x + 0.5) * TILE, (p.y + 0.5) * TILE);
      this.tactical.setDevice(p.id, !d.on);
      this.sfx.device(p.kind, d.on);
      this.interactLock = 0.2;
      this.say(`${p.kind === "tv" ? "Telewizor" : "Radio"} ${d.on ? "włączone — źródło hałasu w tym pomieszczeniu." : "wyłączone. Pobudzenie opadnie stopniowo."}`);
      return true;
    }
    return false;
  }

  private updateTactical(dt: number) {
    if (!this.floor || !this.tactical) return;
    for (const p of this.data().props) {
      if (p.kind === "radio" || p.kind === "tv") this.tactical.ensureDevice(p.id, p.kind, (p.x + 0.5) * TILE, (p.y + 0.5) * TILE);
      if (p.kind === "explosive") this.tactical.ensureBarrel(p.id);
    }
    const floorPopCap = () => {
      const d = this.data();
      if (d.corridorReport) return d.corridorReport.populationCap;
      const baseInitial = d.zombies.length;
      return Math.min(
        TACTICAL.waves.populationMax,
        Math.max(
          TACTICAL.waves.basePopulation + Math.floor(d.rooms.length / 5) * TACTICAL.waves.populationPerFiveRooms,
          baseInitial + TACTICAL.waves.waveHeadroom,
        ),
      );
    };
    this.tactical.update(dt, (device) => {
      if (Math.hypot(device.x - this.px, device.y - this.py) < 12 * TILE) this.sfx.device(device.kind, true);
    }, (source) => this.spawnTacticalWave(source), () => {
      const cap = floorPopCap();
      const alive = this.floor!.zombies.filter((z) => z.state !== "dead").length;
      return alive >= cap || this.tactical!.state.waveBudget < TACTICAL.waves.budgetPerZombie || this.floorIndex >= 10;
    });
    for (const p of this.data().props) {
      if (p.kind !== "explosive") continue;
      const b = this.tactical.state.barrels[p.id];
      if (b?.stage === "warning") {
        b.fuse = Math.max(0, b.fuse - dt);
        if (b.fuse <= 0) this.explodeBarrel(p.id);
      }
    }
    this.noise = this.tactical.state.playerNoise / 100;
    this.scheduleNpc(dt);
  }

  private spawnTacticalWave(source: Stimulus): number {
    if (!this.floor || !this.tactical) return 0;
    const alive = this.floor.zombies.filter((z) => z.state !== "dead").length;
    const cap = this.data().corridorReport?.populationCap ?? Math.min(
      TACTICAL.waves.populationMax,
      Math.max(TACTICAL.waves.basePopulation + Math.floor(this.data().rooms.length / 5), this.data().zombies.length + TACTICAL.waves.waveHeadroom),
    );
    const room = Math.max(0, Math.min(TACTICAL.waves.maxPerWave, cap - alive, Math.floor(this.tactical.state.waveBudget / TACTICAL.waves.budgetPerZombie)));
    if (room <= 0) return 0;
    const d = this.data();
    const escort = this.director?.escortActive ? this.director.civ(this.director.escortId) : null;
    const candidates: { x: number; y: number }[] = [];
    for (let y = 2; y < d.h - 2; y++) for (let x = 2; x < d.w - 2; x++) {
      const i = this.idx(x, y);
      if (!this.walkable(x, y, false) || this.vis[i]) continue;
      const wx = (x + 0.5) * TILE, wy = (y + 0.5) * TILE;
      const pd = Math.hypot(wx - this.px, wy - this.py);
      if (pd < TACTICAL.waves.spawnMinDistance || pd > TACTICAL.waves.spawnMaxDistance) continue;
      if (d.props.some((p) => p.solid && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h)) continue;
      if (this.director?.hidden && Math.hypot(wx - this.px, wy - this.py) < 6 * TILE) continue;
      if (escort && Math.hypot(wx - escort.x, wy - escort.y) < TACTICAL.waves.npcSafeDistance) continue;
      candidates.push({ x, y });
    }
    // Prefer stairwells and side corridors, then other reachable rooms.
    candidates.sort((a, b) => {
      const ar = d.roomOf[this.idx(a.x, a.y)], br = d.roomOf[this.idx(b.x, b.y)];
      const az = ar >= 0 ? d.roomZones[ar] : "", bz = br >= 0 ? d.roomZones[br] : "";
      return Number(bz.includes("KLATKA") || bz === "KORYTARZ") - Number(az.includes("KLATKA") || az === "KORYTARZ") || Math.random() - 0.5;
    });
    let spawned = 0;
    for (const c of candidates) {
      const from = { x: Math.floor(c.x), y: Math.floor(c.y) };
      const to = { x: Math.floor(source.x / TILE), y: Math.floor(source.y / TILE) };
      const path = astar(d.w, d.h, from.x, from.y, to.x, to.y, (x, y) => this.walkable(x, y, false));
      if (!path?.length) continue;
      const z = this.makeZombie({ x: (c.x + 0.5) * TILE, y: (c.y + 0.5) * TILE, kind: spawned === 0 && this.tactical.state.arousal > 65 ? "runner" : "shambler", room: d.roomOf[this.idx(c.x, c.y)] });
      z.reinforcement = true;
      z.screamer = false;
      z.state = "chase";
      z.stimulus = source.source === "device" ? "device" : "noise";
      z.stimulusUntil = this.tactical.clock + 8;
      z.lastX = source.x; z.lastY = source.y;
      z.alertT = 10;
      this.floor.zombies.push(z);
      if (++spawned >= room) break;
    }
    if (spawned) this.say("Słyszysz kolejne kroki w budynku. Hałas ściągnął posiłki.");
    return spawned;
  }

  private armBarrel(id: number, melee: boolean) {
    if (!this.tactical) return false;
    const b = this.tactical.ensureBarrel(id);
    if (b.stage !== "idle") return false;
    b.stage = "warning";
    b.fuse = melee ? TACTICAL.barrels.meleeFuse : TACTICAL.barrels.bulletFuse;
    this.sfx.environment("arc", 0.8);
    return true;
  }

  private hitBarrelAt(x: number, y: number, melee: boolean) {
    const p = this.data().props.find((prop) => prop.kind === "explosive" && this.tactical?.state.barrels[prop.id]?.stage !== "spent"
      && Math.hypot((prop.x + 0.5) * TILE - x, (prop.y + 0.5) * TILE - y) < (melee ? 18 : 7));
    return p ? this.armBarrel(p.id, melee) : false;
  }

  private explodeBarrel(id: number) {
    if (!this.floor || !this.tactical) return;
    const b = this.tactical.state.barrels[id];
    const p = this.data().props.find((prop) => prop.id === id);
    if (!p || !b || b.stage === "spent") return;
    b.stage = "spent";
    p.opened = true;
    const x = (p.x + 0.5) * TILE, y = (p.y + 0.5) * TILE;
    this.sfx.explosion();
    this.shake = Math.max(this.shake, 7);
    this.burst(x, y, "#ffb34f", 28, 130, true);
    this.burst(x, y, "#5e4235", 20, 85);
    this.data().decals.push({ x: p.x, y: p.y, kind: "scorch" });
    this.tactical.emit(x, y, TACTICAL.noise.barrel, 30 * TILE, 4, 38, "world");
    this.alert(x, y, 28 * TILE, true);
    const radius = TACTICAL.barrels.radius;
    if (!this.director?.hidden && Math.hypot(this.px - x, this.py - y) < radius && this.rayClear(p.x, p.y, Math.floor(this.px / TILE), Math.floor(this.py / TILE))) {
      this.damagePlayer(TACTICAL.barrels.playerDamage * (1 - Math.hypot(this.px - x, this.py - y) / (radius * 1.4)), x, y, true);
    }
    for (const z of this.floor.zombies) {
      if (z.state === "dead") continue;
      const dist = Math.hypot(z.x - x, z.y - y);
      if (dist > radius || !this.rayClear(p.x, p.y, Math.floor(z.x / TILE), Math.floor(z.y / TILE))) continue;
      this.hurtZombie(z, TACTICAL.barrels.zombieDamage * (1 - dist / (radius * 1.35)), z.x - x, z.y - y);
      if (z.hp > 0) z.downT = Math.max(z.downT, 1.25);
    }
    for (const civ of this.director?.civilians() ?? []) {
      if (civ.state === "dead" || civ.state === "gone") continue;
      const dist = Math.hypot(civ.x - x, civ.y - y);
      if (dist < radius && this.rayClear(p.x, p.y, Math.floor(civ.x / TILE), Math.floor(civ.y / TILE))) {
        this.director?.hurtCiv(civ, 60 * (1 - dist / (radius * 1.4)), civ.x - x, civ.y - y, false);
      }
    }
    // Chain reaction is scheduled once per other barrel and obeys wall occlusion.
    for (const other of this.data().props) {
      if (other.kind !== "explosive" || other.id === id) continue;
      const otherState = this.tactical.state.barrels[other.id];
      if (!otherState || otherState.stage !== "idle") continue;
      if (Math.hypot((other.x - p.x) * TILE, (other.y - p.y) * TILE) < TACTICAL.barrels.chainRadius
        && this.rayClear(p.x, p.y, other.x, other.y)) {
        otherState.stage = "warning";
        otherState.fuse = TACTICAL.barrels.chainFuse;
      }
    }
  }

  private struggleGrab() {
    if (this.grabbedBy === null) return;
    const z = this.zombieById(this.grabbedBy);
    if (!z || z.state === "dead") { this.grabbedBy = null; return; }
    this.grabStruggles = Math.min(5, this.grabStruggles + 1);
    this.shake = Math.max(this.shake, 2.2);
    this.hurt = 0.28;
    this.sfx.bash();
    z.hurtFlash = 0.1;
    if (this.grabStruggles >= 5) {
      const dx = z.x - this.px, dy = z.y - this.py, len = Math.hypot(dx, dy) || 1;
      const pushed = this.moveBody(z.x, z.y, z.r, dx / len * 18, dy / len * 18);
      z.x = pushed.x; z.y = pushed.y;
      z.downT = TACTICAL.ai.pushedDownSeconds;
      z.grabWindup = 0;
      z.grabCd = 5;
      z.stimulus = "player";
      this.grabbedBy = null;
      this.grabProtection = TACTICAL.ai.grabReleaseProtection;
      this.say("Odepchnięcie! Zombie leży — uciekaj albo dokończ atak.");
    }
    this.emitHud(true);
  }

  private updateGrab(dt: number) {
    const z = this.grabbedBy === null ? null : this.zombieById(this.grabbedBy);
    if (!z || z.state === "dead") {
      this.grabbedBy = null;
      this.grabStruggles = 0;
      this.grabProtection = Math.max(this.grabProtection, 1);
      return;
    }
    this.moving = false;
    this.mouseDown = this.touchFire = false;
    this.grabTick -= dt;
    if (this.grabTick <= 0) {
      this.grabTick = TACTICAL.ai.grabDamageInterval;
      this.damagePlayer(TACTICAL.ai.grabDamage, z.x, z.y);
      if (this.dead) this.grabbedBy = null;
    }
  }

  private scheduleNpc(dt: number) {
    if (!this.director) return;
    if (this.director.npcEncounterCount > this.npcSeenCount) {
      this.npcSeenCount = this.director.npcEncounterCount;
      this.building.npcDrought = 0;
      this.building.nextNpcAt = this.time + TACTICAL.npc.repeatDelayMin + Math.random() * (TACTICAL.npc.repeatDelayMax - TACTICAL.npc.repeatDelayMin);
    }
    this.npcWait -= dt;
    if (this.time < this.building.nextNpcAt || this.npcWait > 0 || this.director.choice || this.director.hidden) return;
    const escortBusy = this.lives.some((f) => f?.director?.escortActive) || this.director.escortActive;
    const preferred = this.building.npcDrought >= 2 && !escortBusy ? "escort" : undefined;
    if (this.director.requestNpc(preferred, escortBusy)) {
      this.building.npcTotal++;
      this.building.npcDrought = 0;
      this.npcSeenCount = this.director.npcEncounterCount;
      this.building.nextNpcAt = this.time + TACTICAL.npc.repeatDelayMin + Math.random() * (TACTICAL.npc.repeatDelayMax - TACTICAL.npc.repeatDelayMin);
    } else {
      // Deferred encounter is preserved rather than discarded; it does not reroll every frame.
      this.npcWait = TACTICAL.npc.retryDelay;
      this.building.npcDrought = Math.min(9, this.building.npcDrought + 1);
    }
  }

  private countResource(kind: Resource) {
    if (kind === "battery") return Math.round(this.battery);
    if (kind === "ammo") return this.pack.stock.rounds;
    return this.pack.stock[kind];
  }

  private giveResource(kind: Resource, amount: number) {
    if (kind === "battery") this.battery = Math.min(100, this.battery + amount);
    else if (kind === "ammo") this.pack.stock.rounds += amount;
    else this.pack.stock[kind] += amount;
  }

  private takeResource(kind: Resource, amount: number) {
    if (this.countResource(kind) < amount) return false;
    if (kind === "battery") this.battery = Math.max(0, this.battery - amount);
    else if (kind === "ammo") this.pack.stock.rounds -= amount;
    else this.pack.stock[kind] -= amount;
    return true;
  }

  private makeWorld(): EventWorld {
    const self = this;
    return {
      floor: () => self.data(),
      px: () => self.px,
      py: () => self.py,
      tileVisible: (tx, ty) => self.inb(tx, ty) && self.vis[self.idx(tx, ty)] === 1,
      tileExplored: (tx, ty) => !!self.floor && self.inb(tx, ty) && self.floor.explored[self.idx(tx, ty)] === 1,
      walk: (x, y, throughDoors) => self.walkable(x, y, !throughDoors),
      move: (x, y, r, dx, dy) => self.moveBody(x, y, r, dx, dy),
      los: (x0, y0, x1, y1) =>
        self.rayClear(Math.floor(x0 / TILE), Math.floor(y0 / TILE), Math.floor(x1 / TILE), Math.floor(y1 / TILE)),
      zombieList: () => (self.floor?.zombies ?? []).map((z) => ({ id: z.id, x: z.x, y: z.y, dead: z.state === "dead" })),
      hurtZombie: (id, dmg, dx, dy) => {
        const z = self.zombieById(id);
        if (z && z.state !== "dead") self.hurtZombie(z, dmg, dx, dy);
      },
      addZombie: (x, y, kind) => self.spawnEventZombie(x, y, kind),
      alertZombies: (x, y, radius) => self.alert(x, y, radius),
      hurtPlayer: (dmg, fx, fy) => self.damagePlayer(dmg, fx, fy),
      shootBullet: (x, y, angle, speed, dmg) => {
        self.bullets.push({
          bolt: false,
          foe: true,
          x,
          y,
          px: x,
          py: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          dmg,
          life: 0.9,
        });
      },
      particles: (x, y, col, n, spd, glow) => self.burst(x, y, col, n, spd, glow),
      popup: (x, y, text, col) => self.addPopup(x, y, text, col),
      message: (text) => self.say(text),
      quake: (v) => {
        self.shake = Math.max(self.shake, v);
      },
      sound: () => self.sfx,
      give: (kind, amount) => self.giveResource(kind, amount),
      count: (kind) => self.countResource(kind),
      take: (kind, amount) => self.takeResource(kind, amount),
      doorAt: (tx, ty) => self.doorAt(tx, ty),
      openDoor: (tx, ty) => {
        const d = self.doorAt(tx, ty);
        if (!d || d.sealed || d.route) return;
        d.open = true;
        d.barricaded = false;
        self.data().tiles[self.idx(tx, ty)] = 3;
      },
      hideSpots: () => self.data().props.filter((p) => (p.kind === "wardrobe" || p.kind === "locker") && (!p.loot || p.opened)
        && !self.environment?.roomHidden(self.data().roomOf[self.idx(p.x, p.y)])),
      goal: () => self.data().stairsUp ?? self.data().stairsDown,
      rand: () => Math.random(),
    };
  }

  private makeEnvironmentWorld(): EnvironmentWorld {
    const player = () => ({
      id: heroId, x: this.px, y: this.py, radius: 4.4, hidden: !!this.director?.hidden,
      busy: this.dead || this.won || this.paused || this.inventoryOpen || !!(this.transition || this.activeDialog || this.director?.choice),
    });
    const civilians = () => (this.director?.civilians() ?? []).filter((c) => c.state !== "dead" && c.state !== "gone");
    return {
      player,
      actors: () => {
        const p = player();
        return [
          ...(p.hidden || this.dead ? [] : [p]),
          ...(this.floor?.zombies ?? []).filter((z) => z.state !== "dead").map((z) => ({ id: z.id, x: z.x, y: z.y, radius: z.r })),
          ...civilians().map((c) => ({ id: -c.id, x: c.x, y: c.y, radius: 4 })),
        ];
      },
      clear: (from, to) => this.environmentLine(from.x, from.y, to.x, to.y),
      changed: () => {
        this.propSolid = this.buildPropSolid();
        if (!this.director?.hidden) this.unstuck();
        for (const z of this.floor?.zombies ?? []) {
          z.path = [];
          z.pathT = 0;
          if (z.state !== "dead") {
            const p = this.shoveOut(z.x, z.y, z.r, 24);
            z.x = p.x; z.y = p.y;
          }
        }
        for (const c of civilians()) {
          const p = this.shoveOut(c.x, c.y, 4, 24);
          c.x = p.x; c.y = p.y; c.pathT = 0;
        }
      },
      hit: (actor, damage, at) => {
        if (actor.id === heroId) {
          const hp = this.hp;
          this.damagePlayer(damage, at.x, at.y, true);
          if (this.hp < hp) this.environment?.cancelWork();
        } else if (actor.id < 0) {
          const c = this.director?.civ(-actor.id);
          if (c) this.director?.hurtCiv(c, damage, c.x - at.x, c.y - at.y, false);
        } else {
          const z = this.zombieById(actor.id);
          if (z && z.state !== "dead") this.hurtZombie(z, damage, z.x - at.x, z.y - at.y);
        }
      },
      alert: (at, tiles) => {
        this.alert(at.x, at.y, tiles * TILE, true);
        if (Math.hypot(at.x - this.px, at.y - this.py) < tiles * TILE) this.noise = Math.max(this.noise, Math.min(1, tiles / 10));
      },
      sound: (kind, at) => {
        const d = Math.hypot(at.x - this.px, at.y - this.py);
        const range = (kind === "collapse" || kind === "flare" ? 14 : 8) * TILE;
        if (d < range) this.sfx.environment(kind, Math.max(0.12, 1 - d / range));
      },
      dust: (at, color, amount, speed, glow) => this.burst(at.x, at.y, color, amount, speed, glow),
      shake: (amount) => { this.shake = Math.max(this.shake, amount); },
      say: (text) => this.say(text),
    };
  }

  /** E ma jeden sens przy szafie: schowań lub wyjście. Reszta interakcji czeka na kolejne naciśnięcie. */
  private hideOrInteract() {
    if (!this.director) return false;
    if (this.director.hidden) {
      this.toggleHide();
      return true;
    }
    if (this.director.nearHideSpot()) {
      this.toggleHide();
      return true;
    }
    return false;
  }

  private toggleHide() {
    if (!this.director || !this.floor) return;
    if (this.director.hidden) {
      this.director.toggleHide([]);
      const back = this.shoveOut(this.hideReturn.x, this.hideReturn.y, 4.2);
      this.px = back.x;
      this.py = back.y;
      this.wasHidden = false;
      this.emitHud(true);
      return;
    }
    const seers = this.floor.zombies.filter((z) => {
      if (z.state === "dead") return false;
      const visible = this.seesPlayer(z);
      if (!visible) return false;
      const path = astar(this.data().w, this.data().h, Math.floor(z.x / TILE), Math.floor(z.y / TILE),
        Math.floor(this.px / TILE), Math.floor(this.py / TILE), (x, y) => this.walkable(x, y, false));
      if (!path) return false;
      z.seenWardrobe = { x: Math.floor(this.px / TILE), y: Math.floor(this.py / TILE) };
      z.lastX = this.px; z.lastY = this.py;
      z.state = "chase"; z.alertT = 9; z.pathT = 0;
      return true;
    }).map((z) => z.id);
    this.hideReturn = { x: this.px, y: this.py };
    if (!this.director.toggleHide(seers)) {
      this.say("Nie ma tu szafy, w której zmieścisz się cały.");
      return;
    }
    const spot = this.director.hidePosition();
    if (spot) {
      this.px = spot.x;
      this.py = spot.y;
    }
    this.releaseInput();
  }

  chooseOption(index: number) {
    if (this.verticalChoice) {
      const mode = this.verticalChoice.mode;
      const target = this.verticalChoice.targets[index];
      this.verticalChoice = null;
      this.interactLock = 0.2;
      if (mode === "service") {
        if (index === 0) this.startFreightRide();
        else if (index === 1) this.requestFloor(this.floorIndex < 9 ? 1 : -1, "service");
        this.emitHud(true);
        return;
      }
      if (target === null) {
        const ride = this.building.elevatorRide;
        if (ride?.phase === "stop" && ride.stopFloor !== undefined) {
          const stop = ride.stopFloor;
          this.building.elevatorFloor = stop;
          this.building.elevatorOpenFloor = stop;
          this.building.elevatorRide = null;
          this.enter(stop, "lift");
          this.addJournal(`Wysiadłeś podczas postoju na ${floorShortName(stop)}.`);
        }
      } else if (this.building.elevatorRide?.phase === "stop") {
        const ride = this.building.elevatorRide;
        ride.phase = "moving";
        ride.elapsed = 0;
        ride.doorOpen = 0;
        ride.stopFloor = undefined;
        this.building.elevatorOpenFloor = null;
        this.sfx.liftMove();
      } else if (typeof target === "number") {
        this.startLiftRide(target);
      }
      this.emitHud(true);
      return;
    }
    this.director?.choose(index);
    this.emitHud(true);
  }

  private questState(floorIndex = this.floorIndex): FloorQuestState {
    if (!this.building.quests[floorIndex]) {
      this.building.quests[floorIndex] = defaultFloorQuestState();
    }
    return this.building.quests[floorIndex]!;
  }

  private enter(index: number, how: "start" | "up" | "down" | "lift" | "service" | "stairsB") {
    if (this.floor) this.floor.hasKey = this.hasKey;
    this.environment?.cancelWork();
    this.verticalWork = null;
    this.verticalChoice = null;
    this.floorIndex = index;
    this.popups = [];
    let saved: SavedFloor | null = null;
    if (!this.lives[index]) {
      const data = generateFloor(index, (this.seed + index * 131) >>> 0, this.seed, this.generatorVersion);
      const pending = this.restored[index];
      if (pending?.layout === data.seed) saved = pending;
      this.restored[index] = null;
      const blood = data.corpses.map((c, idxC) => ({ x: c.x, y: c.y, n: 4, seed: idxC * 19 + 3 }));
      const corpsesAsDead: Zombie[] = saved ? [] : data.corpses.map((c) => ({
        ...this.makeZombie({ x: c.x, y: c.y, kind: c.kind, room: 0 }),
        hp: 0,
        state: "dead",
        deadT: 5,
      }));
      this.lives[index] = {
        data,
        zombies: saved ? saved.zombies.map((z) => ({ ...this.makeZombie({ ...z, room: z.home }), ...z,
          downT: z.downT ?? 0, bisected: z.bisected ?? z.kind === "crawler", seenWardrobe: z.seenWardrobe ?? null,
          deadT: z.state === "dead" ? 5 : 0 }))
          : [...corpsesAsDead, ...data.zombies.map((z) => {
            const cell = { x: Math.floor(z.x / TILE), y: Math.floor(z.y / TILE) };
            const horde = data.vertical?.quest?.horde?.some((p) => p.x === cell.x && p.y === cell.y);
            return this.makeZombie({ ...z, ...(horde ? { missionTag: "lure" as const } : {}) });
          }),
          ...(data.environment?.annexes.flatMap((a) => a.guard ? [this.makeZombie(a.guard)] : []) ?? [])],
        survivors: data.survivors.map((s) => ({
          ...s,
          state: saved?.survivorsGone.includes(s.id) ? "gone" : "hide",
          vx: 0,
          vy: 0,
          fleeT: 0,
          animT: Math.random() * 3,
        })),
        explored: saved ? Uint8Array.from(saved.explored, (v) => Number(v)) : new Uint8Array(data.w * data.h),
        hasKey: saved?.hasKey ?? false,
        blood,
        shells: [],
        environment: saved ? { clock: saved.environment.clock, features: Object.fromEntries(Object.entries(saved.environment.features).map(([id, s]) => [id, { ...s }])) } : createEnvironmentState(),
        tactical: createTacticalState(saved?.tactical),
      };
    }
    this.floor = this.lives[index]!;
    this.floorIndex = index;
    this.hasKey = this.floor.hasKey;
    this.syncVerticalDoors(index);
    this.bullets = [];
    this.vis = new Uint8Array(this.floor.data.w * this.floor.data.h);
    this.light = new Float32Array(this.floor.data.w * this.floor.data.h);
    this.director = this.floor.director ??= new EventDirector(this.makeWorld(), this.art);
    this.environment = new Environment(this.floor.data, this.floor.environment, this.makeEnvironmentWorld());
    this.tactical = new TacticalDirector(this.floor.tactical);
    this.grabbedBy = null;
    this.grabStruggles = 0;
    this.grabProtection = 1.5;
    this.npcSeenCount = this.director.npcEncounterCount;
    this.npcWait = this.building.npcDrought >= 2 ? TACTICAL.npc.pityDelay : TACTICAL.npc.firstDelay;
    if (saved) {
      const opened = new Set(saved.opened);
      for (const p of this.data().props) p.opened = opened.has(p.id);
      for (const s of saved.doors) {
        const d = this.doorAt(s.x, s.y);
        if (!d || d.sealed || (d.route && this.generatorVersion !== 1)) continue;
        d.hp = s.hp; d.locked = s.locked; d.open = s.open; d.broken = s.broken; d.barricaded = s.barricaded;
        this.data().tiles[this.idx(d.x, d.y)] = d.open || d.broken ? Tile.DoorOpen : Tile.Door;
      }
    }
    this.propSolid = this.buildPropSolid();
    this.wasHidden = false;
    const d = this.floor.data;
    this.fixtures = d.wallDecals.filter((f) =>
      ["panel", "drip", "intercom", "reel", "thermostat", "conduit", "ventgrate", "exitsign", "sconce", "emergencylamp", "camera"].includes(f.kind),
    );
    this.sfx.setTheme(d.theme);
    if (how === "up" && d.stairsDown) {
      this.px = (d.stairsDown.x + 0.5) * TILE;
      this.py = (d.stairsDown.y + 0.15) * TILE;
    } else if (how === "down" && d.stairsUp) {
      this.px = (d.stairsUp.x + 0.5) * TILE;
      this.py = (d.stairsUp.y + 1.1) * TILE;
    } else if (how === "lift" && d.vertical?.elevator) {
      const landing = d.vertical.elevator;
      this.px = (landing.center.x + 0.5) * TILE;
      this.py = (landing.center.y + 0.5) * TILE;
    } else if (how === "service" && d.vertical?.service) {
      const landing = d.vertical.service;
      this.px = (landing.outside.x + 0.5) * TILE;
      this.py = (landing.outside.y + 0.5) * TILE;
    } else if (how === "stairsB" && d.vertical?.stairsB) {
      const landing = d.vertical.stairsB;
      this.px = (landing.outside.x + 0.5) * TILE;
      this.py = (landing.outside.y + 0.5) * TILE;
    } else {
      this.px = d.playerStart.x;
      this.py = d.playerStart.y;
    }
    this.unstuck();
    this.camX = this.px - this.viewW / 2;
    this.camY = this.py - this.viewH / 2;
    this.bannerT = 2.6;
    this.interactLock = 0.45;
    this.flareCharge = 0;
    this.updateVerticalQuest();
    this.say(index === 0 ? "Piwnica. Wyjście jest na dachu." : `${d.name} — ${d.sub}`);
  }

  private syncVerticalDoors(floorIndex = this.floorIndex) {
    const d = this.floor?.data;
    if (!d?.vertical) return;
    const qs = this.questState(floorIndex);
    const door = (kind: "elevator" | "service" | "stairsB") => d.doors.find((v) => v.route === kind);
    const lift = door("elevator");
    if (lift) {
      lift.open = this.building.elevatorOpenFloor === floorIndex;
      this.data().tiles[this.idx(lift.x, lift.y)] = lift.open ? Tile.DoorOpen : Tile.Door;
    }
    const service = door("service");
    if (service) {
      const q = d.vertical.quest;
      const lockedByFlood = q?.kind === "flooded-route" && qs.stage < 3;
      const lockedByKeypad = q?.kind === "service-shaft" && !qs.serviceUnlocked && !qs.serviceForced;
      const freightOpen = this.building.serviceLift?.openFloor === floorIndex;
      service.open = freightOpen || (!lockedByFlood && !lockedByKeypad);
      this.data().tiles[this.idx(service.x, service.y)] = service.open ? Tile.DoorOpen : Tile.Door;
    }
    const stB = door("stairsB");
    if (stB) {
      const q = d.vertical.quest;
      stB.open = q?.kind !== "apartment-bypass" || qs.bypassOpen;
      this.data().tiles[this.idx(stB.x, stB.y)] = stB.open ? Tile.DoorOpen : Tile.Door;
    }
  }

  private addJournal(entry: string) {
    const item = entry.trim();
    if (!item || this.building.journal[this.building.journal.length - 1] === item) return;
    this.building.journal.push(item);
    if (this.building.journal.length > 36) this.building.journal.shift();
    this.say(item);
  }

  private questInfo(): HudState["quest"] {
    const ride = this.building.elevatorRide;
    if (ride) {
      if (ride.phase === "stranded") return { title: "Awaria windy", step: "Otwórz drzwi dźwignią awaryjną [E]" };
      if (ride.phase === "stop") return { title: "Nieplanowany postój", step: "Zdecyduj: wysiądź albo jedź dalej" };
      return { title: "Podróż windą", step: `${floorShortName(ride.from)} → ${floorShortName(ride.to)}` };
    }
    const p = this.building.passage;
    if (p) {
      if (p.feature === "broken-flight" && !p.bypassOpen) {
        return { title: "Zawalona klatka", step: "Odsuń przeszkodę na półpiętrze [Przytrzymaj E] lub cofnij się" };
      }
      return {
        title: p.route === "service" || p.route === "ledge" ? "Pion techniczny" : p.route === "stairsB" ? "Klatka B" : "Klatka A",
        step: `Przejście: ${floorShortName(p.from)} → ${floorShortName(p.to)}`,
      };
    }
    const quest = this.data().vertical?.quest;
    if (!quest) return null;
    const qs = this.questState();
    if (qs.resolved) return null;
    switch (quest.kind) {
      case "repair-lift": {
        const steps = [
          "Sprawdź panel windy w zachodnim korytarzu (albo idź schodami)",
          "Odłącz uszkodzony obwód i znajdź bezpiecznik B-4 w warsztacie",
          "Odnajdź zapasowy bezpiecznik B-4 w warsztacie",
          "Wróć do windy i zamontuj bezpiecznik B-4",
          "Przywołaj kabinę [E] i uruchom przejazd",
        ];
        return { title: "Przywróć zasilanie windy", step: steps[Math.min(qs.stage, steps.length - 1)] };
      }
      case "broken-stairs":
        return {
          title: "Zniszczona klatka",
          step: qs.inspected
            ? "Odsuń przeszkodę na półpiętrze do zaplecza lub użyj Klatki B / windy"
            : "Wejdź na Klatkę A lub znajdź inną drogę wyżej",
        };
      case "flooded-route": {
        const steps = [
          "Zbadaj zalany pion techniczny (wschód) albo wybierz inną klatkę",
          "Odłącz zwarcie w kałuży i zamknij zawór pary",
          "Zamknij pozostałe zagrożenie w zalanej strefie",
          "Przejście odblokowane — użyj latarki w pionie technicznym",
        ];
        return { title: "Zalane przejście", step: steps[Math.min(qs.stage, steps.length - 1)] };
      }
      case "lure-horde":
        return {
          title: "Zombie blokują wyjście",
          step: qs.lureUsed
            ? "Omiń odciągniętą grupę i dotrzyj na schody"
            : "Uruchom konsolę rozgłoszeniową w bocznym pokoju albo oczyść schody",
        };
      case "service-shaft":
        return {
          title: "Pion techniczny",
          step: qs.serviceUnlocked || qs.serviceForced
            ? "Wejdź w pion techniczny na wyższą kondygnację"
            : qs.codeFound
              ? `Wpisz kod ${quest.code} przy drzwiach serwisowych`
              : "Znajdź instrukcję procedury awaryjnej lub sforsuj drzwi łomem",
        };
      case "apartment-bypass":
        return {
          title: "Przejście do Klatki B",
          step: qs.bypassOpen
            ? "Klatka B otwarta — przejdź na wyższe piętro"
            : qs.inspected
              ? "Odsuń mebel we wschodnim mieszkaniu [Przytrzymaj E]"
              : "Sprawdź plan ewakuacyjny lub przejdź przez wschodnie skrzydło",
        };
    }
  }

  private updateVerticalQuest() {
    if (!this.floor) return;
    const quest = this.data().vertical?.quest;
    if (!quest) return;
    const qs = this.questState();
    const wireOff = (id?: number) => {
      if (id === undefined) return true;
      const f = this.environment?.features.find((ft) => ft.id === id);
      return !f || !!this.environment?.read(f).off;
    };
    const steamOff = (id?: number) => {
      if (id === undefined) return true;
      const f = this.environment?.features.find((ft) => ft.id === id);
      return !f || !!this.environment?.read(f).off;
    };

    if (quest.kind === "repair-lift") {
      // Retroactive recognition: disconnecting circuit or picking up fuse before inspecting works seamlessly!
      const circuitDone = wireOff(quest.wireId);
      if (circuitDone && qs.stage < 2 && (qs.inspected || qs.fuseTaken)) {
        qs.stage = 2;
        if (!qs.fuseTaken) this.addJournal("Obwód rozdzielni odłączony. Odszukaj zapasowy bezpiecznik B-4 w warsztacie.");
      }
      if (qs.fuseTaken && circuitDone && qs.stage < 3) {
        qs.stage = 3;
        this.addJournal("Masz bezpiecznik B-4 i wyłączony obwód. Wróć do windy, aby przywrócić zasilanie.");
      }
      if (this.building.elevatorPowered && qs.stage < 4) {
        qs.stage = 4;
      }
    } else if (quest.kind === "flooded-route") {
      const done = (wireOff(quest.wireId) ? 1 : 0) + (steamOff(quest.steamId) ? 1 : 0);
      if (done === 1 && qs.stage < 2) {
        qs.stage = 2;
        this.addJournal(
          wireOff(quest.wireId)
            ? "Wyładowania ustały, część skrzydła zgasła. Zamknij jeszcze zawór pary."
            : "Wyciek pary zatrzymany. Odłącz jeszcze uszkodzony przewód w kałuży.",
        );
      }
      if (done === 2 && qs.stage < 3) {
        qs.stage = 3;
        qs.resolved = true;
        this.syncVerticalDoors();
        this.addJournal("Zalane przejście do pionu technicznego jest bezpieczne, ale ciemne — użyj latarki.");
      }
    } else if (quest.kind === "lure-horde" && !qs.lureResolved) {
      const up = this.data().stairsUp;
      if (up && !qs.inspected && Math.hypot(this.px - (up.x + 0.5) * TILE, this.py - (up.y + 0.5) * TILE) < 9 * TILE) {
        qs.inspected = true;
        qs.stage = 1;
        this.addJournal("Grupa zombie blokuje wejście na schody. W bocznym pokoju jest konsola rozgłoszeniowa.");
      }
      const horde = this.floor.zombies.filter((z) => z.missionTag === "lure" && z.state !== "dead");
      const crowded = horde.some((z) => up && Math.hypot(z.x - (up.x + 0.5) * TILE, z.y - (up.y + 0.5) * TILE) < 4 * TILE);
      if (!crowded && (qs.lureUsed || horde.length === 0)) {
        qs.lureResolved = true;
        qs.resolved = true;
        qs.stage = 3;
        this.addJournal("Droga na klatkę jest wolna. Zombie zmieniły położenie w budynku.");
      }
    } else if (quest.kind === "broken-stairs") {
      if (qs.landingBypassOpen && !qs.resolved) {
        qs.resolved = true;
        qs.stage = 3;
      }
    } else if (quest.kind === "service-shaft") {
      if ((qs.serviceUnlocked || qs.serviceForced) && !qs.resolved) {
        qs.resolved = true;
        qs.stage = 3;
        this.syncVerticalDoors();
      }
    } else if (quest.kind === "apartment-bypass") {
      if (qs.bypassOpen && !qs.resolved) {
        qs.resolved = true;
        qs.stage = 3;
        this.syncVerticalDoors();
      }
    }
  }

  private interactVertical(): boolean {
    if (this.interactLock > 0) return false;
    const quest = this.data().vertical?.quest;
    const qs = this.questState();
    const ride = this.building.elevatorRide;

    // 1. Inside active elevator ride
    if (ride) {
      this.interactLock = 0.22;
      if (ride.phase === "stranded") {
        // Player can pull the emergency lever inside the cabin — no external tool required!
        if (ride.cabinX < 4) {
          // Guide player clearly or let them trigger immediately from anywhere inside the small cabin
          ride.cabinX = 18;
        }
        ride.phase = "escape";
        ride.elapsed = 0;
        ride.leverProgress = 1;
        this.sfx.ladder();
        this.shake = 3.2;
        this.say("Pociągasz czerwoną dźwignię awaryjną. Drzwi uchylają się ze zgrzytem...");
        return true;
      }
      if (ride.phase === "stop" && ride.stopFloor !== undefined) {
        this.verticalChoice = {
          targets: [null, ride.to],
          labels: [`Wysiądź (${floorShortName(ride.stopFloor)})`, `Jedź dalej (${floorShortName(ride.to)})`],
          label: "NIEPLANOWANY POSTÓJ",
          text: `Drzwi uchyliły się na ${floorShortName(ride.stopFloor)}. Możesz zbadać to piętro albo kontynuować podróż.`,
        };
        return true;
      }
      if (ride.phase === "moving" || ride.phase === "accel") {
        this.say("Kabina jest w ruchu.");
        return true;
      }
      return true;
    }

    // 2. Inside active playable stairwell / technical shaft
    const p = this.building.passage;
    if (p) {
      this.interactLock = 0.22;
      if ((p.feature === "stash" || p.feature === "traces") && !p.stashLooted && Math.hypot(p.x - 18, p.y - 16) < 26) {
        p.stashLooted = true;
        const fqs = this.questState(p.from);
        fqs.landingStashOpened = true;
        this.pack.stock.rounds += 6;
        this.battery = Math.min(100, this.battery + 20);
        this.sfx.pickup();
        this.say("Schowek konserwatora: +6 naboi, +20% baterii.");
        this.addJournal("Na półpiętrze znalazłeś schowek konserwatora z zapasami.");
        return true;
      }
      if (p.feature === "broken-flight" && p.bypassOpen && Math.hypot(p.x - 126, p.y - 18) < 26) {
        this.finishPassage(p.to, "stairsB");
        return true;
      }
      if (p.route === "service" || p.route === "ledge") {
        if (p.y < 32) { this.finishPassage(p.to, "service"); return true; }
        if (p.y > 84) { this.finishPassage(p.from, "service"); return true; }
      } else {
        if (p.x > 84 && p.y > 84 && p.feature !== "broken-flight") {
          this.finishPassage(p.to, p.route === "stairsB" ? "stairsB" : p.to > p.from ? "up" : "down");
          return true;
        }
        if (p.x < 60 && p.y > 84) {
          this.finishPassage(p.from, p.route === "stairsB" ? "stairsB" : p.to > p.from ? "down" : "up");
          return true;
        }
      }
      return true;
    }

    // 3. On a regular floor: scenario interactables & vertical portals
    const vertical = this.data().vertical;
    if (!vertical) return false;

    // Scenario A: spare fuse pickup in workshop
    if (quest?.kind === "repair-lift" && quest.fuseCell && !qs.fuseTaken && this.closeEnough(quest.fuseCell, 25)) {
      qs.fuseTaken = true;
      this.interactLock = 0.2;
      this.sfx.key();
      const c = this.tileCenter(quest.fuseCell);
      this.burst(c.x, c.y, COL.fluor, 9, 44, true);
      this.addPopup(c.x, c.y - 8, "+ BEZPIECZNIK B-4", COL.fluor);
      this.addJournal("Zabrano zapasowy bezpiecznik B-4 z warsztatu.");
      this.updateVerticalQuest();
      return true;
    }

    // Scenario D: acoustic lure console
    if (quest?.kind === "lure-horde" && quest.beacon && !qs.lureUsed && this.closeEnough(quest.beacon, 25)) {
      qs.lureUsed = true;
      qs.inspected = true;
      qs.stage = 2;
      this.interactLock = 0.25;
      const c = this.tileCenter(quest.beacon);
      this.sfx.alarm();
      this.burst(c.x, c.y, "#eac584", 12, 55, true);
      this.alert(c.x, c.y, 38 * TILE, true);
      this.noise = 1;
      this.shake = Math.max(this.shake, 1.4);
      this.addPopup(c.x, c.y - 8, "SYGNAŁ URUCHOMIONY!", "#eac584");
      this.addJournal("Sygnał rozgłoszeniowy włączył się w bocznym pokoju — zombie przy schodach ruszają w stronę hałasu.");
      return true;
    }

    // Scenario E: emergency procedure plaque
    if (quest?.kind === "service-shaft" && quest.clueCell && !qs.codeFound && this.closeEnough(quest.clueCell, 25)) {
      qs.codeFound = true;
      qs.inspected = true;
      qs.stage = 2;
      this.interactLock = 0.2;
      this.sfx.pickup();
      const c = this.tileCenter(quest.clueCell);
      this.addPopup(c.x, c.y - 8, `KOD: ${quest.code}`, COL.fluor);
      this.addJournal(`Instrukcja procedury awaryjnej pionu technicznego: kod dostępu ${quest.code}.`);
      return true;
    }

    // Scenario F: evacuation plan plaque
    if (quest?.kind === "apartment-bypass" && quest.clueCell && !qs.inspected && this.closeEnough(quest.clueCell, 25)) {
      qs.inspected = true;
      qs.stage = 1;
      this.interactLock = 0.2;
      this.sfx.pickup();
      this.addJournal("Plan ewakuacyjny: Klatka B jest po wschodniej stronie piętra — dojście przez zastawione mieszkanie.");
      return true;
    }

    // Elevator cabin interior panel
    const lift = vertical.elevator;
    if (lift && this.inLiftCabin(lift) && this.closeEnough(lift.panel, 25)) {
      this.interactLock = 0.2;
      if (!this.building.elevatorPowered || this.building.elevatorBroken || this.building.elevatorOpenFloor !== this.floorIndex) {
        this.say("Panel kabiny nie odpowiada.");
        return true;
      }
      this.offerLiftFloors();
      return true;
    }

    // Elevator exterior call button
    if (lift && this.closeEnough(lift.call, 25)) {
      this.interactLock = 0.22;
      if (quest?.kind === "repair-lift") {
        const wire = this.environment?.features.find((f) => f.id === quest.wireId);
        const wireOff = !wire || !!this.environment?.read(wire).off;
        if (!qs.inspected && !this.building.elevatorPowered) {
          qs.inspected = true;
          qs.stage = Math.max(qs.stage, 1);
          this.sfx.dry();
          this.addJournal("Panel windy martwy. Tabliczka przy drzwiach: 'Zasilanie awaryjne: rozdzielnia w warsztacie, bezpiecznik B-4'.");
          this.updateVerticalQuest();
          return true;
        }
        if (qs.fuseTaken && !this.building.elevatorPowered) {
          if (!wireOff) {
            this.say("Zwarcie w obwodzie warsztatu! Najpierw odłącz bezpiecznik zwarcia.");
            return true;
          }
          this.building.elevatorPowered = true;
          this.building.elevatorEmergencyOnly = true;
          this.building.elevatorBroken = false;
          qs.stage = 4;
          qs.resolved = true;
          this.sfx.powerUp();
          this.sfx.liftCall();
          this.addJournal("Zamontowano bezpiecznik B-4. Kontrolki windy zapaliły się — tryb awaryjny gotowy do przywołania.");
          return true;
        }
      }
      if (this.building.elevatorBroken) {
        // Optional relay reset on floors >= 2 so players can reuse the elevator later in the run
        if (this.floorIndex >= 2) {
          this.building.elevatorBroken = false;
          this.building.elevatorEmergencyOnly = false;
          this.building.elevatorPowered = true;
          this.sfx.powerUp();
          this.addJournal("Zresetowano przekaźnik windy. Winda wróciła do standardowej pracy.");
          return true;
        }
        this.say("Winda jest unieruchomiona po awarii. Skorzystaj ze schodów lub zresetuj przekaźnik wyżej.");
        return true;
      }
      if (!this.building.elevatorPowered) {
        this.say("Winda nie ma zasilania. Sprawdź rozdzielnię na parterze lub użyj schodów.");
        return true;
      }
      this.startLiftCall();
      return true;
    }

    // Technical service shaft doorway / keypad
    const service = vertical.service;
    if (service && (this.closeEnough(service.panel, 24) || this.closeEnough(service.door, 24))) {
      this.interactLock = 0.22;
      if (quest?.kind === "flooded-route" && qs.stage < 3) {
        if (!qs.inspected) {
          qs.inspected = true;
          qs.stage = Math.max(qs.stage, 1);
          this.addJournal("Wejście do pionu technicznego zalane: odłącz przewód pod napięciem i zakręć zawór pary.");
          this.updateVerticalQuest();
          return true;
        }
        this.say("Przejście nadal niebezpieczne — odłącz zwarcie i zamknij zawór pary.");
        return true;
      }
      if (quest?.kind === "service-shaft" && !qs.serviceUnlocked && !qs.serviceForced) {
        if (qs.codeFound) {
          qs.serviceUnlocked = true;
          qs.stage = 3;
          qs.resolved = true;
          this.syncVerticalDoors();
          this.sfx.key();
          this.addJournal(`Wpisano kod ${quest.code}. Zamek pionu technicznego otworzył się cicho.`);
          return true;
        }
        if (!qs.inspected) {
          qs.inspected = true;
          qs.stage = 1;
          this.addJournal("Drzwi pionu technicznego zablokowane zamkiem kodowym. Znajdź instrukcję procedury albo przytrzymaj E, by sforsować łomem.");
          this.sfx.dry();
          return true;
        }
        this.say("Potrzebny kod z instrukcji — albo przytrzymaj E, aby sforsować zamek (głośno).");
        return true;
      }
      this.offerServiceRoute();
      return true;
    }

    // Second stairwell (Klatka B)
    const stB = vertical.stairsB;
    if (stB && (this.closeEnough(stB.stairs, 24) || this.closeEnough(stB.outside, 24))) {
      this.interactLock = 0.22;
      if (quest?.kind === "apartment-bypass" && !qs.bypassOpen) {
        qs.inspected = true;
        qs.stage = Math.max(qs.stage, 1);
        this.say("Klatka B jest zablokowana od strony mieszkania — odsuń przeszkodę we wschodnim skrzydle.");
        this.sfx.dry();
        return true;
      }
      const dir = this.floorIndex < 9 ? 1 : -1;
      this.requestFloor(dir, "stairsB");
      return true;
    }

    return false;
  }

  private unstuck() {
    if (this.canOccupy(this.px, this.py, 4.4)) return;
    for (let rad = 2; rad < 48; rad += 2) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const x = this.px + Math.cos(a) * rad;
        const y = this.py + Math.sin(a) * rad;
        if (this.canOccupy(x, y, 4.4)) {
          this.px = x;
          this.py = y;
          return;
        }
      }
    }
  }

  private say(text: string) {
    this.message = text;
    this.messageT = 2.8;
    this.emitHud(true);
  }

  private update(dt: number) {
    if (!this.floor) return;
    if (this.inventoryOpen) return;
    this.messageT = Math.max(0, this.messageT - dt);
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.hurt = Math.max(0, this.hurt - dt * 1.6);
    this.noise = Math.max(0, this.noise - dt * 0.7);
    this.recoil = Math.max(0, this.recoil - dt * 8.5);
    this.muzzleLight = Math.max(0, this.muzzleLight - dt * 11);
    this.shake *= Math.pow(0.04, dt);
    if (this.paused) {
      this.emitHud(false);
      return;
    }
    if (this.dead) {
      this.deadT += dt;
      if (this.deadT > 1.5) this.finish(false);
      this.emitHud(false);
      return;
    }
    if (this.won) {
      this.wonT += dt;
      this.updateParticles(dt);
      if (this.wonT > 0.95) this.finish(true);
      this.emitHud(false);
      return;
    }

    if (this.transition) {
      this.transition.t += dt;
      if (this.transition.phase === "out") {
        this.fade = Math.min(1, this.transition.t / 0.28);
        if (this.transition.t >= 0.28) {
          const dir = this.transition.dir;
          this.enter(this.floorIndex + dir, dir > 0 ? "up" : "down");
          this.transition.phase = "in";
          this.transition.t = 0;
        }
      } else {
        this.fade = Math.max(0, 1 - this.transition.t / 0.32);
        if (this.transition.t >= 0.32) this.transition = null;
      }
      this.emitHud(false);
      return;
    }
    this.fade = 0;
    this.time += dt;
    this.interactLock = Math.max(0, this.interactLock - dt);
    if (this.building.elevatorRide) {
      if (!this.verticalChoice) this.updateLiftRide(dt);
      this.updateParticles(dt);
      this.emitHud(false);
      return;
    }
    if (this.building.passage) {
      this.updatePassage(dt);
      this.updateParticles(dt);
      this.emitHud(false);
      return;
    }
    if (this.verticalChoice) {
      this.emitHud(false);
      return;
    }
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    this.meleeT = Math.max(0, this.meleeT - dt);
    if (!this.meleeHit && this.meleeT > 0 && 1 - this.meleeT / this.meleeDur >= 0.4) {
      this.meleeHit = true;
      this.meleeStrike();
    }
    this.shootCd = Math.max(0, this.shootCd - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.invuln = Math.max(0, this.invuln - dt);

    if (!this.hint1 && this.time > 0.4 && this.floorIndex === 0) {
      this.hint1 = true;
      this.say("WASD: ruch  ·  E: użyj  ·  TAB: ekwipunek  ·  1/2/3: broń");
    }
    if (!this.hint2 && this.time > 8 && this.floorIndex === 0) {
      this.hint2 = true;
      this.say("Łom jest cichy. Strzał budzi całe piętro.");
    }

    if (this.director?.choice) {
      this.updatePopups(dt);
      this.emitHud(false);
      return;
    }
    if (this.grabbedBy !== null) {
      this.updateGrab(dt);
      this.updateTactical(dt);
      this.computeVisibility();
      this.director?.update(dt);
      this.updateZombies(dt);
      this.updateBullets(dt);
      this.updateParticles(dt);
      this.emitHud(false);
      return;
    }
    this.updatePlayer(dt);
    this.updateVerticalHold(dt);
    this.tickVertical(dt);
    if (this.director?.camp) this.environment?.ignite(this.director.camp);
    this.environment?.update(dt);
    this.updateTactical(dt);
    this.updateVerticalQuest();
    this.computeVisibility();
    this.director?.update(dt);
    if (this.wasHidden && this.director && !this.director.hidden) {
      const back = this.shoveOut(this.hideReturn.x, this.hideReturn.y, 4.2);
      this.px = back.x;
      this.py = back.y;
    }
    this.wasHidden = !!this.director?.hidden;
    this.updateHeli(dt);
    this.updateSurvivors(dt);
    this.updatePopups(dt);
    this.updateZombies(dt);
    this.updateVerticalQuest();
    this.updateBullets(dt);
    this.updateShells(dt);
    this.updateParticles(dt);
    this.updateDust(dt);
    this.updateReload(dt);
    this.updateAutoFlash();
    this.updateFlare(dt);
    this.updateLightsAudio();
    this.updateAmbientFx(dt);
    if (this.hp < 32) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = this.hp < 16 ? 0.45 : 0.75;
        this.sfx.heart();
      }
    }
    const targetX = this.px - this.viewW / 2;
    const targetY = this.py - this.viewH / 2;
    this.camX += (targetX - this.camX) * Math.min(1, dt * 9);
    this.camY += (targetY - this.camY) * Math.min(1, dt * 9);
    this.emitHud(false);
  }

  private updateLightsAudio() {
    if (!this.floor) return;
    for (const lf of this.data().lights) {
      if (!lf.flicker || lf.kind !== "fluor" || this.environment?.roomDark(lf.roomId) || this.environment?.roomHidden(lf.roomId)) continue;
      if (Math.hypot(lf.x - this.px, lf.y - this.py) < 5.5 * TILE) {
        if (this.fixtureIntensity(lf) < 0.35) this.sfx.buzz(this.time);
      }
    }
  }

  private updateAmbientFx(dt: number) {
    if (!this.floor) return;
    // Iskrzące rozdzielnice i kapiące rury przy oświetlonych ścianach
    for (const f of this.fixtures) {
      const tx = f.x;
      const ty = f.y;
      if (!this.inb(tx, ty) || !this.vis[this.idx(tx, ty)]) continue;
      const fx = (f.x + 0.5) * TILE;
      const fy = (f.y + 0.5) * TILE;
      // Regularne wyładowania rozdzielnicy — łatwiej je zauważyć niż losowe iskry.
      const sparkNow = Math.sin(this.time * 2.7 + f.x * 0.61 + f.y * 0.17) > 0.86;
      const dripNow = (this.time * 1.35 + f.x * 0.23 + f.y * 0.41) % 1.7 < 0.16;
      if (f.kind === "panel" && sparkNow && Math.random() < dt * 6) {
        for (let i = 0; i < 3; i++) {
          this.particles.push({
            x: fx + (Math.random() - 0.5) * 5,
            y: fy + 4,
            vx: (Math.random() - 0.5) * 26,
            vy: 8 + Math.random() * 18,
            life: 0.42,
            max: 0.42,
            col: "#ffe9a8",
            size: 1,
            glow: true,
            gravity: 70,
          });
        }
      } else if (f.kind === "drip" && dripNow && Math.random() < dt * 5) {
        this.particles.push({
          x: fx + 1,
          y: fy + 8,
          vx: 0,
          vy: 18,
          life: 0.5,
          max: 0.5,
          col: "#7aa8c8",
          size: 1,
          gravity: 40,
        });
      }
    }
    const d = this.data();
    this.lightning = Math.max(0, this.lightning - dt * 3.2);
    this.fxT -= dt;
    if (this.fxT > 0) return;
    this.fxT = 0.22;
    for (const lf of d.lights) {
      if (lf.kind !== "fluor" || !lf.flicker) continue;
      if (Math.hypot(lf.x - this.px, lf.y - this.py) > 9 * TILE) continue;
      if (!this.environment?.roomDark(lf.roomId) && !this.environment?.roomHidden(lf.roomId) && this.fixtureIntensity(lf) < 0.6 && Math.random() < 0.6) {
        for (let i = 0; i < 3; i++) {
          this.particles.push({
            x: lf.x + (Math.random() - 0.5) * 8,
            y: lf.y,
            vx: (Math.random() - 0.5) * 30,
            vy: 10 + Math.random() * 20,
            life: 0.5,
            max: 0.5,
            col: "#fff2a0",
            size: 1,
            glow: true,
            gravity: 90,
          });
        }
      }
    }
    if (d.theme === "basement" || d.theme === "decay") {
      if (Math.random() < 0.5) {
        const tx = Math.floor(this.px / TILE) + Math.floor(Math.random() * 11) - 5;
        const ty = Math.floor(this.py / TILE) + Math.floor(Math.random() * 9) - 4;
        if (this.inb(tx, ty) && this.vis[this.idx(tx, ty)] && this.tileAt(tx, ty) === 1) {
          this.burst((tx + Math.random()) * TILE, (ty + Math.random()) * TILE, "#7aa0c0", 3, 16);
          this.sfx.drip();
        }
      }
    } else if (d.theme === "roof") {
      this.boltT -= 0.22;
      if (this.boltT <= 0) {
        this.boltT = 8 + Math.random() * 12;
        this.lightning = 1;
        this.sfx.thunder();
      }
      if (Math.random() < 0.35) {
        this.particles.push({
          x: this.px + Math.cos(this.aim) * 4,
          y: this.py - 8,
          vx: Math.cos(this.aim) * 6,
          vy: -5,
          life: 0.7,
          max: 0.7,
          col: "#c8d4e0",
          size: 2,
          gravity: -3,
        });
      }
    }
  }

  private updateDust(dt: number) {
    for (const m of this.dust) {
      m.x += (m.vx + Math.sin(this.time * 0.9 + m.phase) * 2) * dt;
      m.y += m.vy * dt;
      if (m.x < 0) m.x += this.viewW;
      if (m.x > this.viewW) m.x -= this.viewW;
      if (m.y < 0) m.y += this.viewH;
      if (m.y > this.viewH) m.y -= this.viewH;
    }
  }

  private updateShells(dt: number) {
    if (!this.floor) return;
    for (const s of this.floor.shells) {
      s.life -= dt;
      if (s.z > 0 || s.vz !== 0) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        s.vz -= 190 * dt;
        if (s.z <= 0) {
          s.z = 0;
          s.vz = Math.abs(s.vz) > 18 ? -s.vz * 0.38 : 0;
          s.vx *= 0.52;
          s.vy *= 0.52;
        }
      }
    }
    if (this.floor.shells.length > 60) {
      this.floor.shells = this.floor.shells.filter((s) => s.life > 0).slice(-50);
    }
  }

  private aimWorld() {
    if (this.touchAimOn) {
      return { x: this.px + this.touchAim.x * 70, y: this.py + this.touchAim.y * 70 };
    }
    if ((this.touchFire || this.touchHold) && Math.hypot(this.touchMove.x, this.touchMove.y) > 0.2) {
      return { x: this.px + this.touchMove.x * 80, y: this.py + this.touchMove.y * 80 };
    }
    return { x: this.mouseSX + this.camX, y: this.mouseSY + this.camY };
  }

  private updatePlayer(dt: number) {
    if (this.director?.hidden) {
      this.environment?.cancelWork();
      this.moving = false;
      this.stamina = Math.min(100, this.stamina + 24 * dt);
      this.mouseDown = false;
      return;
    }
    const aim = this.aimWorld();
    this.aim = Math.atan2(aim.y - this.py, aim.x - this.px);
    this.dir = dirFrom(this.aim);

    let mx = 0;
    let my = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) my -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) my += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) mx -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) mx += 1;
    if (Math.hypot(this.touchMove.x, this.touchMove.y) > 0.2) {
      mx = this.touchMove.x;
      my = this.touchMove.y;
    }
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
    }
    const work = this.environment?.updateWork(dt,
      len === 0 && this.hurt < 0.65 && this.interactLock <= 0 && (this.keys.has("KeyE") || this.touchHold),
      this.stamina, this.pack.owned.includes("crowbar") || this.pack.owned.includes("hatchet"));
    if (work) {
      this.aim = Math.atan2(work.face.y - this.py, work.face.x - this.px);
      this.dir = dirFrom(this.aim);
      this.tactical?.playerContinuous(work.effort * 1.6, dt, this.px, this.py, 8 * TILE);
    }
    const sprinting =
      (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) &&
      len > 0 &&
      !this.staminaLock &&
      this.stamina > 0 &&
      this.flareCharge <= 0;
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - 28 * dt);
      if (this.stamina <= 0) this.staminaLock = true;
      this.sprintPulse -= dt;
      if (this.sprintPulse <= 0) {
        this.sprintPulse = 0.45;
        this.alert(this.px, this.py, 4.2 * TILE);
        this.noise = Math.max(this.noise, 0.55);
      }
    } else if (work) {
      this.stamina = Math.max(0, this.stamina - work.effort * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + 18 * dt);
      if (this.stamina > 28) this.staminaLock = false;
    }
    this.sprinting = sprinting;
    const careful = this.keys.has("ControlLeft") || this.keys.has("ControlRight");
    let speed = sprinting ? 118 : careful ? 48 : 80;
    if (this.flareCharge > 0) speed *= 0.4;
    if (this.environment?.inSteam(this.px, this.py)) speed *= 0.43;
    else if (this.environment?.slow(heroId)) speed *= 0.57;
    const t = this.tileAt(Math.floor(this.px / TILE), Math.floor(this.py / TILE));
    if (t === 7 || t === 8) speed *= 0.72;
    this.moving = len > 0;
    if (this.moving) {
      const oldX = this.px, oldY = this.py;
      const n = this.moveBody(this.px, this.py, 4.4, mx * speed * dt, my * speed * dt);
      this.px = n.x;
      this.py = n.y;
      const travelled = Math.hypot(n.x - oldX, n.y - oldY);
      if (this.tactical && travelled > 0.005) {
        const rate = sprinting ? TACTICAL.noise.runPerSecond : careful ? TACTICAL.noise.carefulPerSecond : TACTICAL.noise.walkPerSecond;
        this.tactical.playerContinuous(rate, dt, this.px, this.py, sprinting ? 9 * TILE : careful ? 2.2 * TILE : 4.5 * TILE);
        this.noise = this.tactical.state.playerNoise / 100;
      }
      const crossedTile = Math.floor(oldX / TILE) !== Math.floor(n.x / TILE) || Math.floor(oldY / TILE) !== Math.floor(n.y / TILE);
      if (crossedTile || ((oldX !== n.x || oldY !== n.y) && this.stepT <= 0)) this.environment?.footstep(n, sprinting);
      this.animT += dt * (sprinting ? 13 : 9);
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = sprinting ? 0.25 : 0.34;
        const surf = t === 8 ? "water" : t === 7 ? "rubble" : this.data().theme === "flat" ? "wood" : "concrete";
        this.sfx.step(this.time, surf);
        if (t !== 8) {
          for (let i = 0; i < (sprinting ? 3 : 1); i++) {
            this.particles.push({
              x: this.px - mx * 3 + (Math.random() - 0.5) * 4,
              y: this.py + 7,
              vx: -mx * 10 + (Math.random() - 0.5) * 8,
              vy: -4 - Math.random() * 6,
              life: 0.36,
              max: 0.36,
              col: "#8c8174",
              size: 1,
              gravity: -4,
            });
          }
        }
        if (t === 8) this.burst(this.px, this.py + 5, "#7aa0c0", 3, 24);
      }
    }
    if (this.flashOn) {
      this.battery = Math.max(0, this.battery - 0.12 * dt);
      if (this.battery <= 0) {
        this.flashOn = false;
        this.autoFlash = false;
        this.say("Latarka zgasła.");
      }
    }
    if (!work && (this.mouseDown || this.touchFire) && this.flareCharge <= 0) this.shoot();
  }

  private toggleFlash() {
    if (this.battery <= 0) {
      this.say("Brak baterii.");
      return;
    }
    this.flashOn = !this.flashOn;
    this.autoFlash = false;
    this.sfx.dry();
  }

  /** Automatic light reacts once per dark room, leaving a manual switch-off in that room intact. */
  private updateAutoFlash() {
    if (this.dead || this.won || this.director?.hidden) return;
    const tx = Math.floor(this.px / TILE);
    const ty = Math.floor(this.py / TILE);
    if (!this.inb(tx, ty)) { this.darknessContext = null; return; }
    const roomId = this.data().roomOf[this.idx(tx, ty)];
    const room = roomId >= 0 ? this.data().rooms[roomId] : null;
    const blackout = (this.director?.blackoutT ?? 0) > 0;
    const circuit = this.environment?.roomDark(roomId);
    const isDark = this.data().theme !== "roof" && (blackout || circuit || (!!room && !room.lit));
    const context = isDark ? `${this.floorIndex}:${roomId}:${blackout ? "blackout" : circuit ? "circuit" : "room"}` : null;
    if (context === this.darknessContext) return;
    this.darknessContext = context;
    if (!context || this.flashOn || this.battery <= 0) return;
    this.autoFlash = true;
    this.flashOn = true;
    this.sfx.dry();
  }

  private switchWeapon() {
    for (let i = 1; i < 4; i++) {
      const next = (this.pack.active + i) % 3;
      if (this.pack.slots[next]) { this.selectSlot(next); return; }
    }
  }

  private mag() {
    return this.pack.magazines[this.weapon];
  }

  private reserve() {
    const type = WEAPONS[this.weapon].ammo;
    return type ? this.pack.stock[type] : 0;
  }

  private startReload() {
    if (this.reloadT > 0 || this.dead) return;
    const max = WEAPONS[this.weapon].capacity;
    if (this.mag() >= max || this.reserve() <= 0) return;
    this.reloadT = WEAPONS[this.weapon].reload;
    this.reloadMax = this.reloadT;
    this.sfx.reload(false);
    this.particles.push({
      x: this.px + Math.cos(this.aim) * 6,
      y: this.py - 2,
      vx: (Math.random() - 0.5) * 12,
      vy: 16,
      life: 0.5,
      max: 0.5,
      col: this.weapon === "pistol" ? "#2a2c30" : COL.capLight,
      size: 2,
      gravity: 90,
    });
  }

  private updateReload(dt: number) {
    if (this.reloadT <= 0) return;
    this.reloadT -= dt;
    if (this.reloadT > 0) return;
    const spec = WEAPONS[this.weapon];
    if (!spec.ammo) return;
    const take = Math.min(spec.capacity - this.mag(), this.reserve());
    this.pack.magazines[this.weapon] += take;
    this.pack.stock[spec.ammo] -= take;
    this.sfx.reload(true);
  }

  private shoot() {
    if (this.director?.hidden || this.director?.choice || this.environment?.working) return;
    if (this.paused || this.inventoryOpen || this.activeDialog || this.won || this.shootCd > 0 || this.reloadT > 0 || this.meleeT > 0 || this.dead) return;
    const spec = WEAPONS[this.weapon];
    if (!spec.ammo) { this.melee(); return; }
    if (this.mag() <= 0) {
      this.sfx.dry();
      if (this.reserve() > 0) this.startReload();
      else this.say("Brak amunicji.");
      this.shootCd = 0.25;
      return;
    }
    const shotgun = this.weapon === "shotgun";
    const bow = this.weapon === "crossbow";
    this.pack.magazines[this.weapon]--;
    const pellets = spec.pellets;
    const spread = shotgun ? 0.42 : 0.025;
    const speed = shotgun ? 275 : 335;
    const mx = this.px + Math.cos(this.aim) * 10;
    const my = this.py + Math.sin(this.aim) * 10;
    for (let i = 0; i < pellets; i++) {
      const a = this.aim + (Math.random() - 0.5) * spread;
      this.bullets.push({
        bolt: bow,
        foe: false,
        x: mx,
        y: my,
        px: mx,
        py: my,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        dmg: spec.damage,
        life: spec.reach / speed,
      });
    }
    // Eject shell casing sideways
    if (this.floor && !bow) {
      const side = this.aim + Math.PI * 0.55 + (Math.random() - 0.5) * 0.4;
      this.floor.shells.push({
        x: this.px + Math.cos(this.aim) * 3,
        y: this.py + Math.sin(this.aim) * 3,
        z: 4,
        vx: Math.cos(side) * (24 + Math.random() * 18),
        vy: Math.sin(side) * (24 + Math.random() * 18),
        vz: 42 + Math.random() * 20,
        col: shotgun ? COL.capLight : COL.brass,
        life: 16,
      });
    }

    this.shootCd = spec.cooldown;
    if (bow) {
      this.sfx.bow();
      this.recoil = 0.22;
      this.tactical?.playerPulse(TACTICAL.noise.gun.crossbow, this.px, this.py, spec.noise * TILE, 1.2, 2);
      this.noise = (this.tactical?.state.playerNoise ?? 16) / 100;
      this.alert(this.px, this.py, spec.noise * TILE, true);
      return;
    }
    this.flashT = shotgun ? 0.075 : 0.055;
    this.environment?.ignite({ x: this.px, y: this.py });
    if (this.environmentLine(this.px, this.py, mx, my)) this.environment?.ignite({ x: mx, y: my });
    this.muzzleLight = shotgun ? 1.35 : 0.95;
    this.recoil = shotgun ? 1.0 : 0.65;
    this.shake = Math.max(this.shake, shotgun ? 4.2 : 1.8);
    this.tactical?.playerPulse(TACTICAL.noise.gun[this.weapon], this.px, this.py, spec.noise * TILE, 2.8, TACTICAL.noise.gun[this.weapon] * 0.18);
    this.noise = (this.tactical?.state.playerNoise ?? 100) / 100;
    this.alert(this.px, this.py, spec.noise * TILE, true);
    if (shotgun) this.sfx.shotgun();
    else if (this.weapon === "revolver") this.sfx.revolver();
    else this.sfx.gun();
    // Sparks & gunsmoke puffs
    this.burst(mx, my, COL.fluor, shotgun ? 7 : 4, shotgun ? 60 : 42, true);
    for (let i = 0; i < (shotgun ? 5 : 2); i++) {
      this.particles.push({
        x: mx + (Math.random() - 0.5) * 3,
        y: my + (Math.random() - 0.5) * 3,
        vx: Math.cos(this.aim) * 14 + (Math.random() - 0.5) * 14,
        vy: Math.sin(this.aim) * 14 - 8 + (Math.random() - 0.5) * 10,
        life: 0.45 + Math.random() * 0.25,
        max: 0.7,
        col: "#9c9488",
        size: 2,
        gravity: -8,
      });
    }
  }

  private melee() {
    if (this.director?.hidden || this.director?.choice || this.environment?.working) return;
    if (WEAPONS[this.weapon].ammo || this.meleeCd > 0 || this.inventoryOpen || this.activeDialog || this.dead || this.paused || !this.floor) return;
    this.meleeCd = WEAPONS[this.weapon].cooldown;
    this.meleeDur = this.weapon === "hatchet" ? 0.5 : this.weapon === "machete" ? 0.32 : 0.4;
    this.meleeT = this.meleeDur;
    this.meleeHit = false;
    if (this.weapon === "machete") this.sfx.machete(); else this.sfx.draw();
    this.tactical?.playerPulse(TACTICAL.noise.gun[this.weapon], this.px, this.py, 4.5 * TILE, 1.2, 2.5);
  }

  private meleeStrike() {
    if (!this.floor) return;
    if (this.weapon === "machete") this.sfx.machete(); else this.sfx.melee();
    let hit = this.environment?.strike(this.aim, WEAPONS[this.weapon].reach) ?? false;
    const barrelPoint = { x: this.px + Math.cos(this.aim) * 17, y: this.py + Math.sin(this.aim) * 17 };
    if (this.hitBarrelAt(barrelPoint.x, barrelPoint.y, true)) hit = true;
    for (const z of this.floor.zombies) {
      if (z.state === "dead") continue;
      const dx = z.x - this.px;
      const dy = z.y - this.py;
      const dist = Math.hypot(dx, dy);
      if (dist > WEAPONS[this.weapon].reach + z.r) continue;
      if (Math.abs(angDiff(Math.atan2(dy, dx), this.aim)) > 1.1) continue;
      const sneak = z.state === "idle";
      this.hurtZombie(z, WEAPONS[this.weapon].damage * (sneak ? 2 : 1), dx, dy, this.weapon);
      hit = true;
      if (sneak) {
        this.noise = Math.max(this.noise, 0.2);
        this.burst(z.x, z.y - 4, COL.fluor, 6, 55, true);
      }
    }
    const reach = WEAPONS[this.weapon].reach;
    for (const civ of this.director?.civilians() ?? []) {
      if (civ.state === "dead" || civ.state === "gone") continue;
      const dx = civ.x - this.px;
      const dy = civ.y - this.py;
      if (Math.hypot(dx, dy) > reach + 5) continue;
      if (Math.abs(angDiff(Math.atan2(dy, dx), this.aim)) > 1.1) continue;
      this.director?.hurtCiv(civ, WEAPONS[this.weapon].damage, dx, dy);
      hit = true;
    }
    // Sprawdź czy łom trafia w zabarykadowane drzwi — odrywa deski!
    const hx = this.px + Math.cos(this.aim) * 16;
    const hy = this.py + Math.sin(this.aim) * 16;
    const doorHit = this.data().doors.find(
      (d) => !d.sealed && !d.route && !d.open && !d.broken && Math.hypot((d.x + 0.5) * TILE - hx, (d.y + 0.5) * TILE - hy) < 16,
    );
    if (doorHit && !doorHit.locked) {
      doorHit.hp -= 3;
      this.sfx.bash();
      this.burst((doorHit.x + 0.5) * TILE, (doorHit.y + 0.5) * TILE, COL.woodLight, 8, 52);
      if (doorHit.hp <= 0) {
        doorHit.barricaded = false;
        doorHit.broken = true;
        doorHit.open = true;
        this.data().tiles[this.idx(doorHit.x, doorHit.y)] = 3;
        this.addPopup((doorHit.x + 0.5) * TILE, doorHit.y * TILE - 2, "WYWAŻONE!", COL.fluor);
      } else {
        this.addPopup((doorHit.x + 0.5) * TILE, doorHit.y * TILE - 2, "DESKI PĘKAJĄ", "#cbb89a");
      }
      hit = true;
    }
    if (hit) {
      this.shake = Math.max(this.shake, 1.8);
      this.alert(this.px, this.py, 3.2 * TILE);
    } else if (this.solidTile(Math.floor(hx / TILE), Math.floor(hy / TILE))) {
      this.sfx.hit(true);
      this.burst(hx, hy, "#f0b050", 6, 55, true);
      this.alert(hx, hy, 4.5 * TILE);
    }
  }

  private hurtZombie(z: Zombie, dmg: number, dx: number, dy: number, meleeWeapon?: WeaponId) {
    z.stimulus = "player";
    z.stimulusUntil = (this.tactical?.clock ?? 0) + 4;
    z.hp -= dmg;
    if (z.hp > 0 && meleeWeapon && (meleeWeapon === "machete" || meleeWeapon === "hatchet")
      && (z.kind === "shambler" || z.kind === "runner") && !z.bisected) {
      const chance = meleeWeapon === "machete" ? 0.46 : 0.24;
      if (Math.random() < chance) {
        // Same identity and remaining HP: no duplicate enemy, reward or kill until final death.
        z.kind = "crawler";
        z.bisected = true;
        z.r = ZT.crawler.r;
        z.speed = ZT.crawler.speed;
        z.dmg = ZT.crawler.dmg;
        z.attackEvery = ZT.crawler.every;
        z.downT = 0.55;
        z.grabWindup = 0;
        this.burst(z.x, z.y + 3, COL.bloodBright, 14, 65);
        this.addPopup(z.x, z.y - 8, "ROZPOŁOWIONY", COL.bloodBright);
      }
    }
    z.hurtFlash = 0.11;
    z.alertMark = 0.7;
    z.state = "chase";
    z.alertT = 6;
    z.lastX = this.px;
    z.lastY = this.py;
    z.pathT = 0;
    const len = Math.hypot(dx, dy) || 1;
    const push = this.moveBody(z.x, z.y, z.r, (dx / len) * 7, (dy / len) * 7);
    z.x = push.x;
    z.y = push.y;
    this.bleed(z.x, z.y, dx, dy);
    this.sfx.hit(false);
    if (z.hp <= 0) {
      if (this.grabbedBy === z.id) {
        this.grabbedBy = null;
        this.grabStruggles = 0;
        this.grabProtection = 1.2;
      }
      z.state = "dead";
      z.hp = 0;
      z.deadT = 0;
      this.kills += 1;
      this.shake = Math.max(this.shake, 2.4);
      if (this.floor) {
        this.floor.blood.push({ x: z.x, y: z.y, n: 4 + Math.floor(Math.random() * 4), seed: Math.random() * 999 });
        if (this.floor.blood.length > 90) this.floor.blood.shift();
      }
      this.burst(z.x, z.y, COL.bloodBright, 12, 75);
      if (z.kind === "boss") {
        this.bossKilled = true;
        this.shake = 9;
        this.sfx.bossDie();
        this.burst(z.x, z.y, COL.bloodBright, 26, 110);
        this.burst(z.x, z.y, COL.blood, 20, 80);
        if (this.floor) {
          for (let i = 0; i < 5; i++) {
            this.floor.blood.push({
              x: z.x + (Math.random() - 0.5) * 24,
              y: z.y + (Math.random() - 0.5) * 18,
              n: 5,
              seed: Math.random() * 999,
            });
          }
        }
        this.say("WIELKI PADŁ. Odpal flarę — śmigłowiec w drodze.");
      }
    }
  }

  private damagePlayer(dmg: number, fromX: number, fromY: number, environment = false) {
    if (this.invuln > 0 || this.dead) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 0.55;
    this.hurt = 1;
    this.environmentHit = environment;
    this.shake = environment ? Math.max(this.shake, 2.2) : 5;
    if (this.flareCharge > 0.15) this.say("Przerwane!");
    this.flareCharge = 0;
    const dx = this.px - fromX;
    const dy = this.py - fromY;
    const len = Math.hypot(dx, dy) || 1;
    const push = environment ? 4 : 10;
    const n = this.moveBody(this.px, this.py, 4.4, (dx / len) * push, (dy / len) * push);
    this.px = n.x;
    this.py = n.y;
    this.sfx.hurt();
    if (!environment) this.bleed(this.px, this.py, dx, dy);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deadT = 0;
      this.sfx.die();
    }
  }

  private alert(x: number, y: number, radius: number, investigate = false) {
    if (!this.floor) return;
    this.tactical?.emit(x, y, Math.min(90, radius / TILE * 4), radius, 1.8, Math.min(18, radius / TILE * 0.65), investigate ? "world" : "player");
    for (const z of this.floor.zombies) {
      if (z.state === "dead") continue;
      if (Math.hypot(z.x - x, z.y - y) <= radius) {
        if (z.state !== "chase") z.alertMark = 0.85;
        z.state = "chase";
        z.lastX = investigate ? x : this.px;
        z.lastY = investigate ? y : this.py;
        z.alertT = 6.5;
        z.pathT = 0;
      }
    }
  }

  private walkable(x: number, y: number, idle: boolean) {
    if (!this.inb(x, y)) return false;
    const t = this.tileAt(x, y);
    if (t === Tile.Wall || t === Tile.Window || t === Tile.Sky || t === Tile.Hole) return false;
    if (this.propSolid[this.idx(x, y)] || this.environment?.blocksTile(x, y)) return false;
    if (this.environment?.inSteam((x + 0.5) * TILE, (y + 0.5) * TILE)) return false;
    if (t === 2) {
      const d = this.doorAt(x, y);
      if (!d || d.sealed || d.route || d.locked || idle) return false;
      return true;
    }
    return true;
  }

  private rayClear(x0: number, y0: number, x1: number, y1: number) {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (x !== x1 || y !== y1) {
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
      if (x === x1 && y === y1) return true;
      if (this.opaque(x, y)) return false;
    }
    return true;
  }

  private environmentLine(x0: number, y0: number, x1: number, y1: number) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2);
    let lastX = Math.floor(x0 / TILE), lastY = Math.floor(y0 / TILE);
    if (this.opaque(lastX, lastY)) return false;
    for (let i = 1; i <= steps; i++) {
      const x = Math.floor((x0 + (x1 - x0) * i / steps) / TILE);
      const y = Math.floor((y0 + (y1 - y0) * i / steps) / TILE);
      if (this.opaque(x, y) || (x !== lastX && y !== lastY && (this.opaque(x, lastY) || this.opaque(lastX, y)))) return false;
      lastX = x; lastY = y;
    }
    return true;
  }

  private castRay(ox: number, oy: number, angle: number, maxDist: number) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const step = 3.0;
    for (let d = 4; d <= maxDist; d += step) {
      const x = ox + dx * d;
      const y = oy + dy * d;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (this.opaque(tx, ty)) {
        // Step slightly inside wall edge so wall faces catch the beam
        return { x: ox + dx * (d + 4), y: oy + dy * (d + 4), dist: d };
      }
    }
    return { x: ox + dx * maxDist, y: oy + dy * maxDist, dist: maxDist };
  }

  private fixtureIntensity(lf: { flicker: boolean; roomId: number; x: number; y: number }) {
    if (this.environment?.roomDark(lf.roomId)) return 0;
    if (!lf.flicker) return 1;
    const seed = lf.roomId * 9.2 + lf.x * 0.03;
    const n = Math.sin(this.time * 16.5 + seed) * Math.sin(this.time * 5.7 + seed * 0.5);
    if (n > 0.92) return 0.18;
    if (n > 0.85) return 0.52;
    return 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(this.time * 7.5 + seed));
  }

  private computeVisibility() {
    if (!this.floor) return;
    this.vis.fill(0);
    this.light.fill(0);
    const ptx = Math.floor(this.px / TILE);
    const pty = Math.floor(this.py / TILE);
    const roomId = this.inb(ptx, pty) ? this.data().roomOf[this.idx(ptx, pty)] : -1;
    const room = roomId >= 0 ? this.data().rooms[roomId] : null;
    const theme = this.data().theme;
    const blackout = (this.director?.blackoutT ?? 0) > 0;
    const base = theme === "roof" ? 13 : blackout || this.environment?.roomDark(roomId) ? 3.4 : room?.lit ? 9.0 : theme === "lobby" ? 6.2 : 3.4;
    const flashR = this.flashOn && this.battery > 0 ? 11.4 : 0;
    const maxR = Math.ceil(Math.max(base, flashR));
    for (let ty = pty - maxR; ty <= pty + maxR; ty++) {
      for (let tx = ptx - maxR; tx <= ptx + maxR; tx++) {
        if (!this.inb(tx, ty)) continue;
        const dx = tx + 0.5 - this.px / TILE;
        const dy = ty + 0.5 - this.py / TILE;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const inCone = flashR > 0 && Math.abs(angDiff(ang, this.aim)) < 0.62;
        const reach = inCone ? flashR : base;
        if (dist > reach) continue;
        if (!this.rayClear(ptx, pty, tx, ty)) continue;
        const i = this.idx(tx, ty);
        const rid = this.data().roomOf[i];
        if (this.environment?.roomHidden(rid)) continue;
        this.vis[i] = 1;
        this.floor.explored[i] = 1;
        // odsłoń także narożniki i ściany po skosie, żeby mury nie miały czarnych wyrw
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const nx = tx + ox;
            const ny = ty + oy;
            if (!this.inb(nx, ny)) continue;
            const nt = this.tileAt(nx, ny);
            if (nt === 0 || nt === 6) this.floor.explored[this.idx(nx, ny)] = 1;
          }
        }
        const rr = rid >= 0 ? this.data().rooms[rid] : null;
        let L = 0.25;
        if (theme === "roof") L = 0.92;
        else if (blackout || this.environment?.roomDark(rid)) L = 0.2;
        else if (rr?.lit) L = 0.82;
        else if (theme === "lobby") L = 0.48;
        else if (theme === "flat") L = 0.3;
        if (inCone) L = Math.max(L, 0.96 * (1 - dist / flashR));
        if (dist < 1.8) L = Math.max(L, 0.55);
        this.light[i] = Math.max(0.2, Math.min(1, L));
      }
    }
  }

  private seesPlayer(z: Zombie) {
    const d = Math.hypot(z.x - this.px, z.y - this.py);
    if (this.director?.hidden) {
      const spot = this.director.hidePosition();
      const remembered = z.seenWardrobe && spot && z.seenWardrobe.x === Math.floor(spot.x / TILE) && z.seenWardrobe.y === Math.floor(spot.y / TILE);
      return (this.director.isWitness(z.id) || !!remembered) && d < 9 * TILE;
    }
    if (d > 7.6 * TILE) return false;
    if (
      !this.rayClear(
        Math.floor(z.x / TILE),
        Math.floor(z.y / TILE),
        Math.floor(this.px / TILE),
        Math.floor(this.py / TILE),
      )
    )
      return false;
    if (d < 22) return true;
    if (
      this.flashOn &&
      this.battery > 0 &&
      d < 10.6 * TILE &&
      Math.abs(angDiff(Math.atan2(this.py - z.y, this.px - z.x), this.aim)) < 0.7
    )
      return true;
    const tx = Math.floor(z.x / TILE);
    const ty = Math.floor(z.y / TILE);
    const lit = this.inb(tx, ty) ? this.light[this.idx(tx, ty)] : 0;
    if (lit > 0.42) return true;
    return d < 2.2 * TILE;
  }

  private updateZombieStimulus(z: Zombie, playerSeen: boolean, playerDist: number) {
    if (!this.tactical) return playerSeen;
    const close = playerSeen && playerDist < TACTICAL.devices.closePlayerOverride;
    if (close) {
      z.stimulus = "player";
      z.stimulusUntil = this.tactical.clock + TACTICAL.devices.interestSeconds;
      z.lastX = this.px; z.lastY = this.py;
      return true;
    }
    const heard = this.tactical.strongestFor(z.x, z.y, (source) => this.rayClear(
      Math.floor(z.x / TILE), Math.floor(z.y / TILE), Math.floor(source.x / TILE), Math.floor(source.y / TILE)) ? 1 : 0.38);
    const committed = this.tactical.clock < z.stimulusUntil;
    if (heard && (!playerSeen || playerDist > 4 * TILE || heard.source === "device") && (!committed || heard.source === "device")) {
      if (z.stimulus !== heard.source || Math.hypot(z.lastX - heard.x, z.lastY - heard.y) > 12) {
        z.alertMark = 0.7; // visible pause/turn toward the new source
        z.pathT = 0;
      }
      z.stimulus = heard.source === "world" ? "noise" : heard.source;
      z.stimulusUntil = this.tactical.clock + TACTICAL.devices.interestSeconds;
      z.lastX = heard.x; z.lastY = heard.y;
      z.state = "chase";
      z.alertT = Math.max(z.alertT, 6);
      return false;
    }
    if (playerSeen && z.stimulus !== "device" && z.stimulus !== "noise") {
      z.stimulus = "player";
      return true;
    }
    if (playerSeen && z.stimulus === null) {
      z.stimulus = "player";
      return true;
    }
    if (this.tactical.clock >= z.stimulusUntil && !playerSeen) z.stimulus = null;
    return false;
  }

  private updateZombies(dt: number) {
    if (!this.floor) return;
    this.grabProtection = Math.max(0, this.grabProtection - dt);
    const list = this.floor.zombies;
    for (const z of list) {
      z.animT += dt;
      z.grabCd = Math.max(0, z.grabCd - dt);
      z.attackCd = Math.max(0, z.attackCd - dt);
      z.hurtFlash = Math.max(0, z.hurtFlash - dt);
      z.alertMark = Math.max(0, z.alertMark - dt);
      z.bashT = Math.max(0, z.bashT - dt);
      if (z.state === "dead") {
        z.deadT += dt;
        continue;
      }
      if (this.grabbedBy === z.id) continue;
      if (z.downT > 0) {
        z.downT = Math.max(0, z.downT - dt);
        continue;
      }
      if (z.kind === "boss") {
        z.roarT -= dt;
        const dBoss = Math.hypot(z.x - this.px, z.y - this.py);
        if (z.roarT <= 0 && dBoss < 11 * TILE && z.state === "chase") {
          z.roarT = 7;
          z.alertMark = 1.1;
          this.sfx.roar();
          this.shake = 6;
          this.alert(z.x, z.y, 999);
          this.burst(z.x, z.y - 10, COL.bloodBright, 18, 95, true);
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            this.particles.push({
              x: z.x + Math.cos(a) * 14,
              y: z.y + Math.sin(a) * 14,
              vx: Math.cos(a) * 55,
              vy: Math.sin(a) * 55,
              life: 0.4,
              max: 0.4,
              col: "#e05048",
              size: 1,
              glow: true,
              gravity: 0,
            });
          }
        }
      }
      const playerSeen = this.seesPlayer(z);
      if (playerSeen && z.state !== "chase") this.director?.onSpotted({ id: z.id, x: z.x, y: z.y, dead: false }, z.screamer);
      const civTarget = this.director?.nearestCivTo(z.x, z.y, 9 * TILE) ?? null;
      const civDist = civTarget ? Math.hypot(civTarget.x - z.x, civTarget.y - z.y) : Infinity;
      const playerDist = Math.hypot(z.x - this.px, z.y - this.py);

      // Audible grab windup: retreat can cancel it; a successful hold finishes before distraction checks.
      if (z.kind !== "crawler" && z.kind !== "boss" && this.grabbedBy === null && this.grabProtection <= 0 && !this.director?.hidden) {
        if (z.grabWindup > 0) {
          if (playerDist > TACTICAL.ai.grabRange + 10 || !playerSeen) {
            z.grabWindup = 0;
          } else {
            z.grabWindup -= dt;
            z.alertMark = 0.5;
            if (z.grabWindup <= 0 && playerDist <= TACTICAL.ai.grabRange + 4) {
              this.grabbedBy = z.id;
              this.grabStruggles = 0;
              this.grabTick = 0.65;
              z.grabCd = 7;
              this.damagePlayer(4, z.x, z.y);
              this.say("Zombie powala cię! ODPCHNIJ — pięć osobnych naciśnięć E.");
              this.emitHud(true);
              continue;
            }
          }
          continue;
        }
        if (playerSeen && playerDist < TACTICAL.ai.grabRange && z.grabCd <= 0) {
          z.grabWindup = TACTICAL.ai.grabWindup;
          z.grabCd = 7;
          z.alertMark = 1;
          this.sfx.groan(this.time, z.kind);
          continue;
        }
      }

      // Zombie wolą gracza; cywila atakują, gdy jest naprawdę blisko lub gdy gracz zniknął z oczu.
      const useCiv = !!civTarget && (civDist < 4.5 * TILE || (!playerSeen && civDist < playerDist * 0.7));
      const seesTarget = this.updateZombieStimulus(z, playerSeen, playerDist);
      const see = seesTarget || useCiv;
      const tgX = useCiv && civTarget ? civTarget.x : see ? this.px : z.lastX;
      const tgY = useCiv && civTarget ? civTarget.y : see ? this.py : z.lastY;
      if (see && z.state !== "chase") z.alertMark = 0.9;
      if (see) {
        z.state = "chase";
        z.lastX = tgX;
        z.lastY = tgY;
        z.alertT = 5.5;
      }
      const distP = Math.hypot(z.x - tgX, z.y - tgY);
      if (z.state === "chase") {
        z.alertT -= dt;
        z.pathT -= dt;
        if (z.pathT <= 0) {
          z.pathT = 0.42;
          const gx = Math.floor((see ? tgX : z.lastX) / TILE);
          const gy = Math.floor((see ? tgY : z.lastY) / TILE);
          const sx = Math.floor(z.x / TILE);
          const sy = Math.floor(z.y / TILE);
          z.path = astar(this.data().w, this.data().h, sx, sy, gx, gy, (x, y) => this.walkable(x, y, false)) ?? [];
        }
        if (z.path.length) {
          const n = z.path[0];
          if (this.tileAt(n.x, n.y) === 2) {
            const door = this.doorAt(n.x, n.y);
            if (door && !door.open && !door.broken && !door.locked && !door.sealed && !door.route && z.bashT <= 0) {
              z.bashT = z.kind === "brute" ? 0.7 : 0.85;
              door.hp -= z.kind === "brute" ? 2 : 1;
              this.sfx.bash();
              this.burst((door.x + 0.5) * TILE, (door.y + 0.5) * TILE, COL.woodLight, 5, 42);
              this.alert(z.x, z.y, 7 * TILE);
              this.shake = Math.max(this.shake, 0.9);
              if (door.hp <= 0) {
                door.broken = true;
                door.open = true;
                this.data().tiles[this.idx(door.x, door.y)] = 3;
                this.burst((door.x + 0.5) * TILE, (door.y + 0.5) * TILE, COL.wood, 12, 65);
                this.say("Drzwi puściły.");
              }
            }
          } else {
            const tx = (n.x + 0.5) * TILE;
            const ty = (n.y + 0.5) * TILE;
            this.stepZombie(z, tx, ty, dt);
            if (Math.hypot(z.x - tx, z.y - ty) < 5) z.path.shift();
          }
        } else if (see) {
          this.stepZombie(z, tgX, tgY, dt);
        }
        const contactDistance = useCiv ? civDist : playerDist;
        if (contactDistance < z.r + 4.4 + 3 && z.attackCd <= 0) {
          z.attackCd = z.attackEvery;
          z.dir = dirFrom(Math.atan2(tgY - z.y, tgX - z.x));
          if (useCiv && civTarget) this.director?.hurtCiv(civTarget, z.dmg, civTarget.x - z.x, civTarget.y - z.y, false);
          else if (!this.director?.hidden || this.director.isWitness(z.id)) this.damagePlayer(z.dmg, z.x, z.y);
        }
        if (!see && Math.hypot(z.x - z.lastX, z.y - z.lastY) < 12) {
          z.searchT -= dt;
          if (z.searchT <= 0) {
            z.searchT = TACTICAL.ai.searchSeconds;
            z.lastX += (Math.random() - 0.5) * 4 * TILE;
            z.lastY += (Math.random() - 0.5) * 4 * TILE;
            z.pathT = 0;
          }
          if (this.tactical && this.tactical.clock > z.stimulusUntil) z.stimulus = null;
        }
        if (!see && z.alertT <= 0) { z.state = "idle"; z.stimulus = null; }
        if (distP < 6.5 * TILE && !this.vis[this.idx(Math.floor(z.x / TILE), Math.floor(z.y / TILE))])
          this.sfx.groan(this.time, z.kind);
      } else {
        const dFloor = this.data();
        const patrolRoom = dFloor.rooms[z.home];
        if (!z.patrol.length && patrolRoom && dFloor.roomZones[z.home] === "KORYTARZ") {
          z.patrol = buildFallbackCorridorPatrol(dFloor, z.x, z.y);
          z.patrolIndex = z.patrol.length > 1 ? 1 : 0;
          z.patrolPause = 0.4 + Math.random() * 1.0;
        }
        if (z.patrol.length >= 2) {
          const target = z.patrol[z.patrolIndex % z.patrol.length];
          if (z.patrolPause > 0) {
            z.patrolPause -= dt;
            z.patrolScanT -= dt;
            // Pause briefly at intersections and visibly look around the corridor.
            if (z.patrolScanT <= 0) {
              z.patrolScanT = 0.55 + Math.random() * 0.5;
              const order: Dir[] = ["up", "right", "down", "left"];
              z.dir = order[(order.indexOf(z.dir) + (Math.random() < 0.5 ? 1 : 3)) % 4];
            }
            continue;
          }
          // Patrol only along open passable corridor tiles (fallback to open floor if a corpse/feature moved)
          const tx = (target.x + 0.5) * TILE;
          const ty = (target.y + 0.5) * TILE;
          const remain = Math.hypot(z.x - tx, z.y - ty);
          // Slight natural loose spread for group members (arrives comfortably near waypoint without piling tightly!)
          const arriveDist = z.groupId !== undefined ? 18 : 8;
          if (remain < arriveDist) {
            // In patrol groups, briefly hold & observe until trailing allies catch up near this intersection
            if (z.groupId !== undefined) {
              const pack = list.filter((a) => a.state === "idle" && a.groupId === z.groupId && a.patrolIndex === z.patrolIndex);
              const waitingOn = pack.some((a) => a !== z && Math.hypot(a.x - tx, a.y - ty) > 36 && a.patrolStuck < 2.2);
              if (waitingOn) {
                z.patrolPause = 0.25;
                z.path = [];
                continue;
              }
              // Synchronized departure with natural slight stagger keeps groups haunting corridors side-by-side!
              const nextIdx = (z.patrolIndex + 1) % z.patrol.length;
              pack.forEach((m, k) => {
                m.patrolIndex = nextIdx;
                m.patrolPause = 1.0 + k * 0.3 + Math.random() * 0.2;
                m.patrolStuck = 0;
                m.patrolLastDist = Infinity;
                m.path = [];
              });
              continue;
            }
            z.patrolIndex = (z.patrolIndex + 1) % z.patrol.length;
            z.patrolPause = 0.9 + Math.random() * 1.6;
            z.patrolStuck = 0;
            z.patrolLastDist = Infinity;
            z.path = [];
            continue;
          }
          // Watchdog: detect obstacle change/blockage and repath or advance cleanly to next reachable waypoint.
          if (remain < z.patrolLastDist - 1.2) {
            z.patrolLastDist = remain;
            z.patrolStuck = 0;
          } else {
            z.patrolStuck += dt;
          }
          const patrolPass = (x: number, y: number) => {
            if (!this.walkable(x, y, true)) return false;
            const rid = dFloor.roomOf[this.idx(x, y)];
            const zn = rid >= 0 ? dFloor.roomZones[rid] : "";
            // Stay in main corridor circulation while calmly patrolling; only step out when alerted!
            return zn === "KORYTARZ" || (x === Math.floor(z.x / TILE) && y === Math.floor(z.y / TILE));
          };
          z.pathT -= dt;
          const nextBlocked = z.path.length > 0 && !this.walkable(z.path[0].x, z.path[0].y, true);
          if (z.pathT <= 0 || !z.path.length || nextBlocked || z.patrolStuck > 1.4) {
            z.pathT = 0.85;
            const zx = Math.floor(z.x / TILE);
            const zy = Math.floor(z.y / TILE);
            let nextPath = astar(dFloor.w, dFloor.h, zx, zy, target.x, target.y, patrolPass);
            if (!nextPath) {
              // If zombie walked into an apartment chasing noise and now calmed down, walk back through open tiles/doors to corridor patrol!
              nextPath = astar(dFloor.w, dFloor.h, zx, zy, target.x, target.y, (x, y) => this.walkable(x, y, false));
            }
            z.path = nextPath ?? [];
            if ((!z.path.length || z.patrolStuck > 3.2) && z.patrol.length >= 2) {
              const nextIdx = (z.patrolIndex + 1) % z.patrol.length;
              if (z.groupId !== undefined) {
                for (const m of list) {
                  if (m.state === "idle" && m.groupId === z.groupId) {
                    m.patrolIndex = nextIdx;
                    m.patrolPause = 0.4 + Math.random() * 0.4;
                    m.patrolStuck = 0;
                    m.patrolLastDist = Infinity;
                    m.path = [];
                  }
                }
              } else {
                z.patrolIndex = nextIdx;
                z.patrolPause = 0.5 + Math.random() * 0.8;
                z.patrolStuck = 0;
                z.patrolLastDist = Infinity;
                z.path = [];
              }
              continue;
            }
          }
          if (z.path.length) {
            const n = z.path[0];
            // Keep unified measured patrol speed inside a group (runner matches shambler calm gait) with natural spacing!
            const baseMul = z.groupId !== undefined ? Math.min(0.68, 13.5 / Math.max(12, z.speed)) : 0.54;
            let speedMul = baseMul;
            if (z.groupId !== undefined) {
              for (const ally of list) {
                if (ally === z || ally.state !== "idle" || ally.groupId !== z.groupId) continue;
                const d = Math.hypot(ally.x - z.x, ally.y - z.y);
                const toWay = (ally.x - z.x) * ((n.x + 0.5) * TILE - z.x) + (ally.y - z.y) * ((n.y + 0.5) * TILE - z.y);
                if (d < 18 && toWay > 0) speedMul *= 0.72; // gentle gap spacing so pack walks slightly staggered
              }
            }
            const nx = (n.x + 0.5) * TILE;
            const ny = (n.y + 0.5) * TILE;
            // Break out any unlocked door smoothly if returning from apartment after a search
            const blocker = this.tileAt(n.x, n.y) === 2 ? this.doorAt(n.x, n.y) : undefined;
            if (blocker && !blocker.open && !blocker.broken && !blocker.locked && !blocker.sealed && !blocker.route) {
              if (z.bashT <= 0) {
                z.bashT = 0.9;
                blocker.open = true;
                dFloor.tiles[this.idx(blocker.x, blocker.y)] = Tile.DoorOpen;
              }
            } else {
              this.stepZombie(z, nx, ny, dt, speedMul);
              if (Math.hypot(z.x - nx, z.y - ny) < 6) z.path.shift();
            }
          }
          continue;
        }
        z.wanderT -= dt;
        if (z.wanderT <= 0) {
          z.wanderT = 2 + Math.random() * 2.5;
          const room = this.data().rooms[z.home];
          if (room) {
            const tx = room.x + 1 + Math.floor(Math.random() * Math.max(1, room.w - 2));
            const ty = room.y + 1 + Math.floor(Math.random() * Math.max(1, room.h - 2));
            z.path =
              astar(this.data().w, this.data().h, Math.floor(z.x / TILE), Math.floor(z.y / TILE), tx, ty, (x, y) =>
                this.walkable(x, y, true),
              ) ?? [];
          }
        }
        if (z.path.length) {
          const n = z.path[0];
          this.stepZombie(z, (n.x + 0.5) * TILE, (n.y + 0.5) * TILE, dt, 0.55);
          if (Math.hypot(z.x - (n.x + 0.5) * TILE, z.y - (n.y + 0.5) * TILE) < 5) z.path.shift();
        }
      }
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.state === "dead" || b.state === "dead") continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const min = a.r + b.r - 1;
        if (dist < min) {
          const push = (min - dist) * 0.5;
          a.x -= (dx / dist) * push;
          a.y -= (dy / dist) * push;
          b.x += (dx / dist) * push;
          b.y += (dy / dist) * push;
        }
      }
    }
    for (const z of list) {
      if (z.state === "dead") continue;
      if (!this.canOccupy(z.x, z.y, z.r * 0.8)) {
        const free = this.shoveOut(z.x, z.y, z.r * 0.8);
        z.x = free.x;
        z.y = free.y;
      }
    }
    const dead = list.filter((z) => z.state === "dead");
    if (dead.length > 26) {
      const oldest = dead.sort((a, b) => b.deadT - a.deadT).slice(22);
      this.floor.zombies = list.filter((z) => !oldest.includes(z));
    }
  }

  private stepZombie(z: Zombie, tx: number, ty: number, dt: number, mul = 1) {
    const dx = tx - z.x;
    const dy = ty - z.y;
    const len = Math.hypot(dx, dy) || 1;
    const pace = this.environment?.inSteam(z.x, z.y) ? 0.52 : this.environment?.slow(z.id) ? 0.62 : 1;
    const step = z.speed * mul * dt * pace;
    const n = this.moveBody(z.x, z.y, z.r, (dx / len) * step, (dy / len) * step);
    z.x = n.x;
    z.y = n.y;
    z.dir = dirFrom(Math.atan2(dy, dx));
  }

  private updateBullets(dt: number) {
    if (!this.floor) return;
    for (const b of this.bullets) {
      b.life -= dt;
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const tx = Math.floor(b.x / TILE);
      const ty = Math.floor(b.y / TILE);
      if (this.solidTile(tx, ty) || b.life <= 0) {
        b.life = 0;
        this.burst(b.x, b.y, "#f0b868", 4, 42, true);
        this.burst(b.x, b.y, "#cbb89a", 3, 28);
        continue;
      }
      if (!b.foe && this.hitBarrelAt(b.x, b.y, false)) {
        b.life = 0;
        continue;
      }
      if (b.foe) {
        if (!this.director?.hidden && !this.dead && Math.hypot(this.px - b.x, this.py - b.y) < 6.5) {
          this.damagePlayer(b.dmg, b.x, b.y);
          b.life = 0;
        }
        continue;
      }
      const civ = this.director?.nearestCivTo(b.x, b.y, 7);
      if (civ) {
        this.director?.hurtCiv(civ, b.dmg, b.x - this.px, b.y - this.py);
        b.life = 0;
        continue;
      }
      for (const z of this.floor.zombies) {
        if (z.state === "dead") continue;
        if (Math.hypot(z.x - b.x, z.y - b.y) < z.r + 2.4) {
          this.hurtZombie(z, b.dmg, z.x - this.px, z.y - this.py);
          b.life = 0;
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  private updateParticles(dt: number) {
    if (this.floor?.data.theme === "roof" && this.particles.length < 90 && Math.random() < 0.72) {
      this.particles.push({
        x: this.camX + Math.random() * (this.viewW + 40),
        y: this.camY - 4,
        vx: -18,
        vy: 94,
        life: 0.62,
        max: 0.62,
        col: "#9ab4d0",
        size: 1,
        gravity: 0,
      });
    }
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.gravity ?? 24) * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private updateFlare(dt: number) {
    const flare = this.data().flare;
    if (!flare) {
      this.flareCharge = 0;
      return;
    }
    const fx = (flare.x + 0.5) * TILE;
    const fy = (flare.y + 0.5) * TILE;
    const dist = Math.hypot(this.px - fx, this.py - fy);
    const holding = this.keys.has("KeyE") || this.touchHold;
    if (dist < 26 && holding && this.interactLock <= 0) {
      if (!this.bossKilled) {
        if (!this.bossWarned) {
          this.bossWarned = true;
          this.say("Najpierw pozbądź się Wielkiego.");
        }
        this.flareCharge = 0;
        return;
      }
      this.flareCharge += dt;
      this.flareSfxT -= dt;
      if (this.flareSfxT <= 0) {
        this.flareSfxT = 0.45;
        this.sfx.flare();
      }
      if (Math.random() < 0.5) {
        this.particles.push({
          x: fx + (Math.random() - 0.5) * 6,
          y: fy - 2,
          vx: (Math.random() - 0.5) * 28,
          vy: -32 - Math.random() * 25,
          life: 0.4,
          max: 0.4,
          col: Math.random() > 0.4 ? COL.bloodBright : COL.fluor,
          size: 1,
          glow: true,
          gravity: 10,
        });
      }
      if (this.flareCharge >= 2.7) this.startHeli();
    } else this.flareCharge = Math.max(0, this.flareCharge - dt * 1.4);
  }

  private startHeli() {
    if (this.heliPhase) return;
    this.heliPhase = "in";
    this.heliT = 0;
    const flare = this.data().flare!;
    const tx = (flare.x + 0.5) * TILE;
    const ty = (flare.y + 0.5) * TILE;
    this.heliPos = { x: tx + 300, y: ty - 220, h: 120 };
    this.say("Śmigłowiec nadlatuje!");
  }

  private updateHeli(dt: number) {
    if (!this.heliPhase || !this.floor) return;
    const flare = this.data().flare!;
    const tx = (flare.x + 0.5) * TILE;
    const ty = (flare.y + 0.5) * TILE;
    this.heliT += dt;
    this.heliTickT -= dt;
    if (this.heliPhase === "in") {
      const k = Math.min(1, this.heliT / 3.2);
      const e = k * k * (3 - 2 * k);
      this.heliPos.x = tx + 300 * (1 - e);
      this.heliPos.y = ty - 220 * (1 - e);
      this.heliPos.h = 120 * (1 - e);
      this.shake = Math.max(this.shake, 0.5 + k);
      if (this.heliTickT <= 0) {
        this.heliTickT = 0.09;
        this.sfx.heliTick(0.35 + k * 0.65);
      }
      if (k >= 1) {
        this.heliPhase = "landed";
        this.heliT = 0;
        this.sfx.heliLand();
        this.shake = 4;
        this.say("Wskakuj!");
        // lądowanie płoszy pozostałe zombie
        for (const z of this.floor.zombies) {
          if (z.state === "dead") continue;
          z.state = "idle";
          z.alertT = 0;
          z.path = [];
          z.wanderT = 99;
          const away = Math.atan2(z.y - ty, z.x - tx);
          const free = this.shoveOut(z.x + Math.cos(away) * 46, z.y + Math.sin(away) * 46, z.r * 0.8);
          z.x = free.x;
          z.y = free.y;
        }
      }
    } else {
      if (this.heliTickT <= 0) {
        this.heliTickT = 0.09;
        this.sfx.heliTick(1);
      }
      if (this.heliT > 1.5) this.win();
    }
  }

  private win() {
    if (this.won) return;
    this.won = true;
    this.wonT = 0;
    this.sfx.win();
    this.shake = 4.5;
    this.muzzleLight = 2.0;
    this.burst(this.px, this.py - 4, COL.bloodBright, 16, 95, true);
    this.burst(this.px, this.py - 4, COL.fluor, 18, 105, true);
  }

  private finish(won: boolean) {
    if (this.ended) return;
    this.ended = true;
    const score = this.score(won);
    this.hooks.onEnd({
      seed: this.seed,
      time: this.time,
      kills: this.kills,
      floor: this.floorIndex,
      floors: FLOOR_COUNT,
      hp: Math.ceil(this.hp),
      score,
      won,
      best: score,
    });
  }

  private score(won: boolean) {
    return (
      this.kills * 40 +
      this.floorIndex * 800 +
      Math.ceil(this.hp) * 3 +
      (this.bossKilled ? 1500 : 0) +
      (won ? 2800 + Math.max(0, 900 - Math.floor(this.time)) * 2 : 0)
    );
  }

  private burst(x: number, y: number, col: string, n: number, spd: number, glow = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.3 + Math.random());
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.24 + Math.random() * 0.28,
        max: 0.52,
        col,
        size: 1,
        glow,
      });
    }
    if (this.particles.length > 210) this.particles.splice(0, this.particles.length - 210);
  }

  private bleed(x: number, y: number, dx: number, dy: number) {
    const len = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x,
        y,
        vx: (dx / len) * 24 + (Math.random() - 0.5) * 55,
        vy: (dy / len) * 24 + (Math.random() - 0.5) * 55,
        life: 0.32,
        max: 0.32,
        col: Math.random() > 0.35 ? COL.bloodBright : COL.blood,
        size: Math.random() > 0.7 ? 2 : 1,
      });
    }
  }

  private addPopup(x: number, y: number, text: string, col: string) {
    this.popups.push({ x, y, text, col, life: 1.55, max: 1.55 });
  }

  private updatePopups(dt: number) {
    for (const pop of this.popups) {
      pop.life -= dt;
      pop.y -= 11 * dt;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  private updateSurvivors(dt: number) {
    if (!this.floor) return;
    if (this.activeDialog) {
      const d = this.activeDialog;
      const line = d.npc.lines[d.lineIdx] ?? "";
      if (d.charIdx < line.length) {
        d.charIdx = Math.min(line.length, d.charIdx + dt * 36);
        d.whisperT -= dt;
        if (d.whisperT <= 0) {
          d.whisperT = 0.085;
          this.sfx.whisper();
        }
      }
      if (Math.hypot(this.px - d.npc.x, this.py - d.npc.y) > 48) {
        this.finishSurvivorDialog(d.npc);
      }
    }

    for (const s of this.floor.survivors) {
      s.animT += dt;
      if (s.state === "gone") continue;
      if (s.state === "hide") {
        const tx = Math.floor(s.x / TILE);
        const ty = Math.floor(s.y / TILE);
        const visible = this.inb(tx, ty) && this.vis[this.idx(tx, ty)] === 1;
        if (visible && !this.activeDialog && Math.hypot(this.px - s.x, this.py - s.y) < 28) {
          this.startSurvivorDialog(s);
        }
      } else if (s.state === "flee") {
        s.fleeT += dt;
        const speed = 104;
        const n = this.moveBody(s.x, s.y, 4.0, s.vx * speed * dt, s.vy * speed * dt);
        if (Math.hypot(n.x - s.x, n.y - s.y) < 0.4) {
          const a = Math.random() * Math.PI * 2;
          s.vx = Math.cos(a);
          s.vy = Math.sin(a);
        } else {
          s.x = n.x;
          s.y = n.y;
        }
        if (s.fleeT > 3.2) s.state = "gone";
      }
    }
  }

  private startSurvivorDialog(s: LiveSurvivor) {
    s.state = "talk";
    this.activeDialog = { npc: s, lineIdx: 0, charIdx: 0, whisperT: 0 };
    this.sfx.whisper();
    this.emitHud(true);
  }

  private advanceDialog() {
    if (!this.activeDialog) return;
    const d = this.activeDialog;
    const line = d.npc.lines[d.lineIdx] ?? "";
    if (d.charIdx < line.length) {
      d.charIdx = line.length;
      this.sfx.whisper();
      this.emitHud(true);
      return;
    }
    if (d.lineIdx + 1 < d.npc.lines.length) {
      d.lineIdx++;
      d.charIdx = 0;
      this.sfx.whisper();
      this.emitHud(true);
      return;
    }
    this.finishSurvivorDialog(d.npc);
  }

  private finishSurvivorDialog(npc: LiveSurvivor) {
    if (npc.state === "flee" || npc.state === "gone") {
      this.activeDialog = null;
      return;
    }
    this.activeDialog = null;
    npc.state = "flee";
    npc.fleeT = 0;
    // wybierz kierunek ucieczki (najlepiej przez otwarte przejście)
    let bestA = Math.random() * Math.PI * 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const tx = Math.floor((npc.x + Math.cos(a) * 20) / TILE);
      const ty = Math.floor((npc.y + Math.sin(a) * 20) / TILE);
      if (!this.solidTile(tx, ty)) {
        bestA = a;
        break;
      }
    }
    npc.vx = Math.cos(bestA);
    npc.vy = Math.sin(bestA);
    if (npc.gift === "med") {
      this.hp = Math.min(this.maxHp, this.hp + 40);
      this.sfx.med();
      this.addPopup(npc.x, npc.y - 10, "+40 ŻYCIA", "#7d9a5c");
    } else if (npc.gift === "ammo") {
      this.pack.stock.rounds += 12;
      this.sfx.pickup();
      this.addPopup(npc.x, npc.y - 10, "+12 NABOI", COL.brass);
    } else {
      this.battery = Math.min(100, this.battery + 55);
      this.sfx.pickup();
      this.addPopup(npc.x, npc.y - 10, "+55% BATERII", COL.fluor);
    }
    this.emitHud(true);
  }

  private interact() {
    if (!this.floor || this.paused || this.dead || this.grabbedBy !== null || this.interactLock > 0 || this.transition) return;
    if (this.activeDialog) {
      this.advanceDialog();
      return;
    }
    if (this.director?.choice) return;
    if (this.director?.hidden) {
      this.toggleHide();
      return;
    }
    // Prefer the nearest meaningful target. A wardrobe close to a radio must not disable the radio.
    const hideSpot = this.director?.nearHideSpot();
    if (hideSpot) {
      const hideDistance = Math.hypot((hideSpot.x + hideSpot.w / 2) * TILE - this.px, (hideSpot.y + hideSpot.h / 2) * TILE - this.py);
      let deviceDistance = Infinity;
      for (const p of this.data().props) {
        if (p.kind !== "radio" && p.kind !== "tv") continue;
        if (this.closeEnough({ x: p.x, y: p.y }, 25)) {
          deviceDistance = Math.min(deviceDistance, Math.hypot((p.x + 0.5) * TILE - this.px, (p.y + 0.5) * TILE - this.py));
        }
      }
      if (hideDistance <= deviceDistance + 1) {
        this.toggleHide();
        this.emitHud(true);
        return;
      }
    }
    if (this.interactVertical()) {
      this.emitHud(true);
      return;
    }
    if (this.interactTactical()) {
      this.emitHud(true);
      return;
    }
    if (this.environment?.use()) {
      this.emitHud(true);
      return;
    }
    if (this.director?.interact()) {
      this.emitHud(true);
      return;
    }
    if (this.hideOrInteract()) {
      this.emitHud(true);
      return;
    }
    type Cand = { d: number; run: () => void };
    const cands: Cand[] = [];
    for (const s of this.floor.survivors) {
      if (s.state !== "hide") continue;
      const dist = Math.hypot(this.px - s.x, this.py - s.y);
      if (dist < 28) cands.push({ d: dist - 4, run: () => this.startSurvivorDialog(s) });
    }
    for (const door of this.data().doors) {
      const dist = Math.hypot(this.px - (door.x + 0.5) * TILE, this.py - (door.y + 0.5) * TILE);
      if (dist > 22 || door.broken || door.sealed || door.route) continue;
      cands.push({
        d: dist,
        run: () => {
          const dx = (door.x + 0.5) * TILE;
          const dy = door.y * TILE - 2;
          if (door.locked) {
            if (!this.hasKey) {
              this.say("Potrzebny klucz do klatki.");
              this.addPopup(dx, dy, "ZAMKNIĘTE NA KLUCZ", COL.capLight);
              this.sfx.dry();
              return;
            }
            this.hasKey = false;
            if (this.floor) this.floor.hasKey = false;
            for (const d of this.data().doors) {
              if (!d.locked) continue;
              d.locked = false;
              d.open = true;
              this.data().tiles[this.idx(d.x, d.y)] = 3;
            }
            this.say("Zamek puszcza. Klatka otwarta.");
            this.addPopup(dx, dy, "OTWARTO KLUCZEM!", COL.fluor);
            this.sfx.key();
            return;
          }
          if (door.barricaded) {
            door.hp -= 3;
            this.sfx.bash();
            this.shake = Math.max(this.shake, 1.5);
            this.burst(dx, dy + 8, COL.woodLight, 7, 45);
            this.alert(this.px, this.py, 5 * TILE);
            if (door.hp <= 0) {
              door.barricaded = false;
              door.broken = true;
              door.open = true;
              this.data().tiles[this.idx(door.x, door.y)] = 3;
              this.addPopup(dx, dy, "BARYKADA ZERWANA!", COL.fluor);
            } else {
              this.addPopup(dx, dy, "ODRYWASZ DESKI...", "#cbb89a");
            }
            return;
          }
          if (door.open) {
            const occupied =
              (Math.floor(this.px / TILE) === door.x && Math.floor(this.py / TILE) === door.y) ||
              this.floor?.zombies.some(
                (z) => z.state !== "dead" && Math.floor(z.x / TILE) === door.x && Math.floor(z.y / TILE) === door.y,
              );
            if (occupied) {
              this.say("Nie domkniesz — coś stoi w przejściu.");
              return;
            }
          }
          door.open = !door.open;
          this.data().tiles[this.idx(door.x, door.y)] = door.open ? 3 : 2;
          this.sfx.door(door.open);
          if (!door.open) this.alert(this.px, this.py, 5 * TILE);
        },
      });
    }
    for (const p of this.data().props) {
      const dist = this.reachProp(p);
      if (dist > 25) continue;
      if (p.kind === "flare") continue;
      if (p.opened || !p.loot) continue;
      cands.push({
        d: dist,
        run: () => this.openProp(p),
      });
    }
    const up = this.data().stairsUp;
    if (up) {
      const dist = Math.hypot(this.px - (up.x + 0.5) * TILE, this.py - (up.y + 0.5) * TILE);
      if (dist < 18) cands.push({ d: dist, run: () => this.requestFloor(1) });
    }
    const down = this.data().stairsDown;
    if (down && this.floorIndex > 0) {
      const dist = Math.hypot(this.px - (down.x + 0.5) * TILE, this.py - (down.y + 0.5) * TILE);
      if (dist < 18) cands.push({ d: dist + 0.5, run: () => this.requestFloor(-1) });
    }
    cands.sort((a, b) => a.d - b.d);
    if (cands[0]) cands[0].run();
  }

  private openProp(p: Prop) {
    if (p.opened || !p.loot) return;
    const cx = (p.x + p.w / 2) * TILE;
    const cy = p.y * TILE - 2;
    if ((p.loot === "med" && this.hp >= this.maxHp) || (p.loot === "battery" && this.battery >= 100)) {
      this.addPopup(cx, cy, p.loot === "med" ? "PEŁNE ZDROWIE" : "BATERIA PEŁNA", COL.concreteLight);
      return;
    }
    p.opened = true;
    if (p.loot === "med") {
      const gained = Math.ceil(Math.min(44, this.maxHp - this.hp));
      this.hp = Math.min(this.maxHp, this.hp + 44);
      this.addPopup(cx, cy, `APTECZKA: +${gained} ŻYCIA`, "#9fbe85");
      this.sfx.med();
      this.burst(cx, cy + 8, COL.moldLight, 7, 36, true);
    } else if (p.loot === "ammo") {
      this.pack.stock.rounds += 10;
      this.say("+ naboje");
      this.addPopup(cx, cy, "+10 NABOI", COL.brass);
      this.sfx.pickup();
      this.burst(cx, cy + 8, COL.brass, 6, 36, true);
    } else if (p.loot === "battery") {
      const gained = Math.ceil(Math.min(50, 100 - this.battery));
      this.battery = Math.min(100, this.battery + 50);
      this.say("+ bateria do latarki");
      this.addPopup(cx, cy, `+${gained}% BATERII`, COL.fluor);
      this.sfx.pickup();
      this.burst(cx, cy + 8, COL.fluor, 7, 38, true);
    } else if (p.loot === "shells" || p.loot === "bolts") {
      this.pack.stock[p.loot] += 4;
      this.addPopup(cx, cy, p.loot === "bolts" ? "+4 BEŁTY" : "+4 ŁADUNKI ŚRUTU", COL.brass);
      this.sfx.pickup();
    } else if (isWeapon(p.loot)) {
      const spec = WEAPONS[p.loot];
      if (discover(this.pack, p.loot)) {
        this.say(`${spec.name} w plecaku. Otwórz ekwipunek [I] i przypisz slot.`);
        this.addPopup(cx, cy, `+ ${spec.name.toUpperCase()}`, COL.fluor);
        this.sfx.key();
        this.burst(cx, cy + 8, COL.fluor, 10, 48, true);
      } else {
        this.pack.stock[spec.ammo ?? "rounds"] += 4;
        this.say(`Masz ju\u017c t\u0119 bro\u0144. Ze skrytki zabierasz amunicj\u0119.`);
        this.addPopup(cx, cy, "+4 AMUNICJI", COL.brass);
        this.sfx.pickup();
      }
    } else if (p.loot === "fuse") {
      this.questState().fuseTaken = true;
      this.sfx.key(); this.burst(cx, cy + 8, COL.brass, 8, 42, true);
      this.addJournal("Zapasowy bezpiecznik windy. Na obudowie wybite: B-4.");
      this.updateVerticalQuest();
    } else if (p.loot === "key") {
      this.hasKey = true;
      if (this.floor) this.floor.hasKey = true;
      this.say("Klucz do klatki schodowej.");
      this.addPopup(cx, cy, "KLUCZ DO KLATKI!", COL.fluor);
      this.sfx.key();
      this.burst(cx, cy + 8, COL.fluor, 12, 50, true);
    } else if (p.loot === "note") {
      this.sfx.pickup();
      this.addPopup(cx, cy, "NOTATKA", "#e4dcc8");
      this.say(p.note ?? "Pusta kartka.");
    } else {
      this.sfx.pickup();
      this.addPopup(cx, cy, "PUSTO", "#8c8174");
      this.say("Pusto.");
    }
  }

  private reachProp(p: Prop) {
    let nearest = Infinity;
    const sx = Math.floor(this.px / TILE), sy = Math.floor(this.py / TILE);
    if (this.environment?.roomHidden(this.data().roomOf[this.idx(p.x, p.y)])) return nearest;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      const dx = (x + 0.5) * TILE - this.px, dy = (y + 0.5) * TILE - this.py;
      const dist = Math.hypot(dx, dy);
      if (dist <= 25 && this.rayClear(sx, sy, x, y)) nearest = Math.min(nearest, dist);
    }
    return nearest;
  }

  private requestFloor(dir: number, route: "stairs" | "service" | "stairsB" = "stairs") {
    const next = this.floorIndex + dir;
    if (next < 0 || next >= FLOOR_COUNT || this.transition || this.building.passage || this.building.elevatorRide) return;
    if (route === "stairs" && dir > 0 && this.data().doors.some((d) => d.locked)) {
      this.say("Schody za zamkniętymi drzwiami.");
      return;
    }
    if (route === "service" && !this.data().vertical?.service) return;
    if (route === "stairsB" && !this.data().vertical?.stairsB) return;

    const v = this.data().vertical;
    const qs = this.questState();
    const passageRoute: PassageState["route"] =
      route === "service" ? "service" : route === "stairsB" ? "stairsB" : "stairsA";
    const feature =
      passageRoute === "stairsA" && v
        ? v.landingFeature
        : passageRoute === "stairsB"
          ? "window"
          : "empty";

    this.building.passage = {
      from: this.floorIndex,
      to: next,
      route: passageRoute,
      x: passageRoute === "service" ? 72 : 34,
      y: passageRoute === "service" ? 86 : 92,
      feature,
      stashLooted: qs.landingStashOpened,
      bypassProgress: qs.landingBypassOpen ? 1 : 0,
      bypassOpen: qs.landingBypassOpen,
      soundPlayed: false,
    };
    this.releaseInput();
    this.sfx.door(true);
    if (feature === "broken-flight" && !qs.inspected) {
      qs.inspected = true;
      qs.stage = Math.max(qs.stage, 1);
      this.addJournal("Klatka A: górny bieg schodów jest zawalony! Na półpiętrze widać zastawione drzwi zaplecza technicznego.");
    } else if (passageRoute === "service") {
      this.addJournal(`Pion techniczny: wspinasz się drabiną między ${floorShortName(this.floorIndex)} a ${floorShortName(next)}.`);
    }
  }

  private finishPassage(targetFloor: number, arrival: "up" | "down" | "service" | "stairsB") {
    this.building.passage = null;
    this.verticalWork = null;
    this.sfx.door(true);
    if (targetFloor === this.floorIndex) {
      this.say("Wracasz na poprzednie piętro.");
      this.emitHud(true);
      return;
    }
    this.enter(targetFloor, arrival);
  }

  private tileCenter(p: Cell) { return { x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE }; }

  private closeEnough(p: Cell, radius = 23) {
    const c = this.tileCenter(p);
    return Math.hypot(c.x - this.px, c.y - this.py) <= radius && this.rayClear(Math.floor(this.px / TILE), Math.floor(this.py / TILE), p.x, p.y);
  }

  private inLiftCabin(lift: { cells: Cell[] }) {
    const p = { x: Math.floor(this.px / TILE), y: Math.floor(this.py / TILE) };
    return lift.cells.some((c) => c.x === p.x && c.y === p.y);
  }

  private serviceLiftState() {
    return this.building.serviceLift ??= { floor: this.floorIndex, openFloor: null, arrival: 0, callFloor: -1 };
  }

  private startFreightCall() {
    const state = this.serviceLiftState();
    if (state.openFloor === this.floorIndex) {
      this.offerServiceRoute();
      return;
    }
    if (state.arrival > 0 && state.callFloor === this.floorIndex) return;
    state.callFloor = this.floorIndex;
    state.arrival = 1.5;
    this.sfx.liftCall();
    this.alert(this.px, this.py, 8 * TILE, true);
    this.say("Winda serwisowa nadjeżdża. Usłysz mechanizm i przygotuj wyjście z kabiny.");
  }

  private offerServiceRoute() {
    const state = this.serviceLiftState();
    const next = this.floorIndex < 9 ? this.floorIndex + 1 : this.floorIndex - 1;
    this.verticalChoice = {
      mode: "service",
      targets: [next, next, null],
      labels: [state.openFloor === this.floorIndex && this.inLiftCabin(this.data().vertical!.service!)
        ? `Jedź windą serwisową → ${floorShortName(next)}` : "Wejdź do kabiny serwisowej",
        `Drabina / właz → ${floorShortName(next)}`, "Zostań na piętrze"],
      label: "PION TECHNICZNY",
      text: state.openFloor === this.floorIndex
        ? "Kabina czeka. Wejdź do środka, by ruszyć, albo wybierz drabinę."
        : "Możesz przywołać windę serwisową lub pokonać pion drabiną.",
    };
    this.emitHud(true);
  }

  private startFreightRide() {
    const service = this.data().vertical?.service;
    const state = this.serviceLiftState();
    const next = this.floorIndex < 9 ? this.floorIndex + 1 : this.floorIndex - 1;
    if (state.openFloor !== this.floorIndex) {
      this.startFreightCall();
      return;
    }
    if (!service || !this.inLiftCabin(service)) {
      this.say("Wejdź do otwartej kabiny serwisowej przed uruchomieniem przejazdu.");
      return;
    }
    this.building.elevatorRide = {
      from: this.floorIndex, to: next, elapsed: 0, phase: "doors", variant: "routine", kind: "freight",
      cabinX: 0, cabinY: 0, doorOpen: 1, leverProgress: 0,
    };
    state.openFloor = null;
    state.callFloor = -1;
    this.syncVerticalDoors();
    this.releaseInput();
    this.sfx.door(false);
    this.addJournal(`Winda serwisowa rusza z ${floorShortName(this.floorIndex)} do ${floorShortName(next)}.`);
  }

  private offerLiftFloors() {
    const from = this.floorIndex;
    const candidates = from === 0 ? [1, 2] : from >= 9 ? [8, 7] : [from + 1, from + 2 <= 9 ? from + 2 : from - 1];
    const available = [...new Set(candidates)].filter((i) => i >= 0 && i <= 9 && i !== from && this.buildingLayout.elevatorStops.includes(i));
    const targets: (number | null)[] = available.slice(0, 2);
    const labels = available.slice(0, 2).map((i) => {
      const dur = Math.min(5, Math.max(3, Math.round(2.8 + Math.abs(i - from) * 0.6)));
      return `${i > from ? "↑" : "↓"}  ${floorShortName(i)} (~${dur} s)`;
    });
    targets.push(null);
    labels.push("Pozostań w kabinie");
    const statusText = this.building.elevatorEmergencyOnly
      ? "Tryb awaryjny: ograniczona sprawność (jeden przejazd). Wybierz piętro:"
      : "Panel windy aktywny. Wybierz docelową kondygnację:";
    this.verticalChoice = { targets, labels, label: "PANEL WINDY OSOBOWEJ", text: statusText };
    this.emitHud(true);
  }

  private startLiftCall() {
    if (!this.building.elevatorPowered || this.building.elevatorBroken) return false;
    if (this.building.elevatorOpenFloor === this.floorIndex) {
      this.say("Drzwi windy są otwarte. Wejdź do kabiny i użyj panelu.");
      this.sfx.liftCall();
      return true;
    }
    if (this.building.elevatorArrival > 0 && this.building.elevatorCallFloor === this.floorIndex) return true;
    this.building.elevatorCallFloor = this.floorIndex;
    this.building.elevatorArrival = Math.min(3.4, 1.3 + Math.abs(this.building.elevatorFloor - this.floorIndex) * 0.35);
    this.sfx.liftCall();
    this.alert(this.px, this.py, 9 * TILE, true);
    this.noise = 0.8;
    this.addJournal("Przywołano windę — dźwięk napędu może ściągnąć zombie w korytarzu.");
    return true;
  }

  private startLiftRide(target: number) {
    const lift = this.data().vertical?.elevator;
    if (!lift || this.building.elevatorBroken || !this.building.elevatorPowered || this.building.elevatorOpenFloor !== this.floorIndex || !this.inLiftCabin(lift)) {
      this.say("Wejdź do otwartej kabiny, aby uruchomić przejazd.");
      return;
    }
    if (target < 0 || target > 9 || target === this.floorIndex || !this.buildingLayout.elevatorStops.includes(target)) return;
    const isEmergencyFault = this.building.elevatorEmergencyOnly && !this.building.elevatorFaultUsed && target > this.floorIndex;
    let variant = isEmergencyFault ? "fault" : this.buildingLayout.elevatorVariants[Math.min(this.floorIndex, 9)] ?? "routine";
    // Cap dramatic / special elevator events per run so most trips remain dependable
    if (!isEmergencyFault && variant !== "routine" && this.building.elevatorSpecialCount >= 2) {
      variant = "routine";
    }
    if (!isEmergencyFault && variant !== "routine") {
      this.building.elevatorSpecialCount += 1;
    }
    if (isEmergencyFault) this.building.elevatorFaultUsed = true;

    const stopFloor =
      variant === "stop" && Math.abs(target - this.floorIndex) >= 2
        ? this.floorIndex + Math.sign(target - this.floorIndex)
        : undefined;
    if (variant === "stop" && stopFloor === undefined) variant = "rattle";

    this.building.elevatorRide = {
      from: this.floorIndex,
      to: target,
      elapsed: 0,
      phase: "doors",
      variant,
      cabinX: 0,
      cabinY: 0,
      doorOpen: 1,
      leverProgress: 0,
      ...(stopFloor !== undefined ? { stopFloor } : {}),
    };
    this.building.elevatorOpenFloor = null;
    this.building.elevatorCallFloor = -1;
    this.syncVerticalDoors();
    this.releaseInput();
    this.sfx.door(false);
    this.addJournal(`Winda zamyka drzwi: ${floorShortName(this.floorIndex)} → ${floorShortName(target)}.`);
  }

  private tickVertical(dt: number) {
    if (this.building.elevatorArrival > 0) {
      this.building.elevatorArrival = Math.max(0, this.building.elevatorArrival - dt);
      if (this.building.elevatorArrival === 0 && this.building.elevatorCallFloor >= 0) {
        const target = this.building.elevatorCallFloor;
        this.building.elevatorFloor = target;
        this.building.elevatorOpenFloor = target;
        this.building.elevatorCallFloor = -1;
        this.syncVerticalDoors(target);
        this.sfx.liftStop();
        this.shake = Math.max(this.shake, 1.0);
        this.addJournal(`Kabina przyjechała na ${floorShortName(target)}. Drzwi rozsuwają się.`);
      }
    }
    const freight = this.building.serviceLift;
    if (freight && freight.arrival > 0) {
      freight.arrival = Math.max(0, freight.arrival - dt);
      if (freight.arrival === 0 && freight.callFloor >= 0) {
        const target = freight.callFloor;
        freight.floor = target;
        freight.openFloor = target;
        freight.callFloor = -1;
        this.syncVerticalDoors(target);
        this.sfx.liftStop();
        this.say("Kabina serwisowa otwiera się na tym piętrze.");
      }
    }
  }

  private updateVerticalHold(dt: number) {
    this.verticalWork = null;
    if (this.director?.hidden || this.director?.choice || this.verticalChoice || this.activeDialog) return;
    const holding = this.keys.has("KeyE") || this.touchHold;
    const vertical = this.data().vertical;
    const quest = vertical?.quest;
    if (!quest || !vertical) return;
    const qs = this.questState();

    // Scenario E alternative: force service shaft door with crowbar/hatchet (loud!)
    if (quest.kind === "service-shaft" && !qs.serviceUnlocked && !qs.serviceForced && !qs.codeFound && vertical.service && this.closeEnough(vertical.service.panel, 24)) {
      const hasTool = this.pack.owned.includes("crowbar") || this.pack.owned.includes("hatchet");
      if (hasTool) {
        this.verticalWork = { label: "wyważ zamek pionu (głośno)", progress: qs.bypassProgress, active: holding };
        if (holding) {
          qs.bypassProgress = Math.min(1, qs.bypassProgress + dt / 2.2);
          this.stamina = Math.max(0, this.stamina - 10 * dt);
          if (Math.random() < dt * 3.5) {
            const c = this.tileCenter(vertical.service.door);
            this.sfx.hit(true);
            this.burst(c.x, c.y, "#f0b050", 4, 38, true);
            this.alert(c.x, c.y, 12 * TILE, true);
            this.noise = 0.9;
          }
          if (qs.bypassProgress >= 1) {
            qs.serviceForced = true;
            qs.stage = 3;
            qs.resolved = true;
            this.syncVerticalDoors();
            this.sfx.bash();
            this.shake = 2.4;
            this.addJournal("Sforsowano zamek pionu technicznego! Hałas odbił się echem po piętrze.");
          }
        }
      }
      return;
    }

    // Scenario F: push heavy apartment obstacle to unlock Klatka B permanently
    if (quest.kind === "apartment-bypass" && quest.bypassCell && !qs.bypassOpen && this.closeEnough(quest.bypassCell, 25)) {
      this.verticalWork = { label: "odsuń mebel do Klatki B", progress: qs.bypassProgress, active: holding };
      if (holding) {
        qs.bypassProgress = Math.min(1, qs.bypassProgress + dt / 2.4);
        this.stamina = Math.max(0, this.stamina - 9 * dt);
        if (Math.random() < dt * 3) {
          const c = this.tileCenter(quest.bypassCell);
          this.sfx.environment("scrape", 0.7);
          this.burst(c.x, c.y, "#a08a69", 3, 24);
          this.alert(c.x, c.y, 7 * TILE, true);
        }
        if (qs.bypassProgress >= 1) {
          qs.bypassOpen = true;
          qs.stage = 3;
          qs.resolved = true;
          this.syncVerticalDoors();
          this.sfx.door(true);
          this.addJournal("Przejście przez wschodnie mieszkanie odsłonięte — Klatka B jest na stałe dostępna.");
        }
      }
    }
  }

  private updateLiftRide(dt: number) {
    const ride = this.building.elevatorRide;
    if (!ride) return;
    // Allow player to move inside cabin, rotate aim, and use flashlight (except during brief jolt)
    const canMove = ride.phase !== "jolt";
    const mx = (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) - (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const my = (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) - (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0);
    const moveX = Math.abs(this.touchMove.x) > 0.2 ? this.touchMove.x : mx;
    const moveY = Math.abs(this.touchMove.y) > 0.2 ? this.touchMove.y : my;
    this.moving = canMove && (moveX !== 0 || moveY !== 0);
    if (this.moving) {
      const n = Math.hypot(moveX, moveY) || 1;
      ride.cabinX = Math.max(-24, Math.min(24, ride.cabinX + (moveX / n) * dt * 34));
      ride.cabinY = Math.max(-18, Math.min(20, ride.cabinY + (moveY / n) * dt * 34));
      this.animT += dt * 7;
    }
    this.aim = Math.atan2(this.mouseSY - (this.viewH / 2 + 4 + ride.cabinY), this.mouseSX - (this.viewW / 2 + ride.cabinX));
    this.dir = dirFrom(this.aim);
    if (this.flashOn) {
      this.battery = Math.max(0, this.battery - 0.12 * dt);
      if (this.battery <= 0) this.flashOn = false;
    }

    if (ride.phase === "doors") {
      ride.elapsed += dt;
      ride.doorOpen = Math.max(0, 1 - ride.elapsed / 0.7);
      if (ride.elapsed >= 0.7) {
        ride.phase = "accel";
        ride.elapsed = 0;
        this.shake = Math.max(this.shake, 1.5);
        this.sfx.liftMove();
      }
    } else if (ride.phase === "accel") {
      ride.elapsed += dt;
      if (ride.elapsed >= 0.9) {
        ride.phase = "moving";
        ride.elapsed = 0;
      }
    } else if (ride.phase === "moving") {
      ride.elapsed += dt;
      const floors = Math.abs(ride.to - ride.from);
      const duration = ride.variant === "fault" ? 3.2 : Math.min(4.8, 2.6 + floors * 0.55);
      if (ride.variant === "rattle" && Math.floor(ride.elapsed * 2.2) !== Math.floor((ride.elapsed - dt) * 2.2)) {
        this.sfx.liftRattle();
        this.shake = Math.max(this.shake, 1.6);
      }
      if (ride.variant === "threat" && !ride.threatWarned && ride.elapsed >= duration - 0.8) {
        ride.threatWarned = true;
        this.sfx.groan(this.time, "brute");
        this.say("Za drzwiami na górze słychać kroki i pomruki...");
      }
      if (ride.variant === "stop" && ride.stopFloor !== undefined && ride.elapsed >= duration * 0.5) {
        ride.phase = "stop";
        ride.elapsed = 0;
        ride.doorOpen = 0.65;
        this.building.elevatorFloor = ride.stopFloor;
        this.sfx.liftStop();
        this.verticalChoice = {
          targets: [null, ride.to],
          labels: [`Wysiądź (${floorShortName(ride.stopFloor)})`, `Jedź dalej (${floorShortName(ride.to)})`],
          label: "NIEPLANOWANY POSTÓJ",
          text: `Kabina zatrzymała się na pośredniej kondygnacji (${floorShortName(ride.stopFloor)}).`,
        };
        this.addJournal(`Nieplanowany postój windy na ${floorShortName(ride.stopFloor)}.`);
      } else if (ride.elapsed >= duration) {
        if (ride.kind === "freight") this.serviceLiftState().floor = ride.to;
        else this.building.elevatorFloor = ride.to;
        this.sfx.liftStop();
        if (ride.variant === "fault") {
          ride.phase = "jolt";
          ride.elapsed = 0;
          this.shake = 6.2;
          this.hurt = 0.42;
          this.environmentHit = true;
          this.sfx.liftRattle();
          this.sfx.powerDown();
          this.addJournal(`Wskaźnik potwierdził ${floorShortName(ride.to)}, po czym kabina gwałtownie stanęła. Zgasło główne światło.`);
        } else if (ride.variant === "mid-shaft") {
          ride.phase = "ledge";
          ride.elapsed = 0;
          this.shake = 3.2;
          this.sfx.liftRattle();
          this.addJournal("Kabina zatrzymała się przy podeście technicznym. Uchyla się właz serwisowy.");
        } else {
          ride.phase = "arrive";
          ride.elapsed = 0;
        }
      }
    } else if (ride.phase === "jolt") {
      ride.elapsed += dt;
      if (ride.elapsed > 1.1 && ride.elapsed - dt <= 1.1) {
        this.sfx.environment("switch", 0.5);
        this.say("Włącza się awaryjne oświetlenie. Panel drzwi nie działa.");
      }
      if (ride.elapsed >= 2.1) {
        ride.phase = "stranded";
        ride.elapsed = 0;
        this.say("Użyj czerwonej dźwigni awaryjnej po prawej [E], aby uchylić drzwi.");
      }
    } else if (ride.phase === "stranded") {
      ride.elapsed += dt;
    } else if (ride.phase === "escape") {
      ride.elapsed += dt;
      ride.doorOpen = Math.min(0.7, ride.elapsed / 1.1);
      if (ride.elapsed >= 1.2) {
        const target = ride.to;
        this.building.elevatorBroken = true;
        this.building.elevatorEmergencyOnly = false;
        this.building.elevatorFloor = target;
        this.building.elevatorOpenFloor = target;
        this.building.elevatorRide = null;
        this.addJournal(`Drzwi awaryjne ustąpiły na ${floorShortName(target)}. Winda wymaga resetu przekaźnika.`);
        this.enter(target, "lift");
      }
    } else if (ride.phase === "ledge") {
      ride.elapsed += dt;
      if (ride.elapsed >= 1.1) {
        const from = ride.from;
        const target = ride.to;
        this.building.elevatorFloor = target;
        this.building.elevatorOpenFloor = target;
        this.building.elevatorRide = null;
        this.building.passage = {
          from,
          to: target,
          route: "ledge",
          x: 72,
          y: 80,
          feature: "empty",
          stashLooted: true,
          bypassProgress: 1,
          bypassOpen: true,
          soundPlayed: false,
        };
        this.say("Wychodzisz na podest techniczny. Wspnij się przez właz na właściwe piętro.");
      }
    } else if (ride.phase === "arrive") {
      ride.elapsed += dt;
      ride.doorOpen = Math.min(1, ride.elapsed / 0.65);
      if (ride.elapsed >= 0.75) {
        const target = ride.to;
        if (ride.kind === "freight") {
          this.serviceLiftState().openFloor = target;
          this.building.elevatorRide = null;
          this.addJournal(`Winda serwisowa zatrzymała się na podeście technicznym ${floorShortName(target)}.`);
          this.enter(target, "service");
        } else {
          this.building.elevatorOpenFloor = target;
          this.building.elevatorRide = null;
          this.enter(target, "lift");
        }
      }
    }
  }

  private updatePassage(dt: number) {
    const p = this.building.passage;
    if (!p) return;
    this.verticalWork = null;

    // Distant ambient cue from the floor above once player reaches landing
    if (!p.soundPlayed && p.y < 36) {
      p.soundPlayed = true;
      if (this.data().vertical?.landingSoundHint) {
        this.sfx.groan(this.time, "shambler");
      }
    }

    const holding = this.keys.has("KeyE") || this.touchHold;
    if (p.feature === "broken-flight" && !p.bypassOpen && Math.hypot(p.x - 120, p.y - 22) < 28) {
      this.verticalWork = { label: "odsuń przeszkodę do zaplecza", progress: p.bypassProgress, active: holding };
      if (holding) {
        p.bypassProgress = Math.min(1, p.bypassProgress + dt / 2.2);
        this.stamina = Math.max(0, this.stamina - 9 * dt);
        if (Math.random() < dt * 3) this.sfx.environment("scrape", 0.6);
        if (p.bypassProgress >= 1) {
          p.bypassOpen = true;
          const qs = this.questState(p.from);
          qs.landingBypassOpen = true;
          qs.stage = 3;
          qs.resolved = true;
          this.sfx.door(true);
          this.addJournal("Odsłonięto przejście przez zaplecze techniczne na półpiętrze! Możesz przejść wyżej.");
        }
        return;
      }
    }

    const mx = (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) - (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const my = (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) - (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0);
    const moveX = Math.abs(this.touchMove.x) > 0.2 ? this.touchMove.x : mx;
    const moveY = Math.abs(this.touchMove.y) > 0.2 ? this.touchMove.y : my;
    this.moving = moveX !== 0 || moveY !== 0;

    if (this.moving) {
      const len = Math.hypot(moveX, moveY) || 1;
      const spd = p.route === "service" || p.route === "ledge" ? 56 : 66;
      const nx = p.x + (moveX / len) * spd * dt;
      const ny = p.y + (moveY / len) * spd * dt;
      const canStand = (x: number, y: number) => {
        if (p.route === "service" || p.route === "ledge") {
          return x >= 34 && x <= 110 && y >= 14 && y <= 94;
        }
        if (x < 14 || x > PASSAGE_W - 14 || y < 14 || y > PASSAGE_H - 12) return false;
        // Central stairwell divider wall (x 60..84, y 36..108)
        if (x > 58 && x < 86 && y > 35) return false;
        // Landing obstacle crate (x 62..82, y 15..29)
        if (p.feature === "obstacle" && x > 60 && x < 84 && y > 13 && y < 30) return false;
        // Collapsed rubble blocking upper right flight
        if (p.feature === "broken-flight" && x > 82 && y > 38) return false;
        return true;
      };
      if (canStand(nx, p.y)) p.x = nx;
      if (canStand(p.x, ny)) p.y = ny;
      this.animT += dt * 9;
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 0.34;
        if (p.route === "service" || p.route === "ledge") this.sfx.ladder();
        else this.sfx.step(this.time, "concrete");
      }
    }

    const ox = Math.round((this.viewW - PASSAGE_W) / 2);
    const oy = Math.round((this.viewH - PASSAGE_H) / 2);
    this.aim = Math.atan2(this.mouseSY - (oy + p.y), this.mouseSX - (ox + p.x));
    this.dir = dirFrom(this.aim);
    if (this.flashOn) {
      this.battery = Math.max(0, this.battery - 0.12 * dt);
      if (this.battery <= 0) this.flashOn = false;
    }

    // Walking all the way into the exit doorway automatically transitions cleanly!
    if (p.route === "service" || p.route === "ledge") {
      if (p.y <= 16) this.finishPassage(p.to, "service");
      else if (p.y >= 93 && moveY > 0.2) this.finishPassage(p.from, "service");
    } else {
      if (p.feature === "broken-flight" && p.bypassOpen && p.x >= 122 && p.y <= 18) {
        this.finishPassage(p.to, "stairsB");
      } else if (p.x > 88 && p.y >= 99 && p.feature !== "broken-flight") {
        this.finishPassage(p.to, p.route === "stairsB" ? "stairsB" : p.to > p.from ? "up" : "down");
      } else if (p.x < 56 && p.y >= 99 && moveY > 0.2) {
        this.finishPassage(p.from, p.route === "stairsB" ? "stairsB" : p.to > p.from ? "down" : "up");
      }
    }
  }

  private currentZone() {
    if (this.building.elevatorRide) {
      return `WINDA OSOBOWA · POZIOM ${floorTag(this.building.elevatorFloor)}`;
    }
    const p = this.building.passage;
    if (p) {
      const name = p.route === "stairsB" ? "KLATKA B" : p.route === "service" ? "PION TECHNICZNY" : p.route === "ledge" ? "PODEST TECHNICZNY" : "KLATKA A";
      return `${name} · MIĘDZY ${floorShortName(p.from)} I ${floorShortName(p.to)}`;
    }
    if (!this.floor) return "";
    const tx = Math.floor(this.px / TILE);
    const ty = Math.floor(this.py / TILE);
    if (!this.inb(tx, ty)) return "";
    const rid = this.data().roomOf[this.idx(tx, ty)];
    if (rid < 0) return "";
    return this.data().roomZones[rid] ?? "";
  }

  private objective() {
    const ride = this.building.elevatorRide;
    if (ride) {
      if (ride.phase === "stranded") return "Otwórz drzwi awaryjnie";
      if (ride.phase === "stop") return "Postój pośredni windy";
      return `Winda → ${floorShortName(ride.to)}`;
    }
    const p = this.building.passage;
    if (p) {
      if (p.feature === "broken-flight" && !p.bypassOpen) return "Otwórz przejście przez zaplecze";
      return `Dotrzyj na ${floorShortName(p.to)}`;
    }
    const d = this.data();
    if (d.theme === "roof") {
      if (this.heliPhase === "landed") return "Wskakuj do śmigłowca!";
      if (this.heliPhase === "in") return "Śmigłowiec nadlatuje...";
      if (!this.bossKilled) return "Zabij Wielkiego";
      return "Odpal flarę — przytrzymaj E";
    }
    const q = d.vertical?.quest;
    const qs = this.questState();
    if (q && !qs.resolved) {
      if (q.kind === "repair-lift") {
        if (qs.stage === 0) return "Znajdź drogę na wyższe piętro";
        if (qs.stage === 1) return "Odłącz zwarcie i zdobądź bezpiecznik";
        if (qs.stage === 2) return "Odnajdź bezpiecznik B-4 w warsztacie";
        if (qs.stage === 3) return "Przywróć zasilanie windy";
        if (qs.stage === 4) return "Przywołaj windę";
      }
      if (q.kind === "broken-stairs" && qs.inspected) return "Omiń zawaloną klatkę";
      if (q.kind === "flooded-route" && qs.inspected) return "Usuń zagrożenie w pionie technicznym";
      if (q.kind === "lure-horde" && qs.inspected) return qs.lureUsed ? "Przejdź na klatkę schodową" : "Odciągnij zombie od klatki";
      if (q.kind === "service-shaft" && qs.inspected) return qs.codeFound ? "Otwórz pion techniczny kodem" : "Zdobądź kod pionu lub sforsuj drzwi";
      if (q.kind === "apartment-bypass" && qs.inspected) return "Przejdź przez mieszkanie do Klatki B";
    }
    if (d.locked && d.doors.some((door) => door.locked) && !this.hasKey) return "Znajdź klucz do klatki";
    if (d.doors.some((door) => door.locked)) return "Otwórz drzwi na schody";
    return "Wejdź po schodach";
  }

  private prompt(environment = this.environment?.hint()) {
    if (!this.floor) return "";
    const ride = this.building.elevatorRide;
    if (ride) {
      if (ride.phase === "stranded") return "E  pociągnij dźwignię awaryjną";
      if (ride.phase === "stop") return "E  wybierz (wysiądź / jedź dalej)";
      return "";
    }
    const p = this.building.passage;
    if (p) {
      if (this.verticalWork) return `E  przytrzymaj: ${this.verticalWork.label}`;
      if ((p.feature === "stash" || p.feature === "traces") && !p.stashLooted && Math.hypot(p.x - 18, p.y - 16) < 26) {
        return "E  przeszukaj schowek konserwatora";
      }
      if (p.feature === "broken-flight" && p.bypassOpen && Math.hypot(p.x - 126, p.y - 18) < 26) {
        return `E  przejdź przez zaplecze na ${floorShortName(p.to)}`;
      }
      if (p.route === "service" || p.route === "ledge") {
        if (p.y < 32) return `E  otwórz właz (${floorShortName(p.to)})`;
        if (p.y > 84) return `E  wróć na ${floorShortName(p.from)}`;
      } else {
        if (p.x > 84 && p.y > 84 && p.feature !== "broken-flight") return `E  wyjdź na ${floorShortName(p.to)}`;
        if (p.x < 60 && p.y > 84) return `E  wróć na ${floorShortName(p.from)}`;
      }
      return "";
    }
    if (this.verticalWork) return `E  przytrzymaj: ${this.verticalWork.label}`;
    let best = 30;
    let label = "";
    const consider = (d: number, text: string) => {
      if (d < best) {
        best = d;
        label = text;
      }
    };
    if (this.grabbedBy !== null) return `ODPCHNIJ ZOMBIE - E: ${this.grabStruggles}/5`;
    if (this.activeDialog) return "E  dalej";
    if (environment) return `E  ${environment.hold ? "przytrzymaj: " : ""}${environment.label}`;
    const eventPrompt = this.director?.prompt();
    if (eventPrompt) return eventPrompt;
    const v = this.data().vertical;
    const q = v?.quest;
    const qs = this.questState();
    if (v?.elevator) {
      if (this.inLiftCabin(v.elevator) && this.closeEnough(v.elevator.panel, 25)) {
        consider(1, this.building.elevatorEmergencyOnly ? "E  panel windy (tryb awaryjny)" : "E  wybierz piętro w windzie");
      } else if (this.closeEnough(v.elevator.call, 25)) {
        if (q?.kind === "repair-lift" && qs.fuseTaken && !this.building.elevatorPowered) consider(2, "E  zamontuj bezpiecznik B-4");
        else if (this.building.elevatorBroken && this.floorIndex >= 2) consider(2, "E  zresetuj przekaźnik windy");
        else if (!this.building.elevatorPowered) consider(2, "E  sprawdź panel windy (brak zasilania)");
        else if (this.building.elevatorOpenFloor === this.floorIndex) consider(2, "E  kabina gotowa (wejdź do środka)");
        else consider(2, "E  przywołaj windę");
      }
    }
    if (v?.service && (this.closeEnough(v.service.panel, 24) || this.closeEnough(v.service.door, 24))) {
      if (q?.kind === "service-shaft" && !qs.serviceUnlocked && !qs.serviceForced) {
        consider(3, qs.codeFound ? `E  wpisz kod ${q.code}` : "E  sprawdź zamek pionu");
      } else if (q?.kind === "flooded-route" && qs.stage < 3) {
        consider(3, "E  sprawdź zalany pion techniczny");
      } else if (this.building.serviceLift?.openFloor === this.floorIndex && this.inLiftCabin(v.service)) {
        consider(3, "E  winda serwisowa / drabina");
      } else {
        consider(3, "E  pion techniczny: winda serwisowa lub drabina");
      }
    }
    if (v?.stairsB && (this.closeEnough(v.stairsB.stairs, 24) || this.closeEnough(v.stairsB.outside, 24))) {
      consider(3, q?.kind === "apartment-bypass" && !qs.bypassOpen ? "E  zastawiona Klatka B" : "E  wejdź na Klatkę B");
    }
    if (q?.kind === "repair-lift" && q.fuseCell && !qs.fuseTaken && this.closeEnough(q.fuseCell, 25)) {
      consider(2, "E  zabierz bezpiecznik B-4");
    }
    if (q?.kind === "lure-horde" && q.beacon && !qs.lureUsed && this.closeEnough(q.beacon, 25)) {
      consider(2, "E  uruchom sygnał rozgłoszeniowy");
    }
    if (q?.kind === "service-shaft" && q.clueCell && !qs.codeFound && this.closeEnough(q.clueCell, 25)) {
      consider(2, "E  przeczytaj instrukcję procedury");
    }
    if (q?.kind === "apartment-bypass" && q.clueCell && !qs.inspected && this.closeEnough(q.clueCell, 25)) {
      consider(2, "E  sprawdź plan ewakuacyjny");
    }
    for (const s of this.floor.survivors) {
      if (s.state !== "hide") continue;
      const dist = Math.hypot(this.px - s.x, this.py - s.y);
      if (dist < 28) consider(dist - 4, "E  porozmawiaj");
    }
    for (const door of this.data().doors) {
      if (door.broken || door.sealed || door.route) continue;
      const dist = Math.hypot(this.px - (door.x + 0.5) * TILE, this.py - (door.y + 0.5) * TILE);
      if (dist > 22) continue;
      if (door.locked && !this.hasKey) consider(dist, "E  zaryglowane");
      else if (door.locked) consider(dist, "E  użyj klucza");
      else if (door.barricaded) consider(dist, "E / ŁOM  oderwij deski");
      else consider(dist, door.open ? "E  zamknij" : "E  otwórz");
    }
    for (const p of this.data().props) {
      const dist = Math.hypot(this.px - (p.x + p.w / 2) * TILE, this.py - (p.y + p.h / 2) * TILE);
      if (p.kind === "flare" && dist < 26) consider(dist, "E  przytrzymaj — flara");
      else if (!p.opened && p.loot) {
        const reach = this.reachProp(p);
        if (reach <= 25) consider(reach, `E  ${p.label ?? "Przeszukaj"}`);
      }
    }
    const up = this.data().stairsUp;
    if (up) {
      const dist = Math.hypot(this.px - (up.x + 0.5) * TILE, this.py - (up.y + 0.5) * TILE);
      if (dist < 18) consider(dist, "E  wejdź wyżej");
    }
    const down = this.data().stairsDown;
    if (down && this.floorIndex > 0) {
      const dist = Math.hypot(this.px - (down.x + 0.5) * TILE, this.py - (down.y + 0.5) * TILE);
      if (dist < 18) consider(dist, "E  zejdź");
    }
    if (!label) {
      const deviceHint = this.tacticalHint();
      if (deviceHint) return deviceHint;
    }
    return label;
  }

  private goalTile() {
    const d = this.data();
    if (d.theme === "roof") {
      const boss = this.floor?.zombies.find((z) => z.kind === "boss" && z.state !== "dead");
      if (boss && !this.bossKilled) return { x: Math.floor(boss.x / TILE), y: Math.floor(boss.y / TILE) };
      if (d.flare) return d.flare;
    }
    if (d.locked && d.doors.some((door) => door.locked) && !this.hasKey && d.keyPropId != null) {
      const key = d.props.find((p) => p.id === d.keyPropId);
      if (key) return { x: key.x, y: key.y };
    }
    return d.stairsUp;
  }

  private emitHud(force: boolean) {
    this.hudAcc += 0.016;
    if (!force && this.hudAcc < 0.08) return;
    this.hudAcc = 0;
    if (!this.floor) return;
    const aliveZ = this.floor.zombies.filter((z) => z.state !== "dead" && !z.reinforcement).length;
    const extraZ = this.floor.zombies.filter((z) => z.state !== "dead" && z.reinforcement).length;
    const dir = this.director;
    const escortCiv = dir && dir.escortId >= 0 ? dir.civ(dir.escortId) : null;
    const goalTile = this.data().stairsUp;
    const escortDist =
      escortCiv && goalTile
        ? Math.round(Math.hypot(escortCiv.x - (goalTile.x + 0.5) * TILE, escortCiv.y - (goalTile.y + 0.5) * TILE) / TILE)
        : -1;
    const boss = this.floor.zombies.find((z) => z.kind === "boss");
    const rawEnv = this.building.elevatorRide || this.building.passage ? null : this.environment?.hint() ?? null;
    const environment = this.verticalWork
      ? { label: this.verticalWork.label, hold: true, progress: this.verticalWork.progress, active: this.verticalWork.active }
      : rawEnv;
    const activeChoice = this.verticalChoice
      ? {
          speaker: this.verticalChoice.label,
          text: this.verticalChoice.text,
          options: this.verticalChoice.labels.map((label) => ({ label, enabled: true })),
        }
      : dir?.choice
        ? {
            speaker: dir.choice.speaker,
            text: dir.choice.text,
            options: dir.choice.options.map((o) => ({ label: o.label, enabled: o.enabled })),
          }
        : null;
    const hud: HudState = {
      hp: Math.ceil(this.hp),
      maxHp: this.maxHp,
      stamina: this.stamina / 100,
      ammo: this.mag(),
      reserve: this.reserve(),
      weapon: this.weapon,
      inventory: copyInventory(this.pack),
      hasKey: this.hasKey,
      needKey: this.data().doors.some((d) => d.locked),
      battery: this.battery / 100,
      flashOn: this.flashOn,
      flashAuto: this.autoFlash,
      floorName: this.data().name,
      floorSub: this.data().sub,
      floorIndex: this.floorIndex,
      floorCount: FLOOR_COUNT,
      kills: this.kills,
      time: this.time,
      objective: this.objective(),
      quest: this.questInfo(),
      journal: [...this.building.journal],
      message: this.messageT > 0 ? this.message : "",
      prompt: this.prompt(environment ?? undefined),
      environment,
      hurt: this.hurt,
      lowHp: this.hp < 32,
      reloading: this.reloadT > 0 ? 1 - this.reloadT / this.reloadMax : 0,
      flare: this.flareCharge / 2.7,
      banner: this.bannerT > 0 ? this.data().name : "",
      bannerSub: this.bannerT > 0 ? this.data().sub : "",
      seed: this.seed,
      noise: this.tactical?.state.playerNoise ? this.tactical.state.playerNoise / 100 : 0,
      noiseLevel: this.tactical?.state.playerNoise ?? 0,
      noiseLabel: noiseLabel(this.tactical?.state.playerNoise ?? 0),
      arousal: this.tactical?.state.arousal ?? 0,
      grapple: this.grabbedBy !== null ? { count: this.grabStruggles, required: 5 } : null,
      zombiesLeft: aliveZ,
      bossHp: boss ? Math.max(0, Math.ceil(boss.hp)) : 0,
      bossMax: boss ? boss.maxHp : 0,
      zoneName: this.currentZone(),
      extraZombies: extraZ,
      hidden: !!dir?.hidden,
      blackout: dir ? Math.max(0, dir.blackoutT) : 0,
      alarm: !!dir?.alarm,
      escort: escortDist,
      event: dir?.banner ?? null,
      choice: activeChoice,
      dialog: this.activeDialog
        ? {
            speaker: this.activeDialog.npc.name,
            line: (this.activeDialog.npc.lines[this.activeDialog.lineIdx] ?? "").slice(
              0,
              Math.floor(this.activeDialog.charIdx),
            ),
            index: this.activeDialog.lineIdx + 1,
            total: this.activeDialog.npc.lines.length,
            gift:
              this.activeDialog.npc.gift === "med"
                ? "APTECZKA"
                : this.activeDialog.npc.gift === "ammo"
                  ? "NABOJE"
                  : "BATERIA",
          }
        : null,
    };
    this.hooks.onHud(hud);
  }

  /* ================= RENDER PIPELINE ================= */

  private draw() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    const theme = this.floor?.data.theme;
    ctx.fillStyle = theme === "roof" ? "#1a2844" : COL.void;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    if (!this.floor) return;
    if (this.building.elevatorRide) {
      drawLiftRideScene(
        ctx,
        this.viewW,
        this.viewH,
        this.building.elevatorRide,
        this.building,
        this.rig,
        {
          dir: this.dir,
          aim: this.aim,
          phase: this.animT,
          moving: this.moving,
          sprint: false,
          t: this.time,
          weapon: this.weapon,
          recoil: 0,
          reload: 0,
          melee: -1,
          flash: 0,
          hurt: this.hurt,
          pushing: false,
        },
        this.flashOn,
        this.battery,
        this.time,
        this.shake,
      );
      return;
    }
    if (this.building.passage) {
      drawPassageScene(
        ctx,
        this.viewW,
        this.viewH,
        this.building.passage,
        this.rig,
        {
          dir: this.dir,
          aim: this.aim,
          phase: this.animT,
          moving: this.moving,
          sprint: false,
          t: this.time,
          weapon: this.weapon,
          recoil: 0,
          reload: 0,
          melee: -1,
          flash: 0,
          hurt: this.hurt,
          pushing: !!this.verticalWork?.active,
        },
        this.flashOn,
        this.battery,
        this.time,
      );
      drawPassageMinimap(ctx, this.viewW, this.viewH, this.building.passage);
      return;
    }
    const camX = Math.round(this.camX + (Math.random() - 0.5) * this.shake);
    const camY = Math.round(this.camY + (Math.random() - 0.5) * this.shake);
    const x0 = Math.floor(camX / TILE) - 1;
    const y0 = Math.floor(camY / TILE) - 1;
    const x1 = Math.ceil((camX + this.viewW) / TILE) + 1;
    const y1 = Math.ceil((camY + this.viewH) / TILE) + 1;
    const d = this.data();
    const env = this.environment;
    const frame = {
      ctx, floor: d, x: camX, y: camY, w: this.viewW, h: this.viewH,
      seen: (p: { x: number; y: number }) => this.inb(p.x, p.y) && !!this.floor?.explored[this.idx(p.x, p.y)],
      visible: (p: { x: number; y: number }) => this.inb(p.x, p.y) && this.vis[this.idx(p.x, p.y)] === 1,
    };

    // 1. Tiles + Wall Ambient Occlusion shadows
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.inb(tx, ty)) {
          if (theme === "roof") drawSkyTile(ctx, tx * TILE - camX, ty * TILE - camY, tx, ty);
          continue;
        }
        const i = this.idx(tx, ty);
        const explored = this.floor.explored[i] === 1;
        if (!explored && theme !== "roof") continue;
        const t = d.tiles[i];
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        if (t === 9 || (t === 0 && !this.isFacade(tx, ty))) {
          if (theme === "roof") drawSkyTile(ctx, sx, sy, tx, ty);
          continue;
        }
        const variant = Math.floor(Math.abs(Math.sin(tx * 12.9898 + ty * 78.233)) * 12);
        let spr: HTMLCanvasElement | null = null;
        if (t === Tile.Floor || t === Tile.Hole) {
          const fs = d.floorStyle?.[i] ?? 0;
          const bank = this.art.floorStyles[fs] ?? this.art.floors[d.theme];
          spr = bank[variant % bank.length];
        } else if (t === 7) spr = this.art.rubble;
        else if (t === 8) spr = this.art.puddle;
        else if (t === 0) {
          const ws = d.wallStyle?.[i] ?? 0;
          const bank = this.art.wallStyles[ws] ?? this.art.walls[d.theme];
          spr = bank[variant % bank.length];
        }
        else if (t === 6) {
          const w = d.windows.find((ww) => ww.x === tx && ww.y === ty);
          spr = this.art.windows[w?.glow ?? "none"];
        } else if (t === 2) {
          const door = this.doorAt(tx, ty);
          spr = door?.locked
            ? this.art.doorLocked
            : door?.barricaded
              ? this.art.doorBarricaded
              : door && door.hp < 3
                ? this.art.doorBroken
                : this.art.door;
        } else if (t === 3) spr = this.art.doorOpen;
        else if (t === 4) spr = this.art.stairsUp;
        else if (t === 5) spr = this.art.stairsDown;
        if (spr) ctx.drawImage(spr, sx, sy);

        // Ambient occlusion drop shadow under north/west walls for crisp 2.5D depth
        if (t === 1 || t === 7 || t === 8 || t === 3) {
          const north = this.tileAt(tx, ty - 1);
          if (north === 0 || north === 6) {
            ctx.fillStyle = "rgba(6,8,12,0.42)";
            ctx.fillRect(sx, sy, TILE, 3);
            ctx.fillStyle = "rgba(6,8,12,0.18)";
            ctx.fillRect(sx, sy + 3, TILE, 2);
          }
          const west = this.tileAt(tx - 1, ty);
          if (west === 0 || west === 6) {
            ctx.fillStyle = "rgba(6,8,12,0.24)";
            ctx.fillRect(sx, sy, 2, TILE);
          }
        }
        // Kręgi na kałużach: ulewa na dachu, kapiąca woda w środku
        if (t === 8) {
          const speed = theme === "roof" ? 2.2 : 1.1;
          const rp = (this.time * speed + tx * 0.7 + ty * 1.3) % 1;
          const rad = Math.floor(rp * 6);
          ctx.fillStyle = theme === "roof" ? "rgba(210,232,250,0.42)" : "rgba(170,204,228,0.24)";
          ctx.fillRect(sx + 7 - rad, sy + 8, 1, 1);
          ctx.fillRect(sx + 7 + rad, sy + 8, 1, 1);
          if (rp > 0.5) {
            const r2 = Math.floor((rp - 0.5) * 8);
            ctx.fillRect(sx + 7, sy + 8 - r2, 1, 1);
            ctx.fillRect(sx + 7, sy + 8 + r2, 1, 1);
          }
        }
      }
    }

    // 2. Floor carpets (non-solid props under entities)
    for (const p of d.props) {
      if (p.solid || isTacticalProp(p)) continue;
      const i = this.idx(p.x, p.y);
      if (!this.floor.explored[i] && theme !== "roof") continue;
      ctx.drawImage(this.art.props[p.kind], p.x * TILE - camX, p.y * TILE - camY);
    }

    // 3. Detailed floor decals, blood & spent shell casings
    for (const dec of d.decals) {
      const i = this.idx(dec.x, dec.y);
      if (!this.floor.explored[i] && theme !== "roof") continue;
      const sx = dec.x * TILE - camX;
      const sy = dec.y * TILE - camY;
      if (dec.kind === "paper") {
        ctx.fillStyle = "#dfd7c6";
        ctx.fillRect(sx + 4, sy + 6, 4, 3);
        ctx.fillStyle = "#8a8072";
        ctx.fillRect(sx + 5, sy + 7, 2, 1);
      } else if (dec.kind === "moss") {
        ctx.fillStyle = "#3f5834";
        ctx.fillRect(sx + 3, sy + 5, 5, 3);
        ctx.fillStyle = COL.moldLight;
        ctx.fillRect(sx + 4, sy + 6, 2, 1);
      } else if (dec.kind === "crack") {
        ctx.fillStyle = "#221e1b";
        ctx.fillRect(sx + 3, sy + 4, 2, 1);
        ctx.fillRect(sx + 5, sy + 5, 2, 1);
        ctx.fillRect(sx + 7, sy + 6, 2, 1);
        ctx.fillRect(sx + 6, sy + 7, 1, 2);
      } else if (dec.kind === "cable") {
        ctx.fillStyle = "#18181c";
        ctx.fillRect(sx + 2, sy + 8, 5, 1);
        ctx.fillRect(sx + 7, sy + 9, 4, 1);
        ctx.fillRect(sx + 11, sy + 8, 3, 1);
      } else if (dec.kind === "scorch") {
        ctx.fillStyle = "#191414";
        ctx.fillRect(sx + 3, sy + 4, 9, 7);
        ctx.fillStyle = "#2e1e18";
        ctx.fillRect(sx + 5, sy + 6, 5, 3);
        ctx.fillRect(sx + 11, sy + 3, 2, 2);
      } else if (dec.kind === "glass") {
        ctx.fillStyle = "#a8c4d4";
        ctx.fillRect(sx + 3, sy + 5, 2, 1);
        ctx.fillRect(sx + 8, sy + 8, 1, 2);
        ctx.fillRect(sx + 11, sy + 4, 2, 1);
        ctx.fillStyle = "#e4f0f4";
        ctx.fillRect(sx + 5, sy + 10, 1, 1);
      } else if (dec.kind === "footprint") {
        ctx.fillStyle = "rgba(40,30,24,0.65)";
        ctx.fillRect(sx + 4, sy + 3, 2, 3);
        ctx.fillRect(sx + 9, sy + 8, 2, 3);
        ctx.fillRect(sx + 5, sy + 7, 2, 1);
      } else if (dec.kind === "leaf") {
        ctx.fillStyle = "#6a6030";
        ctx.fillRect(sx + 5, sy + 6, 3, 1);
        ctx.fillRect(sx + 10, sy + 10, 2, 1);
        ctx.fillStyle = "#8a7c40";
        ctx.fillRect(sx + 6, sy + 5, 1, 1);
      } else if (dec.kind === "toy") {
        ctx.fillStyle = COL.cap;
        ctx.fillRect(sx + 4, sy + 5, 3, 3);
        ctx.fillStyle = COL.teal;
        ctx.fillRect(sx + 9, sy + 9, 2, 2);
        ctx.fillStyle = COL.brass;
        ctx.fillRect(sx + 11, sy + 4, 2, 2);
      } else if (dec.kind === "pills") {
        ctx.fillStyle = "#bebfb2";
        ctx.fillRect(sx + 4, sy + 7, 5, 3);
        ctx.fillStyle = "#d6c8ad";
        ctx.fillRect(sx + 6, sy + 6, 3, 1);
        ctx.fillStyle = "#a94238";
        ctx.fillRect(sx + 10, sy + 9, 2, 1);
        ctx.fillRect(sx + 3, sy + 11, 1, 1);
      } else if (dec.kind === "book") {
        ctx.fillStyle = "#4a2f29";
        ctx.fillRect(sx + 3, sy + 6, 7, 5);
        ctx.fillStyle = "#bba98c";
        ctx.fillRect(sx + 4, sy + 7, 5, 3);
        ctx.fillStyle = "#59483d";
        ctx.fillRect(sx + 6, sy + 7, 1, 3);
      } else if (dec.kind === "cloth") {
        ctx.fillStyle = "#635452";
        ctx.fillRect(sx + 3, sy + 8, 8, 3);
        ctx.fillRect(sx + 5, sy + 6, 5, 2);
        ctx.fillStyle = "#8c7770";
        ctx.fillRect(sx + 5, sy + 8, 4, 1);
      } else {
        ctx.fillStyle = "rgba(46,32,26,0.65)";
        ctx.fillRect(sx + 4, sy + 5, 5, 4);
      }
    }

    // 3b. Zawalone ściany wewnętrzne (poszarpany mur, cegły, zbrojenie)
    for (const br of d.breaches) {
      if (br.x < x0 || br.x > x1 || br.y < y0 || br.y > y1 || !this.inb(br.x, br.y)) continue;
      const i = this.idx(br.x, br.y);
      if (!this.floor.explored[i]) continue;
      ctx.drawImage(this.art.breach, br.x * TILE - camX, br.y * TILE - camY);
    }

    // 3c. Dekoracje ścienne: plakaty, numery mieszkań, rury, rozdzielnice, graffiti, wybite dziury
    for (const wd of d.wallDecals) {
      if (wd.x < x0 || wd.x > x1 || wd.y < y0 || wd.y > y1 || !this.inb(wd.x, wd.y)) continue;
      const i = this.idx(wd.x, wd.y);
      if (d.tiles[i] !== 0 || !this.floor.explored[i]) continue;
      this.drawWallDecal(ctx, wd, wd.x * TILE - camX, wd.y * TILE - camY);
    }

    for (const b of this.floor.blood) {
      const btx = Math.floor(b.x / TILE);
      const bty = Math.floor(b.y / TILE);
      if (!this.inb(btx, bty)) continue;
      if (!this.floor.explored[this.idx(btx, bty)] && theme !== "roof") continue;
      const bx = Math.round(b.x - camX);
      const by = Math.round(b.y - camY);
      ctx.fillStyle = COL.blood;
      ctx.fillRect(bx - 2, by - 1, 5, 3);
      ctx.fillStyle = COL.bloodBright;
      ctx.fillRect(bx, by, 2, 1);
      ctx.fillRect(bx - 3, by + 2, 1, 1);
      ctx.fillRect(bx + 3, by - 2, 1, 1);
    }

    for (const s of this.floor.shells) {
      const sx = Math.round(s.x - camX);
      const sy = Math.round(s.y - s.z - camY);
      ctx.fillStyle = s.col;
      ctx.fillRect(sx, sy, 2, 1);
    }

    if (env) drawEnvironmentGround(frame, env);
    drawVerticalWorld(ctx, d, this.building, this.questState(), camX, camY, this.time, this.floor.explored);
    if (this.tactical) drawTacticalProps(ctx, d, this.tactical.state, camX, camY, this.time, this.floor.explored);
    this.director?.drawProps(ctx, camX, camY, this.time);

    // 4. Y-sorted props, zombies & player
    const draws: { y: number; draw: () => void }[] = env ? environmentProps(frame, env) : [];
    for (const p of d.props) {
      if (!p.solid || isTacticalProp(p)) continue;
      const i = this.idx(p.x, p.y);
      if (!this.floor.explored[i] && !this.vis[i] && theme !== "roof") continue;
      draws.push({
        y: (p.y + p.h) * TILE,
        draw: () => {
          const spr = p.kind === "crate" && p.opened ? this.art.crateOpen : this.art.props[p.kind];
          const sx = p.x * TILE - camX - 1;
          const sy = p.y * TILE - camY - 1;
          // Contact shadow
          ctx.fillStyle = "rgba(6,8,12,0.34)";
          ctx.fillRect(sx + 2, sy + spr.height - 2, spr.width - 4, 2);
          ctx.drawImage(spr, sx, sy);
          if (!p.opened && isWeapon(p.loot)) {
            const x = sx + 4, y = sy + 5;
            if (p.loot === "hatchet") {
              pixLine(ctx, x, y + 6, x + 6, y, "#c39359");
              ctx.fillStyle = "#bac4bc";
              ctx.fillRect(x + 5, y - 1, 3, 3);
              ctx.fillRect(x + 7, y + 1, 2, 2);
            } else if (p.loot === "revolver") {
              ctx.fillStyle = "#b9c3bd"; ctx.fillRect(x + 5, y, 9, 2);
              ctx.fillStyle = "#343f41"; ctx.fillRect(x + 5, y + 1, 4, 3);
              ctx.fillStyle = COL.woodLight; ctx.fillRect(x + 4, y + 3, 3, 3);
            } else {
              ctx.fillStyle = COL.brass; ctx.fillRect(x, y, 6, 2);
              ctx.fillStyle = "#51452d"; ctx.fillRect(x + 1, y + 1, 4, 1);
            }
          }
          // Delikatne podświetlenie obiektów, które można przeszukać / otworzyć
          if (!p.opened && (p.loot || p.kind === "flare") && this.vis[i]) {
            const dist = Math.hypot(this.px - (p.x + p.w / 2) * TILE, this.py - (p.y + p.h / 2) * TILE);
            const near = dist < 26;
            const pulse = 0.55 + 0.45 * Math.sin(this.time * (near ? 8 : 4.2) + p.id);
            const col = p.id === d.keyPropId || p.kind === "flare" ? COL.fluor : near ? "#f2e888" : "#d4a84a";
            ctx.strokeStyle = col;
            ctx.globalAlpha = (near ? 0.85 : 0.45) * pulse;
            ctx.strokeRect(sx + 0.5, sy + 0.5, spr.width - 1, spr.height - 1);
            // narożne iskierki przy skrzynce z łupem
            ctx.fillStyle = col;
            ctx.fillRect(sx, sy, 2, 2);
            ctx.fillRect(sx + spr.width - 2, sy, 2, 2);
            ctx.globalAlpha = 1;
          }
        },
      });
    }
    for (const civ of this.director?.civilians() ?? []) {
      const tx = Math.floor(civ.x / TILE);
      const ty = Math.floor(civ.y / TILE);
      if (!this.inb(tx, ty) || !this.vis[this.idx(tx, ty)]) continue;
      draws.push({ y: civ.y + 4, draw: () => this.director?.drawCiv(ctx, civ, camX, camY) });
    }
    for (const s of this.floor.survivors) {
      if (s.state === "gone") continue;
      const tx = Math.floor(s.x / TILE);
      const ty = Math.floor(s.y / TILE);
      if (!this.inb(tx, ty) || !this.vis[this.idx(tx, ty)]) continue;
      draws.push({
        y: s.y + 4,
        draw: () => this.drawSurvivor(ctx, s, camX, camY),
      });
    }
    for (const z of this.floor.zombies) {
      const tx = Math.floor(z.x / TILE);
      const ty = Math.floor(z.y / TILE);
      const seen =
        this.inb(tx, ty) &&
        (z.state === "dead" ? this.floor.explored[this.idx(tx, ty)] || theme === "roof" : this.vis[this.idx(tx, ty)]);
      if (!seen) continue;
      draws.push({
        y: z.y + 4,
        draw: () => this.drawZombie(ctx, z, camX, camY),
      });
    }
    if (this.environmentHit || !(this.invuln > 0 && Math.floor(this.time * 16) % 2 === 0)) {
      draws.push({ y: this.py + 4, draw: () => this.drawPlayer(ctx, camX, camY) });
    }
    draws.sort((a, b) => a.y - b.y);
    for (const item of draws) item.draw();

    // Non-glowing particles (blood, rain, smoke)
    for (const p of this.particles) {
      if (p.glow) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // 5. DYNAMIC LIGHTING COMPOSITE LAYER (multiply)
    this.renderLighting(ctx, camX, camY, x0, y0, x1, y1);

    // 6. POST-LIGHTING EMISSIVE / GLOW LAYER (zombie red eyes, tracers, sparks, fixtures, dust)
    this.drawPostLighting(ctx, camX, camY);
    if (env) drawEnvironmentSignals(frame, env);

    // Lądowisko na dachu
    if (theme === "roof" && d.flare) {
      const fx = (d.flare.x + 0.5) * TILE - camX;
      const fy = (d.flare.y + 0.5) * TILE - camY;
      ctx.fillStyle = "rgba(203,184,154,0.4)";
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        ctx.fillRect(Math.round(fx + Math.cos(a) * 17), Math.round(fy + Math.sin(a) * 17), 2, 2);
      }
      ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 4, 2, 8);
      ctx.fillRect(Math.round(fx) - 4, Math.round(fy) - 1, 8, 2);
    }
    if (this.heliPhase) this.drawHeli(ctx, camX, camY);

    // 7. Objective marker, Minimap, Screen overlays & Reticle
    this.drawMarker(ctx, camX, camY);
    if (!this.director?.choice && !this.activeDialog) this.drawMinimap(ctx);
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(6,8,12,${this.fade})`;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
    if (this.hurt > 0) {
      ctx.fillStyle = `rgba(140,16,16,${this.hurt * (this.environmentHit ? 0.12 : 0.28)})`;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
    this.director?.drawOverlay(ctx, this.viewW, this.viewH, this.time);
    if (!this.paused && !this.dead && !this.won && !this.director?.hidden) {
      const cx = Math.round(this.mouseSX);
      const cy = Math.round(this.mouseSY);
      let hot = false;
      for (const z of this.floor.zombies) {
        if (z.state === "dead") continue;
        if (Math.hypot(z.x - camX - cx, z.y - camY - cy) < 12) hot = true;
      }
      ctx.fillStyle = hot ? COL.bloodBright : COL.fluor;
      ctx.fillRect(cx - 4, cy, 2, 1);
      ctx.fillRect(cx + 2, cy, 2, 1);
      ctx.fillRect(cx, cy - 4, 1, 2);
      ctx.fillRect(cx, cy + 2, 1, 2);
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillRect(cx, cy, 1, 1);
    }
  }

  private renderLighting(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ) {
    if (!this.floor) return;
    const d = this.data();
    const lc = this.lctx;
    lc.globalCompositeOperation = "source-over";

    // Ambient shadow tone per floor theme
    if (d.theme === "roof") lc.fillStyle = "#7688a8";
    else if (d.theme === "lobby") lc.fillStyle = "#2b303c";
    else if (d.theme === "flat") lc.fillStyle = "#222530";
    else if (d.theme === "decay") lc.fillStyle = "#1b2126";
    else lc.fillStyle = "#161a24";
    lc.fillRect(0, 0, this.viewW, this.viewH);

    lc.globalCompositeOperation = "lighter";
    if (this.lightning > 0.02) {
      lc.fillStyle = `rgba(190,214,255,${this.lightning * 0.75})`;
      lc.fillRect(0, 0, this.viewW, this.viewH);
    }

    const addRadial = (sx: number, sy: number, r: number, inner: string, mid: string) => {
      if (sx + r < 0 || sy + r < 0 || sx - r > this.viewW || sy - r > this.viewH) return;
      const g = lc.createRadialGradient(sx, sy, 1, sx, sy, r);
      g.addColorStop(0, inner);
      g.addColorStop(0.55, mid);
      g.addColorStop(1, "rgba(0,0,0,0)");
      lc.fillStyle = g;
      lc.fillRect(Math.floor(sx - r), Math.floor(sy - r), Math.ceil(r * 2), Math.ceil(r * 2));
    };

    const psx = this.px - camX;
    const psy = this.py - camY;

    // Ceiling & emergency light fixtures
    for (const lf of d.lights) {
      if (this.environment?.roomDark(lf.roomId) || this.environment?.roomHidden(lf.roomId)) continue;
      const tx = Math.floor(lf.x / TILE);
      const ty = Math.floor(lf.y / TILE);
      if (this.inb(tx, ty) && !this.floor.explored[this.idx(tx, ty)] && d.theme !== "roof") continue;
      const intensity = this.fixtureIntensity(lf) * (this.director?.lightFactor() ?? 1);
      const lx = lf.x - camX;
      const ly = lf.y - camY;
      if (lf.kind === "fluor") {
        addRadial(
          lx,
          ly,
          lf.radius,
          `rgba(232,228,125,${0.86 * intensity})`,
          `rgba(165,172,88,${0.36 * intensity})`,
        );
      } else if (lf.kind === "sodium") {
        addRadial(
          lx,
          ly,
          lf.radius,
          `rgba(245,164,72,${0.84 * intensity})`,
          `rgba(180,104,42,${0.34 * intensity})`,
        );
      } else {
        const pulse = 0.55 + 0.45 * Math.sin(this.time * 3.4 + lf.roomId);
        addRadial(
          lx,
          ly,
          lf.radius,
          `rgba(225,74,64,${0.75 * pulse})`,
          `rgba(145,38,34,${0.28 * pulse})`,
        );
      }
    }

    for (const l of this.director?.eventLights() ?? []) {
      addRadial(l.x - camX, l.y - camY, l.r, l.inner, l.mid);
    }

    // Urządzenia na ścianach: diody, iskrzące rozdzielnice
    for (const f of this.fixtures) {
      const tx = f.x;
      const ty = f.y;
      if (!this.inb(tx, ty) || !this.floor.explored[this.idx(tx, ty)]) continue;
      const fx = (f.x + 0.5) * TILE - camX;
      const fy = (f.y + 0.5) * TILE - camY;
      if (f.kind === "intercom" && Math.sin(this.time * 3) > 0) {
        addRadial(fx, fy, 22, "rgba(126,224,140,0.5)", "rgba(52,110,62,0.16)");
      } else if (f.kind === "emergencylamp") {
        const glow = 0.65 + 0.35 * Math.sin(this.time * 3 + f.x);
        addRadial(fx, fy + 8, 43, `rgba(226,81,59,${0.52 * glow})`, `rgba(152,45,30,${0.18 * glow})`);
      } else if (f.kind === "camera" && Math.sin(this.time * 3 + f.y) > 0) {
        addRadial(fx, fy, 14, "rgba(220,72,64,0.35)", "rgba(120,24,20,0.1)");
      } else if (f.kind === "panel" && Math.sin(this.time * 9 + f.x * 0.31) > 0.82) {
        addRadial(fx, fy + 4, 34, "rgba(255,232,170,0.6)", "rgba(190,120,50,0.2)");
      } else if (f.kind === "drip") {
        addRadial(fx, fy + 12, 18, "rgba(122,168,200,0.3)", "rgba(40,80,110,0.1)");
      } else if (f.kind === "exitsign") {
        addRadial(fx, fy + 3, 30, "rgba(110,230,160,0.55)", "rgba(40,110,76,0.18)");
      } else if (f.kind === "sconce") {
        const w = 0.8 + 0.2 * Math.sin(this.time * 7 + f.x);
        addRadial(fx, fy + 5, 56 * w, `rgba(255,206,132,${0.72 * w})`, `rgba(190,120,52,${0.24 * w})`);
      } else if (f.kind === "thermostat" && Math.sin(this.time * 2.2 + f.x * 0.4) > 0.4) {
        addRadial(fx, fy + 3, 14, "rgba(196,56,48,0.4)", "rgba(90,24,20,0.12)");
      }
    }

    // Window light spills (cool night blue, sickly yellow-green, or sodium orange)
    for (const w of d.windows) {
      if (!this.inb(w.x, w.y) || !this.floor.explored[this.idx(w.x, w.y)]) continue;
      const wx = (w.x + 0.5) * TILE - camX;
      const wy = (w.y + 0.5) * TILE - camY;
      const spill =
        w.glow === "orange"
          ? ["rgba(240,148,58,0.72)", "rgba(160,82,30,0.24)"]
          : w.glow === "fluor"
            ? ["rgba(224,220,108,0.65)", "rgba(130,140,68,0.22)"]
            : ["rgba(88,136,204,0.52)", "rgba(42,74,126,0.18)"];
      addRadial(wx, wy, w.glow === "none" ? 44 : 48, spill[0], spill[1]);
      // Światło wpada przez okno i leje się po podłodze w głąb pomieszczenia
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = w.x + dx;
        const ny = w.y + dy;
        if (!this.inb(nx, ny)) continue;
        const nt = this.tileAt(nx, ny);
        if (nt !== 1 && nt !== 7 && nt !== 8) continue;
        addRadial((nx + 0.5) * TILE - camX, (ny + 0.5) * TILE - camY, 46, spill[0], spill[1]);
        const fx = nx + dx;
        const fy = ny + dy;
        if (!this.inb(fx, fy)) continue;
        const ft = this.tileAt(fx, fy);
        if (ft === 1 || ft === 7 || ft === 8) {
          addRadial((fx + 0.5) * TILE - camX, (fy + 0.5) * TILE - camY, 30, spill[1], "rgba(0,0,0,0)");
        }
      }
    }

    // Reduce spill from adjoining rooms before applying the player's own light.
    if (this.environment) for (const room of d.rooms) {
      if (!this.environment.roomDark(room.id)) continue;
      lc.globalCompositeOperation = "source-over";
      lc.fillStyle = "#171c238e";
      lc.fillRect(room.x * TILE - camX, room.y * TILE - camY, room.w * TILE, room.h * TILE);
    }
    lc.globalCompositeOperation = "lighter";
    addRadial(psx, psy, 34, "rgba(185,172,145,0.58)", "rgba(110,104,92,0.22)");

    if (this.flashOn && this.battery > 0) {
      const lowFlicker = this.battery < 18 && Math.sin(this.time * 26) * Math.sin(this.time * 11) > 0.55 ? 0.32 : 1.0;
      const maxLen = 176, halfAngle = 0.56, rays = 40;
      lc.save();
      lc.beginPath();
      lc.moveTo(psx, psy);
      for (let i = 0; i <= rays; i++) {
        const a = this.aim - halfAngle + (i / rays) * halfAngle * 2;
        const hit = this.castRay(this.px, this.py, a, maxLen);
        lc.lineTo(hit.x - camX, hit.y - camY);
      }
      lc.closePath();
      const fg = lc.createRadialGradient(psx, psy, 4, psx, psy, maxLen);
      fg.addColorStop(0, `rgba(255,247,206,${0.97 * lowFlicker})`);
      fg.addColorStop(0.34, `rgba(240,230,152,${0.7 * lowFlicker})`);
      fg.addColorStop(0.72, `rgba(186,182,124,${0.34 * lowFlicker})`);
      fg.addColorStop(1, "rgba(0,0,0,0)");
      lc.fillStyle = fg;
      lc.fill();
      lc.restore();
    }

    // Dynamic muzzle flash light illuminating the whole room briefly!
    if (this.muzzleLight > 0.02) {
      const m = Math.min(1, this.muzzleLight);
      const mx = psx + Math.cos(this.aim) * 14;
      const my = psy + Math.sin(this.aim) * 14;
      addRadial(mx, my, 96 + m * 55, `rgba(255,222,138,${m})`, `rgba(235,142,60,${0.55 * m})`);
    }

    // Flare charging light on roof
    if (d.flare && this.flareCharge > 0) {
      const p = Math.min(1, this.flareCharge / 2.7);
      const fx = (d.flare.x + 0.5) * TILE - camX;
      const fy = (d.flare.y + 0.5) * TILE - camY;
      addRadial(fx, fy, 48 + p * 85, `rgba(255,95,70,${0.4 + p * 0.6})`, `rgba(235,180,75,${0.25 + p * 0.4})`);
    }

    // Reflektor helikoptera
    if (this.heliPhase) {
      const hx = this.heliPos.x - camX;
      const hy = this.heliPos.y - camY;
      addRadial(hx, hy + this.heliPos.h * 0.4, 90, "rgba(240,244,255,0.85)", "rgba(160,190,230,0.3)");
      addRadial(hx, hy, 60, "rgba(200,214,235,0.5)", "rgba(120,150,190,0.18)");
    }

    // Unseen explored tiles stay dim (fog of war)
    if (d.theme !== "roof") {
      lc.globalCompositeOperation = "source-over";
      lc.fillStyle = "rgba(8,10,16,0.58)";
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (!this.inb(tx, ty)) continue;
          const i = this.idx(tx, ty);
          if (this.floor.explored[i] && !this.vis[i]) {
            lc.fillRect(tx * TILE - camX, ty * TILE - camY, TILE, TILE);
          }
        }
      }
    }

    // Apply lighting map with multiply blend
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(this.lightCanvas, 0, 0);
    ctx.restore();
  }

  private drawPostLighting(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    if (!this.floor) return;
    const d = this.data();

    // Soft additive bloom for fixtures, flare & muzzle flash
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // Subtle light cone atmospheric haze
    if (this.flashOn && this.battery > 0 && d.theme !== "roof") {
      const psx = this.px - camX;
      const psy = this.py - camY;
      const g = ctx.createRadialGradient(psx, psy, 2, psx, psy, 72);
      g.addColorStop(0, "rgba(232,224,132,0.09)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(psx - 72, psy - 72, 144, 144);
    }

    // Fluorescent & emergency glowing bulbs / halos
    for (const lf of d.lights) {
      const tx = Math.floor(lf.x / TILE);
      const ty = Math.floor(lf.y / TILE);
      if (!this.inb(tx, ty) || !this.vis[this.idx(tx, ty)]) continue;
      const inten = this.fixtureIntensity(lf);
      const lx = Math.round(lf.x - camX);
      const ly = Math.round(lf.y - camY);
      if (lf.kind === "fluor") {
        ctx.fillStyle = `rgba(232,224,112,${0.14 * inten})`;
        ctx.fillRect(lx - 7, ly - 5, 14, 10);
        // Lampa: oprawa świetlówki + ćmy krążące wokół światła
        ctx.fillStyle = `rgba(255,250,200,${0.75 * inten})`;
        ctx.fillRect(lx - 5, ly - 1, 10, 2);
        ctx.fillStyle = "rgba(242,239,230,0.85)";
        for (let k = 0; k < 3; k++) {
          const ph = this.time * (2.2 + k * 0.7) + lf.roomId * 2 + k * 3;
          ctx.fillRect(lx + Math.round(Math.cos(ph) * (6 + k * 2)), ly + Math.round(Math.sin(ph * 1.4) * (3 + k)), 1, 1);
        }
        ctx.fillStyle = `rgba(232,224,112,${0.1 * inten})`;
        ctx.fillRect(lx - 4, ly + 2, 8, 2);
      } else if (lf.kind === "emergency") {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 3.4 + lf.roomId);
        ctx.fillStyle = `rgba(224,48,48,${0.18 * pulse})`;
        ctx.fillRect(lx - 5, ly - 5, 10, 10);
      }
    }

    // Snopy światła wpadające przez okna
    for (const w of d.windows) {
      if (w.glow === "none" || !this.inb(w.x, w.y) || !this.floor.explored[this.idx(w.x, w.y)]) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = w.x + dx;
        const ny = w.y + dy;
        const nt = this.tileAt(nx, ny);
        if (nt !== 1 && nt !== 7 && nt !== 8) continue;
        const sx = nx * TILE - camX;
        const sy = ny * TILE - camY;
        const tint = w.glow === "orange" ? "rgba(236,154,72," : w.glow === "fluor" ? "rgba(228,214,124," : "rgba(104,156,212,";
        ctx.fillStyle = `${tint}0.13)`;
        ctx.fillRect(sx - 3, sy - 3, TILE + 6, TILE + 6);
        ctx.fillStyle = `${tint}0.07)`;
        ctx.fillRect(sx - 3 - dx * 6, sy - 3 - dy * 6, TILE + 12, TILE + 12);
        break;
      }
    }

    for (const f of this.fixtures) {
      if (f.kind === "exitsign") {
        const tx = f.x, ty = f.y;
        if (!this.inb(tx, ty) || !this.vis[this.idx(tx, ty)]) continue;
        const ex = Math.round((f.x + 0.5) * TILE - camX);
        const ey = Math.round((f.y + 0.5) * TILE - camY);
        ctx.fillStyle = "rgba(120,240,175,0.16)";
        ctx.fillRect(ex - 9, ey - 6, 18, 12);
      }
    }
    for (const f of this.fixtures) {
      if (f.kind !== "intercom") continue;
      const tx = f.x;
      const ty = f.y;
      if (!this.inb(tx, ty) || !this.vis[this.idx(tx, ty)]) continue;
      const ex = Math.round((f.x + 0.5) * TILE - camX - 1);
      const ey = Math.round((f.y + 0.5) * TILE - camY + 5);
      ctx.fillStyle = Math.sin(this.time * 3) > 0 ? "#7fe08c" : "#3b6b42";
      ctx.fillRect(ex, ey, 2, 1);
    }

    // Flare crate beacon glow
    if (d.flare) {
      const fx = Math.round((d.flare.x + 0.5) * TILE - camX);
      const fy = Math.round((d.flare.y + 0.5) * TILE - camY);
      const pulse = 0.45 + 0.55 * Math.abs(Math.sin(this.time * 4));
      ctx.fillStyle = `rgba(232,70,56,${0.28 * pulse})`;
      ctx.fillRect(fx - 6, fy - 6, 12, 12);
      ctx.fillStyle = COL.fluor;
      ctx.fillRect(fx - 1, fy - 1, 2, 2);
    }

    // Delikatna poświata nad interaktywnymi skrzynkami i drzwiami w polu widzenia
    for (const p of d.props) {
      if (p.opened || !p.loot) continue;
      const i = this.idx(p.x, p.y);
      if (!this.vis[i]) continue;
      const cx = Math.round((p.x + p.w / 2) * TILE - camX);
      const cy = Math.round((p.y + p.h / 2) * TILE - camY);
      const dist = Math.hypot(this.px - (p.x + p.w / 2) * TILE, this.py - (p.y + p.h / 2) * TILE);
      const near = dist < 26;
      const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * (near ? 8 : 4) + p.id));
      ctx.fillStyle =
        p.id === d.keyPropId
          ? `rgba(232,224,112,${(near ? 0.34 : 0.2) * pulse})`
          : `rgba(212,168,74,${(near ? 0.28 : 0.14) * pulse})`;
      ctx.fillRect(cx - 8, cy - 8, 16, 16);
    }
    for (const door of d.doors) {
      if (door.broken || door.open) continue;
      const i = this.idx(door.x, door.y);
      if (!this.vis[i]) continue;
      const dist = Math.hypot(this.px - (door.x + 0.5) * TILE, this.py - (door.y + 0.5) * TILE);
      if (dist > 28) continue;
      const pulse = 0.45 + 0.55 * Math.abs(Math.sin(this.time * 6));
      const sx = door.x * TILE - camX;
      const sy = door.y * TILE - camY;
      ctx.fillStyle = door.locked
        ? `rgba(224,80,72,${0.22 * pulse})`
        : door.barricaded
          ? `rgba(212,168,74,${0.22 * pulse})`
          : `rgba(232,224,112,${0.18 * pulse})`;
      ctx.fillRect(sx - 1, sy - 1, TILE + 2, TILE + 2);
    }

    // Glowing zombie red eye piercing the darkness!
    for (const z of this.floor.zombies) {
      if (z.state === "dead" || z.dir === "up") continue;
      const tx = Math.floor(z.x / TILE);
      const ty = Math.floor(z.y / TILE);
      if (!this.inb(tx, ty) || !this.vis[this.idx(tx, ty)]) continue;
      const sc = z.kind === "boss" ? 2 : 1;
      const ex = Math.round(z.x - camX + (z.dir === "left" ? -2 : z.dir === "right" ? 2 : 1) * sc);
      const ey = Math.round(z.y - camY - 6 * sc);
      ctx.fillStyle = `rgba(224,48,48,${z.kind === "boss" ? 0.6 : 0.45})`;
      ctx.fillRect(ex - 1, ey - 1, z.kind === "boss" ? 5 : 3, z.kind === "boss" ? 5 : 3);
      ctx.fillStyle = "#ff5048";
      ctx.fillRect(ex, ey, z.kind === "boss" ? 2 : 1, z.kind === "boss" ? 2 : 1);
      if (z.kind === "boss") {
        ctx.fillStyle = "rgba(255,120,100,0.25)";
        ctx.fillRect(ex - 3, ey - 3, 8, 8);
      }
    }

    // Bullet tracers
    for (const b of this.bullets) {
      pixLine(ctx, b.px - camX, b.py - camY, b.x - camX, b.y - camY, b.bolt ? COL.woodLight : COL.fluor);
      ctx.fillStyle = b.bolt ? COL.metal : COL.white;
      ctx.fillRect(Math.round(b.x - camX), Math.round(b.y - camY), 2, 2);
    }

    // Glowing sparks / embers
    for (const p of this.particles) {
      if (!p.glow) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Floating dust motes visible inside lit areas
    if (d.theme !== "roof") {
      for (const m of this.dust) {
        const tx = Math.floor((m.x + camX) / TILE);
        const ty = Math.floor((m.y + camY) / TILE);
        if (!this.inb(tx, ty)) continue;
        const i = this.idx(tx, ty);
        if (!this.vis[i] || this.light[i] < 0.45) continue;
        const a = 0.22 + 0.18 * Math.sin(this.time * 2.2 + m.phase);
        ctx.fillStyle = `rgba(232,224,160,${a})`;
        ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
      }
    }

    ctx.restore();

    // Zanikające dymki nad otwartymi skrzynkami / drzwiami (zawsze ostre, nad światłem)
    for (const pop of this.popups) {
      const a = Math.max(0, Math.min(1, pop.life / (pop.max * 0.45)));
      const sx = Math.round(pop.x - camX);
      const sy = Math.round(pop.y - camY);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = "bold 7px monospace";
      ctx.textAlign = "center";
      const tw = Math.ceil(ctx.measureText(pop.text).width) + 8;
      const bx = Math.round(sx - tw / 2);
      const by = sy - 11;
      // dymek z obwódką i dzióbkiem w dół
      ctx.fillStyle = "rgba(12,10,8,0.92)";
      ctx.fillRect(bx, by, tw, 10);
      ctx.strokeStyle = pop.col;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, 9);
      ctx.fillStyle = pop.col;
      ctx.fillRect(sx - 1, by + 10, 2, 2);
      ctx.fillText(pop.text, sx, by + 7);
      ctx.restore();
    }
  }

  private isFacade(tx: number, ty: number) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const t = this.tileAt(tx + ox, ty + oy);
        if (t === 1 || t === 2 || t === 3 || t === 4 || t === 5 || t === 7 || t === 8) return true;
      }
    }
    return false;
  }

  private drawWallDecal(ctx: CanvasRenderingContext2D, wd: { x: number; y: number; kind: string }, sx: number, sy: number) {
    const R = (x: number, y: number, w: number, h: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(sx + x, sy + y, w, h);
    };
    switch (wd.kind) {
      case "poster":
        R(3, 2, 10, 8, "#c4a884");
        R(4, 3, 8, 2, "#3e8a86");
        R(4, 6, 6, 1, "#5c564e");
        R(4, 8, 4, 1, "#8a3c22");
        R(11, 1, 1, 1, COL.cap);
        break;
      case "graffiti":
        R(2, 6, 5, 2, COL.cap);
        R(6, 4, 2, 5, COL.cap);
        R(9, 6, 5, 2, "#3e8a86");
        R(12, 8, 2, 3, "#3e8a86");
        break;
      case "familyphoto":
        R(2, 2, 12, 10, "#3c2b21");
        R(3, 3, 10, 8, "#a78b69");
        R(4, 4, 8, 6, "#596462");
        R(5, 5, 2, 2, "#ddc3a0");
        R(9, 5, 2, 2, "#ddc3a0");
        R(4, 8, 4, 2, "#3b4542");
        R(8, 8, 4, 2, "#734d40");
        break;
      case "calendar":
        R(4, 2, 8, 11, "#cfc6ae");
        R(4, 2, 8, 2, "#963d35");
        R(5, 6, 1, 1, "#69655d"); R(7, 6, 1, 1, "#69655d"); R(9, 6, 1, 1, "#69655d");
        R(5, 8, 1, 1, "#69655d"); R(7, 8, 1, 1, "#a44337"); R(9, 8, 1, 1, "#69655d");
        R(8, 12, 4, 1, "#574a3c");
        break;
      case "missingposter":
        R(3, 2, 10, 12, "#c7bba1");
        R(4, 3, 8, 2, "#8c3d34");
        R(5, 6, 3, 3, "#3f4946");
        R(9, 6, 3, 1, "#625d53"); R(9, 8, 3, 1, "#625d53");
        R(4, 11, 7, 1, "#7a6a55");
        break;
      case "caution":
        R(2, 3, 12, 9, "#42362c");
        R(3, 4, 10, 7, "#c5a457");
        R(4, 5, 2, 2, "#33332b"); R(10, 5, 2, 2, "#33332b");
        R(7, 5, 2, 4, "#33332b"); R(7, 10, 2, 1, "#33332b");
        break;
      case "emergencylamp": {
        R(3, 3, 10, 8, "#373c39");
        R(4, 4, 8, 6, "#783c32");
        const lit = Math.sin(this.time * 3 + wd.x) > -0.3;
        R(5, 5, 6, 4, lit ? "#d9664c" : "#8b4940");
        if (lit) R(6, 5, 4, 1, "#f5ad7c");
        R(4, 10, 8, 1, "#282e2d");
        break;
      }
      case "camera":
        R(7, 1, 2, 4, "#606b6c");
        R(3, 4, 9, 5, "#465155");
        R(4, 5, 6, 3, "#79898b");
        R(4, 6, 2, 2, "#252e31");
        R(10, 6, 2, 1, Math.sin(this.time * 3 + wd.y) > 0 ? "#e05048" : "#77332b");
        break;
      case "number":
        R(5, 5, 6, 6, "#2a2622");
        R(6, 6, 4, 4, "#cbb89a");
        R(8, 7, 1, 2, "#3a342e");
        break;
      case "switch":
        R(6, 6, 4, 4, "#c8c4bc");
        R(7, 7, 2, 2, "#d4a84a");
        break;
      case "pipe":
        R(2, 0, 2, 16, "#6a7078");
        R(3, 0, 1, 16, "#8a949e");
        R(1, 6, 4, 2, "#4a525a");
        R(2, 12, 1, 2, COL.rust);
        break;
      case "crack":
        R(5, 1, 1, 3, "#221e1b");
        R(6, 4, 2, 2, "#221e1b");
        R(8, 6, 1, 3, "#221e1b");
        R(9, 9, 2, 2, "#221e1b");
        break;
      case "mold":
        R(1, 10, 7, 5, "#3a5030");
        R(3, 8, 5, 4, COL.mold);
        R(10, 12, 4, 3, "#3a5030");
        break;
      case "scorch":
        R(1, 0, 9, 12, "rgba(20,14,12,0.75)");
        R(4, 2, 4, 8, "rgba(20,14,12,0.9)");
        R(10, 8, 3, 4, "rgba(60,32,20,0.6)");
        break;
      case "extinguisher":
        R(5, 5, 6, 9, COL.bloodBright);
        R(6, 6, 4, 5, "#d04a40");
        R(6, 8, 4, 1, "#e4dcc8");
        R(7, 3, 2, 2, "#3a4048");
        break;
      case "fuse":
        R(3, 3, 10, 10, "#4a545a");
        R(4, 4, 8, 8, "#c4bfb5");
        R(5, 5, 3, 2, COL.cap);
        R(9, 5, 2, 2, COL.fluor);
        R(5, 8, 6, 1, "#3a342e");
        break;
      case "clock":
        R(5, 4, 6, 6, "#cbb89a");
        R(6, 5, 4, 4, "#e4dcc8");
        R(8, 5, 1, 2, "#3a342e");
        R(8, 7, 2, 1, "#3a342e");
        break;
      case "elevator":
        R(2, 2, 12, 12, "#4a545a");
        R(3, 3, 10, 10, "#6a7078");
        R(8, 3, 1, 10, "#2a3038");
        R(10, 8, 1, 1, COL.cap);
        R(4, 14, 8, 1, COL.capDark);
        break;
      case "mirror":
        R(3, 2, 10, 10, "#5c564e");
        R(4, 3, 8, 8, "#5a7a8a");
        R(5, 4, 3, 3, "#8aa8b4");
        break;
      case "panel": {
        // Rozdzielnica z migoczącym połączeniem
        R(1, 1, 14, 13, "#39424a");
        R(2, 2, 12, 11, "#59646b");
        R(3, 3, 10, 3, "#2c3236");
        for (let y = 7; y < 11; y += 2) R(3, y, 10, 1, "#78838a");
        R(4, 12, 2, 1, COL.bloodBright);
        R(8, 12, 2, 1, "#d9c46a");
        const hot = Math.sin(this.time * 9 + sx * 0.31) > 0.82;
        if (hot) {
          R(5, 5, 6, 3, "#fff2b0");
          R(4, 4, 1, 1, "#fffbe0");
          R(11, 7, 1, 1, "#ffe08a");
          R(6, 9, 1, 1, "#fffbe0");
        } else {
          R(5, 5, 6, 3, "#2c3236");
          R(6, 6, 3, 1, "#46525a");
        }
        break;
      }
      case "reel": {
        // Zwijacz węża strażackiego
        R(1, 2, 14, 12, "#2c3236");
        R(2, 3, 12, 10, "#7a2e28");
        R(4, 5, 8, 6, "#b3463a");
        R(6, 7, 4, 2, "#7a2e28");
        R(7, 8, 2, 1, "#d8d2c4");
        R(2, 3, 12, 1, "#8a949e");
        R(12, 11, 2, 2, "#8a949e");
        break;
      }
      case "intercom": {
        // Domofon z pulsującą diodą
        R(4, 1, 8, 13, "#4a545a");
        R(5, 2, 6, 11, "#8a949e");
        R(6, 3, 4, 3, "#2c3236");
        R(6, 7, 4, 3, "#2c3236");
        R(6, 11, 2, 1, Math.sin(this.time * 3) > 0 ? "#7fe08c" : "#3b6b42");
        R(9, 11, 1, 1, "#c3cec6");
        break;
      }
      case "drip": {
        // Rura z kapiącą wodą i śladem na podłodze
        R(5, 0, 5, 7, "#5d676d");
        R(5, 0, 5, 1, "#8a949e");
        R(6, 7, 3, 1, "#454e56");
        const phase = (this.time * 0.75 + sx * 0.11) % 1;
        R(6, Math.round(8 + phase * 5), 2, 2, "#7aa8c8");
        if (phase > 0.82) {
          R(4, 13, 3, 1, "#5e86a4");
          R(8, 13, 3, 1, "#5e86a4");
          R(6, 14, 3, 1, "#8fb6cf");
        }
        R(2, 12, 2, 2, "#3c4a52");
        break;
      }
      case "exitsign": {
        // Podświetlany znak wyjścia — zielona poświata w ciemności
        R(1, 4, 14, 7, "#1d2a24");
        R(2, 5, 12, 5, "#2f5c46");
        R(3, 6, 3, 3, "#7fe0a4");
        R(7, 7, 5, 1, "#a8f0c0");
        R(6, 6, 1, 3, "#7fe0a4");
        const blink = Math.sin(this.time * 2 + sx * 0.2) > -0.2;
        if (blink) {
          R(2, 5, 12, 1, "#c8ffe0");
          R(4, 9, 8, 1, "#4e8f70");
        }
        R(1, 3, 14, 1, "#0e1613");
        break;
      }
      case "sconce": {
        // Kinkiet ścienny z ciepłym kloszem
        R(5, 3, 6, 2, "#3a322a");
        R(4, 5, 8, 5, "#5a4a34");
        R(5, 6, 6, 3, "#e8c07a");
        R(6, 7, 4, 1, "#fff0c0");
        R(6, 10, 4, 1, "#2c2620");
        R(7, 11, 2, 3, "#4a4038");
        break;
      }
      case "thermostat": {
        // Termostat grzejnika z odczytem temperatury
        R(4, 2, 8, 8, "#d8d3c9");
        R(5, 3, 6, 6, "#f0ede4");
        R(6, 4, 4, 2, "#8a949e");
        R(7, 7, 2, 1, "#c43830");
        R(6, 8, 4, 1, "#9a948a");
        R(7, 10, 2, 2, "#8a949e");
        R(5, 1, 6, 1, "#b8b2a6");
        break;
      }
      case "ventgrate": {
        // Krata wentylacyjna z pionowymi żaluzjami
        R(3, 2, 10, 12, "#2c3336");
        R(4, 3, 8, 10, "#4a5457");
        for (let x = 5; x < 12; x += 2) R(x, 3, 1, 10, "#6e7a7e");
        R(4, 3, 8, 1, "#8a949e");
        R(4, 12, 8, 1, "#232a2d");
        if (Math.sin(this.time * 1.4 + sx * 0.4) > 0.6) R(7, 5, 2, 6, "rgba(140,190,200,0.35)");
        break;
      }
      case "shelfbracket": {
        // Wspornik półki
        R(2, 11, 12, 2, "#6b5a48");
        R(2, 11, 12, 1, "#a08a68");
        R(3, 12, 10, 1, "#8f7a5e");
        R(4, 13, 2, 2, "#3c342c");
        R(10, 13, 2, 2, "#3c342c");
        break;
      }
      case "conduit": {
        // Listwa elektryczna biegnąca po ścianie
        R(2, 0, 3, 16, "#4a5457");
        R(3, 0, 1, 16, "#6e7a7e");
        R(2, 4, 3, 1, "#2c3336");
        R(2, 11, 3, 1, "#2c3336");
        R(1, 7, 5, 3, "#5c6a6e");
        R(2, 8, 3, 1, "#c43830");
        R(9, 2, 2, 12, "#3c4548");
        R(10, 2, 1, 12, "#59656a");
        break;
      }
      case "hole":
        // Zniszczona ściana: odsłonięte cegły, wyrwa w tynku i ciemna szczelina
        R(2, 3, 11, 9, "#6e665c");
        R(3, 4, 9, 7, "#6b3e30");
        R(4, 6, 6, 4, "#1e1a18");
        R(3, 5, 3, 1, "#8a4838");
        R(7, 8, 4, 1, "#8a4838");
        R(5, 13, 6, 2, "#8c8174");
        break;
    }
  }

  private drawSurvivor(ctx: CanvasRenderingContext2D, s: LiveSurvivor, camX: number, camY: number) {
    const spr =
      s.state === "flee"
        ? this.art.npcRun[s.variant % 2][Math.floor(s.animT * 10) % 2]
        : this.art.npcCrouch[s.variant % 2];
    const sx = Math.round(s.x - camX - spr.width / 2);
    const sy = Math.round(s.y - camY - spr.height / 2 - 2);
    const fade = s.state === "flee" ? Math.max(0, 1 - s.fleeT / 3.2) : 1;
    ctx.globalAlpha = fade;
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fillRect(sx + 4, sy + spr.height - 3, 10, 2);
    ctx.drawImage(spr, sx, sy);
    if (s.state === "hide") {
      // delikatna obwódka i dymek szeptu nad ukrytą osobą
      const pulse = 0.55 + 0.45 * Math.sin(this.time * 5 + s.id);
      ctx.strokeStyle = "#7aa8a4";
      ctx.globalAlpha = 0.65 * pulse;
      ctx.strokeRect(sx + 0.5, sy + 2.5, spr.width - 1, spr.height - 3);
      ctx.globalAlpha = 1;
      const by = sy - 7 + Math.round(Math.sin(this.time * 4) * 1);
      ctx.fillStyle = "rgba(16,14,12,0.88)";
      ctx.fillRect(sx + 2, by, 13, 6);
      ctx.fillStyle = COL.fluor;
      ctx.fillRect(sx + 4, by + 2, 2, 2);
      ctx.fillRect(sx + 8, by + 2, 2, 2);
      ctx.fillRect(sx + 12, by + 2, 1, 2);
    } else if (s.state === "flee" && s.fleeT < 1.3) {
      ctx.font = "bold 7px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#e4dcc8";
      ctx.fillText("Dzięki!", Math.round(s.x - camX), sy - 2);
    }
    ctx.globalAlpha = 1;
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    if (this.director?.hidden) return;
    const x = this.px - camX;
    const y = this.py - camY;
    const st = {
      dir: this.dir,
      aim: this.aim,
      phase: this.animT,
      moving: this.moving && !this.dead,
      sprint: this.sprinting,
      t: this.time,
      weapon: this.weapon,
      recoil: this.recoil,
      reload: this.reloadT > 0 ? Math.max(0.01, 1 - this.reloadT / this.reloadMax) : 0,
      melee: this.meleeT > 0 ? 1 - this.meleeT / this.meleeDur : -1,
      flash: this.flashT,
      hurt: this.hurt,
      pushing: !!this.environment?.working,
    };
    if (this.grabbedBy !== null) {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y) + 7);
      ctx.rotate(Math.PI * 0.42);
      this.rig.draw(ctx, 0, -7, st);
      ctx.restore();
      return;
    }
    if (this.dead) {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y) + 8);
      ctx.rotate((Math.min(1, this.deadT / 0.4) * Math.PI) / 2);
      this.rig.draw(ctx, 0, -8, st);
      ctx.restore();
      return;
    }
    this.rig.draw(ctx, x, y, st);
  }

  private drawZombie(ctx: CanvasRenderingContext2D, z: Zombie, camX: number, camY: number) {
    if (z.kind === "crawler") {
      drawCrawler(ctx, Math.round(z.x - camX), Math.round(z.y - camY), z.animT, z.state === "dead", z.downT, z.hurtFlash > 0, z.dir === "left");
      return;
    }
    if (z.downT > 0 && z.state !== "dead") {
      const sx = Math.round(z.x - camX), sy = Math.round(z.y - camY);
      const spr = this.art.zombie[z.kind][z.dir][Math.floor(z.animT * 5) % 4];
      ctx.save();
      ctx.translate(sx, sy + 7);
      ctx.rotate((z.dir === "left" ? -1 : 1) * Math.PI / 2 * Math.min(1, z.downT / 0.5));
      ctx.drawImage(spr, -spr.width / 2, -spr.height + 5);
      ctx.restore();
      if (z.hp < z.maxHp) {
        ctx.fillStyle = COL.ink; ctx.fillRect(sx - 7, sy - 7, 14, 2);
        ctx.fillStyle = COL.bloodBright; ctx.fillRect(sx - 7, sy - 7, Math.max(1, Math.round(14 * z.hp / z.maxHp)), 2);
      }
      return;
    }
    const sc = z.kind === "boss" ? 2 : 1;
    const falling = z.state === "dead" && z.deadT < 0.32;
    const spr =
      z.state === "dead" && !falling
        ? this.art.corpse[z.kind]
        : this.art.zombie[z.kind][z.dir][Math.floor(z.animT * (z.kind === "runner" ? 10 : z.kind === "boss" ? 4 : 5.5)) % 4];
    const dw = spr.width * sc;
    const dh = spr.height * sc;
    let ox = 0;
    let oy = 0;
    if (z.state !== "dead") {
      const lunge = z.attackCd > z.attackEvery - 0.16 ? 3 * sc : 0;
      const a = Math.atan2(this.py - z.y, this.px - z.x);
      ox = Math.round(Math.cos(a) * lunge + (z.state === "idle" ? Math.sin(z.animT * (z.kind === "boss" ? 1.1 : 1.7)) : 0));
      oy = Math.round(Math.sin(a) * lunge);
    }
    const sx = Math.round(z.x - camX - dw / 2) + ox;
    const sy = Math.round(z.y - camY - dh / 2 - (z.state === "dead" && !falling ? 0 : 2 * sc)) + oy;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(sx + 3 * sc, sy + dh - 3, Math.max(4, dw - 6 * sc), 3);
    if (falling) {
      ctx.save();
      ctx.translate(sx + dw / 2, sy + dh - 2);
      ctx.rotate((z.deadT / 0.32) * (Math.PI / 2) * (z.dir === "left" ? -1 : 1));
      ctx.drawImage(spr, -dw / 2, -dh + 2, dw, dh);
      ctx.restore();
      return;
    }
    if (z.hurtFlash > 0) ctx.globalAlpha = 0.55;
    ctx.drawImage(spr, sx, sy, dw, dh);
    ctx.globalAlpha = 1;
    if (z.state === "dead") {
      ctx.fillStyle = COL.ink;
      for (let i = 0; i < 2; i++) {
        ctx.fillRect(
          Math.round(z.x - camX + Math.cos(this.time * 5 + i * 3 + z.x) * 7),
          Math.round(z.y - camY - 4 + Math.sin(this.time * 7 + i * 2) * 3),
          1,
          1,
        );
      }
    }
    if (z.state !== "dead" && z.hp < z.maxHp) {
      ctx.fillStyle = COL.ink;
      ctx.fillRect(sx + 3, sy - 3, 14, 2);
      ctx.fillStyle = COL.bloodBright;
      ctx.fillRect(sx + 3, sy - 3, Math.max(1, Math.round(14 * (z.hp / z.maxHp))), 2);
    }
    if (z.alertMark > 0.2) {
      ctx.fillStyle = COL.fluor;
      ctx.fillRect(sx + 8 * sc, sy - 9 * sc, 2, 4);
      ctx.fillRect(sx + 8 * sc, sy - 4 * sc, 2, 1);
    }
  }

  private drawHeli(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    const hx = Math.round(this.heliPos.x - camX);
    const hy = Math.round(this.heliPos.y - camY - this.heliPos.h);
    const bob = this.heliPhase === "landed" ? 0 : Math.round(Math.sin(this.time * 7) * 1.5);
    const gy = Math.round(this.heliPos.y - camY + 10);
    // cień na dachu
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(hx - 20, gy, 40, 4);
    ctx.fillRect(hx - 14, gy + 4, 28, 2);
    const y = hy + bob;
    // belka ogonowa + statecznik
    ctx.fillStyle = "#3a4030";
    ctx.fillRect(hx + 10, y - 2, 22, 3);
    ctx.fillRect(hx + 30, y - 7, 3, 9);
    ctx.fillStyle = "#565e46";
    ctx.fillRect(hx + 10, y - 2, 22, 1);
    // wirnik ogonowy
    const tr = Math.floor(this.time * 40) % 2;
    ctx.fillStyle = "#181a14";
    if (tr) {
      ctx.fillRect(hx + 31, y - 9, 1, 13);
    } else {
      ctx.fillRect(hx + 29, y - 4, 5, 2);
    }
    // kadłub
    ctx.fillStyle = "#4a5238";
    ctx.fillRect(hx - 14, y - 6, 26, 10);
    ctx.fillStyle = "#5c6648";
    ctx.fillRect(hx - 14, y - 6, 26, 3);
    ctx.fillStyle = "#333a28";
    ctx.fillRect(hx - 14, y + 2, 26, 2);
    // kabina pilota (szyba)
    ctx.fillStyle = "#3e8a86";
    ctx.fillRect(hx - 14, y - 4, 7, 6);
    ctx.fillStyle = "#7aa8a4";
    ctx.fillRect(hx - 13, y - 3, 3, 2);
    // pas boczny
    ctx.fillStyle = "#cbb89a";
    ctx.fillRect(hx - 6, y - 1, 16, 2);
    // płozy
    ctx.fillStyle = "#22241e";
    ctx.fillRect(hx - 16, y + 6, 30, 1);
    ctx.fillRect(hx - 10, y + 4, 2, 2);
    ctx.fillRect(hx + 6, y + 4, 2, 2);
    // maszt + wirnik główny
    ctx.fillRect(hx - 1, y - 9, 2, 3);
    const spin = Math.sin(this.time * 42);
    const rw = Math.max(6, Math.round(26 * Math.abs(spin)));
    ctx.fillStyle = "#181a14";
    ctx.fillRect(hx - rw, y - 10, rw * 2, 1);
    if (Math.abs(spin) < 0.5) {
      ctx.fillStyle = "rgba(200,205,190,0.35)";
      ctx.fillRect(hx - 24, y - 10, 48, 1);
    }
    // migający czerwony beacon
    if (Math.sin(this.time * 8) > 0.4) {
      ctx.fillStyle = "#ff3830";
      ctx.fillRect(hx + 11, y - 7, 2, 2);
      ctx.fillStyle = "rgba(255,56,48,0.3)";
      ctx.fillRect(hx + 9, y - 9, 6, 6);
    }
    // snop reflektora w dół
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = this.heliPhase === "landed" ? "rgba(240,244,255,0.16)" : "rgba(240,244,255,0.09)";
    const bw = this.heliPhase === "landed" ? 26 : 16;
    ctx.fillRect(hx - 4, y + 7, 8, gy - y - 7);
    ctx.fillRect(hx - bw / 2, gy - 4, bw, 6);
    ctx.restore();
  }

  private drawMarker(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    const goal = this.goalTile();
    if (!goal) return;
    const d = this.data();
    const isKey = d.locked && d.doors.some((door) => door.locked) && !this.hasKey && d.keyPropId != null;
    const label = d.theme === "roof" ? (this.bossKilled ? "FLARA" : "WIELKI") : isKey ? "KLUCZ" : "SCHODY";
    const col = d.theme === "roof" ? "#ff5848" : isKey ? "#ffcf48" : COL.fluor;

    const wx = (goal.x + 0.5) * TILE;
    const wy = (goal.y + 0.5) * TILE;
    const distM = Math.max(1, Math.round(Math.hypot(wx - this.px, wy - this.py) / TILE));
    const ang = Math.atan2(wy - this.py, wx - this.px);
    const bob = Math.sin(this.time * 6) * 2.2;

    // 1. Subtelny łuk kompasowy przy stopach gracza wskazujący kierunek marszu
    if (distM > 3) {
      const psx = this.px - camX;
      const psy = this.py - camY;
      const rx = psx + Math.cos(ang) * 20;
      const ry = psy + Math.sin(ang) * 20;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(ang);
      ctx.fillStyle = COL.ink;
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(-3, -4);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-3, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(-2, -3);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-2, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 2. Główny wskaźnik: nad celem na ekranie lub przy krawędzi ekranu z wyraźną strzałką i dystansem
    let sx = wx - camX;
    let sy = wy - camY - 14 + bob;
    const padX = 28;
    const padY = 26;
    const offscreen = sx < padX || sy < padY || sx > this.viewW - padX || sy > this.viewH - padY;

    if (offscreen) {
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      let t = 1e9;
      if (dx !== 0) t = Math.min(t, (this.viewW / 2 - padX) / Math.abs(dx));
      if (dy !== 0) t = Math.min(t, (this.viewH / 2 - padY) / Math.abs(dy));
      sx = this.viewW / 2 + dx * t + dx * bob;
      sy = this.viewH / 2 + dy * t + dy * bob;

      // Duży grot strzałki obrócony w stronę celu
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ang);
      ctx.fillStyle = COL.ink;
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-6, -7);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, -5);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COL.white;
      ctx.fillRect(1, -1, 3, 2);
      ctx.restore();

      // Plakietka z nazwą celu i odległością
      const tag = `${label} ${distM}m`;
      ctx.save();
      ctx.font = "bold 7px monospace";
      ctx.textAlign = "center";
      const tw = Math.ceil(ctx.measureText(tag).width) + 6;
      const lx = Math.max(tw / 2 + 4, Math.min(this.viewW - tw / 2 - 4, sx - Math.cos(ang) * 14));
      const ly = Math.max(12, Math.min(this.viewH - 6, sy - Math.sin(ang) * 12 + 11));
      ctx.fillStyle = "rgba(12,10,8,0.9)";
      ctx.fillRect(Math.round(lx - tw / 2), Math.round(ly - 7), tw, 9);
      ctx.strokeStyle = col;
      ctx.strokeRect(Math.round(lx - tw / 2) + 0.5, Math.round(ly - 7) + 0.5, tw - 1, 8);
      ctx.fillStyle = col;
      ctx.fillText(tag, Math.round(lx), Math.round(ly));
      ctx.restore();
    } else {
      // Strzałka wskazująca w dół prosto na cel w zasięgu ekranu
      const rx = Math.round(sx);
      const ry = Math.round(sy);
      ctx.fillStyle = COL.ink;
      ctx.beginPath();
      ctx.moveTo(rx, ry + 7);
      ctx.lineTo(rx - 6, ry - 4);
      ctx.lineTo(rx + 6, ry - 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(rx, ry + 5);
      ctx.lineTo(rx - 4, ry - 3);
      ctx.lineTo(rx + 4, ry - 3);
      ctx.closePath();
      ctx.fill();
      ctx.font = "bold 7px monospace";
      ctx.textAlign = "center";
      const tw = Math.ceil(ctx.measureText(label).width) + 6;
      ctx.fillStyle = "rgba(12,10,8,0.9)";
      ctx.fillRect(rx - Math.floor(tw / 2), ry - 13, tw, 8);
      ctx.fillStyle = col;
      ctx.fillText(label, rx, ry - 7);
    }
  }

  private drawMinimap(ctx: CanvasRenderingContext2D) {
    if (!this.floor) return;
    const d = this.data();
    const ms = 1;
    const mw = d.w * ms;
    const mh = d.h * ms;
    const pad = 4;
    const header = 10;
    const legend = 20;
    const frameW = mw + pad * 2;
    const frameH = mh + header + legend + pad * 2;
    const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    const cssScale = this.canvas.getBoundingClientRect().height / this.viewH || 1;
    const bottom = coarse ? Math.ceil(122 / cssScale) : 7;
    const left = this.viewW - frameW - 7;
    const top = Math.max(8, this.viewH - frameH - bottom);
    const ox = left + pad;
    const oy = top + header + pad;

    ctx.save();
    ctx.fillStyle = "rgba(9, 14, 18, 0.88)";
    ctx.fillRect(left, top, frameW, frameH);
    ctx.strokeStyle = "#566063";
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, frameW - 1, frameH - 1);
    ctx.fillStyle = "#d6d0bc";
    ctx.font = 'bold 5px "IBM Plex Mono", monospace';
    ctx.textAlign = "left";
    ctx.fillText("MAPA", left + pad, top + 7);
    ctx.fillStyle = "#90a09f";
    ctx.textAlign = "right";
    ctx.fillText(d.index === 0 ? "−1" : d.index === 10 ? "DACH" : String(d.index - 1), left + frameW - pad, top + 7);
    ctx.textAlign = "left";
    ctx.fillStyle = "#29343a";
    ctx.fillRect(left + pad, top + header, mw, 1);

    const floorColors = ["#7a715e", "#728c87", "#838474", "#6f7977", "#6f5b53", "#697c68", "#718797", "#826d61"];
    const rememberedColors = ["#514d44", "#506360", "#595f57", "#4e595a", "#4d4541", "#48574b", "#506272", "#594d49"];
    // The explored floor is rendered at one game pixel per tile; the camera scale stays unchanged.
    for (let y = 0; y < d.h; y++) {
      for (let x = 0; x < d.w; x++) {
        const i = this.idx(x, y);
        if (!this.floor.explored[i]) continue;
        const t = d.tiles[i];
        const style = d.floorStyle[i] ?? 0;
        let col = this.vis[i] ? floorColors[style] ?? "#7b877e" : rememberedColors[style] ?? "#53605e";
        if (t === 0) col = "#303b3e";
        else if (t === 6) col = "#57707a";
        else if (t === 2) col = this.doorAt(x, y)?.sealed ? "#49413b" : "#c3985a";
        else if (t === 3) col = "#9a8666";
        else if (t === 9) col = "#131b24";
        else if (t === 8) col = "#50748a";
        else if (t === 7) col = "#776b5a";
        else if (t === Tile.Hole) col = "#2a211e";
        ctx.fillStyle = col;
        ctx.fillRect(ox + x * ms, oy + y * ms, ms, ms);
      }
    }
    const marker = (tx: number, ty: number, col: string, size = 3) => {
      if (!this.inb(tx, ty)) return;
      ctx.fillStyle = "#090d10";
      ctx.fillRect(ox + tx - 2, oy + ty - 2, size + 2, size + 2);
      ctx.fillStyle = col;
      ctx.fillRect(ox + tx - 1, oy + ty - 1, size, size);
    };
    const dir = this.director;
    // A discovered empty wardrobe is a place to hide; unsearched items remain marked as loot.
    for (const p of d.props) {
      const tx = p.x, ty = p.y;
      if (!this.inb(tx, ty) || !this.floor.explored[this.idx(tx, ty)]) continue;
      if (p.solid) {
        ctx.fillStyle = "#a19c85";
        ctx.fillRect(ox + p.x, oy + p.y, p.w, p.h);
      }
      if ((p.kind === "wardrobe" || p.kind === "locker") && (!p.loot || p.opened)) marker(tx, ty, "#78a9ba", 1);
      if (!p.opened && p.loot && p.id !== d.keyPropId) marker(tx, ty, "#a1bf89", 1);
    }
    if (d.stairsDown && this.floor.explored[this.idx(d.stairsDown.x, d.stairsDown.y)]) marker(d.stairsDown.x, d.stairsDown.y, "#92aeb4", 2);
    for (const { at, color } of this.environment?.markers() ?? []) {
      if (this.floor.explored[this.idx(at.x, at.y)]) marker(at.x, at.y, color, 1);
    }
    const v = d.vertical;
    if (v?.elevator && this.floor.explored[this.idx(v.elevator.outside.x, v.elevator.outside.y)]) {
      marker(v.elevator.door.x, v.elevator.door.y, this.building.elevatorBroken ? "#d96858" : this.building.elevatorPowered ? "#7ad49b" : "#9ba7ad", 2);
    }
    if (v?.service && this.floor.explored[this.idx(v.service.outside.x, v.service.outside.y)]) {
      marker(v.service.door.x, v.service.door.y, "#78c7b7", 2);
    }
    if (v?.stairsB && this.floor.explored[this.idx(v.stairsB.outside.x, v.stairsB.outside.y)]) {
      marker(v.stairsB.door.x, v.stairsB.door.y, "#92aeb4", 2);
    }
    const goal = this.goalTile();
    if (goal) marker(goal.x, goal.y, "#f2c77e", 3);
    if (dir?.camp) marker(Math.floor(dir.camp.x / TILE), Math.floor(dir.camp.y / TILE), "#e8874a", 2);
    if (dir?.alarm) marker(Math.floor(dir.alarm.x / TILE), Math.floor(dir.alarm.y / TILE), "#e56858", 2);
    for (const site of dir?.sites() ?? []) {
      marker(site.x, site.y, site.kind === "cache" ? "#a1bf89" : site.kind === "radio" ? "#78c7b7" : "#e8874a", 2);
    }
    for (const civ of dir?.civilians() ?? []) {
      if (civ.state === "dead" || civ.state === "gone") continue;
      const tx = Math.floor(civ.x / TILE), ty = Math.floor(civ.y / TILE);
      if (this.inb(tx, ty) && this.vis[this.idx(tx, ty)]) marker(tx, ty, civ.faction === "hostile" ? "#e0762e" : "#78c7b7", 1);
    }
    for (const person of this.floor.survivors) {
      if (person.state === "gone") continue;
      const tx = Math.floor(person.x / TILE), ty = Math.floor(person.y / TILE);
      if (this.inb(tx, ty) && this.vis[this.idx(tx, ty)]) marker(tx, ty, "#78c7b7", 1);
    }
    for (const z of this.floor.zombies) {
      if (z.state === "dead") continue;
      const tx = Math.floor(z.x / TILE), ty = Math.floor(z.y / TILE);
      if (this.inb(tx, ty) && this.vis[this.idx(tx, ty)]) marker(tx, ty, "#e26d5c", 1);
    }
    const ptx = Math.floor(this.px / TILE);
    const pty = Math.floor(this.py / TILE);
    marker(ptx, pty, "#f8f3df", 2);
    ctx.fillStyle = "#f8f3df";
    ctx.fillRect(Math.round(ox + ptx + Math.cos(this.aim) * 3), Math.round(oy + pty + Math.sin(this.aim) * 3), 1, 1);

    ctx.font = '5.5px "IBM Plex Mono", monospace';
    const label = (x: number, y: number, color: string, text: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 3, 2, 2);
      ctx.fillStyle = "#bec7c2";
      ctx.fillText(text, x + 4, y);
    };
    label(ox, oy + mh + 6, "#f2c77e", "CEL");
    label(ox + 22, oy + mh + 6, "#a1bf89", "ZAPASY");
    label(ox, oy + mh + 12, "#e26d5c", "ZOMBIE");
    label(ox + 29, oy + mh + 12, "#78c7b7", "LUDZIE");
    label(ox, oy + mh + 18, "#78a9ba", "SZAFA");
    label(ox + 29, oy + mh + 18, "#e8874a", "OBÓZ");
    ctx.restore();
  }
}
