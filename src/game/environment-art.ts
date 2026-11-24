import { cellBounds, cycleFor, effectBounds, FLOOR_WARNING, furnitureBounds, GAS_CLEAR, GAS_WARNING, SHELF_WARNING, WALL_DUST, WALL_WARNING, type Bounds, type Environment, type FeatureState } from "./environment";
import { type Cell, type Feature, type Obstacle } from "./environment-layout";
import { TILE, Tile } from "./palette";
import { hash2 } from "./rng";
import { pixLine } from "./sprites";
import type { FloorData } from "./types";

interface Frame {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  w: number;
  h: number;
  floor: FloorData;
  seen(p: Cell): boolean;
  visible(p: Cell): boolean;
}

const ink = "#161b1c";
const rust = "#825740";
const gold = "#e2b96b";
const lead = "#454d4d";
const copper = "#bc7c4f";

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function tileScreen(v: Frame, p: Cell) {
  return { x: p.x * TILE - v.x, y: p.y * TILE - v.y };
}

function inView(v: Frame, p: Cell, visible = false) {
  const { x, y } = tileScreen(v, p);
  return x > -TILE * 2 && y > -TILE * 2 && x < v.w + TILE && y < v.h + TILE && (visible ? v.visible(p) : v.seen(p));
}

function frameCorners(v: Frame, r: Bounds, color: string) {
  const { ctx } = v, x = r.x - v.x, y = r.y - v.y;
  for (const [sx, sy] of [[0, 0], [r.w - 1, 0], [0, r.h - 1], [r.w - 1, r.h - 1]]) {
    box(ctx, x + sx - (sx ? 3 : 0), y + sy, 4, 1, color);
    box(ctx, x + sx, y + sy - (sy ? 2 : 0), 1, 3, color);
  }
}

function control(v: Frame, p: Cell, kind: "wire" | "steam" | "gas", off: boolean, tick: number) {
  if (!inView(v, p)) return;
  const { ctx } = v;
  const { x, y } = tileScreen(v, p);
  box(ctx, x + 3, y + 11, 10, 3, "#1b1b1b");
  box(ctx, x + 6, y + 8, 4, 6, lead);
  box(ctx, x + 3, y + 2, 10, 9, ink);
  box(ctx, x + 4, y + 3, 8, 7, kind === "wire" ? "#69756c" : "#666158");
  box(ctx, x + 4, y + 3, 8, 1, "#9f9e87");
  if (kind === "wire") {
    box(ctx, x + 6, y + 5, 2, 4, "#242a2a");
    box(ctx, x + 6, y + (off ? 8 : 5), 2, 1, "#ded4a1");
    box(ctx, x + 9, y + 5, 2, 2, off ? "#698d8c" : tick % 4 === 0 ? "#cc6b4e" : "#f6ca75");
  } else {
    const col = off ? "#609185" : kind === "gas" ? "#a7a453" : "#c16f54";
    box(ctx, x + 5, y + 5, 6, 3, col);
    box(ctx, x + 7, y + 4, 2, 5, col);
    box(ctx, x + 7, y + 6, 2, 1, "#ead2a3");
  }
}

