import { MAP_H, MAP_W, Tile } from "./palette";
import type { makeRng } from "./rng";
import type {
  ApartmentFamily,
  ApartmentInfo,
  DecalSpawn,
  DoorInfo,
  DoorKind,
  LightFixture,
  Prop,
  PropAccessPoint,
  PropKind,
  Room,
  RoomFunctionRole,
  WallDecal,
  WindowInfo,
  ZombieKind,
} from "./types";

const W = MAP_W;
const H = MAP_H;
const idx = (x: number, y: number) => y * W + x;
const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
const PASSABLE = new Set<number>([
  Tile.Floor,
  Tile.Rubble,
  Tile.Puddle,
  Tile.StairsUp,
  Tile.StairsDown,
  Tile.Door,
  Tile.DoorOpen,
]);
const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export type Rng = ReturnType<typeof makeRng>;
export type Cell = { x: number; y: number };
export type Side = "n" | "s" | "e" | "w";

export type Zone =
  | "hall"
  | "living"
  | "kitchen"
  | "bath"
  | "bedroom"
  | "corridor"
  | "stair"
  | "laundry"
  | "boiler"
  | "storage"
  | "office"
  | "nursery"
  | "workshop";

export const ZONE_LABEL: Record<Zone, string> = {
  hall: "PRZEDPOKÓJ",
  living: "SALON",
  kitchen: "KUCHNIA",
  bath: "ŁAZIENKA",
  bedroom: "SYPIALNIA",
  corridor: "KORYTARZ",
  stair: "KLATKA SCHODOWA",
  laundry: "PRALNIA",
  boiler: "KOTŁOWNIA",
  storage: "SCHOWEK",
  office: "LOKAL UŻYTKOWY",
  nursery: "POKÓJ DZIECIĘCY",
  workshop: "WARSZTAT",
};

export const FAMILY_LABEL: Record<ApartmentFamily, string> = {
  kawalerka: "Kawalerka",
  dwupokojowe: "Dwupokojowe",
  rodzinne: "Rodzinne",
  narozne: "Narożne",
  wydluzone: "Wydłużone",
  przebudowane: "Połączone",
  zaplecze: "Zaplecze techniczne",
  uslugowy: "Lokal użytkowy",
};

export const ZONE_ROLE: Record<Zone, RoomFunctionRole> = {
  corridor: "public",
  stair: "stair",
  hall: "entry",
  living: "living",
  bedroom: "private",
  nursery: "private",
  kitchen: "kitchen",
  bath: "wet",
  laundry: "wet",
  storage: "storage",
  boiler: "tech",
  workshop: "tech",
  office: "living",
};

export interface FloorBuild {
  tiles: Uint8Array;
  floorStyle: Uint8Array;
  wallStyle: Uint8Array;
  roomOf: Int16Array;
  rooms: Room[];
  roomZones: string[];
  roomWs: number[];
  zones: Zone[];
  doors: DoorInfo[];
  windows: WindowInfo[];
  props: Prop[];
  occ: Uint8Array;
  wallDecals: WallDecal[];
  breaches: Cell[];
  corpses: { x: number; y: number; kind: ZombieKind }[];
  survivors: { id: number; x: number; y: number; room: number; name: string; lines: string[]; gift: "med" | "ammo" | "battery"; variant: number }[];
  decals: DecalSpawn[];
  lights: LightFixture[];
  apartments: ApartmentInfo[];
  propAccess: PropAccessPoint[];
  repairsApplied: number;
}

export function zoneSurfaceStyle(zone: Zone, decay: number, service: boolean): { fs: number; ws: number } {
  if (zone === "bath" || zone === "laundry") return { fs: 1, ws: 1 };
  if (zone === "kitchen") return { fs: 2, ws: decay > 0.55 ? 5 : 0 };
  if (zone === "hall") return { fs: decay >= 0.78 ? 5 : 2, ws: decay > 0.6 ? 5 : 0 };
  if (zone === "corridor") return { fs: service ? 3 : 2, ws: decay > 0.55 ? 5 : 2 };
  if (zone === "stair") return { fs: 3, ws: 3 };
  if (zone === "boiler" || zone === "workshop" || zone === "storage") return { fs: 3, ws: 3 };
  if (zone === "nursery") return { fs: 7, ws: 0 };
  if (zone === "office") return { fs: decay >= 0.75 ? 5 : 2, ws: decay >= 0.6 ? 5 : 2 };
  if (decay >= 0.85) return { fs: 4, ws: 4 };
  if (decay >= 0.7) return { fs: 5, ws: 4 };
  if (decay >= 0.5) return { fs: 5, ws: 5 };
  return { fs: zone === "living" ? 7 : 0, ws: 0 };
}

function createRoom(
  b: FloorBuild,
  x: number,
  y: number,
  w: number,
  h: number,
  zone: Zone,
  decay: number,
  service: boolean,
  rng: Rng,
  apartmentId?: number,
): Room {
  const { fs, ws } = zoneSurfaceStyle(zone, decay, service);
  const r: Room = {
    id: b.rooms.length,
    x,
    y,
    w,
    h,
    role: "normal",
    lit: zone === "hall" ? rng.chance(0.75 - decay * 0.4) : rng.chance(0.84 - decay * 0.56),
    flicker: rng.chance(0.2 + decay * 0.52),
    ...(apartmentId !== undefined ? { apartmentId } : {}),
    functionRole: ZONE_ROLE[zone],
  };
  b.rooms.push(r);
  b.roomZones.push(ZONE_LABEL[zone]);
  b.roomWs.push(ws);
  b.zones.push(zone);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const i = idx(xx, yy);
      b.tiles[i] = Tile.Floor;
      b.roomOf[i] = r.id;
      b.floorStyle[i] = fs;
    }
  }
  return r;
}

function manhattan(a: Cell, c: Cell) {
  return Math.abs(a.x - c.x) + Math.abs(a.y - c.y);
}

/** Measures shortest walking distance exclusively along corridor floor tiles. */
function corridorWalkDist(tiles: Uint8Array, roomOf: Int16Array, roomZones: string[], a: Cell, target: Cell, maxDist = 48): number {
  const start = idx(a.x, a.y);
  const goal = idx(target.x, target.y);
  if (start === goal) return 0;
  const dist = new Int16Array(W * H).fill(-1);
  const q: number[] = [start];
  dist[start] = 0;
  for (let head = 0; head < q.length; head++) {
    const p = q[head];
    const d = dist[p];
    if (d >= maxDist) continue;
    const x = p % W;
    const y = Math.floor(p / W);
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || nx >= W - 1 || ny < 1 || ny >= H - 1) continue;
      const ni = ny * W + nx;
      if (dist[ni] >= 0) continue;
      const rid = roomOf[ni];
      if (rid < 0 || roomZones[rid] !== "KORYTARZ") continue;
      if (!PASSABLE.has(tiles[ni])) continue;
      if (ni === goal) return d + 1;
      dist[ni] = d + 1;
      q.push(ni);
    }
  }
  return maxDist + 1;
}

function pairKey(a: number, c: number) {
  return a < c ? `${a}:${c}` : `${c}:${a}`;
}

interface SubRect {
  x: number;
  y: number;
  w: number;
  h: number;
  zone: Zone;
  isEntry?: boolean;
  canBypass?: boolean;
}

interface SubPlan {
  family: ApartmentFamily;
  plumbingEdge?: Side;
  rects: SubRect[];
  /** Indices inside rects[]; optional breach flag draws an intentional remodel opening instead of a wooden door. */
  edges: { a: number; b: number; breach?: boolean; reason: string }[];
  wantsBypass: boolean;
  bypassReason: string;
}

/** Transforms local coordinates [0..W-1, 0..H-1] anchored on local north edge into real lot coordinates for entrySide. */
function orientRect(
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  localW: number,
  localH: number,
  entrySide: Side,
  flipX: boolean,
  lotX: number,
  lotY: number,
): { x: number; y: number; w: number; h: number } {
  const fx = flipX ? localW - (rx + rw) : rx;
  if (entrySide === "n") return { x: lotX + fx, y: lotY + ry, w: rw, h: rh };
  if (entrySide === "s") return { x: lotX + fx, y: lotY + (localH - (ry + rh)), w: rw, h: rh };
  // Transpose: local north becomes west (ry -> x) or east (localH - ry - rh -> x)
  if (entrySide === "w") return { x: lotX + ry, y: lotY + fx, w: rh, h: rw };
  return { x: lotX + (localH - (ry + rh)), y: lotY + fx, w: rh, h: rw };
}

function orientEdge(localSide: Side, entrySide: Side, flipX: boolean): Side {
  let s = localSide;
  if (flipX && (s === "w" || s === "e")) s = s === "w" ? "e" : "w";
  if (entrySide === "n") return s;
  if (entrySide === "s") return s === "n" ? "s" : s === "s" ? "n" : s;
  if (entrySide === "w") return s === "n" ? "w" : s === "s" ? "e" : s === "w" ? "n" : "s";
  return s === "n" ? "e" : s === "s" ? "w" : s === "w" ? "n" : "s";
}

function clampSplit(total: number, frac: number, minA: number, minB: number): [number, number] | null {
  if (total < minA + minB + 1) return null;
  const a = Math.max(minA, Math.min(total - minB - 1, Math.round((total - 1) * frac)));
  const b = total - 1 - a;
  if (a < minA || b < minB) return null;
  return [a, b];
}

function clampSplit3(total: number, f1: number, f2: number, min1: number, min2: number, min3: number): [number, number, number] | null {
  if (total < min1 + min2 + min3 + 2) return null;
  const avail = total - 2;
  let a = Math.max(min1, Math.min(avail - min2 - min3, Math.round(avail * f1)));
  let c = Math.max(min3, Math.min(avail - a - min2, Math.round(avail * f2)));
  let m = avail - a - c;
  if (m < min2) {
    const need = min2 - m;
    const takeA = Math.min(need, a - min1);
    a -= takeA;
    const takeC = Math.min(need - takeA, c - min3);
    c -= takeC;
    m = avail - a - c;
  }
  if (a < min1 || m < min2 || c < min3) return null;
  return [a, m, c];
}

