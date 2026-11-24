import { astar } from "./path";
import { MAP_H, MAP_W, TILE, Tile } from "./palette";
import { makeRng } from "./rng";
import { TACTICAL } from "./tactical-config";
import type {
  CorridorPopulationReport,
  CorridorZoneInfo,
  FloorData,
  ZombieKind,
  ZombieSpawn,
} from "./types";

type Cell = { x: number; y: number };

const W = MAP_W;
const H = MAP_H;
const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const WALKABLE = new Set<number>([Tile.Floor, Tile.Rubble, Tile.Puddle, Tile.DoorOpen]);
const idx = (x: number, y: number) => y * W + x;
const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
const mdist = (a: Cell, c: Cell) => Math.abs(a.x - c.x) + Math.abs(a.y - c.y);

function buildBlockedMap(f: FloorData): Uint8Array {
  const blocked = new Uint8Array(W * H);
  for (const p of f.props) {
    if (!p.solid && p.kind !== "explosive") continue;
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) if (inb(x, y)) blocked[idx(x, y)] = 1;
    }
  }
  for (const d of f.doors) {
    if (d.sealed || d.locked || d.barricaded) blocked[idx(d.x, d.y)] = 1;
  }
  // Keep initial patrol spawns off active environmental hazards & interaction spots
  if (f.environment) {
    for (const ft of f.environment.features) {
      if (ft.kind === "wire" || ft.kind === "steam" || ft.kind === "gas") {
        for (const c of ft.cells) if (inb(c.x, c.y)) blocked[idx(c.x, c.y)] = 1;
      } else if (ft.kind === "obstruction") {
        for (const c of [ft.at, ft.park, ft.gate]) if (inb(c.x, c.y)) blocked[idx(c.x, c.y)] = 1;
      } else if (ft.kind === "shelf") {
        for (const c of [ft.at, ft.landing]) if (inb(c.x, c.y)) blocked[idx(c.x, c.y)] = 1;
      } else if (ft.kind === "weak") {
        if (inb(ft.at.x, ft.at.y)) blocked[idx(ft.at.x, ft.at.y)] = 1;
      }
    }
  }
  const q = f.vertical?.quest;
  if (q) {
    for (const c of [q.fuseCell, q.clueCell, q.beacon, q.bypassCell]) {
      if (c && inb(c.x, c.y)) blocked[idx(c.x, c.y)] = 1;
    }
  }
  for (const s of f.survivors) {
    const sx = Math.floor(s.x / TILE);
    const sy = Math.floor(s.y / TILE);
    if (inb(sx, sy)) blocked[idx(sx, sy)] = 1;
  }
  return blocked;
}

function isCorridorTile(f: FloorData, x: number, y: number, blocked: Uint8Array): boolean {
  if (!inb(x, y)) return false;
  const i = idx(x, y);
  if (blocked[i] || !WALKABLE.has(f.tiles[i])) return false;
  const rid = f.roomOf[i];
  return rid >= 0 && f.roomZones[rid] === "KORYTARZ";
}

function computeGraphDistances(mask: Uint8Array, seeds: number[]): Int16Array {
  const dist = new Int16Array(W * H).fill(-1);
  const q: number[] = [];
  for (const s of seeds) {
    if (mask[s] && dist[s] < 0) {
      dist[s] = 0;
      q.push(s);
    }
  }
  for (let head = 0; head < q.length; head++) {
    const p = q[head];
    const x = p % W;
    const y = Math.floor(p / W);
    const nd = dist[p] + 1;
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inb(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (!mask[ni] || dist[ni] >= 0) continue;
      dist[ni] = nd;
      q.push(ni);
    }
  }
  return dist;
}

/** Counts distinct cardinal directions extending at least `reach` tiles inside the corridor mask. */
function branchDegree(mask: Uint8Array, x: number, y: number, reach = 3): number {
  let deg = 0;
  for (const [dx, dy] of N4) {
    let ok = true;
    for (let k = 1; k <= reach; k++) {
      const nx = x + dx * k;
      const ny = y + dy * k;
      if (!inb(nx, ny) || !mask[idx(nx, ny)]) {
        ok = false;
        break;
      }
    }
    if (ok) deg++;
  }
  return deg;
}

/** Counts how many corridor tiles sit in the 3x3 local area around (x, y). */
function localOpenness(mask: Uint8Array, x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (inb(nx, ny) && mask[idx(nx, ny)]) n++;
    }
  }
  return n;
}

