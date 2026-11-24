import type { Theme } from "./palette";
import type { InventoryState, WeaponId } from "./inventory";
import type { EnvironmentPlan } from "./environment-layout";
import type { VerticalFloor } from "./vertical-layout";

export type ZombieKind = "shambler" | "runner" | "brute" | "boss" | "crawler";
export type Loot = WeaponId | "med" | "ammo" | "shells" | "bolts" | "battery" | "key" | "note" | "fuse" | null;
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
  | "toy"
  | "radio"
  | "explosive";

export type Glow = "none" | "fluor" | "orange";

export interface LightFixture {
  x: number;
  y: number;
  kind: "fluor" | "sodium" | "emergency";
  flicker: boolean;
  roomId: number;
  radius: number;
}

export type ApartmentFamily =
  | "kawalerka"
  | "dwupokojowe"
  | "rodzinne"
  | "narozne"
  | "wydluzone"
  | "przebudowane"
  | "zaplecze"
  | "uslugowy";

export type RoomFunctionRole =
  | "public"
  | "entry"
  | "living"
  | "private"
  | "kitchen"
  | "wet"
  | "storage"
  | "tech"
  | "stair";

export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  role: "start" | "stairs" | "normal";
  lit: boolean;
  flicker: boolean;
  apartmentId?: number;
  functionRole?: RoomFunctionRole;
}

export interface ApartmentInfo {
  id: number;
  family: ApartmentFamily;
  label: string;
  roomIds: number[];
  entryDoor: { x: number; y: number };
  secondaryExit?: { x: number; y: number; reason: string; detour: number };
  isBypass: boolean;
  plumbingEdge?: "n" | "s" | "e" | "w";
  bounds: { x: number; y: number; w: number; h: number };
}

export interface CorridorZoneInfo {
  id: number;
  kind: "segment" | "junction" | "lobby" | "landing";
  cells: { x: number; y: number }[];
  center: { x: number; y: number };
  neighbors: number[];
  onMainRoute: boolean;
  eligible: boolean;
  importance: number;
  plannedZombies: number;
  placedZombies: number;
  mode: "empty" | "solo" | "group";
  groupSize: number;
  patrolRoute: { x: number; y: number }[];
  rejectReason?: string;
}

export interface CorridorPopulationReport {
  floor: number;
  totalZones: number;
  eligibleZones: number;
  occupiedZones: number;
  occupancyRate: number;
  targetRate: number;
  plannedCorridor: number;
  placedCorridor: number;
  roomZombies: number;
  totalInitial: number;
  soloPatrols: number;
  groupPatrols: number;
  groupMembers: number;
  longestEmptyRun: number;
  mainRouteCovered: number;
  mainRouteEligible: number;
  populationCap: number;
  waveHeadroom: number;
  rejections: string[];
  zones: CorridorZoneInfo[];
}

export interface PropAccessPoint {
  propId: number;
  kind: PropKind;
  x: number;
  y: number;
  ax: number;
  ay: number;
  role: "hide" | "device" | "loot" | "furniture";
}

export interface LayoutQualityReport {
  repairsApplied: number;
  apartments: number;
  apartmentFamilies: Record<string, number>;
  publicEntryDoors: number;
  internalDoors: number;
  bypassDoors: number;
  barricadedDoors: number;
  duplicateRoomPairDoors: number;
  closeSameRoomDoors: number;
  closeJustifiedPairs: number;
  blockedThresholds: number;
  roomsFurnished: number;
  wardrobesAccessible: number;
  wardrobesTotal: number;
  devicesTotal: number;
  devicesWallMounted: number;
  devicesAccessible: number;
  lootAccessible: number;
  lootTotal: number;
  bypassApartments: number;
  validBypassRoutes: number;
  breachesCount: number;
  damageCells: number;
  issues: string[];
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

export type DoorKind = "entry" | "internal" | "bypass" | "service" | "stair" | "shaft" | "annex";

export interface DoorInfo {
  x: number;
  y: number;
  locked: boolean;
  sealed?: boolean;
  barricaded?: boolean;
  hp: number;
  open: boolean;
  broken: boolean;
  route?: "elevator" | "service" | "stairsB";
  kind?: DoorKind;
  rooms?: [number, number];
  reason?: string;
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
  role?: "corridor-solo" | "corridor-group" | "room" | "crawler" | "lure" | "guard" | "boss";
  patrolZone?: number;
  patrol?: { x: number; y: number }[];
  groupId?: number;
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
  environment?: EnvironmentPlan;
  vertical?: VerticalFloor;
  apartments?: ApartmentInfo[];
  corridorReport?: CorridorPopulationReport;
  qualityReport?: LayoutQualityReport;
  propAccess?: PropAccessPoint[];
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
  quest: { title: string; step: string } | null;
  journal: string[];
  message: string;
  prompt: string;
  environment: { label: string; hold: boolean; progress: number; active: boolean } | null;
  hurt: number;
  lowHp: boolean;
  reloading: number;
  flare: number;
  banner: string;
  bannerSub: string;
  seed: number;
  noise: number;
  noiseLevel: number;
  noiseLabel: string;
  arousal: number;
  grapple: { count: number; required: number } | null;
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