/** Synthesizes a valid parametric multi-room architectural plan oriented with corridor entry on local north edge. */
function makeLocalPlan(
  family: ApartmentFamily,
  lw: number,
  lh: number,
  rng: Rng,
  decay: number,
  openKitchen: boolean,
  allowBypass: boolean,
): SubPlan | null {
  const jitter = () => (rng() - 0.5) * 0.1;

  // 1. Larger family apartment (rodzinne): central PRZEDPOKÓJ, living, kitchen+bath wet axis, bedroom + nursery/storage
  if (family === "rodzinne" && lw >= 11 && lh >= 9) {
    const rowSplit = clampSplit(lh, 0.45 + jitter(), 3, 4);
    if (!rowSplit) return null;
    const [topH, botH] = rowSplit;
    const topCols = clampSplit(lw, 0.44 + jitter(), 4, 5);
    const botCols = clampSplit3(lw, 0.28, 0.38, 3, 3, 4);
    if (topCols && botCols) {
      const [hallW, livW] = topCols;
      const [bathW, kitW, bedW] = botCols;
      // Ensure kitchen overlaps hall (for hall->kitchen) or living (for open kitchen)
      const hallEnd = hallW - 1;
      const kitStart = bathW + 1;
      const kitEnd = kitStart + kitW - 1;
      const livStart = hallW + 1;
      const kitchenTouchesHall = Math.min(hallEnd, kitEnd) - Math.max(0, kitStart) >= 0;
      const kitchenTouchesLiv = Math.min(lw - 1, kitEnd) - Math.max(livStart, kitStart) >= 0;
      const rects: SubRect[] = [
        { x: 0, y: 0, w: hallW, h: topH, zone: "hall", isEntry: true }, // 0
        { x: livStart, y: 0, w: livW, h: topH, zone: "living", canBypass: true }, // 1
        { x: 0, y: topH + 1, w: bathW, h: botH, zone: "bath" }, // 2 (wet core touching kitchen!)
        { x: kitStart, y: topH + 1, w: kitW, h: botH, zone: "kitchen", canBypass: true }, // 3
        { x: kitEnd + 2, y: topH + 1, w: bedW, h: botH, zone: "bedroom" }, // 4
      ];
      // If very tall, split off a private nursery/storage room from bottom or living wing
      const edges: SubPlan["edges"] = [
        { a: 0, b: 1, reason: "przedpokój–salon" },
        { a: 0, b: 2, reason: "przedpokój–łazienka (ślepa)" },
      ];
      if (openKitchen && kitchenTouchesLiv) {
        edges.push({ a: 1, b: 3, reason: "salon–kuchnia (otwarta)" });
      } else if (kitchenTouchesHall) {
        edges.push({ a: 0, b: 3, reason: "przedpokój–kuchnia" });
      } else if (kitchenTouchesLiv) {
        edges.push({ a: 1, b: 3, reason: "salon–kuchnia" });
      } else {
        return null;
      }
      // Connect bedroom cleanly to living (always shares overlap on right wing)
      const bedStart = kitEnd + 2;
      if (Math.min(lw - 1, bedStart + bedW - 1) >= livStart) {
        edges.push({ a: 1, b: 4, reason: "salon–sypialnia" });
      } else {
        edges.push({ a: 3, b: 4, reason: "kuchnia–sypialnia" });
      }
      // Bonus nursery or pantry on very spacious lots (lw >= 14 && lh >= 12)
      if (lh >= 12 && botH >= 7 && rng.chance(0.65)) {
        const sub = clampSplit(botH, 0.5, 3, 3);
        if (sub) {
          const [b1, b2] = sub;
          rects[4].h = b1;
          const extraZone: Zone = rng.chance(0.6) ? "nursery" : "storage";
          rects.push({ x: bedStart, y: topH + 1 + b1 + 1, w: bedW, h: b2, zone: extraZone });
          edges.push({ a: 3, b: 5, reason: extraZone === "storage" ? "kuchnia–schowek" : "strefa dziecięca" });
        }
      }
      return {
        family: "rodzinne",
        plumbingEdge: "w",
        rects,
        edges,
        wantsBypass: allowBypass && rng.chance(0.5),
        bypassReason: "przejście rodzinne między skrzydłami",
      };
    }
  }

  // 2. Two-room classic flat with central PRZEDPOKÓJ (dwupokojowe)
  if ((family === "dwupokojowe" || family === "rodzinne") && lw >= 9 && lh >= 7) {
    const rowSplit = clampSplit(lh, 0.44 + jitter(), 3, 3);
    if (!rowSplit) return null;
    const [topH, botH] = rowSplit;
    const topCols = clampSplit(lw, 0.42 + jitter(), 3, 4);
    if (!topCols) return null;
    const [hallW, livW] = topCols;
    // Variant A: 4 rooms with full hall -> bath(leaf) + living -> kitchen/bedroom
    const variant = lw >= 11 && rng.chance(0.55) ? "five" : "four";
    if (variant === "five") {
      const botCols = clampSplit3(lw, 0.27, 0.36, 3, 3, 3);
      if (botCols) {
        const [bathW, kitW, bedW] = botCols;
        const kitStart = bathW + 1;
        const kitEnd = kitStart + kitW - 1;
        const livStart = hallW + 1;
        const rects: SubRect[] = [
          { x: 0, y: 0, w: hallW, h: topH, zone: "hall", isEntry: true },
          { x: livStart, y: 0, w: livW, h: topH, zone: "living", canBypass: true },
          { x: 0, y: topH + 1, w: bathW, h: botH, zone: "bath" },
          { x: kitStart, y: topH + 1, w: kitW, h: botH, zone: "kitchen", canBypass: true },
          { x: kitEnd + 2, y: topH + 1, w: bedW, h: botH, zone: rng.chance(0.22) ? "nursery" : "bedroom" },
        ];
        const kitOnHall = Math.min(hallW - 1, kitEnd) >= kitStart;
        const kitOnLiv = Math.min(lw - 1, kitEnd) >= livStart;
        const edges: SubPlan["edges"] = [
          { a: 0, b: 1, reason: "przedpokój–salon" },
          { a: 0, b: 2, reason: "przedpokój–łazienka (ślepa)" },
          { a: openKitchen && kitOnLiv ? 1 : kitOnHall ? 0 : 1, b: 3, reason: openKitchen && kitOnLiv ? "salon–kuchnia" : "przedpokój–kuchnia" },
          { a: 1, b: 4, reason: "salon–sypialnia" },
        ];
        return {
          family: "dwupokojowe",
          plumbingEdge: "w",
          rects,
          edges,
          wantsBypass: allowBypass && rng.chance(0.4),
          bypassReason: "drugie wyjście przez mieszkanie dwupokojowe",
        };
      }
    }
    // 4 rooms: hall + living (top), bath + bedroom or bath + kitchen (bottom)
    const botCols = clampSplit(lw, 0.4 + jitter(), 3, 4);
    if (!botCols) return null;
    const [bW, rW] = botCols;
    const thirdIsKitchen = rng.chance(0.42);
    const rects: SubRect[] = [
      { x: 0, y: 0, w: hallW, h: topH, zone: "hall", isEntry: true },
      { x: hallW + 1, y: 0, w: livW, h: topH, zone: "living", canBypass: true },
      { x: 0, y: topH + 1, w: bW, h: botH, zone: "bath" },
      { x: bW + 1, y: topH + 1, w: rW, h: botH, zone: thirdIsKitchen ? "kitchen" : "bedroom", canBypass: thirdIsKitchen },
    ];
    const edges: SubPlan["edges"] = [
      { a: 0, b: 1, reason: "przedpokój–salon" },
      { a: 0, b: 2, reason: "przedpokój–łazienka (ślepa)" },
      { a: 1, b: 3, reason: thirdIsKitchen ? "salon–kuchnia (aneks)" : "salon–sypialnia" },
    ];
    return {
      family: "dwupokojowe",
      plumbingEdge: "w",
      rects,
      edges,
      wantsBypass: allowBypass && rng.chance(0.35),
      bypassReason: "przejście przez salon na sąsiedni korytarz",
    };
  }

  // 3. Corner flat (narozne) — reaches two perpendicular corridors, natural stealth bypass around junction
  if (family === "narozne" && lw >= 9 && lh >= 7) {
    const rowSplit = clampSplit(lh, 0.48 + jitter(), 3, 3);
    const colSplit = clampSplit(lw, 0.44 + jitter(), 3, 4);
    if (!rowSplit || !colSplit) return null;
    const [topH, botH] = rowSplit;
    const [leftW, rightW] = colSplit;
    const hasKitchen = lw >= 11 && rng.chance(0.6);
    if (hasKitchen) {
      const botCols = clampSplit(lw, 0.56, 4, 3);
      if (botCols) {
        const [bedW, kitW] = botCols;
        const topLeftSplit = leftW >= 7 ? clampSplit(leftW, 0.5, 3, 3) : null;
        if (topLeftSplit) {
          const [hW, bW] = topLeftSplit;
          return {
            family: "narozne",
            plumbingEdge: "e",
            rects: [
              { x: 0, y: 0, w: hW, h: topH, zone: "hall", isEntry: true },
              { x: hW + 1, y: 0, w: bW, h: topH, zone: "bath" },
              { x: leftW + 1, y: 0, w: rightW, h: topH, zone: "living", canBypass: true },
              { x: 0, y: topH + 1, w: bedW, h: botH, zone: "bedroom" },
              { x: bedW + 1, y: topH + 1, w: kitW, h: botH, zone: "kitchen", canBypass: true },
            ],
            edges: [
              { a: 0, b: 1, reason: "przedpokój–łazienka" },
              { a: 0, b: 3, reason: "przedpokój–sypialnia" },
              { a: 3, b: 4, reason: "przejście wewnętrzne" },
              { a: 4, b: 2, reason: "kuchnia–salon narożny" },
            ],
            wantsBypass: allowBypass,
            bypassReason: "obejście narożne na prostopadły korytarz",
          };
        }
      }
    }
    const rightIsKitchen = rng.chance(0.5);
    return {
      family: "narozne",
      plumbingEdge: "s",
      rects: [
        { x: 0, y: 0, w: leftW, h: topH, zone: "hall", isEntry: true },
        { x: leftW + 1, y: 0, w: rightW, h: topH, zone: "living", canBypass: true },
        { x: 0, y: topH + 1, w: leftW, h: botH, zone: "bath" },
        { x: leftW + 1, y: topH + 1, w: rightW, h: botH, zone: rightIsKitchen ? "kitchen" : "bedroom", canBypass: true },
      ],
      edges: [
        { a: 0, b: 1, reason: "przedpokój–salon narożny" },
        { a: 0, b: 2, reason: "przedpokój–łazienka (ślepa)" },
        { a: 1, b: 3, reason: rightIsKitchen ? "salon–kuchnia" : "salon–sypialnia" },
      ],
      wantsBypass: allowBypass,
      bypassReason: "obejście narożne omijające skrzyżowanie",
    };
  }

  // 4. Elongated / pass-through flat (wydluzone) — linear route spanning far walls
  if (family === "wydluzone" && ((lw >= 11 && lh >= 4) || (lh >= 10 && lw >= 5))) {
    if (lw >= lh && lw >= 11) {
      const cols = clampSplit3(lw, 0.28, 0.34, 3, 4, 3);
      if (!cols) return null;
      const [c0, c1, c2] = cols;
      if (lh >= 8) {
        // Two deep zones + side bath & storage aligned cleanly along plumbing wall
        const rs = clampSplit(lh, 0.56, 4, 3);
        if (rs) {
          const [mainH, auxH] = rs;
          const auxCols = clampSplit(lw, 0.5, 3, 4);
          if (auxCols) {
            const [a0, a1] = auxCols;
            return {
              family: "wydluzone",
              plumbingEdge: "s",
              rects: [
                { x: 0, y: 0, w: c0, h: mainH, zone: "hall", isEntry: true },
                { x: c0 + 1, y: 0, w: c1, h: mainH, zone: "living" },
                { x: c0 + c1 + 2, y: 0, w: c2, h: mainH, zone: "bedroom", canBypass: true },
                { x: 0, y: mainH + 1, w: a0, h: auxH, zone: "bath" },
                { x: a0 + 1, y: mainH + 1, w: a1, h: auxH, zone: "kitchen", canBypass: true },
              ],
              edges: [
                { a: 0, b: 1, reason: "przedpokój–salon" },
                { a: 1, b: 2, reason: "salon–sypialnia (amfilada)" },
                { a: 0, b: 3, reason: "przedpokój–łazienka (ślepa)" },
                { a: 1, b: 4, reason: "salon–kuchnia" },
              ],
              wantsBypass: allowBypass,
              bypassReason: "układ wydłużony łączący odległe korytarze",
            };
          }
        }
      }
      // Clean 3-room railroad apartment: entry hall -> living -> kitchen (exit far side)
      return {
        family: "wydluzone",
        plumbingEdge: "e",
        rects: [
          { x: 0, y: 0, w: c0, h: lh, zone: "hall", isEntry: true },
          { x: c0 + 1, y: 0, w: c1, h: lh, zone: "living" },
          { x: c0 + c1 + 2, y: 0, w: c2, h: lh, zone: rng.chance(0.55) ? "kitchen" : "bedroom", canBypass: true },
        ],
        edges: [
          { a: 0, b: 1, reason: "przedpokój–salon" },
          { a: 1, b: 2, reason: "amfilada mieszkania" },
        ],
        wantsBypass: allowBypass,
        bypassReason: "przejście przez mieszkanie wydłużone",
      };
    } else if (lh >= 10 && lw >= 5) {
      const rows = clampSplit3(lh, 0.28, 0.32, 3, 3, 3);
      if (!rows) return null;
      const [r0, r1, r2] = rows;
      return {
        family: "wydluzone",
        plumbingEdge: "s",
        rects: [
          { x: 0, y: 0, w: lw, h: r0, zone: "hall", isEntry: true },
          { x: 0, y: r0 + 1, w: lw, h: r1, zone: "living" },
          { x: 0, y: r0 + r1 + 2, w: lw, h: r2, zone: rng.chance(0.55) ? "kitchen" : "bedroom", canBypass: true },
        ],
        edges: [
          { a: 0, b: 1, reason: "przedpokój–salon" },
          { a: 1, b: 2, reason: "korytarz amfilady" },
        ],
        wantsBypass: allowBypass,
        bypassReason: "przelotowe mieszkanie między korytarzami",
      };
    }
  }

  // 5. Remodeled / merged dual flat (przebudowane) — connected by internal remodel opening or deliberate survivor wall breach!
  if (family === "przebudowane" && lw >= 10 && lh >= 7) {
    const colSplit = clampSplit(lw, 0.5 + jitter(), 4, 4);
    const leftRows = clampSplit(lh, 0.45, 3, 3);
    const rightRows = clampSplit(lh, 0.52, 3, 3);
    if (!colSplit || !leftRows || !rightRows) return null;
    const [wA, wB] = colSplit;
    const [la, lb] = leftRows;
    const [ra, rb] = rightRows;
    const useBreach = decay >= 0.15 || rng.chance(0.6);
    return {
      family: "przebudowane",
      plumbingEdge: "s",
      rects: [
        { x: 0, y: 0, w: wA, h: la, zone: "hall", isEntry: true }, // 0: Unit A entry
        { x: 0, y: la + 1, w: wA, h: lb, zone: "living" }, // 1: Unit A living
        { x: wA + 1, y: 0, w: wB, h: ra, zone: "bedroom", canBypass: true }, // 2: Unit B bedroom/remodel exit
        { x: wA + 1, y: ra + 1, w: wB, h: rb, zone: rng.chance(0.55) ? "kitchen" : "storage", canBypass: true }, // 3: Unit B kitchen/storage
      ],
      edges: [
        { a: 0, b: 1, reason: "część A: wejście–salon" },
        { a: 1, b: 3, breach: useBreach, reason: useBreach ? "przebicie ściany między lokalami" : "przebudowane przejście do sąsiedniego lokalu" },
        { a: 3, b: 2, reason: "część B: przejście wewnętrzne" },
      ],
      wantsBypass: allowBypass,
      bypassReason: useBreach ? "połączony lokal (przebicie lokatorskie)" : "przebudowane wyjście do sąsiedniego skrzydła",
    };
  }

  // 6. Technical back-of-house suite (zaplecze): workshop -> boiler + storage(leaf) + laundry(wet)
  if (family === "zaplecze") {
    if (lw >= 9 && lh >= 7) {
      const rs = clampSplit(lh, 0.5, 3, 3);
      const cs = clampSplit(lw, 0.52, 4, 3);
      if (rs && cs) {
        const [th, bh] = rs;
        const [wl, wr] = cs;
        return {
          family: "zaplecze",
          plumbingEdge: "e",
          rects: [
            { x: 0, y: 0, w: wl, h: th, zone: "workshop", isEntry: true },
            { x: wl + 1, y: 0, w: wr, h: th, zone: "storage" },
            { x: 0, y: th + 1, w: wl, h: bh, zone: "boiler", canBypass: true },
            { x: wl + 1, y: th + 1, w: wr, h: bh, zone: "laundry" },
          ],
          edges: [
            { a: 0, b: 1, reason: "warsztat–schowek (magazyn)" },
            { a: 0, b: 2, reason: "warsztat–kotłownia" },
            { a: 2, b: 3, reason: "wspólny pion wodny: kotłownia–pralnia" },
          ],
          wantsBypass: allowBypass && rng.chance(0.55),
          bypassReason: "wyjście serwisowe zaplecza technicznego",
        };
      }
    }
    if (lw >= 8 && lh >= 4) {
      const cs = clampSplit(lw, 0.52, 4, 3);
      if (cs) {
        const [wl, wr] = cs;
        const z0: Zone = rng.pick(["workshop", "boiler", "laundry"]);
        const z1: Zone = z0 === "workshop" ? "storage" : z0 === "boiler" ? "workshop" : "storage";
        return {
          family: "zaplecze",
          plumbingEdge: "e",
          rects: [
            { x: 0, y: 0, w: wl, h: lh, zone: z0, isEntry: true },
            { x: wl + 1, y: 0, w: wr, h: lh, zone: z1, canBypass: z1 !== "storage" },
          ],
          edges: [{ a: 0, b: 1, reason: "zaplecze–pomieszczenie pomocnicze" }],
          wantsBypass: allowBypass && z1 !== "storage" && rng.chance(0.35),
          bypassReason: "przejście techniczne zaplecza",
        };
      }
    }
    if (lh >= 8 && lw >= 4) {
      const rs = clampSplit(lh, 0.52, 4, 3);
      if (rs) {
        const [th, bh] = rs;
        return {
          family: "zaplecze",
          rects: [
            { x: 0, y: 0, w: lw, h: th, zone: "workshop", isEntry: true },
            { x: 0, y: th + 1, w: lw, h: bh, zone: "storage" },
          ],
          edges: [{ a: 0, b: 1, reason: "warsztat–schowek" }],
          wantsBypass: false,
          bypassReason: "",
        };
      }
    }
  }

  // 7. Commercial / utility ground/residential unit (uslugowy)
  if (family === "uslugowy" && ((lw >= 8 && lh >= 5) || (lh >= 8 && lw >= 5))) {
    if (lw >= 9 && lh >= 7) {
      const rs = clampSplit(lh, 0.52, 3, 3);
      const cs = clampSplit(lw, 0.54, 4, 3);
      if (rs && cs) {
        const [th, bh] = rs;
        const [wl, wr] = cs;
        return {
          family: "uslugowy",
          plumbingEdge: "e",
          rects: [
            { x: 0, y: 0, w: wl, h: th, zone: "office", isEntry: true },
            { x: wl + 1, y: 0, w: wr, h: th, zone: "bath" },
            { x: 0, y: th + 1, w: wl, h: bh, zone: "workshop", canBypass: true },
            { x: wl + 1, y: th + 1, w: wr, h: bh, zone: "storage" },
          ],
          edges: [
            { a: 0, b: 1, reason: "biuro–toaleta" },
            { a: 0, b: 2, reason: "biuro–zaplecze" },
            { a: 2, b: 3, reason: "zaplecze–schowek" },
          ],
          wantsBypass: allowBypass && rng.chance(0.6),
          bypassReason: "tylne wyjście gospodarcze lokalu",
        };
      }
    }
    if (lw >= 8) {
      const cs = clampSplit(lw, 0.56, 4, 3);
      if (cs) {
        return {
          family: "uslugowy",
          rects: [
            { x: 0, y: 0, w: cs[0], h: lh, zone: "office", isEntry: true },
            { x: cs[0] + 1, y: 0, w: cs[1], h: lh, zone: "storage" },
          ],
          edges: [{ a: 0, b: 1, reason: "lokal–zaplecze magazynowe" }],
          wantsBypass: false,
          bypassReason: "",
        };
      }
    }
  }

  // 8. Studio apartment (kawalerka) — clean compact living/aneks/bath (2 or 3 rooms)
  if (lw >= 8 && lh >= 7) {
    const rs = clampSplit(lh, 0.54 + jitter(), 3, 3);
    const botCols = clampSplit(lw, 0.45, 3, 3);
    if (rs && botCols) {
      const [th, bh] = rs;
      const [bw, kw] = botCols;
      return {
        family: "kawalerka",
        plumbingEdge: "s",
        rects: [
          { x: 0, y: 0, w: lw, h: th, zone: "living", isEntry: true },
          { x: 0, y: th + 1, w: bw, h: bh, zone: "bath" },
          { x: bw + 1, y: th + 1, w: kw, h: bh, zone: "kitchen", canBypass: true },
        ],
        edges: [
          { a: 0, b: 1, reason: "kawalerka: pokój–łazienka (ślepa)" },
          { a: 0, b: 2, reason: "kawalerka: pokój–aneks kuchenny" },
        ],
        wantsBypass: allowBypass && rng.chance(0.28),
        bypassReason: "dodatkowe wyjście gospodarcze kawalerki",
      };
    }
  }
  if (lw >= 8 && lh >= 4) {
    const cs = clampSplit(lw, 0.58, 4, 3);
    if (cs) {
      const side: Zone = rng.chance(0.55) ? "bath" : "kitchen";
      return {
        family: "kawalerka",
        plumbingEdge: "e",
        rects: [
          { x: 0, y: 0, w: cs[0], h: lh, zone: "living", isEntry: true },
          { x: cs[0] + 1, y: 0, w: cs[1], h: lh, zone: side },
        ],
        edges: [{ a: 0, b: 1, reason: side === "bath" ? "kawalerka–łazienka" : "kawalerka–kuchnia" }],
        wantsBypass: false,
        bypassReason: "",
      };
    }
  }
  if (lh >= 7 && lw >= 4) {
    const rs = clampSplit(lh, 0.56, 3, 3);
    if (rs) {
      const side: Zone = rng.chance(0.55) ? "bath" : "kitchen";
      return {
        family: "kawalerka",
        plumbingEdge: "s",
        rects: [
          { x: 0, y: 0, w: lw, h: rs[0], zone: "living", isEntry: true },
          { x: 0, y: rs[0] + 1, w: lw, h: rs[1], zone: side },
        ],
        edges: [{ a: 0, b: 1, reason: side === "bath" ? "kawalerka–łazienka" : "kawalerka–kuchnia" }],
        wantsBypass: false,
        bypassReason: "",
      };
    }
  }
  return null;
}

