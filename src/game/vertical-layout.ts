import { TILE, Tile } from "./palette";
import { makeRng } from "./rng";
import type { FloorData, Room } from "./types";

export interface Cell { x: number; y: number }

export type VerticalQuestKind =
  | "repair-lift"
  | "broken-stairs"
  | "flooded-route"
  | "lure-horde"
  | "service-shaft"
  | "apartment-bypass";

export type ElevatorVariant = "routine" | "rattle" | "stop" | "threat" | "mid-shaft" | "fault";

export type LandingFeatureKind = "empty" | "window" | "stash" | "obstacle" | "traces" | "broken-flight";

export interface LiftLanding {
  room: number;
  cells: Cell[];
  door: Cell;
  call: Cell;
  panel: Cell;
  center: Cell;
  outside: Cell;
  label: string;
}

export interface LadderLanding {
  room: number;
  cells: Cell[];
  door: Cell;
  panel: Cell;
  center: Cell;
  outside: Cell;
  label: string;
}

export interface StairBLanding {
  room: number;
  cells: Cell[];
  door: Cell;
  stairs: Cell;
  center: Cell;
  outside: Cell;
  label: string;
}

export interface VerticalQuestPlan {
  kind: VerticalQuestKind;
  wireId?: number;
  steamId?: number;
  /** Non-blocking interactable tile for picking up fuse / reading code / activating lure / reading plan. */
  clueCell?: Cell;
  clueRoom?: number;
  clueLabel?: string;
  code?: string;
  fuseCell?: Cell;
  fuseRoom?: number;
  beacon?: Cell;
  horde?: Cell[];
  /** For apartment-bypass: an obstacle cell inside the wing leading toward Klatka B. */
  bypassCell?: Cell;
}

export interface VerticalFloor {
  stairwell: string;
  stairsUp: Cell | null;
  stairsDown: Cell | null;
  elevator: LiftLanding | null;
  service: LadderLanding | null;
  stairsB: StairBLanding | null;
  landingFeature: LandingFeatureKind;
  landingHasLoot: boolean;
  landingSoundHint: boolean;
  quest: VerticalQuestPlan | null;
}

export interface LiftRide {
  from: number;
  to: number;
  elapsed: number;
  phase: "doors" | "accel" | "moving" | "jolt" | "stranded" | "escape" | "arrive" | "stop" | "ledge";
  variant: ElevatorVariant;
  kind?: "passenger" | "freight";
  cabinX: number;
  cabinY: number;
  stopFloor?: number;
  doorOpen: number;
  leverProgress: number;
  threatWarned?: boolean;
}

export interface PassageState {
  from: number;
  to: number;
  route: "stairsA" | "stairsB" | "service" | "ledge";
  /** Local coordinates inside the playable intermediate space. */
  x: number;
  y: number;
  feature: LandingFeatureKind;
  stashLooted: boolean;
  bypassProgress: number;
  bypassOpen: boolean;
  soundPlayed: boolean;
}

export interface FloorQuestState {
  stage: number;
  inspected: boolean;
  fuseTaken: boolean;
  codeFound: boolean;
  serviceUnlocked: boolean;
  serviceForced: boolean;
  lureUsed: boolean;
  lureResolved: boolean;
  bypassProgress: number;
  bypassOpen: boolean;
  landingBypassOpen: boolean;
  landingStashOpened: boolean;
  resolved: boolean;
}

export interface BuildingState {
  elevatorPowered: boolean;
  elevatorEmergencyOnly: boolean;
  elevatorFloor: number;
  elevatorOpenFloor: number | null;
  elevatorBroken: boolean;
  elevatorFaultUsed: boolean;
  elevatorSpecialCount: number;
  elevatorArrival: number;
  elevatorCallFloor: number;
  elevatorRide: LiftRide | null;
  passage: PassageState | null;
  serviceLift?: { floor: number; openFloor: number | null; arrival: number; callFloor: number };
  quests: Record<number, FloorQuestState>;
  npcTotal: number;
  npcDrought: number;
  nextNpcAt: number;
  journal: string[];
}

export interface BuildingPlan {
  stairwellName: string;
  floorQuests: Partial<Record<number, VerticalQuestKind>>;
  elevatorStops: number[];
  serviceStops: number[];
  elevatorVariants: Record<number, ElevatorVariant>;
}

