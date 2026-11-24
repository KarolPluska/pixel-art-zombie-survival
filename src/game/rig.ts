import { COL } from "./palette";
import { WEAPONS, type WeaponId } from "./inventory";
import { pixLine, type Dir } from "./sprites";

export interface RigState {
  dir: Dir;
  aim: number;
  phase: number;
  moving: boolean;
  sprint: boolean;
  t: number;
  weapon: WeaponId;
  recoil: number;
  reload: number;
  melee: number;
  flash: number;
  hurt: number;
}

const S = 56;
const OX = 28;
const OY = 36;
const PACK = "#4e4a3c";
const SLEEVE = "#c49838";

export class SurvivorRig {
  private c = document.createElement("canvas");
  private o = document.createElement("canvas");
  private g: CanvasRenderingContext2D;
  private og: CanvasRenderingContext2D;
  private f = 1;
  private tip: { x: number; y: number } | null = null;
  private trail: { a: number; cy: number } | null = null;

  constructor() {
    this.c.width = this.c.height = this.o.width = this.o.height = S;
    this.g = this.c.getContext("2d")!;
    this.og = this.o.getContext("2d")!;
  }

  private P(dx: number, dy: number, w: number, h: number, col: string) {
    this.g.fillStyle = col;
    this.g.fillRect(OX + (this.f === 1 ? dx : -dx - w), OY + dy, w, h);
  }

