import { COL, MAP_H, type Theme } from "./palette";
import { hash2, mulberry32 } from "./rng";
import type { Glow, PropKind, ZombieKind } from "./types";

export type Dir = "down" | "up" | "left" | "right";
type SetPx = (x: number, y: number, col: string) => void;

function rgb(hex: string) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function makeCanvas(w: number, h: number, paint: (set: SetPx) => void, outline = false) {
  const pad = outline ? 1 : 0;
  const c = document.createElement("canvas");
  c.width = w + pad * 2;
  c.height = h + pad * 2;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const img = ctx.createImageData(c.width, c.height);
  const pts: { x: number; y: number; col: string }[] = [];
  paint((x, y, col) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    pts.push({ x: x + pad, y: y + pad, col });
  });
  const put = (x: number, y: number, col: string) => {
    if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
    const [r, g, b] = rgb(col);
    const i = (y * c.width + x) * 4;
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = 255;
  };
  if (outline) {
    for (const p of pts) {
      put(p.x - 1, p.y, COL.ink);
      put(p.x + 1, p.y, COL.ink);
      put(p.x, p.y - 1, COL.ink);
      put(p.x, p.y + 1, COL.ink);
    }
  }
  for (const p of pts) put(p.x, p.y, p.col);
  ctx.putImageData(img, 0, 0);
  return c;
}

function rect(set: SetPx, x: number, y: number, w: number, h: number, col: string) {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) set(x + xx, y + yy, col);
}

function mirror(src: HTMLCanvasElement) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

function speck(set: SetPx, seed: number, n: number, w: number, h: number, col: string, p = 1) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    if (r() > p) continue;
    set(Math.floor(r() * w), Math.floor(r() * h), col);
  }
}

/* ================= FLOOR TILES (16x16, 6 variants) ================= */

function floorBasement(set: SetPx, v: number) {
  rect(set, 0, 0, 16, 16, v % 2 ? "#3b3732" : "#433e37");
  for (let i = 0; i < 16; i++) {
    set(0, i, "#2d2925");
    set(i, 0, "#2d2925");
  }
  speck(set, 10 + v * 7, 22, 16, 16, "#2b2723");
  speck(set, 40 + v * 11, 10, 16, 16, "#58524a");
  if (v === 0 || v === 3) {
    // Crack in concrete
    set(3, 5, "#221e1b");
    set(4, 6, "#221e1b");
    set(5, 6, "#221e1b");
    set(6, 7, "#221e1b");
    set(7, 8, "#221e1b");
    set(5, 7, "#524c44");
  }
  if (v === 2) {
    // Rusty floor drain grate
    rect(set, 5, 5, 6, 6, "#2a2622");
    for (let x = 6; x <= 10; x += 2) rect(set, x, 6, 1, 4, "#4a4640");
    set(5, 5, COL.rustDark);
    set(10, 10, COL.rustDark);
  }
  if (v === 4) {
    // Damp oil/water sheen
    rect(set, 8, 4, 5, 4, "#313b46");
    set(9, 5, "#4a5c6c");
    set(11, 6, "#27303a");
  }
  if (v === 5) {
    // Mold corner
    rect(set, 1, 11, 4, 4, "#3a4c32");
    set(2, 12, COL.mold);
    set(4, 13, "#2d3b27");
  }
}

function floorLobby(set: SetPx, v: number) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const grout = x % 8 === 0 || y % 8 === 0;
      const check = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      const base = check ? (v % 2 ? "#7a746a" : "#746e65") : v % 2 ? "#5c5750" : "#55504a";
      set(x, y, grout ? "#35312d" : base);
    }
  }
  speck(set, 80 + v * 9, 10, 16, 16, "#47423c");
  speck(set, 95 + v * 5, 6, 16, 16, "#8c867b");
  if (v === 1 || v === 4) {
    // Cracked tile with dust
    set(2, 3, "#2a2622");
    set(3, 4, "#2a2622");
    set(4, 5, "#2a2622");
    set(5, 5, "#2a2622");
    set(6, 6, "#2a2622");
    set(3, 5, "#8f887a");
  }
  if (v === 3) {
    // Chipped corner exposing dark subfloor
    rect(set, 10, 10, 4, 4, "#3a342e");
    set(11, 11, "#2a2622");
    set(12, 12, COL.rustDark);
  }
  if (v === 5) {
    // Dirty footprints / scuff
    set(4, 11, "#3a342e");
    set(5, 11, "#3a342e");
    set(10, 4, "#3a342e");
    set(11, 5, "#3a342e");
  }
}

function floorWood(set: SetPx, v: number) {
  for (let y = 0; y < 16; y++) {
    const plank = Math.floor(y / 4);
    const tone = (plank + v) % 3;
    const base = tone === 0 ? "#694830" : tone === 1 ? "#5c3e28" : "#62432c";
    for (let x = 0; x < 16; x++) {
      const seamY = y % 4 === 0;
      const seamX = (x + plank * 5 + v * 3) % 12 === 0;
      set(x, y, seamY || seamX ? "#3b281a" : base);
    }
  }
  speck(set, 120 + v * 13, 12, 16, 16, "#462f20", 0.8);
  speck(set, 160 + v * 7, 7, 16, 16, "#7e583a", 0.7);
  if (v === 2) {
    // Worn bright patch & nails
    rect(set, 4, 5, 5, 2, "#7c573a");
    set(3, 5, "#2a1c14");
    set(3, 9, "#2a1c14");
  }
  if (v === 4) {
    // Dark dried stain
    rect(set, 9, 9, 4, 3, "#442c22");
    set(10, 10, "#38211b");
  }
}

function floorDecay(set: SetPx, v: number) {
  rect(set, 0, 0, 16, 16, v % 2 ? "#47423b" : "#4e4840");
  speck(set, 200 + v * 7, 18, 16, 16, "#2d2925");
  speck(set, 230 + v * 11, 12, 16, 16, COL.mold);
  if (v % 2 === 0) {
    rect(set, 2, 9, 6, 4, "#435c36");
    set(3, 10, COL.moldLight);
    set(5, 11, "#2f4428");
  }
  if (v === 1 || v === 4) {
    // Peeling linoleum / crack
    set(7, 2, "#24201c");
    set(8, 3, "#24201c");
    set(8, 4, "#24201c");
    set(9, 5, "#24201c");
    set(10, 6, "#24201c");
  }
  set(11, 3, COL.rustDark);
  set(12, 4, COL.rust);
  if (v === 5) {
    rect(set, 5, 4, 4, 3, "#5a3228");
    set(6, 5, COL.rust);
  }
}

function floorRoof(set: SetPx, v: number) {
  rect(set, 0, 0, 16, 16, v % 2 ? "#626b75" : "#58616b");
  for (let i = 0; i < 16; i++) {
    set(0, i, "#383f47");
    set(i, 0, "#383f47");
    if (i > 0) set(1, i, "#6e7882");
  }
  speck(set, 300 + v * 13, 10, 16, 16, "#485058");
  speck(set, 340 + v * 7, 8, 16, 16, COL.mold);
  if (v === 1 || v === 4) {
    // Rust streak
    set(4, 8, COL.rustDark);
    set(5, 9, COL.rust);
    set(6, 10, COL.rust);
    set(6, 11, COL.rustDark);
  }
  if (v === 3) {
    // Moss along slab joint
    rect(set, 1, 1, 5, 2, "#465e38");
    set(2, 1, COL.moldLight);
    rect(set, 1, 12, 2, 3, "#465e38");
  }
}

/* ================= WALL TILES (16x16, 4 variants) ================= */

function wallBasement(set: SetPx, v: number) {
  rect(set, 0, 0, 16, 16, "#48433c");
  rect(set, 0, 0, 16, 3, "#6d655b");
  rect(set, 0, 3, 16, 1, "#332e29");
  for (let y = 0; y < 16; y++) set(0, y, "#2a2622");
  // Exposed bricks patch
  if (v === 1 || v === 3) {
    rect(set, 3, 5, 8, 5, "#6b3e30");
    rect(set, 3, 7, 8, 1, "#3a2e28");
    set(6, 5, "#3a2e28");
    set(6, 6, "#3a2e28");
    set(9, 8, "#3a2e28");
    set(9, 9, "#3a2e28");
  }
  // Wall pipes & rust drips
  if (v % 2 === 0) {
    rect(set, 1, 6, 14, 2, "#5b626a");
    rect(set, 1, 6, 14, 1, "#7b828a");
    set(6, 8, COL.rust);
    set(6, 9, COL.rustDark);
    set(7, 10, COL.rustDark);
  }
  speck(set, 400 + v * 9, 10, 16, 16, "#36312b");
  rect(set, 0, 14, 16, 2, "#24201c");
}

function wallLobby(set: SetPx, v: number) {
  // Top beige floral wallpaper + bottom teal-green lamperia (matches concept-hall.png!)
  rect(set, 0, 0, 16, 9, COL.wallpaper);
  rect(set, 0, 0, 16, 2, "#b5a48a");
  rect(set, 0, 2, 16, 1, "#8e7f69");
  for (let y = 3; y < 9; y += 3) {
    for (let x = 2; x < 15; x += 4) {
      set(x, y, COL.wallpaperInk);
      set(x + 1, y + 1, "#b89a84");
    }
  }
  if (v === 1 || v === 2) {
    // Peeling plaster exposing gray concrete
    rect(set, 8, 3, 5, 6, "#787268");
    rect(set, 9, 4, 3, 4, "#5d5850");
    set(8, 3, "#3a342e");
    set(12, 5, "#e4dcc8");
  }
  rect(set, 0, 9, 16, 1, "#3a342e");
  rect(set, 0, 10, 16, 5, v % 2 ? COL.wainscot : "#4c7a74");
  rect(set, 0, 10, 16, 1, "#6ea099");
  if (v === 2) {
    // Peeling paint on wainscot
    rect(set, 2, 11, 4, 3, "#8c8174");
    set(3, 12, "#5c564e");
  }
  speck(set, 500 + v * 7, 5, 16, 6, COL.rust);
  rect(set, 0, 15, 16, 1, "#221e1b");
  for (let y = 0; y < 16; y++) set(0, y, "#342f2a");
}

