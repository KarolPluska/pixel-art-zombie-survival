import { useId, type ReactNode } from "react";
import type { WeaponId } from "../game/inventory";

const paths = {
  pack: "M6 9V7a6 6 0 0 1 12 0v2M5 9h14v12H5zM8 12h8v6H8zM8 3V1m8 2V1M3 12v6m18-6v6",
  book: "M3 4h6c2 0 3 1 3 2 0-1 1-2 3-2h6v15h-6c-2 0-3 1-3 2 0-1-1-2-3-2H3zM12 6v15M6 8h3m6 0h3M6 11h3m6 0h3",
  volume: "M3 9h4l5-5v16l-5-5H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14",
  muted: "M3 9h4l5-5v16l-5-5H3zM16 9l6 6m0-6-6 6",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5",
  collapse: "M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  external: "M6 18 18 6M7 6h11v11",
  back: "M20 12H5m6-6-6 6 6 6",
  chevron: "m9 5 7 7-7 7",
  trophy: "M7 3h10v5a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 13v5m-4 3h8m-6-3h4v3h-4z",
  lock: "M7 10V7a5 5 0 1 1 10 0v3M5 10h14v11H5zM12 14v3",
  close: "M5 5l14 14M19 5 5 19",
  keys: "M2 5h20v14H2zM5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 15h10",
  music: "M9 18V5l11-2v13M9 7l11-2M4 17h5v4H4zm11-2h5v4h-5z",
  check: "m4 12 5 5L20 6",
  headsets: "M4 14v-3a8 8 0 1 1 16 0v3M3 12h4v8H3zm14 0h4v8h-4z",
  pin: "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0zM10 8h4v4h-4z",
  plus: "M5 12h14M12 5v14",
  pause: "M7 5v14m10-14v14",
  swap: "M3 7h16m-4-4 4 4-4 4M21 17H5m4-4-4 4 4 4",
  box: "m3 7 9-4 9 4v11l-9 4-9-4zM3 7l9 4 9-4m-9 4v11",
  sound: "M3 10v4m4-7v10m5-15v20m5-16v12m4-8v4",
  skull: "M6 3h12v3h3v6h-2v3h-3v3H8v-3H5v-3H3V6h3zM9 8h2v3H9zm4 0h2v3h-2z",
  keyIcon: "M3 15a4 4 0 1 1 7.5-2H21v4h-3v3h-4v-3h-3.5A4 4 0 0 1 3 15zM6.5 13.5h.01",
  heart: "M12 20 4 12V7l3-3h3l2 3 2-3h3l3 3v5z",
  stamina: "M13 2 5 13h6l-1 9 9-12h-6z",
  flashlight: "M4 9h7l3-3h5v12h-5l-3-3H4zM6 9v6m15-7v8",
} as const;

