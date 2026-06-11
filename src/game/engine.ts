// Core simulation: player movement (Doom-style accel/friction), enemies,
// projectiles, doors, pickups. Pure TS singleton mutated by tick(); React
// components read from it every frame and mirror UI numbers into the store.
import {
  CELL, H, W, tile, isWall, cellOf, findSpawn, lineOfSight,
  ENEMY_SPAWNS, PICKUP_SPAWNS,
} from './map'
import type { EnemyKind, PickupKind } from '../assets'
import { playAt, playSound } from '../audio'
import { useGame, type WeaponName } from '../store'

export const EYE = 1.45
const PLAYER_R = 0.55

// Doom movement feel: near-instant acceleration, heavy friction, fast top speed
const TOP_SPEED = 12.5
const ACCEL = 110
const FRICTION = 8.5

export interface Enemy {
  id: number
  kind: EnemyKind
  x: number; y: number; z: number
  hp: number
  state: 'idle' | 'chase' | 'attack' | 'pain' | 'die' | 'dead'
  stateT: number
  animT: number
  awake: boolean
  attackCd: number
  chargeVx: number; chargeVz: number; charging: number
  radius: number
  flying: boolean
}

export interface Projectile {
  id: number
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  alive: boolean
  boomT: number // >0 while exploding
  fromPlayer: boolean
  damage: number
}

export interface Pickup {
  id: number
  kind: PickupKind
  x: number; z: number
  taken: boolean
}

export interface Door {
  cx: number; cz: number
  open: number // 0 closed .. 1 open
  state: 'closed' | 'opening' | 'open' | 'closing'
  timer: number
}

const STATS: Record<EnemyKind, { hp: number; speed: number; radius: number; pain: number; flying: boolean }> = {
  lostsoul: { hp: 60, speed: 3.2, radius: 0.55, pain: 0.35, flying: true },
  ghoul: { hp: 50, speed: 3.4, radius: 0.5, pain: 0.4, flying: true },
  vassago: { hp: 160, speed: 2.2, radius: 0.7, pain: 0.18, flying: false },
  banshee: { hp: 40, speed: 1.8, radius: 0.5, pain: 0.2, flying: true },
}

export interface GameState {
  px: number; pz: number
  vx: number; vz: number
  yaw: number
  bob: number
  bobPhase: number
  health: number
  armor: number
  bullets: number
  shells: number
  weapon: WeaponName
  hasShotgun: boolean
  alive: boolean
  deathT: number
  fireT: number // time since trigger pulled, -1 idle
  fireHeld: boolean
  switchT: number
  pendingWeapon: WeaponName | null
  enemies: Enemy[]
  projectiles: Projectile[]
  pickups: Pickup[]
  doors: Door[]
  time: number
  won: boolean
  lastHurtSoundT: number
  nukageT: number
}

export const game: GameState = {} as GameState
let nextId = 1

// debug/testing handle
if (typeof window !== 'undefined') (window as unknown as { __doom: unknown }).__doom = { game }

export function resetGame() {
  const spawn = findSpawn()
  Object.assign(game, {
    px: spawn.x, pz: spawn.z,
    vx: 0, vz: 0,
    yaw: Math.PI, // face into the room
    bob: 0, bobPhase: 0,
    health: 100, armor: 0,
    bullets: 50, shells: 0,
    weapon: 'pistol' as WeaponName,
    hasShotgun: false,
    alive: true, deathT: 0,
    fireT: -1, fireHeld: false,
    switchT: 0, pendingWeapon: null,
    enemies: ENEMY_SPAWNS.map((s) => ({
      id: nextId++,
      kind: s.kind,
      x: (s.cx + 0.5) * CELL,
      y: STATS[s.kind].flying ? 1.6 : 0,
      z: (s.cz + 0.5) * CELL,
      hp: STATS[s.kind].hp,
      state: 'idle' as const,
      stateT: 0, animT: Math.random() * 10,
      awake: false, attackCd: 1 + Math.random(),
      chargeVx: 0, chargeVz: 0, charging: 0,
      radius: STATS[s.kind].radius,
      flying: STATS[s.kind].flying,
    })),
    projectiles: [],
    pickups: PICKUP_SPAWNS.map((s) => ({
      id: nextId++, kind: s.kind, x: (s.cx + 0.5) * CELL, z: (s.cz + 0.5) * CELL, taken: false,
    })),
    doors: collectDoors(),
    time: 0,
    won: false,
    lastHurtSoundT: 0,
    nukageT: 0,
  } satisfies GameState)
  useGame.getState().set({
    health: 100, armor: 0, bullets: 50, shells: 0,
    weapon: 'pistol', hasShotgun: false, kills: 0,
    totalEnemies: game.enemies.length,
    rampage: false, message: '', messageUntil: 0,
  })
}

