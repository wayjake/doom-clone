// The 3D world: instanced level geometry, sky, billboard sprites for enemies,
// projectiles and pickups. Drives the simulation from useFrame.
import { useMemo, useRef, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CELL, WALL_H, MAP_ROWS, H, W, tile } from './map'
import { game, tick, EYE, type InputState } from './engine'
import { ENEMY_ANIMS, FIREBALL_FLY, FIREBALL_BOOM, PICKUP_SPRITES, TEX } from '../assets'
import { useGame } from '../store'

const texLoader = new THREE.TextureLoader()
const texCache = new Map<string, THREE.Texture>()
function loadTex(url: string): THREE.Texture {
  let t = texCache.get(url)
  if (!t) {
    t = texLoader.load(url)
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestFilter
    t.colorSpace = THREE.SRGBColorSpace
    texCache.set(url, t)
  }
  return t
}

// independent texture instance (for per-use wrap/repeat settings)
function loadTexFresh(url: string, configure?: (t: THREE.Texture) => void): THREE.Texture {
  const t = texLoader.load(url, (loaded) => {
    if (configure) configure(loaded)
    loaded.needsUpdate = true
  })
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.colorSpace = THREE.SRGBColorSpace
  if (configure) configure(t)
  return t
}

// ---------- level geometry ----------

const WALL_TEX_FOR: Record<string, string> = {
  '#': TEX('wall_main'),
  B: TEX('wall_brick'),
  C: TEX('wall_comp'),
  c: TEX('wall_comp2'),
  R: TEX('wall_rock'),
}

function Walls() {
  const groups = useMemo(() => {
    const byTex: Record<string, [number, number][]> = {}
    for (let z = 0; z < H; z++)
      for (let x = 0; x < W; x++) {
        const t = MAP_ROWS[z][x]
        const url = WALL_TEX_FOR[t]
        if (url) (byTex[url] ||= []).push([x, z])
      }
    return byTex
  }, [])
  return (
    <>
      {Object.entries(groups).map(([url, cells]) => (
        <WallGroup key={url} url={url} cells={cells} />
      ))}
    </>
  )
}

function WallGroup({ url, cells }: { url: string; cells: [number, number][] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const tex = useMemo(() => {
    const t = loadTex(url)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    return t
  }, [url])
  useEffect(() => {
    const m = ref.current!
    const mat = new THREE.Matrix4()
    cells.forEach(([x, z], i) => {
      mat.setPosition((x + 0.5) * CELL, WALL_H / 2, (z + 0.5) * CELL)
      m.setMatrixAt(i, mat)
    })
    m.instanceMatrix.needsUpdate = true
  }, [cells])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]} frustumCulled={false}>
      <boxGeometry args={[CELL, WALL_H, CELL]} />
      <meshBasicMaterial map={tex} />
    </instancedMesh>
  )
}

function Doors() {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const tex = useMemo(() => loadTex(TEX('door')), [])
  useFrame(() => {
    game.doors.forEach((d, i) => {
      const m = refs.current[i]
      if (m) m.position.y = WALL_H / 2 + d.open * (WALL_H - 0.25)
    })
  })
  return (
    <>
      {game.doors.map((d, i) => (
        <mesh
          key={`${d.cx},${d.cz}`}
          ref={(el) => { refs.current[i] = el }}
          position={[(d.cx + 0.5) * CELL, WALL_H / 2, (d.cz + 0.5) * CELL]}
        >
          <boxGeometry args={[CELL, WALL_H, CELL * 0.35]} />
          <meshBasicMaterial map={tex} />
        </mesh>
      ))}
    </>
  )
}

function FloorCeil() {
  const floorTex = useMemo(
    () => loadTexFresh(TEX('floor_main'), (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(W, H)
    }),
    [],
  )
  const nukTex = useMemo(() => loadTex(TEX('nukage')), [])
  const exitTex = useMemo(() => loadTex(TEX('exit')), [])
  const ceilTex = useMemo(() => loadTex(TEX('ceil_main')), [])
  const lightTex = useMemo(() => loadTex(TEX('ceil_light')), [])

  const { nukage, exit, ceiling, lights } = useMemo(() => {
    const nukage: [number, number][] = []
    const exit: [number, number][] = []
    const ceiling: [number, number][] = []
    const lights: [number, number][] = []
    for (let z = 0; z < H; z++)
      for (let x = 0; x < W; x++) {
        const t = tile(x, z)
        if (t === 'N') nukage.push([x, z])
        if (t === 'X') exit.push([x, z])
        if (t !== 'O' && !WALL_TEX_FOR[t]) {
          // light strip down long corridors: every 3rd cell on even rows
          if ((x + z) % 5 === 0) lights.push([x, z])
          else ceiling.push([x, z])
        }
      }
    return { nukage, exit, ceiling, lights }
  }, [])

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[(W * CELL) / 2, 0, (H * CELL) / 2]}>
        <planeGeometry args={[W * CELL, H * CELL]} />
        <meshBasicMaterial map={floorTex} />
      </mesh>
      <CellPlanes cells={nukage} tex={nukTex} y={0.02} up />
      <CellPlanes cells={exit} tex={exitTex} y={0.02} up />
      <CellPlanes cells={ceiling} tex={ceilTex} y={WALL_H} up={false} />
      <CellPlanes cells={lights} tex={lightTex} y={WALL_H} up={false} />
    </>
  )
}

