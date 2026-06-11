# DOOM Clone (React Three Fiber)

A browser DOOM-style FPS built with React Three Fiber, using sprite/texture rips
from The Spriters Resource and the classic sound effects. All game art and audio
are © id Software / Bethesda — personal, educational use only.

## Run

```sh
npm install
npm run dev
```

## Controls

| Input | Action |
| --- | --- |
| Mouse | Turn / fire (left button) |
| W A S D / arrows | Move + strafe |
| Ctrl | Fire (alternative) |
| E / Space | Use (open doors) |
| 1 / 2 | Pistol / shotgun |
| Esc | Pause menu |

## What's in

- Doom-feel movement: instant acceleration, heavy friction, fast top speed, view/weapon bob, no vertical look
- 4 enemy types: Lost Soul (charger), Ghoul (flying fireball shooter), Vassago (heavy fireball demon), Banshee (kamikaze)
- Pistol + shotgun with authentic fire/pump animations and muzzle flashes
- Classic status bar: red ammo/health/armor digits and the animated Doomguy face (damage tiers, ouch, grin, rampage, dead)
- Sliding doors, nukage floors that hurt, pickups (health/armor/ammo/shotgun/soulsphere), exit pad, open-air courtyard with the E1 sky
- 30+ original sound effects: weapons, doors, pickups, enemy sight/pain/death barks, menu blips

## Asset pipeline

- `scripts/slice.mjs` — slices the downloaded sheets (`raw_assets/`) into frames via background-keying, guillotine cuts and connected components (`sliced/`)
- `scripts/stage.mjs` — picks frames by manifest coordinates / fixed crops and assembles `public/` with semantic names
- `scripts/smoke.mjs` — headless Chrome smoke test against `vite preview`