function collectDoors(): Door[] {
  const doors: Door[] = []
  for (let z = 0; z < H; z++)
    for (let x = 0; x < W; x++)
      if (tile(x, z) === 'D') doors.push({ cx: x, cz: z, open: 0, state: 'closed', timer: 0 })
  return doors
}

function doorAt(cx: number, cz: number): Door | undefined {
  return game.doors.find((d) => d.cx === cx && d.cz === cz)
}

export function isSolidCell(cx: number, cz: number): boolean {
  const t = tile(cx, cz)
  if (t === 'D') {
    const d = doorAt(cx, cz)
    return !d || d.open < 0.85
  }
  return isWall(cx, cz)
}

// circle vs grid collision with wall sliding
function moveWithCollision(x: number, z: number, dx: number, dz: number, r: number): [number, number, boolean] {
  let nx = x + dx
  let nz = z + dz
  let bumped = false
  // resolve per-axis
  const tryAxis = (px: number, pz: number): [number, number] => {
    const minCx = Math.floor((px - r) / CELL), maxCx = Math.floor((px + r) / CELL)
    const minCz = Math.floor((pz - r) / CELL), maxCz = Math.floor((pz + r) / CELL)
    for (let cz = minCz; cz <= maxCz; cz++)
      for (let cx = minCx; cx <= maxCx; cx++) {
        if (!isSolidCell(cx, cz)) continue
        // push out of this cell AABB
        const x0 = cx * CELL, x1 = x0 + CELL
        const z0 = cz * CELL, z1 = z0 + CELL
        const cx2 = Math.max(x0, Math.min(px, x1))
        const cz2 = Math.max(z0, Math.min(pz, z1))
        const ddx = px - cx2, ddz = pz - cz2
        const d2 = ddx * ddx + ddz * ddz
        if (d2 < r * r) {
          bumped = true
          const d = Math.sqrt(d2) || 1e-5
          const push = r - d
          px += (ddx / d) * push
          pz += (ddz / d) * push
        }
      }
    return [px, pz]
  }
  ;[nx] = tryAxis(nx, z)
  ;[nx, nz] = tryAxis(nx, nz)
  return [nx, nz, bumped]
}

const blockedForSight = (cx: number, cz: number) => isSolidCell(cx, cz)

export interface InputState {
  forward: number // -1..1
  strafe: number
  fire: boolean
  use: boolean
  weapon1: boolean
  weapon2: boolean
}

function setStore(p: Parameters<ReturnType<typeof useGame.getState>['set']>[0]) {
  useGame.getState().set(p)
}

function message(text: string) {
  setStore({ message: text, messageUntil: performance.now() + 2500 })
}

export function hurtPlayer(dmg: number, fromX?: number, fromZ?: number) {
  if (!game.alive) return
  let d = dmg
  if (game.armor > 0) {
    const absorbed = Math.min(game.armor, Math.floor(dmg / 3))
    game.armor -= absorbed
    d -= absorbed
  }
  game.health = Math.max(0, game.health - d)
  const st = useGame.getState()
  setStore({
    health: game.health, armor: game.armor,
    damageFlash: st.damageFlash + 1,
    ouchUntil: performance.now() + 900,
  })
  if (game.health <= 0) {
    game.alive = false
    game.deathT = 0
    playSound('pldeth')
    setStore({ screen: 'dead' })
  } else if (game.time - game.lastHurtSoundT > 0.5) {
    playSound('plpain')
    game.lastHurtSoundT = game.time
  }
  void fromX; void fromZ
}

