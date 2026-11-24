import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const baseline = JSON.parse(await readFile("reports/baseline-maps.json", "utf8"));
const js = await build({ entryPoints: ["src/game/generate.ts"], platform: "node", format: "esm", bundle: true, write: false });
const { generateFloor, validateFloor, diagnoseVariedFloor, LAYOUT_FAMILIES } = await import(`data:text/javascript;base64,${Buffer.from(js.outputFiles[0].contents).toString("base64")}`);
const walkable = new Set([1, 2, 3, 4, 5, 7, 8]);

function metrics(f) {
  const tiles = typeof f.tiles === "string" ? Uint8Array.from(f.tiles, Number) : f.tiles;
  const w = 56, h = 88;
  const start = { x: Math.floor((f.start?.x ?? f.playerStart.x) / 16), y: Math.floor((f.start?.y ?? f.playerStart.y) / 16) };
  const up = f.up ?? f.stairsUp;
  const rooms = typeof f.tiles === "string" ? f.rooms : f.rooms.map((r) => ({ ...r, zone: f.roomZones[r.id] }));
  const corridor = new Uint8Array(w * h);
  for (const r of rooms.filter((r) => r.zone === "KORYTARZ")) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) corridor[y * w + x] = 1;
  }
  // A 4x4 coarse skeleton measures corridor topology separately from individual furniture/rooms.
  const cw = 14, ch = 22;
  const coarse = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    let count = 0;
    for (let y = cy * 4; y < cy * 4 + 4; y++) for (let x = cx * 4; x < cx * 4 + 4; x++) count += corridor[y * w + x];
    coarse[cy * cw + cx] = count >= 3 ? 1 : 0;
  }
  const degree = (x, y) => [[1,0],[-1,0],[0,1],[0,-1]].reduce((n,[dx,dy]) => n + (coarse[(y+dy)*cw + x+dx] ?? 0),0);
  let junctions = 0, turns = 0, longest = 0, corridorCells = 0;
  for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) if (coarse[y * cw + x]) {
    corridorCells++;
    const d = degree(x, y);
    if (d >= 3) junctions++;
    if (d === 2 && (coarse[y*cw+x-1] || coarse[y*cw+x+1]) && (coarse[(y-1)*cw+x] || coarse[(y+1)*cw+x])) turns++;
    for (const [dx,dy] of [[1,0],[0,1]]) {
      let n=0, xx=x, yy=y;
      while (xx < cw && yy < ch && coarse[yy*cw+xx]) {n++;xx+=dx;yy+=dy;}
      longest=Math.max(longest,n);
    }
  }
  // Translation/reflection/half-turn equivalent masks share one canonical signature.
  const masks = [0,1,2,3].map(t => {
    const arr=[];
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
      const ax=t&1?cw-1-x:x, ay=t&2?ch-1-y:y;
      arr.push(coarse[ay*cw+ax]);
    }
    return arr.join("");
  });
  const blocked = new Uint8Array(w*h);
  if (f.props) for (const p of f.props) if(p.solid) for(let y=p.y;y<p.y+p.h;y++)for(let x=p.x;x<p.x+p.w;x++) blocked[y*w+x]=1;
  if (f.props) for (const d of f.doors) if(d.sealed) blocked[d.y*w+d.x]=1;
  const q=[start.y*w+start.x], distance=new Int32Array(w*h).fill(-1);
  distance[q[0]]=0;
  for(let head=0;head<q.length;head++){
    const p=q[head],x=p%w,y=Math.floor(p/w);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy,ni=ny*w+nx;
      if(nx<0||nx>=w||ny<0||ny>=h||distance[ni]>=0||blocked[ni]||!walkable.has(tiles[ni]))continue;
      distance[ni]=distance[p]+1;q.push(ni);
    }
  }
  const regular=rooms.filter(r=>r.zone!=="KORYTARZ"&&r.zone!=="KLATKA SCHODOWA"&&r.w>=3&&r.h>=3);
  const startRoom=rooms.find(r=>start.x>=r.x&&start.x<r.x+r.w&&start.y>=r.y&&start.y<r.y+r.h);
  return { start, up, startZone:startRoom?.zone??"PRZEJŚCIE", path: up?distance[up.y*w+up.x]:-1,
    corridorCells, junctions, turns, longest, corridorSignature:masks.sort()[0],
    rooms:regular.length, roomAreas:regular.map(r=>r.w*r.h), roomRatios:regular.map(r=>+(r.w/r.h).toFixed(1)),
    accessible:q.length, occupied:tiles.filter(t=>walkable.has(t)).length };
}

