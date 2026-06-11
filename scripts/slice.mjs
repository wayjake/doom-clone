// Slices sprite sheets into individual frames.
// Pipeline: strip background/key colors -> recursive guillotine cuts at empty
// rows/columns -> connected components (with dilation) inside each cell.
// Frames are named <sheet>_r<row>_c<col>.png in reading order.
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const RAW = new URL('../raw_assets/', import.meta.url).pathname
const OUT = new URL('../sliced/', import.meta.url).pathname

const SHEETS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['lostsoul', 'ghoul', 'vassago', 'banshee', 'face', 'hud', 'weapons', 'projectiles', 'pickups', 'menu', 'fonts']

const MIN_SIZE = 5

// Per-sheet colors to strip in addition to the dominant background:
// cell key colors, section header bands, and table grid lines.
const EXTRA_BG = {
  lostsoul: [[0, 255, 255], [84, 109, 142]],
  ghoul: [[0, 255, 255], [0, 128, 128], [27, 89, 153]],
  vassago: [],
  banshee: [[27, 89, 153]],
  face: [[0, 255, 255], [84, 109, 142]],
  hud: [[0, 255, 255], [0, 64, 64], [0, 127, 127], [84, 109, 142]],
  weapons: [[0, 255, 255], [84, 109, 142]],
  projectiles: [[255, 0, 127], [255, 0, 110]],
  pickups: [[0, 255, 255], [0, 128, 128], [0, 0, 0]],
  menu: [[0, 255, 255], [1, 255, 255], [84, 109, 142]],
  fonts: [[0, 255, 255], [84, 109, 142]],
}
const OPTS = {
  default: { gap: 2, dilate: 2 },
  face: { gap: 1, dilate: 1 },
  fonts: { gap: 1, dilate: 1 },
  hud: { gap: 1, dilate: 1 },
  vassago: { gap: 1, dilate: 2, grid: { cols: 8, rows: 10 } },
  weapons: { gap: 2, dilate: 1 },
  menu: { gap: 2, dilate: 1 },
  pickups: { gap: 1, dilate: 1 },
  ghoul: { gap: 1, dilate: 1 },
}

function colorKey(r, g, b, a) {
  return (r << 24) | (g << 16) | (b << 8) | a
}