function wornWall(v: Frame, f: Extract<Feature, { kind: "wall" }>, s: FeatureState, age: number) {
  if (!inView(v, f.at)) return;
  const { ctx } = v;
  const pos = tileScreen(v, f.at);
  if (s.stage === "settled") {
    if (age < WALL_DUST) {
      for (const p of f.landing) if (inView(v, p, true)) {
        const { x, y } = tileScreen(v, p);
        const dx = p.x - f.at.x, dy = p.y - f.at.y;
        ctx.save();
        ctx.globalAlpha = (1 - age / WALL_DUST) * 0.62;
        for (let i = 0; i < 12; i++) {
          const a = hash2(i, f.id, 3), b = hash2(i, f.id, 9);
          const px = Math.max(0, Math.min(13, a * 10 + dx * age * 6 + 2));
          const py = Math.max(0, Math.min(13, b * 9 + dy * age * 6 + age * age * 7));
          box(ctx, x + px, y + py, 2 + (i % 2), 2, i % 3 === 0 ? "#a47558" : "#c7ad89");
        }
        ctx.restore();
      }
    }
    for (const p of f.landing) if (inView(v, p)) {
      const { x, y } = tileScreen(v, p);
      const edge = p.x > f.at.x ? 1 : 12;
      box(ctx, x + edge, y + 4, 3, 2, "#6f503c");
      box(ctx, x + edge - 1, y + 10, 3, 2, "#96765b");
      box(ctx, x + edge + 1, y + 11, 2, 2, "#574135");
    }
    return;
  }
  const progress = s.stage === "warning" ? Math.min(1, age / WALL_WARNING) : 0;
  const x = pos.x + (progress ? Math.round(Math.sin(age * (31 + 22 * progress)) * (0.5 + progress)) : 0);
  const y = pos.y;
  box(ctx, x + 1, y + 1, 14, 14, "#746252");
  box(ctx, x + 1, y + 1, 13, 2, "#a2977b");
  box(ctx, x + 3, y + 3, 10, 9, "#534039");
  for (let row = 0; row < 3; row++) {
    box(ctx, x + 3 + (row % 2), y + 4 + row * 3, 4, 2, row === 0 ? "#ac7655" : "#8c604b");
    box(ctx, x + 8 + (row % 2), y + 4 + row * 3, 4, 2, "#a2694e");
  }
  box(ctx, x + 1, y + 3, 3, 7, "#9b8b70");
  box(ctx, x + 12, y + 7, 3, 5, "#9b8b70");
  box(ctx, x + 3, y + 12, 11, 3, "#4a3b32");
  box(ctx, x + 2, y + 13, 3, 2, "#b49a7a");
  box(ctx, x + 10, y + 12, 3, 2, "#b49a7a");
  const crack = progress > 0.3 ? "#221b17" : "#45372b";
  pixLine(ctx, x + 7, y, x + 6, y + 5, crack);
  pixLine(ctx, x + 6, y + 5, x + 9, y + 7, crack);
  pixLine(ctx, x + 9, y + 7, x + 7, y + 12 + Math.floor(2 * progress), crack);
  if (progress > 0.45) {
    pixLine(ctx, x + 9, y + 7, x + 14, y + 5, "#2b201a");
    pixLine(ctx, x + 7, y + 10, x + 2, y + 9, "#2b201a");
  }
}

function wire(v: Frame, f: Extract<Feature, { kind: "wire" }>, s: FeatureState, clock: number) {
  if (!inView(v, f.at)) return;
  const { ctx, floor: d } = v;
  const { x, y } = tileScreen(v, f.at);
  const nextTo = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]
    .find((p) => d.tiles[(f.at.y + p.y) * d.w + f.at.x + p.x] === Tile.Wall);
  const origin = f.mount === "wall" && nextTo ? { x: 8 + nextTo.x * 8, y: 8 + nextTo.y * 8 }
    : f.mount === "ceiling" ? { x: 9, y: 0 } : { x: 1, y: 12 };
  const swing = s.off ? 0 : Math.round(Math.sin(clock * 7) * (f.mount === "ceiling" ? 1.3 : 0.4));
  box(ctx, x + origin.x - 1, y + origin.y - 1, 3, 3, lead);
  const kink = { x: f.mount === "floor" ? 4 : origin.x - 2, y: f.mount === "floor" ? 10 : (origin.y + 8) / 2 };
  pixLine(ctx, x + origin.x, y + origin.y, x + kink.x, y + kink.y, "#252628");
  pixLine(ctx, x + kink.x, y + kink.y, x + 8 + swing, y + 8, "#342629");
  pixLine(ctx, x + kink.x, y + kink.y + 1, x + 7 + swing, y + 9, copper);
  box(ctx, x + 8 + swing, y + 8, 2, 1, s.off ? "#635747" : "#d8aa75");
}

function pipe(v: Frame, f: Extract<Feature, { kind: "steam" }>, jitter: number) {
  if (!inView(v, f.at)) return;
  const { ctx } = v;
  const { x, y } = tileScreen(v, f.at);
  const a = { x: x + 8 - f.heading.x * 7, y: y + 8 - f.heading.y * 7 };
  if (f.heading.x) {
    box(ctx, a.x - 2, a.y - 5 + jitter, 6, 10, ink);
    box(ctx, a.x - 1, a.y - 4 + jitter, 4, 8, rust);
    box(ctx, a.x - 1, a.y - 4 + jitter, 2, 8, "#a59579");
  } else {
    box(ctx, a.x - 5 + jitter, a.y - 2, 10, 6, ink);
    box(ctx, a.x - 4 + jitter, a.y - 1, 8, 4, rust);
    box(ctx, a.x - 4 + jitter, a.y - 1, 8, 2, "#a59579");
  }
}

