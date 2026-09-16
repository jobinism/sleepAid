import type { LayerId, LayerLevels } from './types'
import { LAYER_ORDER } from './presets'

type NoiseKind = 'white' | 'pink' | 'brown'

function createNoiseBuffer(
  ctx: AudioContext,
  kind: NoiseKind,
  seconds = 2,
): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)

  if (kind === 'white') {
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1
    }
    return buffer
  }

  if (kind === 'pink') {
    let b0 = 0
    let b1 = 0
    let b2 = 0
    let b3 = 0
    let b4 = 0
    let b5 = 0
    let b6 = 0
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.969 * b2 + white * 0.153852
      b3 = 0.8665 * b3 + white * 0.3104856
      b4 = 0.55 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.016898
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
      b6 = white * 0.115926
    }
    return buffer
  }

  // Brown / red noise
  let last = 0
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.5
  }
  return buffer
}

function createLoopSource(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  return source
}

interface LayerNodes {
  gain: GainNode
  source: AudioBufferSourceNode
  filter?: BiquadFilterNode
  lfo?: OscillatorNode
  lfoGain?: GainNode
}

/**
 * Procedural Web Audio mixer — no external audio files required.
 * Works offline once the PWA is installed.
 */
export class NoiseEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private layers = new Map<LayerId, LayerNodes>()
  private started = false
  private fading = false

  get playing(): boolean {
    return this.started && this.ctx?.state === 'running'
  }

  async ensureRunning(): Promise<void> {
    if (!this.ctx) {
      this.buildGraph()
    }
    if (!this.ctx) return
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
    if (!this.started) {
      for (const layer of this.layers.values()) {
        layer.source.start()
        layer.lfo?.start()
      }
      this.started = true
    }
  }

  async play(): Promise<void> {
    await this.ensureRunning()
  }

  async pause(): Promise<void> {
    if (!this.ctx) return
    await this.ctx.suspend()
  }

  async toggle(): Promise<boolean> {
    if (!this.ctx || this.ctx.state === 'suspended' || !this.started) {
      await this.play()
      return true
    }
    await this.pause()
    return false
  }

  setMaster(level: number): void {
    if (!this.master || !this.ctx) return
    const value = Math.max(0, Math.min(1, level))
    this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05)
  }

  setLayer(id: LayerId, level: number): void {
    const layer = this.layers.get(id)
    if (!layer || !this.ctx) return
    const value = Math.max(0, Math.min(1, level))
    // Per-layer trim so stacked layers don't clip harshly
    const trim = id === 'white' ? 0.28 : id === 'pink' ? 0.34 : id === 'brown' ? 0.42 : 0.38
    layer.gain.gain.setTargetAtTime(value * trim, this.ctx.currentTime, 0.05)
  }

  setLevels(levels: LayerLevels, master: number): void {
    this.setMaster(master)
    for (const id of LAYER_ORDER) {
      this.setLayer(id, levels[id])
    }
  }

  /** Linear fade of master gain, then suspend. */
  async fadeOut(durationSec: number): Promise<void> {
    if (!this.ctx || !this.master || this.fading) return
    this.fading = true
    const now = this.ctx.currentTime
    const current = this.master.gain.value
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(current, now)
    this.master.gain.linearRampToValueAtTime(0.0001, now + durationSec)
    await new Promise((resolve) => setTimeout(resolve, durationSec * 1000))
    await this.pause()
    this.fading = false
  }

  dispose(): void {
    for (const layer of this.layers.values()) {
      try {
        layer.source.stop()
        layer.lfo?.stop()
      } catch {
        // already stopped
      }
    }
    void this.ctx?.close()
    this.ctx = null
    this.master = null
    this.layers.clear()
    this.started = false
  }

  private buildGraph(): void {
    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(ctx.destination)

    const whiteBuf = createNoiseBuffer(ctx, 'white')
    const pinkBuf = createNoiseBuffer(ctx, 'pink')
    const brownBuf = createNoiseBuffer(ctx, 'brown')

    this.addNoiseLayer(ctx, master, 'white', whiteBuf)
    this.addNoiseLayer(ctx, master, 'pink', pinkBuf)
    this.addNoiseLayer(ctx, master, 'brown', brownBuf)
    this.addFanLayer(ctx, master, pinkBuf)
    this.addRainLayer(ctx, master, whiteBuf)

    this.ctx = ctx
    this.master = master
  }

  private addNoiseLayer(
    ctx: AudioContext,
    master: GainNode,
    id: LayerId,
    buffer: AudioBuffer,
  ): void {
    const source = createLoopSource(ctx, buffer)
    const gain = ctx.createGain()
    gain.gain.value = 0
    source.connect(gain)
    gain.connect(master)
    this.layers.set(id, { source, gain })
  }

  private addFanLayer(ctx: AudioContext, master: GainNode, buffer: AudioBuffer): void {
    const source = createLoopSource(ctx, buffer)
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 280
    filter.Q.value = 0.7

    const gain = ctx.createGain()
    gain.gain.value = 0

    // Separate stage so LFO wobble does not fight volume automation
    const mod = ctx.createGain()
    mod.gain.value = 1
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.18
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.12
    lfo.connect(lfoGain)
    lfoGain.connect(mod.gain)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(mod)
    mod.connect(master)
    this.layers.set('fan', { source, gain, filter, lfo, lfoGain })
  }

  private addRainLayer(ctx: AudioContext, master: GainNode, buffer: AudioBuffer): void {
    const source = createLoopSource(ctx, buffer)
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 1200
    filter.Q.value = 0.5

    const gain = ctx.createGain()
    gain.gain.value = 0

    const mod = ctx.createGain()
    mod.gain.value = 1
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.07
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.08
    lfo.connect(lfoGain)
    lfoGain.connect(mod.gain)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(mod)
    mod.connect(master)
    this.layers.set('rain', { source, gain, filter, lfo, lfoGain })
  }
}