function wallFlat(set: SetPx, v: number) {
  rect(set, 0, 0, 16, 12, "#cbb89a");
  rect(set, 0, 0, 16, 2, "#b7a488");
  rect(set, 0, 2, 16, 1, "#8c7c66");
  // Subtle striped/floral wallpaper
  for (let x = 2; x < 16; x += 4) {
    for (let y = 3; y < 12; y++) set(x, y, "#bfa989");
  }
  if (v === 1) {
    // Crooked picture frame on wall
    rect(set, 5, 4, 6, 5, "#4a3224");
    rect(set, 6, 5, 4, 3, "#7a8694");
    set(7, 6, "#cbb89a");
  }
  if (v === 2) {
    // Torn wallpaper patch
    rect(set, 3, 4, 5, 5, "#857d72");
    set(4, 5, "#5c564e");
    set(7, 4, "#e4dcc8");
  }
  rect(set, 0, 12, 16, 4, "#5c3f2a");
  rect(set, 0, 12, 16, 1, "#825c3e");
  rect(set, 0, 15, 16, 1, "#2c1e15");
  for (let y = 0; y < 16; y++) set(15, y, "#50473e");
}

function wallDecay(set: SetPx, v: number) {
  wallFlat(set, v);
  rect(set, 1, 2, 7, 8, "#58524a");
  rect(set, 2, 3, 5, 6, "#46413b");
  speck(set, 600 + v * 9, 16, 16, 16, COL.mold);
  speck(set, 640 + v * 7, 8, 16, 16, COL.rustDark);
  // Creeping vines/mold from ceiling
  rect(set, 9, 1, 3, 5, "#3a5030");
  set(10, 2, COL.moldLight);
  set(10, 6, COL.mold);
  set(3, 4, "#24201c");
  set(4, 5, "#24201c");
}

function wallRoof(set: SetPx, v: number) {
  rect(set, 0, 0, 16, 16, "#76808b");
  rect(set, 0, 0, 16, 3, "#9aa5b0");
  rect(set, 0, 3, 16, 1, "#4c545d");
  for (let y = 0; y < 16; y++) set(0, y, "#383f47");
  speck(set, 700 + v * 7, 10, 16, 16, COL.rust);
  speck(set, 740 + v * 11, 8, 16, 16, COL.mold);
  if (v % 2 === 0) {
    rect(set, 4, 4, 2, 6, COL.rustDark);
    set(5, 5, COL.rust);
  }
  rect(set, 0, 13, 16, 3, "#454e57");
}

function paintDoor(set: SetPx, locked: boolean, broken: boolean) {
  rect(set, 0, 0, 16, 16, "#2c221d");
  rect(set, 1, 0, 14, 16, "#5c4038");
  rect(set, 3, 1, 10, 14, COL.door);
  rect(set, 4, 2, 8, 5, "#2c2220");
  rect(set, 5, 3, 6, 3, "#362a26");
  rect(set, 4, 8, 8, 5, "#2c2220");
  rect(set, 5, 9, 6, 3, "#362a26");
  // Peephole
  set(8, 4, "#8a8072");
  // Handle & padlock
  set(11, 8, locked ? COL.brass : "#9a9082");
  set(11, 9, locked ? "#8f7028" : "#5c564e");
  if (locked) {
    rect(set, 9, 7, 4, 4, COL.cap);
    rect(set, 10, 8, 2, 2, COL.fluor);
  }
  if (broken) {
    set(5, 3, "#cbb89a");
    set(6, 4, "#cbb89a");
    set(7, 5, "#1a1412");
    set(8, 5, "#cbb89a");
    set(5, 9, "#1a1412");
    set(6, 10, "#cbb89a");
    set(7, 11, "#1a1412");
  }
}

function paintDoorBarricaded(set: SetPx) {
  paintDoor(set, false, true);
  // deski przybite w poprzek drzwi + gwoździe
  rect(set, 1, 3, 14, 2, "#8a6240");
  rect(set, 1, 4, 14, 1, "#5c3f28");
  rect(set, 1, 10, 14, 2, "#8a6240");
  rect(set, 1, 11, 14, 1, "#5c3f28");
  for (let i = 0; i < 12; i++) {
    set(2 + i, 5 + Math.floor(i / 2), "#7a5434");
    set(2 + i, 6 + Math.floor(i / 2), "#4e3420");
  }
  set(2, 3, "#cfd6dc");
  set(13, 4, "#cfd6dc");
  set(2, 10, "#cfd6dc");
  set(13, 11, "#cfd6dc");
}

function paintBreach(set: SetPx) {
  // Zawalona ściana: poszarpane resztki muru po bokach, cegły, gruz i pręty zbrojeniowe
  rect(set, 0, 1, 3, 14, "#5c564e");
  rect(set, 13, 2, 3, 13, "#5c564e");
  rect(set, 0, 2, 2, 4, "#8c8174");
  rect(set, 14, 4, 2, 5, "#8c8174");
  // wystające pręty zbrojeniowe
  rect(set, 3, 3, 3, 1, "#3a4048");
  rect(set, 10, 11, 3, 1, "#3a4048");
  set(5, 3, COL.rust);
  set(10, 11, COL.rust);
  // rozbite cegły i tynk na podłodze
  rect(set, 4, 6, 3, 2, "#8a4838");
  rect(set, 9, 5, 3, 2, "#7c756a");
  rect(set, 6, 10, 4, 2, "#625c54");
  rect(set, 3, 12, 2, 2, "#8a4838");
  rect(set, 11, 8, 2, 2, "#9c9488");
  set(5, 8, "#cbb89a");
  set(8, 7, "#24201c");
  set(10, 13, "#cbb89a");
}

function paintSurvivor(set: SetPx, variant: number, crouch: boolean, frame: number) {
  const coat = variant % 2 === 0 ? "#3e6e72" : "#6e5244";
  const coatD = variant % 2 === 0 ? "#284a4e" : "#4a362c";
  const hair = variant % 2 === 0 ? "#3a281e" : "#6a5848";
  const y0 = crouch ? 3 : 0;
  const bob = !crouch && frame === 1 ? -1 : 0;
  const l = !crouch && frame === 1 ? 1 : 0;
  const r = !crouch && frame === 0 ? 1 : 0;
  // włosy i głowa
  rect(set, 5, 1 + y0 + bob, 6, 2, hair);
  rect(set, 5, 3 + y0 + bob, 6, 3, COL.skin);
  set(6, 4 + y0 + bob, COL.ink);
  set(9, 4 + y0 + bob, COL.ink);
  set(7, 5 + y0 + bob, COL.skinShade);
  // kurtka / sweter
  rect(set, 4, 6 + y0 + bob, 8, crouch ? 5 : 6, coat);
  rect(set, 3, 7 + y0 + bob, 2, 4, coatD);
  rect(set, 11, 7 + y0 + bob, 2, 4, coatD);
  set(7, 7 + y0 + bob, "#cbb89a");
  set(8, 8 + y0 + bob, coatD);
  if (crouch) {
    // skulone kolana
    rect(set, 5, 11 + y0, 6, 3, "#3a3844");
    rect(set, 5, 14 + y0, 2, 2, COL.shoe);
    rect(set, 9, 14 + y0, 2, 2, COL.shoe);
  } else {
    rect(set, 5, 12 + bob, 2, 3 + l, "#3a3844");
    rect(set, 9, 12 + bob, 2, 3 + r, "#2e2c36");
    rect(set, 5, 15, 2, 2, COL.shoe);
    rect(set, 9, 15, 2, 2, COL.shoe);
  }
}

function paintDoorOpen(set: SetPx) {
  rect(set, 0, 0, 16, 16, "#241f1b");
  rect(set, 0, 0, 3, 16, "#5c4038");
  rect(set, 1, 1, 1, 14, COL.door);
  set(2, 8, COL.brass);
  rect(set, 14, 0, 2, 16, "#46342c");
}

function paintWindow(set: SetPx, glow: Glow) {
  rect(set, 0, 0, 16, 16, "#655e55");
  rect(set, 1, 1, 14, 14, "#3b352f");
  const pane = glow === "none" ? "#1c2d4d" : glow === "orange" ? "#7e441c" : "#3d4a22";
  rect(set, 2, 2, 12, 12, pane);
  // Broken glass shards / crossbars
  rect(set, 7, 2, 2, 12, "#5a534b");
  rect(set, 2, 7, 12, 2, "#5a534b");
  if (glow === "fluor") {
    rect(set, 3, 3, 4, 4, COL.fluor);
    rect(set, 9, 3, 4, 4, "#dce07a");
    set(10, 10, COL.fluor);
    set(4, 10, "#9ca248");
  } else if (glow === "orange") {
    rect(set, 9, 3, 4, 4, "#eb9034");
    rect(set, 3, 9, 4, 4, "#c87228");
    set(10, 4, "#f7c268");
  } else {
    // Moonlit night sky with distant block silhouette
    rect(set, 3, 3, 4, 4, "#273f68");
    rect(set, 9, 3, 4, 4, "#22375c");
    rect(set, 3, 9, 4, 4, "#16243d");
    rect(set, 9, 9, 4, 4, "#121d33");
    set(10, 10, "#5c7ca8");
    set(4, 4, "#4b6b96");
  }
  // Sill
  rect(set, 1, 14, 14, 2, "#8c8174");
}