/** Fixed building shaft coordinates (consistent across all floors 0..9 and all 4 blueprints). */
export const ELEVATOR_Y = 42; // west margin x=1..2, y=42..44, door x=3, y=43 -> west shaft x=4
export const STAIRS_B_Y = 18; // east margin x=53..54, y=18..20, door x=52, y=19 -> east shaft x=51
export const SERVICE_Y = 34;  // east margin x=53..54, y=34..36, door x=52, y=35 -> east shaft x=51

const PASSABLE = new Set<number>([Tile.Floor, Tile.Rubble, Tile.Puddle, Tile.StairsUp, Tile.StairsDown, Tile.DoorOpen]);
const idx = (f: FloorData, p: Cell) => p.y * f.w + p.x;
const inb = (f: FloorData, p: Cell) => p.x >= 0 && p.y >= 0 && p.x < f.w && p.y < f.h;

export function makeBuildingPlan(seed: number): BuildingPlan {
  const rng = makeRng((seed ^ 0x91d23b) >>> 0);
  const pool: VerticalQuestKind[] = [
    "broken-stairs",
    "flooded-route",
    "lure-horde",
    "service-shaft",
    "apartment-bypass",
  ];
  // Fisher-Yates shuffle deterministically from run seed
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // Interleave rich scenarios with calmer floors (0, 4, 7, 9 are calmer breathers; 1..8 host all 6 unique scenarios).
  // No adjacent floors share the same scenario kind.
  const floorQuests: Partial<Record<number, VerticalQuestKind>> = {
    1: "repair-lift",
    2: pool[0],
    3: pool[1],
    5: pool[2],
    6: pool[3],
    8: pool[4],
  };

  // Most elevator rides are smooth; special variants are rare and capped per run.
  const variants: Record<number, ElevatorVariant> = {};
  for (let fl = 0; fl < 10; fl++) {
    const roll = rng();
    if (roll < 0.14) variants[fl] = "rattle";
    else if (roll < 0.24) variants[fl] = "stop";
    else if (roll < 0.34) variants[fl] = "threat";
    else if (roll < 0.40 && fl >= 3 && fl <= 7) variants[fl] = "mid-shaft";
    else variants[fl] = "routine";
  }

  return {
    stairwellName: "KLATKA A",
    floorQuests,
    elevatorStops: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    serviceStops: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    elevatorVariants: variants,
  };
}

export function defaultFloorQuestState(): FloorQuestState {
  return {
    stage: 0,
    inspected: false,
    fuseTaken: false,
    codeFound: false,
    serviceUnlocked: false,
    serviceForced: false,
    lureUsed: false,
    lureResolved: false,
    bypassProgress: 0,
    bypassOpen: false,
    landingBypassOpen: false,
    landingStashOpened: false,
    resolved: false,
  };
}

export function initialBuildingState(): BuildingState {
  return {
    elevatorPowered: false,
    elevatorEmergencyOnly: true,
    elevatorFloor: 1,
    elevatorOpenFloor: null,
    elevatorBroken: false,
    elevatorFaultUsed: false,
    elevatorSpecialCount: 0,
    elevatorArrival: 0,
    elevatorCallFloor: -1,
    elevatorRide: null,
    passage: null,
    serviceLift: { floor: 0, openFloor: null, arrival: 0, callFloor: -1 },
    quests: {},
    npcTotal: 0,
    npcDrought: 0,
    nextNpcAt: 18,
    journal: [
      "Piwnica: znajdź drogę na wyższe piętra i dotrzyj na dach.",
      "Budynek ma główną Klatkę A, wschodnią Klatkę B, windę w zachodnim szybie i pion serwisowy.",
    ],
  };
}