function givePickup(p: Pickup): boolean {
  const st = useGame.getState()
  switch (p.kind) {
    case 'stim':
      if (game.health >= 100) return false
      game.health = Math.min(100, game.health + 10); break
    case 'medikit':
      if (game.health >= 100) return false
      game.health = Math.min(100, game.health + 25); break
    case 'potion':
      game.health = Math.min(200, game.health + 1); break
    case 'helmet':
      game.armor = Math.min(200, game.armor + 1); break
    case 'armor_green':
      if (game.armor >= 100) return false
      game.armor = 100; break
    case 'armor_blue':
      game.armor = Math.min(200, Math.max(game.armor, 200)); break
    case 'soul':
      game.health = Math.min(200, game.health + 100)
      playSound('getpow')
      message('SUPERCHARGE!')
      break
    case 'clip':
      if (game.bullets >= 200) return false
      game.bullets = Math.min(200, game.bullets + 10); break
    case 'shells':
      if (game.shells >= 50) return false
      game.shells = Math.min(50, game.shells + 4); break
    case 'shotgun':
      if (!game.hasShotgun) {
        game.hasShotgun = true
        game.pendingWeapon = 'shotgun'
        game.switchT = 0.001
        playSound('wpnup')
        message('You got the shotgun!')
        setStore({ grinUntil: performance.now() + 2000 })
      }
      game.shells = Math.min(50, game.shells + 8)
      break
  }
  if (p.kind !== 'soul' && p.kind !== 'shotgun') playSound('itemup')
  const msgs: Partial<Record<PickupKind, string>> = {
    stim: 'Picked up a stimpack.',
    medikit: 'Picked up a medikit.',
    potion: 'Picked up a health bonus.',
    helmet: 'Picked up an armor bonus.',
    armor_green: 'Picked up the armor.',
    armor_blue: 'Picked up the MegaArmor!',
    clip: 'Picked up a clip.',
    shells: 'Picked up 4 shotgun shells.',
  }
  if (msgs[p.kind]) message(msgs[p.kind]!)
  setStore({
    health: game.health, armor: game.armor,
    bullets: game.bullets, shells: game.shells,
    hasShotgun: game.hasShotgun,
    pickupFlash: st.pickupFlash + 1,
  })
  return true
}

function fireWeapon() {
  if (game.weapon === 'pistol') {
    if (game.bullets <= 0) return false
    game.bullets--
    playSound('pistol')
    hitscan(1, 0.012)
  } else {
    if (game.shells <= 0) return false
    game.shells--
    playSound('shotgun')
    hitscan(7, 0.08)
  }
  setStore({ bullets: game.bullets, shells: game.shells })
  return true
}

function hitscan(pellets: number, spread: number) {
  for (let i = 0; i < pellets; i++) {
    const ang = game.yaw + (Math.random() * 2 - 1) * spread
    const dx = -Math.sin(ang), dz = -Math.cos(ang)
    // find nearest wall distance along ray
    let wallDist = 60
    for (let t = 0.5; t < 60; t += 0.25) {
      const [cx, cz] = cellOf(game.px + dx * t, game.pz + dz * t)
      if (isSolidCell(cx, cz)) { wallDist = t; break }
    }
    // nearest enemy the ray passes through
    let best: Enemy | null = null
    let bestDist = wallDist
    for (const e of game.enemies) {
      if (e.state === 'die' || e.state === 'dead') continue
      const ex = e.x - game.px, ez = e.z - game.pz
      const along = ex * dx + ez * dz
      if (along < 0.3 || along > bestDist) continue
      const perp = Math.abs(ex * dz - ez * dx)
      if (perp < e.radius + 0.12 && along < bestDist) {
        best = e
        bestDist = along
      }
    }
    if (best) damageEnemy(best, 5 + Math.floor(Math.random() * 11))
  }
}

export function damageEnemy(e: Enemy, dmg: number) {
  if (e.state === 'die' || e.state === 'dead') return
  e.hp -= dmg
  wake(e, true)
  if (e.hp <= 0) {
    e.state = 'die'
    e.stateT = 0
    const dist = Math.hypot(e.x - game.px, e.z - game.pz)
    if (e.kind === 'banshee') {
      playAt('barexp', dist)
      explode(e.x, e.y + 0.8, e.z, 3.2, 50, false)
    } else {
      playAt(({ lostsoul: 'skldth', ghoul: 'bgdth', vassago: 'kntdth' } as const)[e.kind as 'lostsoul' | 'ghoul' | 'vassago'], dist)
    }
    const st = useGame.getState()
    setStore({ kills: st.kills + 1 })
    return
  }
  const stats = STATS[e.kind]
  if (Math.random() < stats.pain) {
    e.state = 'pain'
    e.stateT = 0
    const dist = Math.hypot(e.x - game.px, e.z - game.pz)
    playAt(e.kind === 'ghoul' ? 'popain' : e.kind === 'banshee' ? 'pepain' : 'dmpain', dist)
  }
}

