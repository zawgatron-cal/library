import { DEFAULT_THEME_ID, type PageMode, type Theme } from './themes'

export const UI_FONTS = {
  nunito: { label: 'Nunito', family: "'Nunito Variable', system-ui, sans-serif", note: 'Rounded & friendly' },
  fraunces: { label: 'Fraunces', family: "'Fraunces Variable', Georgia, serif", note: 'Soft old-style serif' },
  literata: { label: 'Literata', family: "'Literata Variable', Georgia, serif", note: 'Made for books' },
  atkinson: { label: 'Atkinson', family: "'Atkinson Hyperlegible', system-ui, sans-serif", note: 'Extra legible' },
  system: { label: 'System', family: 'system-ui, -apple-system, sans-serif', note: "Your computer's own" },
} as const

export type UiFont = keyof typeof UI_FONTS

export const ROUNDNESS = { crisp: 0.25, soft: 0.75, round: 1.25 } as const
export type Roundness = keyof typeof ROUNDNESS

export type Settings = {
  themeId: string
  customThemes: Theme[]
  pageMode: 'auto' | PageMode
  /** 0–100, how strongly pages take on the theme's paper colour */
  tintStrength: number
  uiFont: UiFont
  uiScale: number
  roundness: Roundness
  grain: boolean
  reduceMotion: boolean
  pageGap: number
  spread: boolean
  dailyGoalMinutes: number
}

export const DEFAULT_SETTINGS: Settings = {
  themeId: DEFAULT_THEME_ID,
  customThemes: [],
  pageMode: 'auto',
  tintStrength: 70,
  uiFont: 'nunito',
  uiScale: 1,
  roundness: 'soft',
  grain: true,
  reduceMotion: false,
  pageGap: 20,
  spread: false,
  dailyGoalMinutes: 20,
}