const old = baseline.map((f) => ({ seed:f.seed, family:"STARY", layout:f.layout, ...metrics(f), tiles:f.tiles, doors:f.doors }));
const current = [];
const extra=[];
const rejectionReasons={};
let rejected=0;
for(let n=0;n<32;n++){
  const seed=baseline[n].seed;
  const f=generateFloor(0,seed,seed);
  const attempts=Math.max(0,Math.min(36,Math.round(((f.seed-seed)>>>0)/997)));
  rejected+=attempts;
  for(let a=0;a<attempts;a++){
    const reason=diagnoseVariedFloor(0,(seed+a*997)>>>0,seed);
    rejectionReasons[reason]=(rejectionReasons[reason]??0)+1;
  }
  current.push({seed,layout:f.seed,family:LAYOUT_FAMILIES.find(v=>f.sub.endsWith(v))??"AWARYJNY",valid:validateFloor(f),...metrics(f),tiles:Array.from(f.tiles).join(""),doors:f.doors.map(d=>({x:d.x,y:d.y,route:d.route,open:d.open})),
    alternative:f.breaches.map(b=>({x:b.x,y:b.y})), shafts:f.vertical? [f.vertical.elevator?.door,f.vertical.stairsB?.door,f.vertical.service?.door].filter(Boolean):[]});
  if(n<6)for(let floor=1;floor<=3;floor++){
    const adjacent=generateFloor(floor,(seed+floor*131)>>>0,seed);
    extra.push({seed,floor,family:LAYOUT_FAMILIES.find(v=>adjacent.sub.endsWith(v))??"AWARYJNY",valid:validateFloor(adjacent),...metrics(adjacent)});
  }
}
const avg = (arr,key) => +(arr.reduce((n,f)=>n+f[key],0)/arr.length).toFixed(1);
const summary={seeds:32, baseline:{uniqueStarts:new Set(old.map(x=>`${x.start.x},${x.start.y}`)).size,uniqueExits:new Set(old.map(x=>`${x.up.x},${x.up.y}`)).size,uniqueCorridorSignatures:new Set(old.map(x=>x.corridorSignature)).size,fallbacks:old.filter(x=>x.rooms<10).length,avgPath:avg(old,"path"),avgJunctions:avg(old,"junctions"),avgTurns:avg(old,"turns"),avgCorridorCells:avg(old,"corridorCells")},current:{uniqueStarts:new Set(current.map(x=>`${x.start.x},${x.start.y}`)).size,uniqueExits:new Set(current.map(x=>`${x.up.x},${x.up.y}`)).size,uniqueCorridorSignatures:new Set(current.map(x=>x.corridorSignature)).size,fallbacks:current.filter(x=>x.family==="AWARYJNY").length,rejected,rejectionReasons,avgPath:avg(current,"path"),avgJunctions:avg(current,"junctions"),avgTurns:avg(current,"turns"),avgCorridorCells:avg(current,"corridorCells"),families:Object.fromEntries(LAYOUT_FAMILIES.map(f=>[f,current.filter(x=>x.family===f).length]))}};
await mkdir("reports",{recursive:true});
await mkdir("public",{recursive:true});
await writeFile("reports/layout-metrics.json",JSON.stringify({summary,old:old.map(({tiles,...f})=>f),current:current.map(({tiles,...f})=>f),adjacent:extra},null,2));