/** Partitions the public corridor graph into coherent zones (lobbies, junctions, landings & bounded corridor stretches). */
export function segmentCorridorNetwork(
  f: FloorData,
  blocked: Uint8Array,
): { zones: CorridorZoneInfo[]; zoneOf: Int16Array; corrMask: Uint8Array } {
  const corrMask = new Uint8Array(W * H);
  const allCorr: number[] = [];
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (isCorridorTile(f, x, y, blocked)) {
        const i = idx(x, y);
        corrMask[i] = 1;
        allCorr.push(i);
      }
    }
  }

  const zoneOf = new Int16Array(W * H).fill(-1);
  if (!allCorr.length) return { zones: [], zoneOf, corrMask };

  // Collect landing markers near stairs, elevator, service shaft, stairsB
  const landings: Cell[] = [];
  for (const d of f.doors) {
    if (d.kind === "stair" || d.route === "elevator" || d.route === "stairsB" || d.route === "service") {
      landings.push({ x: d.x, y: d.y });
    }
  }

  // Gather prioritized zone anchor candidates: lobbies -> junctions -> landings -> long segment subdivisions
  type Anchor = { cell: number; kind: CorridorZoneInfo["kind"] };
  const anchors: Anchor[] = [];

  const farFromAnchors = (cell: number, minStep: number): boolean => {
    if (!anchors.length) return true;
    const dist = computeGraphDistances(corrMask, anchors.map((a) => a.cell));
    return dist[cell] < 0 || dist[cell] >= minStep;
  };

  // 1) Wide open halls / lobbies (3x3 full open core, even bigger open area gets priority)
  const lobbyCands: { i: number; open: number }[] = [];
  for (const i of allCorr) {
    const x = i % W;
    const y = Math.floor(i / W);
    const o = localOpenness(corrMask, x, y);
    if (o === 9) {
      // Measure 5x5 openness to anchor center of large lobbies cleanly
      let big = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (inb(x + dx, y + dy) && corrMask[idx(x + dx, y + dy)]) big++;
      }
      if (big >= 15) lobbyCands.push({ i, open: big });
    }
  }
  lobbyCands.sort((a, c) => c.open - a.open || a.i - c.i);
  for (const c of lobbyCands) {
    if (farFromAnchors(c.i, 14)) anchors.push({ cell: c.i, kind: "lobby" });
  }

  // 2) Major intersections (3+ real outgoing corridor branches)
  const juncCands: { i: number; deg: number; open: number }[] = [];
  for (const i of allCorr) {
    const x = i % W;
    const y = Math.floor(i / W);
    const deg = branchDegree(corrMask, x, y, 3);
    if (deg >= 3) juncCands.push({ i, deg, open: localOpenness(corrMask, x, y) });
  }
  juncCands.sort((a, c) => c.deg - a.deg || c.open - a.open || a.i - c.i);
  for (const c of juncCands) {
    if (farFromAnchors(c.i, 12)) anchors.push({ cell: c.i, kind: "junction" });
  }

  // 3) Key vertical landings (stairs/elevator/service)
  for (const l of landings) {
    let best = -1;
    let bestD = 99;
    for (const [dx, dy] of N4) {
      const nx = l.x + dx;
      const ny = l.y + dy;
      if (inb(nx, ny) && corrMask[idx(nx, ny)]) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < bestD) {
          bestD = d;
          best = idx(nx, ny);
        }
      }
    }
    if (best >= 0 && farFromAnchors(best, 11)) anchors.push({ cell: best, kind: "landing" });
  }

  // 4) Subdivide remaining long corridor stretches (sections of ~11-14 tiles: authentic, dangerous yet scoutable!)
  if (!anchors.length) anchors.push({ cell: allCorr[0], kind: "segment" });
  for (let guard = 0; guard < 36; guard++) {
    const dist = computeGraphDistances(corrMask, anchors.map((a) => a.cell));
    let farthest = -1;
    let maxD = -1;
    for (const i of allCorr) {
      const d = dist[i];
      if (d < 0) {
        // Unreached corridor pocket gets its own anchor immediately
        farthest = i;
        maxD = 999;
        break;
      }
      if (d > maxD) {
        maxD = d;
        farthest = i;
      }
    }
    if (farthest < 0 || maxD < 11) break;
    // Slight preference to center on local widest point around farthest
    const fx = farthest % W;
    const fy = Math.floor(farthest / W);
    const kind: CorridorZoneInfo["kind"] = branchDegree(corrMask, fx, fy, 2) >= 3 ? "junction" : "segment";
    anchors.push({ cell: farthest, kind });
  }

  // Multi-source Voronoi BFS assigns every corridor tile cleanly to its closest anchor zone
  const q: number[] = [];
  const cellsByZone: Cell[][] = anchors.map(() => []);
  for (let zi = 0; zi < anchors.length; zi++) {
    const c = anchors[zi].cell;
    zoneOf[c] = zi;
    q.push(c);
    cellsByZone[zi].push({ x: c % W, y: Math.floor(c / W) });
  }
  for (let head = 0; head < q.length; head++) {
    const p = q[head];
    const zi = zoneOf[p];
    const x = p % W;
    const y = Math.floor(p / W);
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inb(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (!corrMask[ni] || zoneOf[ni] >= 0) continue;
      zoneOf[ni] = zi;
      cellsByZone[zi].push({ x: nx, y: ny });
      q.push(ni);
    }
  }

  // Collect neighbor graphs between zones
  const adjSets: Set<number>[] = anchors.map(() => new Set<number>());
  for (const i of allCorr) {
    const a = zoneOf[i];
    if (a < 0) continue;
    const x = i % W;
    const y = Math.floor(i / W);
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inb(nx, ny)) continue;
      const c = zoneOf[idx(nx, ny)];
      if (c >= 0 && c !== a) {
        adjSets[a].add(c);
        adjSets[c].add(a);
      }
    }
  }

  // Mark primary critical-route zones: playerStart -> stairsUp (+ keyProp + elevator + stairsB)
  const mainRouteZones = new Set<number>();
  const nearestCorr = (pt: Cell): Cell | null => {
    let best: Cell | null = null;
    let bestD = Infinity;
    for (const i of allCorr) {
      const x = i % W;
      const y = Math.floor(i / W);
      const d = Math.abs(x - pt.x) + Math.abs(y - pt.y);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
    return best;
  };
  const startCell = { x: Math.floor(f.playerStart.x / TILE), y: Math.floor(f.playerStart.y / TILE) };
  const sCorr = nearestCorr(startCell);
  const targets: Cell[] = [];
  if (f.stairsUp) targets.push(f.stairsUp);
  if (f.locked && f.keyPropId !== null) {
    const kp = f.props.find((p) => p.id === f.keyPropId);
    if (kp) targets.push({ x: kp.x, y: kp.y });
  }
  if (f.vertical?.elevator) targets.push(f.vertical.elevator.outside);
  if (f.vertical?.stairsB) targets.push(f.vertical.stairsB.outside);
  if (sCorr) {
    for (const [ti, tg] of targets.entries()) {
      const gCorr = nearestCorr(tg);
      if (!gCorr) continue;
      const path = astar(W, H, sCorr.x, sCorr.y, gCorr.x, gCorr.y, (x, y) => corrMask[idx(x, y)] === 1);
      if (path) {
        for (const p of path) {
          const z = zoneOf[idx(p.x, p.y)];
          // Treat start->stairsUp & start->key as strict primary route
          if (z >= 0 && ti <= 1) mainRouteZones.add(z);
        }
      }
    }
  }

  // Build final CorridorZoneInfo entries
  const safeRadius = 8; // keep initial start-doorway scout zone calm while showing active patrols nearby!
  const zones: CorridorZoneInfo[] = anchors.map((a, id) => {
    const cells = cellsByZone[id];
    const center = { x: a.cell % W, y: Math.floor(a.cell / W) };
    const safeCells = cells.filter(
      (c) =>
        Math.hypot(c.x - startCell.x, c.y - startCell.y) >= safeRadius &&
        !f.doors.some((d) => d.kind === "stair" && mdist(d, c) <= 1),
    );
    const eligible = safeCells.length >= 3;
    const onMainRoute = mainRouteZones.has(id);
    const deg = adjSets[id].size;
    // Higher score for wide halls, multi-branch intersections, main route, and zones with nearby bypass flats!
    const nearBypass = (f.apartments ?? []).some(
      (apt) => apt.isBypass && (mdist(apt.entryDoor, center) <= 10 || (apt.secondaryExit && mdist(apt.secondaryExit, center) <= 10)),
    );
    const importance =
      (a.kind === "lobby" ? 3.2 : a.kind === "junction" ? 2.3 : a.kind === "landing" ? 1.5 : 1.0) +
      (onMainRoute ? 2.4 : 0) +
      Math.min(3, deg) * 0.45 +
      Math.min(2.5, cells.length / 22) +
      (nearBypass ? 0.8 : 0);

    // Promote wide high-area zones cleanly to lobby for reporting
    const bigOpen = cells.length >= 34 && localOpenness(corrMask, center.x, center.y) >= 8;
    const kind: CorridorZoneInfo["kind"] = bigOpen ? "lobby" : a.kind;
    return {
      id,
      kind,
      cells,
      center,
      neighbors: Array.from(adjSets[id]).sort((x, y) => x - y),
      onMainRoute,
      eligible,
      importance: +importance.toFixed(2),
      plannedZombies: 0,
      placedZombies: 0,
      mode: "empty",
      groupSize: 0,
      patrolRoute: [],
    };
  });

  return { zones, zoneOf, corrMask };
}