function paintStairs(set: SetPx, up: boolean) {
  rect(set, 0, 0, 16, 16, "#3a342e");
  rect(set, 1, 1, 14, 14, "#5c564e");
  for (let i = 0; i < 5; i++) {
    const y = 2 + i * 3;
    rect(set, 2, y, 12, 2, i % 2 ? "#8c8174" : "#6e6860");
    rect(set, 2, y + 2, 12, 1, "#2f2a25");
  }
  // Metal railing on sides
  rect(set, 1, 1, 1, 14, COL.rust);
  rect(set, 14, 1, 1, 14, COL.rust);
  if (up) {
    set(8, 1, COL.fluor);
    set(7, 2, COL.fluor);
    set(9, 2, COL.fluor);
    set(8, 3, COL.fluor);
    set(8, 4, COL.fluorDim);
  } else {
    set(8, 14, "#9aa4ae");
    set(7, 13, "#9aa4ae");
    set(9, 13, "#9aa4ae");
  }
}

/* ================= DETAILED CHARACTERS (18x20, 4-frame walk) ================= */

function paintPlayer(set: SetPx, dir: Dir, frame: number) {
  // frame: 0=idle/neutral, 1=left step, 2=neutral, 3=right step
  const bob = frame === 1 || frame === 3 ? -1 : 0;
  const lLeg = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const rLeg = frame === 3 ? 1 : frame === 1 ? -1 : 0;

  if (dir === "down") {
    // Red knit beanie with ribs and cuff (matches concept-characters.png)
    rect(set, 6, 1 + bob, 6, 2, COL.cap);
    rect(set, 5, 2 + bob, 8, 2, COL.cap);
    set(7, 1 + bob, COL.capLight);
    set(9, 1 + bob, COL.capLight);
    set(8, 2 + bob, COL.capDark);
    set(10, 2 + bob, COL.capDark);
    rect(set, 5, 4 + bob, 8, 1, COL.capDark);
    set(6, 4 + bob, COL.capLight);
    set(11, 4 + bob, COL.capLight);

    // Tired pale face with dark eye circles & stubble
    rect(set, 6, 5 + bob, 6, 4, COL.skin);
    set(5, 6 + bob, COL.skinShade); // left ear
    set(12, 6 + bob, COL.skinShade); // right ear
    set(7, 6 + bob, COL.ink);
    set(10, 6 + bob, COL.ink);
    set(7, 7 + bob, COL.skinShade); // tired undereye
    set(10, 7 + bob, COL.skinShade);
    rect(set, 7, 8 + bob, 4, 1, "#9a765c"); // stubble

    // Mustard worn work jacket with collar, zipper, pockets & dirt patches
    rect(set, 5, 9 + bob, 8, 6, COL.jacket);
    set(6, 9 + bob, "#e6be60"); // collar highlight
    set(11, 9 + bob, "#e6be60");
    rect(set, 8, 9 + bob, 2, 2, COL.shirt); // undershirt
    rect(set, 9, 11 + bob, 1, 4, COL.jacketDark); // zipper
    // Pockets
    rect(set, 6, 12 + bob, 2, 2, "#b58b34");
    rect(set, 10, 12 + bob, 2, 2, "#b58b34");
    set(6, 11 + bob, COL.jacketDirt);
    set(11, 10 + bob, COL.jacketDirt);
    // Sleeves & hands
    rect(set, 3, 10 + bob, 2, 4, COL.jacketDark);
    rect(set, 13, 10 + bob, 2, 4, "#c49838");
    set(4, 14 + bob, COL.skin);
    set(13, 14 + bob, COL.skin);

    // Dark brown pants & heavy work boots
    rect(set, 6, 15, 2, 3 + Math.max(0, lLeg), COL.pants);
    rect(set, 10, 15, 2, 3 + Math.max(0, rLeg), COL.pants);
    set(6, 16, COL.pantsDark);
    set(11, 16, COL.pantsDark);
    rect(set, 5, 18 + Math.min(0, lLeg), 3, 2, COL.shoe);
    rect(set, 10, 18 + Math.min(0, rLeg), 3, 2, COL.shoe);
    set(6, 18 + Math.min(0, lLeg), "#5c5046");
    set(11, 18 + Math.min(0, rLeg), "#5c5046");
  } else if (dir === "up") {
    // Beanie back
    rect(set, 6, 1 + bob, 6, 2, COL.capDark);
    rect(set, 5, 2 + bob, 8, 3, COL.cap);
    set(7, 2 + bob, COL.capLight);
    set(10, 3 + bob, COL.capDark);
    rect(set, 6, 5 + bob, 6, 3, "#3c2a20"); // back hair/neck
    rect(set, 7, 8 + bob, 4, 1, COL.skinShade);

    // Jacket back
    rect(set, 5, 9 + bob, 8, 6, COL.jacket);
    rect(set, 6, 9 + bob, 6, 1, COL.jacketDark); // collar back
    rect(set, 3, 10 + bob, 2, 4, COL.jacketDark);
    rect(set, 13, 10 + bob, 2, 4, "#c49838");
    set(7, 11 + bob, COL.jacketDirt);
    set(10, 13 + bob, COL.jacketDirt);
    set(8, 12 + bob, "#b58b34");

    // Pants & boots
    rect(set, 6, 15, 2, 3 + Math.max(0, lLeg), COL.pantsDark);
    rect(set, 10, 15, 2, 3 + Math.max(0, rLeg), COL.pants);
    rect(set, 5, 18 + Math.min(0, lLeg), 3, 2, COL.shoe);
    rect(set, 10, 18 + Math.min(0, rLeg), 3, 2, COL.shoe);
  } else {
    // Side profile facing right
    rect(set, 6, 1 + bob, 6, 2, COL.cap);
    rect(set, 5, 2 + bob, 8, 2, COL.cap);
    rect(set, 5, 4 + bob, 8, 1, COL.capDark);
    set(7, 1 + bob, COL.capLight);
    set(10, 2 + bob, COL.capLight);

    // Side face
    rect(set, 6, 5 + bob, 6, 4, COL.skin);
    rect(set, 5, 5 + bob, 2, 3, "#3c2a20"); // hair back
    set(10, 6 + bob, COL.ink); // eye
    set(10, 7 + bob, COL.skinShade);
    rect(set, 9, 8 + bob, 3, 1, "#9a765c");

    // Jacket torso & arm
    rect(set, 5, 9 + bob, 7, 6, COL.jacket);
    set(11, 9 + bob, "#e6be60");
    rect(set, 7, 10 + bob, 3, 4, "#b88f36"); // shoulder/arm
    set(8, 12 + bob, COL.jacketDirt);
    set(10, 13 + bob, COL.skin);

    // Stride legs
    rect(set, 6 + lLeg, 15, 2, 3, COL.pantsDark);
    rect(set, 9 + rLeg, 15, 2, 3, COL.pants);
    rect(set, 6 + lLeg, 18, 3, 2, COL.shoe);
    rect(set, 9 + rLeg, 18, 3, 2, COL.shoe);
  }
}

