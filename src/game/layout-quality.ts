import { MAP_H, MAP_W, TILE, Tile } from "./palette";
import type { DoorInfo, FloorData, LayoutQualityReport, Prop } from "./types";

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

function doorSides(f: FloorData, d: DoorInfo): [number, number] {
  const ew =
    d.x > 0 &&
    d.x < W - 1 &&
    PASSABLE.has(f.tiles[idx(d.x - 1, d.y)]) &&
    PASSABLE.has(f.tiles[idx(d.x + 1, d.y)]);
  if (ew) return [f.roomOf[idx(d.x - 1, d.y)], f.roomOf[idx(d.x + 1, d.y)]];
  return [
    d.y > 0 ? f.roomOf[idx(d.x, d.y - 1)] : -1,
    d.y < H - 1 ? f.roomOf[idx(d.x, d.y + 1)] : -1,
  ];
}

function floodWalkable(f: FloorData, respectLocked = false): Uint8Array {
  const blocked = new Uint8Array(W * H);
  for (const p of f.props) {
    if (!p.solid) continue;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (inb(x, y)) blocked[idx(x, y)] = 1;
  }
  for (const d of f.doors) {
    if (d.sealed || (respectLocked && d.locked)) blocked[idx(d.x, d.y)] = 1;
  }
  const seen = new Uint8Array(W * H);
  const sx = Math.floor(f.playerStart.x / TILE);
  const sy = Math.floor(f.playerStart.y / TILE);
  if (!inb(sx, sy)) return seen;
  const s = idx(sx, sy);
  if (blocked[s]) return seen;
  const q: number[] = [s];
  seen[s] = 1;
  for (let h = 0; h < q.length; h++) {
    const p = q[h];
    const x = p % W;
    const y = Math.floor(p / W);
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inb(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (seen[ni] || blocked[ni] || !PASSABLE.has(f.tiles[ni])) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  return seen;
}

function hasReachableAdjacent(seen: Uint8Array, p: Prop): boolean {
  for (let y = p.y; y < p.y + p.h; y++) {
    for (let x = p.x; x < p.x + p.w; x++) {
      if (!p.solid && seen[idx(x, y)]) return true;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (inb(nx, ny) && seen[idx(nx, ny)]) return true;
      }
    }
  }
  return false;
}

/** Local post-furnishing & post-damage repair: drops any obstructive decorative prop sitting on a door threshold or blocking a wardrobe/device. */
export function repairThresholdsAndProps(f: FloorData): number {
  let repaired = 0;
  // 1) Never leave a solid non-loot decorative prop standing directly on a doorway threshold.
  const threshold = new Set<number>();
  for (const d of f.doors) {
    if (d.sealed || d.route) continue;
    const ew =
      d.x > 0 && d.x < W - 1 && PASSABLE.has(f.tiles[idx(d.x - 1, d.y)]) && PASSABLE.has(f.tiles[idx(d.x + 1, d.y)]);
    const sides = ew
      ? [
          [d.x - 1, d.y],
          [d.x + 1, d.y],
        ]
      : [
          [d.x, d.y - 1],
          [d.x, d.y + 1],
        ];
    for (const [tx, ty] of sides) if (inb(tx, ty)) threshold.add(idx(tx, ty));
  }
  const removable = (p: Prop) =>
    p.solid && !p.loot && p.kind !== "flare" && p.kind !== "tv" && p.kind !== "radio" && p.kind !== "explosive";
  const before = f.props.length;
  f.props = f.props.filter((p) => {
    if (!removable(p)) return true;
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        if (threshold.has(idx(x, y))) return false;
      }
    }
    return true;
  });
  repaired += before - f.props.length;

  // 2) Confirm every wardrobe/locker/device/loot is reachable from start; drop blocking non-loot decor if it isolated something.
  let seen = floodWalkable(f, false);
  const important = f.props.filter((p) => p.loot || p.kind === "wardrobe" || p.kind === "locker" || p.kind === "tv" || p.kind === "radio");
  for (const imp of important) {
    if (hasReachableAdjacent(seen, imp)) continue;
    // Try removing an adjacent non-loot solid prop directly blocking imp
    const blocker = f.props.find(
      (q) =>
        q !== imp &&
        removable(q) &&
        Math.abs(q.x - imp.x) <= 1 &&
        Math.abs(q.y - imp.y) <= 1,
    );
    if (blocker) {
      f.props = f.props.filter((q) => q !== blocker);
      repaired++;
      seen = floodWalkable(f, false);
    }
  }

  // 3) Re-verify every wall-mounted device has clear access; remove/move no overlapping solid props.
  if (f.propAccess) {
    const alive = new Set(f.props.map((p) => p.id));
    f.propAccess = f.propAccess.filter((a) => alive.has(a.propId));
  }
  return repaired;
}