interface CorridorTouch {
  side: Side;
  wall: Cell;
  outside: Cell;
}

/** Finds all clean wall tiles where rectangle (x,y,w,h) opens across a 1-tile wall directly onto KORYTARZ. */
function findCorridorTouches(b: FloorBuild, x: number, y: number, w: number, h: number): CorridorTouch[] {
  const out: CorridorTouch[] = [];
  const isCorrFloor = (cx: number, cy: number) => {
    if (cx < 4 || cx >= W - 4 || cy < 4 || cy >= H - 4) return false;
    const i = idx(cx, cy);
    const rid = b.roomOf[i];
    return rid >= 0 && b.roomZones[rid] === "KORYTARZ" && PASSABLE.has(b.tiles[i]);
  };
  for (let xx = x; xx < x + w; xx++) {
    if (b.tiles[idx(xx, y - 1)] === Tile.Wall && isCorrFloor(xx, y - 2)) out.push({ side: "n", wall: { x: xx, y: y - 1 }, outside: { x: xx, y: y - 2 } });
    if (b.tiles[idx(xx, y + h)] === Tile.Wall && isCorrFloor(xx, y + h + 1)) out.push({ side: "s", wall: { x: xx, y: y + h }, outside: { x: xx, y: y + h + 1 } });
  }
  for (let yy = y; yy < y + h; yy++) {
    if (b.tiles[idx(x - 1, yy)] === Tile.Wall && isCorrFloor(x - 2, yy)) out.push({ side: "w", wall: { x: x - 1, y: yy }, outside: { x: x - 2, y: yy } });
    if (b.tiles[idx(x + w, yy)] === Tile.Wall && isCorrFloor(x + w + 1, yy)) out.push({ side: "e", wall: { x: x + w, y: yy }, outside: { x: x + w + 1, y: yy } });
  }
  return out;
}

/** Helper checking a candidate doorway maintains safe spacing from existing doors, shafts & corners. */
function pickDoorOnSegment(
  candidates: { wall: Cell; far?: Cell }[],
  existingRoomDoors: Cell[],
  allDoors: DoorInfo[],
  allBreaches: Cell[],
  roomMinDist: number,
  globalMinDist: number,
  preferFarFrom?: Cell,
): { wall: Cell; far?: Cell } | null {
  if (!candidates.length) return null;
  // Exclude candidates that directly collide with shaft openings or sit diagonally attached to an existing door
  const scored: { c: { wall: Cell; far?: Cell }; score: number; roomNearest: number; allNearest: number }[] = [];
  const mid = (candidates.length - 1) / 2;
  for (let k = 0; k < candidates.length; k++) {
    const c = candidates[k];
    // Never overlap existing door/breach or directly side-touch another door (dist <= 1)
    if (allDoors.some((d) => manhattan(d, c.wall) <= 1)) continue;
    if (allBreaches.some((br) => manhattan(br, c.wall) <= 2)) continue;
    // Avoid blocking vertical facade fixed shaft arrival tiles
    if ((c.wall.x <= 5 && Math.abs(c.wall.y - 43) <= 1) || (c.wall.x >= 50 && (Math.abs(c.wall.y - 19) <= 1 || Math.abs(c.wall.y - 35) <= 1))) {
      continue;
    }
    const roomNearest = existingRoomDoors.length
      ? Math.min(...existingRoomDoors.map((d) => manhattan(d, c.wall)))
      : 99;
    const allNearest = allDoors.length
      ? Math.min(...allDoors.map((d) => manhattan(d, c.wall)))
      : 99;
    if (roomNearest < roomMinDist) continue;
    if (allNearest < globalMinDist) continue;
    const isCorner = candidates.length >= 3 && (k === 0 || k === candidates.length - 1);
    let score = 0;
    // Strong bias away from corner hugging; clean centered opening
    score -= Math.abs(k - mid) * 1.4;
    if (isCorner) score -= 6;
    // Prefer rich separation from other doors of same room (true through-traffic!)
    score += Math.min(roomNearest, 12) * 1.6;
    score += Math.min(allNearest, 10) * 0.5;
    if (preferFarFrom) score += Math.min(manhattan(c.wall, preferFarFrom), 24) * 2.2;
    scored.push({ c, score, roomNearest, allNearest });
  }
  if (!scored.length) return null;
  scored.sort((a, d) => d.score - a.score);
  return scored[0].c;
}

function sharedBoundary(a: Room, c: Room): Cell[] {
  const cells: Cell[] = [];
  if (a.x + a.w + 1 === c.x || c.x + c.w + 1 === a.x) {
    const wx = a.x + a.w + 1 === c.x ? a.x + a.w : c.x + c.w;
    const y0 = Math.max(a.y, c.y);
    const y1 = Math.min(a.y + a.h, c.y + c.h) - 1;
    for (let y = y0; y <= y1; y++) cells.push({ x: wx, y });
  } else if (a.y + a.h + 1 === c.y || c.y + c.h + 1 === a.y) {
    const wy = a.y + a.h + 1 === c.y ? a.y + a.h : c.y + c.h;
    const x0 = Math.max(a.x, c.x);
    const x1 = Math.min(a.x + a.w, c.x + c.w) - 1;
    for (let x = x0; x <= x1; x++) cells.push({ x, y: wy });
  }
  return cells;
}

function recordDoor(
  b: FloorBuild,
  x: number,
  y: number,
  kind: DoorKind,
  rooms: [number, number],
  reason: string,
  locked = false,
  barricaded = false,
) {
  b.tiles[idx(x, y)] = Tile.Door;
  b.occ[idx(x, y)] = 1;
  for (const [dx, dy] of N4) if (inb(x + dx, y + dy)) b.occ[idx(x + dx, y + dy)] = 1;
  b.doors.push({
    x,
    y,
    locked,
    barricaded,
    hp: locked ? 8 : barricaded ? 5 : 4,
    open: false,
    broken: false,
    kind,
    rooms,
    reason,
  });
}

function recordBreach(b: FloorBuild, x: number, y: number, fs: number) {
  if (b.breaches.some((br) => br.x === x && br.y === y)) return;
  b.tiles[idx(x, y)] = Tile.Rubble;
  b.floorStyle[idx(x, y)] = fs;
  b.occ[idx(x, y)] = 1;
  for (const [dx, dy] of N4) if (inb(x + dx, y + dy)) b.occ[idx(x + dx, y + dy)] = 1;
  b.breaches.push({ x, y });
}

/**
 * Packs structured, functional apartments AND coherent technical/utility suites into all
 * wall parcels bordered by the floor's existing public corridor network.
 */