function paintZombie(set: SetPx, kind: ZombieKind, dir: Dir, frame: number) {
  const bob = frame === 1 || frame === 3 ? -1 : 0;
  const lLeg = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const rLeg = frame === 3 ? 1 : frame === 1 ? -1 : 0;

  const isBrute = kind === "brute";
  const isRunner = kind === "runner";
  const skin = isBrute ? "#657458" : isRunner ? "#8b9b72" : COL.zombie;
  const skinD = isBrute ? "#434f3a" : COL.zombieDark;
  const skinL = isBrute ? "#7c8d6c" : COL.zombieLight;
  const shirt = isBrute ? "#484a4e" : isRunner ? "#cfc6b4" : COL.zShirt;
  const shirtD = isBrute ? "#2f3136" : COL.zShirtDark;
  const ox = isBrute ? 1 : 0;
  const crouch = isRunner ? 1 : 0;

  if (dir === "down") {
    // Head
    rect(set, 6 + ox, 1 + bob + crouch, 6, 4, skin);
    set(7 + ox, 1 + bob + crouch, skinD);
    set(9 + ox, 1 + bob + crouch, "#3a382c"); // patchy hair
    set(11 + ox, 2 + bob + crouch, skinL);
    // One hollow black socket, one glowing red eye!
    set(7 + ox, 3 + bob + crouch, COL.ink);
    set(10 + ox, 3 + bob + crouch, COL.eye);
    // Bloody mouth
    rect(set, 8 + ox, 4 + bob + crouch, 2, 1, COL.blood);

    // Torso / Torn shirt (or brute jacket)
    rect(set, 5, 5 + bob + crouch, 8 + ox * 2, 6, shirt);
    rect(set, 5, 10 + bob + crouch, 2, 1, shirtD);
    set(8 + ox, 6 + bob + crouch, COL.blood);
    set(9 + ox, 7 + bob + crouch, COL.bloodBright);
    set(7 + ox, 8 + bob + crouch, skinD); // torn hole showing flesh
    set(10 + ox, 9 + bob + crouch, shirtD);
    if (isBrute) {
      rect(set, 4, 5 + bob, 12, 2, "#35383d"); // wide shoulders
      set(6, 7 + bob, COL.rustDark);
    }

    // Arms reaching slightly
    rect(set, 3, 6 + bob + crouch, 2, 5, skin);
    set(3, 8 + bob + crouch, skinD);
    rect(set, 13 + ox * 2, 6 + bob + crouch, 2, 5, skinD);
    set(4, 10 + bob + crouch, COL.blood);

    // Ragged pants & bare dirty feet
    rect(set, 6 + ox, 11 + crouch, 2, 4 + Math.max(0, lLeg), "#5c3f30");
    rect(set, 10 + ox, 11 + crouch, 2, 4 + Math.max(0, rLeg), "#4e3326");
    set(6 + ox, 14 + crouch, skin); // torn trouser shin
    rect(set, 6 + ox, 16 + Math.min(0, lLeg), 2, 2, skinD);
    rect(set, 10 + ox, 16 + Math.min(0, rLeg), 2, 2, skin);
  } else if (dir === "up") {
    rect(set, 6 + ox, 1 + bob + crouch, 6, 4, skinD);
    set(8 + ox, 1 + bob + crouch, "#3a382c");
    rect(set, 5, 5 + bob + crouch, 8 + ox * 2, 6, shirtD);
    set(7 + ox, 7 + bob + crouch, COL.blood);
    set(10 + ox, 8 + bob + crouch, skinD);
    rect(set, 3, 6 + bob + crouch, 2, 5, skinD);
    rect(set, 13 + ox * 2, 6 + bob + crouch, 2, 5, skinD);
    rect(set, 6 + ox, 11 + crouch, 2, 5, "#4e3326");
    rect(set, 10 + ox, 11 + crouch, 2, 5, "#5c3f30");
    rect(set, 6 + ox, 16 + Math.min(0, lLeg), 2, 2, skinD);
    rect(set, 10 + ox, 16 + Math.min(0, rLeg), 2, 2, skinD);
  } else {
    // Side view facing right (runners lean forward!)
    const lean = isRunner ? 2 : 1;
    rect(set, 6 + ox + lean, 1 + bob + crouch, 5, 4, skin);
    set(9 + ox + lean, 3 + bob + crouch, COL.eye);
    set(10 + ox + lean, 4 + bob + crouch, COL.blood);
    set(7 + ox + lean, 2 + bob + crouch, skinD);

    rect(set, 5 + ox, 5 + bob + crouch, 7 + ox, 6, shirt);
    set(8 + ox, 7 + bob + crouch, COL.bloodBright);
    set(7 + ox, 8 + bob + crouch, shirtD);

    // Outstretched zombie arm
    rect(set, 10 + ox + lean, 6 + bob + crouch, 4, 2, skin);
    set(13 + ox + lean, 6 + bob + crouch, COL.blood);

    rect(set, 6 + ox + lLeg, 11 + crouch, 2, 5, "#4e3326");
    rect(set, 9 + ox + rLeg, 11 + crouch, 2, 5, "#5c3f30");
    rect(set, 6 + ox + lLeg, 16, 2, 2, skinD);
    rect(set, 9 + ox + rLeg, 16, 2, 2, skin);
  }
}

function paintCorpse(set: SetPx, kind: ZombieKind) {
  const skin = kind === "brute" ? "#5c6a50" : COL.zombie;
  const shirt = kind === "brute" ? "#42454a" : COL.zShirt;
  rect(set, 2, 7, 13, 5, shirt);
  rect(set, 1, 8, 3, 3, skin);
  rect(set, 13, 6, 4, 4, COL.zombieDark);
  set(15, 7, "#6e1c1c");
  rect(set, 5, 11, 4, 2, "#5c3f30");
  rect(set, 10, 12, 4, 2, "#4a3024");
  rect(set, 6, 7, 4, 3, COL.blood);
  set(7, 8, COL.bloodBright);
  set(10, 9, COL.bloodBright);
}

/* ================= PROPS ================= */

function paintCrate(set: SetPx, open: boolean) {
  rect(set, 1, 2, 14, 12, COL.woodDark);
  rect(set, 2, 3, 12, 10, open ? "#221711" : COL.wood);
  if (!open) {
    rect(set, 3, 4, 10, 8, COL.woodLight);
    // Diagonal brace
    for (let i = 0; i < 8; i++) set(3 + i, 4 + i, COL.wood);
    rect(set, 2, 7, 12, 1, COL.woodDark);
    set(3, 4, "#3a4048");
    set(12, 4, "#3a4048");
    set(3, 11, "#3a4048");
    set(12, 11, "#3a4048");
  } else {
    rect(set, 3, 4, 10, 8, "#16100c");
    rect(set, 2, 2, 12, 2, COL.wood);
    set(6, 7, "#3a3028");
  }
}

function paintMailbox(set: SetPx) {
  rect(set, 0, 2, 32, 12, "#356d6a");
  rect(set, 0, 2, 32, 2, "#244e4c");
  for (let i = 0; i < 4; i++) {
    const x = 2 + i * 8;
    rect(set, x, 4, 6, 9, "#428480");
    rect(set, x + 1, 5, 4, 1, COL.ink);
    rect(set, x + 1, 8, 4, 2, "#1c2828");
    set(x + 4, 10, "#cbb89a");
  }
  // Open dangling mailbox flap like in concept-hall.png
  rect(set, 18, 9, 5, 5, "#3a7874");
  rect(set, 19, 10, 3, 3, "#1c2828");
  speck(set, 900, 14, 32, 12, COL.rust);
  set(4, 5, COL.rust);
  set(12, 10, COL.rustDark);
  set(27, 6, COL.rust);
}

function paintBed(set: SetPx) {
  rect(set, 0, 1, 32, 14, COL.woodDark);
  rect(set, 1, 2, 30, 12, COL.wood);
  rect(set, 2, 3, 22, 10, "#cfc5b4");
  rect(set, 2, 3, 18, 10, "#9a5448"); // rumpled blanket
  rect(set, 4, 5, 14, 6, "#844339");
  rect(set, 24, 3, 6, 10, "#e4dcc8"); // pillow
  rect(set, 25, 4, 4, 8, "#cfc5b4");
  set(8, 8, "#5e2b25");
}

function paintSofa(set: SetPx) {
  rect(set, 0, 2, 32, 12, "#4a2424");
  rect(set, 1, 3, 30, 10, "#6e3838");
  rect(set, 4, 5, 24, 6, "#8a4844");
  rect(set, 12, 5, 1, 6, "#582a2a");
  rect(set, 20, 5, 1, 6, "#582a2a");
  rect(set, 0, 2, 4, 12, "#4a2828");
  rect(set, 28, 2, 4, 12, "#4a2828");
  set(16, 7, "#cbb89a"); // stuffing poking out
  set(17, 8, "#e4dcc8");
}

function paintTable(set: SetPx) {
  rect(set, 1, 1, 14, 14, COL.woodDark);
  rect(set, 2, 2, 12, 12, COL.wood);
  rect(set, 3, 3, 10, 10, COL.woodLight);
  // Cup & scattered paper
  rect(set, 5, 5, 4, 5, "#dfd7c6");
  set(6, 6, "#8a8072");
  set(7, 8, "#8a8072");
  rect(set, 10, 9, 2, 2, COL.teal);
}

function paintWardrobe(set: SetPx) {
  rect(set, 1, 0, 14, 16, "#3a281d");
  rect(set, 2, 1, 12, 14, "#543a2b");
  rect(set, 3, 2, 4, 12, "#462f22");
  rect(set, 9, 2, 4, 12, "#462f22");
  for (let y = 1; y < 15; y++) set(8, y, "#241810");
  set(7, 8, COL.brass);
  set(9, 8, COL.brass);
}

function paintFridge(set: SetPx) {
  rect(set, 2, 0, 12, 16, "#9c9890");
  rect(set, 3, 1, 10, 5, "#ebe7de");
  rect(set, 3, 7, 10, 8, "#d8d3c9");
  rect(set, 3, 6, 10, 1, "#4a4640");
  rect(set, 11, 2, 1, 3, "#6a6660");
  rect(set, 11, 8, 1, 4, "#6a6660");
  set(5, 3, COL.rust);
  set(6, 11, COL.rustDark);
  set(7, 12, COL.rust);
}

function paintChair(set: SetPx) {
  // Overturned wooden chair (from concept-hall.png)
  rect(set, 2, 8, 12, 3, COL.wood);
  rect(set, 3, 11, 2, 4, COL.woodDark);
  rect(set, 11, 11, 2, 4, COL.woodDark);
  rect(set, 2, 2, 3, 8, COL.woodLight);
  rect(set, 5, 3, 8, 2, COL.wood);
  rect(set, 5, 6, 6, 1, COL.woodDark);
}

function paintPipes(set: SetPx) {
  rect(set, 0, 4, 32, 6, "#5a626b");
  rect(set, 0, 5, 32, 3, "#8a949e");
  rect(set, 0, 9, 32, 1, "#333940");
  // Flanges & red valve wheel
  rect(set, 7, 3, 4, 8, "#4a525a");
  rect(set, 21, 3, 4, 8, "#4a525a");
  rect(set, 14, 2, 4, 4, COL.cap);
  set(15, 3, COL.capLight);
  set(8, 5, COL.rust);
  set(22, 8, COL.rustDark);
}

function paintVent(set: SetPx) {
  rect(set, 0, 1, 32, 14, "#626c76");
  rect(set, 1, 2, 30, 12, "#78828c");
  rect(set, 2, 3, 14, 10, "#333a42");
  for (let y = 4; y < 12; y += 2) rect(set, 3, y, 12, 1, "#9aa4ae");
  speck(set, 1100, 12, 32, 14, COL.rust);
  speck(set, 1120, 8, 32, 14, COL.mold);
  rect(set, 20, 3, 8, 6, "#4d555e");
  rect(set, 22, 4, 4, 4, "#262c34");
}