/**
 * Computes a real verified passable multi-zone corridor patrol circuit starting from `zone`,
 * covering 2–4 connected zones (typically 3–5 points, 14–34 tiles end-to-end) exclusively along
 * open corridor tiles so patrolling zombies travel smoothly through real stretches & junctions.
 */
function buildPatrolRoute(
  zone: CorridorZoneInfo,
  zones: CorridorZoneInfo[],
  corrMask: Uint8Array,
  startCell: Cell,
  rng: ReturnType<typeof makeRng>,
): Cell[] {
  const safeCenter = (z: CorridorZoneInfo): Cell | null => {
    if (Math.hypot(z.center.x - startCell.x, z.center.y - startCell.y) >= 7 && corrMask[idx(z.center.x, z.center.y)]) {
      return z.center;
    }
    const alt = z.cells.find(
      (c) => Math.hypot(c.x - startCell.x, c.y - startCell.y) >= 7 && corrMask[idx(c.x, c.y)],
    );
    return alt ?? null;
  };
  const canWalk = (x: number, y: number) => inb(x, y) && corrMask[idx(x, y)] === 1;
  const route: Cell[] = [];
  const home = safeCenter(zone);
  if (!home) return route;
  route.push(home);

  // Pick 1st neighboring zone along corridor network
  const cand1 = zone.neighbors
    .map((nid) => zones[nid])
    .filter((nz) => nz && safeCenter(nz) !== null)
    .sort((a, c) => (rng() - 0.5) + (c.onMainRoute ? 0.3 : 0) - (a.onMainRoute ? 0.3 : 0));

  for (const n1 of cand1) {
    const p1 = safeCenter(n1)!;
    if (mdist(home, p1) < 4) continue;
    const leg1 = astar(W, H, home.x, home.y, p1.x, p1.y, canWalk);
    if (!leg1 || leg1.length < 3 || leg1.length > 34) continue;
    route.push(p1);
    // Optional second leg: sweep home -> n1 -> opposite OR forward across 2-3 adjacent corridor zones!
    const opposite = cand1.find((n2) => {
      if (n2.id === n1.id) return false;
      const p2 = safeCenter(n2);
      if (!p2 || mdist(p2, p1) < 8 || mdist(p2, home) < 4) return false;
      const leg = astar(W, H, home.x, home.y, p2.x, p2.y, canWalk);
      return !!leg && leg.length >= 3 && leg.length <= 34;
    });
    if (opposite) {
      route.push(safeCenter(opposite)!);
    } else {
      const forward = n1.neighbors
        .map((nid) => zones[nid])
        .filter((n2) => n2 && n2.id !== zone.id && n2.id !== n1.id)
        .find((n2) => {
          const p2 = safeCenter(n2);
          if (!p2 || mdist(p2, home) < 7) return false;
          const leg = astar(W, H, p1.x, p1.y, p2.x, p2.y, canWalk);
          return !!leg && leg.length >= 3 && leg.length <= 32;
        });
      if (forward) route.push(safeCenter(forward)!);
    }
    break;
  }

  // Always guarantee at least 2 distinct points spaced >= 4 tiles (for compact pocket segments)
  if (route.length === 1) {
    const far = zone.cells
      .filter((c) => Math.hypot(c.x - startCell.x, c.y - startCell.y) >= 7 && mdist(c, home) >= 3)
      .sort((a, c) => mdist(c, home) - mdist(a, home))[0];
    if (far && astar(W, H, home.x, home.y, far.x, far.y, canWalk)) {
      route.push(far);
    }
  }
  return route;
}

