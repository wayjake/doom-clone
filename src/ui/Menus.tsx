// Main menu and pause menu, built from the ripped menu graphics with the
// animated skull cursor and classic menu blip sounds.
import { useEffect, useState, useCallback } from 'react'
import { MENU } from '../assets'
import { initAudio, playSound } from '../audio'
import { useGame } from '../store'

interface Item {
  img: string
  action: () => void
  enabled?: boolean
}

function SkullMenu({ items, title, logo }: { items: Item[]; title?: string; logo?: boolean }) {
  const [sel, setSel] = useState(0)
  const [skullFrame, setSkullFrame] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setSkullFrame((f) => f ^ 1), 260)
    return () => clearInterval(id)
  }, [])

  const activate = useCallback((i: number) => {
    const it = items[i]
    if (it.enabled === false) {
      playSound('noway', 0.7)
      return
    }
    playSound('pstop')
    it.action()
  }, [items])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        setSel((s) => (s + 1) % items.length)
        playSound('pstop', 0.6)
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        setSel((s) => (s + items.length - 1) % items.length)
        playSound('pstop', 0.6)
      } else if (e.code === 'Enter' || e.code === 'Space') {
        activate(sel)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, sel, activate])

  return (
    <div className="menu-screen" onMouseMove={() => initAudio()}>
      {logo && (
        <div className="menu-logo">
          <img src={MENU('logo_doom')} alt="DOOM" draggable={false} />
        </div>
      )}
      {title && (
        <div className="menu-title">
          <img src={MENU(title)} alt="" draggable={false} />
        </div>
      )}
      <div className="menu-items">
        {items.map((it, i) => (
          <div
            key={it.img}
            className="menu-item"
            onMouseEnter={() => { if (sel !== i) { setSel(i); playSound('pstop', 0.5) } }}
            onClick={() => { initAudio(); activate(i) }}
          >
            <img
              src={MENU(`skull${skullFrame + 1}`)}
              alt=""
              className="menu-skull"
              style={{ visibility: sel === i ? 'visible' : 'hidden' }}
              draggable={false}
            />
            <img
              src={MENU(it.img)}
              alt={it.img}
              draggable={false}
              style={{ opacity: it.enabled === false ? 0.45 : 1 }}
            />
          </div>
        ))}
      </div>
      <div className="menu-hint">ARROWS / MOUSE TO SELECT &nbsp;·&nbsp; ENTER / CLICK TO CONFIRM</div>
    </div>
  )
}

export function MainMenu({ onStart }: { onStart: () => void }) {
  return (
    <SkullMenu
      logo
      items={[
        { img: 'newgame', action: () => { initAudio(); playSound('swtchn'); onStart() } },
        { img: 'options', action: () => {}, enabled: false },
        { img: 'readthis', action: () => {}, enabled: false },
        { img: 'quitgame', action: () => { playSound('swtchx'); window.close() } },
      ]}
    />
  )
}

export function PauseMenu({ onResume, onRestart, onQuit }: { onResume: () => void; onRestart: () => void; onQuit: () => void }) {
  return (
    <div className="pause-overlay">
      <SkullMenu
        title="pause"
        items={[
          { img: 'savegame', action: () => {}, enabled: false },
          { img: 'loadgame', action: () => {}, enabled: false },
          { img: 'newgame', action: onRestart },
          { img: 'quitgame', action: onQuit },
        ]}
      />
      <div className="pause-resume-hint">PRESS ESC TO RESUME</div>
      <ResumeOnEsc onResume={onResume} />
    </div>
  )
}

function ResumeOnEsc({ onResume }: { onResume: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onResume()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onResume])
  return null
}