function paintFlare(set: SetPx) {
  // Iconic red emergency flare crate with yellow stripe (concept-roof.png)
  rect(set, 1, 3, 14, 10, "#8f2420");
  rect(set, 2, 4, 12, 8, COL.bloodBright);
  rect(set, 1, 6, 14, 3, COL.fluor);
  rect(set, 1, 8, 14, 1, "#b5a038");
  rect(set, 2, 4, 12, 1, "#e25850");
  // Metal latches
  rect(set, 4, 5, 2, 5, COL.metalDark);
  rect(set, 10, 5, 2, 5, COL.metalDark);
  set(4, 6, COL.metal);
  set(10, 6, COL.metal);
}

function paintDesk(set: SetPx) {
  rect(set, 0, 3, 32, 10, "#463428");
  rect(set, 1, 4, 30, 6, COL.wood);
  rect(set, 2, 5, 28, 4, COL.woodLight);
  rect(set, 2, 10, 3, 4, COL.woodDark);
  rect(set, 27, 10, 3, 4, COL.woodDark);
  // Old registry ledger & rotary phone
  rect(set, 7, 5, 6, 4, "#e4dcc8");
  set(9, 6, "#5c564e");
  rect(set, 20, 5, 4, 3, "#2a2c30");
  set(21, 6, COL.brass);
}

function paintBarrel(set: SetPx) {
  rect(set, 3, 1, 10, 14, "#4b525a");
  rect(set, 4, 2, 8, 12, "#6e7680");
  rect(set, 5, 2, 2, 12, "#8c949e");
  rect(set, 3, 4, 10, 2, "#323840");
  rect(set, 3, 10, 10, 2, "#323840");
  set(7, 6, COL.rust);
  set(8, 7, COL.rustDark);
  set(9, 8, COL.rust);
}

function paintTv(set: SetPx) {
  rect(set, 2, 3, 12, 11, "#3b2c22");
  rect(set, 3, 4, 10, 9, "#543e2e");
  rect(set, 4, 5, 7, 7, "#28363a");
  rect(set, 5, 6, 5, 5, "#3a4d52");
  set(6, 7, "#7ea0a8"); // static reflection
  set(8, 9, "#1c2428");
  // Knobs
  set(12, 6, COL.brass);
  set(12, 8, COL.brass);
  // Bunny ears antenna
  set(5, 2, COL.metal);
  set(4, 1, COL.metal);
  set(10, 2, COL.metal);
  set(11, 1, COL.metal);
}

function paintRadiator(set: SetPx) {
  rect(set, 1, 5, 14, 7, "#504a44");
  for (let x = 2; x <= 12; x += 2) {
    rect(set, x, 4, 1, 9, "#b8b0a2");
    rect(set, x + 1, 5, 1, 7, "#6e6860");
  }
  set(4, 7, COL.rust);
  set(10, 9, COL.rustDark);
}

function paintSink(set: SetPx) {
  rect(set, 2, 2, 12, 12, "#9a968e");
  rect(set, 3, 3, 10, 10, "#dcd8ce");
  rect(set, 4, 5, 8, 6, "#a4a096");
  rect(set, 5, 6, 6, 4, "#7e7a72");
  set(8, 8, "#2a2622"); // drain
  rect(set, 7, 2, 2, 3, "#6a7078"); // faucet
  set(6, 7, COL.rustDark); // rust stain
}

function paintTrash(set: SetPx) {
  rect(set, 2, 5, 8, 9, "#222428");
  rect(set, 3, 4, 6, 2, "#353940");
  set(5, 3, "#4e545e");
  rect(set, 7, 7, 7, 7, "#2c2a26");
  rect(set, 8, 8, 5, 4, "#3f3b36");
  set(11, 9, "#cbb89a"); // crumpled paper
  set(4, 9, "#3e5340");
}

function paintStove(set: SetPx) {
  // Kuchenka gazowa: blat z palnikami, piekarnik, rdza
  rect(set, 1, 1, 14, 14, "#d8d3c9");
  rect(set, 1, 1, 14, 5, "#b8b3a9");
  rect(set, 2, 2, 4, 3, "#2a2c30");
  rect(set, 9, 2, 4, 3, "#2a2c30");
  set(3, 3, "#5c6068");
  set(10, 3, "#5c6068");
  set(7, 2, "#6a7078");
  set(7, 3, "#6a7078");
  rect(set, 2, 7, 12, 7, "#c4bfb5");
  rect(set, 3, 8, 10, 1, "#4a4640");
  rect(set, 4, 10, 8, 3, "#3a3632");
  set(2, 12, COL.rust);
  set(12, 9, COL.rustDark);
  set(13, 13, COL.rust);
}

function paintToilet(set: SetPx) {
  // Sedes: spłuczka, miska, deska
  rect(set, 4, 1, 8, 4, "#e4e0d8");
  rect(set, 5, 2, 6, 2, "#c8c4bc");
  rect(set, 3, 6, 10, 3, "#f2efe6");
  rect(set, 4, 7, 8, 1, "#b8b4ac");
  rect(set, 4, 9, 8, 5, "#dcd8ce");
  rect(set, 5, 10, 6, 3, "#9c988e");
  set(6, 5, "#6a7078");
  set(9, 5, "#6a7078");
  set(4, 12, COL.mold);
  set(11, 11, "#8a8678");
}

function paintBathtub(set: SetPx) {
  // Wanna: emalia, zacieki rdzy, kran
  rect(set, 0, 3, 32, 10, "#e8e4dc");
  rect(set, 1, 4, 30, 8, "#c8ccc8");
  rect(set, 2, 5, 28, 6, "#8a9c9c");
  rect(set, 3, 6, 26, 4, "#5c7474");
  rect(set, 4, 7, 24, 2, "#3c5252");
  // kran
  rect(set, 2, 1, 3, 3, "#8a949e");
  rect(set, 4, 2, 2, 1, "#6a7078");
  // rdzawe zacieki
  set(8, 5, COL.rust);
  set(9, 6, COL.rustDark);
  set(10, 7, COL.rustDark);
  set(20, 6, COL.rust);
  set(21, 7, COL.rustDark);
  set(15, 8, "#2c3e3e");
  // nóżki
  set(2, 13, "#4a4640");
  set(29, 13, "#4a4640");
}

function paintBookshelf(set: SetPx) {
  // Regał z książkami
  rect(set, 2, 0, 12, 16, "#3e2a1c");
  rect(set, 3, 1, 10, 14, "#5c4030");
  for (const y of [5, 10]) rect(set, 3, y, 10, 1, "#2c1e14");
  // książki rząd 1
  set(4, 2, "#8a4844");
  set(4, 3, "#8a4844");
  set(4, 4, "#8a4844");
  set(5, 2, COL.teal);
  set(5, 3, COL.teal);
  set(5, 4, COL.teal);
  set(6, 3, "#c9a24a");
  set(6, 4, "#c9a24a");
  set(7, 2, "#5c564e");
  set(7, 3, "#5c564e");
  set(7, 4, "#5c564e");
  set(8, 3, "#8a4844");
  set(8, 4, "#8a4844");
  set(10, 2, "#c9a24a");
  set(10, 3, "#c9a24a");
  set(10, 4, "#c9a24a");
  set(11, 4, COL.teal);
  // książki rząd 2 — jedna przewrócona
  set(4, 7, "#5c564e");
  set(4, 8, "#5c564e");
  set(4, 9, "#5c564e");
  set(5, 8, "#8a4844");
  set(5, 9, "#8a4844");
  set(6, 9, "#c9a24a");
  rect(set, 8, 8, 4, 1, COL.teal);
  set(9, 7, COL.teal);
  // książki rząd 3 — przerzedzone
  set(4, 12, "#8a4844");
  set(4, 13, "#8a4844");
  set(4, 14, "#8a4844");
  set(9, 13, "#5c564e");
  set(9, 14, "#5c564e");
  set(11, 12, "#c9a24a");
  set(11, 13, "#c9a24a");
  set(11, 14, "#c9a24a");
  set(6, 14, "#2c1e14");
}

function paintPlant(set: SetPx) {
  // Kwiatek w doniczce
  set(7, 1, COL.moldLight);
  set(5, 2, COL.mold);
  set(9, 2, COL.mold);
  set(4, 3, COL.moldLight);
  set(7, 3, COL.moldLight);
  set(10, 3, COL.mold);
  set(6, 4, COL.mold);
  set(8, 4, COL.moldLight);
  set(7, 5, "#3e5340");
  set(7, 6, "#3e5340");
  rect(set, 4, 7, 8, 2, "#a8542e");
  rect(set, 5, 9, 6, 5, "#8a3c22");
  rect(set, 5, 9, 6, 1, "#c4622e");
  set(6, 12, "#6a2c18");
}

function paintBoard(set: SetPx) {
  // Tablica ogłoszeń z kartkami
  rect(set, 0, 1, 32, 14, "#46301f");
  rect(set, 1, 2, 30, 12, "#a8845c");
  rect(set, 1, 2, 30, 1, "#8a6a46");
  // kartki
  rect(set, 3, 4, 6, 5, "#e4dcc8");
  rect(set, 12, 3, 5, 6, "#f2efe6");
  rect(set, 20, 5, 7, 5, "#d8d0c0");
  rect(set, 24, 3, 4, 3, "#e4dcc8");
  // pineski
  set(5, 4, COL.cap);
  set(14, 3, COL.teal);
  set(23, 5, COL.rust);
  set(25, 3, COL.cap);
  // bazgroły
  rect(set, 4, 6, 4, 1, "#8a8072");
  rect(set, 13, 5, 3, 1, "#8a8072");
  rect(set, 13, 7, 3, 1, "#8a8072");
  rect(set, 21, 7, 5, 1, "#8a8072");
  // kartka wisząca krzywo / oderwana
  set(27, 8, "#e4dcc8");
  set(28, 9, "#e4dcc8");
  set(29, 10, "#d8d0c0");
  set(8, 11, "#cbb89a");
  set(9, 12, "#cbb89a");
}