export function buildPlannedApartments(
  b: FloorBuild,
  index: number,
  floorFamily: number,
  decay: number,
  reserved: Uint8Array,
  isVoid: (x: number, y: number) => boolean,
  rng: Rng,
): Room[] {
  const service = index <= 1;
  const xMin = 6;
  const xMax = W - 7;
  const yMin = 5;
  const yMax = H - 6;
  const allCreated: Room[] = [];
  const connectedPairs = new Set<string>();
  const doorsOfRoom = new Map<number, Cell[]>();
  const registerDoor = (_b: FloorBuild, x: number, y: number, kind: DoorKind, rooms: [number, number], reason: string, barricaded = false) => {
    const [ra, rb] = rooms;
    recordDoor(_b, x, y, kind, rooms, reason, false, barricaded);
    connectedPairs.add(pairKey(ra, rb));
    if (ra >= 0) doorsOfRoom.set(ra, [...(doorsOfRoom.get(ra) ?? []), { x, y }]);
    if (rb >= 0) doorsOfRoom.set(rb, [...(doorsOfRoom.get(rb) ?? []), { x, y }]);
  };

  // Seed existing stairwell doors into doorsOfRoom
  for (const d of b.doors) {
    const ew = PASSABLE.has(b.tiles[idx(d.x - 1, d.y)]) && PASSABLE.has(b.tiles[idx(d.x + 1, d.y)]);
    const ra = ew ? b.roomOf[idx(d.x - 1, d.y)] : b.roomOf[idx(d.x, d.y - 1)];
    const rb = ew ? b.roomOf[idx(d.x + 1, d.y)] : b.roomOf[idx(d.x, d.y + 1)];
    d.kind = d.kind ?? "stair";
    d.rooms = [ra, rb];
    d.reason = d.reason ?? "wejście na klatkę schodową";
    if (ra >= 0) doorsOfRoom.set(ra, [...(doorsOfRoom.get(ra) ?? []), { x: d.x, y: d.y }]);
    if (rb >= 0) doorsOfRoom.set(rb, [...(doorsOfRoom.get(rb) ?? []), { x: d.x, y: d.y }]);
  }

  // Cell mask for legal interior lot space (keeping 1-tile wall margin from all existing floors/reserved/voids).
  const isCleanInterior = (x: number, y: number) => {
    if (x < xMin || x > xMax || y < yMin || y > yMax) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inb(nx, ny)) return false;
        const ni = idx(nx, ny);
        if (b.tiles[ni] !== Tile.Wall || reserved[ni] || isVoid(nx, ny)) return false;
      }
    }
    return true;
  };

  const canLot = (x: number, y: number, w: number, h: number) => {
    if (x < xMin || y < yMin || x + w - 1 > xMax || y + h - 1 > yMax) return false;
    for (let yy = y - 1; yy <= y + h; yy++) {
      for (let xx = x - 1; xx <= x + w; xx++) {
        const ni = idx(xx, yy);
        if (b.tiles[ni] !== Tile.Wall || reserved[ni] || isVoid(xx, yy)) return false;
      }
    }
    return true;
  };

  // Scan clean interior wall pockets and pick largest varied multi-room apartment lots.
  interface CandidateLot {
    x: number;
    y: number;
    w: number;
    h: number;
    touchSides: Side[];
    touches: CorridorTouch[];
  }

  const findNextLot = (minW: number, minH: number, maxW: number, maxH: number): CandidateLot | null => {
    const clean = new Uint8Array(W * H);
    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        if (isCleanInterior(x, y)) clean[idx(x, y)] = 1;
      }
    }
    // Expand horizontal run lengths right-to-left
    const runW = new Uint8Array(W * H);
    for (let y = yMin; y <= yMax; y++) {
      let run = 0;
      for (let x = xMax; x >= xMin; x--) {
        run = clean[idx(x, y)] ? run + 1 : 0;
        runW[idx(x, y)] = run;
      }
    }
    const bests: { lot: CandidateLot; score: number }[] = [];
    for (let y = yMin; y <= yMax - minH + 1; y++) {
      for (let x = xMin; x <= xMax - minW + 1; x++) {
        if (runW[idx(x, y)] < minW) continue;
        // Try bounded heights and cap width cleanly to apartment scales
        let mw = Math.min(maxW, runW[idx(x, y)]);
        for (let h = 1; h <= maxH && y + h - 1 <= yMax; h++) {
          const rw = runW[idx(x, y + h - 1)];
          if (rw < minW) break;
          mw = Math.min(mw, rw);
          if (h < minH) continue;
          // Only probe meaningful largest sizes at each anchor (avoid tiny redundant checks)
          const touches = findCorridorTouches(b, x, y, mw, h);
          if (!touches.length) continue;
          const touchSides = Array.from(new Set(touches.map((t) => t.side)));
          // Prefer real multi-room footprints touching 2+ distinct corridor sides (bypasses & corners!)
          const area = mw * h;
          const score = area + touchSides.length * 14 + rng() * 18;
          bests.push({ lot: { x, y, w: mw, h, touchSides, touches }, score });
        }
      }
    }
    if (!bests.length) return null;
    bests.sort((a, c) => c.score - a.score);
    // Pick among the top few slightly randomized for natural seed diversity
    const pick = bests[rng.int(Math.min(4, bests.length))].lot;
    // Allow organic proportion tweaks inside very large open zones (splits huge empty strip into 2 authentic flats!)
    let lw = pick.w;
    let lh = pick.h;
    if (lw >= 16 && rng.chance(0.55)) lw = 11 + rng.int(4);
    if (lh >= 15 && rng.chance(0.55)) lh = 10 + rng.int(4);
    if (canLot(pick.x, pick.y, lw, lh)) {
      const touches = findCorridorTouches(b, pick.x, pick.y, lw, lh);
      if (touches.length) {
        return { x: pick.x, y: pick.y, w: lw, h: lh, touchSides: Array.from(new Set(touches.map((t) => t.side))), touches };
      }
    }
    return pick;
  };

  // Track which families have been created so every floor showcases rich functional diversity!
  const familyUsed = new Map<ApartmentFamily, number>();
  const allowMoreBypass = floorFamily === 4; // MIESZKANIA PRZECHODNIE loves bypass-linked flats
  let bypassCount = 0;
  let hasTechSuite = false;

  const chooseFamily = (lot: CandidateLot): ApartmentFamily[] => {
    const w = lot.w;
    const h = lot.h;
    const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
    const hasPerp =
      (lot.touchSides.includes("n") || lot.touchSides.includes("s")) &&
      (lot.touchSides.includes("e") || lot.touchSides.includes("w"));
    const hasOpp =
      (lot.touchSides.includes("n") && lot.touchSides.includes("s")) ||
      (lot.touchSides.includes("e") && lot.touchSides.includes("w"));

    if (index === 0) {
      // Basement: rich functional technical suites + caretaker service rooms + remodeled link
      const list: ApartmentFamily[] = ["zaplecze", "uslugowy"];
      if ((hasOpp || aspect >= 1.45) && Math.max(w, h) >= 11) list.unshift("zaplecze");
      if (rng.chance(0.28) && w >= 9 && h >= 8) list.push("kawalerka");
      return list;
    }
    if (index === 1) {
      // Lobby / Ground floor: mix of commercial, technical zaplecze, plus authentic ground-floor apartments
      const list: ApartmentFamily[] = [];
      if (!hasTechSuite) list.push("zaplecze");
      list.push(rng.chance(0.45) ? "uslugowy" : "dwupokojowe");
      if (hasPerp && w >= 9 && h >= 8) list.push("narozne");
      if (hasOpp || aspect >= 1.5) list.push("wydluzone");
      if (w >= 11 && h >= 9) list.push("przebudowane", "rodzinne");
      list.push("kawalerka", "zaplecze");
      return list;
    }

    // Residential floors 2..9: all 6 residential families + 1 authentic floor technical suite!
    if (!hasTechSuite && b.apartments.length >= 2 && w >= 8 && h >= 5 && w <= 12 && h <= 11) {
      return ["zaplecze", "uslugowy", "kawalerka"];
    }
    const candidates: ApartmentFamily[] = [];
    if (Math.min(w, h) >= 9 && Math.max(w, h) >= 11) {
      candidates.push("rodzinne", "przebudowane", "dwupokojowe");
    }
    if (hasPerp && Math.min(w, h) >= 7 && Math.max(w, h) >= 9) {
      candidates.push("narozne");
    }
    if ((aspect >= 1.45 || hasOpp || allowMoreBypass) && Math.max(w, h) >= 10) {
      candidates.push("wydluzone");
    }
    if (Math.min(w, h) >= 7 && Math.max(w, h) >= 10) {
      candidates.push("przebudowane");
    }
    if (Math.min(w, h) >= 7 && Math.max(w, h) >= 9) {
      candidates.push("dwupokojowe");
    }
    candidates.push("kawalerka");
    // Bias toward families not yet present on this floor for maximum genuine variety!
    const unique = Array.from(new Set(candidates));
    unique.sort((a, c) => (familyUsed.get(a) ?? 0) - (familyUsed.get(c) ?? 0) + (rng() - 0.5) * 0.8);
    // Slight preference to geometry fit
    if (hasPerp && !familyUsed.has("narozne") && unique.includes("narozne")) {
      return ["narozne", ...unique.filter((f) => f !== "narozne")];
    }
    if (aspect >= 1.6 && unique.includes("wydluzone")) {
      return ["wydluzone", ...unique.filter((f) => f !== "wydluzone")];
    }
    if (allowMoreBypass && unique.includes("przebudowane") && rng.chance(0.5)) {
      return ["przebudowane", ...unique.filter((f) => f !== "przebudowane")];
    }
    return unique;
  };

  /** Picks best corridor entry door for a single room along preferred side (or any touching corridor side). */
  const pickEntryTouch = (room: Room, preferredSide?: Side, minGlobal = 3): CorridorTouch | null => {
    const all = findCorridorTouches(b, room.x, room.y, room.w, room.h);
    const bySide = preferredSide ? all.filter((t) => t.side === preferredSide) : all;
    const list = bySide.length ? bySide : all;
    if (!list.length) return null;
    const picked = pickDoorOnSegment(
      list.map((t) => ({ wall: t.wall, far: t.outside })),
      doorsOfRoom.get(room.id) ?? [],
      b.doors,
      b.breaches,
      4,
      minGlobal,
    );
    if (!picked) {
      // Relax landing spacing to 2 only if it's genuinely a different apartment sharing a compact landing
      const relaxed = pickDoorOnSegment(
        list.map((t) => ({ wall: t.wall, far: t.outside })),
        doorsOfRoom.get(room.id) ?? [],
        b.doors,
        b.breaches,
        4,
        2,
      );
      if (!relaxed) return null;
      return list.find((t) => t.wall.x === relaxed.wall.x && t.wall.y === relaxed.wall.y) ?? null;
    }
    return list.find((t) => t.wall.x === picked.wall.x && t.wall.y === picked.wall.y) ?? null;
  };

  // Stage 1: Place primary multi-room apartments across all large buildable regions.
  for (let iter = 0; iter < 22; iter++) {
    const lot = findNextLot(7, 5, 16, 14);
    if (!lot) break;
    // Choose corridor side with the longest contact for apartment primary entry
    const sidesShuffled = lot.touchSides.slice().sort((a, c) => {
      const ca = lot.touches.filter((t) => t.side === a).length;
      const cc = lot.touches.filter((t) => t.side === c).length;
      return cc - ca + (rng() - 0.5) * 4;
    });
    const order = chooseFamily(lot);
    let placed = false;

    for (const fam of order) {
      if (placed) break;
      for (const entrySide of sidesShuffled) {
        const horiz = entrySide === "n" || entrySide === "s";
        const localW = horiz ? lot.w : lot.h;
        const localH = horiz ? lot.h : lot.w;
        const openKitchen = rng.chance(0.45);
        const allowBypass = bypassCount < (allowMoreBypass ? 6 : 4);
        const plan = makeLocalPlan(fam, localW, localH, rng, decay, openKitchen, allowBypass);
        if (!plan) continue;
        const flipX = rng.chance(0.5);
        const oriented = plan.rects.map((sr) => ({
          ...sr,
          ...orientRect(sr.x, sr.y, sr.w, sr.h, localW, localH, entrySide, flipX, lot.x, lot.y),
        }));
        const entryIdx = oriented.findIndex((r) => r.isEntry);
        if (entryIdx < 0) continue;
        // Verify the entry room physically borders a public corridor!
        const er = oriented[entryIdx];
        const entryTouches = findCorridorTouches(b, er.x, er.y, er.w, er.h);
        if (!entryTouches.length) continue;

        // Materialize rooms cleanly!
        const aptId = b.apartments.length;
        const created: Room[] = [];
        for (const sr of oriented) {
          const rm = createRoom(b, sr.x, sr.y, sr.w, sr.h, sr.zone, decay, service, rng, aptId);
          created.push(rm);
        }

        // 1) Primary corridor entry door
        const entryRoom = created[entryIdx];
        const entryPick = pickEntryTouch(entryRoom, entrySide, 3);
        if (!entryPick) {
          // Roll back rooms cleanly (should be rare)
          for (const rm of created) {
            for (let yy = rm.y; yy < rm.y + rm.h; yy++) {
              for (let xx = rm.x; xx < rm.x + rm.w; xx++) {
                b.tiles[idx(xx, yy)] = Tile.Wall;
                b.roomOf[idx(xx, yy)] = -1;
                b.floorStyle[idx(xx, yy)] = 0;
              }
            }
          }
          b.rooms.length -= created.length;
          b.roomZones.length -= created.length;
          b.roomWs.length -= created.length;
          b.zones.length -= created.length;
          continue;
        }
        const corrRid = b.roomOf[idx(entryPick.outside.x, entryPick.outside.y)];
        const entryBarricaded = !service && decay >= 0.06 && plan.wantsBypass && rng.chance(0.14 + decay * 0.12);
        registerDoor(
          b,
          entryPick.wall.x,
          entryPick.wall.y,
          "entry",
          [entryRoom.id, corrRid],
          `wejście główne: ${FAMILY_LABEL[plan.family]} #${aptId + 1}`,
          entryBarricaded,
        );

        // 2) Planned internal room-to-room spanning-tree openings (at most 1 door per pair!)
        for (const edge of plan.edges) {
          const ra = created[edge.a];
          const rb = created[edge.b];
          const key = pairKey(ra.id, rb.id);
          if (connectedPairs.has(key)) continue;
          const border = sharedBoundary(ra, rb).filter((c) => b.tiles[idx(c.x, c.y)] === Tile.Wall);
          if (!border.length) continue;
          const aIsHall = b.zones[ra.id] === "hall";
          const bIsHall = b.zones[rb.id] === "hall";
          // Entry hall (PRZEDPOKÓJ) may distribute into nearby rooms (>=2 tiles); all other rooms keep generous spacing (>=3..4)
          const minSelf = aIsHall || bIsHall ? 2 : 3;
          const existing = [...(doorsOfRoom.get(ra.id) ?? []), ...(doorsOfRoom.get(rb.id) ?? [])];
          const chosen =
            pickDoorOnSegment(border.map((wall) => ({ wall })), existing, b.doors, b.breaches, minSelf, 2) ??
            { wall: border[Math.floor(border.length / 2)] };
          if (edge.breach) {
            recordBreach(b, chosen.wall.x, chosen.wall.y, b.floorStyle[idx(ra.x, ra.y)]);
            connectedPairs.add(key);
            doorsOfRoom.set(ra.id, [...(doorsOfRoom.get(ra.id) ?? []), chosen.wall]);
            doorsOfRoom.set(rb.id, [...(doorsOfRoom.get(rb.id) ?? []), chosen.wall]);
          } else {
            registerDoor(b, chosen.wall.x, chosen.wall.y, "internal", [ra.id, rb.id], edge.reason, false);
          }
        }

        // Verify all rooms in apartment are connected internally (fallback if a weird split made overlap 0)
        const reached = new Set<number>([entryIdx]);
        let grew = true;
        while (grew) {
          grew = false;
          for (let i = 0; i < created.length; i++) {
            if (reached.has(i)) continue;
            for (const j of reached) {
              if (connectedPairs.has(pairKey(created[i].id, created[j].id))) {
                reached.add(i);
                grew = true;
                break;
              }
            }
          }
          if (!grew && reached.size < created.length) {
            // Connect any isolated child via a single clean internal door along shared wall
            for (let i = 0; i < created.length; i++) {
              if (reached.has(i)) continue;
              let linked = false;
              for (const j of reached) {
                const border = sharedBoundary(created[i], created[j]).filter((c) => b.tiles[idx(c.x, c.y)] === Tile.Wall);
                if (!border.length) continue;
                const mid = border[Math.floor(border.length / 2)];
                registerDoor(b, mid.x, mid.y, "internal", [created[i].id, created[j].id], "połączenie wewnętrzne");
                reached.add(i);
                linked = true;
                grew = true;
                break;
              }
              if (linked) break;
            }
          }
        }

        // 3) Optional justified secondary tactical exit (bypass to a genuinely distant corridor section!)
        let secondaryExit: ApartmentInfo["secondaryExit"];
        const wantSec = plan.wantsBypass || (allowMoreBypass && created.length >= 3 && bypassCount < 6);
        if (wantSec && created.length >= 2) {
          let bestSec: { room: Room; touch: CorridorTouch; detour: number; score: number } | null = null;
          for (let ci = 0; ci < created.length; ci++) {
            const rm = created[ci];
            const spec = oriented[ci];
            if (ci === entryIdx) continue; // never put second corridor door on same room right beside entry!
            if (b.zones[rm.id] === "bath" || b.zones[rm.id] === "storage") continue; // wet rooms & closets stay dead-ends!
            if (!spec.canBypass && !allowMoreBypass) continue;
            const touches = findCorridorTouches(b, rm.x, rm.y, rm.w, rm.h);
            for (const t of touches) {
              // Must be well away from primary entry door (both physically AND along public corridor!)
              const straight = manhattan(t.wall, entryPick.wall);
              if (straight < 7) continue;
              if (b.doors.some((d) => manhattan(d, t.wall) <= 3)) continue;
              const rmDoors = doorsOfRoom.get(rm.id) ?? [];
              const minInternal = rmDoors.length ? Math.min(...rmDoors.map((d) => manhattan(d, t.wall))) : 99;
              if (minInternal < 4) continue; // must traverse the room meaningfully!
              const detour = corridorWalkDist(b.tiles, b.roomOf, b.roomZones, entryPick.outside, t.outside, 42);
              if (detour < 10) continue; // must genuinely bypass a substantial stretch of corridor!
              const score = detour * 1.4 + straight + Math.min(minInternal, 10) * 1.5;
              if (!bestSec || score > bestSec.score) bestSec = { room: rm, touch: t, detour, score };
            }
          }
          if (bestSec) {
            const cRid = b.roomOf[idx(bestSec.touch.outside.x, bestSec.touch.outside.y)];
            const secBar = !service && decay >= 0.15 && rng.chance(0.22 + decay * 0.1);
            const reason = plan.bypassReason || "drugie wyjście — obejście korytarza";
            registerDoor(b, bestSec.touch.wall.x, bestSec.touch.wall.y, "bypass", [bestSec.room.id, cRid], reason, secBar);
            secondaryExit = { x: bestSec.touch.wall.x, y: bestSec.touch.wall.y, reason, detour: bestSec.detour };
            bypassCount++;
          }
        }

        const apt: ApartmentInfo = {
          id: aptId,
          family: plan.family,
          label: `${FAMILY_LABEL[plan.family]} #${aptId + 1}`,
          roomIds: created.map((r) => r.id),
          entryDoor: { x: entryPick.wall.x, y: entryPick.wall.y },
          ...(secondaryExit ? { secondaryExit } : {}),
          isBypass: !!secondaryExit,
          ...(plan.plumbingEdge ? { plumbingEdge: orientEdge(plan.plumbingEdge, entrySide, flipX) } : {}),
          bounds: { x: lot.x, y: lot.y, w: lot.w, h: lot.h },
        };
        b.apartments.push(apt);
        allCreated.push(...created);
        familyUsed.set(plan.family, (familyUsed.get(plan.family) ?? 0) + 1);
        if (plan.family === "zaplecze") hasTechSuite = true;
        placed = true;
        break;
      }
    }
    if (!placed) {
      // Reserve failed region so we don't infinite-loop on an unusable nook; handled by pass 2.
      break;
    }
  }

  // Stage 2: Fill clean remaining corridor-facing medium/compact pockets with purposeful single rooms
  // (auxiliary technical closets: PRALNIA, SCHOWEK, WARSZTAT, KOTŁOWNIA, LOKAL UŻYTKOWY, or compact room)
  const auxPool: Zone[] = service
    ? ["workshop", "storage", "boiler", "laundry", "office"]
    : ["storage", "laundry", "workshop", "office", "boiler"];
  let auxCursor = rng.int(auxPool.length);

  for (let iter = 0; iter < 18; iter++) {
    const pocket = findNextLot(4, 4, 8, 7);
    if (!pocket) break;
    // Try fitting a tidy 2-room studio if room permits (7x6+)
    const tryStudio = !service && pocket.w >= 7 && pocket.h >= 6 && rng.chance(0.4);
    if (tryStudio) {
      const entrySide = pocket.touchSides[0];
      const horiz = entrySide === "n" || entrySide === "s";
      const plan = makeLocalPlan("kawalerka", horiz ? pocket.w : pocket.h, horiz ? pocket.h : pocket.w, rng, decay, true, false);
      if (plan) {
        const flipX = rng.chance(0.5);
        const oriented = plan.rects.map((sr) => ({
          ...sr,
          ...orientRect(sr.x, sr.y, sr.w, sr.h, horiz ? pocket.w : pocket.h, horiz ? pocket.h : pocket.w, entrySide, flipX, pocket.x, pocket.y),
        }));
        const er = oriented[0];
        if (findCorridorTouches(b, er.x, er.y, er.w, er.h).length) {
          const aptId = b.apartments.length;
          const created = oriented.map((sr) => createRoom(b, sr.x, sr.y, sr.w, sr.h, sr.zone, decay, service, rng, aptId));
          const pick = pickEntryTouch(created[0], entrySide, 3);
          if (pick) {
            registerDoor(b, pick.wall.x, pick.wall.y, "entry", [created[0].id, b.roomOf[idx(pick.outside.x, pick.outside.y)]], `wejście: Kawalerka #${aptId + 1}`);
            for (const edge of plan.edges) {
              const border = sharedBoundary(created[edge.a], created[edge.b]).filter((c) => b.tiles[idx(c.x, c.y)] === Tile.Wall);
              if (border.length) {
                const chosen = pickDoorOnSegment(border.map((wall) => ({ wall })), doorsOfRoom.get(created[edge.a].id) ?? [], b.doors, b.breaches, 3, 2) ?? { wall: border[Math.floor(border.length / 2)] };
                registerDoor(b, chosen.wall.x, chosen.wall.y, "internal", [created[edge.a].id, created[edge.b].id], edge.reason);
              }
            }
            b.apartments.push({
              id: aptId,
              family: "kawalerka",
              label: `Kawalerka #${aptId + 1}`,
              roomIds: created.map((r) => r.id),
              entryDoor: { x: pick.wall.x, y: pick.wall.y },
              isBypass: false,
              bounds: { x: pocket.x, y: pocket.y, w: pocket.w, h: pocket.h },
            });
            allCreated.push(...created);
            familyUsed.set("kawalerka", (familyUsed.get("kawalerka") ?? 0) + 1);
            continue;
          } else {
            for (const rm of created) {
              for (let yy = rm.y; yy < rm.y + rm.h; yy++) for (let xx = rm.x; xx < rm.x + rm.w; xx++) {
                b.tiles[idx(xx, yy)] = Tile.Wall; b.roomOf[idx(xx, yy)] = -1; b.floorStyle[idx(xx, yy)] = 0;
              }
            }
            b.rooms.length -= created.length; b.roomZones.length -= created.length;
            b.roomWs.length -= created.length; b.zones.length -= created.length;
          }
        }
      }
    }

    // Otherwise clean single functional auxiliary space (1 single justified door!)
    const zone = auxPool[auxCursor++ % auxPool.length];
    const aptId = b.apartments.length;
    const rm = createRoom(b, pocket.x, pocket.y, pocket.w, pocket.h, zone, decay, service, rng, aptId);
    const pick = pickEntryTouch(rm, undefined, 3);
    if (!pick) {
      for (let yy = rm.y; yy < rm.y + rm.h; yy++) for (let xx = rm.x; xx < rm.x + rm.w; xx++) {
        b.tiles[idx(xx, yy)] = Tile.Wall; b.roomOf[idx(xx, yy)] = -1; b.floorStyle[idx(xx, yy)] = 0;
      }
      b.rooms.pop(); b.roomZones.pop(); b.roomWs.pop(); b.zones.pop();
      break;
    }
    registerDoor(b, pick.wall.x, pick.wall.y, "service", [rm.id, b.roomOf[idx(pick.outside.x, pick.outside.y)]], `wejście techniczne: ${ZONE_LABEL[zone]}`);
    const fam: ApartmentFamily = zone === "office" ? "uslugowy" : "zaplecze";
    b.apartments.push({
      id: aptId,
      family: fam,
      label: `${ZONE_LABEL[zone]} #${aptId + 1}`,
      roomIds: [rm.id],
      entryDoor: { x: pick.wall.x, y: pick.wall.y },
      isBypass: false,
      bounds: { x: pocket.x, y: pocket.y, w: pocket.w, h: pocket.h },
    });
    allCreated.push(rm);
  }

  // Stage 3: Ensure essential game zone roles exist logically inside apartments/technical units
  // (keeps weapon progression, med/ammo/battery spawns, gas/steam hazards 100% contextual!)
  const ensureZone = (want: Zone[], fallbackCandidates: Zone[], newZone: Zone) => {
    if (allCreated.some((r) => want.includes(b.zones[r.id]))) return;
    const target =
      allCreated.find((r) => fallbackCandidates.includes(b.zones[r.id]) && r.w >= 4 && r.h >= 3) ??
      allCreated.find((r) => b.zones[r.id] !== "hall" && r.w >= 4 && r.h >= 3);
    if (!target) return;
    b.zones[target.id] = newZone;
    b.roomZones[target.id] = ZONE_LABEL[newZone];
    target.functionRole = ZONE_ROLE[newZone];
    const st = zoneSurfaceStyle(newZone, decay, service);
    b.roomWs[target.id] = st.ws;
    for (let yy = target.y; yy < target.y + target.h; yy++) {
      for (let xx = target.x; xx < target.x + target.w; xx++) b.floorStyle[idx(xx, yy)] = st.fs;
    }
  };
  ensureZone(["workshop"], ["office", "boiler", "storage", "kitchen"], "workshop");
  ensureZone(["storage"], ["boiler", "laundry", "office"], "storage");
  ensureZone(["bath", "laundry"], ["storage", "kitchen"], service ? "laundry" : "bath");
  ensureZone(["kitchen", "boiler"], ["workshop", "storage"], service ? "boiler" : "kitchen");
  if (!service) {
    ensureZone(["bedroom"], ["nursery", "living", "office"], "bedroom");
    ensureZone(["living"], ["office"], "living");
  } else if (index === 1) {
    ensureZone(["office"], ["workshop", "storage"], "office");
  }

  // Guarantee at least 2 useful tactical apartment bypasses on residential floors (and >=1 on ground/basement)
  const targetBypasses = service ? 1 : allowMoreBypass ? 4 : 2;
  if (bypassCount < targetBypasses) {
    for (const apt of b.apartments) {
      if (bypassCount >= targetBypasses) break;
      if (apt.isBypass || apt.roomIds.length < 2) continue;
      const entryRoomId = b.doors.find((d) => d.x === apt.entryDoor.x && d.y === apt.entryDoor.y)?.rooms?.[0] ?? apt.roomIds[0];
      const entryOutside = (() => {
        const d = apt.entryDoor;
        for (const [dx, dy] of N4) {
          const rid = b.roomOf[idx(d.x + dx, d.y + dy)];
          if (rid >= 0 && b.roomZones[rid] === "KORYTARZ") return { x: d.x + dx, y: d.y + dy };
        }
        return d;
      })();
      let best: { room: Room; touch: CorridorTouch; detour: number } | null = null;
      for (const rid of apt.roomIds) {
        if (rid === entryRoomId) continue;
        const z = b.zones[rid];
        if (z === "bath" || z === "storage") continue;
        const rm = b.rooms[rid];
        for (const t of findCorridorTouches(b, rm.x, rm.y, rm.w, rm.h)) {
          if (manhattan(t.wall, apt.entryDoor) < 7) continue;
          if (b.doors.some((d) => manhattan(d, t.wall) <= 3)) continue;
          const rds = doorsOfRoom.get(rid) ?? [];
          if (rds.some((d) => manhattan(d, t.wall) < 4)) continue;
          const detour = corridorWalkDist(b.tiles, b.roomOf, b.roomZones, entryOutside, t.outside, 42);
          if (detour < 10) continue;
          if (!best || detour > best.detour) best = { room: rm, touch: t, detour };
        }
      }
      if (best) {
        const reason = service ? "wyjście techniczne (obejście korytarza)" : "drugie wyjście — obejście korytarza";
        registerDoor(
          b,
          best.touch.wall.x,
          best.touch.wall.y,
          "bypass",
          [best.room.id, b.roomOf[idx(best.touch.outside.x, best.touch.outside.y)]],
          reason,
          false,
        );
        apt.secondaryExit = { x: best.touch.wall.x, y: best.touch.wall.y, reason, detour: best.detour };
        apt.isBypass = true;
        bypassCount++;
      }
    }
  }

  return allCreated;
}