/** Longest run of adjacent empty eligible zones in the corridor graph (via bounded tree traversal). */
function measureLongestEmptyRun(zones: CorridorZoneInfo[]): number {
  const emptyIds = new Set(zones.filter((z) => z.eligible && z.placedZombies === 0).map((z) => z.id));
  if (!emptyIds.size) return 0;
  // Find diameter of each connected component of empty eligible zones
  const seen = new Set<number>();
  let worst = 0;
  for (const id of emptyIds) {
    if (seen.has(id)) continue;
    const bfs = (start: number) => {
      const dist = new Map<number, number>([[start, 0]]);
      const q = [start];
      let far = start;
      for (let h = 0; h < q.length; h++) {
        const cur = q[h];
        seen.add(cur);
        if (dist.get(cur)! > dist.get(far)!) far = cur;
        for (const nb of zones[cur].neighbors) {
          if (emptyIds.has(nb) && !dist.has(nb)) {
            dist.set(nb, dist.get(cur)! + 1);
            q.push(nb);
          }
        }
      }
      return { far, max: dist.get(far)! + 1 };
    };
    const first = bfs(id);
    const second = bfs(first.far);
    if (second.max > worst) worst = second.max;
  }
  return worst;
}

/**
 * Rebuilds initial floor zombie population using dedicated corridor zoning + real multi-zone
 * patrol routing + independent room population + post-placement rejection recovery.
 * Replaces sparse random zombie placement completely while leaving boss roof untouched.
 */
