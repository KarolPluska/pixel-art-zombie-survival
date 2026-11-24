import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const baseline = JSON.parse(await readFile("reports/baseline-maps.json", "utf8"));
const js = await build({ entryPoints: ["src/game/generate.ts"], platform: "node", format: "esm", bundle: true, write: false });
const pjs = await build({ entryPoints: ["src/game/path.ts"], platform: "node", format: "esm", bundle: true, write: false });
const { generateFloor, validateFloor, diagnoseVariedFloor, LAYOUT_FAMILIES } = await import(
  `data:text/javascript;base64,${Buffer.from(js.outputFiles[0].contents).toString("base64")}`
);
const { astar } = await import(`data:text/javascript;base64,${Buffer.from(pjs.outputFiles[0].contents).toString("base64")}`);
const walkable = new Set([1, 2, 3, 4, 5, 7, 8]);
const W = 56;
const H = 88;
const TILE = 16;

const ZONE_FILL = {
  "KORYTARZ": "#4f5b5d",
  "KLATKA SCHODOWA": "#7d7754",
  "PRZEDPOKÓJ": "#8f8564",
  "SALON": "#7a6650",
  "KUCHNIA": "#8c744c",
  "ŁAZIENKA": "#497983",
  "SYPIALNIA": "#6b5d7a",
  "POKÓJ DZIECIĘCY": "#82647d",
  "SCHOWEK": "#5f6852",
  "WARSZTAT": "#6f604b",
  "KOTŁOWNIA": "#755143",
  "PRALNIA": "#4f7272",
  "LOKAL UŻYTKOWY": "#69755a",
  "WINDA OSOBOWA": "#8f6c3d",
  "KLATKA B": "#467085",
  "PION TECHNICZNY": "#6d5a82",
  "ZALANY MAGAZYN": "#365f7a",
};

function metrics(f) {
  const tiles = typeof f.tiles === "string" ? Uint8Array.from(f.tiles, Number) : f.tiles;
  const start = { x: Math.floor((f.start?.x ?? f.playerStart.x) / TILE), y: Math.floor((f.start?.y ?? f.playerStart.y) / TILE) };
  const up = f.up ?? f.stairsUp;
  const rooms = typeof f.tiles === "string" ? f.rooms : f.rooms.map((r) => ({ ...r, zone: f.roomZones[r.id] }));
  const corridor = new Uint8Array(W * H);
  for (const r of rooms.filter((r) => r.zone === "KORYTARZ")) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) corridor[y * W + x] = 1;
  }
  const cw = 14, ch = 22;
  const coarse = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    let count = 0;
    for (let y = cy * 4; y < cy * 4 + 4; y++) for (let x = cx * 4; x < cx * 4 + 4; x++) count += corridor[y * W + x];
    coarse[cy * cw + cx] = count >= 3 ? 1 : 0;
  }
  const degree = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].reduce((n, [dx, dy]) => n + (coarse[(y + dy) * cw + x + dx] ?? 0), 0);
  let junctions = 0, turns = 0, longest = 0, corridorCells = 0;
  for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) if (coarse[y * cw + x]) {
    corridorCells++;
    const d = degree(x, y);
    if (d >= 3) junctions++;
    if (d === 2 && (coarse[y * cw + x - 1] || coarse[y * cw + x + 1]) && (coarse[(y - 1) * cw + x] || coarse[(y + 1) * cw + x])) turns++;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      let n = 0, xx = x, yy = y;
      while (xx < cw && yy < ch && coarse[yy * cw + xx]) { n++; xx += dx; yy += dy; }
      longest = Math.max(longest, n);
    }
  }
  const masks = [0, 1, 2, 3].map((t) => {
    const arr = [];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const ax = t & 1 ? cw - 1 - x : x, ay = t & 2 ? ch - 1 - y : y;
      arr.push(coarse[ay * cw + ax]);
    }
    return arr.join("");
  });
  const blocked = new Uint8Array(W * H);
  if (f.props) for (const p of f.props) if (p.solid) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) blocked[y * W + x] = 1;
  if (f.props) for (const d of f.doors) if (d.sealed) blocked[d.y * W + d.x] = 1;
  const q = [start.y * W + start.x], distance = new Int32Array(W * H).fill(-1);
  distance[q[0]] = 0;
  for (let head = 0; head < q.length; head++) {
    const p = q[head], x = p % W, y = Math.floor(p / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, ni = ny * W + nx;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H || distance[ni] >= 0 || blocked[ni] || !walkable.has(tiles[ni])) continue;
      distance[ni] = distance[p] + 1;
      q.push(ni);
    }
  }
  const regular = rooms.filter((r) => r.zone !== "KORYTARZ" && r.zone !== "KLATKA SCHODOWA" && r.w >= 3 && r.h >= 3);
  const startRoom = rooms.find((r) => start.x >= r.x && start.x < r.x + r.w && start.y >= r.y && start.y < r.y + r.h);
  return {
    start, up, startZone: startRoom?.zone ?? "PRZEJŚCIE",
    path: up ? distance[up.y * W + up.x] : -1,
    corridorCells, junctions, turns, longest, corridorSignature: masks.sort()[0],
    rooms: regular.length, roomAreas: regular.map((r) => r.w * r.h),
    roomRatios: regular.map((r) => +(r.w / r.h).toFixed(1)),
    accessible: q.length, occupied: tiles.filter((t) => walkable.has(t)).length,
  };
}