/**
 * Local door-audit & repair pass: removes duplicate connections between the same room pair,
 * slides or removes accidentally adjacent doors on the same non-hallway room, and guarantees
 * unobstructed approaches on both sides of every threshold.
 */
export function auditAndRepairDoors(b: FloorBuild): void {
  const isGlobalConnected = (ignoreDoor?: DoorInfo): boolean => {
    const startIdx = b.tiles.findIndex((t, i) => t === Tile.Floor && b.roomOf[i] >= 0 && b.roomZones[b.roomOf[i]] === "KORYTARZ");
    if (startIdx < 0) return false;
    const seen = new Uint8Array(W * H);
    const q: number[] = [startIdx];
    seen[startIdx] = 1;
    const blockedIdx = ignoreDoor ? idx(ignoreDoor.x, ignoreDoor.y) : -1;
    for (let head = 0; head < q.length; head++) {
      const p = q[head];
      const x = p % W;
      const y = Math.floor(p / W);
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inb(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (ni === blockedIdx || seen[ni] || !PASSABLE.has(b.tiles[ni])) continue;
        seen[ni] = 1;
        q.push(ni);
      }
    }
    for (const r of b.rooms) {
      if (b.roomZones[r.id] === "KORYTARZ") continue;
      if (!seen[idx(r.x, r.y)]) return false;
    }
    return true;
  };

  const doorSides = (d: DoorInfo): [number, number] => {
    const ew = PASSABLE.has(b.tiles[idx(d.x - 1, d.y)]) && PASSABLE.has(b.tiles[idx(d.x + 1, d.y)]);
    if (ew) return [b.roomOf[idx(d.x - 1, d.y)], b.roomOf[idx(d.x + 1, d.y)]];
    return [b.roomOf[idx(d.x, d.y - 1)], b.roomOf[idx(d.x, d.y + 1)]];
  };

  const removeDoor = (d: DoorInfo) => {
    b.tiles[idx(d.x, d.y)] = Tile.Wall;
    const k = b.doors.indexOf(d);
    if (k >= 0) b.doors.splice(k, 1);
    b.repairsApplied++;
  };

  // 1) Strip any duplicate door joining the exact same pair of spaces (room-room or same room-corridor twice!).
  const seenPairs = new Map<string, DoorInfo>();
  for (const d of b.doors.slice()) {
    if (d.route || d.sealed || d.locked) continue;
    const [ra, rb] = doorSides(d);
    if (ra < 0 || rb < 0) continue;
    const aCorr = b.roomZones[ra] === "KORYTARZ";
    const bCorr = b.roomZones[rb] === "KORYTARZ";
    const key = aCorr !== bCorr ? `corr:${aCorr ? rb : ra}` : pairKey(ra, rb);
    const prev = seenPairs.get(key);
    if (!prev) {
      seenPairs.set(key, d);
      continue;
    }
    // Same room connected to KORYTARZ twice -> only allow if far apart (genuine bypass across room length >= 7)
    if (aCorr !== bCorr && d.kind === "bypass" && manhattan(prev, d) >= 7) continue;
    if (isGlobalConnected(d)) {
      removeDoor(d);
    } else if (isGlobalConnected(prev)) {
      removeDoor(prev);
      seenPairs.set(key, d);
    }
  }

  // 2) For every non-hallway room with >=2 doors spaced < 4 tiles apart, slide one along its shared wall!
  for (const r of b.rooms) {
    const z = b.zones[r.id];
    if (z === "corridor" || z === "hall" || z === "stair") continue;
    const rDoors = b.doors.filter((d) => {
      if (d.route || d.sealed) return false;
      const [a, c] = doorSides(d);
      return a === r.id || c === r.id;
    });
    if (rDoors.length < 2) continue;
    for (let i = 0; i < rDoors.length; i++) {
      for (let j = i + 1; j < rDoors.length; j++) {
        const d1 = rDoors[i];
        const d2 = rDoors[j];
        if (!b.doors.includes(d1) || !b.doors.includes(d2)) continue;
        if (manhattan(d1, d2) >= 4) continue;
        // Slide d2 along the actual shared border between its two rooms to maximize separation from d1!
        const [a, c] = doorSides(d2);
        const other = a === r.id ? c : a;
        if (other < 0) continue;
        const candidates: Cell[] =
          b.roomZones[other] === "KORYTARZ"
            ? findCorridorTouches(b, r.x, r.y, r.w, r.h).map((t) => t.wall)
            : sharedBoundary(r, b.rooms[other]).filter((p) => b.tiles[idx(p.x, p.y)] === Tile.Wall);
        let best: Cell | null = null;
        let bestDist = manhattan(d1, d2);
        for (const p of candidates) {
          if (b.doors.some((od) => od !== d2 && manhattan(od, p) <= 2)) continue;
          const dist = manhattan(d1, p);
          if (dist > bestDist) {
            bestDist = dist;
            best = p;
          }
        }
        if (best && bestDist >= 4) {
          b.tiles[idx(d2.x, d2.y)] = Tile.Wall;
          d2.x = best.x;
          d2.y = best.y;
          b.tiles[idx(d2.x, d2.y)] = Tile.Door;
          b.repairsApplied++;
        } else if (d2.kind === "bypass" && isGlobalConnected(d2)) {
          removeDoor(d2);
          // Clear stale secondaryExit marker on owning apartment
          for (const apt of b.apartments) {
            if (apt.secondaryExit && apt.secondaryExit.x === d2.x && apt.secondaryExit.y === d2.y) {
              apt.secondaryExit = undefined;
              apt.isBypass = false;
            }
          }
        }
      }
    }
  }

  // Recompute clean doorway threshold occupancy buffer (both sides clear of furniture!)
  b.occ.fill(0);
  for (const d of b.doors) {
    b.occ[idx(d.x, d.y)] = 1;
    for (const [dx, dy] of N4) if (inb(d.x + dx, d.y + dy)) b.occ[idx(d.x + dx, d.y + dy)] = 1;
  }
  for (const br of b.breaches) {
    b.occ[idx(br.x, br.y)] = 1;
    for (const [dx, dy] of N4) if (inb(br.x + dx, br.y + dy)) b.occ[idx(br.x + dx, br.y + dy)] = 1;
  }
}