function CellPlanes({ cells, tex, y, up }: { cells: [number, number][]; tex: THREE.Texture; y: number; up: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const mat = new THREE.Matrix4()
    const rot = new THREE.Matrix4().makeRotationX(up ? -Math.PI / 2 : Math.PI / 2)
    cells.forEach(([x, z], i) => {
      mat.copy(rot).setPosition((x + 0.5) * CELL, y, (z + 0.5) * CELL)
      m.setMatrixAt(i, mat)
    })
    m.instanceMatrix.needsUpdate = true
  }, [cells, y, up])
  if (!cells.length) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]} frustumCulled={false}>
      <planeGeometry args={[CELL, CELL]} />
      <meshBasicMaterial map={tex} />
    </instancedMesh>
  )
}

function Sky() {
  const tex = useMemo(
    () => loadTexFresh(TEX('sky1'), (t) => {
      t.wrapS = THREE.RepeatWrapping
      t.repeat.set(3, 1)
    }),
    [],
  )
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    // bottom of the texture (the mountains) sits at floor level
    if (ref.current) ref.current.position.set(game.px, 17.5, game.pz)
  })
  return (
    <mesh ref={ref}>
      <cylinderGeometry args={[55, 55, 36, 32, 1, true]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} />
    </mesh>
  )
}

// ---------- billboard sprite helper ----------

function useSpriteMat(url: string) {
  return useMemo(() => {
    const tex = loadTex(url)
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })
  }, [url])
}

// world size from native pixel size: 1 Doom pixel = 1 map unit = 4m/128
const PX = 1 / 32

function spriteSize(url: string): [number, number] {
  const tex = texCache.get(url)
  const img = tex?.image as HTMLImageElement | undefined
  if (img && img.width) return [img.width * PX, img.height * PX]
  return [1.4, 1.4]
}

// ---------- enemies ----------