function wake(e: Enemy, silent = false) {
  if (e.awake) return
  e.awake = true
  if (e.state === 'idle') e.state = 'chase'
  if (!silent) {
    const dist = Math.hypot(e.x - game.px, e.z - game.pz)
    const snd = ({ lostsoul: 'dmact', ghoul: 'bgsit', vassago: 'kntsit', banshee: 'pesit' } as const)[e.kind]
    playAt(snd, dist)
  }
}

function explode(x: number, y: number, z: number, radius: number, maxDmg: number, hurtShooter = true) {
  void hurtShooter
  const pd = Math.hypot(x - game.px, z - game.pz)
  if (pd < radius) hurtPlayer(Math.ceil(maxDmg * (1 - pd / radius)))
  for (const e of game.enemies) {
    if (e.state === 'die' || e.state === 'dead') continue
    const d = Math.hypot(x - e.x, z - e.z)
    if (d < radius) damageEnemy(e, Math.ceil(maxDmg * (1 - d / radius)))
  }
}

function spawnFireball(e: Enemy, speed: number, damage: number) {
  const dx = game.px - e.x
  const dz = game.pz - e.z
  const dist = Math.hypot(dx, dz) || 1
  const dy = EYE - 0.2 - (e.y + 1.1)
  game.projectiles.push({
    id: nextId++,
    x: e.x + (dx / dist) * (e.radius + 0.4),
    y: e.y + 1.1,
    z: e.z + (dz / dist) * (e.radius + 0.4),
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
    vz: (dz / dist) * speed,
    alive: true, boomT: 0,
    fromPlayer: false,
    damage,
  })
  playAt('firsht', dist)
}

function tickEnemy(e: Enemy, dt: number) {
  const stats = STATS[e.kind]
  e.animT += dt
  e.stateT += dt
  const dx = game.px - e.x, dz = game.pz - e.z
  const dist = Math.hypot(dx, dz) || 1e-5

  switch (e.state) {
    case 'idle': {
      if (dist < 24 && lineOfSight(e.x, e.z, game.px, game.pz, blockedForSight)) wake(e)
      break
    }
    case 'pain': {
      if (e.stateT > 0.35) { e.state = 'chase'; e.stateT = 0 }
      break
    }
    case 'die': {
      const frames = e.kind === 'banshee' ? 4 : e.kind === 'vassago' ? 5 : 6
      if (e.stateT > frames * 0.13) { e.state = 'dead' }
      break
    }
    case 'dead':
      return
    case 'attack': {
      // ranged enemies hold still during attack, fire mid-animation
      if (e.stateT > 0.55 && e.attackCd <= 0) {
        if (e.kind === 'ghoul') spawnFireball(e, 11, 12)
        else if (e.kind === 'vassago') spawnFireball(e, 9.5, 20)
        e.attackCd = e.kind === 'ghoul' ? 1.6 + Math.random() : 2.2 + Math.random() * 1.2
      }
      if (e.stateT > 0.9) { e.state = 'chase'; e.stateT = 0 }
      break
    }
    case 'chase': {
      e.attackCd -= dt
      if (!game.alive) break
      const see = lineOfSight(e.x, e.z, game.px, game.pz, blockedForSight)

      if (e.kind === 'banshee') {
        // drifts straight at you and detonates
        const sp = stats.speed
        const [nx, nz] = moveWithCollision(e.x, e.z, (dx / dist) * sp * dt, (dz / dist) * sp * dt, e.radius)
        e.x = nx; e.z = nz
        e.y = 1.4 + Math.sin(e.animT * 2.2) * 0.25
        if (dist < 1.6) {
          e.hp = 0
          damageEnemy(e, 999)
        }
        break
      }

      if (e.kind === 'lostsoul') {
        if (e.charging > 0) {
          e.charging -= dt
          const [nx, nz, bumped] = moveWithCollision(e.x, e.z, e.chargeVx * dt, e.chargeVz * dt, e.radius)
          e.x = nx; e.z = nz
          if (bumped) e.charging = 0
          if (dist < e.radius + PLAYER_R + 0.3) {
            hurtPlayer(4 + Math.floor(Math.random() * 8))
            e.charging = 0
          }
        } else {
          const sp = stats.speed
          const [nx, nz] = moveWithCollision(e.x, e.z, (dx / dist) * sp * dt, (dz / dist) * sp * dt, e.radius)
          e.x = nx; e.z = nz
          if (see && dist < 14 && e.attackCd <= 0) {
            const cs = 13
            e.chargeVx = (dx / dist) * cs
            e.chargeVz = (dz / dist) * cs
            e.charging = dist / cs + 0.15
            e.attackCd = 1.4 + Math.random() * 1.2
            playAt('sklatk', dist)
          }
        }
        e.y = 1.5 + Math.sin(e.animT * 3) * 0.3
        break
      }

      // ghoul / vassago: approach with slight zigzag, stop & shoot
      const zig = Math.sin(e.animT * 2.1 + e.id) * 0.6
      const mx = (dx / dist) - (dz / dist) * zig
      const mz = (dz / dist) + (dx / dist) * zig
      const ml = Math.hypot(mx, mz) || 1
      const desired = e.kind === 'ghoul' ? 7 : 3
      const sp = dist > desired ? stats.speed : stats.speed * 0.4
      const [nx, nz] = moveWithCollision(e.x, e.z, (mx / ml) * sp * dt, (mz / ml) * sp * dt, e.radius)
      e.x = nx; e.z = nz
      if (e.flying) e.y = 1.5 + Math.sin(e.animT * 2.4 + e.id) * 0.3

      if (see && e.attackCd <= 0 && dist < 20) {
        e.state = 'attack'
        e.stateT = 0
      }
      // vassago melee swipe
      if (e.kind === 'vassago' && dist < e.radius + PLAYER_R + 0.5 && e.attackCd <= 0) {
        hurtPlayer(8 + Math.floor(Math.random() * 8))
        e.attackCd = 1.2
      }
      break
    }
  }
}