function paintCarpet(set: SetPx) {
  rect(set, 1, 1, 30, 30, "#5e2c2a");
  rect(set, 2, 2, 28, 28, "#743834");
  rect(set, 4, 4, 24, 24, "#4b2422");
  rect(set, 6, 6, 20, 20, "#85453c");
  // Geometric center pattern
  rect(set, 12, 10, 8, 12, "#cbb89a");
  rect(set, 13, 11, 6, 10, "#5e2c2a");
  rect(set, 15, 13, 2, 6, "#d4a84a");
  // Fringes
  for (let y = 2; y < 30; y += 2) {
    set(0, y, "#cbb89a");
    set(31, y, "#cbb89a");
  }
  // Dust & wear
  speck(set, 1440, 26, 32, 32, "#3a241e");
}

/* ================= SKY / DAWN CITYSCAPE ================= */

export function drawSkyTile(ctx: CanvasRenderingContext2D, sx: number, sy: number, tx: number, ty: number) {
  const rel = Math.floor((ty / MAP_H) * 40);
  const dawn = rel < 11;
  ctx.fillStyle = dawn
    ? rel < 5
      ? "#587092"
      : rel < 8
        ? "#848ca4"
        : "#d89056"
    : rel > 18
      ? "#152038"
      : "#24375a";
  ctx.fillRect(sx, sy, 16, 16);
  if (rel === 8) {
    ctx.fillStyle = "#f2b86e";
    ctx.fillRect(sx, sy + 12, 16, 4);
  }
  const h = hash2(tx, ty, 3);
  if (h > 0.68 && rel >= 5 && rel <= 14) {
    ctx.fillStyle = "#1b263b";
    const bh = 5 + Math.floor(hash2(tx, ty, 4) * 9);
    ctx.fillRect(sx + 2, sy + 16 - bh, 6, bh);
    ctx.fillRect(sx + 9, sy + 18 - bh, 5, Math.max(2, bh - 2));
    if (hash2(tx, ty, 9) > 0.5) {
      ctx.fillStyle = COL.fluor;
      ctx.fillRect(sx + 4, sy + 16 - bh + 2, 1, 1);
    }
    if (hash2(tx, ty, 13) > 0.78) {
      ctx.fillStyle = "#e8923a";
      ctx.fillRect(sx + 11, sy + 18 - bh + 3, 1, 1);
    }
  }
  if (!dawn && hash2(tx, ty, 6) > 0.9) {
    ctx.fillStyle = "#e4dcc8";
    ctx.fillRect(sx + 3, sy + 2, 1, 1);
  }
}

/* ================= NEW STYLE TILES ================= */

function floorBathTile(set: SetPx, v: number) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const on = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      const grout = x % 4 === 0 || y % 4 === 0;
      set(x, y, grout ? "#4a4a44" : on ? "#c8c9bc" : "#a8aca2");
    }
  }
  if (v === 1) {
    rect(set, 5, 6, 5, 3, "#7c8c8c"); // kałuża
    set(6, 7, "#b8ccd0");
  }
  if (v === 2) {
    set(3, 3, COL.mold); // grzyb w fugach
    set(11, 11, COL.mold);
    set(12, 12, "#6a7a48");
  }
  if (v === 3) {
    set(8, 2, "#8a3c22"); // rdza
    set(8, 3, COL.rust);
  }
}

function floorLinoleum(set: SetPx, v: number) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      set(x, y, on ? "#7c7464" : "#5e584c");
    }
  }
  rect(set, 0, 0, 16, 1, "#3a342e");
  rect(set, 0, 0, 1, 16, "#3a342e");
  speck(set, 1500 + v * 9, 9, 16, 16, "#4a443a");
  if (v === 2) {
    rect(set, 4, 5, 6, 4, "#8c826e"); // wytarte miejsce
    set(5, 6, "#a89e88");
  }
}

function floorCharred(set: SetPx, v: number) {
  rect(set, 0, 0, 16, 16, "#24201e");
  speck(set, 1600 + v * 7, 20, 16, 16, "#151214");
  speck(set, 1700 + v * 11, 10, 16, 16, "#3a2c24");
  if (v % 2 === 0) {
    set(4, 5, "#8a3c22");
    set(5, 6, "#c4622e");
    set(6, 7, "#5a2c1c");
  }
  if (v === 3) rect(set, 9, 9, 4, 3, "#121012");
}

function floorCarpetTile(set: SetPx, v: number) {
  rect(set, 0, 0, 16, 16, "#6e322e");
  rect(set, 1, 1, 14, 14, "#7e3a34");
  for (let y = 2; y < 14; y += 3) for (let x = 2; x < 14; x += 4) set(x, y, "#a8845c");
  speck(set, 1800 + v * 7, 10, 16, 16, "#4e2422");
  if (v === 2) {
    rect(set, 5, 6, 5, 3, "#4e2422"); // plama
    set(6, 7, "#3a1a18");
  }
}

function wallBathTile(set: SetPx, v: number) {
  rect(set, 0, 0, 16, 16, "#b8bcb4");
  for (let y = 0; y < 16; y += 4) rect(set, 0, y, 16, 1, "#6e7470");
  for (let x = 0; x < 16; x += 4) rect(set, x, 0, 1, 16, "#6e7470");
  rect(set, 0, 9, 16, 1, COL.wainscot);
  rect(set, 0, 10, 16, 6, COL.wainscotDark);
  if (v === 1) {
    rect(set, 4, 3, 4, 4, "#8a908c"); // pęknięta glazura
    set(5, 4, "#4a4e4a");
  }
  if (v === 2) speck(set, 1900, 6, 16, 10, COL.mold);
}

function wallCharred(set: SetPx, v: number) {
  rect(set, 0, 0, 16, 16, "#2e2622");
  speck(set, 2000 + v * 9, 14, 16, 16, "#171416");
  if (v % 2 === 0) {
    rect(set, 2, 0, 3, 10, "#1a1414"); // smuga sadzy
    set(3, 2, "#4a2c1e");
  }
  speck(set, 2100 + v * 11, 6, 16, 16, "#6a3c28");
}

/* ================= NEW PROPS ================= */

function paintWasher(set: SetPx) {
  rect(set, 2, 1, 12, 14, "#c8c4bc");
  rect(set, 3, 2, 10, 12, "#e0dcd4");
  rect(set, 4, 3, 8, 5, "#4a5058");
  rect(set, 5, 4, 6, 3, "#7e949c");
  set(11, 3, COL.brass);
  set(11, 4, "#6a7078");
  set(4, 11, COL.rust);
}

function paintLocker(set: SetPx) {
  rect(set, 2, 0, 12, 16, "#4a545a");
  rect(set, 3, 1, 10, 14, "#6e787e");
  rect(set, 4, 2, 8, 1, "#3a4248");
  for (let y = 4; y < 10; y += 2) rect(set, 4, y, 6, 1, "#3a4248");
  set(10, 8, COL.brass);
  set(3, 12, COL.rust);
  set(11, 13, COL.rustDark);
}

function paintBike(set: SetPx) {
  // dwa koła, rama, kierownica
  rect(set, 1, 7, 6, 1, "#22242a");
  rect(set, 1, 12, 6, 1, "#22242a");
  rect(set, 24, 7, 6, 1, "#22242a");
  rect(set, 24, 12, 6, 1, "#22242a");
  for (const cx of [4, 27]) {
    set(cx - 3, 9, "#3a4048");
    set(cx + 3, 9, "#3a4048");
    set(cx, 7, "#3a4048");
    set(cx, 12, "#3a4048");
  }
  pixLineCanvas(set, 4, 9, 14, 9, "#4a8a86");
  pixLineCanvas(set, 14, 9, 27, 9, "#4a8a86");
  pixLineCanvas(set, 4, 9, 14, 13, "#4a8a86");
  pixLineCanvas(set, 14, 13, 27, 9, "#4a8a86");
  rect(set, 13, 12, 3, 1, "#22242a");
  rect(set, 24, 4, 5, 1, "#22242a");
}

function pixLineCanvas(set: SetPx, x0: number, y0: number, x1: number, y1: number, col: string) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), col);
}

function paintBench(set: SetPx) {
  rect(set, 0, 5, 32, 4, "#6b4a32");
  rect(set, 0, 5, 32, 1, "#8a6240");
  rect(set, 0, 10, 32, 2, "#4a3224");
  rect(set, 3, 12, 2, 3, "#3e2a1c");
  rect(set, 27, 12, 2, 3, "#3e2a1c");
  rect(set, 0, 1, 32, 3, "#5c4038");
  for (let x = 2; x < 32; x += 4) set(x, 2, "#3a2a24");
}

function paintExtinguisher(set: SetPx) {
  rect(set, 5, 3, 6, 11, "#a82424");
  rect(set, 6, 4, 4, 8, COL.bloodBright);
  rect(set, 6, 7, 4, 2, "#e4dcc8");
  rect(set, 7, 1, 2, 2, "#3a4048");
  set(9, 2, "#6a7078");
  set(6, 12, "#7a2020");
}

function paintCounter(set: SetPx) {
  rect(set, 0, 4, 32, 11, "#5c4638");
  rect(set, 0, 4, 32, 3, "#8c8174");
  rect(set, 1, 7, 30, 6, "#6b4a32");
  for (let x = 2; x < 32; x += 9) {
    set(x, 9, COL.brass);
    set(x, 10, "#3a2a1c");
  }
  rect(set, 3, 2, 5, 2, "#e4dcc8"); // talerz
  rect(set, 20, 1, 3, 3, "#3e8a86"); // kubek
}