/* ==================== FUNCTIONAL INTERIOR FURNITURE SETS ==================== */

function roomEntries(b: FloorBuild, r: Room): Cell[] {
  const entries: Cell[] = [];
  const check = (wx: number, wy: number, ix: number, iy: number) => {
    if (!inb(wx, wy)) return;
    const t = b.tiles[idx(wx, wy)];
    if (t === Tile.Door || t === Tile.DoorOpen || b.breaches.some((br) => br.x === wx && br.y === wy)) {
      entries.push({ x: ix, y: iy });
    }
  };
  for (let x = r.x; x < r.x + r.w; x++) {
    check(x, r.y - 1, x, r.y);
    check(x, r.y + r.h, x, r.y + r.h - 1);
  }
  for (let y = r.y; y < r.y + r.h; y++) {
    check(r.x - 1, y, r.x, y);
    check(r.x + r.w, y, r.x + r.w - 1, y);
  }
  return entries;
}

/** Verifies every solid tile added keeps ALL room doors AND ALL existing props' interaction cells connected! */
function roomStaysConnected(
  b: FloorBuild,
  r: Room,
  entries: Cell[],
  mustReach: Cell[],
  testX: number,
  testY: number,
  testW: number,
  testH: number,
): boolean {
  if (!entries.length) return true;
  const blocked = new Uint8Array(r.w * r.h);
  const ri = (x: number, y: number) => (y - r.y) * r.w + (x - r.x);
  for (const p of b.props) {
    if (!p.solid) continue;
    for (let yy = Math.max(r.y, p.y); yy < Math.min(r.y + r.h, p.y + p.h); yy++) {
      for (let xx = Math.max(r.x, p.x); xx < Math.min(r.x + r.w, p.x + p.w); xx++) blocked[ri(xx, yy)] = 1;
    }
  }
  for (let yy = testY; yy < testY + testH; yy++) {
    for (let xx = testX; xx < testX + testW; xx++) {
      if (xx < r.x || yy < r.y || xx >= r.x + r.w || yy >= r.y + r.h) return false;
      blocked[ri(xx, yy)] = 1;
    }
  }
  const s = entries[0];
  if (blocked[ri(s.x, s.y)]) return false;
  const seen = new Uint8Array(r.w * r.h);
  const q: number[] = [ri(s.x, s.y)];
  seen[q[0]] = 1;
  for (let head = 0; head < q.length; head++) {
    const cur = q[head];
    const x = r.x + (cur % r.w);
    const y = r.y + Math.floor(cur / r.w);
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < r.x || ny < r.y || nx >= r.x + r.w || ny >= r.y + r.h) continue;
      const k = ri(nx, ny);
      if (seen[k] || blocked[k]) continue;
      if (!PASSABLE.has(b.tiles[idx(nx, ny)])) continue;
      seen[k] = 1;
      q.push(k);
    }
  }
  for (const e of entries) if (!seen[ri(e.x, e.y)]) return false;
  for (const m of mustReach) {
    if (m.x >= r.x && m.y >= r.y && m.x < r.x + r.w && m.y < r.y + r.h && !seen[ri(m.x, m.y)]) return false;
  }
  return true;
}

/** Finds best interaction standing tile directly facing/adjacent to prop inside room (prefers front/south for 3/4 readability). */
function bestAccessCell(
  b: FloorBuild,
  r: Room,
  x: number,
  y: number,
  w: number,
  h: number,
  solidCheck = true,
  preferSouth = true,
): Cell | null {
  const dirs: Cell[] = preferSouth
    ? [
        ...Array.from({ length: w }, (_, k) => ({ x: x + k, y: y + h })),
        { x: x - 1, y },
        { x: x + w, y },
        ...Array.from({ length: w }, (_, k) => ({ x: x + k, y: y - 1 })),
      ]
    : [
        ...Array.from({ length: w }, (_, k) => ({ x: x + k, y: y - 1 })),
        ...Array.from({ length: w }, (_, k) => ({ x: x + k, y: y + h })),
        { x: x - 1, y },
        { x: x + w, y },
      ];
  for (const c of dirs) {
    if (c.x < r.x || c.y < r.y || c.x >= r.x + r.w || c.y >= r.y + r.h) continue;
    if (b.tiles[idx(c.x, c.y)] !== Tile.Floor) continue;
    if (solidCheck && b.props.some((p) => p.solid && c.x >= p.x && c.x < p.x + p.w && c.y >= p.y && c.y < p.y + p.h)) continue;
    return c;
  }
  return null;
}

function createPropRecord(
  b: FloorBuild,
  kind: PropKind,
  x: number,
  y: number,
  w: number,
  h: number,
  solid: boolean,
  access: Cell | null,
  role: PropAccessPoint["role"] = "furniture",
  label?: string,
): Prop {
  const p: Prop = { id: b.props.length, kind, x, y, w, h, solid, loot: null, opened: false, ...(label ? { label } : {}) };
  b.props.push(p);
  if (solid) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) b.occ[idx(xx, yy)] = 1;
  }
  if (access) {
    b.propAccess.push({ propId: p.id, kind, x, y, ax: access.x, ay: access.y, role });
  }
  return p;
}

interface RoomPlacer {
  tryAt: (
    kind: PropKind,
    x: number,
    y: number,
    w: number,
    h: number,
    opts?: {
      needWall?: boolean;
      needNorthWall?: boolean;
      preferSouthAccess?: boolean;
      strictFront?: boolean;
      solid?: boolean;
      role?: PropAccessPoint["role"];
      label?: string;
    },
  ) => Prop | null;
  tryWall: (
    kind: PropKind,
    w: number,
    h: number,
    wallOrder: Side[],
    opts?: { preferX?: number; preferY?: number; strictFront?: boolean; role?: PropAccessPoint["role"]; label?: string; solid?: boolean },
  ) => Prop | null;
  entries: Cell[];
  accessLocked: Cell[];
}

function makePlacer(b: FloorBuild, r: Room): RoomPlacer {
  const entries = roomEntries(b, r);
  const accessLocked: Cell[] = [...entries];

  // Clear buffer around every door/breach and any staircase tile inside the room
  const nearDoor = (x: number, y: number) => {
    for (const e of entries) {
      // Exact cell right inside doorway must stay clear; also don't directly flank both orthogonal neighbors tightly
      if (e.x === x && e.y === y) return true;
      // Check tile directly across wall for doors/stairs
      for (const [dx, dy] of N4) {
        const t = b.tiles[idx(x + dx, y + dy)];
        if (t === Tile.Door || t === Tile.DoorOpen || t === Tile.StairsUp || t === Tile.StairsDown) return true;
      }
      if (b.breaches.some((br) => Math.abs(br.x - x) + Math.abs(br.y - y) <= 1)) return true;
    }
    return false;
  };

  const propAt = (x: number, y: number) =>
    b.props.some((p) => p.solid && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);

  const tryAt: RoomPlacer["tryAt"] = (kind, x, y, w, h, opts = {}) => {
    const solid = opts.solid ?? true;
    const preferSouth = opts.preferSouthAccess ?? true;
    if (x < r.x || y < r.y || x + w > r.x + r.w || y + h > r.y + r.h) return null;
    if (opts.needNorthWall && y !== r.y) return null;
    if (opts.needWall) {
      const edge = x === r.x || y === r.y || x + w === r.x + r.w || y + h === r.y + r.h;
      if (!edge) return null;
    }
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (b.tiles[idx(xx, yy)] !== Tile.Floor) return null;
        if (nearDoor(xx, yy)) return null;
        if (propAt(xx, yy)) return null;
        if (solid && accessLocked.some((c) => c.x === xx && c.y === yy)) return null;
      }
    }
    // Check strict front access (south tile right below the prop must be free inside the room for standing/hiding!)
    let access: Cell | null = null;
    if (opts.strictFront) {
      const fy = y + h;
      const okSouth =
        fy < r.y + r.h &&
        b.tiles[idx(x, fy)] === Tile.Floor &&
        !propAt(x, fy);
      if (okSouth) {
        access = { x, y: fy };
      } else {
        access = bestAccessCell(b, r, x, y, w, h, true, preferSouth);
      }
      if (!access) return null;
    } else if (solid) {
      access = bestAccessCell(b, r, x, y, w, h, true, preferSouth);
      if (!access) return null;
    } else {
      // Non-solid interactable (radio, carpet)
      access = { x, y };
    }

    if (solid) {
      const checkAccess = [...accessLocked, ...(access ? [access] : [])];
      if (!roomStaysConnected(b, r, entries, checkAccess, x, y, w, h)) return null;
    }

    const role: PropAccessPoint["role"] =
      opts.role ??
      (kind === "wardrobe" || kind === "locker"
        ? "hide"
        : kind === "tv" || kind === "radio"
          ? "device"
          : kind === "medbox" || kind === "supplycase" || kind === "crate"
            ? "loot"
            : "furniture");
    const p = createPropRecord(b, kind, x, y, w, h, solid, access, role, opts.label);
    // Lock front zone strictly for critical interactive furniture (wardrobes, lockers, devices, medbox, supplycase, stove, sink, fridge, desk)
    if (
      access &&
      solid &&
      (role === "hide" ||
        role === "device" ||
        role === "loot" ||
        kind === "fridge" ||
        kind === "stove" ||
        kind === "sink" ||
        kind === "toilet" ||
        kind === "desk" ||
        kind === "bed" ||
        kind === "sofa")
    ) {
      accessLocked.push(access);
    }
    return p;
  };

  const tryWall: RoomPlacer["tryWall"] = (kind, w, h, wallOrder, opts = {}) => {
    const px = opts.preferX ?? r.x + (r.w - w) / 2;
    const py = opts.preferY ?? r.y + (r.h - h) / 2;
    for (const side of wallOrder) {
      const spots: { x: number; y: number; d: number }[] = [];
      if (side === "n") {
        for (let x = r.x; x <= r.x + r.w - w; x++) spots.push({ x, y: r.y, d: Math.abs(x - px) });
      } else if (side === "s") {
        for (let x = r.x; x <= r.x + r.w - w; x++) spots.push({ x, y: r.y + r.h - h, d: Math.abs(x - px) });
      } else if (side === "w") {
        for (let y = r.y; y <= r.y + r.h - h; y++) spots.push({ x: r.x, y, d: Math.abs(y - py) });
      } else {
        for (let y = r.y; y <= r.y + r.h - h; y++) spots.push({ x: r.x + r.w - w, y, d: Math.abs(y - py) });
      }
      spots.sort((a, c) => a.d - c.d);
      for (const s of spots) {
        const res = tryAt(kind, s.x, s.y, w, h, {
          needWall: true,
          preferSouthAccess: side !== "s",
          strictFront: opts.strictFront,
          role: opts.role,
          label: opts.label,
          solid: opts.solid,
        });
        if (res) return res;
      }
    }
    return null;
  };

  return { tryAt, tryWall, entries, accessLocked };
}

/**
 * Furnishes a single room as a recognizable, coordinated functional furniture set,
 * oriented properly against room walls with verified walkways and clear usage zones.
 */