export function Icon({ name, size = 18, className = "" }: { name: keyof typeof paths | "play"; size?: number; className?: string }) {
  return <svg className={`ui-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter" strokeLinecap="square" shapeRendering="crispEdges">
    {name === "play" ? <path d="M5 3h3v2h3v2h3v2h3v2h3v2h-3v2h-3v2h-3v2H8v2H5z" stroke="none" fill="currentColor" /> : <path d={paths[name]} />}
  </svg>;
}

export function BuildingMark() {
  return <svg aria-hidden="true" viewBox="0 0 34 34" width="32" height="32" fill="currentColor" shapeRendering="crispEdges">
    <path d="M2 30V11h6V4h16v6h7v20h-8v-6h-5v6z" />
    {[8, 14, 20].map(y => <g key={y} fill="#111719"><rect x="11" y={y} width="3" height="3" /><rect x="17" y={y} width="3" height="3" /></g>)}
    <path fill="#111719" d="M25 13h3v3h-3zm0 6h3v3h-3zM5 15h2v3H5zm0 6h2v3H5z" />
  </svg>;
}

export function Wordmark() {
  const id = useId();
  return <svg viewBox="0 0 313 80" className="hero-wordmark" aria-hidden="true" shapeRendering="crispEdges">
    <defs><mask id={id}><rect width="313" height="80" fill="white" />
      {Array.from({length: 360}, (_, n) => {
        const hash = (a: number) => { const v = Math.sin((n + 3) * a) * 4473.14; return v - Math.floor(v); };
        return <rect key={n} x={Math.floor(hash(19) * 313)} y={Math.floor(hash(72) * 80)} width={hash(27) * 2.5 + .25} height={hash(13) * 1.4 + .25} fill={n % 5 === 0 ? "#111" : "#999"} />;
      })}</mask></defs>
    <g mask={`url(#${id})`} fill="#e8e7da" fillRule="evenodd">
      <path d="M0 0h44v5h7v29h-6v8h6v32h-7v6H0zm15 14v17h20V14zm0 32v20h21V46z" />
      <path d="M62 0h16v65h31v15H62z" />
      <path d="M123 0h41v6h7v68h-7v6h-41v-6h-7V6h7zm10 15v50h21V15z" />
      <path d="M182 0h16v31h8v-9h7V12h7V0h17v17h-7v11h-8v11h-7v4h8v11h8v10h7v16h-18V69h-7V59h-7V48h-8v32h-16z" />
      <path fill="#f0c16a" d="M258 0h55v17h-6v13h-7v13h-7v14h-6v23h-19V56h7V42h7V28h7V15h-31z" />
    </g>
  </svg>;
}

/* =======================================================================
   Weapon icons are real pixel rasters: a 40 x 18 grid of hard-edged blocks,
   drawn at 2x. No curves, no anti-aliased diagonals, no gradients.
   ======================================================================= */

type Block = [x: number, y: number, w: number, h: number, color: string];

const PIXEL_COLORS: Record<string, string> = {
  " ": "transparent",
  "0": "#0b1114", // ink outline
  "1": "#27343a", // dark steel
  "2": "#617078", // steel
  "3": "#aeb9b2", // steel highlight
  "4": "#e3e7d8", // glint
  "5": "#4e3525", // dark wood
  "6": "#8d6540", // wood
  "7": "#c39a65", // wood highlight
  "8": "#833a2c", // dark rust
  "9": "#bf5937", // rust
  a: "#e08a55", // rust highlight
  b: "#332723", // dark grip
  c: "#6b5036", // grip
  d: "#d8b25f", // brass
  f: "#3d4c55", // blued steel
  g: "#c9ccae", // cord / bone
  h: "#181d1f", // shadow
};

const GRID_W = 40;
const GRID_H = 18;
const SCALE = 2;

function diagonal(steps: number, x0: number, y0: number, dx: number, dy: number, paint: (x: number, y: number, i: number) => void) {
  for (let i = 0; i < steps; i++) paint(x0 + i * dx, y0 + i * dy, i);
}

function buildWeapons(): Record<WeaponId, Block[]> {
  const crowbar: Block[] = [];
  diagonal(13, 3, 14, 2, -1, (x, y) => crowbar.push([x, y, 6, 3, "0"]));
  diagonal(13, 4, 15, 2, -1, (x, y) => crowbar.push([x, y, 4, 1, "8"]));
  diagonal(13, 5, 15, 2, -1, (x, y) => crowbar.push([x, y, 3, 1, "9"]));
  diagonal(13, 5, 15, 2, -1, (x, y) => crowbar.push([x, y, 1, 1, "a"]));
  crowbar.push(
    [27, 2, 10, 4, "0"], [28, 3, 8, 2, "3"], [35, 3, 3, 5, "0"], [36, 4, 2, 3, "4"],
    [31, 1, 5, 2, "0"], [32, 2, 3, 1, "3"],
    [2, 13, 6, 5, "0"], [3, 14, 4, 3, "b"], [3, 14, 2, 1, "c"], [3, 17, 4, 1, "1"],
  );

  const hatchet: Block[] = [];
  diagonal(11, 2, 14, 2, -1, (x, y) => hatchet.push([x, y, 5, 3, "0"]));
  diagonal(11, 3, 15, 2, -1, (x, y) => hatchet.push([x, y, 3, 1, "6"]));
  diagonal(11, 3, 15, 2, -1, (x, y) => hatchet.push([x, y, 1, 1, "7"]));
  hatchet.push(
    [24, 5, 5, 6, "1"], [25, 6, 3, 4, "2"],
    [27, 1, 12, 9, "0"], [28, 2, 10, 7, "2"], [34, 5, 5, 5, " "],
    [28, 2, 9, 1, "3"], [29, 3, 7, 1, "3"], [28, 4, 5, 2, "3"], [29, 4, 2, 1, "4"],
    [36, 2, 2, 3, "4"], [27, 1, 3, 2, "1"],
    [2, 13, 6, 5, "0"], [3, 14, 4, 3, "5"], [3, 14, 2, 1, "6"],
  );

  const pistol: Block[] = [
    [4, 4, 32, 5, "0"], [5, 5, 30, 3, "1"], [5, 5, 30, 1, "3"], [5, 7, 30, 1, "2"],
    [33, 5, 3, 2, "4"], [6, 8, 26, 1, "f"],
    [7, 9, 9, 8, "0"], [8, 10, 7, 6, "b"], [9, 10, 5, 1, "c"],
    [9, 12, 3, 1, "c"], [9, 14, 3, 1, "c"], [8, 16, 7, 1, "1"],
    [16, 9, 8, 3, "0"], [17, 10, 6, 1, " "], [18, 8, 2, 3, "2"], [19, 9, 1, 1, "4"],
    [24, 8, 7, 2, "1"], [25, 8, 5, 1, "2"], [5, 4, 3, 2, "1"],
    [12, 5, 2, 1, "4"], [16, 5, 2, 1, "4"],
  ];

  const revolver: Block[] = [
    [6, 4, 32, 4, "0"], [7, 5, 30, 2, "1"], [7, 5, 30, 1, "3"], [35, 5, 2, 1, "4"],
    [12, 7, 12, 5, "0"], [13, 8, 10, 3, "2"], [14, 8, 2, 3, "1"], [18, 8, 2, 3, "1"],
    [16, 6, 6, 1, "f"], [7, 9, 10, 8, "0"], [8, 10, 8, 6, "5"], [9, 10, 6, 1, "6"],
    [9, 12, 4, 1, "c"], [9, 14, 4, 1, "c"], [8, 16, 8, 1, "1"],
    [23, 8, 8, 3, "0"], [24, 9, 6, 1, " "], [20, 7, 2, 3, "2"], [27, 4, 7, 1, "d"],
  ];

  const shotgun: Block[] = [
    [2, 8, 13, 6, "0"], [3, 9, 11, 4, "5"], [3, 9, 11, 1, "6"], [4, 11, 8, 1, "7"],
    [2, 12, 5, 3, "0"], [3, 13, 3, 1, "5"],
    [13, 6, 26, 6, "0"], [14, 7, 24, 2, "1"], [14, 7, 24, 1, "3"],
    [14, 9, 24, 2, "2"], [14, 10, 24, 1, "1"], [36, 6, 2, 1, "4"], [36, 9, 2, 1, "4"],
    [13, 11, 10, 2, "0"], [14, 11, 8, 1, "f"],
    [21, 11, 9, 3, "0"], [22, 12, 7, 1, "6"], [22, 13, 7, 1, "5"],
    [13, 6, 3, 6, "b"], [14, 7, 1, 4, "2"], [30, 11, 2, 2, "d"],
  ];

  const crossbow: Block[] = [
    [2, 8, 34, 3, "0"], [3, 9, 32, 1, "6"], [3, 9, 22, 1, "7"], [3, 10, 32, 1, "5"],
    [2, 11, 6, 3, "0"], [3, 12, 4, 1, "5"],
    [28, 2, 4, 14, "0"], [29, 3, 2, 12, "2"], [30, 3, 1, 12, "3"],
    [26, 3, 2, 3, "0"], [26, 14, 2, 3, "0"], [34, 3, 2, 3, "0"], [34, 14, 2, 3, "0"],
    [7, 7, 24, 1, "g"], [6, 6, 3, 3, "0"], [7, 7, 1, 1, "4"], [30, 7, 4, 1, "2"],
    [10, 5, 3, 3, "0"], [11, 6, 1, 1, "4"], [16, 11, 10, 2, "0"], [17, 11, 8, 1, "b"],
    [35, 8, 3, 2, "d"],
  ];
  diagonal(11, 28, 3, -1, 1, (x, y) => crossbow.push([x, y, 1, 1, "g"]));
  diagonal(11, 28, 15, -1, -1, (x, y) => crossbow.push([x, y, 1, 1, "g"]));

  const machete: Block[] = [
    [2, 12, 10, 4, "0"], [3, 13, 8, 2, "b"], [4, 13, 5, 1, "c"],
    [10, 10, 3, 6, "0"], [11, 11, 2, 4, "d"],
    [12, 5, 20, 5, "0"], [13, 6, 18, 3, "2"], [14, 6, 16, 1, "4"],
    [30, 4, 6, 6, "0"], [31, 5, 4, 3, "3"], [34, 7, 3, 4, "0"],
    [14, 8, 17, 1, "3"], [13, 9, 3, 2, "1"],
  ];

  return { crowbar, pistol, hatchet, revolver, shotgun, crossbow, machete };
}

const WEAPON_BLOCKS = buildWeapons();

function PixelWeapon({ blocks }: { blocks: Block[] }) {
  const grid: string[][] = Array.from({ length: GRID_H }, () => Array<string>(GRID_W).fill(" "));
  for (const [x, y, w, h, color] of blocks) {
    for (let py = Math.max(0, y); py < Math.min(GRID_H, y + h); py++) {
      for (let px = Math.max(0, x); px < Math.min(GRID_W, x + w); px++) grid[py][px] = color;
    }
  }
  const rects: ReactNode[] = [];
  for (let y = 0; y < GRID_H; y++) {
    let x = 0;
    while (x < GRID_W) {
      const color = grid[y][x];
      let run = 1;
      while (x + run < GRID_W && grid[y][x + run] === color) run++;
      if (color !== " ") rects.push(<rect key={`${x}-${y}`} x={x * SCALE} y={y * SCALE} width={run * SCALE} height={SCALE} fill={PIXEL_COLORS[color]} />);
      x += run;
    }
  }
  return <g shapeRendering="crispEdges">{rects}</g>;
}

export function WeaponArt({ id, className = "" }: { id: WeaponId; className?: string }) {
  return <svg className={`weapon-sprite ${className}`} viewBox={`0 0 ${GRID_W * SCALE} ${GRID_H * SCALE}`} aria-hidden="true" shapeRendering="crispEdges" style={{ imageRendering: "pixelated" }}>
    <PixelWeapon blocks={WEAPON_BLOCKS[id]} />
  </svg>;
}
