// Central registry of staged asset paths and animation tables.

export const SPR = (p: string) => `/sprites/${p}.png`
export const TEX = (p: string) => `/textures/${p}.png`
export const HUD = (p: string) => `/hud/${p}.png`
export const MENU = (p: string) => `/menu/${p}.png`

export type EnemyKind = 'lostsoul' | 'ghoul' | 'vassago' | 'banshee'

export interface EnemyAnims {
  walk: string[]
  attack: string[]
  pain: string[]
  die: string[]
}

export const ENEMY_ANIMS: Record<EnemyKind, EnemyAnims> = {
  lostsoul: {
    walk: [SPR('lostsoul/fly1'), SPR('lostsoul/fly2')],
    attack: [SPR('lostsoul/attack1'), SPR('lostsoul/attack2')],
    pain: [SPR('lostsoul/pain')],
    die: [1, 2, 3, 4, 5, 6].map((i) => SPR(`lostsoul/die${i}`)),
  },
  ghoul: {
    walk: [SPR('ghoul/fly1'), SPR('ghoul/fly2'), SPR('ghoul/fly3')],
    attack: [SPR('ghoul/attack1'), SPR('ghoul/attack2'), SPR('ghoul/attack3'), SPR('ghoul/attack4')],
    pain: [SPR('ghoul/pain')],
    die: [1, 2, 3, 4, 5, 6].map((i) => SPR(`ghoul/die${i}`)),
  },
  vassago: {
    walk: [SPR('vassago/walk1'), SPR('vassago/walk2'), SPR('vassago/walk3'), SPR('vassago/walk4')],
    attack: [SPR('vassago/attack1'), SPR('vassago/attack2'), SPR('vassago/attack3'), SPR('vassago/attack4')],
    pain: [SPR('vassago/pain')],
    die: [1, 2, 3, 4, 5].map((i) => SPR(`vassago/die${i}`)),
  },
  banshee: {
    walk: [SPR('banshee/idle1'), SPR('banshee/idle2'), SPR('banshee/idle3'), SPR('banshee/idle4')],
    attack: [SPR('banshee/idle1'), SPR('banshee/idle3')],
    pain: [SPR('banshee/idle2')],
    die: [1, 2, 3, 4].map((i) => SPR(`banshee/die${i}`)),
  },
}

export const FIREBALL_FLY = [SPR('fireball/fly1'), SPR('fireball/fly2')]
export const FIREBALL_BOOM = [SPR('fireball/boom1'), SPR('fireball/boom2'), SPR('fireball/boom3')]

export type PickupKind =
  | 'stim' | 'medikit' | 'potion' | 'helmet'
  | 'armor_green' | 'armor_blue' | 'soul'
  | 'clip' | 'shells' | 'shotgun'

export const PICKUP_SPRITES: Record<PickupKind, string> = {
  stim: SPR('pickups/stim'),
  medikit: SPR('pickups/medikit'),
  potion: SPR('pickups/potion'),
  helmet: SPR('pickups/helmet'),
  armor_green: SPR('pickups/armor_green'),
  armor_blue: SPR('pickups/armor_blue'),
  soul: SPR('pickups/soul'),
  clip: SPR('pickups/clip'),
  shells: SPR('pickups/shells'),
  shotgun: SPR('pickups/shotgun'),
}

export const WEAPON_FRAMES = {
  pistol: {
    idle: SPR('pistol/idle'),
    fire: [SPR('pistol/fire1'), SPR('pistol/fire2'), SPR('pistol/fire3')],
    flash: SPR('pistol/flash'),
  },
  shotgun: {
    idle: SPR('shotgun/idle'),
    fire: [SPR('shotgun/fire1'), SPR('shotgun/fire2'), SPR('shotgun/fire3')],
    flash: SPR('shotgun/flash1'),
  },
}

// preload list for the loading screen
export const ALL_IMAGES: string[] = [
  ...Object.values(ENEMY_ANIMS).flatMap((a) => [...a.walk, ...a.attack, ...a.pain, ...a.die]),
  ...FIREBALL_FLY,
  ...FIREBALL_BOOM,
  ...Object.values(PICKUP_SPRITES),
  WEAPON_FRAMES.pistol.idle, ...WEAPON_FRAMES.pistol.fire, WEAPON_FRAMES.pistol.flash,
  WEAPON_FRAMES.shotgun.idle, ...WEAPON_FRAMES.shotgun.fire, WEAPON_FRAMES.shotgun.flash,
  TEX('wall_main'), TEX('wall_brick'), TEX('wall_comp'), TEX('wall_comp2'),
  TEX('wall_rock'), TEX('door'), TEX('floor_main'), TEX('floor_alt'),
  TEX('ceil_main'), TEX('ceil_light'), TEX('nukage'), TEX('exit'), TEX('sky1'), TEX('step'),
]