function diagnosticSvg(f, showOverlay = true) {
  const parts = [`<rect width="${W}" height="${H}" fill="#0f1519"/>`];
  // 1) Color floor rooms by explicit function
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const t = f.tiles[i];
      if (t === 0 || t === 9) continue;
      const rid = f.roomOf[i];
      const zn = rid >= 0 ? f.roomZones[rid] : "";
      let fill = ZONE_FILL[zn] ?? "#5c6862";
      if (t === 7) fill = "#8b6c55"; // rubble/breach
      else if (t === 8) fill = "#3c6985"; // puddle
      parts.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`);
    }
  }
  if (showOverlay) {
    // 2) Apartment bounds showing distinct home boundaries!
    for (const apt of f.apartments ?? []) {
      const { x, y, w, h } = apt.bounds;
      const stroke = apt.isBypass ? "#89e0aa" : apt.roomIds.length >= 2 ? "#e8d9a6" : "#809498";
      const dash = apt.isBypass ? "" : apt.roomIds.length >= 2 ? "" : ` stroke-dasharray="1.2,0.8"`;
      parts.push(`<rect x="${x - 0.35}" y="${y - 0.35}" width="${w + 0.7}" height="${h + 0.7}" fill="none" stroke="${stroke}" stroke-width="${apt.roomIds.length >= 2 ? 0.48 : 0.3}"${dash} opacity="0.88"/>`);
    }
    // 3) Important prop access highlights (wardrobes, TV/radio, key, loot)
    for (const p of f.props) {
      if (p.kind === "carpet") continue;
      const c = p.loot === "key" ? "#ffd85a" : p.loot ? "#9cf07c" : p.kind === "radio" || p.kind === "tv" ? "#7de3f0" : p.kind === "wardrobe" || p.kind === "locker" ? "#8bb4d9" : "#262b2d";
      parts.push(`<rect x="${p.x + 0.15}" y="${p.y + 0.15}" width="${p.w - 0.3}" height="${p.h - 0.3}" fill="${c}" opacity="${p.loot || p.kind === "radio" || p.kind === "tv" || p.kind === "wardrobe" ? 0.9 : 0.55}"/>`);
    }
    for (const a of f.propAccess ?? []) {
      if (a.role === "hide" || a.role === "device" || a.role === "loot") {
        parts.push(`<rect x="${a.ax + 0.3}" y="${a.ay + 0.3}" width="0.4" height="0.4" fill="#d9f7ff" opacity="0.72"/>`);
      }
    }
    // 4) Door connections colored by explicit role
    for (const d of f.doors) {
      const c = d.route ? "#f0a968" : d.sealed ? "#b3629e" : d.locked ? "#ffda5c" : d.barricaded ? "#e87846" : d.kind === "bypass" ? "#5ef2a5" : d.kind === "entry" ? "#fff0b3" : d.kind === "service" ? "#c2d49a" : "#d8bd8e";
      parts.push(`<rect x="${d.x}" y="${d.y}" width="1" height="1" fill="${c}"/>`);
    }
    // 5) Actual walkable A* corridor patrol routes (follows corridors strictly without crossing walls!)
    const isCorr = (x, y) => {
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return false;
      const i = y * W + x;
      const rid = f.roomOf[i];
      return rid >= 0 && f.roomZones[rid] === "KORYTARZ" && walkable.has(f.tiles[i]);
    };
    for (const cz of f.corridorReport?.zones ?? []) {
      if (cz.placedZombies <= 0 || cz.patrolRoute.length < 2) continue;
      const full = [cz.patrolRoute[0]];
      for (let k = 0; k < cz.patrolRoute.length - 1; k++) {
        const a = cz.patrolRoute[k], b = cz.patrolRoute[k + 1];
        const seg = astar(W, H, a.x, a.y, b.x, b.y, isCorr);
        if (seg) full.push(...seg);
      }
      const pts = full.map((p) => `${p.x + 0.5},${p.y + 0.5}`).join(" ");
      parts.push(`<polyline points="${pts}" fill="none" stroke="${cz.mode === "group" ? "#ff5247" : "#ffa34d"}" stroke-width="${cz.mode === "group" ? 0.62 : 0.42}" stroke-linecap="round" stroke-linejoin="round" opacity="0.86"/>`);
    }
    // 6) Zombie placements: solo corridor (orange), group corridor (bright red with ring), interior room (muted rose)
    for (const z of f.zombies) {
      const zx = (z.x / TILE).toFixed(1), zy = (z.y / TILE).toFixed(1);
      if (z.role === "corridor-group") {
        parts.push(`<circle cx="${zx}" cy="${zy}" r="1.05" fill="#ff3b30" stroke="#fff0dc" stroke-width="0.28"/>`);
      } else if (z.role === "corridor-solo") {
        parts.push(`<circle cx="${zx}" cy="${zy}" r="0.85" fill="#ff943d" stroke="#1b0e08" stroke-width="0.24"/>`);
      } else {
        parts.push(`<circle cx="${zx}" cy="${zy}" r="0.68" fill="#d4687a" stroke="#1f0d12" stroke-width="0.2"/>`);
      }
    }
  }
  const sx = f.playerStart.x / TILE, sy = f.playerStart.y / TILE;
  parts.push(`<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="1.8" fill="#e8fff1" stroke="#0d1712" stroke-width="0.5"/>`);
  if (f.stairsUp) parts.push(`<circle cx="${f.stairsUp.x + 0.5}" cy="${f.stairsUp.y + 0.5}" r="1.8" fill="#ffd86e" stroke="#1b1408" stroke-width="0.5"/>`);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-label="Diagnostyczny rzut piętra"><g>${parts.join("")}</g></svg>`;
}

const old = baseline.map((f) => ({ seed: f.seed, family: "STARY", layout: f.layout, ...metrics(f), tiles: f.tiles, doors: f.doors }));
const current = [];
const residential = [];
const extra = [];
const rejectionReasons = {};
let rejected = 0;
const svgPairs = [];

for (let n = 0; n < 32; n++) {
  const seed = baseline[n].seed;
  const f0 = generateFloor(0, seed, seed);
  const f2 = generateFloor(2, (seed + 2 * 131) >>> 0, seed);
  const attempts = Math.max(0, Math.min(16, Math.round(((f0.seed - seed) >>> 0) / 997)));
  rejected += attempts;
  for (let a = 0; a < attempts; a++) {
    const reason = diagnoseVariedFloor(0, (seed + a * 997) >>> 0, seed);
    rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
  }
  const fam0 = LAYOUT_FAMILIES.find((v) => f0.sub.endsWith(v)) ?? "AWARYJNY";
  const fam2 = LAYOUT_FAMILIES.find((v) => f2.sub.endsWith(v)) ?? "AWARYJNY";
  current.push({
    seed, layout: f0.seed, family: fam0, valid: validateFloor(f0), ...metrics(f0),
    quality: f0.qualityReport,
    corridor: f0.corridorReport ? {
      zones: `${f0.corridorReport.occupiedZones}/${f0.corridorReport.eligibleZones}`,
      occupancyRate: f0.corridorReport.occupancyRate,
      planned: f0.corridorReport.plannedCorridor,
      placed: f0.corridorReport.placedCorridor,
      solo: f0.corridorReport.soloPatrols,
      groups: f0.corridorReport.groupPatrols,
      groupMembers: f0.corridorReport.groupMembers,
      roomZombies: f0.corridorReport.roomZombies,
      longestEmptyRun: f0.corridorReport.longestEmptyRun,
      waveHeadroom: f0.corridorReport.waveHeadroom,
      rejections: f0.corridorReport.rejections,
    } : null,
  });
  residential.push({
    seed, floor: 2, family: fam2,
    apartments: f2.qualityReport?.apartments ?? 0,
    multiRoomFlats: (f2.apartments ?? []).filter((a) => a.roomIds.length >= 2).length,
    families: f2.qualityReport?.apartmentFamilies ?? {},
    bypasses: f2.qualityReport?.validBypassRoutes ?? 0,
    dupDoors: f2.qualityReport?.duplicateRoomPairDoors ?? 0,
    closeDoors: f2.qualityReport?.closeSameRoomDoors ?? 0,
    blockedThresholds: f2.qualityReport?.blockedThresholds ?? 0,
    corridorPlanned: f2.corridorReport?.plannedCorridor ?? 0,
    corridorPlaced: f2.corridorReport?.placedCorridor ?? 0,
    occupancyRate: f2.corridorReport?.occupancyRate ?? 0,
    solo: f2.corridorReport?.soloPatrols ?? 0,
    groups: f2.corridorReport?.groupPatrols ?? 0,
    groupMembers: f2.corridorReport?.groupMembers ?? 0,
    longestEmptyRun: f2.corridorReport?.longestEmptyRun ?? 0,
  });
  svgPairs.push({ n, seed, fam0, fam2, s0: diagnosticSvg(f0), s2: diagnosticSvg(f2), f0c: f0.corridorReport, f2c: f2.corridorReport, f2q: f2.qualityReport });
  if (n < 6) {
    for (let fl = 1; fl <= 3; fl++) {
      const adj = generateFloor(fl, (seed + fl * 131) >>> 0, seed);
      extra.push({ seed, floor: fl, family: LAYOUT_FAMILIES.find((v) => adj.sub.endsWith(v)) ?? "AWARYJNY", valid: validateFloor(adj), ...metrics(adj) });
    }
  }
}

const avg = (arr, fn) => +(arr.reduce((n, x) => n + fn(x), 0) / arr.length).toFixed(1);
const summary = {
  seeds: 32,
  baseline: {
    uniqueStarts: new Set(old.map((x) => `${x.start.x},${x.start.y}`)).size,
    uniqueExits: new Set(old.map((x) => `${x.up.x},${x.up.y}`)).size,
    uniqueCorridorSignatures: new Set(old.map((x) => x.corridorSignature)).size,
    fallbacks: old.filter((x) => x.rooms < 10).length,
    avgPath: avg(old, (x) => x.path),
    avgJunctions: avg(old, (x) => x.junctions),
    avgTurns: avg(old, (x) => x.turns),
    avgCorridorCells: avg(old, (x) => x.corridorCells),
  },
  current: {
    uniqueStarts: new Set(current.map((x) => `${x.start.x},${x.start.y}`)).size,
    uniqueExits: new Set(current.map((x) => `${x.up.x},${x.up.y}`)).size,
    uniqueCorridorSignatures: new Set(current.map((x) => x.corridorSignature)).size,
    fallbacks: current.filter((x) => x.family === "AWARYJNY").length,
    rejected,
    rejectionReasons,
    avgPath: avg(current, (x) => x.path),
    avgJunctions: avg(current, (x) => x.junctions),
    avgTurns: avg(current, (x) => x.turns),
    avgCorridorCells: avg(current, (x) => x.corridorCells),
    duplicateDoors: current.reduce((n, x) => n + (x.quality?.duplicateRoomPairDoors ?? 0), 0),
    closeSameRoomDoors: current.reduce((n, x) => n + (x.quality?.closeSameRoomDoors ?? 0), 0),
    blockedThresholds: current.reduce((n, x) => n + (x.quality?.blockedThresholds ?? 0), 0),
    floor0AvgCorridorZ: avg(current, (x) => x.corridor?.placed ?? 0),
    floor0AvgOccupancyPct: +(current.reduce((n, x) => n + (x.corridor?.occupancyRate ?? 0), 0) / 32 * 100).toFixed(1),
    floor2AvgCorridorZ: avg(residential, (x) => x.corridorPlaced),
    floor2AvgOccupancyPct: +(residential.reduce((n, x) => n + x.occupancyRate, 0) / 32 * 100).toFixed(1),
    floor2AvgMultiRoomFlats: avg(residential, (x) => x.multiRoomFlats),
    floor2AvgBypasses: avg(residential, (x) => x.bypasses),
    floor2MaxEmptyRun: Math.max(...residential.map((x) => x.longestEmptyRun)),
    families: Object.fromEntries(LAYOUT_FAMILIES.map((f) => [f, current.filter((x) => x.family === f).length])),
  },
};

await mkdir("reports", { recursive: true });
await mkdir("public", { recursive: true });
await writeFile("reports/layout-metrics.json", JSON.stringify({ summary, old: old.map(({ tiles, ...f }) => f), current, residential, adjacent: extra }, null, 2));

const cards = svgPairs
  .map(({ n, seed, fam0, fam2, s0, s2, f0c, f2c, f2q }) => `
    <article>
      <header><b>#${String(n + 1).padStart(2, "0")}</b> <span>seed ${seed}</span><em>${fam2}</em></header>
      <div class="pair">
        <figure>${s0}<figcaption>PIWNICA · ${fam0} · Z:${f0c.placedCorridor}/${f0c.plannedCorridor} (${Math.round(f0c.occupancyRate * 100)}%)</figcaption></figure>
        <figure>${s2}<figcaption>PIĘTRO I · ${f2q.validBypassRoutes} obejść · Z:${f2c.placedCorridor}/${f2c.plannedCorridor} (${Math.round(f2c.occupancyRate * 100)}%)</figcaption></figure>
      </div>
      <p>P.I: ${f2q.apartments} lok. · solo ${f2c.soloPatrols} + gr. ${f2c.groupPatrols} (${f2c.groupMembers}z) · puste max ${f2c.longestEmptyRun} · dup.drzwi ${f2q.duplicateRoomPairDoors}</p>
    </article>`)
  .join("");

const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>BLOK 7 / Diagnostyka generatora (32 seedy)</title><style>
*{box-sizing:border-box}body{margin:0;background:#0a0f13;color:#e7e6da;font:12px/1.5 monospace}
main{max-width:1620px;margin:auto;padding:28px 22px}
h1{font:bold clamp(26px,4vw,52px) monospace;letter-spacing:-2px;margin:0;color:#e8c584}
h2{font-size:15px;color:#f0c988;margin:24px 0 12px}
.intro{color:#b0bfba;max-width:96ch;margin:8px 0 16px}
.stats{display:flex;gap:22px;flex-wrap:wrap;border-block:1px solid #3c4d4d;padding:12px 0;margin:16px 0}
.stats b{color:#e8c584}.stats small{display:block;color:#8ba09b;font-size:10px}
.legend{display:flex;gap:12px;flex-wrap:wrap;color:#b8c6be;margin:12px 0 20px;font-size:11px}
.legend span:before{content:'■';color:var(--c);margin-right:5px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px}
article{padding:11px;border:1px solid #334346;background:#11191e}
article header{display:flex;gap:8px;align-items:center;font-size:11px}
article header em{font-style:normal;color:#93d6ac;margin-left:auto;font-size:10px}
article p{font-size:10px;color:#8ca29c;margin:7px 0 0}
.pair{display:flex;gap:6px;margin-top:8px}
figure{margin:0;flex:1}
svg{width:100%;height:auto;border:1px solid #283638;image-rendering:pixelated}
figcaption{font-size:9px;color:#aabcb3;padding-top:3px}
</style></head><body><main>
<h1>BLOK 7 / DIAGNOSTYKA GENERATORA</h1>
<p class="intro">32 ziarna wygenerowane rzeczywistą ścieżką „Nowa gra” (56×88). Lewa kolumna: Piwnica (zaplecza techniczne), prawa kolumna: Piętro I (mieszkania z przedpokojem, pionem wodnym, zestawami mebli, drzwiami z grafu, strefami dojścia, punktami zombie oraz trasami patroli korytarzowych).</p>
<div class="stats">
  <div><small>DUPLIKATY DRZWI</small><b>${summary.current.duplicateDoors}</b></div>
  <div><small>BLISKIE DRZWI POKOJU</small><b>${summary.current.closeSameRoomDoors}</b></div>
  <div><small>ZABLOKOWANE PROGI</small><b>${summary.current.blockedThresholds}</b></div>
  <div><small>PIWNICA KORYTARZ Z</small><b>śr. ${summary.current.floor0AvgCorridorZ} (${summary.current.floor0AvgOccupancyPct}%)</b></div>
  <div><small>PIĘTRO I KORYTARZ Z</small><b>śr. ${summary.current.floor2AvgCorridorZ} (${summary.current.floor2AvgOccupancyPct}%)</b></div>
  <div><small>OBEJŚCIA / P.I</small><b>śr. ${summary.current.floor2AvgBypasses}</b></div>
  <div><small>MIESZKANIA WIELOPOK.</small><b>śr. ${summary.current.floor2AvgMultiRoomFlats}</b></div>
  <div><small>STARTY / TOPOLOGIE</small><b>${summary.current.uniqueStarts} / ${summary.current.uniqueCorridorSignatures}</b></div>
  <div><small>FALLBACK / ODRZUCENIA</small><b>${summary.current.fallbacks} / ${summary.current.rejected}</b></div>
</div>
<div class="legend">
  <span style="--c:#4f5b5d">korytarz</span>
  <span style="--c:#8f8564">przedpokój</span>
  <span style="--c:#7a6650">salon</span>
  <span style="--c:#8c744c">kuchnia</span>
  <span style="--c:#497983">łazienka</span>
  <span style="--c:#6b5d7a">sypialnia</span>
  <span style="--c:#82647d">dziecięcy</span>
  <span style="--c:#5f6852">schowek</span>
  <span style="--c:#6f604b">warsztat</span>
  <span style="--c:#755143">kotłownia</span>
  <span style="--c:#e8d9a6">granica mieszkania</span>
  <span style="--c:#89e0aa">mieszkanie-obejście</span>
  <span style="--c:#fff0b3">drzwi wejściowe</span>
  <span style="--c:#5ef2a5">2. wyjście (obejście)</span>
  <span style="--c:#e87846">barykada</span>
  <span style="--c:#7de3f0">TV/radio</span>
  <span style="--c:#8bb4d9">szafa (kryjówka)</span>
  <span style="--c:#9cf07c">zapasy</span>
  <span style="--c:#d9f7ff">strefa dojścia</span>
  <span style="--c:#ff943d">patrol solo + trasa</span>
  <span style="--c:#ff3b30">grupa 2–4 + trasa</span>
  <span style="--c:#d4687a">zombie w pokoju</span>
  <span style="--c:#e8fff1">start</span>
  <span style="--c:#ffd86e">schody</span>
</div>
<h2>32 SEEDY — RZUTY DIAGNOSTYCZNE (PIWNICA + PIĘTRO I)</h2>
<div class="grid">${cards}</div>
</main></body></html>`;

await writeFile("public/layout-comparison.html", html);
console.log(JSON.stringify(summary, null, 2));
