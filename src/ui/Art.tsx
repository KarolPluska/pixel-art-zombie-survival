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
  return <svg className={`ui-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="miter" strokeLinecap="square">
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

export function WeaponArt({ id, className = "" }: { id: WeaponId; className?: string }) {
  const arts: Record<WeaponId, ReactNode> = {
    crowbar: <g>
      <path fill="#28201e" d="M5 28h6v-3h8v-3h8v-3h8v-3h8v-3h8v-3h8V7h8V5h8v2h3v8h-3v4h-6v-3h-2v-4h-6v3h-8v3h-8v3h-8v3h-8v3h-8v3h-8v3H5z" />
      <path fill="#a2573c" d="M7 28h6v-3h8v-3h8v-3h8v-3h8v-3h8v-3h9V8h6v3h-6v3h-8v3h-8v3h-8v3h-8v3h-8v3h-8v3H7z" />
      <path fill="#ce8a5d" d="M13 25h8v1h-8zm16-6h8v1h-8zm16-6h8v1h-8zm18-6h9v2h-9z" />
      <path fill="#939e9e" d="M5 29h8v2H9v2H5zM67 6h7v2h3v7h-3v2h-4v-3h3v-4h-6z" /><path fill="#d4d7c9" d="M68 6h6v2h-6zm5 8h3v2h-3z" />
    </g>,
    pistol: <g>
      <path fill="#161b1e" d="M13 7h5V4h4v3h38V4h4v3h4v9H54v6H39l-3 10H20v-5h3v-5h2v-6H13z" />
      <path fill="#909a9a" d="M14 8h52v5H14z" /><path fill="#c7cdc4" d="M18 7h47v2H18zM60 5h3v2h-3z" />
      <path fill="#5e6b71" d="M15 11h50v3H15z" /><path fill="#333e44" d="M15 14h43v3H34l-4 13h-9l6-16z" />
      <path fill="#57564d" d="M27 17h9v4h-2v5h-2v5H22v-3h2v-6h3z" />
      <path fill="#323637" d="M26 22h8v2h-8zm-2 5h8v2h-8zM19 7h2v5h-2zm4 0h2v5h-2zm4 0h2v5h-2z" />
      <path fill="#7a8687" d="M37 16h2v5h10v-5h3v7H36z" /><path fill="#aeb5aa" d="M41 16h3v4h-2z" />
    </g>,
    hatchet: <g><path fill="#543a27" d="M16 29 51 4l5 6-35 25z"/><path fill="#b48c61" d="m17 29 34-24 2 3-34 24z"/>
      <path fill="#818e91" d="m43 8 9-7 6 5 9 1 4 5-4 7-7 4-4-6-8-4z"/><path fill="#c6cec6" d="m69 9 2 3-4 7-7 4-2-3 6-4z"/><path fill="#4b585b" d="m44 8 7-5 6 6-6 5z"/>
    </g>,
    revolver: <g><path fill="#829092" d="M12 9h27V7h29v6H43v6H25l-6 12H9l5-14H9V9z"/><path fill="#c4cbc1" d="M39 7h27v2H39zm23-2h4v2h-4z"/>
      <path fill="#51595b" d="M24 9h16v10H24zM40 11h27v3H40z"/><path fill="#b0b9b6" d="M26 9h12v2H26zm0 5h12v2H26z"/><path fill="#936c4c" d="M16 17h10v4h-3v5h-3v6H8v-5h4v-6h4z"/><path fill="#686e6b" d="M27 18h2v5h9v-5h2v7H26z"/>
    </g>,
    shotgun: <g><path fill="#674933" d="m2 23 19-9h10v8H19L4 31H2z"/><path fill="#ac8358" d="m3 23 17-8h8v3H18L3 27z"/>
      <path fill="#57646a" d="M23 12h53v5H41v3H23z"/><path fill="#a5b2b0" d="M29 10h47v3H29z"/><path fill="#c8d0c3" d="M35 10h40v1H35z"/>
      <path fill="#967047" d="M39 16h20v5H39z"/><path fill="#413a30" d="M42 16h2v4h-2zm5 0h2v4h-2zm5 0h2v4h-2zM24 20h2v4h8v-4h2v6H24z"/>
    </g>,
    crossbow: <g><path fill="#8d6c46" d="m7 25 47-13 3 5-47 15z"/><path fill="#c2a073" d="m14 24 40-12 1 2-40 12z"/>
      <path fill="#8d9c9a" d="m41 2 8 2 8 8 7 12 1 10-4-3-1-8-7-10-8-8z"/><path fill="none" stroke="#b8b5a1" strokeWidth="1" d="m43 3-13 17 33 13"/><path fill="#343e3e" d="m30 16 26-7 1 3-26 7z"/><path fill="#c3ceca" d="m31 17 32-9-3 4z"/>
    </g>,
  };
  return <svg className={`weapon-sprite ${className}`} viewBox="0 0 80 36" aria-hidden="true" shapeRendering="crispEdges">{arts[id]}</svg>;
}