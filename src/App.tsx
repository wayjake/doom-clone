import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { GameScene } from './game/Scene'
import { Hud } from './ui/Hud'
import { WeaponView } from './ui/WeaponView'
import { MainMenu, PauseMenu } from './ui/Menus'
import { useGame } from './store'
import { game, resetGame, type InputState } from './game/engine'
import { initAudio, playSound } from './audio'
import { ALL_IMAGES } from './assets'

const emptyInput = (): InputState => ({
  forward: 0, strafe: 0, fire: false, use: false, weapon1: false, weapon2: false,
})

export default function App() {
  const screen = useGame((s) => s.screen)
  const set = useGame((s) => s.set)
  const input = useRef<InputState>(emptyInput())
  const keys = useRef<Record<string, boolean>>({})
  const canvasWrap = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)

  // preload sprites once
  useEffect(() => {
    for (const url of ALL_IMAGES) {
      const img = new Image()
      img.src = url
    }
  }, [])

  // keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true
      if (e.code === 'Tab') e.preventDefault()
    }
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // per-frame input assembly
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const k = keys.current
      const i = input.current
      i.forward = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)
      i.strafe = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
      i.use = !!(k.KeyE || k.Space)
      i.weapon1 = !!k.Digit1
      i.weapon2 = !!k.Digit2
      i.fire = i.fire || !!k.ControlLeft || !!k.ControlRight
      if (!k.ControlLeft && !k.ControlRight && !mouseDown.current) i.fire = false
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const mouseDown = useRef(false)

  // mouse look + fire while playing
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!document.pointerLockElement) return
      if (useGame.getState().screen !== 'playing') return
      game.yaw -= e.movementX * 0.0022
    }
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        mouseDown.current = true
        input.current.fire = true
      }
    }
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        mouseDown.current = false
        input.current.fire = false
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // pointer lock lifecycle: losing lock while playing = pause
  useEffect(() => {
    const onLockChange = () => {
      const s = useGame.getState().screen
      if (!document.pointerLockElement && s === 'playing') {
        set({ screen: 'paused' })
        playSound('swtchn', 0.8)
      }
    }
    document.addEventListener('pointerlockchange', onLockChange)
    return () => document.removeEventListener('pointerlockchange', onLockChange)
  }, [set])

  const lockPointer = () => {
    const el = canvasWrap.current?.querySelector('canvas')
    el?.requestPointerLock()
  }

  const startGame = () => {
    initAudio()
    resetGame()
    setStarted(true)
    set({ screen: 'playing' })
    // canvas mounts this frame; lock on next
    setTimeout(lockPointer, 60)
  }

  const resume = () => {
    set({ screen: 'playing' })
    playSound('swtchx', 0.8)
    setTimeout(lockPointer, 30)
  }

  const restart = () => {
    resetGame()
    set({ screen: 'playing' })
    setTimeout(lockPointer, 30)
  }

  const quitToMenu = () => {
    setStarted(false)
    set({ screen: 'menu' })
  }

  // dead / won: any key returns
  useEffect(() => {
    if (screen !== 'dead' && screen !== 'won') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') {
        if (screen === 'dead') restart()
        else quitToMenu()
      }
    }
    const t = setTimeout(() => window.addEventListener('keydown', onKey), 700)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey) }
  }, [screen]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      {started && (
        <div className="canvas-wrap" ref={canvasWrap} onClick={() => { if (screen === 'playing' && !document.pointerLockElement) lockPointer() }}>
          <Canvas
            gl={{ antialias: false }}
            camera={{ fov: 74, near: 0.1, far: 120 }}
            dpr={Math.min(window.devicePixelRatio, 1.5)}
          >
            <GameScene input={input} />
          </Canvas>
          {(screen === 'playing' || screen === 'paused') && (
            <>
              <WeaponView />
              <div className="crosshair" />
            </>
          )}
          {(screen === 'playing' || screen === 'paused' || screen === 'dead' || screen === 'won') && <Hud />}
          {screen === 'dead' && (
            <div className="center-text death-text">
              YOU DIED
              <span>PRESS ENTER TO TRY AGAIN</span>
            </div>
          )}
          {screen === 'won' && (
            <div className="center-text win-text">
              LEVEL COMPLETE
              <span>PRESS ENTER TO CONTINUE</span>
            </div>
          )}
        </div>
      )}
      {screen === 'menu' && <MainMenu onStart={startGame} />}
      {screen === 'paused' && <PauseMenu onResume={resume} onRestart={restart} onQuit={quitToMenu} />}
    </div>
  )
}
