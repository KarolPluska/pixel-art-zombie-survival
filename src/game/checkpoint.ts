import type { EnvironmentState, FeatureState } from "./environment";
import { isWeapon, type InventoryState } from "./inventory";
import { FLOOR_COUNT, MAP_H, MAP_W, TILE } from "./palette";
import type { DoorInfo, ZombieKind } from "./types";
import type { BuildingState, FloorQuestState } from "./vertical-layout";
import type { TacticalState } from "./tactical";

export const CHECKPOINT_KEY = "blok7-checkpoint";
export const CHECKPOINT_VERSION = 3;

export interface SavedZombie {
  x: number;
  y: number;
  hp: number;
  home: number;
  kind: ZombieKind;
  state: "idle" | "chase" | "dead";
  alertT: number;
  lastX: number;
  lastY: number;
  screamer: boolean;
  reinforcement: boolean;
  missionTag?: "lure";
  downT?: number;
  bisected?: boolean;
  seenWardrobe?: { x: number; y: number } | null;
}

export interface SavedFloor {
  layout: number;
  hasKey: boolean;
  environment: EnvironmentState;
  explored: string;
  opened: number[];
  survivorsGone: number[];
  doors: DoorInfo[];
  zombies: SavedZombie[];
  tactical?: TacticalState;
}

export interface RunCheckpoint {
  version: typeof CHECKPOINT_VERSION;
  generatorVersion?: 1 | 2;
  seed: number;
  floor: number;
  time: number;
  kills: number;
  hero: { x: number; y: number; hp: number; stamina: number; battery: number; flash: boolean };
  pack: InventoryState;
  bossKilled: boolean;
  building: BuildingState;
  floors: (SavedFloor | null)[];
}

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const number = (v: unknown, min = 0, max = Infinity): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min = 0, max = Infinity): v is number => number(v, min, max) && Number.isInteger(v);
const bool = (v: unknown): v is boolean => typeof v === "boolean";
const stage: FeatureState["stage"][] = ["idle", "warning", "settled", "venting"];

function environment(v: unknown): v is EnvironmentState {
  return record(v) && number(v.clock) && record(v.features) && Object.values(v.features).every((f) =>
    record(f) && stage.some((s) => s === f.stage) && number(f.since) && number(f.progress, 0, 1) && bool(f.off));
}

function inventory(v: unknown): v is InventoryState {
  if (!record(v) || !Array.isArray(v.owned) || !Array.isArray(v.slots) || v.slots.length !== 3 || !integer(v.active, 0, 2)) return false;
  const slots: unknown[] = v.slots, owned: unknown[] = v.owned;
  return !!slots[v.active] && owned.every(isWeapon) && slots.every((id) => id === null || (isWeapon(id) && owned.includes(id)))
    && new Set(slots.filter(Boolean)).size === slots.filter(Boolean).length
    && record(v.magazines) && owned.every((id) => isWeapon(id) && record(v.magazines) && integer(v.magazines[id]))
    && record(v.stock) && integer(v.stock.rounds) && integer(v.stock.shells) && integer(v.stock.bolts);
}

function position(v: Record<string, unknown>) {
  return number(v.x, 0, MAP_W * TILE) && number(v.y, 0, MAP_H * TILE);
}

function savedFloor(v: unknown): v is SavedFloor {
  if (!record(v) || !integer(v.layout, 0, 0xffffffff) || !bool(v.hasKey) || !environment(v.environment)) return false;
  return typeof v.explored === "string" && v.explored.length === MAP_W * MAP_H && /^[01]+$/.test(v.explored)
    && Array.isArray(v.opened) && v.opened.every((id) => integer(id))
    && Array.isArray(v.survivorsGone) && v.survivorsGone.every((id) => integer(id))
    && Array.isArray(v.doors) && v.doors.every((d) => record(d) && integer(d.x, 0, MAP_W - 1) && integer(d.y, 0, MAP_H - 1)
      && bool(d.open) && bool(d.broken) && bool(d.locked) && number(d.hp, -20, 20))
    && (v.tactical === undefined || tactical(v.tactical))
    && Array.isArray(v.zombies) && v.zombies.every((z) => record(z) && position(z) && number(z.hp) && integer(z.home, -1)
      && ["idle", "chase", "dead"].includes(String(z.state)) && ["shambler", "runner", "brute", "boss", "crawler"].includes(String(z.kind))
      && bool(z.screamer) && bool(z.reinforcement) && number(z.alertT, -100) && number(z.lastX) && number(z.lastY));
}

function tactical(v: unknown): v is TacticalState {
  return record(v) && number(v.clock) && number(v.playerNoise, 0, 100) && number(v.arousal, 0, 100)
    && number(v.waveBudget, 0, 6) && number(v.nextRoll) && number(v.lastWave, -100) && integer(v.waveCount)
    && Array.isArray(v.events) && record(v.devices) && record(v.barrels)
    && Object.values(v.devices).every((d) => record(d) && bool(d.on) && number(d.x) && number(d.y) && (d.kind === "radio" || d.kind === "tv"))
    && Object.values(v.barrels).every((b) => record(b) && ["idle", "warning", "spent"].includes(String(b.stage)) && number(b.fuse, -0.001));
}