export function furnishRoomSet(b: FloorBuild, r: Room, zone: Zone, decay: number, rng: Rng): boolean {
  if (zone === "corridor" || zone === "stair" || r.w < 2 || r.h < 2) return false;
  const P = makePlacer(b, r);
  const mirror = rng.chance(0.5);
  const leftFirst: Side[] = mirror ? ["e", "w"] : ["w", "e"];
  const area = r.w * r.h;
  const before = b.props.length;

  const tryCarpet = (cx: number, cy: number) => {
    if (cx >= r.x && cy >= r.y && cx + 2 <= r.x + r.w && cy + 2 <= r.y + r.h) {
      createPropRecord(b, "carpet", cx, cy, 2, 2, false, null, "furniture");
    }
  };

  switch (zone) {
    case "living": {
      // Focal ensemble: sofa along north wall + carpet in front + TV directly opposite on south wall + accessible coffee table + wall bookshelf + corner plant
      const sofa = P.tryWall("sofa", 2, 1, ["n", "s", ...leftFirst], { preferX: r.x + Math.floor((r.w - 2) / 2), strictFront: true });
      if (sofa) {
        const oppositeSide: Side = sofa.y === r.y ? "s" : sofa.y === r.y + r.h - 1 ? "n" : sofa.x === r.x ? "e" : "w";
        // Soft rug nestled right between seating and TV!
        const rugY = sofa.y === r.y ? sofa.y + 1 : Math.max(r.y, sofa.y - 2);
        if (r.h >= 4 && r.w >= 4) tryCarpet(Math.max(r.x, Math.min(r.x + r.w - 2, sofa.x)), rugY);
        // TV placed directly facing the sofa across the lounge!
        const tv = P.tryWall("tv", 1, 1, [oppositeSide, ...leftFirst, "n", "s"], {
          preferX: sofa.x + (mirror ? 0 : 1),
          preferY: sofa.y,
          role: "device",
          label: "telewizor",
        });
        // Accessible coffee/side table with clear lane between sofa & TV, plus flanking side armchair!
        if (area >= 16) {
          const onTop = sofa.y === r.y;
          const onBot = sofa.y === r.y + r.h - 1;
          const midTableY = onTop && r.h >= 5 ? sofa.y + 2 : onBot && r.h >= 5 ? sofa.y - 2 : sofa.y;
          const placed =
            ((onTop || onBot) && tv && Math.abs(tv.y - sofa.y) >= 4 && P.tryAt("table", sofa.x + (mirror ? 1 : 0), midTableY, 1, 1)) ||
            P.tryAt("table", mirror ? sofa.x - 1 : sofa.x + 2, sofa.y, 1, 1) ||
            P.tryAt("table", mirror ? sofa.x + 2 : sofa.x - 1, sofa.y, 1, 1);
          // Place companion armchair cleanly flanking the carpet edge (facing seating group, keeping sightline open!)
          if (placed && area >= 22 && decay < 0.85) {
            const flankX = mirror ? sofa.x - 1 : sofa.x + 2;
            const flankY = onTop ? sofa.y + 1 : onBot ? sofa.y - 1 : sofa.y;
            P.tryAt("chair", flankX, flankY, 1, 1) ||
              P.tryAt("chair", mirror ? sofa.x + 2 : sofa.x - 1, flankY, 1, 1);
          }
        }
      } else {
        // Ultra-compact lounge: armchair + side table + TV
        P.tryWall("tv", 1, 1, ["n", "s", ...leftFirst], { role: "device", label: "telewizor" });
        P.tryWall("table", 1, 1, ["s", "n", ...leftFirst]);
      }
      // Bookshelf standing tall along a quiet flanking wall (searchable for resident notes)
      P.tryWall("bookshelf", 1, 1, ["n", leftFirst[0], leftFirst[1], "s"], {
        preferX: mirror ? r.x : r.x + r.w - 1,
        preferY: r.y,
        strictFront: true,
      });
      // Living detail: corner plant + radiator on spacious wall
      if (area >= 14) {
        P.tryWall("plant", 1, 1, [leftFirst[1], "s", "n"], { preferY: r.y + r.h - 1, preferX: mirror ? r.x + r.w - 1 : r.x });
      }
      if (area >= 22 && decay < 0.8) {
        P.tryWall("radiator", 1, 1, ["n", "s", leftFirst[0]], { preferX: mirror ? r.x + r.w - 1 : r.x });
      }
      break;
    }

    case "bedroom": {
      // Private rest ensemble: bed in quiet north corner (open access front/side), accessible wardrobe (for hiding + loot!), desk/bookshelf + chair + warm rug
      const cornerX = mirror ? r.x + r.w - 2 : r.x;
      const bed = P.tryWall("bed", 2, 1, ["n", "s", ...leftFirst], { preferX: cornerX, strictFront: true });
      if (bed && r.h >= 4 && r.w >= 4) {
        const ry = bed.y === r.y ? bed.y + 1 : Math.max(r.y, bed.y - 2);
        tryCarpet(bed.x, ry);
      }
      // Wardrobe along wall far from bed head, guaranteed open front tile for hiding enter & exit!
      const farX = bed ? (bed.x <= r.x + 1 ? r.x + r.w - 1 : r.x) : r.x + r.w - 1;
      P.tryWall("wardrobe", 1, 1, ["n", ...leftFirst, "s"], { preferX: farX, strictFront: true, role: "hide" });
      // Study/reading corner: bookshelf (or desk on larger bedrooms)
      if (area >= 22 && r.w >= 5) {
        const desk = P.tryWall("desk", 2, 1, ["s", "n", ...leftFirst], { preferX: farX, strictFront: true });
        if (desk && area >= 26) {
          const cy = desk.y === r.y ? desk.y + 1 : desk.y - 1;
          P.tryAt("chair", desk.x, cy, 1, 1);
        }
      }
      P.tryWall("bookshelf", 1, 1, [leftFirst[1], "s", "n", leftFirst[0]], { preferY: r.y + r.h - 1, strictFront: true });
      if (area >= 18 && decay < 0.85) {
        P.tryWall("radiator", 1, 1, ["n", leftFirst[0], "s"], { preferX: r.x + Math.floor(r.w / 2) });
      }
      break;
    }

    case "nursery": {
      // Children's room: bed along back wall, bookshelf, toy corner, small chair/table, open play rug
      const bed = P.tryWall("bed", 2, 1, ["n", "s"], { preferX: mirror ? r.x + r.w - 2 : r.x, strictFront: true });
      if (r.w >= 4 && r.h >= 4) tryCarpet(r.x + Math.floor((r.w - 2) / 2), Math.min(r.y + r.h - 2, r.y + 1));
      P.tryWall("bookshelf", 1, 1, ["n", leftFirst[0], "s"], { preferX: bed && bed.x === r.x ? r.x + r.w - 1 : r.x, strictFront: true });
      P.tryWall("toy", 1, 1, ["s", leftFirst[1], "n"], { preferX: r.x + Math.floor(r.w / 2) });
      if (area >= 16) P.tryWall("chair", 1, 1, ["s", leftFirst[0]]);
      if (area >= 20) P.tryWall("wardrobe", 1, 1, [leftFirst[1], "n"], { strictFront: true, role: "hide" });
      break;
    }

    case "kitchen": {
      // Cohesive continuous kitchen work wall: fridge -> counter (2x1) -> stove -> sink facing into open operator row!
      const workWall: Side = P.entries.every((e) => e.y !== r.y) ? "n" : P.entries.every((e) => e.y !== r.y + r.h - 1) ? "s" : "n";
      const wy = workWall === "n" ? r.y : r.y + r.h - 1;
      const dir = mirror ? -1 : 1;
      let cursor = mirror ? r.x + r.w - 1 : r.x;
      const runSeq: { kind: PropKind; w: number }[] =
        r.w >= 5
          ? [
              { kind: "fridge", w: 1 },
              { kind: "counter", w: 2 },
              { kind: "stove", w: 1 },
              { kind: "sink", w: 1 },
            ]
          : r.w >= 4
            ? [
                { kind: "fridge", w: 1 },
                { kind: "stove", w: 1 },
                { kind: "sink", w: 1 },
                { kind: "counter", w: 2 },
              ]
            : [
                { kind: "fridge", w: 1 },
                { kind: "stove", w: 1 },
                { kind: "sink", w: 1 },
              ];
      let counterPlaced = false;
      for (const item of runSeq) {
        const px = dir > 0 ? cursor : cursor - item.w + 1;
        const ok = P.tryAt(item.kind, px, wy, item.w, 1, {
          needWall: true,
          preferSouthAccess: workWall === "n",
          strictFront: true,
        });
        if (ok) {
          cursor += dir * item.w;
          if (item.kind === "counter") counterPlaced = true;
        } else {
          // Place cleanly on adjacent wall keeping work triangle tight
          const alt = P.tryWall(item.kind, item.w, 1, [workWall, leftFirst[0], leftFirst[1], workWall === "n" ? "s" : "n"], {
            preferX: px,
            preferY: wy,
            strictFront: true,
          });
          if (alt && item.kind === "counter") counterPlaced = true;
          cursor += dir;
        }
      }
      if (!counterPlaced && r.w >= 4 && r.h >= 4) {
        P.tryWall("counter", 2, 1, [workWall === "n" ? "s" : "n", workWall], { strictFront: true });
      }
      // Small dining nook opposite work wall when kitchen has comfy space
      const opp: Side = workWall === "n" ? "s" : "n";
      if (area >= 16 && r.h >= 4) {
        const tbl = P.tryWall("table", 1, 1, [opp, leftFirst[1]], { preferX: r.x + Math.floor(r.w / 2) });
        if (tbl && area >= 20) {
          P.tryAt("chair", tbl.x + (mirror ? -1 : 1), tbl.y, 1, 1);
        }
      }
      if (area >= 15) P.tryWall("trash", 1, 1, [opp, leftFirst[0]], { preferX: mirror ? r.x : r.x + r.w - 1 });
      break;
    }

    case "bath": {
      // Clean sanitary room: toilet + sink paired along wet wall, medbox reachable on adjacent wall, bathtub (wide) OR shower (compact), optional washer
      P.tryWall("toilet", 1, 1, ["n", leftFirst[0], "s"], { preferX: mirror ? r.x + r.w - 1 : r.x, strictFront: true });
      P.tryWall("sink", 1, 1, ["n", leftFirst[1], "s"], { preferX: mirror ? r.x + r.w - 2 : r.x + 1, strictFront: true });
      P.tryWall("medbox", 1, 1, ["n", leftFirst[1], leftFirst[0], "s"], {
        preferX: mirror ? r.x : r.x + r.w - 1,
        strictFront: true,
        role: "loot",
      });
      if (r.w >= 4 && area >= 12) {
        const tub = P.tryWall("bathtub", 2, 1, ["s", "n", ...leftFirst], { preferX: mirror ? r.x : r.x + r.w - 2 });
        if (!tub) P.tryWall("shower", 1, 1, ["s", leftFirst[0], leftFirst[1]]);
      } else if (area >= 9) {
        P.tryWall("shower", 1, 1, ["s", leftFirst[1], "n"]);
      }
      if (area >= 16) {
        P.tryWall("washer", 1, 1, ["s", leftFirst[0]], { preferX: mirror ? r.x + r.w - 1 : r.x });
      }
      break;
    }

    case "hall": {
      // PRZEDPOKÓJ: strictly perimeter-edge furnishing, 100% open central passage distributing cleanly to every apartment door!
      P.tryWall("wardrobe", 1, 1, ["n", leftFirst[0], leftFirst[1], "s"], {
        preferX: mirror ? r.x : r.x + r.w - 1,
        strictFront: true,
        role: "hide",
      });
      if (area >= 14 && (r.w >= 4 || r.h >= 4)) {
        const benched = P.tryWall("bench", 2, 1, ["s", "n"], { preferX: r.x + Math.floor((r.w - 2) / 2) });
        if (!benched) P.tryWall("radiator", 1, 1, [leftFirst[1], "n", "s"]);
      }
      if (area >= 16 && decay < 0.7) {
        P.tryWall("plant", 1, 1, [leftFirst[0], "s"], { preferY: r.y + r.h - 1 });
      }
      break;
    }

    case "storage": {
      // SCHOWEK: tidy perimeter shelves/lockers/cases/crates (always strictly wall-anchored with clear central entry aisle!)
      P.tryWall("locker", 1, 1, ["n", leftFirst[0], "s"], { preferX: r.x, strictFront: true, role: "hide" });
      P.tryWall("supplycase", 1, 1, ["n", leftFirst[1], "s"], { preferX: r.x + r.w - 1, strictFront: true, role: "loot" });
      P.tryWall("crate", 1, 1, [leftFirst[0], "s", "n"], { preferY: r.y + r.h - 1, strictFront: true, role: "loot" });
      if (area >= 14) P.tryWall("barrel", 1, 1, ["s", leftFirst[1]], { preferX: r.x + r.w - 1 });
      if (area >= 18) P.tryWall("locker", 1, 1, [leftFirst[1], "n"], { strictFront: true, role: "hide" });
      if (area >= 22 && r.w >= 5) P.tryWall("bike", 2, 1, ["s", "n"]);
      break;
    }

    case "workshop": {
      // WARSZTAT: back service pipes + tool locker + accessible workbench + wall-anchored supplycase/crate
      P.tryWall("pipes", 2, 1, ["n", "s"], { preferX: r.x + Math.floor((r.w - 2) / 2) });
      P.tryWall("locker", 1, 1, ["n", leftFirst[0], "s"], { preferX: mirror ? r.x + r.w - 1 : r.x, strictFront: true, role: "hide" });
      P.tryWall("supplycase", 1, 1, [leftFirst[1], "n", "s"], { strictFront: true, role: "loot" });
      P.tryWall("table", 1, 1, ["s", leftFirst[0], leftFirst[1]], { strictFront: true });
      if (area >= 16) P.tryWall("crate", 1, 1, ["s", leftFirst[1], leftFirst[0]], { strictFront: true, role: "loot" });
      if (area >= 20) P.tryWall("extinguisher", 1, 1, [leftFirst[0], "s", "n"]);
      break;
    }

    case "boiler": {
      // KOTŁOWNIA: main boiler pipes along north wall, safety extinguisher near exit wall, industrial locker, barrel, wall-anchored crate
      P.tryWall("pipes", 2, 1, ["n", "s"], { preferX: r.x + Math.floor((r.w - 2) / 2) });
      P.tryWall("locker", 1, 1, ["n", leftFirst[0], "s"], { preferX: r.x, strictFront: true, role: "hide" });
      P.tryWall("barrel", 1, 1, [leftFirst[1], "s", "n"], { preferY: r.y + r.h - 1 });
      P.tryWall("extinguisher", 1, 1, ["s", leftFirst[0], "n"], { preferX: P.entries[0]?.x ?? r.x });
      if (area >= 15) P.tryWall("crate", 1, 1, ["s", leftFirst[1]], { strictFront: true, role: "loot" });
      break;
    }

    case "laundry": {
      // PRALNIA: row of matching washers + utility sink side-by-side along wet wall, medbox + storage locker opposite
      const w1 = P.tryWall("washer", 1, 1, ["n", "s"], { preferX: mirror ? r.x + r.w - 1 : r.x, strictFront: true });
      if (w1) {
        const nextX = mirror ? w1.x - 1 : w1.x + 1;
        P.tryAt("washer", nextX, w1.y, 1, 1, { needWall: true, strictFront: true }) ||
          P.tryWall("washer", 1, 1, ["n", leftFirst[0], "s"], { strictFront: true });
        P.tryAt("sink", mirror ? nextX - 1 : nextX + 1, w1.y, 1, 1, { needWall: true, strictFront: true }) ||
          P.tryWall("sink", 1, 1, ["n", leftFirst[1], "s"], { strictFront: true });
      } else {
        P.tryWall("sink", 1, 1, ["n", "s", ...leftFirst], { strictFront: true });
      }
      P.tryWall("medbox", 1, 1, ["s", leftFirst[1], "n"], { strictFront: true, role: "loot" });
      if (area >= 12) P.tryWall("locker", 1, 1, ["s", leftFirst[0]], { strictFront: true, role: "hide" });
      break;
    }

    case "office": {
      // LOKAL UŻYTKOWY: desk + paired chair behind/beside + notice board on wall + bookshelf + plant
      const desk = P.tryWall("desk", 2, 1, ["n", "s", ...leftFirst], { preferX: r.x + Math.floor((r.w - 2) / 2), strictFront: true });
      P.tryWall("board", 2, 1, ["n", "s"], { preferX: mirror ? r.x : r.x + r.w - 2 });
      P.tryWall("bookshelf", 1, 1, [leftFirst[0], leftFirst[1], "s"], { strictFront: true });
      if (desk && area >= 15) {
        const cy = desk.y === r.y ? desk.y + 1 : desk.y - 1;
        P.tryAt("chair", desk.x + (mirror ? 0 : 1), cy, 1, 1);
      }
      if (area >= 16) P.tryWall("plant", 1, 1, ["s", leftFirst[1]], { preferY: r.y + r.h - 1 });
      break;
    }
  }

  return b.props.length > before;
}

