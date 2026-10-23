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

export const PRESET_THEMES: Theme[] = [
  {
    id: 'parchment',
    name: 'Parchment',
    blurb: 'Old paper, walnut ink and sand.',
    colors: {
      canvas: '#ebe4d6',
      surface: '#f6f2ea',
      ink: '#2e2924',
      muted: '#6f665c',
      accent: '#7a5a43',
      flourish: '#9a8870',
      paper: '#f3ede2',
    },
  },
  {
    id: 'sage',
    name: 'Sage',
    blurb: 'Pale greens for long afternoons by a window.',
    colors: {
      canvas: '#dfe2d8',
      surface: '#f1f2ec',
      ink: '#232a24',
      muted: '#5f685f',
      accent: '#4f6b55',
      flourish: '#7f8d7c',
      paper: '#eceee5',
    },
  },
  {
    id: 'mist',
    name: 'Mist',
    blurb: 'Cool morning greys with a hint of blue.',
    colors: {
      canvas: '#d8dce0',
      surface: '#f1f3f4',
      ink: '#1f262d',
      muted: '#5b6670',
      accent: '#3e5a70',
      flourish: '#7b8995',
      paper: '#eaedef',
    },
  },
  {
    id: 'marble',
    name: 'Marble',
    blurb: 'Plaster casts, grey marble and a verdigris pen.',
    colors: {
      canvas: '#d9d7cc',
      surface: '#f2f2f2',
      ink: '#1d2826',
      muted: '#595959',
      accent: '#0f403b',
      flourish: '#8f8c80',
      paper: '#ebeae3',
    },
  },
  {
    id: 'candlelight',
    name: 'Candlelight',
    blurb: 'Smoked oak and a low amber flame.',
    colors: {
      canvas: '#141210',
      surface: '#242120',
      ink: '#ebe3d6',
      muted: '#9b9285',
      accent: '#c9a87a',
      flourish: '#8a7a64',
      paper: '#1c1a17',
    },
  },
  {
    id: 'apothecary',
    name: 'Apothecary',
    blurb: 'Dark glass bottles, dried sage and pewter labels.',
    colors: {
      canvas: '#0c0c0d',
      surface: '#242426',
      ink: '#e2e8e1',
      muted: '#90948d',
      accent: '#8fa694',
      flourish: '#7c949a',
      paper: '#1a1b17',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    blurb: 'Inky blue-greys for reading under the stars.',
    colors: {
      canvas: '#0b0d12',
      surface: '#1f2229',
      ink: '#dfe3ea',
      muted: '#8a909c',
      accent: '#8e9fbd',
      flourish: '#6c7891',
      paper: '#16191f',
    },
  },
  {
    id: 'dusk',
    name: 'Dusk',
    blurb: 'Faded violet and ash, for late-night poetry.',
    colors: {
      canvas: '#0f0d10',
      surface: '#252227',
      ink: '#e6e0e8',
      muted: '#958e98',
      accent: '#a895ab',
      flourish: '#7d7282',
      paper: '#1a181b',
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