function paintShower(set: SetPx) {
  rect(set, 1, 0, 14, 16, "#a8aca2");
  rect(set, 3, 2, 10, 12, "#6e8a92");
  for (let y = 3; y < 13; y += 2) rect(set, 4, y, 8, 1, "#8aa8ac");
  rect(set, 6, 0, 4, 2, "#8a949e");
  set(8, 2, "#c8d0d0");
  set(7, 4, "#c8d0d0");
}

function paintAntenna(set: SetPx) {
  set(7, 0, "#a8b0b8");
  rect(set, 7, 1, 2, 14, "#6a7078");
  rect(set, 3, 4, 10, 1, "#8a949e");
  rect(set, 4, 9, 8, 1, "#8a949e");
  set(6, 2, COL.bloodBright);
  set(7, 15, "#3a4048");
}

function paintWatertank(set: SetPx) {
  rect(set, 1, 1, 30, 13, "#5a626a");
  rect(set, 2, 2, 28, 3, "#7a828a");
  for (let x = 3; x < 30; x += 5) rect(set, x, 5, 1, 8, "#3a4248");
  speck(set, 2200, 12, 32, 12, COL.rust);
  rect(set, 4, 14, 2, 2, "#3a4048");
  rect(set, 26, 14, 2, 2, "#3a4048");
}

function paintSatellite(set: SetPx) {
  rect(set, 12, 8, 4, 7, "#6a7078");
  rect(set, 2, 3, 13, 9, "#c8c4bc");
  rect(set, 3, 4, 11, 7, "#a8aca2");
  rect(set, 6, 5, 3, 4, "#5c646c");
  set(14, 7, COL.bloodBright);
  rect(set, 17, 2, 12, 9, "#b8b4ac");
  rect(set, 19, 4, 8, 5, "#8a8e92");
}

function paintToy(set: SetPx) {
  // rozsypane klocki i pluszak
  rect(set, 3, 9, 4, 4, "#c43830");
  rect(set, 8, 11, 3, 3, "#3e8a86");
  rect(set, 2, 5, 3, 3, "#d4a84a");
  rect(set, 9, 4, 4, 5, "#cbb89a");
  set(10, 5, COL.ink);
  set(12, 5, COL.ink);
  set(11, 7, "#8a2828");
}

/* ================= WEAPON RENDERING IN HAND ================= */

export function drawWeaponInHand(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  aim: number,
  weapon: "pistol" | "shotgun",
  recoil: number,
  meleeT: number,
  flashT: number,
) {
  const ca = Math.cos(aim);
  const sa = Math.sin(aim);
  const pxp = -sa;
  const pyp = ca;

  if (meleeT > 0) {
    // Detailed pixel-art crowbar swing arc!
    const prog = 1 - meleeT / 0.16; // 0 -> 1
    const swingAng = aim - 1.15 + prog * 2.3;
    const sc = Math.cos(swingAng);
    const ss = Math.sin(swingAng);
    const hx = px + sc * 4;
    const hy = py + ss * 4;
    const tx = px + sc * 17;
    const ty = py + ss * 17;

    // Motion trail arc (chunky pixels)
    for (let s = 1; s <= 4; s++) {
      const ta = swingAng - s * 0.22;
      ctx.fillStyle = s <= 2 ? "rgba(232,224,112,0.55)" : "rgba(196,98,46,0.32)";
      ctx.fillRect(Math.round(px + Math.cos(ta) * 15), Math.round(py + Math.sin(ta) * 15), 2, 2);
      ctx.fillRect(Math.round(px + Math.cos(ta) * 12), Math.round(py + Math.sin(ta) * 12), 1, 1);
    }
    // Shaft of crowbar (rusty red + steel highlight)
    pixLine(ctx, hx, hy, tx, ty, COL.capDark);
    pixLine(ctx, hx + sc * 2, hy + ss * 2, tx - sc * 2, ty - ss * 2, COL.rust);
    // Curved hook tip
    const hookX = tx + Math.cos(swingAng + 1.1) * 4;
    const hookY = ty + Math.sin(swingAng + 1.1) * 4;
    pixLine(ctx, tx, ty, hookX, hookY, "#cfd6dc");
    ctx.fillStyle = COL.white;
    ctx.fillRect(Math.round(hookX), Math.round(hookY), 1, 1);
    return;
  }

  // Crowbar holstered on back/side
  const bx = px - ca * 5 + pxp * 3;
  const by = py - sa * 5 + pyp * 3;
  pixLine(ctx, bx, by, bx - ca * 4 + pxp * 5, by - sa * 4 + pyp * 5, COL.rustDark);
  ctx.fillStyle = "#b0b8c0";
  ctx.fillRect(Math.round(bx - ca * 4 + pxp * 5), Math.round(by - sa * 4 + pyp * 5), 1, 1);

  const kick = recoil * 3.5;
  const start = 4 - kick;

  if (weapon === "shotgun") {
    // Double-barrel shotgun: wooden stock, receiver, long twin steel barrel
    const sx = px + ca * (start - 1);
    const sy = py + sa * (start - 1);
    const midX = px + ca * (start + 4);
    const midY = py + sa * (start + 4);
    const tipX = px + ca * (start + 12);
    const tipY = py + sa * (start + 12);
    // Stock
    pixLine(ctx, sx, sy, midX, midY, COL.wood);
    pixLine(ctx, sx + pxp, sy + pyp, midX + pxp, midY + pyp, COL.woodDark);
    // Twin barrels
    pixLine(ctx, midX, midY, tipX, tipY, "#383e46");
    pixLine(ctx, midX + pxp, midY + pyp, tipX + pxp, tipY + pyp, "#727b86");
    // Forend pump wood
    const f1x = px + ca * (start + 6);
    const f1y = py + sa * (start + 6);
    const f2x = px + ca * (start + 9);
    const f2y = py + sa * (start + 9);
    pixLine(ctx, f1x - pxp * 0.5, f1y - pyp * 0.5, f2x - pxp * 0.5, f2y - pyp * 0.5, COL.woodLight);

    if (flashT > 0) {
      drawMuzzleFlash(ctx, tipX + ca * 2, tipY + sa * 2, aim, true);
    }
  } else {
    // Pistol: grip, dark slide, metallic top edge
    const gx = px + ca * (start + 2);
    const gy = py + sa * (start + 2);
    const tipX = px + ca * (start + 9);
    const tipY = py + sa * (start + 9);
    // Hand
    ctx.fillStyle = COL.skin;
    ctx.fillRect(Math.round(gx) - 1, Math.round(gy) - 1, 2, 2);
    // Barrel + slide
    pixLine(ctx, gx, gy, tipX, tipY, COL.gun);
    pixLine(ctx, gx + pxp * 0.8, gy + pyp * 0.8, tipX + pxp * 0.8, tipY + pyp * 0.8, "#6a727c");
    if (flashT > 0) {
      drawMuzzleFlash(ctx, tipX + ca * 2, tipY + sa * 2, aim, false);
    }
  }
}

function drawMuzzleFlash(ctx: CanvasRenderingContext2D, x: number, y: number, aim: number, big: boolean) {
  const ca = Math.cos(aim);
  const sa = Math.sin(aim);
  const pxp = -sa;
  const pyp = ca;
  const r = big ? 5 : 3;
  // Outer amber/orange flare
  ctx.fillStyle = "#e88a34";
  ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 3, 3);
  pixLine(ctx, x, y, x + ca * (r + 3), y + sa * (r + 3), "#e88a34");
  pixLine(ctx, x, y, x + (ca * 0.7 + pxp * 0.7) * r, y + (sa * 0.7 + pyp * 0.7) * r, COL.fluor);
  pixLine(ctx, x, y, x + (ca * 0.7 - pxp * 0.7) * r, y + (sa * 0.7 - pyp * 0.7) * r, COL.fluor);
  // Bright core
  ctx.fillStyle = COL.white;
  ctx.fillRect(Math.round(x), Math.round(y), big ? 2 : 1, big ? 2 : 1);
}

/* ================= ART ATLAS ================= */

export class Art {
  floors: Record<Theme, HTMLCanvasElement[]>;
  walls: Record<Theme, HTMLCanvasElement[]>;
  floorStyles: HTMLCanvasElement[][];
  wallStyles: HTMLCanvasElement[][];
  door: HTMLCanvasElement;
  doorLocked: HTMLCanvasElement;
  doorBarricaded: HTMLCanvasElement;
  doorBroken: HTMLCanvasElement;
  doorOpen: HTMLCanvasElement;
  breach: HTMLCanvasElement;
  npcCrouch: [HTMLCanvasElement, HTMLCanvasElement];
  npcRun: [HTMLCanvasElement, HTMLCanvasElement][];
  stairsUp: HTMLCanvasElement;
  stairsDown: HTMLCanvasElement;
  windows: Record<Glow, HTMLCanvasElement>;
  rubble: HTMLCanvasElement;
  puddle: HTMLCanvasElement;
  player: Record<Dir, HTMLCanvasElement[]>;
  zombie: Record<ZombieKind, Record<Dir, HTMLCanvasElement[]>>;
  corpse: Record<ZombieKind, HTMLCanvasElement>;
  props: Record<PropKind, HTMLCanvasElement>;
  crateOpen: HTMLCanvasElement;

