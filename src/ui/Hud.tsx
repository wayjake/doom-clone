// Status bar: scaled STBAR graphic with red digit counters and the animated
// Doomguy face. DOM-based, pixelated, fixed to the bottom of the viewport.
import { useEffect, useRef, useState } from 'react'
import { useGame } from '../store'
import { HUD } from '../assets'

function Digits({ value, x, percent }: { value: number; x: number; percent?: boolean }) {
  // right-aligned 3-digit number, drawn in stbar pixel coordinates (320x32 space)
  const s = String(Math.max(0, Math.min(999, Math.round(value))))
  const chars = s.split('')
  const DIGIT_W = 14
  let drawX = x - chars.length * DIGIT_W
  const imgs = chars.map((c, i) => {
    const el = (
      <img
        key={i}
        src={HUD(`digits/${c}`)}
        style={{ position: 'absolute', left: drawX + i * DIGIT_W, top: 6, height: 16, imageRendering: 'pixelated' }}
        alt=""
      />
    )
    return el
  })
  return (
    <>
      {imgs}
      {percent && (
        <img src={HUD('digits/percent')} style={{ position: 'absolute', left: x, top: 6, height: 16, imageRendering: 'pixelated' }} alt="" />
      )}
    </>
  )
}

function Face() {
  const health = useGame((s) => s.health)
  const ouchUntil = useGame((s) => s.ouchUntil)
  const grinUntil = useGame((s) => s.grinUntil)
  const rampage = useGame((s) => s.rampage)
  const screen = useGame((s) => s.screen)
  const [look, setLook] = useState(0)
  const [, tickNow] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setLook([0, 1, 2][(Math.random() * 3) | 0])
      tickNow((v) => v + 1)
    }, 1200)
    return () => clearInterval(id)
  }, [])

  const tier = health > 80 ? 0 : health > 60 ? 1 : health > 40 ? 2 : health > 20 ? 3 : 4
  let src: string
  const now = performance.now()
  if (screen === 'dead' || health <= 0) src = HUD('face/dead')
  else if (now < ouchUntil) src = HUD(`face/t${tier}_ouch`)
  else if (now < grinUntil) src = HUD(`face/t${tier}_grin`)
  else if (rampage) src = HUD(`face/t${tier}_rampage`)
  else src = HUD(`face/t${tier}_look${look}`)

  return (
    <img
      src={src}
      alt=""
      style={{ position: 'absolute', left: 143, top: 1, height: 30, imageRendering: 'pixelated' }}
    />
  )
}

export function Hud() {
  const health = useGame((s) => s.health)
  const armor = useGame((s) => s.armor)
  const bullets = useGame((s) => s.bullets)
  const shells = useGame((s) => s.shells)
  const weapon = useGame((s) => s.weapon)
  const message = useGame((s) => s.message)
  const messageUntil = useGame((s) => s.messageUntil)
  const damageFlash = useGame((s) => s.damageFlash)
  const pickupFlash = useGame((s) => s.pickupFlash)
  const kills = useGame((s) => s.kills)
  const totalEnemies = useGame((s) => s.totalEnemies)

  const [showMsg, setShowMsg] = useState(false)
  useEffect(() => {
    setShowMsg(true)
    const id = setTimeout(() => setShowMsg(false), Math.max(0, messageUntil - performance.now()))
    return () => clearTimeout(id)
  }, [message, messageUntil])

  // red flash on damage
  const flashRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (damageFlash === 0) return
    const el = flashRef.current
    if (!el) return
    el.style.transition = 'none'
    el.style.opacity = '0.45'
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.5s'
      el.style.opacity = '0'
    })
  }, [damageFlash])

  // yellow flash on pickup
  const bonusRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (pickupFlash === 0) return
    const el = bonusRef.current
    if (!el) return
    el.style.transition = 'none'
    el.style.opacity = '0.22'
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.4s'
      el.style.opacity = '0'
    })
  }, [pickupFlash])

  const ammo = weapon === 'pistol' ? bullets : shells

  return (
    <>
      <div ref={flashRef} className="overlay" style={{ background: '#ff0000', opacity: 0 }} />
      <div ref={bonusRef} className="overlay" style={{ background: '#d7ba45', opacity: 0 }} />
      {showMsg && message && <div className="hud-message">{message}</div>}
      <div className="hud-kills">
        KILLS: {kills}/{totalEnemies}
      </div>
      <div className="stbar-wrap">
        <div className="stbar">
          <img src={HUD('stbar')} alt="" className="stbar-img" draggable={false} />
          <Digits value={ammo} x={44} />
          <Digits value={health} x={90} percent />
          <Digits value={armor} x={221} percent />
          <Face />
        </div>
      </div>
    </>
  )
}
