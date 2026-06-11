// Assembles final game assets into public/ with semantic names.
// Sources: sliced/<sheet>/ frames (picked via manifest coordinates),
// hand-cropped regions of raw sheets, texture zips, and sound wavs.
import sharp from 'sharp'
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = new URL('../', import.meta.url).pathname
const RAW = path.join(ROOT, 'raw_assets')
const SLICED = path.join(ROOT, 'sliced')
const PUB = path.join(ROOT, 'public')

const manifest = async (sheet) => JSON.parse(await readFile(path.join(SLICED, sheet, 'manifest.json'), 'utf8'))
const picks = [] // for the verification montage

async function put(sheet, frame, dest) {
  const src = path.join(SLICED, sheet, frame + '.png')
  const out = path.join(PUB, dest)
  await mkdir(path.dirname(out), { recursive: true })
  await copyFile(src, out)
  picks.push({ dest, src: out })
}

// pick frames from a manifest inside a y-band, sorted by x
function band(man, y0, y1, x0 = -1, x1 = 1e9) {
  return man
    .filter((f) => f.y >= y0 && f.y <= y1 && f.x >= x0 && f.x <= x1)
    .sort((a, b) => a.x - b.x)
}

// crop a window from a raw sheet, strip bg colors, trim to content
async function crop(rawName, win, bgColors, dest, { pad = 0 } = {}) {
  const { data, info } = await sharp(path.join(RAW, rawName + '.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const W = info.width
  const bgSet = new Set(bgColors.map(([r, g, b]) => (r << 24) | (g << 16) | (b << 8) | 255))
  const isFg = (x, y) => {
    const i = (y * W + x) * 4
    const a = data[i + 3]
    if (a <= 8) return false
    return !bgSet.has((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | a)
  }
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
  for (let y = win.y; y < win.y + win.h; y++)
    for (let x = win.x; x < win.x + win.w; x++)
      if (isFg(x, y)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
  if (maxX < 0) throw new Error('empty crop ' + dest)
  minX -= pad; minY -= pad; maxX += pad; maxY += pad
  const w = maxX - minX + 1, h = maxY - minY + 1
  const buf = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = minX + x, sy = minY + y
      if (sx < 0 || sy < 0 || sx >= W || sy >= info.height) continue
      if (!isFg(sx, sy)) continue
      const s = (sy * W + sx) * 4, d = (y * w + x) * 4
      buf[d] = data[s]; buf[d + 1] = data[s + 1]; buf[d + 2] = data[s + 2]; buf[d + 3] = data[s + 3]
    }
  const out = path.join(PUB, dest)
  await mkdir(path.dirname(out), { recursive: true })
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toFile(out)
  picks.push({ dest, src: out })
  return { w, h }
}

// ---------- enemies ----------
// Lost Soul: rows at y 33 (float A), 120 (float B), 207 (attack A), 284 (attack B),
// 361 (pain band), 448 (death: 3 burn + explosion + blast + ring)
{
  const m = await manifest('lostsoul')
  const floatA = band(m, 25, 85, 0, 480)
  const floatB = band(m, 110, 180)
  const atkA = band(m, 195, 265)
  const atkB = band(m, 270, 345)
  const pain = band(m, 350, 425)
  const death = band(m, 435, 530)
  await put('lostsoul', floatA[0].frame, 'sprites/lostsoul/fly1.png')
  await put('lostsoul', floatB[0].frame, 'sprites/lostsoul/fly2.png')
  await put('lostsoul', atkA[0].frame, 'sprites/lostsoul/attack1.png')
  await put('lostsoul', atkB[0].frame, 'sprites/lostsoul/attack2.png')
  await put('lostsoul', pain[0].frame, 'sprites/lostsoul/pain.png')
  for (let i = 0; i < Math.min(6, death.length); i++)
    await put('lostsoul', death[i].frame, `sprites/lostsoul/die${i + 1}.png`)
}

// Ghoul: front rotation row is the first body row; cols 0-2 move, 3-6 attack, 7-10 pain.
// Death row at the bottom.
{
  const m = await manifest('ghoul')
  const front = band(m, 10, 62)
  const death = m.filter((f) => f.frame.startsWith('ghoul_r8') && f.h >= 17).sort((a, b) => a.x - b.x)
  await put('ghoul', front[0].frame, 'sprites/ghoul/fly1.png')
  await put('ghoul', front[1].frame, 'sprites/ghoul/fly2.png')
  await put('ghoul', front[2].frame, 'sprites/ghoul/fly3.png')
  await put('ghoul', front[3].frame, 'sprites/ghoul/attack1.png')
  await put('ghoul', front[4].frame, 'sprites/ghoul/attack2.png')
  await put('ghoul', front[5].frame, 'sprites/ghoul/attack3.png')
  await put('ghoul', front[6].frame, 'sprites/ghoul/attack4.png')
  await put('ghoul', front[7].frame, 'sprites/ghoul/pain.png')
  for (let i = 0; i < Math.min(8, death.length); i++)
    await put('ghoul', death[i].frame, `sprites/ghoul/die${i + 1}.png`)
  console.log('ghoul front row:', front.map((f) => f.frame).join(' '))
  console.log('ghoul death row:', death.map((f) => f.frame).join(' '))
}

// Vassago (grid 8x10): rows 0-3 walk, 4-7 attack, 8 pain, 9 death. Front = col 0 (x < 145).
{
  const m = await manifest('vassago')
  const frontOf = (r) => m.filter((f) => f.row === r && f.x < 145).sort((a, b) => a.x - b.x)[0]
  for (let r = 0; r < 4; r++) await put('vassago', frontOf(r).frame, `sprites/vassago/walk${r + 1}.png`)
  for (let r = 4; r < 8; r++) await put('vassago', frontOf(r).frame, `sprites/vassago/attack${r - 3}.png`)
  await put('vassago', frontOf(8).frame, 'sprites/vassago/pain.png')
  const death = m.filter((f) => f.row === 9).sort((a, b) => a.x - b.x)
  for (let i = 0; i < death.length && i < 8; i++)
    await put('vassago', death[i].frame, `sprites/vassago/die${i + 1}.png`)
  console.log('vassago death row:', death.map((f) => f.frame).join(' '))
}

// Banshee: 4 idle frames + 4 death (growing explosion)
{
  const m = await manifest('banshee')
  const idle = band(m, 0, 130).filter((f) => f.w > 20)
  const death = band(m, 140, 280).filter((f) => f.w > 20)
  for (let i = 0; i < 4; i++) await put('banshee', idle[i].frame, `sprites/banshee/idle${i + 1}.png`)
  for (let i = 0; i < 4; i++) await put('banshee', death[i].frame, `sprites/banshee/die${i + 1}.png`)
}

// ---------- weapons (first-person) ----------
await put('weapons', 'weapons_r3_c9', 'sprites/pistol/idle.png')
await put('weapons', 'weapons_r3_c10', 'sprites/pistol/fire1.png')
await put('weapons', 'weapons_r3_c11', 'sprites/pistol/fire2.png')
await put('weapons', 'weapons_r3_c12', 'sprites/pistol/fire3.png')
await put('weapons', 'weapons_r1_c2', 'sprites/pistol/flash.png')
await put('weapons', 'weapons_r5_c1', 'sprites/shotgun/idle.png')
await put('weapons', 'weapons_r5_c4', 'sprites/shotgun/fire1.png')
await put('weapons', 'weapons_r5_c2', 'sprites/shotgun/fire2.png')
await put('weapons', 'weapons_r5_c3', 'sprites/shotgun/fire3.png')
await put('weapons', 'weapons_r4_c3', 'sprites/shotgun/flash1.png')
await put('weapons', 'weapons_r4_c4', 'sprites/shotgun/flash2.png')

// ---------- HUD ----------
// status bar: exact STBAR rect on the hud sheet (no trim - bar is opaque)
{
  const out = path.join(PUB, 'hud/stbar.png')
  await mkdir(path.dirname(out), { recursive: true })
  await sharp(path.join(RAW, 'hud.png')).extract({ left: 9, top: 22, width: 320, height: 34 }).png().toFile(out)
  picks.push({ dest: 'hud/stbar.png', src: out })
}
// faces: looks (5 tiers x 3 dirs), ouch + grin + dead + god
{
  for (let t = 0; t < 5; t++)
    for (let d = 0; d < 3; d++) await put('face', `face_r${t}_c${d}`, `hud/face/t${t}_look${d}.png`)
  for (let t = 0; t < 5; t++) {
    await put('face', `face_r5_c${t}`, `hud/face/t${t}_grin.png`)
    await put('face', `face_r8_c${t}`, `hud/face/t${t}_ouch.png`)
    await put('face', `face_r9_c${t}`, `hud/face/t${t}_rampage.png`)
  }
  await put('face', 'face_r10_c0', 'hud/face/dead.png')
  await put('face', 'face_r10_c1', 'hud/face/god.png')
}
// status-bar digits: the big red "-0123456789%" strip in the hud sheet TEXT section.
// Monospace glyphs, 15px pitch starting at x=19.
{
  const DIG_BG = [[0, 255, 255], [0, 127, 127], [0, 64, 64]]
  for (let d = 0; d <= 9; d++)
    await crop('hud', { x: 19 + d * 15, y: 79, w: 14, h: 20 }, DIG_BG, `hud/digits/${d}.png`)
  await crop('hud', { x: 9, y: 79, w: 9, h: 20 }, DIG_BG, 'hud/digits/minus.png')
  await crop('hud', { x: 166, y: 79, w: 14, h: 20 }, DIG_BG, 'hud/digits/percent.png')
}

// ---------- menu graphics ----------
const MENU_BG = [[149, 177, 200], [0, 255, 255], [1, 255, 255], [84, 109, 142]]
await crop('menu', { x: 150, y: 55, w: 134, h: 75 }, MENU_BG, 'menu/logo_doom.png')
await crop('menu', { x: 287, y: 55, w: 122, h: 75 }, MENU_BG, 'menu/logo_doom2.png')
// center column list: Pause, New Game, Options, Load, Save, Read This!, Quit Game
{
  const { data, info } = await sharp(path.join(RAW, 'menu.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const bgSet = new Set(MENU_BG.map(([r, g, b]) => (r << 24) | (g << 16) | (b << 8) | 255))
  // detect line bands with a narrow window (avoids a sliver that bridges lines),
  // then crop each line with a wider window so long items aren't left-clipped
  const X0 = 300, X1 = 445, Y0 = 125, Y1 = 260
  const CX0 = 264, CX1 = 445
  const rowHas = (y) => {
    for (let x = X0; x < X1; x++) {
      const i = (y * W + x) * 4
      if (data[i + 3] > 8 && !bgSet.has((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3])) return true
    }
    return false
  }
  const lines = []
  let start = -1
  for (let y = Y0; y <= Y1; y++) {
    const has = rowHas(y)
    if (has && start < 0) start = y
    if (!has && start >= 0) {
      if (y - start > 5) lines.push([start, y - 1])
      start = -1
    }
  }
  const names = ['pause', 'newgame', 'options', 'loadgame', 'savegame', 'readthis', 'quitgame']
  console.log('menu lines found:', lines.length)
  for (let i = 0; i < names.length && i < lines.length; i++)
    await crop('menu', { x: CX0, y: lines[i][0] - 1, w: CX1 - CX0, h: lines[i][1] - lines[i][0] + 3 }, MENU_BG, `menu/${names[i]}.png`)
}
// skull cursor: two skull frames in the menu sheet top-left block
await crop('menu', { x: 113, y: 74, w: 30, h: 25 }, MENU_BG, 'menu/skull1.png')
await crop('menu', { x: 113, y: 99, w: 30, h: 25 }, MENU_BG, 'menu/skull2.png')

// ---------- projectiles ----------
// Caco fireball row at the sheet top-left: two flying balls + 3 explosion frames
{
  const FB_BG = [[218, 117, 255], [255, 0, 127], [255, 0, 110]]
  await crop('projectiles', { x: 0, y: 85, w: 17, h: 20 }, FB_BG, 'sprites/fireball/fly1.png')
  await crop('projectiles', { x: 17, y: 85, w: 17, h: 20 }, FB_BG, 'sprites/fireball/fly2.png')
  await crop('projectiles', { x: 33, y: 55, w: 45, h: 50 }, FB_BG, 'sprites/fireball/boom1.png')
  await crop('projectiles', { x: 79, y: 55, w: 48, h: 50 }, FB_BG, 'sprites/fireball/boom2.png')
  await crop('projectiles', { x: 128, y: 55, w: 57, h: 50 }, FB_BG, 'sprites/fireball/boom3.png')
}

// ---------- pickups ----------
await put('pickups', 'pickups_r5_c0', 'sprites/pickups/potion.png')
await put('pickups', 'pickups_r5_c4', 'sprites/pickups/helmet.png')
await put('pickups', 'pickups_r5_c8', 'sprites/pickups/stim.png')
await put('pickups', 'pickups_r5_c11', 'sprites/pickups/medikit.png')
await put('pickups', 'pickups_r5_c14', 'sprites/pickups/armor_green.png')
await put('pickups', 'pickups_r5_c16', 'sprites/pickups/armor_blue.png')
await put('pickups', 'pickups_r5_c18', 'sprites/pickups/soul.png')
await put('pickups', 'pickups_r1_c1', 'sprites/pickups/shotgun.png')
{
  const m = await manifest('pickups')
  const ammo = band(m, 62, 100).filter((f) => f.w >= 8)
  console.log('ammo row:', ammo.map((f) => `${f.frame} ${f.w}x${f.h}`).join(' '))
  await put('pickups', ammo[0].frame, 'sprites/pickups/clip.png')
  await put('pickups', ammo[2].frame, 'sprites/pickups/shells.png')
}

// ---------- sky ----------
await crop('skies', { x: 5, y: 5, w: 250, h: 121 }, [[0, 255, 255], [1, 255, 255]], 'textures/sky1.png')

// ---------- wall/floor textures ----------
const TEX = {
  'walls_x/Walls/BRIKMET1.png': 'textures/wall_main.png',
  'walls_x/Walls/BRICK16.png': 'textures/wall_brick.png',
  'walls_x/Walls/COMP1.png': 'textures/wall_comp.png',
  'walls_x/Walls/COMP3.png': 'textures/wall_comp2.png',
  'walls_x/Walls/BIGDOOR9.png': 'textures/door.png',
  'walls_x/Walls/BASALT1.png': 'textures/wall_rock.png',
  'flats2_x/FLOOR4_8.png': 'textures/floor_main.png',
  'flats2_x/FLOOR5_1.png': 'textures/floor_alt.png',
  'flats2_x/CEIL3_1.png': 'textures/ceil_main.png',
  'flats2_x/TLITE6_1.png': 'textures/ceil_light.png',
  'flats2_x/NUKAGE1.png': 'textures/nukage.png',
  'flats2_x/STEP1.png': 'textures/step.png',
  'flats2_x/GATE1.png': 'textures/exit.png',
}
for (const [src, dest] of Object.entries(TEX)) {
  const out = path.join(PUB, dest)
  await mkdir(path.dirname(out), { recursive: true })
  await copyFile(path.join(RAW, src), out)
  picks.push({ dest, src: out })
}

// ---------- sounds ----------
const SND = {
  dspistol: 'pistol', dsshotgn: 'shotgun', dssgcock: 'sgcock', dswpnup: 'wpnup',
  dsplpain: 'plpain', dspldeth: 'pldeth', dsoof: 'oof', dsnoway: 'noway',
  dsitemup: 'itemup', dsgetpow: 'getpow',
  dsdoropn: 'doropn', dsdorcls: 'dorcls',
  dsswtchn: 'swtchn', dsswtchx: 'swtchx', dspstop: 'pstop', dsstnmov: 'stnmov',
  dsfirsht: 'firsht', dsfirxpl: 'firxpl', dsbarexp: 'barexp',
  dssklatk: 'sklatk', dsskldth: 'skldth', dsdmpain: 'dmpain', dsdmact: 'dmact',
  dsbgsit1: 'bgsit', dsbgdth1: 'bgdth', dsbgact: 'bgact', dspopain: 'popain',
  dskntsit: 'kntsit', dskntdth: 'kntdth',
  dspesit: 'pesit', dspepain: 'pepain',
  dsslop: 'slop', dstelept: 'telept', dspstart: 'pstart',
}
await mkdir(path.join(PUB, 'sounds'), { recursive: true })
for (const [src, dest] of Object.entries(SND))
  await copyFile(path.join(RAW, 'sounds_x', src + '.wav'), path.join(PUB, 'sounds', dest + '.wav'))

// ---------- verification montage ----------
{
  const cols = 10, cellW = 100, cellH = 100, label = 14
  const rows = Math.ceil(picks.length / cols)
  const composites = []
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i]
    const cx = (i % cols) * cellW, cy = Math.floor(i / cols) * (cellH + label)
    const meta = await sharp(p.src).metadata()
    const scale = Math.min(1, (cellW - 4) / meta.width, (cellH - 4) / meta.height)
    const w = Math.max(1, Math.round(meta.width * scale)), h = Math.max(1, Math.round(meta.height * scale))
    composites.push({ input: await sharp(p.src).resize(w, h, { kernel: 'nearest' }).png().toBuffer(), left: cx + 2, top: cy + 2 })
    const tag = p.dest.replace(/^(sprites|hud|menu|textures)\//, '').replace('.png', '')
    composites.push({
      input: Buffer.from(`<svg width="${cellW}" height="${label}"><text x="1" y="10" font-size="9" font-family="monospace" fill="white">${tag}</text></svg>`),
      left: cx, top: cy + cellH,
    })
  }
  await sharp({ create: { width: cols * cellW, height: rows * (cellH + label), channels: 4, background: { r: 35, g: 35, b: 55, alpha: 1 } } })
    .composite(composites)
    .png()
    .toFile(path.join(ROOT, 'sliced', 'STAGED_montage.png'))
}
console.log('staged', picks.length, 'images + sounds')