async function slice(name) {
  const img = sharp(path.join(RAW, name + '.png')).ensureAlpha()
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  const { gap: GAP, dilate: DILATE } = OPTS[name] || OPTS.default

  const counts = new Map()
  for (let i = 0; i < W * H; i++) {
    const k = colorKey(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3])
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  let bg = null,
    bgCount = -1
  for (const [k, c] of counts) {
    if (c > bgCount) {
      bg = k
      bgCount = c
    }
  }
  const bgSet = new Set([bg])
  for (const [r, g, b] of EXTRA_BG[name] || []) bgSet.add(colorKey(r, g, b, 255))

  const isFg = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const a = data[i * 4 + 3]
    const k = colorKey(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], a)
    isFg[i] = a > 8 && !bgSet.has(k) ? 1 : 0
  }

  // --- fixed-grid mode: cell per (row, col), trimmed to content ---
  const grid = (OPTS[name] || {}).grid
  if (grid) {
    const cw = W / grid.cols,
      ch = H / grid.rows
    const outDir = path.join(OUT, name)
    await mkdir(outDir, { recursive: true })
    const manifest = []
    for (let gr = 0; gr < grid.rows; gr++) {
      let col = 0
      for (let gc = 0; gc < grid.cols; gc++) {
        const x0 = Math.round(gc * cw),
          x1 = Math.min(W - 1, Math.round((gc + 1) * cw) - 1)
        const y0 = Math.round(gr * ch),
          y1 = Math.min(H - 1, Math.round((gr + 1) * ch) - 1)
        let minX = W,
          minY = H,
          maxX = -1,
          maxY = -1
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++)
            if (isFg[y * W + x]) {
              if (x < minX) minX = x
              if (x > maxX) maxX = x
              if (y < minY) minY = y
              if (y > maxY) maxY = y
            }
        if (maxX - minX + 1 < MIN_SIZE || maxY - minY + 1 < MIN_SIZE) continue
        const w = maxX - minX + 1,
          h = maxY - minY + 1
        const frame = `${name}_r${gr}_c${col}`
        const cutBuf = Buffer.alloc(w * h * 4)
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const src = ((minY + y) * W + minX + x) * 4
            const dst = (y * w + x) * 4
            const k = colorKey(data[src], data[src + 1], data[src + 2], data[src + 3])
            if (bgSet.has(k) || data[src + 3] <= 8) continue
            cutBuf[dst] = data[src]
            cutBuf[dst + 1] = data[src + 1]
            cutBuf[dst + 2] = data[src + 2]
            cutBuf[dst + 3] = data[src + 3]
          }
        await sharp(cutBuf, { raw: { width: w, height: h, channels: 4 } })
          .png()
          .toFile(path.join(outDir, frame + '.png'))
        manifest.push({ frame, row: gr, col, x: minX, y: minY, w, h })
        col++
      }
    }
    await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1))
    console.log(`${name}: ${manifest.length} frames (grid ${grid.cols}x${grid.rows}) (${W}x${H})`)
    return
  }

  // --- recursive guillotine cuts ---
  const regions = []
  function trim(r) {
    let { x0, y0, x1, y1 } = r
    const colHas = (x) => {
      for (let y = y0; y <= y1; y++) if (isFg[y * W + x]) return true
      return false
    }
    const rowHas = (y) => {
      for (let x = x0; x <= x1; x++) if (isFg[y * W + x]) return true
      return false
    }
    while (x0 <= x1 && !colHas(x0)) x0++
    while (x1 >= x0 && !colHas(x1)) x1--
    while (y0 <= y1 && !rowHas(y0)) y0++
    while (y1 >= y0 && !rowHas(y1)) y1--
    return x0 > x1 || y0 > y1 ? null : { x0, y0, x1, y1 }
  }
  function cut(region, vertical) {
    const r = trim(region)
    if (!r) return
    const { x0, y0, x1, y1 } = r
    // find empty runs along the chosen axis
    const len = vertical ? x1 - x0 + 1 : y1 - y0 + 1
    const empty = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      let has = false
      if (vertical) {
        const x = x0 + i
        for (let y = y0; y <= y1 && !has; y++) if (isFg[y * W + x]) has = true
      } else {
        const y = y0 + i
        for (let x = x0; x <= x1 && !has; x++) if (isFg[y * W + x]) has = true
      }
      empty[i] = has ? 0 : 1
    }
    const cuts = []
    let runStart = -1
    for (let i = 0; i <= len; i++) {
      const e = i < len ? empty[i] : 0
      if (e && runStart < 0) runStart = i
      if (!e && runStart >= 0) {
        if (i - runStart >= GAP) cuts.push((runStart + i - 1) / 2)
        runStart = -1
      }
    }
    if (!cuts.length) {
      if (vertical) cut(r, false, true)
      else regions.push(r)
      return
    }
    let prev = 0
    const bounds = [...cuts.map((c) => Math.round(c)), len - 1]
    for (const b of bounds) {
      const sub = vertical
        ? { x0: x0 + prev, x1: x0 + b, y0, y1 }
        : { y0: y0 + prev, y1: y0 + b, x0, x1 }
      cut(sub, !vertical)
      prev = b + 1
    }
  }
  // run alternating cuts; horizontal first (sheets are organized in rows)
  function cutBoth(region, vertical, depth = 0) {
    if (depth > 12) {
      const t = trim(region)
      if (t) regions.push(t)
      return
    }
    const r = trim(region)
    if (!r) return
    const { x0, y0, x1, y1 } = r
    const len = vertical ? x1 - x0 + 1 : y1 - y0 + 1
    const empty = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      let has = false
      if (vertical) {
        const x = x0 + i
        for (let y = y0; y <= y1 && !has; y++) if (isFg[y * W + x]) has = true
      } else {
        const y = y0 + i
        for (let x = x0; x <= x1 && !has; x++) if (isFg[y * W + x]) has = true
      }
      empty[i] = has ? 0 : 1
    }
    const cuts = []
    let runStart = -1
    for (let i = 0; i <= len; i++) {
      const e = i < len ? empty[i] : 0
      if (e && runStart < 0) runStart = i
      if (!e && runStart >= 0) {
        if (i - runStart >= GAP) cuts.push(Math.round((runStart + i - 1) / 2))
        runStart = -1
      }
    }
    if (!cuts.length) {
      if (depth % 2 === 0 || depth === 1) {
        // try the other axis once before giving up
        cutBothAxis(r, !vertical, depth + 1)
      } else {
        regions.push(r)
      }
      return
    }
    let prev = 0
    for (const b of [...cuts, len - 1]) {
      const sub = vertical
        ? { x0: x0 + prev, x1: x0 + b, y0, y1 }
        : { y0: y0 + prev, y1: y0 + b, x0, x1 }
      cutBoth(sub, !vertical, depth + 1)
      prev = b + 1
    }
  }
  // helper to avoid infinite flip-flop: only recurse if other axis has cuts
  function cutBothAxis(region, vertical, depth) {
    const r = trim(region)
    if (!r) return
    const { x0, y0, x1, y1 } = r
    const len = vertical ? x1 - x0 + 1 : y1 - y0 + 1
    let found = false
    let runStart = -1
    const empty = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      let has = false
      if (vertical) {
        const x = x0 + i
        for (let y = y0; y <= y1 && !has; y++) if (isFg[y * W + x]) has = true
      } else {
        const y = y0 + i
        for (let x = x0; x <= x1 && !has; x++) if (isFg[y * W + x]) has = true
      }
      empty[i] = has ? 0 : 1
    }
    for (let i = 0; i <= len; i++) {
      const e = i < len ? empty[i] : 0
      if (e && runStart < 0) runStart = i
      if (!e && runStart >= 0) {
        if (i - runStart >= GAP) found = true
        runStart = -1
      }
    }
    if (found) cutBoth(r, vertical, depth)
    else regions.push(r)
  }
  cutBoth({ x0: 0, y0: 0, x1: W - 1, y1: H - 1 }, false)

  // --- connected components inside each terminal region ---
  const boxes = []
  for (const reg of regions) {
    const rw = reg.x1 - reg.x0 + 1,
      rh = reg.y1 - reg.y0 + 1
    if (rw < MIN_SIZE || rh < MIN_SIZE) continue
    const mask = new Uint8Array(rw * rh)
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        if (!isFg[(reg.y0 + y) * W + reg.x0 + x]) continue
        const x0 = Math.max(0, x - DILATE),
          x1 = Math.min(rw - 1, x + DILATE)
        const y0 = Math.max(0, y - DILATE),
          y1 = Math.min(rh - 1, y + DILATE)
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) mask[yy * rw + xx] = 1
      }
    }
    const label = new Int32Array(rw * rh).fill(-1)
    const queue = new Int32Array(rw * rh)
    for (let i = 0; i < rw * rh; i++) {
      if (!mask[i] || label[i] >= 0) continue
      let head = 0,
        tail = 0
      queue[tail++] = i
      label[i] = 1
      let minX = rw,
        minY = rh,
        maxX = -1,
        maxY = -1
      while (head < tail) {
        const p = queue[head++]
        const px = p % rw,
          py = (p / rw) | 0
        if (isFg[(reg.y0 + py) * W + reg.x0 + px]) {
          if (px < minX) minX = px
          if (px > maxX) maxX = px
          if (py < minY) minY = py
          if (py > maxY) maxY = py
        }
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx,
              ny = py + dy
            if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue
            const n = ny * rw + nx
            if (mask[n] && label[n] < 0) {
              label[n] = 1
              queue[tail++] = n
            }
          }
        }
      }
      if (maxX >= 0 && maxX - minX + 1 >= MIN_SIZE && maxY - minY + 1 >= MIN_SIZE)
        boxes.push({ minX: reg.x0 + minX, minY: reg.y0 + minY, maxX: reg.x0 + maxX, maxY: reg.y0 + maxY })
    }
  }

  // Group into rows: sort by center-y, new row when no vertical overlap with the row so far
  boxes.sort((a, b) => (a.minY + a.maxY) / 2 - (b.minY + b.maxY) / 2)
  const rows = []
  for (const b of boxes) {
    const cy = (b.minY + b.maxY) / 2
    const row = rows.length ? rows[rows.length - 1] : null
    if (row && cy <= row.maxY + 2) {
      row.items.push(b)
      row.maxY = Math.max(row.maxY, b.maxY)
    } else {
      rows.push({ items: [b], maxY: b.maxY })
    }
  }

  const outDir = path.join(OUT, name)
  await mkdir(outDir, { recursive: true })
  const manifest = []
  for (let r = 0; r < rows.length; r++) {
    rows[r].items.sort((a, b) => a.minX - b.minX)
    for (let c = 0; c < rows[r].items.length; c++) {
      const b = rows[r].items[c]
      const w = b.maxX - b.minX + 1,
        h = b.maxY - b.minY + 1
      const frame = `${name}_r${r}_c${c}`
      const cutBuf = Buffer.alloc(w * h * 4)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const src = ((b.minY + y) * W + b.minX + x) * 4
          const dst = (y * w + x) * 4
          const k = colorKey(data[src], data[src + 1], data[src + 2], data[src + 3])
          if (bgSet.has(k) || data[src + 3] <= 8) continue
          cutBuf[dst] = data[src]
          cutBuf[dst + 1] = data[src + 1]
          cutBuf[dst + 2] = data[src + 2]
          cutBuf[dst + 3] = data[src + 3]
        }
      }
      await sharp(cutBuf, { raw: { width: w, height: h, channels: 4 } })
        .png()
        .toFile(path.join(outDir, frame + '.png'))
      manifest.push({ frame, row: r, col: c, x: b.minX, y: b.minY, w, h })
    }
  }
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1))
  console.log(`${name}: ${manifest.length} frames in ${rows.length} rows (${W}x${H})`)
}

for (const s of SHEETS) await slice(s)
