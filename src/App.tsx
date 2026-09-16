import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
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

const PRESET_MARK: Record<Exclude<PresetId, 'custom'>, string> = {
  focus: 'F',
  sleep: 'S',
  block: 'B',
}

function PlayIcon({ playing }: { playing: boolean }) {
  if (playing) {
    return (
      <svg className="play-svg" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="14" y="12" width="7" height="24" rx="2" />
        <rect x="27" y="12" width="7" height="24" rx="2" />
      </svg>
    )
  }
  return (
    <svg className="play-svg" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M18 12.5v23l18-11.5L18 12.5z" />
    </svg>
  )
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
  const [mixOpen, setMixOpen] = useState(false)
  const [status, setStatus] = useState('Tap play when you are ready')
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
          setStatus('Fading out gently…')
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

  const activeLayers = useMemo(
    () => LAYER_ORDER.filter((id) => levels[id] > 0.02),
    [levels],
  )

  const presetName = useMemo(() => {
    if (presetId === 'custom') return 'Custom mix'
    return PRESETS.find((p) => p.id === presetId)?.name ?? 'Mix'
  }, [presetId])

  const timerProgress = useMemo(() => {
    if (!timerMinutes || remainingMs == null || remainingMs <= 0) return 0
    const total = timerMinutes * 60_000
    return Math.min(1, Math.max(0, 1 - remainingMs / total))
  }, [timerMinutes, remainingMs])

  const ensurePlaying = async () => {
    const engine = engineRef.current
    if (!engine) return
    if (!engine.playing) {
      await engine.play()
      setPlaying(true)
      if (timerMinutes && !timerEndsAt) {
        setTimerEndsAt(Date.now() + timerMinutes * 60_000)
      }
    }
  }

  const applyPreset = async (id: Exclude<PresetId, 'custom'>, start = true) => {
    const preset = PRESETS.find((p) => p.id === id)
    if (!preset) return
    setPresetId(id)
    setLevels({ ...preset.levels })
    setMaster(preset.master)
    setError(null)
    if (start) {
      try {
        await ensurePlaying()
        setStatus(`${preset.name} is playing`)
      } catch {
        setStatus(`${preset.name} ready — tap play`)
      }
    } else {
      setStatus(`${preset.name} selected`)
    }
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
      setStatus(next ? `${presetName} is playing` : 'Paused')
      if (next && timerMinutes && !timerEndsAt) {
        setTimerEndsAt(Date.now() + timerMinutes * 60_000)
      }
    } catch {
      setError('Could not start audio. Tap play again to unlock sound.')
    }
  }

  const handleTimerSelect = (minutes: number | null) => {
    setTimerMinutes(minutes)
    if (!minutes) {
      setTimerEndsAt(null)
      setStatus('Sleep timer off')
      return
    }
    if (playing) {
      setTimerEndsAt(Date.now() + minutes * 60_000)
      setStatus(`${minutes} min timer started`)
    } else {
      setTimerEndsAt(null)
      setStatus(`${minutes} min timer — starts with play`)
    }
  }

  const handleFadeNow = async () => {
    setTimerEndsAt(null)
    setStatus('Fading out…')
    await engineRef.current?.fadeOut(5)
    setPlaying(false)
    setStatus('Faded to silence')
  }

  const resetMix = () => {
    const sleep = PRESETS.find((p) => p.id === 'sleep')!
    setPresetId('sleep')
    setLevels({ ...sleep.levels })
    setMaster(sleep.master)
    setStatus('Back to Sleep preset')
  }

  const handleInstall = async () => {
    const ok = await promptInstall()
    setStatus(ok ? 'Installed — open from your home screen' : 'Install dismissed')
  }

  const ringStyle = {
    background: `conic-gradient(var(--warm) ${timerProgress * 360}deg, transparent 0deg)`,
  }

  return (
    <div className={`app ${playing ? 'is-playing' : ''}`}>
      <div className="atmosphere" aria-hidden="true" />
      <div className="aurora" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div className="ripple" aria-hidden="true" />

      <header className="top">
        <p className="brand">sleepAid</p>
        <p className="tagline">Steady sound for restless ears</p>
      </header>

      <main className="stage">
        <section className="hero-block" aria-label="Playback">
          <div className={`play-wrap ${remainingMs && remainingMs > 0 ? 'timed' : ''}`}>
            <div className="timer-ring" style={ringStyle} aria-hidden="true" />
            <button
              type="button"
              className={`play ${playing ? 'on' : ''}`}
              onClick={() => void handlePlayToggle()}
              aria-pressed={playing}
              aria-label={playing ? 'Pause sound' : 'Play sound'}
            >
              <PlayIcon playing={playing} />
              <span className="play-label">{playing ? 'Pause' : 'Play'}</span>
            </button>
          </div>

          <div className="now" role="status">
            <p className={`now-state ${error ? 'is-error' : ''}`}>
              {error ?? status}
              {!online ? ' · Offline ready' : ''}
            </p>
            <div className="now-meta">
              <span className="now-preset">{presetName}</span>
              {remainingMs != null && remainingMs > 0 ? (
                <span className="now-timer">Fades in {formatRemaining(remainingMs)}</span>
              ) : null}
            </div>
            {activeLayers.length > 0 ? (
              <ul className="layer-chips" aria-label="Active layers">
                {activeLayers.map((id) => (
                  <li key={id}>
                    <span className={`chip tone-${id}`}>
                      {LAYER_LABELS[id]}
                      <em>{Math.round(levels[id] * 100)}%</em>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="now-empty">Raise a layer or pick a preset to hear sound</p>
            )}
          </div>

          <div className="viz" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} className={`viz-bar b${i + 1}`} />
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="presets-heading">
          <div className="section-head">
            <h2 id="presets-heading">Choose a mood</h2>
            <p>One tap starts a known-good mix</p>
          </div>
          <div className="presets" role="list">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="listitem"
                className={`preset tone-${preset.id} ${presetId === preset.id ? 'active' : ''}`}
                onClick={() => void applyPreset(preset.id)}
                aria-pressed={presetId === preset.id}
              >
                <span className="preset-mark" aria-hidden="true">
                  {PRESET_MARK[preset.id]}
                </span>
                <span className="preset-copy">
                  <span className="preset-name">{preset.name}</span>
                  <span className="preset-desc">{preset.description}</span>
                </span>
              </button>
            ))}
          </div>
          {presetId === 'custom' ? (
            <p className="custom-note">Custom mix saved on this device</p>
          ) : null}
        </section>

        <section className="section" aria-labelledby="mix-heading">
          <div className="section-head row">
            <div>
              <h2 id="mix-heading">Fine-tune</h2>
              <p>Shape the bed of sound to your ears</p>
            </div>
            <button
              type="button"
              className="text-btn"
              onClick={() => setMixOpen((v) => !v)}
              aria-expanded={mixOpen}
              aria-controls="mix-panel"
            >
              {mixOpen ? 'Hide layers' : 'Show layers'}
            </button>
          </div>

          <label className="slider master">
            <span className="slider-meta">
              <span>Master volume</span>
              <span>{Math.round(master * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={master}
              style={{ '--fill': `${master * 100}%` } as CSSProperties}
              onChange={(e) => {
                setMaster(Number(e.target.value))
                setPresetId('custom')
              }}
            />
          </label>

          <div id="mix-panel" className={`mix-panel ${mixOpen ? 'open' : ''}`} hidden={!mixOpen}>
            <div className="layers">
              {LAYER_ORDER.map((id) => (
                <label key={id} className={`slider tone-${id} ${levels[id] > 0.02 ? 'lit' : ''}`}>
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
                    style={{ '--fill': `${levels[id] * 100}%` } as CSSProperties}
                    onChange={(e) => updateLayer(id, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
            <div className="mix-actions">
              <button type="button" className="ghost-btn" onClick={resetMix}>
                Reset to Sleep
              </button>
              {playing ? (
                <button type="button" className="ghost-btn" onClick={() => void handleFadeNow()}>
                  Fade out now
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="timer-heading">
          <div className="section-head">
            <h2 id="timer-heading">Sleep timer</h2>
            <p>Gentle fade when the night is done</p>
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
                {mins}
                <span>min</span>
              </button>
            ))}
          </div>
        </section>

        {!installed ? (
          <section className="section install" aria-labelledby="install-heading">
            <div className="section-head">
              <h2 id="install-heading">Keep it close</h2>
              <p>Add sleepAid to your home screen</p>
            </div>
            {canInstall ? (
              <button type="button" className="install-btn" onClick={() => void handleInstall()}>
                Install sleepAid
              </button>
            ) : (
              <p className="install-copy">
                iPhone: Share → Add to Home Screen. Android: browser menu → Install app.
              </p>
            )}
          </section>
        ) : null}
      </main>

      <footer className="foot">
        <p>Made for ADHD, autistic, and AuDHD listeners who need the room to hush.</p>
      </footer>
    </div>
  )
}