function unsafeDeck(v: Frame, f: Feature, s: FeatureState, age: number) {
  if (!inView(v, f.at)) return;
  const { ctx } = v, { x, y } = tileScreen(v, f.at);
  const collapsed = s.stage === "settled";
  const shake = s.stage === "warning" ? Math.floor(age * 15) % 3 - 1 : 0;
  box(ctx, x + 1, y + 1, 14, 14, collapsed ? "#16181c" : "#543d2d");
  if (collapsed) box(ctx, x + 3, y + 3, 10, 10, "#0b0e15");
  for (let i = 0; i < 4; i++) {
    const xx = x + 1 + i * 4, split = 4 + (i * 7) % 5;
    box(ctx, xx, y + 1, 3, collapsed ? split - 2 : split + shake, i % 2 ? "#93785b" : "#74624a");
    box(ctx, xx, y + 15 - split / 2, 3, Math.floor(split / 2), i % 2 ? "#5e4732" : "#886546");
    if (!collapsed) box(ctx, xx, y + split + 2 + shake, 3, 8 - split / 2, "#81644b");
    box(ctx, xx + 1, y + 2, 1, 1, "#342924");
  }
  if (!collapsed) {
    pixLine(ctx, x + 2, y + 7, x + 7, y + 9, "#3d2c24");
    pixLine(ctx, x + 7, y + 9, x + 14, y + 6 + shake, "#2d221e");
  }
}

function noiseSurface(v: Frame, f: Extract<Feature, { kind: "surface" }>, s: FeatureState, clock: number) {
  const { ctx } = v;
  const scuff = s.progress * 3;
  for (const p of f.cells) if (inView(v, p)) {
    const { x, y } = tileScreen(v, p);
    if (f.material === "planks") {
      for (let i = 0; i < 4; i++) {
        const flex = s.progress > 0 && clock - s.since < 0.24 && i === 1 ? 1 : 0;
        box(ctx, x + 1, y + 1 + i * 4 + flex, 14, 3, i % 2 ? "#886b52" : "#70543f");
        box(ctx, x + 4 + i, y + 1 + i * 4, 1, 1, "#c2a582");
        box(ctx, x + 11 - i, y + 2 + i * 4, 1, 1, ink);
      }
    } else if (f.material === "cans") {
      for (let i = 0; i < 4; i++) {
        const px = x + 2 + i % 2 * 7 + ((i % 2) * 2 - 1) * scuff;
        const py = y + 3 + Math.floor(i / 2) * 6 + (i % 2);
        box(ctx, px, py, 5, 3, ink);
        box(ctx, px + 1, py, 3, 2, i % 2 ? "#a37752" : "#7a5245");
        box(ctx, px + 4, py + 1, 1, 1, "#c1beb1");
      }
    } else {
      for (let i = 0; i < 9; i++) {
        const px = x + 2 + Math.round(10 * hash2(p.x + i, p.y, 5));
        const py = y + 2 + Math.round(10 * hash2(p.y, p.x + i, 2));
        box(ctx, px, py, i % 3 ? 2 : 1, i % 3 ? 1 : 2, (i + Math.floor(clock * 2)) % 9 === 0 ? "#d2e5dd" : "#82999a");
        if (i % 3 === 0) box(ctx, px - 1, py + 1, 1, 1, "#496566");
      }
    }
  }
}