function carveShaftAlcove(
  f: FloorData,
  side: "west" | "east",
  yTop: number,
  zoneName: string,
  route: "elevator" | "service" | "stairsB",
) {
  const x0 = side === "west" ? 1 : f.w - 3; // 1..2 or 53..54
  const doorX = side === "west" ? 3 : f.w - 4; // 3 or 52
  const outsideX = side === "west" ? 4 : f.w - 5; // 4 or 51 (always on the vertical shaft!)
  const yMid = yTop + 1;

  // Verify the outside tile on the shaft is passable (clear a shaft divider door if one landed exactly on the threshold)
  if (!inb(f, { x: outsideX, y: yMid })) return null;
  const outTile = f.tiles[idx(f, { x: outsideX, y: yMid })];
  if (outTile === Tile.Door) {
    const pairX = side === "west" ? outsideX + 1 : outsideX - 1;
    for (const cx of [outsideX, pairX]) {
      if (f.tiles[idx(f, { x: cx, y: yMid })] === Tile.Door) {
        f.tiles[idx(f, { x: cx, y: yMid })] = Tile.Floor;
        f.doors = f.doors.filter((d) => !(d.x === cx && d.y === yMid));
      }
    }
  } else if (!PASSABLE.has(outTile)) {
    return null;
  }

  // Ensure the alcove area itself is currently outer wall so we never overwrite another room
  for (let y = yTop; y <= yTop + 2; y++) {
    for (let x = x0; x <= x0 + 1; x++) {
      if (!inb(f, { x, y }) || f.tiles[idx(f, { x, y })] !== Tile.Wall) return null;
    }
  }

  const roomId = f.rooms.length;
  const room: Room = {
    id: roomId,
    x: x0,
    y: yTop,
    w: 2,
    h: 3,
    role: "normal",
    lit: route !== "service",
    flicker: route === "elevator",
  };
  f.rooms.push(room);
  f.roomZones.push(zoneName);

  const cells: Cell[] = [];
  for (let y = yTop; y <= yTop + 2; y++) {
    for (let x = x0; x <= x0 + 1; x++) {
      const p = { x, y };
      cells.push(p);
      const i = idx(f, p);
      f.tiles[i] = Tile.Floor;
      f.floorStyle[i] = 3;
      f.roomOf[i] = roomId;
    }
  }

  // Surround perimeter with wall style 3
  for (let y = yTop - 1; y <= yTop + 3; y++) {
    for (let x = x0 - 1; x <= x0 + 2; x++) {
      if (!inb(f, { x, y })) continue;
      const onBorder = x === x0 - 1 || x === x0 + 2 || y === yTop - 1 || y === yTop + 3;
      if (onBorder && f.tiles[idx(f, { x, y })] === Tile.Wall) {
        f.wallStyle[idx(f, { x, y })] = 3;
      }
    }
  }

  const door: Cell = { x: doorX, y: yMid };
  f.tiles[idx(f, door)] = Tile.Door;
  f.floorStyle[idx(f, door)] = 3;
  // Remove any blocking prop on the outside tile
  f.props = f.props.filter((p) => !(outsideX >= p.x && outsideX < p.x + p.w && yMid >= p.y && yMid < p.y + p.h));
  // Remove any door on the outside tile itself that might clash
  f.doors = f.doors.filter((d) => !(d.x === door.x && d.y === door.y));
  f.doors.push({
    x: door.x,
    y: door.y,
    locked: false,
    hp: 6,
    open: route === "stairsB",
    broken: false,
    route,
  });
  if (route === "stairsB") {
    f.tiles[idx(f, door)] = Tile.DoorOpen;
  }

  const center: Cell = { x: side === "west" ? x0 + 1 : x0, y: yMid };
  const panel: Cell = { x: side === "west" ? x0 : x0 + 1, y: yMid };
  const outside: Cell = { x: outsideX, y: yMid };

  return { room: roomId, cells, door, panel, center, outside };
}

/**
 * Carves consistent vertical shafts into the outer building margins BEFORE populateEnvironment.
 * Never blocks any corridor or room; annexes automatically avoid already-carved wall space.
 */
