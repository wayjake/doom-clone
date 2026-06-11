// Builds a labeled contact sheet per sliced directory for visual frame mapping.
import sharp from 'sharp'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const OUT = new URL('../sliced/', import.meta.url).pathname
const dirs = process.argv.slice(2)

for (const dir of dirs) {
  const manifest = JSON.parse(await readFile(path.join(OUT, dir, 'manifest.json'), 'utf8'))
  const cols = 8
  const cellW = 110, cellH = 110, label = 16
  const rows = Math.ceil(manifest.length / cols)
  const W = cols * cellW, H = rows * (cellH + label)
  const composites = []
  for (let i = 0; i < manifest.length; i++) {
    const m = manifest[i]
    const cx = (i % cols) * cellW, cy = Math.floor(i / cols) * (cellH + label)
    const img = sharp(path.join(OUT, dir, m.frame + '.png'))
    const scale = Math.min(1, Math.min((cellW - 4) / m.w, (cellH - 4) / m.h))
    const w = Math.max(1, Math.round(m.w * scale)), h = Math.max(1, Math.round(m.h * scale))
    const buf = await img.resize(w, h, { kernel: 'nearest' }).png().toBuffer()
    composites.push({ input: buf, left: cx + 2, top: cy + 2 })
    const tag = `r${m.row}c${m.col} ${m.w}x${m.h}`
    const svg = `<svg width="${cellW}" height="${label}"><text x="2" y="12" font-size="11" font-family="monospace" fill="white">${tag}</text></svg>`
    composites.push({ input: Buffer.from(svg), left: cx, top: cy + cellH })
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 40, g: 40, b: 60, alpha: 1 } } })
    .composite(composites)
    .png()
    .toFile(path.join(OUT, dir + '_contact.png'))
  console.log(dir, manifest.length, 'frames')
}