export function drawEnvironmentGround(v: Frame, env: Environment) {
  const { ctx } = v;
  for (const f of env.features) {
    const s = env.read(f), age = env.clock - s.since, tick = Math.floor(env.clock * 10);
    if (f.kind === "wall") wornWall(v, f, s, age);
    if (f.kind === "weak") unsafeDeck(v, f, s, age);
    if (f.kind === "surface") noiseSurface(v, f, s, env.clock);
    if (f.kind === "wire") wire(v, f, s, env.clock);
    if (f.kind === "steam") pipe(v, f, cycleFor(f, s, env.clock) === "charging" ? tick % 2 : 0);
    if ((f.kind === "wire" || f.kind === "steam" || f.kind === "gas") && f.control) control(v, f.control, f.kind, s.off || s.stage === "settled", tick);
    if (f.kind === "gas" && inView(v, f.at)) {
      const { x, y } = tileScreen(v, f.at);
      box(ctx, x + 2, y + 4, 10, 4, ink);
      box(ctx, x + 3, y + 4, 9, 2, "#958756");
      box(ctx, x + 7, y + 3, 2, 5, rust);
      box(ctx, x + 11, y + 5, 1, 2, "#423b29");
      if (s.stage === "settled" && !s.off) for (const p of f.cells) {
        if (!inView(v, p)) continue;
        const mark = tileScreen(v, p);
        box(ctx, mark.x + 3, mark.y + 4, 9, 8, "#2c2620aa");
        box(ctx, mark.x + 6, mark.y + 2, 5, 12, "#382b2588");
      }
    }
    if (f.kind === "obstruction" && inView(v, f.at)) {
      const { x, y } = tileScreen(v, f.at);
      const g = tileScreen(v, f.gate);
      box(ctx, x + 2, y + 9, 1, 18, "#99836b");
      box(ctx, x + 13, y + 6, 1, 21, "#705c4a");
      if (s.stage !== "settled" && inView(v, f.gate)) {
        box(ctx, g.x + (f.gate.x < f.at.x ? 13 : 1), g.y + 2, 1, 12, "#bf9d6b");
        box(ctx, g.x + (f.gate.x < f.at.x ? 11 : 3), g.y + 8, 2, 1, "#cfaa75");
      }
    }
  }
}

function cabinet(ctx: CanvasRenderingContext2D, r: Bounds, type: Obstacle, progress: number) {
  const { x, y } = r;
  box(ctx, x, y + 11, 16, 6, "#151719");
  if (type === "boards") {
    for (let i = 0; i < 3; i++) {
      const removed = i < Math.floor(progress * 3);
      const yy = y + 1 + i * 4 + (removed ? 2 : 0);
      box(ctx, x + 1 + (removed ? 2 : 0), yy, removed ? 11 : 14, 3, i % 2 ? "#886044" : "#9c7954");
      box(ctx, x + 2 + i, yy, 1, 1, "#d0b080");
      box(ctx, x + 10, yy + 1, 1, 1, "#4e372c");
    }
    return;
  }
  if (type === "fridge") {
    box(ctx, x + 1, y - 4, 14, 20, "#272c2b");
    box(ctx, x + 2, y - 3, 12, 17, "#a1a99a");
    box(ctx, x + 2, y - 3, 11, 1, "#d4d0b4");
    box(ctx, x + 3, y - 1, 8, 3, "#aab7aa");
    box(ctx, x + 3, y + 4, 11, 1, "#5d6763");
    box(ctx, x + 11, y - 1, 1, 3, lead);
    box(ctx, x + 11, y + 6, 1, 4, lead);
    box(ctx, x + 5, y + 7, 3, 2, "#b89564");
    box(ctx, x + 3, y + 13, 10, 2, rust);
    return;
  }
  const low = type === "dresser" || type === "upturned";
  const top = low ? y + 4 : y - 3;
  box(ctx, x + 1, top, 14, y + 16 - top, "#382920");
  box(ctx, x + 2, top + 1, 12, y + 15 - top, "#82593b");
  box(ctx, x + 2, top + 1, 12, 2, "#af865a");
  if (type === "dresser") {
    for (let i = 0; i < 3; i++) {
      box(ctx, x + 2, top + 4 + i * 3, 12, 1, "#4f392c");
      box(ctx, x + 7, top + 3 + i * 3, 3, 1, "#c4a476");
    }
  } else if (type === "bookcase") {
    for (let i = 0; i < 3; i++) {
      const row = top + 4 + i * 5;
      box(ctx, x + 3, row, 10, 4, "#4a372c");
      box(ctx, x + 4, row, 2, 3, i % 2 ? "#9a805d" : "#716b59");
      box(ctx, x + 8, row + 1, 4, 2, i % 2 ? "#7e755e" : "#af7752");
      box(ctx, x + 2, row + 4, 12, 1, "#a98155");
    }
  } else if (type === "upturned") {
    box(ctx, x + 3, top + 3, 9, 6, "#68635d");
    pixLine(ctx, x + 2, top + 2, x + 4, top - 3, "#a68057");
    pixLine(ctx, x + 11, top + 2, x + 14, top - 3, "#a68057");
  } else {
    box(ctx, x + 3, top + 4, 4, 11, "#70482e");
    box(ctx, x + 9, top + 4, 4, 11, "#976e47");
    box(ctx, x + 7, top + 3, 1, 14, "#4f3328");
    box(ctx, x + 5, top + 10, 1, 2, "#c2a578");
    box(ctx, x + 9, top + 10, 1, 2, "#c2a578");
  }
}

