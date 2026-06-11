// WebAudio sound manager. All Doom sfx are short wavs; we decode once and
// play through a shared context with per-shot gain for distance attenuation.

const NAMES = [
  'pistol', 'shotgun', 'sgcock', 'wpnup',
  'plpain', 'pldeth', 'oof', 'noway',
  'itemup', 'getpow',
  'doropn', 'dorcls',
  'swtchn', 'swtchx', 'pstop', 'stnmov',
  'firsht', 'firxpl', 'barexp',
  'sklatk', 'skldth', 'dmpain', 'dmact',
  'bgsit', 'bgdth', 'bgact', 'popain',
  'kntsit', 'kntdth',
  'pesit', 'pepain',
  'slop', 'telept', 'pstart',
] as const

export type SoundName = (typeof NAMES)[number]

let ctx: AudioContext | null = null
const buffers = new Map<string, AudioBuffer>()
let loading = false

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }
  ctx = new AudioContext()
  if (!loading) {
    loading = true
    for (const n of NAMES) {
      fetch(`/sounds/${n}.wav`)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx!.decodeAudioData(b))
        .then((buf) => buffers.set(n, buf))
        .catch(() => {})
    }
  }
}

export function playSound(name: SoundName, volume = 1) {
  if (!ctx) return
  const buf = buffers.get(name)
  if (!buf || volume <= 0.01) return
  const src = ctx.createBufferSource()
  src.buffer = buf
  const gain = ctx.createGain()
  gain.gain.value = Math.min(1, volume)
  src.connect(gain)
  gain.connect(ctx.destination)
  src.start()
}

// volume falloff with distance, Doom-ishly steep
export function playAt(name: SoundName, dist: number, base = 1) {
  const v = base * Math.max(0, 1 - dist / 28)
  playSound(name, v)
}
