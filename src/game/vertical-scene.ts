import { FLOOR_META, TILE } from "./palette";
import type { SurvivorRig, RigState } from "./rig";
import type { FloorData } from "./types";
import type {
  BuildingState,
  FloorQuestState,
  LiftRide,
  PassageState,
} from "./vertical-layout";

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) {
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function floorTag(index: number) {
  if (index <= 0) return "-1";
  if (index === 1) return "P";
  if (index >= 10) return "D";
  return String(index - 1);
}

export function floorShortName(index: number) {
  return FLOOR_META[Math.max(0, Math.min(FLOOR_META.length - 1, index))]?.name ?? `PIĘTRO ${index}`;
}

/* ================= IN-WORLD FLOOR PROPS & PORTALS ================= */

export function drawVerticalWorld(
  ctx: CanvasRenderingContext2D,
  d: FloorData,
  building: BuildingState,
  questState: FloorQuestState,
  camX: number,
  camY: number,
  time: number,
  explored: Uint8Array,
) {
  const v = d.vertical;
  if (!v) return;
  const seen = (tx: number, ty: number) =>
    tx >= 0 && ty >= 0 && tx < d.w && ty < d.h && explored[ty * d.w + tx] === 1;

  // 1. Elevator portal, cabin floor, call button, status LED & indicator
  if (v.elevator) {
    const el = v.elevator;
    const isHere = building.elevatorFloor === d.index;
    const isOpen = building.elevatorOpenFloor === d.index;
    const arriving = building.elevatorArrival > 0 && building.elevatorCallFloor === d.index;
    const blink = Math.sin(time * 7) > 0;

    if (seen(el.outside.x, el.outside.y) || seen(el.door.x, el.door.y)) {
      // Cabin interior (when explored/visible)
      for (const c of el.cells) {
        if (!seen(c.x, c.y)) continue;
        const sx = c.x * TILE - camX;
        const sy = c.y * TILE - camY;
        rect(ctx, sx, sy, TILE, TILE, "#272e34");
        rect(ctx, sx + 1, sy + 1, TILE - 2, TILE - 2, "#353e45");
        rect(ctx, sx + 2, sy + 2, TILE - 4, 2, "#465159");
      }
      // Inside control panel
      if (seen(el.panel.x, el.panel.y)) {
        const px = el.panel.x * TILE - camX;
        const py = el.panel.y * TILE - camY;
        rect(ctx, px + 1, py + 3, 5, 10, "#12171b");
        rect(ctx, px + 2, py + 4, 3, 8, "#4b5961");
        rect(ctx, px + 3, py + 5, 1, 2, building.elevatorBroken ? "#d95545" : "#eac584");
        rect(ctx, px + 3, py + 8, 1, 2, building.elevatorPowered ? "#7ad49b" : "#5a6368");
      }
      // Elevator steel sliding door frame
      const dx = el.door.x * TILE - camX;
      const dy = el.door.y * TILE - camY;
      rect(ctx, dx, dy, TILE, TILE, "#181f24");
      if (!isOpen) {
        rect(ctx, dx + 2, dy + 1, 5, 14, "#546168");
        rect(ctx, dx + 9, dy + 1, 5, 14, "#4b575e");
        rect(ctx, dx + 7, dy + 1, 2, 14, "#101518");
        rect(ctx, dx + 3, dy + 3, 1, 10, "#75858c");
      } else {
        rect(ctx, dx + 1, dy + 1, 2, 14, "#5a6970");
        rect(ctx, dx + 13, dy + 1, 2, 14, "#5a6970");
        rect(ctx, dx + 4, dy + 2, 8, 12, "rgba(234,197,132,0.16)");
      }
      // Exterior call button + floor indicator on north jamb
      const ox = el.outside.x * TILE - camX;
      const oy = el.outside.y * TILE - camY;
      rect(ctx, ox - 3, oy - 7, 10, 6, "#141a1e");
      rect(ctx, ox - 2, oy - 6, 8, 4, "#252f35");
      const led = building.elevatorBroken
        ? (blink ? "#e05048" : "#68201e")
        : !building.elevatorPowered
          ? "#82322b"
          : arriving
            ? (blink ? "#f2c77e" : "#705932")
            : building.elevatorEmergencyOnly
              ? "#e8a84a"
              : isHere && isOpen
                ? "#7ce0a2"
                : "#9ab5a0";
      rect(ctx, ox - 1, oy - 5, 2, 2, led);
      rect(ctx, ox + 2, oy - 5, 3, 2, "#d9d6c5");
      // Floor hazard stripe in front of elevator
      rect(ctx, ox + 1, oy + 13, 12, 2, "#7e673b");
      rect(ctx, ox + 3, oy + 13, 2, 2, "#1c2226");
      rect(ctx, ox + 8, oy + 13, 2, 2, "#1c2226");
    }
  }

  // 2. Technical service shaft (east wall)
  if (v.service) {
    const sv = v.service;
    if (seen(sv.outside.x, sv.outside.y) || seen(sv.door.x, sv.door.y)) {
      const dx = sv.door.x * TILE - camX;
      const dy = sv.door.y * TILE - camY;
      const locked =
        (v.quest?.kind === "service-shaft" && !questState.serviceUnlocked && !questState.serviceForced) ||
        (v.quest?.kind === "flooded-route" && questState.stage < 3);
      rect(ctx, dx + 1, dy + 1, 14, 14, "#1c2326");
      rect(ctx, dx + 2, dy + 2, 12, 12, locked ? "#494d4f" : "#2f393c");
      rect(ctx, dx + 3, dy + 3, 10, 2, "#d8a84e");
      rect(ctx, dx + 5, dy + 3, 2, 2, "#1c2326");
      rect(ctx, dx + 9, dy + 3, 2, 2, "#1c2326");
      // Keypad LED
      rect(ctx, dx + 11, dy + 7, 2, 3, locked ? "#d95545" : "#7ad49b");
      // Steel ladder rungs inside
      for (const c of sv.cells) {
        if (!seen(c.x, c.y)) continue;
        const sx = c.x * TILE - camX;
        const sy = c.y * TILE - camY;
        rect(ctx, sx + 3, sy + 2, 10, 12, "#232a2e");
        rect(ctx, sx + 5, sy + 2, 1, 12, "#87959c");
        rect(ctx, sx + 10, sy + 2, 1, 12, "#87959c");
        for (let r = 4; r < 13; r += 3) rect(ctx, sx + 6, sy + r, 4, 1, "#aeb8bd");
      }
    }
  }

  // 3. Second stairwell (Klatka B, east wall)
  if (v.stairsB) {
    const sb = v.stairsB;
    if (seen(sb.outside.x, sb.outside.y) || seen(sb.door.x, sb.door.y)) {
      const ox = sb.outside.x * TILE - camX;
      const oy = sb.outside.y * TILE - camY;
      rect(ctx, ox + 4, oy - 5, 10, 4, "#172521");
      rect(ctx, ox + 5, oy - 4, 8, 2, "#6bd89a");
      const sx = sb.stairs.x * TILE - camX;
      const sy = sb.stairs.y * TILE - camY;
      if (seen(sb.stairs.x, sb.stairs.y)) {
        for (let i = 0; i < 4; i++) {
          rect(ctx, sx + 2, sy + 2 + i * 3, 12, 2, i % 2 ? "#7a8580" : "#5e6865");
        }
      }
    }
  }

  // 4. Scenario-specific interactable props on the floor
  const q = v.quest;
  if (!q) return;
  const pulse = Math.sin(time * 5.5) > 0;

  if (q.kind === "repair-lift" && q.fuseCell && !questState.fuseTaken && seen(q.fuseCell.x, q.fuseCell.y)) {
    const fx = q.fuseCell.x * TILE - camX;
    const fy = q.fuseCell.y * TILE - camY;
    rect(ctx, fx + 2, fy + 2, 12, 12, "#192023");
    rect(ctx, fx + 3, fy + 3, 10, 10, "#4c5a57");
    rect(ctx, fx + 5, fy + 5, 6, 6, "#22292b");
    rect(ctx, fx + 6, fy + 6, 4, 4, pulse ? "#f2c77e" : "#c59852");
  }

  if (q.kind === "lure-horde" && q.beacon && seen(q.beacon.x, q.beacon.y)) {
    const bx = q.beacon.x * TILE - camX;
    const by = q.beacon.y * TILE - camY;
    rect(ctx, bx + 2, fyOff(by) + 2, 12, 11, "#171d20");
    rect(ctx, bx + 3, by + 3, 10, 9, "#3d4a4d");
    rect(ctx, bx + 4, by + 4, 5, 5, "#1f272a");
    rect(ctx, bx + 5, by + 5, 3, 3, "#7f8f8c");
    rect(ctx, bx + 10, by + 4, 2, 2, questState.lureUsed ? (pulse ? "#e05048" : "#702420") : (pulse ? "#eac584" : "#7d6439"));
  }

  if (q.kind === "service-shaft" && q.clueCell && seen(q.clueCell.x, q.clueCell.y)) {
    const cx = q.clueCell.x * TILE - camX;
    const cy = q.clueCell.y * TILE - camY;
    rect(ctx, cx + 3, cy + 3, 10, 10, "#242c2e");
    rect(ctx, cx + 4, cy + 4, 8, 8, questState.codeFound ? "#8da398" : "#dfd4b8");
    rect(ctx, cx + 5, cy + 6, 6, 1, "#3a403d");
    rect(ctx, cx + 5, cy + 8, 4, 1, "#9a4638");
  }

  if (q.kind === "apartment-bypass") {
    if (q.clueCell && seen(q.clueCell.x, q.clueCell.y)) {
      const cx = q.clueCell.x * TILE - camX;
      const cy = q.clueCell.y * TILE - camY;
      rect(ctx, cx + 2, cy + 3, 12, 9, "#1c2426");
      rect(ctx, cx + 3, cy + 4, 10, 7, "#cad6cc");
      rect(ctx, cx + 4, cy + 5, 4, 4, "#4b7b66");
      rect(ctx, cx + 9, cy + 5, 3, 4, "#c98b44");
    }
    if (q.bypassCell && seen(q.bypassCell.x, q.bypassCell.y)) {
      const bx = q.bypassCell.x * TILE - camX;
      const by = q.bypassCell.y * TILE - camY;
      const shift = Math.round(questState.bypassProgress * 12);
      rect(ctx, bx + 1, by + 2 + shift, 14, 12, "#2c2019");
      rect(ctx, bx + 2, by + 3 + shift, 12, 10, "#7c563a");
      rect(ctx, bx + 3, by + 4 + shift, 10, 2, "#b58b5c");
      if (!questState.bypassOpen) {
        rect(ctx, bx + 6, by + 7 + shift, 4, 3, pulse ? "#eac584" : "#9c7b46");
      }
    }
  }
}

function fyOff(v: number) { return v; }

/* ================= PLAYABLE ELEVATOR CABIN SCENE ================= */

export function drawLiftRideScene(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  ride: LiftRide,
  building: BuildingState,
  rig: SurvivorRig,
  rigState: RigState,
  flashOn: boolean,
  battery: number,
  time: number,
  shake: number,
) {
  const sx = Math.round((Math.random() - 0.5) * shake);
  const sy = Math.round((Math.random() - 0.5) * shake);
  ctx.fillStyle = "#06080c";
  ctx.fillRect(0, 0, viewW, viewH);

  const cabW = 84;
  const cabH = 82;
  const cx = Math.round(viewW / 2) + sx;
  const cy = Math.round(viewH / 2 + 4) + sy;
  const left = cx - Math.floor(cabW / 2);
  const top = cy - Math.floor(cabH / 2);

  const dir = ride.to >= ride.from ? 1 : -1;
  const speed =
    ride.phase === "moving"
      ? 92
      : ride.phase === "accel"
        ? 92 * Math.min(1, ride.elapsed / 0.9)
        : ride.phase === "jolt" && ride.elapsed < 0.7
          ? 45 * (1 - ride.elapsed / 0.7)
          : 0;
  const scroll = (time * speed * dir) % 28;

  // Outer shaft frame
  rect(ctx, left - 18, top - 24, cabW + 36, cabH + 34, "#0d1216");
  rect(ctx, left - 14, top - 20, cabW + 28, cabH + 26, "#161d22");

  // Shaft parallax behind upper door glass / slit
  const slitX = left + 16;
  const slitY = top - 16;
  const slitW = cabW - 32;
  const slitH = 18;
  rect(ctx, slitX, slitY, slitW, slitH, "#090d11");
  ctx.save();
  ctx.beginPath();
  ctx.rect(slitX, slitY, slitW, slitH);
  ctx.clip();
  // Vertical cables
  rect(ctx, slitX + 7, slitY, 1, slitH, "#2b363c");
  rect(ctx, slitX + slitW - 8, slitY, 1, slitH, "#2b363c");
  // Moving concrete ledges and shaft lamps
  for (let k = -1; k <= 2; k++) {
    const ly = slitY + Math.round(((k * 28 + scroll) % 56 + 56) % 56) - 14;
    rect(ctx, slitX, ly, slitW, 5, "#283238");
    rect(ctx, slitX + 2, ly + 1, slitW - 4, 1, "#414f56");
    rect(ctx, slitX + Math.floor(slitW / 2) - 4, ly + 8, 8, 2, "#877a48");
  }
  ctx.restore();

  // Floor LED display panel above doorway
  const dispX = cx - 18;
  const dispY = top - 24;
  rect(ctx, dispX, dispY, 36, 10, "#0b0f12");
  rect(ctx, dispX + 1, dispY + 1, 34, 8, "#1c2428");
  const isEmergency = ride.phase === "stranded" || ride.phase === "escape" || (ride.phase === "jolt" && ride.elapsed > 0.9);
  const shownFloor =
    ride.phase === "moving"
      ? Math.round(ride.from + (ride.to - ride.from) * Math.min(1, ride.elapsed / Math.max(2.2, Math.abs(ride.to - ride.from) * 0.6 + 2.4)))
      : ride.kind === "freight" ? ride.to : building.elevatorFloor;
  ctx.fillStyle = isEmergency ? "#e85c4a" : "#f0c97a";
  ctx.font = 'bold 6px "IBM Plex Mono", monospace';
  ctx.textAlign = "center";
  const arrow = ride.phase === "moving" || ride.phase === "accel" ? (dir > 0 ? "▲" : "▼") : isEmergency ? "!" : "■";
  ctx.fillText(`${arrow} ${floorTag(shownFloor)}`, cx, dispY + 7);
  ctx.textAlign = "left";

  // Cabin walls & metallic floor
  rect(ctx, left, top, cabW, cabH, "#1f262b");
  rect(ctx, left + 4, top + 6, cabW - 8, cabH - 12, "#2f383f");
  // Ribbed steel floor tiles
  for (let y = top + 16; y < top + cabH - 8; y += 8) {
    rect(ctx, left + 5, y, cabW - 10, 1, "#252d33");
  }
  // Back wooden handrail
  rect(ctx, left + 7, top + 12, cabW - 14, 3, "#6d4e34");
  rect(ctx, left + 7, top + 12, cabW - 14, 1, "#9a734f");

  // Left control panel
  const panX = left + 4;
  const panY = top + 24;
  rect(ctx, panX, panY, 7, 24, "#141a1e");
  rect(ctx, panX + 1, panY + 1, 5, 22, "#515f66");
  for (let b = 0; b < 4; b++) {
    const lit = !isEmergency && b === (shownFloor % 4);
    rect(ctx, panX + 2, panY + 3 + b * 5, 3, 2, lit ? "#f2c77e" : "#2b3438");
  }

  // Right wall: Red Emergency Release Lever!
  const levX = left + cabW - 11;
  const levY = top + 24;
  const leverBlink = Math.sin(time * 9) > 0;
  rect(ctx, levX, levY, 7, 22, "#141a1e");
  rect(ctx, levX + 1, levY + 1, 5, 20, isEmergency ? "#642620" : "#3a4044");
  const handleY = levY + 4 + Math.round(ride.leverProgress * 10);
  rect(ctx, levX + 2, handleY, 3, 5, isEmergency ? (leverBlink ? "#ff624c" : "#cf3c30") : "#8c423a");
  if (ride.phase === "stranded") {
    // Highlight corners around emergency latch so player sees it even without audio
    rect(ctx, levX - 2, levY - 2, 3, 1, "#ff785c");
    rect(ctx, levX - 2, levY - 2, 1, 3, "#ff785c");
    rect(ctx, levX + 6, levY + 23, 3, 1, "#ff785c");
  }

  // Sliding steel doors at the front (bottom edge of cabin)
  const doorGap = Math.round(ride.doorOpen * 26);
  const doorY = top + cabH - 6;
  const half = Math.floor((cabW - 12) / 2);
  // Dark destination floor peeking outside when doors open
  if (doorGap > 1) {
    rect(ctx, cx - doorGap, doorY - 1, doorGap * 2, 12, "#192024");
    if (ride.variant === "threat" && ride.threatWarned) {
      // Glowing zombie eyes in hallway outside!
      rect(ctx, cx - 5, doorY + 6, 2, 1, "#e03030");
      rect(ctx, cx - 1, doorY + 6, 2, 1, "#e03030");
      rect(ctx, cx + 4, doorY + 8, 2, 1, "#e03030");
    }
  }
  rect(ctx, left + 6, doorY, Math.max(3, half - doorGap), 6, "#5d6a72");
  rect(ctx, left + 6, doorY, Math.max(3, half - doorGap), 1, "#8c9ba3");
  rect(ctx, cx + doorGap, doorY, Math.max(3, half - doorGap), 6, "#515e66");
  rect(ctx, cx + doorGap, doorY, Math.max(3, half - doorGap), 1, "#829199");

  // Player inside the cabin
  const staggerX = ride.phase === "jolt" ? Math.round(Math.sin(ride.elapsed * 26) * 2) : 0;
  const px = cx + ride.cabinX + staggerX;
  const py = cy + ride.cabinY + 4;
  rig.draw(ctx, px, py, rigState);

  // Sparks during jolt
  if (ride.phase === "jolt" && ride.elapsed < 1.1) {
    for (let i = 0; i < 6; i++) {
      const spX = left + 12 + ((i * 19 + Math.floor(time * 35)) % (cabW - 24));
      const spY = top + 6 + Math.floor((ride.elapsed * 28 + i * 7) % 34);
      rect(ctx, spX, spY, 2, 2, i % 2 ? "#fff0a8" : "#f09c46");
    }
  }

  // Cabin lighting & blackout / emergency red glow / player flashlight
  let darkAlpha = 0.2;
  let tint = "rgba(8,10,16,";
  if (ride.phase === "jolt" && ride.elapsed >= 0.45 && ride.elapsed < 1.25) {
    // Total blackout moment before emergency light engages!
    darkAlpha = 0.88;
  } else if (isEmergency) {
    darkAlpha = 0.62;
    tint = "rgba(42,10,10,";
  } else if (ride.variant === "rattle" && Math.sin(time * 23) > 0.6) {
    darkAlpha = 0.52;
  }
  ctx.fillStyle = `${tint}${darkAlpha})`;
  ctx.fillRect(0, 0, viewW, viewH);

  // Emergency pulsing red ceiling glow
  if (isEmergency && !(ride.phase === "jolt" && ride.elapsed < 1.25)) {
    const pulse = 0.24 + 0.14 * Math.sin(time * 5.2);
    const g = ctx.createRadialGradient(cx, top + 12, 2, cx, top + 20, 52);
    g.addColorStop(0, `rgba(232,76,60,${pulse})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(left, top, cabW, cabH);
  }

  // Player's flashlight works inside the cabin!
  if (flashOn && battery > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(px, py - 6);
    ctx.arc(px, py - 6, 62, rigState.aim - 0.5, rigState.aim + 0.5);
    ctx.closePath();
    const fg = ctx.createRadialGradient(px, py - 6, 2, px, py - 6, 62);
    fg.addColorStop(0, "rgba(255,244,196,0.42)");
    fg.addColorStop(1, "rgba(255,244,196,0)");
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.restore();
  }

  // Subtle status caption below cabin
  ctx.fillStyle = "#c8cfc6";
  ctx.font = 'bold 5.5px "IBM Plex Mono", monospace';
  ctx.textAlign = "center";
  const status =
    ride.phase === "doors"
      ? "ZAMYKANIE DRZWI..."
      : ride.phase === "accel"
        ? "ROZRUCH SILNIKA..."
        : ride.phase === "moving"
          ? `PRZEJAZD  ${floorTag(ride.from)} → ${floorTag(ride.to)}`
          : ride.phase === "jolt"
            ? "AWARIA ZASILANIA!"
            : ride.phase === "stranded"
              ? "DRZWI ZABLOKOWANE · DŹWIGNIA AWARYJNA [E]"
              : ride.phase === "escape"
                ? "OTWIERANIE AWARYJNE..."
                : ride.phase === "stop"
                  ? `POSTÓJ · PIĘTRO ${floorTag(ride.stopFloor ?? building.elevatorFloor)}`
                  : `PIĘTRO ${floorTag(ride.to)} · OTWIERANIE DRZWI`;
  ctx.fillText(status, cx, top + cabH + 16);
  ctx.textAlign = "left";
}

/* ================= PLAYABLE STAIRWELL / LANDING / TECHNICAL SHAFT ================= */

export const PASSAGE_W = 144;
export const PASSAGE_H = 112;

export function passageStepElevation(p: PassageState): number {
  if (p.route === "service" || p.route === "ledge") return 0;
  // Left flight (x < 60, y between 34 and 88) rises going up; right flight (x > 84) rises going down toward exit
  if (p.x < 60 && p.y > 32 && p.y < 92) return Math.round(((92 - p.y) / 60) * 6);
  if (p.x > 84 && p.y > 32 && p.y < 92) return Math.round(6 + ((p.y - 32) / 60) * 6);
  return p.y <= 32 ? 6 : 0;
}

export function drawPassageScene(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  p: PassageState,
  rig: SurvivorRig,
  rigState: RigState,
  flashOn: boolean,
  battery: number,
  time: number,
) {
  ctx.fillStyle = "#07090d";
  ctx.fillRect(0, 0, viewW, viewH);

  const ox = Math.round((viewW - PASSAGE_W) / 2);
  const oy = Math.round((viewH - PASSAGE_H) / 2);

  if (p.route === "service" || p.route === "ledge") {
    // Technical shaft: horizontal pipe corridor + vertical steel ladder + hatch!
    rect(ctx, ox + 16, oy + 6, 112, 100, "#141a1d");
    rect(ctx, ox + 22, oy + 12, 100, 88, "#252e31");
    // Entry floor (bottom)
    rect(ctx, ox + 26, oy + 78, 92, 18, "#343f42");
    // Pipes along left & right walls
    rect(ctx, ox + 24, oy + 14, 5, 82, "#6c4b37");
    rect(ctx, ox + 26, oy + 14, 2, 82, "#9a7154");
    rect(ctx, ox + 115, oy + 14, 5, 82, "#515f63");
    rect(ctx, ox + 116, oy + 14, 2, 82, "#7e8e94");
    // Steel ladder up the center
    const lx = ox + 64;
    rect(ctx, lx, oy + 16, 2, 66, "#93a0a6");
    rect(ctx, lx + 14, oy + 16, 2, 66, "#93a0a6");
    for (let r = oy + 20; r < oy + 80; r += 6) {
      rect(ctx, lx + 2, r, 12, 2, "#c0c8c4");
    }
    // Upper hatch (exit to `to` floor)
    rect(ctx, lx - 4, oy + 8, 24, 10, "#12171a");
    rect(ctx, lx - 2, oy + 10, 20, 7, "#658a76");
    rect(ctx, lx + 5, oy + 12, 6, 2, "#e8d294");
    // Lower entry door (return to `from` floor)
    rect(ctx, lx - 4, oy + 96, 24, 6, "#5c4a38");
    // Steam puff near pipe
    const puff = Math.floor(time * 9) % 4;
    rect(ctx, ox + 30 + puff * 2, oy + 46 - puff, 3, 2, "rgba(190,214,216,0.45)");
  } else {
    // U-shaped Stairwell with lower flight (left), półpiętro landing (top), divider wall, upper flight (right)
    rect(ctx, ox, oy, PASSAGE_W, PASSAGE_H, "#141a1e");
    rect(ctx, ox + 6, oy + 6, PASSAGE_W - 12, PASSAGE_H - 12, "#353c3d");
    // Outer landing (top strip y: 6..36)
    rect(ctx, ox + 6, oy + 6, PASSAGE_W - 12, 30, "#464d4b");
    // Window on top wall
    const winX = ox + 56;
    rect(ctx, winX, oy + 2, 32, 6, "#2c4666");
    rect(ctx, winX + 2, oy + 3, 28, 4, p.feature === "window" ? "#c98b49" : "#5a82ad");
    // Window light spill onto landing
    ctx.fillStyle = p.feature === "window" ? "rgba(232,160,82,0.18)" : "rgba(110,162,222,0.16)";
    ctx.fillRect(winX - 4, oy + 8, 40, 26);

    // Central stair divider wall / banister (x: 62..82, y: 38..104)
    rect(ctx, ox + 62, oy + 38, 20, 68, "#1b2226");
    rect(ctx, ox + 64, oy + 40, 16, 64, "#293236");
    rect(ctx, ox + 62, oy + 38, 2, 66, "#7b8585");
    rect(ctx, ox + 80, oy + 38, 2, 66, "#7b8585");

    // Lower flight steps (left: x 8..60, y 38..90)
    for (let y = 40; y < 90; y += 6) {
      rect(ctx, ox + 8, oy + y, 52, 5, y % 12 === 0 ? "#5a625f" : "#4b5250");
      rect(ctx, ox + 8, oy + y, 52, 1, "#79827d");
    }

    // Upper flight steps (right: x 84..136, y 38..90)
    for (let y = 40; y < 90; y += 6) {
      rect(ctx, ox + 84, oy + y, 52, 5, y % 12 === 0 ? "#5a625f" : "#4b5250");
      rect(ctx, ox + 84, oy + y, 52, 1, "#79827d");
    }

    // Entry doorway (bottom-left -> back to `from`)
    rect(ctx, ox + 20, oy + 104, 28, 7, "#6b4f39");
    rect(ctx, ox + 22, oy + 105, 24, 3, "#a8825a");

    // Exit doorway (bottom-right -> enter `to`)
    rect(ctx, ox + 96, oy + 104, 28, 7, "#3b6b57");
    rect(ctx, ox + 98, oy + 105, 24, 3, "#78d19e");

    // Landing features
    if (p.feature === "stash") {
      rect(ctx, ox + 12, oy + 10, 14, 10, "#1c2225");
      rect(ctx, ox + 13, oy + 11, 12, 8, p.stashLooted ? "#3d4648" : "#6b7d6f");
      rect(ctx, ox + 17, oy + 13, 4, 3, p.stashLooted ? "#262c2e" : "#eac584");
    } else if (p.feature === "obstacle") {
      rect(ctx, ox + 64, oy + 16, 16, 12, "#2f2219");
      rect(ctx, ox + 65, oy + 17, 14, 10, "#7b583a");
      rect(ctx, ox + 66, oy + 18, 12, 2, "#a98156");
    } else if (p.feature === "traces") {
      rect(ctx, ox + 26, oy + 20, 4, 2, "#78322c");
      rect(ctx, ox + 36, oy + 16, 3, 2, "#78322c");
      rect(ctx, ox + 46, oy + 14, 4, 3, "#78322c");
      if (!p.stashLooted) {
        rect(ctx, ox + 12, oy + 10, 12, 9, "#323c3a");
        rect(ctx, ox + 14, oy + 12, 8, 5, "#c9a86b");
      }
    } else if (p.feature === "broken-flight") {
      // Collapsed rubble blocking upper right flight!
      rect(ctx, ox + 84, oy + 42, 52, 24, "#2b2420");
      for (let i = 0; i < 12; i++) {
        rect(ctx, ox + 86 + (i * 11) % 44, oy + 44 + (i * 7) % 18, 6, 4, i % 2 ? "#7a5b48" : "#5c544d");
      }
      // Maintenance bypass door on top-right wall (blocked by crate until pushed!)
      rect(ctx, ox + 120, oy + 6, 16, 8, p.bypassOpen ? "#529b76" : "#6c4835");
      if (!p.bypassOpen) {
        const shift = Math.round(p.bypassProgress * 12);
        rect(ctx, ox + 120 - shift, oy + 14, 14, 12, "#2c2118");
        rect(ctx, ox + 121 - shift, oy + 15, 12, 10, "#8d6442");
        rect(ctx, ox + 123 - shift, oy + 17, 8, 2, "#c69e6b");
      }
    }
  }

  // Player sprite with vertical step elevation
  const elev = passageStepElevation(p);
  const px = ox + p.x;
  const py = oy + p.y - elev;
  rig.draw(ctx, px, py, rigState);

  // Subtle ambient darkness + flashlight beam
  ctx.fillStyle = p.route === "service" ? "rgba(6,9,12,0.52)" : "rgba(7,10,15,0.36)";
  ctx.fillRect(0, 0, viewW, viewH);
  if (flashOn && battery > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(px, py - 6);
    ctx.arc(px, py - 6, 78, rigState.aim - 0.52, rigState.aim + 0.52);
    ctx.closePath();
    const fg = ctx.createRadialGradient(px, py - 6, 3, px, py - 6, 78);
    fg.addColorStop(0, "rgba(255,246,198,0.48)");
    fg.addColorStop(1, "rgba(255,246,198,0)");
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.restore();
  }

  // Directional labels inside chamber
  ctx.fillStyle = "#c8cfc6";
  ctx.font = 'bold 5.5px "IBM Plex Mono", monospace';
  ctx.textAlign = "center";
  if (p.route === "service" || p.route === "ledge") {
    ctx.fillText(`▲ WŁAZ (${floorTag(p.to)})`, ox + 72, oy + 5);
    ctx.fillText(`▼ POWRÓT (${floorTag(p.from)})`, ox + 72, oy + PASSAGE_H + 6);
  } else {
    ctx.fillText(`▼ ${floorTag(p.from)}`, ox + 34, oy + PASSAGE_H + 7);
    ctx.fillText(
      p.feature === "broken-flight" ? (p.bypassOpen ? `▲ ZAPLECZE → ${floorTag(p.to)}` : "ZAWALONY BIEG") : `▲ ${floorTag(p.to)}`,
      ox + 110,
      oy + PASSAGE_H + 7,
    );
  }
  ctx.textAlign = "left";
}

export function drawPassageMinimap(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  p: PassageState,
) {
  const fw = 64;
  const fh = 64;
  const left = viewW - fw - 7;
  const top = Math.max(8, viewH - fh - 7);
  ctx.save();
  ctx.fillStyle = "rgba(9, 14, 18, 0.9)";
  ctx.fillRect(left, top, fw, fh);
  ctx.strokeStyle = "#566063";
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, fw - 1, fh - 1);
  ctx.fillStyle = "#d6d0bc";
  ctx.font = 'bold 5px "IBM Plex Mono", monospace';
  const title = p.route === "stairsB" ? "KLATKA B" : p.route === "service" ? "PION TECH" : p.route === "ledge" ? "PODEST" : "KLATKA A";
  ctx.fillText(title, left + 4, top + 7);
  ctx.fillStyle = "#eac584";
  ctx.textAlign = "right";
  ctx.fillText(`${floorTag(p.from)}-${floorTag(p.to)}`, left + fw - 4, top + 7);
  ctx.textAlign = "left";
  ctx.fillStyle = "#29343a";
  ctx.fillRect(left + 4, top + 10, fw - 8, 1);

  const mx = left + 8;
  const my = top + 14;
  const mw = fw - 16;
  const mh = fh - 22;
  if (p.route === "service" || p.route === "ledge") {
    rect(ctx, mx + 14, my + 2, 20, mh - 4, "#4b585c");
    rect(ctx, mx + 22, my + 2, 4, 4, "#f2c77e");
  } else {
    rect(ctx, mx, my, mw, 12, "#636e6b");
    rect(ctx, mx, my + 12, 16, mh - 12, "#515c59");
    rect(ctx, mx + mw - 16, my + 12, 16, mh - 12, p.feature === "broken-flight" ? "#6c483d" : "#515c59");
    rect(ctx, mx + mw - 10, my + mh - 4, 6, 3, "#f2c77e");
    if (p.feature === "stash" && !p.stashLooted) rect(ctx, mx + 3, my + 3, 3, 3, "#a1bf89");
  }
  const dotX = mx + Math.round((p.x / PASSAGE_W) * mw);
  const dotY = my + Math.round((p.y / PASSAGE_H) * mh);
  rect(ctx, dotX - 1, dotY - 1, 3, 3, "#f8f3df");
  ctx.restore();
}