function floorQuest(v: unknown): v is FloorQuestState {
  return record(v)
    && integer(v.stage, 0, 10)
    && bool(v.inspected)
    && bool(v.fuseTaken)
    && bool(v.codeFound)
    && bool(v.serviceUnlocked)
    && bool(v.serviceForced)
    && bool(v.lureUsed)
    && bool(v.lureResolved)
    && number(v.bypassProgress, 0, 1)
    && bool(v.bypassOpen)
    && bool(v.landingBypassOpen)
    && bool(v.landingStashOpened)
    && bool(v.resolved);
}

function building(v: unknown): v is BuildingState {
  if (!record(v)
    || !bool(v.elevatorPowered)
    || !bool(v.elevatorEmergencyOnly)
    || !integer(v.elevatorFloor, 0, FLOOR_COUNT - 1)
    || !(v.elevatorOpenFloor === null || integer(v.elevatorOpenFloor, 0, FLOOR_COUNT - 1))
    || !bool(v.elevatorBroken)
    || !bool(v.elevatorFaultUsed)
    || !integer(v.elevatorSpecialCount, 0, 100)
    || !number(v.elevatorArrival, 0, 30)
    || !integer(v.elevatorCallFloor, -1, FLOOR_COUNT - 1)
    || !integer(v.npcTotal, 0, 1000) || !integer(v.npcDrought, 0, 1000) || !number(v.nextNpcAt)
    || !record(v.quests)
    || !Object.values(v.quests).every(floorQuest)
    || !Array.isArray(v.journal)
    || !v.journal.every((entry) => typeof entry === "string")) return false;
  if (v.elevatorRide !== null) {
    const ride = v.elevatorRide;
    if (!record(ride)
      || !integer(ride.from, 0, FLOOR_COUNT - 1)
      || !integer(ride.to, 0, FLOOR_COUNT - 1)
      || !number(ride.elapsed, 0, 60)
      || !["doors", "accel", "moving", "jolt", "stranded", "escape", "arrive", "stop", "ledge"].includes(String(ride.phase))
      || !["routine", "rattle", "stop", "threat", "mid-shaft", "fault"].includes(String(ride.variant))
      || (ride.kind !== undefined && ride.kind !== "passenger" && ride.kind !== "freight")
      || !number(ride.cabinX, -40, 40)
      || !number(ride.cabinY, -40, 40)
      || !number(ride.doorOpen, 0, 1)
      || !number(ride.leverProgress, 0, 1)) return false;
  }
  if (v.serviceLift !== undefined) {
    const lift = v.serviceLift;
    if (!record(lift) || !integer(lift.floor, 0, FLOOR_COUNT - 1)
      || !(lift.openFloor === null || integer(lift.openFloor, 0, FLOOR_COUNT - 1))
      || !number(lift.arrival, 0, 30) || !integer(lift.callFloor, -1, FLOOR_COUNT - 1)) return false;
  }
  if (v.passage !== null) {
    const p = v.passage;
    if (!record(p)
      || !integer(p.from, 0, FLOOR_COUNT - 1)
      || !integer(p.to, 0, FLOOR_COUNT - 1)
      || !["stairsA", "stairsB", "service", "ledge"].includes(String(p.route))
      || !number(p.x, -100, 300)
      || !number(p.y, -100, 300)
      || !["empty", "window", "stash", "obstacle", "traces", "broken-flight"].includes(String(p.feature))
      || !bool(p.stashLooted)
      || !number(p.bypassProgress, 0, 1)
      || !bool(p.bypassOpen)
      || !bool(p.soundPlayed)) return false;
  }
  return true;
}

export function parseCheckpoint(text: string | null): RunCheckpoint | null {
  if (!text) return null;
  try {
    const v: unknown = JSON.parse(text);
    if (!record(v) || v.version !== CHECKPOINT_VERSION || (v.generatorVersion !== undefined && v.generatorVersion !== 1 && v.generatorVersion !== 2)
      || !integer(v.seed, 0, 0xffffffff) || !integer(v.floor, 0, FLOOR_COUNT - 1)) return null;
    if (!number(v.time) || !integer(v.kills) || !bool(v.bossKilled) || !inventory(v.pack) || !building(v.building)) return null;
    if (!record(v.hero) || !position(v.hero) || !number(v.hero.hp, 1, 100) || !number(v.hero.stamina, 0, 100)
      || !number(v.hero.battery, 0, 100) || !bool(v.hero.flash)) return null;
    if (!Array.isArray(v.floors) || v.floors.length !== FLOOR_COUNT || !v.floors.every((f) => f === null || savedFloor(f)) || !v.floors[v.floor]) return null;
    return v as unknown as RunCheckpoint;
  } catch {
    return null;
  }
}