export function environmentProps(v: Frame, env: Environment) {
  const out: { y: number; draw: () => void }[] = [];
  for (const f of env.features) {
    if (f.kind !== "obstruction" && f.kind !== "shelf") continue;
    const s = env.read(f);
    const advance = s.stage === "settled" ? 1 : s.stage === "warning" ? Math.min(1, (env.clock - s.since) / SHELF_WARNING) : 0;
    const to = f.kind === "obstruction" ? f.park : f.landing;
    if (!inView(v, f.at) && !inView(v, to)) continue;
    if (f.kind === "obstruction") {
      const pose = furnitureBounds(f, s.progress);
      out.push({ y: pose.y + TILE, draw: () => cabinet(v.ctx, { ...pose, x: pose.x - v.x, y: pose.y - v.y }, f.material, s.progress) });
      continue;
    }
    const from = tileScreen(v, f.at), dest = tileScreen(v, f.landing);
    out.push({ y: (s.stage === "settled" ? f.landing.y : f.at.y) * TILE + TILE, draw: () => {
      const { ctx } = v;
      if (advance === 1) {
        box(ctx, dest.x + 1, dest.y + 3, 14, 12, "#242523");
        box(ctx, dest.x + 2, dest.y + 4, 12, 9, "#785b41");
        for (let i = 0; i < 3; i++) box(ctx, dest.x + 4 + i * 4, dest.y + 4, 1, 9, "#b28e66");
      } else {
        box(ctx, from.x + 1, from.y + 13, 14, 3, "#241e19");
        const bend = advance * advance * 0.73;
        for (let i = 0; i < 4; i++) {
          const dx = (dest.x - from.x) * bend * (4 - i) / 4;
          const dy = (dest.y - from.y) * bend * (4 - i) / 4;
          const xx = from.x + dx, yy = from.y - 5 + i * 5 + dy;
          box(ctx, xx + 1, yy, 14, 6, "#362820");
          box(ctx, xx + 2, yy, 12, 1, "#ba9365");
          box(ctx, xx + 3, yy + 1, 2, 4, i % 2 ? "#6f7f75" : "#987d52");
          box(ctx, xx + 6, yy + 2, 5, 3, i % 2 ? "#a5855a" : "#80635a");
          box(ctx, xx + 12, yy + 1, 2, 4, "#82603d");
        }
      }
    } });
  }
  return out;
}

function particlesIn(v: Frame, r: Bounds, seed: number, clock: number, color: string, n: number, flow: Cell = { x: 0, y: -1 }) {
  const tick = Math.floor(clock * 16);
  for (let i = 0; i < n; i++) {
    const px = (Math.floor(hash2(seed, i, 33) * (r.w - 2)) + flow.x * tick % (r.w - 2) + r.w - 2) % (r.w - 2);
    const py = (Math.floor(hash2(seed, i, 19) * (r.h - 2)) + flow.y * tick % (r.h - 2) + r.h - 2) % (r.h - 2);
    box(v.ctx, r.x - v.x + 1 + px, r.y - v.y + 1 + py, 2, i % 4 === 0 ? 2 : 1, color);
  }
}