/**
 * Places minimal tasteful fixtures along wide public corridor edges (3+ wide sections),
 * keeping every doorway, junction, stairwell, shaft door and main patrol line strictly clear.
 */
export function furnishCorridorEdges(b: FloorBuild, service: boolean, rng: Rng) {
  const pool: PropKind[] = service
    ? ["mailbox", "board", "extinguisher", "bench", "radiator"]
    : ["radiator", "extinguisher", "bench", "plant", "board", "mailbox"];
  let placed = 0;
  for (let y = 8; y < H - 8 && placed < 8; y += 7) {
    for (let x = 8; x < W - 8 && placed < 8; x += 9) {
      const i = idx(x, y);
      const rid = b.roomOf[i];
      if (rid < 0 || b.roomZones[rid] !== "KORYTARZ" || b.tiles[i] !== Tile.Floor || b.occ[i]) continue;
      // Only hug a solid top wall with at least 2 clear corridor floor tiles below it (leaving min 2-tile walkway!)
      if (b.tiles[idx(x, y - 1)] !== Tile.Wall) continue;
      if (b.tiles[idx(x, y + 1)] !== Tile.Floor || b.tiles[idx(x, y + 2)] !== Tile.Floor) continue;
      if (b.doors.some((d) => manhattan(d, { x, y }) <= 3)) continue;
      if (b.props.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) <= 6)) continue;
      const kind = rng.pick(pool);
      const w = kind === "mailbox" || kind === "board" || kind === "bench" ? 2 : 1;
      let ok = true;
      for (let xx = x; xx < x + w; xx++) {
        if (
          b.tiles[idx(xx, y)] !== Tile.Floor ||
          b.tiles[idx(xx, y - 1)] !== Tile.Wall ||
          b.tiles[idx(xx, y + 1)] !== Tile.Floor ||
          b.occ[idx(xx, y)] ||
          b.doors.some((d) => manhattan(d, { x: xx, y }) <= 3)
        ) {
          ok = false;
        }
      }
      if (!ok || !rng.chance(0.5)) continue;
      createPropRecord(b, kind, x, y, w, 1, true, { x, y: y + 1 }, "furniture");
      placed++;
    }
  }
}

/**
 * Adds thematic intentional decay (structural damage breaches between distinct neighboring flats,
 * selective debris, puddles, stains, flipped clutter) STRICTLY AFTER clean architectural logic
 * and interior furniture sets are finalized — never duplicating nearby doors or cutting rooms off!
 */
export function applyIntentionalDamage(b: FloorBuild, index: number, decay: number, rng: Rng) {
  // 1) Damaged dividing walls creating deliberate tactical cross-apartment shortcuts (higher on decayed floors)
  const wantBreaches = index <= 1 ? 2 : 3 + Math.round(decay * 5);
  let made = 0;
  for (let attempt = 0; attempt < 500 && made < wantBreaches; attempt++) {
    const x = 7 + rng.int(W - 14);
    const y = 6 + rng.int(H - 12);
    if (b.tiles[idx(x, y)] !== Tile.Wall) continue;

    const testAxis = (ax: number, ay: number, bx: number, by: number): boolean => {
      const ia = idx(ax, ay);
      const ib = idx(bx, by);
      if (b.tiles[ia] !== Tile.Floor || b.tiles[ib] !== Tile.Floor) return false;
      if (b.occ[ia] || b.occ[ib]) return false;
      // Don't breach straight into furniture or interactive props!
      if (b.props.some((p) => (ax >= p.x && ax < p.x + p.w && ay >= p.y && ay < p.y + p.h) || (bx >= p.x && bx < p.x + p.w && by >= p.y && by < p.y + p.h))) {
        return false;
      }
      const ra = b.roomOf[ia];
      const rb = b.roomOf[ib];
      if (ra < 0 || rb < 0 || ra === rb) return false;
      const roomA = b.rooms[ra];
      const roomB = b.rooms[rb];
      if (!roomA || !roomB || roomA.role !== "normal" || roomB.role !== "normal") return false;
      const za = b.zones[ra];
      const zb = b.zones[rb];
      // Preserve clean private baths, halls, stairwells, corridors
      if (["corridor", "stair", "bath", "hall"].includes(za) || ["corridor", "stair", "bath", "hall"].includes(zb)) return false;
      // Strongly prefer cross-apartment wall breaks (gives real narrative + stealth shortcuts between two neighboring flats!)
      if (roomA.apartmentId !== undefined && roomA.apartmentId === roomB.apartmentId) return false;
      // Never duplicate an existing door or breach between the exact same two rooms!
      if (b.doors.some((d) => d.rooms && ((d.rooms[0] === ra && d.rooms[1] === rb) || (d.rooms[0] === rb && d.rooms[1] === ra)))) return false;
      if (b.doors.some((d) => manhattan(d, { x, y }) <= 4)) return false;
      if (b.breaches.some((br) => manhattan(br, { x, y }) <= 5)) return false;
      return true;
    };

    const lr = testAxis(x - 1, y, x + 1, y);
    const ud = !lr && testAxis(x, y - 1, x, y + 1);
    if (!lr && !ud) continue;
    const fs = lr ? b.floorStyle[idx(x - 1, y)] : b.floorStyle[idx(x, y - 1)];
    recordBreach(b, x, y, fs);
    // Scattered rubble chips marking the broken wall on one side (readable visual cue!)
    const side = lr ? { x: x - 1, y } : { x, y: y - 1 };
    if (b.tiles[idx(side.x, side.y)] === Tile.Floor && !b.occ[idx(side.x, side.y)]) {
      b.decals.push({ x: side.x, y: side.y, kind: "crack" });
    }
    // Mark joined apartments as connected tactical bypass if both now lead to distinct corridors!
    const ra = lr ? b.roomOf[idx(x - 1, y)] : b.roomOf[idx(x, y - 1)];
    const rb = lr ? b.roomOf[idx(x + 1, y)] : b.roomOf[idx(x, y + 1)];
    const aId = b.rooms[ra]?.apartmentId;
    const bId = b.rooms[rb]?.apartmentId;
    if (aId !== undefined && bId !== undefined && aId !== bId) {
      const aptA = b.apartments[aId];
      const aptB = b.apartments[bId];
      if (aptA && aptB && manhattan(aptA.entryDoor, aptB.entryDoor) >= 8) {
        if (!aptA.isBypass) {
          aptA.isBypass = true;
          aptA.secondaryExit = { x, y, reason: `uszkodzona ściana do lokalu #${bId + 1}`, detour: manhattan(aptA.entryDoor, aptB.entryDoor) };
        }
      }
    }
    made++;
  }

  // 2) Intentional contextual floor storytelling decals around real placed furniture (preserves room clarity!)
  const details: Partial<Record<PropKind, DecalSpawn["kind"]>> = {
    desk: "paper",
    bookshelf: "book",
    board: "paper",
    plant: "leaf",
    toy: "toy",
    medbox: "pills",
    bed: "cloth",
    sofa: "cloth",
    washer: "stain",
    sink: "stain",
    toilet: "stain",
    pipes: "moss",
    locker: "cable",
    tv: "cable",
    crate: "footprint",
    bench: "footprint",
    stove: index === 7 ? "scorch" : "stain",
  };
  const decorated = new Set<number>();
  for (const p of b.props) {
    const kind = details[p.kind];
    if (!kind || !rng.chance(0.58)) continue;
    const pr = b.roomOf[idx(p.x, p.y)];
    for (const [x, y] of [
      [p.x, p.y + p.h],
      [p.x + p.w, p.y],
      [p.x - 1, p.y],
      [p.x, p.y - 1],
    ]) {
      const i = idx(x, y);
      if (!inb(x, y) || b.tiles[i] !== Tile.Floor || decorated.has(i) || b.roomOf[i] !== pr) continue;
      if (b.props.some((q) => q.solid && x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h)) continue;
      b.decals.push({ x, y, kind });
      decorated.add(i);
      break;
    }
  }

  // Ensure key atmospheric decals (book, cloth, pills, glass/footprint) are subtly present across rooms
  const nearZones: { z: Zone[]; kind: DecalSpawn["kind"]; prob: number }[] = [
    { z: ["bath", "laundry", "boiler"], kind: "stain", prob: 0.35 + decay * 0.3 },
    { z: ["living", "office"], kind: "glass", prob: decay * 0.45 },
    { z: ["corridor"], kind: "footprint", prob: 0.12 },
  ];
  for (const spec of nearZones) {
    for (const r of b.rooms) {
      if (r.role !== "normal" || !spec.z.includes(b.zones[r.id]) || !rng.chance(spec.prob)) continue;
      const x = r.x + rng.int(r.w);
      const y = r.y + rng.int(r.h);
      const i = idx(x, y);
      if (b.tiles[i] === Tile.Floor && !b.occ[i] && !decorated.has(i)) {
        b.decals.push({ x, y, kind: spec.kind });
        decorated.add(i);
      }
    }
  }

  // 3) Controlled localized rubble & leak puddles (kept off door thresholds, stairs, and room entry centers)
  const isSafeRubble = (x: number, y: number) => {
    const i = idx(x, y);
    if (b.tiles[i] !== Tile.Floor || b.occ[i]) return false;
    const rid = b.roomOf[i];
    if (rid < 0) return false;
    const rm = b.rooms[rid];
    if (rm.role !== "normal" || b.zones[rid] === "stair") return false;
    if (b.doors.some((d) => manhattan(d, { x, y }) <= 1)) return false;
    if (b.props.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h)) return false;
    return true;
  };

  const rubbleCount = Math.round(decay * 42) + (index === 0 ? 10 : 3);
  for (let a = 0; a < rubbleCount; a++) {
    const x = 4 + rng.int(W - 8);
    const y = 4 + rng.int(H - 8);
    if (isSafeRubble(x, y)) b.tiles[idx(x, y)] = Tile.Rubble;
  }

  // Realistic leak puddles clustered near wet rooms (bath/laundry/boiler) and flooded/decayed floors
  const puddleCount = index === 0 ? 14 : decay >= 0.45 ? 10 + Math.round(decay * 24) : 4;
  for (let a = 0; a < puddleCount; a++) {
    const x = 4 + rng.int(W - 8);
    const y = 4 + rng.int(H - 8);
    if (!isSafeRubble(x, y)) continue;
    const rid = b.roomOf[idx(x, y)];
    const z = b.zones[rid];
    if (decay < 0.45 && index > 0 && z !== "bath" && z !== "laundry" && z !== "boiler") continue;
    b.tiles[idx(x, y)] = Tile.Puddle;
  }

  // Burned floor scorching patches (floor index 7)
  if (index === 7) {
    for (let a = 0; a < 36; a++) {
      const x = 4 + rng.int(W - 8);
      const y = 4 + rng.int(H - 8);
      const i = idx(x, y);
      if (b.tiles[i] === Tile.Floor && b.roomOf[i] >= 0 && b.rooms[b.roomOf[i]].role === "normal") {
        b.floorStyle[i] = 4;
      }
    }
  }
}

/** Places a radio or wall-anchored TV smoothly against a real wall inside a furnished room with open front access. */
export function placeDeviceNeatly(
  b: { w: number; h: number; tiles: Uint8Array; props: Prop[]; doors: DoorInfo[]; propAccess?: PropAccessPoint[] },
  room: Room,
  kind: "tv" | "radio",
  id: number,
  label: string,
  avoidCells: Cell[],
  startPx: { x: number; y: number },
  rng: Rng,
  tileSize: number,
): Prop | null {
  // If TV requested and room already has a well-placed wall-mounted solid TV, reuse it cleanly!
  if (kind === "tv") {
    const existing = b.props.find(
      (p) => p.kind === "tv" && p.x >= room.x && p.x < room.x + room.w && p.y >= room.y && p.y < room.y + room.h,
    );
    if (existing) {
      if (!existing.label) existing.label = label;
      return existing;
    }
  }

  const nearTableOrWall: { x: number; y: number; ax: number; ay: number; score: number }[] = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const i = y * b.w + x;
      if (b.tiles[i] !== Tile.Floor) continue;
      if (avoidCells.some((c) => c.x === x && c.y === y)) continue;
      if (b.props.some((p) => p.kind !== "carpet" && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h)) continue;
      if (b.doors.some((d) => Math.abs(d.x - x) + Math.abs(d.y - y) <= 1)) continue;
      if (Math.hypot((x + 0.5) * tileSize - startPx.x, (y + 0.5) * tileSize - startPx.y) < 6 * tileSize) continue;

      // Require wall adjacency (flush north/south/side wall) AND an open reachable adjacent interaction cell!
      const touchesWall = N4.some(([dx, dy]) => b.tiles[(y + dy) * b.w + (x + dx)] === Tile.Wall);
      if (!touchesWall) continue;
      const openFront = N4
        .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
        .find(
          (c) =>
            c.x >= room.x &&
            c.y >= room.y &&
            c.x < room.x + room.w &&
            c.y < room.y + room.h &&
            b.tiles[c.y * b.w + c.x] === Tile.Floor &&
            !b.props.some((p) => p.solid && c.x >= p.x && c.x < p.x + p.w && c.y >= p.y && c.y < p.y + p.h),
        );
      if (!openFront) continue;

      let score = 10 + rng() * 2;
      // North wall mount gets huge crisp visual readability in 3/4 view!
      if (b.tiles[(y - 1) * b.w + x] === Tile.Wall) score += 6;
      // Radio looks especially natural right next to a bookshelf, desk, sofa, counter, or table!
      if (kind === "radio") {
        const besideFurniture = b.props.some(
          (p) =>
            (p.kind === "table" || p.kind === "desk" || p.kind === "bookshelf" || p.kind === "counter" || p.kind === "sofa") &&
            Math.abs(p.x - x) + Math.abs(p.y - y) <= 2,
        );
        if (besideFurniture) score += 8;
      }
      // TV aligned horizontally with a sofa gets huge compositional bonus!
      if (kind === "tv") {
        const sofa = b.props.find((p) => p.kind === "sofa" && p.x >= room.x && p.x < room.x + room.w && p.y >= room.y && p.y < room.y + room.h);
        if (sofa && Math.abs(sofa.y - y) >= 2 && Math.abs(sofa.x - x) <= 2) score += 14;
      }
      nearTableOrWall.push({ x, y, ax: openFront.x, ay: openFront.y, score });
    }
  }
  if (!nearTableOrWall.length) return null;
  nearTableOrWall.sort((a, c) => c.score - a.score);
  const chosen = nearTableOrWall[0];
  const prop: Prop = { id, kind, x: chosen.x, y: chosen.y, w: 1, h: 1, solid: false, loot: null, opened: false, label };
  b.props.push(prop);
  b.propAccess?.push({ propId: prop.id, kind, x: chosen.x, y: chosen.y, ax: chosen.ax, ay: chosen.ay, role: "device" });
  return prop;
}