function mapSvg(f, fresh) {
  const colors={0:"#1d272a",1:"#69726a",2:"#bb8c5b",3:"#aa9470",4:"#e9c070",5:"#73b3a9",6:"#5581a0",7:"#8c705c",8:"#53768b",9:"#0b141c",10:"#151c21"};
  const rects=[];
  for(let y=0;y<88;y++)for(let x=0;x<56;x++){
    const tile=Number(f.tiles[y*56+x]);
    if(tile===0||tile===9)continue;
    rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[tile]??colors[0]}"/>`);
  }
  for(const d of f.doors.filter(d=>!d.route))rects.push(`<rect x="${d.x}" y="${d.y}" width="1" height="1" fill="#efd199"/>`);
  if(fresh)for(const a of f.alternative.slice(0,50))rects.push(`<rect x="${a.x}" y="${a.y}" width="1" height="1" fill="#86c9a1"/>`);
  if(fresh)for(const [i,s] of f.shafts.entries())rects.push(`<rect x="${s.x-1}" y="${s.y-1}" width="3" height="3" fill="none" stroke="${["#efb46a","#7bbdd0","#aa90c7"][i]}" stroke-width=".6"/>`);
  rects.push(`<circle cx="${f.start.x+.5}" cy="${f.start.y+.5}" r="2" fill="#e5f7ed" stroke="#121918" stroke-width=".5"/>`);
  rects.push(`<circle cx="${f.up.x+.5}" cy="${f.up.y+.5}" r="2" fill="#f5c66e" stroke="#121918" stroke-width=".5"/>`);
  return `<svg viewBox="0 0 56 88" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-label="Pełny rzut piętra, start i cel"><rect width="56" height="88" fill="#111b20"/>${rects.join("")}</svg>`;
}
const cards=current.map((f,i)=>`<article><header><b>#${String(i+1).padStart(2,"0")}</b> <span>seed ${f.seed}</span><em>${f.family}</em></header><div class="pair"><figure>${mapSvg(old[i],false)}<figcaption>PRZED · ${old[i].startZone}</figcaption></figure><figure>${mapSvg(f,true)}<figcaption>PO · ${f.startZone}</figcaption></figure></div><p>Trasa ${old[i].path} → ${f.path} pól · węzły ${old[i].junctions} → ${f.junctions}</p></article>`).join("");
const html=`<!doctype html><html lang="pl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>BLOK 7 / Audyt układów</title><style>*{box-sizing:border-box}body{margin:0;background:#0b1116;color:#e8e7da;font:13px/1.5 monospace}main{max-width:1560px;margin:auto;padding:32px 24px}h1{font:bold clamp(32px,5vw,64px) monospace;letter-spacing:-3px;margin:0;color:#e8c584}h2{font-size:16px;color:#f2c888}header{display:flex;gap:12px;align-items:center;flex-wrap:wrap}header em{font-style:normal;color:#9cc9ae;margin-left:auto}.intro{color:#b2c1bb;max-width:90ch}.stats{display:flex;gap:24px;flex-wrap:wrap;border-block:1px solid #50605e;padding:12px 0;margin:24px 0}.stats b{color:#e8c584}.legend{display:flex;gap:15px;flex-wrap:wrap;color:#b8c5bd;margin:20px 0}.legend span:before{content:'■';color:var(--c);margin-right:6px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:20px}article{padding:12px;border:1px solid #3d4e4f;background:#141e22}article header{font-size:11px}article p{font-size:10px;color:#8ca09b;margin:8px 0 0}.pair{display:flex;gap:6px;margin-top:10px}figure{margin:0;flex:1}svg{width:100%;height:auto;border:1px solid #2c3939;image-rendering:pixelated}figcaption{font-size:9px;color:#abbcb4;padding-top:3px}a{color:#efc888}</style></head><body><main><h1>BLOK 7 / RZUTY</h1><p class="intro">32 identyczne ziarna, identyczna skala mapy 56×88. Po lewej stary generator, po prawej aktualny. Pełne rzuty służą audytowi; w grze mapa nadal odkrywa się stopniowo.</p><div class="stats"><div>STARTY <b>${summary.baseline.uniqueStarts} → ${summary.current.uniqueStarts}</b></div><div>TOPOLOGIE KORYTARZY <b>${summary.baseline.uniqueCorridorSignatures} → ${summary.current.uniqueCorridorSignatures}</b></div><div>FALLBACK <b>${summary.baseline.fallbacks} → ${summary.current.fallbacks}</b></div><div>RODZINY <b>${Object.values(summary.current.families).filter(Boolean).length}</b></div></div><div class="legend"><span style="--c:#e5f7ed">start</span><span style="--c:#f5c66e">wyjście</span><span style="--c:#efb46a">winda</span><span style="--c:#7bbdd0">klatka B</span><span style="--c:#aa90c7">pion</span><span style="--c:#86c9a1">obejście</span></div><h2>PORÓWNANIE / 32 SEEDY</h2><div class="grid">${cards}</div><p><a href="/">WRÓĆ DO GRY</a></p></main></body></html>`;
await writeFile("public/layout-comparison.html",html);
console.log(JSON.stringify(summary,null,2));