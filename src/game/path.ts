export function astar(
  w: number,
  h: number,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  walkable: (x: number, y: number) => boolean,
): { x: number; y: number }[] | null {
  if (sx === gx && sy === gy) return [];
  if (!walkable(gx, gy)) return null;
  const key = (x: number, y: number) => y * w + x;
  const open: { x: number; y: number; g: number; f: number }[] = [{ x: sx, y: sy, g: 0, f: 0 }];
  const gScore = new Map<number, number>();
  gScore.set(key(sx, sy), 0);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  let nodes = 0;
  while (open.length && nodes < 2200) {
    nodes++;
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    if (cur.x === gx && cur.y === gy) {
      const path: { x: number; y: number }[] = [];
      let k = ck;
      let x = cur.x;
      let y = cur.y;
      while (!(x === sx && y === sy)) {
        path.push({ x, y });
        const prev = came.get(k);
        if (prev === undefined) break;
        x = prev % w;
        y = (prev / w) | 0;
        k = prev;
      }
      path.reverse();
      return path;
    }
    closed.add(ck);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!walkable(nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = cur.g + 1;
      if (ng < (gScore.get(nk) ?? 1e9)) {
        gScore.set(nk, ng);
        came.set(nk, ck);
        open.push({ x: nx, y: ny, g: ng, f: ng + Math.abs(nx - gx) + Math.abs(ny - gy) });
      }
    }
  }
  return null;
}