function tickProjectile(p: Projectile, dt: number) {
  if (p.boomT > 0) {
    p.boomT += dt
    if (p.boomT > 0.45) p.alive = false
    return
  }
  const steps = Math.ceil((Math.hypot(p.vx, p.vz) * dt) / 0.3) || 1
  for (let i = 0; i < steps; i++) {
    p.x += (p.vx * dt) / steps
    p.y += (p.vy * dt) / steps
    p.z += (p.vz * dt) / steps
    const [cx, cz] = cellOf(p.x, p.z)
    if (isSolidCell(cx, cz) || p.y < 0.1 || p.y > 3.9) {
      p.boomT = 0.001
      playAt('firxpl', Math.hypot(p.x - game.px, p.z - game.pz))
      return
    }
    if (!p.fromPlayer) {
      const d = Math.hypot(p.x - game.px, p.z - game.pz)
      if (d < PLAYER_R + 0.3 && Math.abs(p.y - EYE) < 1.2) {
        hurtPlayer(Math.ceil(p.damage * (0.7 + Math.random() * 0.6)))
        p.boomT = 0.001
        return
      }
    }
  }
}

function tickDoors(dt: number) {
  for (const d of game.doors) {
    switch (d.state) {
      case 'opening':
        d.open += dt / 1.0
        if (d.open >= 1) { d.open = 1; d.state = 'open'; d.timer = 4 }
        break
      case 'open': {
        d.timer -= dt
        // don't close on top of the player
        const [pcx, pcz] = cellOf(game.px, game.pz)
        const playerInside = Math.abs(pcx - d.cx) <= 0 && Math.abs(pcz - d.cz) <= 0
        if (d.timer <= 0 && !playerInside) {
          d.state = 'closing'
          playAt('dorcls', Math.hypot((d.cx + 0.5) * CELL - game.px, (d.cz + 0.5) * CELL - game.pz))
        }
        break
      }
      case 'closing':
        d.open -= dt / 1.0
        if (d.open <= 0) { d.open = 0; d.state = 'closed' }
        break
    }
  }
}

function tryUse() {
  // door directly ahead?
  const dx = -Math.sin(game.yaw), dz = -Math.cos(game.yaw)
  for (let t = 0.5; t < CELL * 1.6; t += 0.4) {
    const [cx, cz] = cellOf(game.px + dx * t, game.pz + dz * t)
    const tl = tile(cx, cz)
    if (tl === 'D') {
      const d = doorAt(cx, cz)
      if (d && (d.state === 'closed' || d.state === 'closing')) {
        d.state = 'opening'
        playAt('doropn', t)
      }
      return
    }
    if (isWall(cx, cz)) {
      playSound('noway')
      return
    }
  }
}

let useLatch = false
let fireLatch = false