/** Multi-aspect quality audit matching all five domains required for BLOK 7 levels. */
export function evaluateFloorQuality(f: FloorData, priorRepairs = 0): LayoutQualityReport {
  const issues: string[] = [];
  const seen = floodWalkable(f, false);
  const apartments = f.apartments ?? [];
  const apartmentFamilies: Record<string, number> = {};
  for (const a of apartments) apartmentFamilies[a.family] = (apartmentFamilies[a.family] ?? 0) + 1;

  // --- Door & Connection Quality ---
  const normalDoors = f.doors.filter((d) => !d.route && !d.sealed);
  let publicEntryDoors = 0;
  let internalDoors = 0;
  let bypassDoors = 0;
  let barricadedDoors = 0;
  let duplicateRoomPairDoors = 0;
  let closeSameRoomDoors = 0;
  let closeJustifiedPairs = 0;
  let blockedThresholds = 0;

  const pairCounts = new Map<string, number>();
  const doorsPerRoom = new Map<number, DoorInfo[]>();
  const solidAt = (x: number, y: number) =>
    f.props.some((p) => p.solid && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);

  for (const d of normalDoors) {
    if (d.kind === "entry" || d.kind === "service") publicEntryDoors++;
    else if (d.kind === "internal") internalDoors++;
    else if (d.kind === "bypass") bypassDoors++;
    if (d.barricaded) barricadedDoors++;

    // Both thresholds clear & accessible!
    const ew = d.x > 0 && d.x < W - 1 && PASSABLE.has(f.tiles[idx(d.x - 1, d.y)]) && PASSABLE.has(f.tiles[idx(d.x + 1, d.y)]);
    const s1 = ew ? { x: d.x - 1, y: d.y } : { x: d.x, y: d.y - 1 };
    const s2 = ew ? { x: d.x + 1, y: d.y } : { x: d.x, y: d.y + 1 };
    const clearBoth =
      inb(s1.x, s1.y) &&
      inb(s2.x, s2.y) &&
      PASSABLE.has(f.tiles[idx(s1.x, s1.y)]) &&
      PASSABLE.has(f.tiles[idx(s2.x, s2.y)]) &&
      !solidAt(s1.x, s1.y) &&
      !solidAt(s2.x, s2.y) &&
      seen[idx(s1.x, s1.y)] === 1 &&
      seen[idx(s2.x, s2.y)] === 1;
    if (!clearBoth) blockedThresholds++;

    const [ra, rb] = doorSides(f, d);
    if (ra >= 0 && rb >= 0) {
      const aCorr = f.roomZones[ra] === "KORYTARZ";
      const bCorr = f.roomZones[rb] === "KORYTARZ";
      // Corridor rooms are chopped into pieces; track same-room-to-corridor once per non-corridor room!
      const pk =
        aCorr !== bCorr
          ? `corr:${aCorr ? rb : ra}`
          : ra < rb
            ? `${ra}:${rb}`
            : `${rb}:${ra}`;
      const c = (pairCounts.get(pk) ?? 0) + 1;
      pairCounts.set(pk, c);
      if (c > 1) {
        // Bypass across far side of same room would only count if adjacent; any close double counts as duplicate
        if (!(aCorr !== bCorr && d.kind === "bypass")) duplicateRoomPairDoors++;
      }
      for (const rid of [ra, rb]) {
        if (f.roomZones[rid] !== "KORYTARZ") {
          doorsPerRoom.set(rid, [...(doorsPerRoom.get(rid) ?? []), d]);
        }
      }
    }
  }

  // Same-room close doors check (PRZEDPOKÓJ explicitly allowed as central apartment distributor!)
  for (const [rid, ds] of doorsPerRoom.entries()) {
    const zn = f.roomZones[rid];
    const isDistributor = zn === "PRZEDPOKÓJ";
    for (let i = 0; i < ds.length; i++) {
      for (let j = i + 1; j < ds.length; j++) {
        const md = Math.abs(ds[i].x - ds[j].x) + Math.abs(ds[i].y - ds[j].y);
        if (md <= 3) {
          if (isDistributor) closeJustifiedPairs++;
          else closeSameRoomDoors++;
        }
      }
    }
  }
  // Distinct apartments side-by-side at a tight landing count as justified near pairs (not a defect!)
  for (let i = 0; i < normalDoors.length; i++) {
    for (let j = i + 1; j < normalDoors.length; j++) {
      const a = normalDoors[i];
      const c = normalDoors[j];
      const md = Math.abs(a.x - c.x) + Math.abs(a.y - c.y);
      if (md <= 3 && a.kind === "entry" && c.kind === "entry") {
        const aApt = a.rooms ? f.rooms[a.rooms[0]]?.apartmentId : -1;
        const cApt = c.rooms ? f.rooms[c.rooms[0]]?.apartmentId : -2;
        if (aApt !== cApt) closeJustifiedPairs++;
      }
    }
  }

  if (duplicateRoomPairDoors > 0) issues.push(`duplicate doors: ${duplicateRoomPairDoors}`);
  if (closeSameRoomDoors > 0) issues.push(`too-close same-room doors: ${closeSameRoomDoors}`);
  if (blockedThresholds > 0) issues.push(`blocked thresholds: ${blockedThresholds}`);

  // --- Furnishing & Interactivity Quality ---
  const furnishedRooms = new Set<number>();
  let wardrobesTotal = 0;
  let wardrobesAccessible = 0;
  let devicesTotal = 0;
  let devicesWallMounted = 0;
  let devicesAccessible = 0;
  let lootTotal = 0;
  let lootAccessible = 0;
  for (const p of f.props) {
    const rid = f.roomOf[idx(p.x, p.y)];
    if (rid >= 0 && f.roomZones[rid] !== "KORYTARZ" && p.solid) furnishedRooms.add(rid);
    if (p.kind === "wardrobe" || p.kind === "locker") {
      wardrobesTotal++;
      if (hasReachableAdjacent(seen, p)) wardrobesAccessible++;
    }
    if (p.kind === "tv" || p.kind === "radio") {
      devicesTotal++;
      const wall = N4.some(([dx, dy]) => {
        if (!inb(p.x + dx, p.y + dy)) return false;
        const t = f.tiles[idx(p.x + dx, p.y + dy)];
        return t === Tile.Wall || t === Tile.Window;
      });
      if (wall) devicesWallMounted++;
      if (hasReachableAdjacent(seen, p)) devicesAccessible++;
    }
    if (p.loot) {
      lootTotal++;
      if (hasReachableAdjacent(seen, p)) lootAccessible++;
    }
  }
  if (wardrobesAccessible < wardrobesTotal) issues.push(`inaccessible wardrobes: ${wardrobesTotal - wardrobesAccessible}`);
  if (devicesAccessible < devicesTotal) issues.push(`inaccessible devices: ${devicesTotal - devicesAccessible}`);
  if (lootAccessible < lootTotal) issues.push(`inaccessible loot: ${lootTotal - lootAccessible}`);

  // --- Bypass Routes & Damage ---
  let bypassApartments = 0;
  let validBypassRoutes = 0;
  for (const apt of apartments) {
    if (apt.isBypass && apt.secondaryExit) {
      bypassApartments++;
      if (apt.secondaryExit.detour >= 8 && seen[idx(apt.entryDoor.x, apt.entryDoor.y)] && seen[idx(apt.secondaryExit.x, apt.secondaryExit.y)]) {
        validBypassRoutes++;
      }
    }
  }
  let damageCells = 0;
  for (let i = 0; i < f.tiles.length; i++) if (f.tiles[i] === Tile.Rubble || f.tiles[i] === Tile.Puddle) damageCells++;

  // --- Corridor Threat Quality ---
  const cr = f.corridorReport;
  if (cr) {
    if (cr.eligibleZones >= 5 && cr.occupancyRate < 0.5) issues.push(`low corridor occupancy: ${(cr.occupancyRate * 100).toFixed(0)}%`);
    if (cr.placedCorridor < Math.max(4, Math.floor(cr.plannedCorridor * 0.8))) {
      issues.push(`corridor zombie shortfall: ${cr.placedCorridor}/${cr.plannedCorridor}`);
    }
    if (cr.waveHeadroom < 3 && f.index < 10) issues.push(`low wave headroom: ${cr.waveHeadroom}`);
  }

  const report: LayoutQualityReport = {
    repairsApplied: priorRepairs,
    apartments: apartments.length,
    apartmentFamilies,
    publicEntryDoors,
    internalDoors,
    bypassDoors,
    barricadedDoors,
    duplicateRoomPairDoors,
    closeSameRoomDoors,
    closeJustifiedPairs,
    blockedThresholds,
    roomsFurnished: furnishedRooms.size,
    wardrobesAccessible,
    wardrobesTotal,
    devicesTotal,
    devicesWallMounted,
    devicesAccessible,
    lootAccessible,
    lootTotal,
    bypassApartments,
    validBypassRoutes,
    breachesCount: f.breaches.length,
    damageCells,
    issues,
  };
  f.qualityReport = report;
  return report;
}