export function installVerticalRoutes(f: FloorData, runSeed?: number) {
  if (f.theme === "roof" || f.index >= 10) return f;
  const rng = makeRng((f.seed ^ 0x5f3759df) >>> 0);
  const plan = makeBuildingPlan(runSeed ?? f.seed);

  const elev = carveShaftAlcove(f, "west", ELEVATOR_Y, "WINDA OSOBOWA", "elevator");
  const serv = carveShaftAlcove(f, "east", SERVICE_Y, "PION TECHNICZNY", "service");
  const stB = carveShaftAlcove(f, "east", STAIRS_B_Y, "KLATKA B", "stairsB");

  if (stB) {
    // Visual stairs tile inside Klatka B
    f.tiles[idx(f, stB.panel)] = Tile.StairsUp;
  }

  const questKind = plan.floorQuests[f.index] ?? null;
  let landingFeature: LandingFeatureKind = rng.pick([
    "empty",
    "window",
    "stash",
    "obstacle",
    "traces",
    "window",
    "empty",
  ]);
  if (questKind === "broken-stairs") landingFeature = "broken-flight";

  f.vertical = {
    stairwell: plan.stairwellName,
    stairsUp: f.stairsUp,
    stairsDown: f.stairsDown,
    elevator: elev
      ? {
          room: elev.room,
          cells: elev.cells,
          door: elev.door,
          call: elev.outside,
          panel: elev.panel,
          center: elev.center,
          outside: elev.outside,
          label: "WINDA OSOBOWA",
        }
      : null,
    service: serv
      ? {
          room: serv.room,
          cells: serv.cells,
          door: serv.door,
          panel: serv.outside,
          center: serv.center,
          outside: serv.outside,
          label: "PION TECHNICZNY",
        }
      : null,
    stairsB: stB
      ? {
          room: stB.room,
          cells: stB.cells,
          door: stB.door,
          stairs: stB.panel,
          center: stB.center,
          outside: stB.outside,
          label: "KLATKA B",
        }
      : null,
    landingFeature,
    landingHasLoot: landingFeature === "stash" || (landingFeature === "traces" && rng.chance(0.65)),
    landingSoundHint: rng.chance(0.55),
    quest: null,
  };
  return f;
}

function openRoomCells(f: FloorData, room: Room, avoid: Set<number>): Cell[] {
  const out: Cell[] = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const p = { x, y };
      const i = idx(f, p);
      if (f.tiles[i] !== Tile.Floor || avoid.has(i)) continue;
      if (f.props.some((pr) => pr.solid && x >= pr.x && x < pr.x + pr.w && y >= pr.y && y < pr.y + pr.h)) continue;
      if (f.zombies.some((z) => Math.floor(z.x / TILE) === x && Math.floor(z.y / TILE) === y)) continue;
      out.push(p);
    }
  }
  return out;
}

function featureOccupied(f: FloorData): Set<number> {
  const set = new Set<number>();
  for (const feat of f.environment?.features ?? []) {
    set.add(idx(f, feat.at));
    if ("control" in feat && feat.control) set.add(idx(f, feat.control));
    if ("cells" in feat) for (const c of feat.cells) set.add(idx(f, c));
    if ("park" in feat) set.add(idx(f, feat.park));
    if ("landing" in feat && !Array.isArray(feat.landing)) set.add(idx(f, feat.landing));
  }
  return set;
}

/**
 * Installs the floor's multi-step scenario AFTER populateEnvironment, using non-blocking
 * interactable nodes and existing validated hazards so safe routes are never broken.
 */
