import type { PersistedState } from './types'
import { PRESETS, STORAGE_KEY, ZERO_LEVELS } from './presets'

const DEFAULT_STATE: PersistedState = {
  levels: { ...PRESETS[1].levels },
  master: PRESETS[1].master,
  presetId: 'sleep',
  timerMinutes: null,
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_STATE, levels: { ...DEFAULT_STATE.levels } }
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      levels: { ...ZERO_LEVELS, ...parsed.levels },
      master: typeof parsed.master === 'number' ? parsed.master : DEFAULT_STATE.master,
      presetId: parsed.presetId ?? DEFAULT_STATE.presetId,
      timerMinutes:
        parsed.timerMinutes === null || typeof parsed.timerMinutes === 'number'
          ? parsed.timerMinutes
          : null,
    }
  } catch {
    return { ...DEFAULT_STATE, levels: { ...DEFAULT_STATE.levels } }
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // private mode / quota — ignore
  }
}
