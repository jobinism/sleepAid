import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { NoiseEngine } from './audio/NoiseEngine'
import {
  LAYER_HINTS,
  LAYER_LABELS,
  LAYER_ORDER,
  PRESETS,
  TIMER_OPTIONS,
} from './audio/presets'
import { loadState, saveState } from './audio/storage'
import type { LayerId, LayerLevels, PresetId } from './audio/types'
import './App.css'

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function useOnline(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener('online', onStoreChange)
      window.addEventListener('offline', onStoreChange)
      return () => {
        window.removeEventListener('online', onStoreChange)
        window.removeEventListener('offline', onStoreChange)
      }
    },
    () => navigator.onLine,
    () => true,
  )
}

function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      ('standalone' in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone)),
  )

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = async () => {
    if (!deferred) return false
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    return choice.outcome === 'accepted'
  }

  return { canInstall: Boolean(deferred) && !installed, installed, promptInstall }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function App() {
  const engineRef = useRef<NoiseEngine | null>(null)
  const [boot] = useState(loadState)

  const [playing, setPlaying] = useState(false)
  const [levels, setLevels] = useState<LayerLevels>(boot.levels)
  const [master, setMaster] = useState(boot.master)
  const [presetId, setPresetId] = useState<PresetId>(boot.presetId)
  const [timerMinutes, setTimerMinutes] = useState<number | null>(boot.timerMinutes)
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(null)
  const [remainingMs, setRemainingMs] = useState<number | null>(null)
  const [status, setStatus] = useState('Ready when you are')
  const [error, setError] = useState<string | null>(null)

  const online = useOnline()
  const { canInstall, installed, promptInstall } = useInstallPrompt()

  useEffect(() => {
    const engine = new NoiseEngine()
    engineRef.current = engine
    engine.setLevels(boot.levels, boot.master)
    return () => engine.dispose()
  }, [boot.levels, boot.master])

  useEffect(() => {
    saveState({ levels, master, presetId, timerMinutes })
  }, [levels, master, presetId, timerMinutes])

  useEffect(() => {
    engineRef.current?.setLevels(levels, master)
  }, [levels, master])

  useEffect(() => {
    if (!timerEndsAt) {
      setRemainingMs(null)
      return
    }
    const tick = () => {
      const left = timerEndsAt - Date.now()
      setRemainingMs(left)
      if (left <= 0) {
        setTimerEndsAt(null)
        setRemainingMs(0)
        void (async () => {
          setStatus('Fading out…')
          await engineRef.current?.fadeOut(8)
          setPlaying(false)
          setStatus('Timer finished — sleep well')
        })()
      }
    }
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [timerEndsAt])

  const applyPreset = (id: Exclude<PresetId, 'custom'>) => {
    const preset = PRESETS.find((p) => p.id === id)
    if (!preset) return
    setPresetId(id)
    setLevels({ ...preset.levels })
    setMaster(preset.master)
    setStatus(`${preset.name} preset`)
  }

  const updateLayer = (id: LayerId, value: number) => {
    setPresetId('custom')
    setLevels((prev) => ({ ...prev, [id]: value }))
  }

  const handlePlayToggle = async () => {
    setError(null)
    try {
      const engine = engineRef.current
      if (!engine) return
      const next = await engine.toggle()
      setPlaying(next)
      setStatus(next ? 'Playing' : 'Paused')
      if (next && timerMinutes && !timerEndsAt) {
        setTimerEndsAt(Date.now() + timerMinutes * 60_000)
      }
    } catch {
      setError('Could not start audio. Tap again after unlocking sound on your device.')
    }
  }

  const handleTimerSelect = (minutes: number | null) => {
    setTimerMinutes(minutes)
    if (!minutes) {
      setTimerEndsAt(null)
      setStatus('Timer off')
      return
    }
    if (playing) {
      setTimerEndsAt(Date.now() + minutes * 60_000)
    } else {
      setTimerEndsAt(null)
    }
    setStatus(`${minutes} min sleep timer`)
  }

  const handleInstall = async () => {
    const ok = await promptInstall()
    setStatus(ok ? 'Installed — open from your home screen' : 'Install dismissed')
  }

  return (
    <div className={`app ${playing ? 'is-playing' : ''}`}>
      <div className="atmosphere" aria-hidden="true" />
      <div className="ripple" aria-hidden="true" />

      <header className="top">
        <p className="brand">sleepAid</p>
        <p className="tagline">Steady sound for restless ears</p>
      </header>

      <main className="stage">
        <section className="hero-block" aria-label="Playback">
          <button
            type="button"
            className={`play ${playing ? 'on' : ''}`}
            onClick={() => void handlePlayToggle()}
            aria-pressed={playing}
            aria-label={playing ? 'Pause sound' : 'Play sound'}
          >
            <span className="play-icon" aria-hidden="true">
              {playing ? '❚❚' : '▶'}
            </span>
            <span className="play-label">{playing ? 'Pause' : 'Play'}</span>
          </button>
          <p className="status" role="status">
            {error ?? status}
            {!online ? ' · Offline ready' : ''}
          </p>
        </section>

        <section className="section" aria-labelledby="presets-heading">
          <div className="section-head">
            <h2 id="presets-heading">Presets</h2>
            <p>One tap to a known-good mix</p>
          </div>
          <div className="presets" role="list">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="listitem"
                className={`preset ${presetId === preset.id ? 'active' : ''}`}
                onClick={() => applyPreset(preset.id)}
                aria-pressed={presetId === preset.id}
              >
                <span className="preset-name">{preset.name}</span>
                <span className="preset-desc">{preset.description}</span>
              </button>
            ))}
          </div>
          {presetId === 'custom' ? (
            <p className="custom-note">Custom mix — your sliders, saved on this device</p>
          ) : null}
        </section>

        <section className="section" aria-labelledby="mix-heading">
          <div className="section-head">
            <h2 id="mix-heading">Mix</h2>
            <p>Layer what helps; leave the rest at zero</p>
          </div>

          <label className="slider master">
            <span className="slider-meta">
              <span>Master</span>
              <span>{Math.round(master * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={master}
              onChange={(e) => {
                setMaster(Number(e.target.value))
                setPresetId('custom')
              }}
            />
          </label>

          <div className="layers">
            {LAYER_ORDER.map((id) => (
              <label key={id} className="slider">
                <span className="slider-meta">
                  <span>
                    {LAYER_LABELS[id]}
                    <small>{LAYER_HINTS[id]}</small>
                  </span>
                  <span>{Math.round(levels[id] * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={levels[id]}
                  onChange={(e) => updateLayer(id, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="timer-heading">
          <div className="section-head">
            <h2 id="timer-heading">Sleep timer</h2>
            <p>Fades out gently when time is up</p>
          </div>
          <div className="timers" role="group" aria-label="Sleep timer duration">
            <button
              type="button"
              className={`timer-btn ${timerMinutes === null ? 'active' : ''}`}
              onClick={() => handleTimerSelect(null)}
              aria-pressed={timerMinutes === null}
            >
              Off
            </button>
            {TIMER_OPTIONS.map((mins) => (
              <button
                key={mins}
                type="button"
                className={`timer-btn ${timerMinutes === mins ? 'active' : ''}`}
                onClick={() => handleTimerSelect(mins)}
                aria-pressed={timerMinutes === mins}
              >
                {mins}m
              </button>
            ))}
          </div>
          {remainingMs != null && remainingMs > 0 ? (
            <p className="timer-remaining" aria-live="polite">
              Fades in {formatRemaining(remainingMs)}
            </p>
          ) : null}
        </section>

        <section className="section install" aria-labelledby="install-heading">
          <div className="section-head">
            <h2 id="install-heading">On your phone</h2>
            <p>Install for a full-screen, home-screen app</p>
          </div>
          {installed ? (
            <p className="install-copy">Running as an installed app. Mixes keep playing in the foreground.</p>
          ) : canInstall ? (
            <button type="button" className="install-btn" onClick={() => void handleInstall()}>
              Install sleepAid
            </button>
          ) : (
            <p className="install-copy">
              On iPhone: Share → Add to Home Screen. On Android Chrome: menu → Install app /
              Add to Home screen.
            </p>
          )}
        </section>
      </main>

      <footer className="foot">
        <p>Built for ADHD, autistic, and AuDHD listeners who need the room to hush.</p>
      </footer>
    </div>
  )
}
