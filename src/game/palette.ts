export const TILE = 16;
export const MAP_W = 56;
export const MAP_H = 88;
export const FLOOR_COUNT = 11;

export const Tile = {
  Wall: 0,
  Floor: 1,
  Door: 2,
  DoorOpen: 3,
  StairsUp: 4,
  StairsDown: 5,
  Window: 6,
  Rubble: 7,
  Puddle: 8,
  Sky: 9,
} as const;

export type TileId = (typeof Tile)[keyof typeof Tile];

export const COL = {
  ink: "#100e0c",
  void: "#07080c",
  night: "#1a2848",
  nightDeep: "#12182a",
  sky: "#3a5070",
  skyHorizon: "#e8a060",
  concrete: "#8c8174",
  concreteDark: "#5c564e",
  concreteLight: "#c4b49a",
  seam: "#3a342e",
  plaster: "#cbb89a",
  wallpaper: "#d4c4a8",
  wallpaperInk: "#a89078",
  peel: "#6a6560",
  wainscot: "#5a8a84",
  wainscotDark: "#3e6662",
  teal: "#3e8a86",
  rust: "#c4622e",
  rustDark: "#8a3c22",
  mold: "#5a7a48",
  moldLight: "#7d9a5c",
  wood: "#6b4a32",
  woodDark: "#3e2a1c",
  woodLight: "#8a6240",
  door: "#3a2c28",
  doorLight: "#5c4038",
  fluor: "#e8e070",
  fluorDim: "#9a9440",
  blood: "#8a2828",
  bloodBright: "#c43830",
  jacket: "#d4a84a",
  jacketDark: "#8f7028",
  jacketDirt: "#6a5428",
  cap: "#b43330",
  capLight: "#e05048",
  capDark: "#7a2020",
  skin: "#e4b898",
  skinShade: "#c48b6a",
  pants: "#5c4638",
  pantsDark: "#3a2c24",
  shoe: "#2a2420",
  shirt: "#3a3a3e",
  zombie: "#7d8c68",
  zombieDark: "#546048",
  zombieLight: "#9aaa78",
  zShirt: "#e4dcc8",
  zShirtDark: "#b0a898",
  eye: "#e03030",
  white: "#f2efe6",
  metal: "#6a7078",
  metalDark: "#3a4048",
  puddle: "#3a5878",
  puddleLight: "#7aa0c0",
  gun: "#2a2c30",
  brass: "#c9a24a",
} as const;

export type Theme = "basement" | "lobby" | "flat" | "decay" | "roof";

export interface FloorMeta {
  theme: Theme;
  name: string;
  sub: string;
  decay: number;
}

export const FLOOR_META: FloorMeta[] = [
  { theme: "basement", name: "PIWNICA", sub: "rury, wilgoć, ciemność", decay: 0 },
  { theme: "lobby", name: "PARTER", sub: "hol i skrzynki na listy", decay: 0 },
  { theme: "flat", name: "PIĘTRO I", sub: "świeżo opuszczone mieszkania", decay: 0.06 },
  { theme: "flat", name: "PIĘTRO II", sub: "splądrowane pokoje", decay: 0.2 },
  { theme: "flat", name: "PIĘTRO III", sub: "ktoś tu jeszcze był", decay: 0.34 },
  { theme: "flat", name: "PIĘTRO IV", sub: "rozbite szyby, papier na podłogach", decay: 0.48 },
  { theme: "decay", name: "PIĘTRO V", sub: "zalane piętro", decay: 0.6 },
  { theme: "decay", name: "PIĘTRO VI", sub: "spalone mieszkania", decay: 0.72 },
  { theme: "decay", name: "PIĘTRO VII", sub: "grzyb pożera ściany", decay: 0.86 },
  { theme: "decay", name: "PIĘTRO VIII", sub: "ruina tuż przed dachem", decay: 1 },
  { theme: "roof", name: "DACH", sub: "Wielki czeka przy flarze", decay: 0 },
];

export const NOTES = [
  "Nie otwieraj windy. Coś tam oddycha.",
  "Klucz do schodów: szafka w głównym korytarzu. Nie zapomnij go zabrać.",
  "Światło ich ściąga. Gaś latarkę przy drzwiach.",
  "Słyszałam bieg piętro wyżej. To nie były dzieci.",
  "Flara ekipy leży na dachu, przy czerwonych skrzynkach.",
  "Jeśli czytasz: nie krzycz. Słyszą przez beton.",
  "Nowak z czternastki zaryglował łazienkę. Już nie puka.",
  "Amunicji jest mało. Licz strzały.",
  "Łom jest cichy. Strzał budzi całe piętro.",
  "Na dachu widać świt. Jeśli dotrzesz — odpal flarę.",
];
