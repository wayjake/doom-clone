// First-person weapon sprite, DOM-based like the original 2D overlay,
// with movement bob and firing animation + muzzle flash.
import { useEffect, useRef } from 'react'
import { game } from '../game/engine'
import { WEAPON_FRAMES } from '../assets'

export function WeaponView() {
  const imgRef = useRef<HTMLImageElement>(null)
  const flashRef = useRef<HTMLImageElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const raf = useRef(0)

  useEffect(() => {
    const loop = () => {
      raf.current = requestAnimationFrame(loop)
      const img = imgRef.current, flash = flashRef.current, wrap = wrapRef.current
      if (!img || !wrap || !flash) return
      const frames = WEAPON_FRAMES[game.weapon]
      let src = frames.idle
      let showFlash = false
      const cooldown = game.weapon === 'pistol' ? 0.38 : 0.95
      if (game.fireT >= 0) {
        const t = game.fireT / cooldown
        const idx = Math.min(frames.fire.length - 1, Math.floor(t * (frames.fire.length + 1)))
        src = frames.fire[idx]
        showFlash = game.fireT < 0.09
      }
      // weapon raise/lower during switch
      let switchY = 0
      if (game.switchT > 0) {
        const t = game.switchT / 0.5
        switchY = Math.sin(Math.min(1, t) * Math.PI) * 130
      }
      if (img.dataset.src !== src) {
        img.src = src
        img.dataset.src = src
      }
      flash.style.display = showFlash ? 'block' : 'none'
      if (showFlash && flash.dataset.src !== frames.flash) {
        flash.src = frames.flash
        flash.dataset.src = frames.flash
      }
      const speed = Math.hypot(game.vx, game.vz)
      const frac = Math.min(1, speed / 12.5)
      const bx = Math.sin(game.bobPhase) * 14 * frac
      const by = Math.abs(Math.cos(game.bobPhase)) * 9 * frac + switchY
      wrap.style.transform = `translate(calc(-50% + ${bx}px), ${by}px)`
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  return (
    <div className="weapon-wrap" ref={wrapRef}>
      <img ref={flashRef} alt="" className="weapon-flash" draggable={false} />
      <img ref={imgRef} alt="" className="weapon-img" draggable={false} />
    </div>
  )
}