export function populateFloorZombies(f: FloorData, index: number, seed: number): CorridorPopulationReport {
  const rng = makeRng((seed ^ 0x4c91b7d3) >>> 0);
  const blocked = buildBlockedMap(f);
  const startCell = { x: Math.floor(f.playerStart.x / TILE), y: Math.floor(f.playerStart.y / TILE) };
  const { zones, corrMask } = segmentCorridorNetwork(f, blocked);

  const eligible = zones.filter((z) => z.eligible);
  // Target occupancy firmly inside 56%..69% scaled by floor progression & available stealth bypasses
  const baseRates = [0.57, 0.59, 0.61, 0.63, 0.64, 0.66, 0.67, 0.68, 0.69, 0.70];
  const baseRate = baseRates[Math.min(index, baseRates.length - 1)];
  const bypasses = (f.apartments ?? []).filter((a) => a.isBypass).length;
  const targetRate = Math.min(0.70, Math.max(0.56, baseRate + (bypasses >= 4 ? 0.01 : 0)));

  // Select eligible zones to occupy, guaranteeing strong main-route tension AND deliberate calm scouting gaps!
  const desiredOccupied = eligible.length
    ? Math.max(Math.min(eligible.length, 4), Math.min(eligible.length, Math.round(eligible.length * targetRate)))
    : 0;

  const selected = new Set<number>();
  // Ranked by importance + seeded jitter; keep calm intervals along primary route so stealth/observation pays off
  const scored = eligible
    .map((z) => ({ z, score: z.importance + rng() * 2.0 }))
    .sort((a, c) => c.score - a.score);

  // Guard ~65-75% of critical main-route corridor zones while keeping quiet watching pockets
  const mainElig = scored.filter((s) => s.z.onMainRoute);
  const wantMain = Math.min(mainElig.length, Math.max(2, Math.round(mainElig.length * (0.62 + index * 0.015))));
  for (const s of mainElig) {
    if (selected.size >= wantMain || selected.size >= desiredOccupied) break;
    // Slight preference to alternate so calm observation alcoves appear naturally between patrols
    const adjSelected = s.z.neighbors.filter((nb) => selected.has(nb)).length;
    if (adjSelected >= 2 && mainElig.length > wantMain + 1) continue;
    selected.add(s.z.id);
  }
  // Top up main route if alternating passed too many
  for (const s of mainElig) {
    if (selected.size >= wantMain || selected.size >= desiredOccupied) break;
    selected.add(s.z.id);
  }
  // Fill remainder across all branches & side wings prioritizing unguarded runs (kills long empty stretches!)
  while (selected.size < desiredOccupied) {
    let bestId = -1;
    let bestScore = -Infinity;
    for (const s of scored) {
      if (selected.has(s.z.id)) continue;
      const emptyAdj = s.z.neighbors.filter((nb) => zones[nb].eligible && !selected.has(nb)).length;
      const busyAdj = s.z.neighbors.filter((nb) => selected.has(nb)).length;
      const sc = s.score + emptyAdj * 1.15 - busyAdj * 0.75;
      if (sc > bestScore) {
        bestScore = sc;
        bestId = s.z.id;
      }
    }
    if (bestId < 0) break;
    selected.add(bestId);
  }

  // Decide which occupied zones host a multi-zombie patrol group (2–4 zombies) vs solo patrol!
  const desiredGroups =
    index === 0 ? 2 : index <= 2 ? 2 : index <= 5 ? 3 : 4;
  const maxGroupSize = index <= 1 ? 2 : index <= 4 ? 3 : 4;
  const groupCandidates = Array.from(selected)
    .map((id) => zones[id])
    .filter((z) => z.cells.length >= 16)
    .sort((a, c) => {
      const aScore = (a.kind === "lobby" ? 25 : a.kind === "junction" ? 12 : 0) + a.cells.length * 0.4 + (a.onMainRoute ? 8 : 0) + rng() * 6;
      const cScore = (c.kind === "lobby" ? 25 : c.kind === "junction" ? 12 : 0) + c.cells.length * 0.4 + (c.onMainRoute ? 8 : 0) + rng() * 6;
      return cScore - aScore;
    });

  const chosenGroups = new Set<number>();
  for (const z of groupCandidates) {
    if (chosenGroups.size >= desiredGroups) break;
    // Spread groups apart when possible so two packs aren't glued next door
    if (z.neighbors.some((nb) => chosenGroups.has(nb)) && groupCandidates.length > desiredGroups + 1) continue;
    chosenGroups.add(z.id);
  }
  for (const z of groupCandidates) {
    if (chosenGroups.size >= desiredGroups) break;
    chosenGroups.add(z.id);
  }

  // Pick zombie kinds balanced to floor stage (calm starter mix -> lethal mixed packs higher up)
  const pickCorridorKind = (inGroup: boolean, slot: number): ZombieKind => {
    if (index === 0) return "shambler";
    if (index === 1) return inGroup && slot === 1 && rng.chance(0.45) ? "runner" : "shambler";
    const runnerP = Math.min(0.38, 0.14 + index * 0.03);
    const bruteP = index >= 4 ? Math.min(0.18, (index - 3) * 0.03) : 0;
    const roll = rng();
    if (inGroup && slot === 0 && roll < bruteP) return "brute";
    if (roll < runnerP) return "runner";
    return "shambler";
  };

  const occupiedTile = new Set<number>();
  // Pre-seed any existing vertical quest horde cells so we don't stack on top of them
  const preserved: ZombieSpawn[] = [];
  const lureCells = f.vertical?.quest?.horde ?? [];
  for (const z of f.zombies) {
    const cx = Math.floor(z.x / TILE);
    const cy = Math.floor(z.y / TILE);
    if (lureCells.some((c) => c.x === cx && c.y === cy)) {
      preserved.push({ ...z, role: "lure" });
      occupiedTile.add(idx(cx, cy));
    }
  }

  const corridorSpawns: ZombieSpawn[] = [];
  const rejections: string[] = [];
  let plannedTotal = 0;
  let nextGroupId = 1;
  let unplacedDeficit = 0;

  // Build routes & spawn into selected zones
  const validCellsIn = (z: CorridorZoneInfo) =>
    z.cells.filter(
      (c) =>
        Math.hypot(c.x - startCell.x, c.y - startCell.y) >= 8.2 &&
        corrMask[idx(c.x, c.y)] === 1 &&
        !occupiedTile.has(idx(c.x, c.y)) &&
        !f.doors.some((d) => d.kind === "stair" && mdist(d, c) <= 1),
    );

  for (const id of selected) {
    const z = zones[id];
    const isGroup = chosenGroups.has(id);
    const size = isGroup
      ? Math.min(
          maxGroupSize,
          z.kind === "lobby" && index >= 5 ? 4 : z.cells.length >= 28 && index >= 2 ? Math.min(3, maxGroupSize) : 2,
        )
      : 1;
    z.plannedZombies = size;
    plannedTotal += size;
    const route = buildPatrolRoute(z, zones, corrMask, startCell, rng);
    z.patrolRoute = route;
    const pool = validCellsIn(z);
    if (!pool.length) {
      z.rejectReason = "brak wolnych pól w strefie po kolizjach/zagrożeniach";
      rejections.push(`strefa #${z.id}: ${z.rejectReason} (plan=${size})`);
      unplacedDeficit += size;
      continue;
    }

    // Place anchor closest to zone center, and tightly space group members 1–3 tiles away along connected corridor!
    pool.sort((a, c) => mdist(a, z.center) - mdist(c, z.center));
    const anchor = pool[0];
    const placed: Cell[] = [anchor];
    occupiedTile.add(idx(anchor.x, anchor.y));

    if (size > 1) {
      const rest = pool
        .slice(1)
        .filter((c) => mdist(c, anchor) >= 1 && mdist(c, anchor) <= 5)
        .sort((a, c) => Math.abs(mdist(a, anchor) - 2) - Math.abs(mdist(c, anchor) - 2));
      for (const c of rest) {
        if (placed.length >= size) break;
        if (placed.some((p) => mdist(p, c) < 1)) continue;
        // Verify member actually has clear corridor walk to anchor
        const p = astar(W, H, c.x, c.y, anchor.x, anchor.y, (x, y) => inb(x, y) && corrMask[idx(x, y)] === 1);
        if (!p) continue;
        placed.push(c);
        occupiedTile.add(idx(c.x, c.y));
      }
    }

    const gid = size > 1 && placed.length > 1 ? nextGroupId++ : undefined;
    for (let k = 0; k < placed.length; k++) {
      const cell = placed[k];
      const rid = f.roomOf[idx(cell.x, cell.y)];
      corridorSpawns.push({
        x: (cell.x + 0.5) * TILE,
        y: (cell.y + 0.5) * TILE,
        kind: pickCorridorKind(placed.length > 1, k),
        room: rid >= 0 ? rid : 0,
        role: placed.length > 1 ? "corridor-group" : "corridor-solo",
        patrolZone: z.id,
        patrol: route.map((pt) => ({ x: pt.x, y: pt.y })),
        ...(gid !== undefined ? { groupId: gid } : {}),
      });
    }
    z.placedZombies = placed.length;
    z.mode = placed.length > 1 ? "group" : "solo";
    z.groupSize = placed.length;
    if (placed.length < size) {
      const miss = size - placed.length;
      unplacedDeficit += miss;
      z.rejectReason = `częściowe umieszczenie ${placed.length}/${size} (za mało rozstawionych pól)`;
      rejections.push(`strefa #${z.id}: ${z.rejectReason}`);
    }
  }

  // Recovery pass: relocate any rejected corridor zombie into other spread-out unoccupied eligible zones!
  if (unplacedDeficit > 0) {
    const spares = eligible
      .filter((z) => z.placedZombies === 0)
      .sort((a, c) => c.importance - a.importance);
    for (const z of spares) {
      if (unplacedDeficit <= 0) break;
      const pool = validCellsIn(z);
      if (!pool.length) continue;
      pool.sort((a, c) => mdist(a, z.center) - mdist(c, z.center));
      const c = pool[0];
      const route = buildPatrolRoute(z, zones, corrMask, startCell, rng);
      z.patrolRoute = route;
      occupiedTile.add(idx(c.x, c.y));
      corridorSpawns.push({
        x: (c.x + 0.5) * TILE,
        y: (c.y + 0.5) * TILE,
        kind: pickCorridorKind(false, 0),
        room: Math.max(0, f.roomOf[idx(c.x, c.y)]),
        role: "corridor-solo",
        patrolZone: z.id,
        patrol: route.map((pt) => ({ x: pt.x, y: pt.y })),
      });
      z.placedZombies = 1;
      z.mode = "solo";
      z.groupSize = 1;
      unplacedDeficit--;
    }
    if (unplacedDeficit > 0) {
      rejections.push(`niezrealizowane po relokacji: ${unplacedDeficit}`);
    }
  }

  // Break any excessively long consecutive empty corridor run (3+ adjacent eligible zones all dark)
  const emptyRunLimit = 2;
  if (measureLongestEmptyRun(zones) > emptyRunLimit) {
    const emptyBig = eligible
      .filter((z) => z.placedZombies === 0 && z.neighbors.filter((nb) => zones[nb].eligible && zones[nb].placedZombies === 0).length >= 2)
      .sort((a, c) => c.importance - a.importance);
    for (const z of emptyBig) {
      if (measureLongestEmptyRun(zones) <= emptyRunLimit) break;
      const occRate = zones.filter((zz) => zz.placedZombies > 0).length / Math.max(1, eligible.length);
      if (occRate >= 0.74) break;
      const pool = validCellsIn(z);
      if (!pool.length) continue;
      const c = pool[0];
      const route = buildPatrolRoute(z, zones, corrMask, startCell, rng);
      z.patrolRoute = route;
      occupiedTile.add(idx(c.x, c.y));
      corridorSpawns.push({
        x: (c.x + 0.5) * TILE,
        y: (c.y + 0.5) * TILE,
        kind: pickCorridorKind(false, 0),
        room: Math.max(0, f.roomOf[idx(c.x, c.y)]),
        role: "corridor-solo",
        patrolZone: z.id,
        patrol: route.map((pt) => ({ x: pt.x, y: pt.y })),
      });
      z.plannedZombies = 1;
      z.placedZombies = 1;
      z.mode = "solo";
      z.groupSize = 1;
      plannedTotal++;
    }
  }

  // Separate interior room budget (NEVER cannibalizes corridor budget!)
  const roomTarget = Math.min(10, 3 + Math.floor(index * 0.75));
  const roomSpawns: ZombieSpawn[] = [];
  const startRoomId = f.roomOf[idx(startCell.x, startCell.y)];
  const startAptId = startRoomId >= 0 ? f.rooms[startRoomId]?.apartmentId : undefined;
  const candidateRooms = f.rooms.filter((r) => {
    if (r.role !== "normal") return false;
    if (r.id === startRoomId) return false;
    if (startAptId !== undefined && r.apartmentId === startAptId) return false;
    const zn = f.roomZones[r.id];
    if (["KORYTARZ", "KLATKA SCHODOWA", "WINDA OSOBOWA", "PION TECHNICZNY", "KLATKA B", "ZALANY MAGAZYN"].includes(zn)) return false;
    // Skip annex sealed rooms (they get their own annex guard)
    if (f.environment?.annexes.some((a) => a.room === r.id)) return false;
    return r.w >= 3 && r.h >= 3;
  });
  // Shuffle deterministically & spread one per room (never crowding tight closets/baths blindly)
  for (let i = candidateRooms.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [candidateRooms[i], candidateRooms[j]] = [candidateRooms[j], candidateRooms[i]];
  }
  const addCrawler = index >= 1;
  let crawlerAdded = false;
  for (const r of candidateRooms) {
    if (roomSpawns.length >= roomTarget) break;
    const freeCells: Cell[] = [];
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = idx(x, y);
        if (blocked[i] || occupiedTile.has(i) || !WALKABLE.has(f.tiles[i])) continue;
        if (Math.hypot(x - startCell.x, y - startCell.y) < 10) continue;
        if (f.doors.some((d) => mdist(d, { x, y }) <= 1)) continue;
        freeCells.push({ x, y });
      }
    }
    if (!freeCells.length) continue;
    const c = freeCells[rng.int(freeCells.length)];
    occupiedTile.add(idx(c.x, c.y));
    let kind: ZombieKind = "shambler";
    let role: ZombieSpawn["role"] = "room";
    if (addCrawler && !crawlerAdded) {
      kind = "crawler";
      role = "crawler";
      crawlerAdded = true;
    } else if (index >= 3 && rng.chance(0.24)) {
      kind = "runner";
    } else if (index >= 6 && rng.chance(0.12)) {
      kind = "brute";
    }
    roomSpawns.push({
      x: (c.x + 0.5) * TILE,
      y: (c.y + 0.5) * TILE,
      kind,
      room: r.id,
      role,
    });
  }

  f.zombies = [...preserved, ...corridorSpawns, ...roomSpawns];

  const occupiedZones = zones.filter((z) => z.placedZombies > 0).length;
  const soloPatrols = zones.filter((z) => z.mode === "solo").length;
  const groupPatrols = zones.filter((z) => z.mode === "group").length;
  const groupMembers = zones.filter((z) => z.mode === "group").reduce((n, z) => n + z.placedZombies, 0);
  const mainRouteEligible = eligible.filter((z) => z.onMainRoute).length;
  const mainRouteCovered = eligible.filter((z) => z.onMainRoute && z.placedZombies > 0).length;
  const totalInitial = f.zombies.length;
  const populationCap = Math.min(TACTICAL.waves.populationMax, Math.max(TACTICAL.waves.basePopulation, totalInitial + TACTICAL.waves.waveHeadroom));
  const waveHeadroom = Math.max(0, populationCap - totalInitial);

  const report: CorridorPopulationReport = {
    floor: index,
    totalZones: zones.length,
    eligibleZones: eligible.length,
    occupiedZones,
    occupancyRate: eligible.length ? +(occupiedZones / eligible.length).toFixed(3) : 0,
    targetRate: +targetRate.toFixed(3),
    plannedCorridor: plannedTotal,
    placedCorridor: corridorSpawns.length,
    roomZombies: roomSpawns.length,
    totalInitial,
    soloPatrols,
    groupPatrols,
    groupMembers,
    longestEmptyRun: measureLongestEmptyRun(zones),
    mainRouteCovered,
    mainRouteEligible,
    populationCap,
    waveHeadroom,
    rejections,
    zones,
  };
  f.corridorReport = report;
  return report;
}

