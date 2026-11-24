import type { Theme } from "./palette";
import type { InventoryState, WeaponId } from "./inventory";

export type ZombieKind = "shambler" | "runner" | "brute" | "boss";
export type Loot = WeaponId | "med" | "ammo" | "shells" | "bolts" | "battery" | "key" | "note" | null;
export type PropKind =
  | "bed"
  | "sofa"
  | "table"
  | "wardrobe"
  | "crate"
  | "fridge"
  | "mailbox"
  | "chair"
  | "pipes"
  | "vent"
  | "flare"
  | "desk"
  | "barrel"
  | "tv"
  | "radiator"
  | "sink"
  | "trash"
  | "carpet"
  | "stove"
  | "toilet"
  | "bathtub"
  | "bookshelf"
  | "plant"
  | "board"
  | "washer"
  | "locker"
  | "bike"
  | "bench"
  | "extinguisher"
  | "counter"
  | "shower"
  | "antenna"
  | "watertank"
  | "satellite"
  | "medbox"
  | "supplycase"
  | "toy";

export type Glow = "none" | "fluor" | "orange";

export interface LightFixture {
  x: number;
  y: number;
  kind: "fluor" | "sodium" | "emergency";
  flicker: boolean;
  roomId: number;
  radius: number;
}

export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  role: "start" | "stairs" | "normal";
  lit: boolean;
  flicker: boolean;
}

export interface Prop {
  id: number;
  kind: PropKind;
  x: number;
  y: number;
  w: number;
  h: number;
  solid: boolean;
  loot: Loot;
  note?: string;
  label?: string;
  opened: boolean;
}

export interface DoorInfo {
  x: number;
  y: number;
  locked: boolean;
  barricaded?: boolean;
  hp: number;
  open: boolean;
  broken: boolean;
}

export interface SurvivorSpawn {
  id: number;
  x: number;
  y: number;
  room: number;
  name: string;
  lines: string[];
  gift: "med" | "ammo" | "battery";
  variant: number;
}

export interface DialogView {
  speaker: string;
  line: string;
  index: number;
  total: number;
  gift: string;
}

export interface ZombieSpawn {
  x: number;
  y: number;
  kind: ZombieKind;
  room: number;
}

export interface WindowInfo {
  x: number;
  y: number;
  glow: Glow;
}

export interface DecalSpawn {
  x: number;
  y: number;
  kind: "paper" | "stain" | "moss" | "crack" | "cable" | "scorch" | "glass" | "footprint" | "leaf" | "toy" | "pills" | "book" | "cloth";
}

export type WallDecalKind =
  | "poster"
  | "graffiti"
  | "number"
  | "switch"
  | "pipe"
  | "crack"
  | "mold"
  | "scorch"
  | "extinguisher"
  | "fuse"
  | "clock"
  | "elevator"
  | "mirror"
  | "hole"
  | "panel"
  | "reel"
  | "intercom"
  | "drip"
  | "thermostat"
  | "ventgrate"
  | "shelfbracket"
  | "conduit"
  | "exitsign"
  | "sconce"
  | "familyphoto"
  | "calendar"
  | "missingposter"
  | "caution"
  | "emergencylamp"
  | "camera";

export interface WallDecal {
  x: number;
  y: number;
  kind: WallDecalKind;
}

export interface FloorData {
  index: number;
  theme: Theme;
  name: string;
  sub: string;
  seed: number;
  w: number;
  h: number;
  tiles: Uint8Array;
  floorStyle: Uint8Array;
  wallStyle: Uint8Array;
  rooms: Room[];
  roomZones: string[];
  roomOf: Int16Array;
  props: Prop[];
  doors: DoorInfo[];
  zombies: ZombieSpawn[];
  windows: WindowInfo[];
  decals: DecalSpawn[];
  wallDecals: WallDecal[];
  breaches: { x: number; y: number }[];
  corpses: { x: number; y: number; kind: ZombieKind }[];
  survivors: SurvivorSpawn[];
  lights: LightFixture[];
  playerStart: { x: number; y: number };
  stairsUp: { x: number; y: number } | null;
  stairsDown: { x: number; y: number } | null;
  locked: boolean;
  keyPropId: number | null;
  flare: { x: number; y: number } | null;
}

export interface RunStats {
  seed: number;
  time: number;
  kills: number;
  floor: number;
  floors: number;
  hp: number;
  score: number;
  won: boolean;
  best: number;
}

export interface HudState {
  hp: number;
  maxHp: number;
  stamina: number;
  ammo: number;
  reserve: number;
  weapon: WeaponId;
  inventory: InventoryState;
  hasKey: boolean;
  needKey: boolean;
  battery: number;
  flashOn: boolean;
  flashAuto: boolean;
  floorName: string;
  floorSub: string;
  floorIndex: number;
  floorCount: number;
  kills: number;
  time: number;
  objective: string;
  message: string;
  prompt: string;
  hurt: number;
  lowHp: boolean;
  reloading: number;
  flare: number;
  banner: string;
  bannerSub: string;
  seed: number;
  noise: number;
  zombiesLeft: number;
  bossHp: number;
  bossMax: number;
  zoneName: string;
  dialog: DialogView | null;
  extraZombies: number;
  hidden: boolean;
  blackout: number;
  alarm: boolean;
  escort: number;
  event: { title: string; text: string; tone: string } | null;
  choice: { speaker: string; text: string; options: { label: string; enabled: boolean }[] } | null;
}
