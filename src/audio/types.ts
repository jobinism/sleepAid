export type LayerId = 'white' | 'pink' | 'brown' | 'fan' | 'rain'

export type LayerLevels = Record<LayerId, number>

export type PresetId = 'focus' | 'sleep' | 'block' | 'custom'

export interface Preset {
  id: Exclude<PresetId, 'custom'>
  name: string
  description: string
  levels: LayerLevels
  master: number
}

export interface PersistedState {
  levels: LayerLevels
  master: number
  presetId: PresetId
  timerMinutes: number | null
}