  private L(x0: number, y0: number, x1: number, y1: number, col: string, th = 1) {
    const g = this.g;
    g.fillStyle = col;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      g.fillRect(Math.round(OX + x0 + (x1 - x0) * t), Math.round(OY + y0 + (y1 - y0) * t), th, th);
    }
  }

  private reset() {
    this.tip = null;
    this.trail = null;
  }

  private hand(x: number, y: number) {
    this.g.fillStyle = COL.skin;
    this.g.fillRect(OX + Math.round(x), OY + Math.round(y), 2, 2);
  }

  private cap(x: number, h: number, back: boolean) {
    this.P(x - 4, -20 + h, 8, 2, COL.cap);
    this.P(x - 3, -21 + h, 6, 1, back ? COL.capDark : COL.cap);
    this.P(x - 4, -18 + h, 8, 1, COL.capDark);
    this.P(x - 2, -21 + h, 1, 1, COL.capLight);
    this.P(x - 1, -19 + h, 1, 1, COL.capDark);
    this.P(x + 1, -20 + h, 1, 1, COL.capDark);
    this.P(x - 3, -18 + h, 1, 1, COL.capLight);
    this.P(x + 2, -18 + h, 1, 1, COL.capLight);
  }

  private body(s: RigState, sw: number, by: number, hy: number, ca: number) {
    const J = COL.jacket;
    const JD = COL.jacketDark;
    const eye = s.t % 3.7 < 0.12 ? COL.skinShade : COL.ink;
    const inhale = hy < by;
    if (s.dir === "down") {
      this.P(-4, -13 + by, 8, 7, J);
      if (inhale) this.P(-4, -14 + by, 8, 1, J);
      if (sw) this.P(sw > 0 ? 4 : -5, -8 + by, 1, 2, JD);
      this.P(-1, -13 + by, 2, 2, COL.shirt);
      this.P(-3, -13 + by, 1, 1, "#e6be60");
      this.P(2, -13 + by, 1, 1, "#e6be60");
      this.P(-3, -12 + by, 1, 3, "#5a4a34");
      this.P(2, -12 + by, 1, 3, "#5a4a34");
      this.P(0, -11 + by, 1, 5, JD);
      this.P(-3, -9 + by, 2, 2, "#b58b34");
      this.P(1, -9 + by, 2, 2, "#b58b34");
      this.P(-2, -11 + by, 1, 1, COL.jacketDirt);
      this.P(1, -7 + by, 1, 1, COL.jacketDirt);
      this.P(-3, -17 + hy, 6, 4, COL.skin);
      this.P(-4, -16 + hy, 1, 1, COL.skinShade);
      this.P(3, -16 + hy, 1, 1, COL.skinShade);
      const lk = ca > 0.45 ? 1 : ca < -0.45 ? -1 : 0;
      this.P(-2 + lk, -16 + hy, 1, 1, eye);
      this.P(1 + lk, -16 + hy, 1, 1, eye);
      this.P(-2, -15 + hy, 1, 1, COL.skinShade);
      this.P(1, -15 + hy, 1, 1, COL.skinShade);
      this.P(-2, -14 + hy, 4, 1, "#9a765c");
      this.cap(0, hy, false);
    } else if (s.dir === "up") {
      this.P(-4, -13 + by, 8, 7, J);
      if (inhale) this.P(-4, -14 + by, 8, 1, J);
      if (sw) this.P(sw > 0 ? 4 : -5, -8 + by, 1, 2, JD);
      this.P(-3, -13 + by, 6, 1, JD);
      this.P(-3, -12 + by, 6, 5, PACK);
      this.P(-3, -12 + by, 6, 1, "#6a6450");
      this.P(-1, -9 + by, 2, 1, COL.brass);
      this.P(-3, -8 + by, 6, 1, "#38342a");
      this.P(-3, -17 + hy, 6, 4, "#3c2a20");
      this.P(-2, -14 + hy, 4, 1, COL.skinShade);
      this.cap(0, hy, true);
    } else {
      const ln = s.sprint && s.moving ? 1 : 0;
      this.P(-5 + ln, -12 + by, 2, 5, PACK);
      this.P(-5 + ln, -12 + by, 2, 1, "#6a6450");
      this.P(-3 + ln, -13 + by, 6, 7, J);
      if (inhale) this.P(-3, -14 + by, 6, 1, J);
      if (sw) this.P(-4 + ln, -8 + by, 1, 2, JD);
      this.P(2 + ln, -13 + by, 1, 1, "#e6be60");
      this.P(2 + ln, -12 + by, 1, 5, JD);
      this.P(-1 + ln, -9 + by, 2, 2, "#b58b34");
      this.P(-2 + ln, -11 + by, 1, 1, COL.jacketDirt);
      const hx = ln * 2;
      this.P(-3 + hx, -17 + hy, 6, 4, COL.skin);
      this.P(-3 + hx, -17 + hy, 2, 3, "#3c2a20");
      this.P(1 + hx, -16 + hy, 1, 1, eye);
      this.P(3 + hx, -15 + hy, 1, 1, COL.skinShade);
      this.P(0 + hx, -14 + hy, 3, 1, "#9a765c");
      this.cap(hx, hy, false);
    }
  }

  private arms(s: RigState, side: boolean, sw: number, by: number, ca: number) {
    const cy = -10 + by;
    const right = ca >= 0;
    const sh = side ? (this.f === 1 ? 0 : -1) : right ? 4 : -6;
    const off = side ? sh : right ? -6 : 4;
    const shotgun = s.weapon === "shotgun";

    if (s.melee >= 0) {
      const m = s.melee;
      // Broń palna opuszczona w drugiej ręce
      this.L(off, cy - 2, off, cy + 2, COL.jacketDark, 2);
      if (m < 0.25 || m >= 0.78) {
        // Wyciąganie / chowanie łomu z plecaka
        const k = m < 0.25 ? m / 0.25 : 1 - (m - 0.78) / 0.22;
        const hx = sh * 0.6;
        const hy = cy - 6;
        const dx = right ? -2 : 2;
        this.L(hx + dx * k, hy - 1 - k * 9, hx, hy, "#b0482a");
        this.L(hx + dx * k, hy - 1 - k * 9, hx + dx * k - dx, hy - k * 9, "#cfd6dc");
        this.L(sh, cy - 2, hx, hy, SLEEVE, 2);
        this.hand(hx, hy);
      } else {
        const e = Math.min(1, (m - 0.25) / 0.33);
        const ee = e * e * (3 - 2 * e);
        const a = s.aim - 1.3 + ee * 2.6;
        const ax = Math.cos(a);
        const ay = Math.sin(a);
        const hx = ax * 5;
        const hy = cy + ay * 5;
        this.L(sh, cy - 2, hx, hy, SLEEVE, 2);
        this.L(hx, hy, ax * 16, cy + ay * 16, COL.rustDark, 2);
        this.L(hx + ax * 2, hy + ay * 2, ax * 15, cy + ay * 15, "#d0562e");
        if (s.weapon === "hatchet") {
          this.L(ax * 13, cy + ay * 13, ax * 16 - ay * 4, cy + ay * 16 + ax * 4, "#bac4be", 3);
        } else this.L(ax * 16, cy + ay * 16, ax * 16 + Math.cos(a + 1.2) * 3, cy + ay * 16 + Math.sin(a + 1.2) * 3, "#cfd6dc");
        this.hand(hx, hy);
        if (e < 1) this.trail = { a, cy };
      }
      return;
    }

    if (!WEAPONS[s.weapon].ammo) {
      this.L(sh, cy - 2, sh + sw * 2, cy + 3, SLEEVE, 2);
      this.L(off, cy - 2, off - sw * 2, cy + 3, COL.jacketDark, 2);
      this.hand(sh + sw * 2, cy + 4);
      this.hand(off - sw * 2, cy + 4);
      return;
    }
    const tilt = s.reload > 0 ? -Math.sin(s.reload * Math.PI) * 0.55 * (right ? 1 : -1) : 0;
    const a = s.aim + tilt;
    const ax = Math.cos(a);
    const ay = Math.sin(a);
    const reach = 6 - s.recoil * 2.5 - (s.reload > 0 ? 1.5 : 0);
    const hx = ax * reach;
    const hy = cy + ay * reach;
    const nx = -ay;
    const ny = ax;

    if (shotgun || s.weapon === "crossbow" || s.reload > 0) {
      const k = shotgun ? 6 : 2;
      this.L(off, cy - 2, hx + ax * k, hy + ay * k, COL.jacketDark, 2);
    } else if (side) {
      const hxo = off - this.f * Math.round(sw * 2);
      this.L(off, cy - 2, hxo, cy + 3, COL.jacketDark, 2);
      this.hand(hxo, cy + 4);
    } else {
      const d = Math.round(-sw);
      this.L(off, cy - 2, off, cy + 2 + d, COL.jacketDark, 2);
      this.hand(off, cy + 4 + d);
    }

    this.L(sh, cy - 2, hx, hy, SLEEVE, 2);
    if (s.weapon === "crossbow") {
      this.L(hx - ax * 3, hy - ay * 3, hx + ax * 12, hy + ay * 12, COL.woodLight, 2);
      for (const sign of [-1, 1]) {
        this.L(hx + ax * 10, hy + ay * 10, hx + ax * 6 + nx * 8 * sign, hy + ay * 6 + ny * 8 * sign, "#7f8981", 2);
        this.L(hx + ax * 6 + nx * 8 * sign, hy + ay * 6 + ny * 8 * sign, hx, hy, "#b9b7a2");
      }
    } else if (shotgun) {
      this.L(hx - ax * 4, hy - ay * 4, hx + ax * 3, hy + ay * 3, COL.wood, 2);
      this.L(hx + ax * 3, hy + ay * 3, hx + ax * 13, hy + ay * 13, "#383e46");
      this.L(hx + ax * 3 + nx, hy + ay * 3 + ny, hx + ax * 13 + nx, hy + ay * 13 + ny, "#727b86");
      this.L(hx + ax * 6, hy + ay * 6, hx + ax * 9, hy + ay * 9, COL.woodLight, 2);
      this.hand(hx + ax * 6, hy + ay * 6);
      this.tip = { x: hx + ax * 15, y: hy + ay * 15 };
    } else {
      this.L(hx, hy, hx + ax * 7, hy + ay * 7, COL.gun);
      this.L(hx + nx, hy + ny, hx + ax * 7 + nx, hy + ay * 7 + ny, "#6a727c");
      this.L(hx + ax, hy + ay, hx + ax - nx * 2, hy + ay - ny * 2, "#3a342e");
      if (s.weapon === "revolver") {
        this.L(hx + ax * 2, hy + ay * 2, hx + ax * 4, hy + ay * 4, "#9f9b96", 3);
        this.L(hx + ax * 5, hy + ay * 5, hx + ax * 10, hy + ay * 10, "#a5aaa6");
      }
      if (s.reload > 0) this.hand(hx + ax * 2 - nx * 2, hy + ay * 2 - ny * 2);
      this.tip = { x: hx + ax * 9, y: hy + ay * 9 };
    }
    this.hand(hx, hy);
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: RigState) {
    const g = this.g;
    g.clearRect(0, 0, S, S);
    this.reset();
    const side = s.dir === "left" || s.dir === "right";
    this.f = s.dir === "left" ? -1 : 1;
    const sw = s.moving ? Math.sin(s.phase) : 0;
    const co = s.moving ? Math.cos(s.phase) : 0;
    const lift = s.sprint ? 3 : 2;
    const by = (s.moving ? Math.round(Math.abs(co)) : 0) + (s.hurt > 0.6 ? 1 : 0);
    const hy = by - (!s.moving && Math.sin(s.t * 2.4) > 0.2 ? 1 : 0);
    const ca = Math.cos(s.aim);
    const sa = Math.sin(s.aim);
    const behind = sa < -0.35;

    if (behind) this.arms(s, side, sw, by, ca);
    if (!side) {
      const lL = Math.round(Math.max(0, sw) * lift);
      const rL = Math.round(Math.max(0, -sw) * lift);
      this.P(-3, -7, 2, 5 - lL, COL.pants);
      this.P(-4, -2 - lL, 3, 2, COL.shoe);
      this.P(-3, -2 - lL, 1, 1, "#5c5046");
      this.P(1, -7, 2, 5 - rL, COL.pantsDark);
      this.P(1, -2 - rL, 3, 2, COL.shoe);
      this.P(2, -2 - rL, 1, 1, "#5c5046");
    } else {
      const st = Math.round(sw * lift);
      const fl = Math.round(Math.max(0, co) * (lift - 1));
      const bl = Math.round(Math.max(0, -co) * (lift - 1));
      this.P(-1 - Math.round(st / 2), -7, 2, 2, COL.pantsDark);
      this.P(-1 - st, -5, 2, 3 - bl, COL.pantsDark);
      this.P(-1 - st, -2 - bl, 3, 2, "#1c1814");
      this.P(-1 + Math.round(st / 2), -7, 2, 2, COL.pants);
      this.P(-1 + st, -5, 2, 3 - fl, COL.pants);
      this.P(-1 + st, -2 - fl, 3, 2, COL.shoe);
    }
    this.body(s, sw, by, hy, ca);
    if (!behind) this.arms(s, side, sw, by, ca);

    const og = this.og;
    og.globalCompositeOperation = "source-over";
    og.clearRect(0, 0, S, S);
    og.drawImage(this.c, 1, 0);
    og.drawImage(this.c, -1, 0);
    og.drawImage(this.c, 0, 1);
    og.drawImage(this.c, 0, -1);
    og.globalCompositeOperation = "source-in";
    og.fillStyle = COL.ink;
    og.fillRect(0, 0, S, S);
    og.globalCompositeOperation = "source-over";
    og.drawImage(this.c, 0, 0);
    if (s.hurt > 0.78) {
      og.globalCompositeOperation = "source-atop";
      og.fillStyle = "rgba(255,255,255,0.72)";
      og.fillRect(0, 0, S, S);
      og.globalCompositeOperation = "source-over";
    }

    const x0 = Math.round(cx);
    const y0 = Math.round(cy) + 8;
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(x0 - 5, y0 - 1, 10, 3);
    ctx.fillRect(x0 - 3, y0 + 2, 6, 1);
    ctx.drawImage(this.o, x0 - OX, y0 - OY);

    if (this.trail) {
      for (let i = 1; i <= 5; i++) {
        const ta = this.trail.a - i * 0.2;
        ctx.fillStyle = i <= 2 ? "rgba(242,239,230,0.75)" : "rgba(232,224,112,0.4)";
        ctx.fillRect(Math.round(x0 + Math.cos(ta) * 16), Math.round(y0 + this.trail.cy + Math.sin(ta) * 16), 2, 2);
        ctx.fillRect(Math.round(x0 + Math.cos(ta) * 12), Math.round(y0 + this.trail.cy + Math.sin(ta) * 12), 1, 1);
      }
    }
    if (s.flash > 0 && this.tip) {
      const fx = x0 + this.tip.x;
      const fy = y0 + this.tip.y;
      const big = s.weapon === "shotgun";
      const r = big ? 7 : 4;
      ctx.fillStyle = "#e88a34";
      ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 3, 3);
      pixLine(ctx, fx, fy, fx + ca * (r + 3), fy + sa * (r + 3), "#e88a34");
      pixLine(ctx, fx, fy, fx + (ca * 0.7 - sa * 0.7) * r, fy + (sa * 0.7 + ca * 0.7) * r, COL.fluor);
      pixLine(ctx, fx, fy, fx + (ca * 0.7 + sa * 0.7) * r, fy + (sa * 0.7 - ca * 0.7) * r, COL.fluor);
      ctx.fillStyle = COL.white;
      ctx.fillRect(Math.round(fx), Math.round(fy), big ? 2 : 1, big ? 2 : 1);
    }
  }
}