  constructor() {
    const themes: Theme[] = ["basement", "lobby", "flat", "decay", "roof"];
    const floorPaint: Record<Theme, (set: SetPx, v: number) => void> = {
      basement: floorBasement,
      lobby: floorLobby,
      flat: floorWood,
      decay: floorDecay,
      roof: floorRoof,
    };
    const wallPaint: Record<Theme, (set: SetPx, v: number) => void> = {
      basement: wallBasement,
      lobby: wallLobby,
      flat: wallFlat,
      decay: wallDecay,
      roof: wallRoof,
    };
    this.floors = {} as Art["floors"];
    this.walls = {} as Art["walls"];
    for (const theme of themes) {
      this.floors[theme] = [0, 1, 2, 3, 4, 5].map((v) => makeCanvas(16, 16, (s) => floorPaint[theme](s, v)));
      this.walls[theme] = [0, 1, 2, 3].map((v) => makeCanvas(16, 16, (s) => wallPaint[theme](s, v)));
    }
    // Style kafli przypisane do konkretnych pomieszczeń
    const floorPaints: ((s: SetPx, v: number) => void)[] = [
      floorWood,
      floorBathTile,
      floorLinoleum,
      floorBasement,
      floorCharred,
      floorDecay,
      floorRoof,
      floorCarpetTile,
    ];
    const wallPaints: ((s: SetPx, v: number) => void)[] = [
      wallFlat,
      wallBathTile,
      wallLobby,
      wallBasement,
      wallCharred,
      wallDecay,
      wallRoof,
    ];
    this.floorStyles = floorPaints.map((fn) => [0, 1, 2, 3].map((v) => makeCanvas(16, 16, (s) => fn(s, v))));
    this.wallStyles = wallPaints.map((fn) => [0, 1, 2, 3].map((v) => makeCanvas(16, 16, (s) => fn(s, v))));

    this.door = makeCanvas(16, 16, (s) => paintDoor(s, false, false));
    this.doorLocked = makeCanvas(16, 16, (s) => paintDoor(s, true, false));
    this.doorBarricaded = makeCanvas(16, 16, paintDoorBarricaded);
    this.doorBroken = makeCanvas(16, 16, (s) => paintDoor(s, false, true));
    this.doorOpen = makeCanvas(16, 16, paintDoorOpen);
    this.breach = makeCanvas(16, 16, paintBreach);
    this.npcCrouch = [
      makeCanvas(16, 18, (s) => paintSurvivor(s, 0, true, 0), true),
      makeCanvas(16, 18, (s) => paintSurvivor(s, 1, true, 0), true),
    ];
    this.npcRun = [0, 1].map(
      (v) =>
        [
          makeCanvas(16, 18, (s) => paintSurvivor(s, v, false, 0), true),
          makeCanvas(16, 18, (s) => paintSurvivor(s, v, false, 1), true),
        ] as [HTMLCanvasElement, HTMLCanvasElement],
    );
    this.stairsUp = makeCanvas(16, 16, (s) => paintStairs(s, true));
    this.stairsDown = makeCanvas(16, 16, (s) => paintStairs(s, false));
    this.windows = {
      none: makeCanvas(16, 16, (s) => paintWindow(s, "none")),
      fluor: makeCanvas(16, 16, (s) => paintWindow(s, "fluor")),
      orange: makeCanvas(16, 16, (s) => paintWindow(s, "orange")),
    };
    this.rubble = makeCanvas(16, 16, (s) => {
      floorDecay(s, 1);
      rect(s, 3, 5, 5, 3, "#625c54");
      rect(s, 9, 8, 4, 3, "#46413b");
      rect(s, 5, 10, 3, 2, "#7c756a");
      s(4, 6, "#9c9488");
      s(10, 9, COL.rust);
      s(11, 10, "#24201c");
    });
    this.puddle = makeCanvas(16, 16, (s) => {
      floorRoof(s, 2);
      rect(s, 2, 4, 12, 8, "#334f6e");
      rect(s, 3, 5, 9, 5, "#466a90");
      rect(s, 4, 5, 6, 2, "#7ea6c8");
      s(6, 6, "#e8e070");
      s(10, 8, "#e8a060");
      s(5, 9, "#263d58");
    });

    const dirs: Dir[] = ["down", "up", "right"];
    this.player = { down: [], up: [], left: [], right: [] };
    for (const d of dirs) {
      this.player[d] = [0, 1, 2, 3].map((f) => makeCanvas(18, 20, (s) => paintPlayer(s, d, f), true));
    }
    this.player.left = this.player.right.map(mirror);

    const blank = (): HTMLCanvasElement[] => [];
    this.zombie = {
      shambler: { down: blank(), up: blank(), left: blank(), right: blank() },
      runner: { down: blank(), up: blank(), left: blank(), right: blank() },
      brute: { down: blank(), up: blank(), left: blank(), right: blank() },
      boss: { down: blank(), up: blank(), left: blank(), right: blank() },
      crawler: { down: blank(), up: blank(), left: blank(), right: blank() },
    };
    for (const kind of ["shambler", "runner", "brute"] as ZombieKind[]) {
      const w = kind === "brute" ? 20 : 18;
      const h = 20;
      for (const d of dirs) {
        this.zombie[kind][d] = [0, 1, 2, 3].map((f) => makeCanvas(w, h, (s) => paintZombie(s, kind, d, f), true));
      }
      this.zombie[kind].left = this.zombie[kind].right.map(mirror);
    }
    // Boss = brutalnie powiększony brute (skala 2x przy rysowaniu)
    this.zombie.boss = this.zombie.brute;

    this.corpse = {
      shambler: makeCanvas(18, 16, (s) => paintCorpse(s, "shambler"), true),
      runner: makeCanvas(18, 16, (s) => paintCorpse(s, "runner"), true),
      brute: makeCanvas(18, 16, (s) => paintCorpse(s, "brute"), true),
      boss: makeCanvas(18, 16, (s) => paintCorpse(s, "brute"), true),
      crawler: makeCanvas(18, 16, (s) => paintCorpse(s, "shambler"), true),
    };

    this.crateOpen = makeCanvas(16, 16, (s) => paintCrate(s, true), true);
    this.props = {
      crate: makeCanvas(16, 16, (s) => paintCrate(s, false), true),
      medbox: makeCanvas(16, 16, (s) => {
        rect(s, 1, 3, 14, 11, "#777e76");
        rect(s, 2, 4, 12, 8, "#d4d1bb");
        rect(s, 7, 5, 3, 6, COL.bloodBright);
        rect(s, 5, 7, 7, 2, COL.bloodBright);
        rect(s, 4, 3, 8, 1, "#f0efda");
        rect(s, 2, 12, 12, 1, "#9fa494");
      }, true),
      supplycase: makeCanvas(16, 16, (s) => {
        rect(s, 1, 4, 14, 9, "#373d31");
        rect(s, 2, 4, 12, 6, "#687259");
        rect(s, 2, 4, 12, 1, "#929984");
        rect(s, 1, 8, 14, 1, "#2e332c");
        rect(s, 4, 7, 1, 3, COL.brass);
        rect(s, 11, 7, 1, 3, COL.brass);
        rect(s, 6, 5, 4, 1, "#c5bc8d");
      }, true),
      mailbox: makeCanvas(32, 16, paintMailbox, true),
      bed: makeCanvas(32, 16, paintBed, true),
      sofa: makeCanvas(32, 16, paintSofa, true),
      table: makeCanvas(16, 16, paintTable, true),
      wardrobe: makeCanvas(16, 16, paintWardrobe, true),
      fridge: makeCanvas(16, 16, paintFridge, true),
      chair: makeCanvas(16, 16, paintChair, true),
      pipes: makeCanvas(32, 16, paintPipes, true),
      vent: makeCanvas(32, 16, paintVent, true),
      flare: makeCanvas(16, 16, paintFlare, true),
      desk: makeCanvas(32, 16, paintDesk, true),
      barrel: makeCanvas(16, 16, paintBarrel, true),
      tv: makeCanvas(16, 16, paintTv, true),
      radio: makeCanvas(16, 16, paintTv, true),
      explosive: makeCanvas(16, 16, paintBarrel, true),
      radiator: makeCanvas(16, 16, paintRadiator, true),
      sink: makeCanvas(16, 16, paintSink, true),
      trash: makeCanvas(16, 16, paintTrash, true),
      carpet: makeCanvas(32, 32, paintCarpet, false),
      stove: makeCanvas(16, 16, paintStove, true),
      toilet: makeCanvas(16, 16, paintToilet, true),
      bathtub: makeCanvas(32, 16, paintBathtub, true),
      bookshelf: makeCanvas(16, 16, paintBookshelf, true),
      plant: makeCanvas(16, 16, paintPlant, true),
      board: makeCanvas(32, 16, paintBoard, true),
      washer: makeCanvas(16, 16, paintWasher, true),
      locker: makeCanvas(16, 16, paintLocker, true),
      bike: makeCanvas(32, 16, paintBike, true),
      bench: makeCanvas(32, 16, paintBench, true),
      extinguisher: makeCanvas(16, 16, paintExtinguisher, true),
      counter: makeCanvas(32, 16, paintCounter, true),
      shower: makeCanvas(16, 16, paintShower, true),
      antenna: makeCanvas(16, 16, paintAntenna, true),
      watertank: makeCanvas(32, 16, paintWatertank, true),
      satellite: makeCanvas(32, 16, paintSatellite, true),
      toy: makeCanvas(16, 16, paintToy, true),
    };
  }
}

export function pixLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string) {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const gx = Math.round(x1);
  const gy = Math.round(y1);
  const dx = Math.abs(gx - x);
  const dy = Math.abs(gy - y);
  const sx = x < gx ? 1 : -1;
  const sy = y < gy ? 1 : -1;
  let err = dx - dy;
  ctx.fillStyle = col;
  for (let i = 0; i < 48; i++) {
    ctx.fillRect(x, y, 1, 1);
    if (x === gx && y === gy) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}