/**
 * Helper used at runtime (e.g. restoring an older checkpoint save) to give any corridor zombie
 * a verified connected multi-point patrol path across real adjacent corridor tiles (never into walls!).
 */
export function buildFallbackCorridorPatrol(f: FloorData, startX: number, startY: number): Cell[] {
  const blocked = buildBlockedMap(f);
  const sx = Math.max(1, Math.min(W - 2, Math.floor(startX / TILE)));
  const sy = Math.max(1, Math.min(H - 2, Math.floor(startY / TILE)));
  const canWalk = (x: number, y: number) => inb(x, y) && isCorridorTile(f, x, y, blocked);
  if (!canWalk(sx, sy)) return [];
  // BFS outwards along corridor tiles to sample up to 3 well-spaced reachable corridor anchors
  const dist = new Int16Array(W * H).fill(-1);
  const q: number[] = [idx(sx, sy)];
  dist[q[0]] = 0;
  const far: Cell[] = [];
  for (let head = 0; head < q.length; head++) {
    const p = q[head];
    const d = dist[p];
    if (d >= 16) continue;
    const x = p % W;
    const y = Math.floor(p / W);
    if (d >= 6 && d <= 14) far.push({ x, y });
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!canWalk(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (dist[ni] >= 0) continue;
      dist[ni] = d + 1;
      q.push(ni);
    }
  }
  const route: Cell[] = [{ x: sx, y: sy }];
  if (far.length) {
    // Pick two corridor tiles farthest from each other inside the zone neighborhood
    far.sort((a, c) => mdist(c, route[0]) - mdist(a, route[0]));
    const first = far[0];
    route.push(first);
    const second = far.find((c) => mdist(c, first) >= 8 && mdist(c, route[0]) >= 5);
    if (second) route.push(second);
  }
  return route.length >= 2 ? route : [];
}
