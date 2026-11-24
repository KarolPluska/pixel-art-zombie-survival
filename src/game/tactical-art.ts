import { TILE } from "./palette";
import type { FloorData, Prop } from "./types";
import type { TacticalState } from "./tactical";

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

export function isTacticalProp(p: Prop) {
  return p.kind === "radio" || p.kind === "explosive";
}

export function drawTacticalProps(
  ctx: CanvasRenderingContext2D,
  d: FloorData,
  state: TacticalState,
  camX: number,
  camY: number,
  time: number,
  explored: Uint8Array,
) {
  for (const p of d.props) {
    if (p.x * TILE - camX < -24 || p.y * TILE - camY < -24 || p.x * TILE - camX > ctx.canvas.width + 24 || p.y * TILE - camY > ctx.canvas.height + 24) continue;
    if (!explored[p.y * d.w + p.x]) continue;
    const x = Math.round((p.x + 0.5) * TILE - camX);
    const y = Math.round((p.y + 0.5) * TILE - camY);
    if (p.kind === "radio") {
      const on = state.devices[p.id]?.on;
      box(ctx, x - 6, y - 4, 12, 9, "#13191b");
      box(ctx, x - 5, y - 3, 10, 7, on ? "#526762" : "#3f4847");
      box(ctx, x - 4, y - 2, 5, 4, "#20292b");
      for (let i = 0; i < 3; i++) box(ctx, x - 3 + i * 2, y - 1, 1, 2, on && (Math.floor(time * 10 + i) % 3 === 0) ? "#d8e1c8" : "#718079");
      box(ctx, x + 3, y - 2, 2, 2, on && Math.sin(time * 8) > -0.2 ? "#9fe3a4" : "#4f6657");
      box(ctx, x + 3, y - 9, 1, 6, "#a6afa5");
      if (on) box(ctx, x - 8, y - 1, 1, 1, "#eac584");
    } else if (p.kind === "tv") {
      const on = state.devices[p.id]?.on;
      if (on) {
        const flicker = Math.floor(time * 15) % 4;
        box(ctx, x - 5, y - 5, 10, 7, flicker === 0 ? "#b9d8c8" : flicker === 1 ? "#6a98a0" : "#344e59");
        for (let n = 0; n < 5; n++) box(ctx, x - 5 + ((n * 3 + flicker) % 9), y - 5 + n, 2, 1, n % 2 ? "#e2e8d4" : "#416d79");
        box(ctx, x + 5, y + 3, 1, 1, "#9fe3a4");
      }
    } else if (p.kind === "explosive") {
      const b = state.barrels[p.id] ?? { stage: "idle", fuse: 0 };
      if (b.stage === "spent") {
        box(ctx, x - 6, y + 3, 12, 3, "#191514");
        box(ctx, x - 3, y + 1, 7, 2, "#49241f");
        continue;
      }
      const warning = b.stage === "warning";
      const tilt = warning ? Math.round(Math.sin(time * 30) * 1) : 0;
      box(ctx, x - 5 + tilt, y - 7, 10, 14, "#281614");
      box(ctx, x - 4 + tilt, y - 6, 8, 12, warning ? "#c74732" : "#a9342b");
      box(ctx, x - 4 + tilt, y - 4, 8, 2, "#e07854");
      box(ctx, x - 4 + tilt, y + 2, 8, 2, "#6d241f");
      box(ctx, x - 2 + tilt, y - 5, 2, 8, "#d65a3e");
      box(ctx, x - 2 + tilt, y - 2, 4, 2, "#e8c780");
      if (warning) {
        for (let i = 0; i < 4; i++) {
          box(ctx, x + Math.round(Math.sin(time * 18 + i * 2) * 7), y - 9 - ((Math.floor(time * 12) + i * 3) % 7), 2, 2, i % 2 ? "#fff0a0" : "#f28b3c");
        }
      }
    }
  }
}

/** Low, readable crawler silhouette with moving hands and a short blood trail. */
export function drawCrawler(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  animT: number,
  dead: boolean,
  downT: number,
  hurt: boolean,
  facingLeft: boolean,
) {
  const flip = facingLeft ? -1 : 1;
  const drag = dead ? 0 : Math.round(Math.sin(animT * 5) * 2);
  if (hurt) ctx.globalAlpha = 0.55;
  box(ctx, x - 8, y + 4, 16, 2, "rgba(0,0,0,0.45)");
  box(ctx, x - 6, y + 6, 4, 1, "#6f2527");
  box(ctx, x - 2, y + 5, 3, 1, "#8a2828");
  const torso = downT > 0 ? "#59644b" : "#788365";
  box(ctx, x - 5, y - 2, 11, 6, "#39463a");
  box(ctx, x - 4, y - 3, 9, 5, torso);
  box(ctx, x + 3 * flip, y - 5, 5, 5, "#9ba780");
  box(ctx, x + 4 * flip, y - 4, 1, 1, "#d93632");
  box(ctx, x + 6 * flip, y - 3, 1, 1, "#502522");
  // Alternating pale hands make the dragging animation visible on dark floors.
  box(ctx, x - 7 * flip + drag * flip, y - 1, 4, 2, "#c0bda2");
  box(ctx, x + 6 * flip - drag * flip, y + 2, 4, 2, "#b0b397");
  box(ctx, x - 2, y - 1, 5, 2, "#d8c9b4");
  ctx.globalAlpha = 1;
}