function EnemySprites() {
  // one mesh per enemy; texture swapped imperatively
  const meshRefs = useRef<Map<number, THREE.Mesh>>(new Map())
  const [, force] = useState(0)
  const enemies = game.enemies

  // preload all enemy textures once
  useMemo(() => {
    for (const anims of Object.values(ENEMY_ANIMS))
      for (const arr of [anims.walk, anims.attack, anims.pain, anims.die])
        for (const u of arr) loadTex(u)
  }, [])

  useEffect(() => {
    const id = setInterval(() => force((v) => v + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useFrame(({ camera }) => {
    for (const e of enemies) {
      const m = meshRefs.current.get(e.id)
      if (!m) continue
      const anims = ENEMY_ANIMS[e.kind]
      let frames: string[]
      let fps = 6
      let loop = true
      let t = e.animT
      switch (e.state) {
        case 'attack': frames = anims.attack; fps = anims.attack.length / 0.9; t = e.stateT; loop = false; break
        case 'pain': frames = anims.pain; t = e.stateT; loop = false; break
        case 'die': case 'dead': frames = anims.die; fps = 1 / 0.13; t = e.stateT; loop = false; break
        default: frames = anims.walk
      }
      let idx = Math.floor(t * fps)
      idx = loop ? idx % frames.length : Math.min(idx, frames.length - 1)
      if (e.state === 'dead') idx = frames.length - 1
      const url = frames[idx]
      const mat = m.material as THREE.MeshBasicMaterial
      const tex = loadTex(url)
      if (mat.map !== tex) {
        mat.map = tex
        mat.needsUpdate = true
      }
      const [w, h] = spriteSize(url)
      m.scale.set(w, h, 1)
      const yBase = e.flying && e.state !== 'die' && e.state !== 'dead' ? e.y - h / 2 : 0
      m.position.set(e.x, yBase + h / 2 + 0.02, e.z)
      // upright billboard: face camera around Y only
      m.rotation.y = Math.atan2(camera.position.x - e.x, camera.position.z - e.z)
      m.visible = !(e.state === 'dead' && e.kind === 'banshee')
    }
  })

  return (
    <>
      {enemies.map((e) => (
        <mesh key={e.id} ref={(el) => { if (el) meshRefs.current.set(e.id, el); else meshRefs.current.delete(e.id) }}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial transparent alphaTest={0.4} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  )
}

// ---------- projectiles ----------

const MAX_PROJ = 32
function Projectiles() {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  useMemo(() => { [...FIREBALL_FLY, ...FIREBALL_BOOM].forEach(loadTex) }, [])
  useFrame(({ camera }) => {
    for (let i = 0; i < MAX_PROJ; i++) {
      const m = refs.current[i]
      if (!m) continue
      const p = game.projectiles[i]
      if (!p || !p.alive) { m.visible = false; continue }
      m.visible = true
      let url: string
      if (p.boomT > 0) {
        const idx = Math.min(FIREBALL_BOOM.length - 1, Math.floor(p.boomT / 0.15))
        url = FIREBALL_BOOM[idx]
      } else {
        url = FIREBALL_FLY[Math.floor(game.time * 8) % FIREBALL_FLY.length]
      }
      const mat = m.material as THREE.MeshBasicMaterial
      const tex = loadTex(url)
      if (mat.map !== tex) {
        mat.map = tex
        mat.needsUpdate = true
      }
      const [w, h] = spriteSize(url)
      const s = p.boomT > 0 ? 1.6 : 1.2
      m.scale.set(w * s, h * s, 1)
      m.position.set(p.x, p.y, p.z)
      m.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z)
    }
  })
  return (
    <>
      {Array.from({ length: MAX_PROJ }, (_, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el }} visible={false}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial transparent alphaTest={0.35} side={THREE.DoubleSide} fog={false} />
        </mesh>
      ))}
    </>
  )
}

// ---------- pickups ----------

function Pickups() {
  const refs = useRef<Map<number, THREE.Mesh>>(new Map())
  useMemo(() => { Object.values(PICKUP_SPRITES).forEach(loadTex) }, [])
  useFrame(({ camera }) => {
    for (const p of game.pickups) {
      const m = refs.current.get(p.id)
      if (!m) continue
      m.visible = !p.taken
      if (p.taken) continue
      const url = PICKUP_SPRITES[p.kind]
      const mat = m.material as THREE.MeshBasicMaterial
      const tex = loadTex(url)
      if (mat.map !== tex) {
        mat.map = tex
        mat.needsUpdate = true
      }
      const [w, h] = spriteSize(url)
      const s = 1.15
      m.scale.set(w * s, h * s, 1)
      m.position.set(p.x, (m.scale.y / 2) + 0.02, p.z)
      m.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z)
    }
  })
  return (
    <>
      {game.pickups.map((p) => (
        <mesh key={p.id} ref={(el) => { if (el) refs.current.set(p.id, el); else refs.current.delete(p.id) }}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial transparent alphaTest={0.4} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  )
}

// ---------- camera + simulation driver ----------

function Driver({ input }: { input: React.MutableRefObject<InputState> }) {
  const { camera, scene } = useThree()
  useEffect(() => {
    ;(window as unknown as { __scene: THREE.Scene }).__scene = scene
  }, [scene])
  const screen = useGame((s) => s.screen)
  useFrame((_, dt) => {
    if (screen === 'playing') tick(dt, input.current)
    camera.rotation.order = 'YXZ'
    camera.rotation.y = game.yaw
    if (!game.alive) {
      // sink and tilt on death
      const t = Math.min(1, game.deathT * 1.4)
      camera.position.set(game.px, EYE - t * 0.85, game.pz)
      camera.rotation.z = t * 0.5
    } else {
      camera.position.set(game.px, EYE + game.bob, game.pz)
      camera.rotation.z = 0
      camera.rotation.x = 0
    }
  })
  return null
}

export function GameScene({ input }: { input: React.MutableRefObject<InputState> }) {
  return (
    <>
      <color attach="background" args={['#000000']} />
      <fog attach="fog" args={['#000000', 8, 52]} />
      <Sky />
      <Walls />
      <Doors />
      <FloorCeil />
      <EnemySprites />
      <Projectiles />
      <Pickups />
      <Driver input={input} />
    </>
  )
}