export function drawEnvironmentSignals(v: Frame, env: Environment) {
  const { ctx } = v;
  for (const f of env.features) {
    const s = env.read(f), age = env.clock - s.since;
    const r0 = cellBounds(f.at);
    if (f.kind === "obstruction" && s.stage !== "settled" && inView(v, f.gate, true)) {
      const { x, y } = tileScreen(v, f.gate);
      const edge = f.gate.x < f.at.x ? 13 : 2;
      box(ctx, x + edge, y + 6, 1, 4, "#b89c70");
    }
    if (f.kind === "shelf" && s.stage !== "settled" && inView(v, f.landing, true)) {
      const { x, y } = tileScreen(v, f.landing), dx = f.landing.x - f.at.x, dy = f.landing.y - f.at.y;
      const color = s.stage === "warning" ? "#e1aa63" : "#8b7653";
      for (let i = -2; i <= 2; i++) box(ctx, x + 8 + (3 - Math.abs(i)) * dx + i * dy, y + 8 + (3 - Math.abs(i)) * dy - i * dx, 1, 1, color);
    }
    if (f.kind === "wall" && s.stage === "warning") {
      for (const p of f.landing) if (inView(v, p, true)) {
        frameCorners(v, cellBounds(p), "#c4915d");
        particlesIn(v, cellBounds(p), p.x + p.y, env.clock, "#b39b7e", 2 + Math.floor(age * 2));
      }
    }
    if (f.kind === "weak" && s.stage === "warning" && inView(v, f.at, true)) {
      frameCorners(v, r0, age / FLOOR_WARNING > 0.6 ? "#e3af70" : "#c4915d");
      particlesIn(v, r0, f.id, env.clock, "#b6966c", 2 + Math.floor(age * 3), { x: 0, y: 1 });
    }
    if (f.kind === "wire" || f.kind === "steam" || f.kind === "gas") {
      const cycle = f.kind !== "gas" ? cycleFor(f, s, env.clock) : null;
      const zones = effectBounds(f);
      for (let i = 0; i < f.cells.length; i++) {
        const p = f.cells[i], rect = zones[i], x = rect.x - v.x, y = rect.y - v.y;
        if (!inView(v, p, true) || v.floor.tiles[p.y * v.floor.w + p.x] === Tile.Door) continue;
        if (f.kind === "wire" && cycle !== "off") {
          const live = cycle === "live", charge = cycle === "charging";
          if (live || charge) {
            const cyan = f.mode === "pool" ? "#91dede" : "#ace4ee";
            box(ctx, x, y, rect.w, rect.h, live ? "#94d9ef30" : "#e8bc6617");
            frameCorners(v, rect, live ? cyan : gold);
            const h = Math.floor(env.clock * 17 + i * 2) % 5;
            const mx = x + Math.ceil(rect.w / 2), my = y + Math.ceil(rect.h / 2);
            pixLine(ctx, mx - 4, my + h - 2, mx - 1, my - 2, live ? cyan : gold);
            pixLine(ctx, mx - 1, my - 2, mx + 1, my + 1, live ? "#e0f8f2" : gold);
            if (live) pixLine(ctx, mx + 1, my + 1, mx + 4, my - h, cyan);
            particlesIn(v, rect, f.id + i, env.clock, live ? "#c9f7f4" : "#e0af5e", live ? 5 : 2);
          }
        } else if (f.kind === "steam" && (cycle === "charging" || cycle === "live" || (cycle === "off" && age < 0.65))) {
          const live = cycle === "live";
          if (live) {
            box(ctx, x, y, rect.w, rect.h, "#b3d2d244");
            frameCorners(v, rect, "#b2c6c6");
          }
          particlesIn(v, rect, f.id + i, env.clock, live ? "#cfdfdc" : "#8fa6a6", live ? 13 : cycle === "off" ? Math.ceil(5 * (1 - age / 0.65)) : 3, f.heading);
        } else if (f.kind === "gas") {
          if (s.stage === "settled" && (s.off || age >= 0.75)) continue;
          const warm = s.stage === "warning" || s.stage === "settled";
          ctx.save();
          if (s.stage === "venting") ctx.globalAlpha = Math.max(0, 1 - age / GAS_CLEAR);
          box(ctx, x, y, rect.w, rect.h, warm ? "#dea36745" : "#96aa5b26");
          if (warm) frameCorners(v, rect, "#e6ac62");
          particlesIn(v, rect, f.id + i, env.clock, s.stage === "settled" ? "#ffcf77" : warm ? "#d3ab68" : "#9eac72", warm ? 8 + (age > GAS_WARNING * 0.5 ? 4 : 0) : 6);
          ctx.restore();
        }
      }
    }
  }
}