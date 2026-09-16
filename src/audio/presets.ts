import type { LayerId, LayerLevels, Preset } from './types'

export const LAYER_ORDER: LayerId[] = ['brown', 'pink', 'white', 'fan', 'rain']

export const LAYER_LABELS: Record<LayerId, string> = {
  brown: 'Brown',
  pink: 'Pink',
  white: 'White',
  fan: 'Fan',
  rain: 'Rain',
}

export const LAYER_HINTS: Record<LayerId, string> = {
  brown: 'Deep, soft rumble',
  pink: 'Balanced wash',
  white: 'Bright, full spectrum',
  fan: 'Steady mechanical hush',
  rain: 'Soft patter texture',
}

export const ZERO_LEVELS: LayerLevels = {
  white: 0,
  pink: 0,
  brown: 0,
  fan: 0,
  rain: 0,
}

export const PRESETS: Preset[] = [
  {
    id: 'focus',
    name: 'Focus',
    description: 'Pink + fan to mask chatter without harsh highs',
    master: 0.62,
    levels: { ...ZERO_LEVELS, pink: 0.7, fan: 0.45, brown: 0.2 },
  },
  {
    id: 'sleep',
    name: 'Sleep',
    description: 'Brown + rain for a low, settling bed of sound',
    master: 0.48,
    levels: { ...ZERO_LEVELS, brown: 0.85, rain: 0.4, pink: 0.15 },
  },
  {
    id: 'block',
    name: 'Block chatter',
    description: 'White + pink to cover speech and sharp room noise',
    master: 0.72,
    levels: { ...ZERO_LEVELS, white: 0.55, pink: 0.75, fan: 0.35 },
  },
]

export const TIMER_OPTIONS = [15, 30, 45, 60, 90] as const

export const STORAGE_KEY = 'sleepaid-demo-v1'
