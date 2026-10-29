export type ThemeColors = {
  /** App background behind everything */
  canvas: string
  /** Panels, cards, toolbars */
  surface: string
  /** Primary text */
  ink: string
  /** Secondary text */
  muted: string
  /** Buttons, progress, focus rings */
  accent: string
  /** Colour PDF pages are tinted towards */
  paper: string
  /** A second, contrasting accent for ornament: progress, eyebrows, gilt edges. Themes made before it existed lack it. */
  flourish?: string
}

export type Theme = {
  id: string
  name: string
  blurb: string
  colors: ThemeColors
  custom?: boolean
}

export type PageMode = 'original' | 'tint' | 'night'

/**
 * Eight quiet e-ink / paper presets. Light themes stay near #FDFBF7 paper with #1A1A1A ink;
 * dark themes invert the same matte, high-contrast idea. Accents are ink-weight so UI stays monochrome.
 */
export const PRESET_THEMES: Theme[] = [
  {
    id: 'parchment',
    name: 'Parchment',
    blurb: 'Warm paper and black ink — the classic e-ink page.',
    colors: {
      canvas: '#EFEBE3',
      surface: '#FBF8F1',
      ink: '#1A1A1A',
      muted: '#4A4A4A',
      accent: '#1A1A1A',
      flourish: '#5C5346',
      paper: '#FDFBF7',
    },
  },
  {
    id: 'sage',
    name: 'Sage',
    blurb: 'Paper with a faint green-grey cast, like a field journal.',
    colors: {
      canvas: '#E8EBE4',
      surface: '#F4F6F0',
      ink: '#1A1A1A',
      muted: '#4A4A4A',
      accent: '#1A1A1A',
      flourish: '#4A554A',
      paper: '#F5F7F2',
    },
  },
  {
    id: 'mist',
    name: 'Mist',
    blurb: 'Cool grey paper for a newspaper morning.',
    colors: {
      canvas: '#E6E8EB',
      surface: '#F3F4F6',
      ink: '#1A1A1A',
      muted: '#4A4A4A',
      accent: '#1A1A1A',
      flourish: '#4A4E54',
      paper: '#F4F5F7',
    },
  },
  {
    id: 'marble',
    name: 'Marble',
    blurb: 'Stone-white paper and graphite lines.',
    colors: {
      canvas: '#E8E7E3',
      surface: '#F4F3EF',
      ink: '#1A1A1A',
      muted: '#4A4A4A',
      accent: '#1A1A1A',
      flourish: '#555555',
      paper: '#F5F5F3',
    },
  },
  {
    id: 'candlelight',
    name: 'Candlelight',
    blurb: 'A dark e-ink panel with warm paper-white text.',
    colors: {
      canvas: '#141210',
      surface: '#1A1816',
      ink: '#FDFBF7',
      muted: '#A8A29A',
      accent: '#F5F5F5',
      flourish: '#8A847C',
      paper: '#1A1816',
    },
  },
  {
    id: 'apothecary',
    name: 'Apothecary',
    blurb: 'Matte dark green-grey, like a slate label.',
    colors: {
      canvas: '#121412',
      surface: '#1A1C1A',
      ink: '#F5F7F5',
      muted: '#9A9E9A',
      accent: '#F0F2F0',
      flourish: '#7A847A',
      paper: '#181A18',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    blurb: 'Inky blue-grey e-ink for late reading.',
    colors: {
      canvas: '#101218',
      surface: '#16181E',
      ink: '#F5F6F8',
      muted: '#9A9EA6',
      accent: '#F0F1F3',
      flourish: '#6E7482',
      paper: '#14161C',
    },
  },
  {
    id: 'dusk',
    name: 'Dusk',
    blurb: 'Ash-violet slate for quiet night pages.',
    colors: {
      canvas: '#121014',
      surface: '#1A181C',
      ink: '#F7F5F8',
      muted: '#A09AA6',
      accent: '#F2F0F3',
      flourish: '#7A7480',
      paper: '#18161A',
    },
  },
]

/** Earlier preset ids, mapped to the closest current theme so nobody's choice is lost. */
export const RETIRED_THEMES: Record<string, string> = {
  scriptorium: 'parchment',
  cartographer: 'mist',
  wuthering: 'candlelight',
  tweed: 'candlelight',
  moorland: 'apothecary',
  velvet: 'dusk',
  'reading-room': 'parchment',
  marginalia: 'parchment',
  herbarium: 'sage',
  atelier: 'mist',
  oxford: 'candlelight',
  bodleian: 'apothecary',
  nocturne: 'midnight',
  'midnight-oil': 'candlelight',
  rosewater: 'parchment',
  lavender: 'dusk',
  forest: 'apothecary',
}

export const flourishOf = (colors: ThemeColors) => colors.flourish ?? colors.accent

export const DEFAULT_THEME_ID = 'parchment'

export const DEFAULT_THEME = PRESET_THEMES.find((t) => t.id === DEFAULT_THEME_ID)!

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function luminance(hex: string) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function isDark(colors: ThemeColors) {
  return luminance(colors.canvas) < 0.2
}

function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Text colour that reads best on top of the accent. */
export function onAccent(colors: ThemeColors) {
  const [light, dark] = luminance(colors.canvas) > luminance(colors.ink) ? [colors.surface, colors.ink] : [colors.ink, colors.canvas]
  // Light text on mid-tone accents feels softer than near-black, so allow a lower bar for it.
  return contrastRatio(light, colors.accent) >= 2.8 ? light : dark
}

export function defaultPageMode(colors: ThemeColors): PageMode {
  return isDark(colors) ? 'night' : 'tint'
}
