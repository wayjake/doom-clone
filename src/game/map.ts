// Level layout. One char per 4m x 4m cell.
//   # wall (main)   B brick   C computer   c computer 2   R rock
//   D door          . floor   N nukage     X exit pad     O open-air (sky)
//   S player spawn (facing +z reading direction below)
export const CELL = 4
export const WALL_H = 4

export const MAP_ROWS = [
  '########################',
  '#......#####...........#',
  '#.S....D...#.NNNN....C.#',
  '#......#...#.NNNN......#',
  '#......#...#.NNNN......#',
  '###D####...#........####',
  '#..........#...####....#',
  '#..####....#...#..#....#',
  '#..#..B....#...####....#',
  '#..#..B................#',
  '#..####....##D#####D####',
  '#..........#......#...R#',
  '######D#####......#...R#',
  '#....#...#c#......#...R#',
  '#....#...#.#......#...R#',
  '#.BB.#...#.#..##..#...R#',
  '#.BB.....D....##......R#',
  '#....#...#.#..##..#RRRR#',
  '#....#...#.#......#ROOR#',
  '######...#c#......#OOOR#',
  '#........#.########OOOR#',
  '#...####.#.D......DOOXR#',
  '#........#.#......#RRRR#',
  '########################',
] as const

export const H = MAP_ROWS.length
export const W = MAP_ROWS[0].length

export function tile(cx: number, cz: number): string {
  if (cx < 0 || cz < 0 || cx >= W || cz >= H) return '#'
  return MAP_ROWS[cz][cx]
}

export const WALL_TILES = new Set(['#', 'B', 'C', 'c', 'R'])

export function isWall(cx: number, cz: number): boolean {
  return WALL_TILES.has(tile(cx, cz))
}

export function cellOf(x: number, z: number): [number, number] {
  return [Math.floor(x / CELL), Math.floor(z / CELL)]
}

export function findSpawn(): { x: number; z: number } {
  for (let z = 0; z < H; z++)
    for (let x = 0; x < W; x++)
      if (MAP_ROWS[z][x] === 'S') return { x: (x + 0.5) * CELL, z: (z + 0.5) * CELL }
  return { x: CELL * 2, z: CELL * 2 }
}

// grid DDA line of sight: true if no wall (closed doors handled by caller via blockers)
export function lineOfSight(
  x0: number, z0: number, x1: number, z1: number,
  isBlocked: (cx: number, cz: number) => boolean,
): boolean {
  const dx = x1 - x0, dz = z1 - z0
  const dist = Math.hypot(dx, dz)
  if (dist < 1e-6) return true
  const steps = Math.ceil((dist / CELL) * 3)
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const [cx, cz] = cellOf(x0 + dx * t, z0 + dz * t)
    if (isBlocked(cx, cz)) return false
  }
  return true
}

// enemy spawns: kind, cell coords
export const ENEMY_SPAWNS: { kind: 'lostsoul' | 'ghoul' | 'vassago' | 'banshee'; cx: number; cz: number }[] = [
  { kind: 'lostsoul', cx: 9, cz: 3 },
  { kind: 'lostsoul', cx: 4, cz: 8 },
  { kind: 'lostsoul', cx: 14, cz: 14 },
  { kind: 'lostsoul', cx: 2, cz: 20 },
  { kind: 'ghoul', cx: 18, cz: 2 },
  { kind: 'ghoul', cx: 15, cz: 7 },
  { kind: 'ghoul', cx: 13, cz: 16 },
  { kind: 'ghoul', cx: 7, cz: 21 },
  { kind: 'vassago', cx: 20, cz: 4 },
  { kind: 'vassago', cx: 15, cz: 13 },
  { kind: 'vassago', cx: 12, cz: 21 },
  { kind: 'banshee', cx: 6, cz: 16 },
  { kind: 'banshee', cx: 21, cz: 12 },
]

export const PICKUP_SPAWNS: {
  kind: 'stim' | 'medikit' | 'potion' | 'helmet' | 'armor_green' | 'armor_blue' | 'soul' | 'clip' | 'shells' | 'shotgun';
  cx: number; cz: number;
}[] = [
  { kind: 'clip', cx: 3, cz: 4 },
  { kind: 'potion', cx: 1, cz: 1 },
  { kind: 'potion', cx: 2, cz: 1 },
  { kind: 'stim', cx: 10, cz: 2 },
  { kind: 'shotgun', cx: 9, cz: 9 },
  { kind: 'shells', cx: 9, cz: 8 },
  { kind: 'shells', cx: 5, cz: 9 },
  { kind: 'helmet', cx: 1, cz: 11 },
  { kind: 'medikit', cx: 16, cz: 6 },
  { kind: 'armor_green', cx: 2, cz: 15 },
  { kind: 'clip', cx: 11, cz: 13 },
  { kind: 'clip', cx: 11, cz: 19 },
  { kind: 'shells', cx: 13, cz: 13 },
  { kind: 'medikit', cx: 16, cz: 21 },
  { kind: 'shells', cx: 16, cz: 16 },
  { kind: 'soul', cx: 12, cz: 15 },
  { kind: 'armor_blue', cx: 21, cz: 16 },
  { kind: 'potion', cx: 19, cz: 11 },
  { kind: 'potion', cx: 19, cz: 12 },
  { kind: 'medikit', cx: 1, cz: 22 },
]