export function installVerticalQuests(f: FloorData, runSeed?: number) {
  if (!f.vertical || !f.environment || f.theme === "roof" || f.index >= 10) return f;
  const plan = makeBuildingPlan(runSeed ?? f.seed);
  const kind = plan.floorQuests[f.index];
  if (!kind) return f;
  const rng = makeRng((f.seed ^ 0x3c87a125) >>> 0);
  const avoid = featureOccupied(f);
  const normalRooms = f.rooms.filter(
    (r) =>
      r.role === "normal" &&
      !["KORYTARZ", "WINDA OSOBOWA", "PION TECHNICZNY", "KLATKA B", "KLATKA SCHODOWA"].includes(f.roomZones[r.id]),
  );

  if (kind === "repair-lift" && f.vertical.elevator) {
    let wire = f.environment.features.find((ft) => ft.kind === "wire" && ft.control);
    if (!wire) {
      const anyWire = f.environment.features.find((ft) => ft.kind === "wire");
      if (anyWire && anyWire.kind === "wire") {
        const wr = f.rooms[anyWire.room];
        const ctrl = wr
          ? openRoomCells(f, wr, avoid).find(
              (c) => Math.abs(c.x - anyWire.at.x) + Math.abs(c.y - anyWire.at.y) >= 2 && Math.abs(c.x - anyWire.at.x) + Math.abs(c.y - anyWire.at.y) <= 5,
            )
          : undefined;
        if (ctrl) {
          anyWire.control = ctrl;
          avoid.add(idx(f, ctrl));
          wire = anyWire;
        }
      }
    }
    const workshop =
      normalRooms.find((r) => f.roomZones[r.id] === "WARSZTAT") ??
      normalRooms.find((r) => f.roomZones[r.id] === "SCHOWEK") ??
      normalRooms[0];
    const fuseRoom = workshop;
    const fuseCell = fuseRoom ? openRoomCells(f, fuseRoom, avoid)[0] : undefined;
    f.vertical.quest = {
      kind: "repair-lift",
      wireId: wire?.id,
      fuseCell,
      fuseRoom: fuseRoom?.id,
      clueCell: f.vertical.elevator.outside,
      clueLabel: "Rozdzielnia B-4",
    };
    return f;
  }

  if (kind === "broken-stairs") {
    f.vertical.quest = {
      kind: "broken-stairs",
      clueCell: f.stairsUp ?? undefined,
      clueLabel: "Zawalony bieg schodów",
    };
    return f;
  }

  if (kind === "flooded-route" && f.vertical.service) {
    const wire = f.environment.features.find((ft) => ft.kind === "wire" && ft.control);
    const steam = f.environment.features.find((ft) => ft.kind === "steam");
    // Mark puddle tiles visually near the service doorway (passable, non-blocking)
    const out = f.vertical.service.outside;
    if (f.tiles[idx(f, out)] === Tile.Floor) f.tiles[idx(f, out)] = Tile.Puddle;
    f.vertical.quest = {
      kind: "flooded-route",
      wireId: wire?.id,
      steamId: steam?.id,
      clueCell: out,
      clueLabel: "Zalany pion techniczny",
    };
    return f;
  }

  if (kind === "lure-horde" && f.stairsUp) {
    const stairRoom = f.rooms.find((r) => r.role === "stairs");
    const sideRoom =
      normalRooms.find((r) => {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        const d = Math.hypot(cx - f.stairsUp!.x, cy - f.stairsUp!.y);
        return d >= 10 && d <= 28;
      }) ?? normalRooms[0];
    const beacon = sideRoom ? openRoomCells(f, sideRoom, avoid)[0] : undefined;
    const horde: Cell[] = [];
    if (stairRoom) {
      const spots = openRoomCells(f, stairRoom, avoid)
        .filter((p) => Math.hypot(p.x - f.stairsUp!.x, p.y - f.stairsUp!.y) >= 1.5)
        .slice(0, 3);
      for (const p of spots) {
        horde.push(p);
        f.zombies.push({
          x: (p.x + 0.5) * TILE,
          y: (p.y + 0.5) * TILE,
          kind: rng() < 0.35 ? "runner" : "shambler",
          room: stairRoom.id,
        });
      }
    }
    f.vertical.quest = {
      kind: "lure-horde",
      beacon,
      clueRoom: sideRoom?.id,
      horde,
      clueLabel: "Konsola rozgłoszeniowa",
    };
    return f;
  }

  if (kind === "service-shaft" && f.vertical.service) {
    const office =
      normalRooms.find((r) => ["LOKAL UŻYTKOWY", "WARSZTAT", "SCHOWEK", "KOTŁOWNIA"].includes(f.roomZones[r.id])) ??
      normalRooms[0];
    const clueCell = office ? openRoomCells(f, office, avoid)[0] : undefined;
    const code = `${1 + rng.int(8)}-${1 + rng.int(8)}-${1 + rng.int(8)}`;
    f.vertical.quest = {
      kind: "service-shaft",
      clueCell,
      clueRoom: office?.id,
      code,
      clueLabel: "Instrukcja pionu technicznego",
    };
    return f;
  }

  if (kind === "apartment-bypass" && f.vertical.stairsB) {
    // Evacuation plan near the main corridor or western side + bypass obstacle in an east apartment
    const eastRoom =
      normalRooms
        .slice()
        .sort((a, b) => Math.abs(b.x - f.vertical!.stairsB!.outside.x) - Math.abs(a.x - f.vertical!.stairsB!.outside.x))
        .pop() ?? normalRooms[0];
    const corridor = f.rooms.find((r) => f.roomZones[r.id] === "KORYTARZ");
    const clueCell = corridor ? openRoomCells(f, corridor, avoid).find((p) => p.x >= 10 && p.x <= 24) : undefined;
    const bypassCell = eastRoom ? openRoomCells(f, eastRoom, avoid)[0] : undefined;
    f.vertical.quest = {
      kind: "apartment-bypass",
      clueCell,
      clueRoom: corridor?.id,
      bypassCell,
      clueLabel: "Plan ewakuacyjny Klatki B",
    };
    return f;
  }

  return f;
}