export function tick(dt: number, input: InputState) {
  dt = Math.min(dt, 0.05)
  game.time += dt

  if (game.alive) {
    // ---- movement ----
    // camera (rotation.y = yaw) faces (-sin, -cos); its right vector is (cos, -sin)
    const sin = Math.sin(game.yaw), cos = Math.cos(game.yaw)
    let wx = (-sin * input.forward) + (cos * input.strafe)
    let wz = (-cos * input.forward) + (-sin * input.strafe)
    const wl = Math.hypot(wx, wz)
    if (wl > 1) { wx /= wl; wz /= wl }
    game.vx += wx * ACCEL * dt
    game.vz += wz * ACCEL * dt
    const f = Math.exp(-FRICTION * dt)
    game.vx *= f
    game.vz *= f
    const sp = Math.hypot(game.vx, game.vz)
    if (sp > TOP_SPEED) {
      game.vx = (game.vx / sp) * TOP_SPEED
      game.vz = (game.vz / sp) * TOP_SPEED
    }
    const [nx, nz] = moveWithCollision(game.px, game.pz, game.vx * dt, game.vz * dt, PLAYER_R)
    game.px = nx; game.pz = nz

    // view bob from actual speed
    const speedFrac = Math.min(1, sp / TOP_SPEED)
    game.bobPhase += dt * (4 + speedFrac * 9)
    game.bob = Math.sin(game.bobPhase * 2) * 0.045 * speedFrac

    // ---- use ----
    if (input.use && !useLatch) { useLatch = true; tryUse() }
    if (!input.use) useLatch = false

    // ---- weapon switching ----
    if (input.weapon1 && game.weapon !== 'pistol' && game.switchT === 0) {
      game.pendingWeapon = 'pistol'; game.switchT = 0.001
    }
    if (input.weapon2 && game.hasShotgun && game.weapon !== 'shotgun' && game.switchT === 0) {
      game.pendingWeapon = 'shotgun'; game.switchT = 0.001
    }
    if (game.switchT > 0) {
      game.switchT += dt
      if (game.pendingWeapon && game.switchT > 0.25) {
        game.weapon = game.pendingWeapon
        game.pendingWeapon = null
        setStore({ weapon: game.weapon })
        playSound(game.weapon === 'shotgun' ? 'sgcock' : 'wpnup', 0.7)
      }
      if (game.switchT > 0.5) game.switchT = 0
    }

    // ---- firing ----
    const cooldown = game.weapon === 'pistol' ? 0.38 : 0.95
    if (game.fireT >= 0) {
      game.fireT += dt
      if (game.fireT >= cooldown) game.fireT = -1
    }
    if (input.fire && game.fireT < 0 && game.switchT === 0) {
      if (!fireLatch || game.weapon === 'pistol') {
        if (fireWeapon()) {
          game.fireT = 0
          setStore({ rampage: true })
        } else if (!fireLatch) {
          // out of ammo: auto-switch or click
          if (game.weapon === 'shotgun' && game.bullets > 0) {
            game.pendingWeapon = 'pistol'; game.switchT = 0.001
          }
        }
        fireLatch = true
      }
    }
    if (!input.fire) {
      fireLatch = false
      if (game.fireT < 0) setStore({ rampage: false })
    }

    // ---- nukage floor damage ----
    const [pcx, pcz] = cellOf(game.px, game.pz)
    if (tile(pcx, pcz) === 'N') {
      game.nukageT += dt
      if (game.nukageT > 0.9) {
        game.nukageT = 0
        hurtPlayer(5)
      }
    } else game.nukageT = 0

    // ---- pickups ----
    for (const p of game.pickups) {
      if (p.taken) continue
      if (Math.hypot(p.x - game.px, p.z - game.pz) < 0.9) {
        if (givePickup(p)) p.taken = true
      }
    }

    // ---- exit ----
    if (tile(pcx, pcz) === 'X' && !game.won) {
      game.won = true
      playSound('swtchx')
      setStore({ screen: 'won' })
    }
  } else {
    game.deathT += dt
  }

  // ---- world ----
  tickDoors(dt)
  for (const e of game.enemies) tickEnemy(e, dt)
  game.projectiles = game.projectiles.filter((p) => p.alive)
  for (const p of game.projectiles) tickProjectile(p, dt)

  // occasional idle growls
  if (Math.random() < dt * 0.12) {
    const awake = game.enemies.filter((e) => e.awake && e.state !== 'die' && e.state !== 'dead' && !e.flying)
    if (awake.length) {
      const e = awake[(Math.random() * awake.length) | 0]
      playAt('dmact', Math.hypot(e.x - game.px, e.z - game.pz), 0.6)
    }
  }
}
