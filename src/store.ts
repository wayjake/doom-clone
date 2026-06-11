import { create } from 'zustand'

export type Screen = 'menu' | 'playing' | 'paused' | 'dead' | 'won'
export type WeaponName = 'pistol' | 'shotgun'

interface GameStore {
  screen: Screen
  health: number
  armor: number
  bullets: number
  shells: number
  weapon: WeaponName
  hasShotgun: boolean
  // HUD effects
  damageFlash: number // bumps on each hit; HUD animates a red flash
  pickupFlash: number // bumps on each pickup; HUD animates a yellow flash
  ouchUntil: number
  grinUntil: number
  rampage: boolean
  kills: number
  totalEnemies: number
  message: string
  messageUntil: number
  set: (p: Partial<GameStore>) => void
}

export const useGame = create<GameStore>((set) => ({
  screen: 'menu',
  health: 100,
  armor: 0,
  bullets: 50,
  shells: 0,
  weapon: 'pistol',
  hasShotgun: false,
  damageFlash: 0,
  pickupFlash: 0,
  ouchUntil: 0,
  grinUntil: 0,
  rampage: false,
  kills: 0,
  totalEnemies: 0,
  message: '',
  messageUntil: 0,
  set: (p) => set(p),
}))
