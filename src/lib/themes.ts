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
    id: 'wuthering',
    name: 'Wuthering',
    blurb: 'Blackened oak, dried-blood oxblood and moss off the moor.',
    colors: {
      canvas: '#0d0000',
      surface: '#260101',
      ink: '#e8dccb',
      muted: '#9c9382',
      accent: '#b04a2c',
      flourish: '#8a9a52',
      paper: '#140302',
    },
  },
  {
    id: 'tweed',
    name: 'Tweed',
    blurb: 'Brown tweed, pipe smoke and well-thumbed leather.',
    colors: {
      canvas: '#261b11',
      surface: '#403124',
      ink: '#eee2d3',
      muted: '#b3a291',
      accent: '#a69485',
      flourish: '#8c7968',
      paper: '#2e2218',
    },
  },
  {
    id: 'moorland',
    name: 'Moorland',
    blurb: 'Slate skies over olive heath and grey stone walls.',
    colors: {
      canvas: '#2c3740',
      surface: '#354037',
      ink: '#d9d9d9',
      muted: '#a3ab9c',
      accent: '#a4b46e',
      flourish: '#7f8f9e',
      paper: '#29332b',
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
    id: 'velvet',
    name: 'Velvet',
    blurb: 'Plum velvet and midnight blue, a box at the opera.',
    colors: {
      canvas: '#070e27',
      surface: '#0b1a3e',
      ink: '#ece0e6',
      muted: '#9a93ad',
      accent: '#c4577d',
      flourish: '#7f93cf',
      paper: '#130820',
    },
  },
  {
    id: 'cartographer',
    name: 'Cartographer',
    blurb: 'Sea-blue inks on sand-coloured charts.',
    colors: {
      canvas: '#d9d6b4',
      surface: '#ebe9d3',
      ink: '#16303f',
      muted: '#4a6f7c',
      accent: '#2d5873',
      flourish: '#8c8459',
      paper: '#ecead5',
    },
  },
  {
    id: 'scriptorium',
    name: 'Scriptorium',
    blurb: 'Vellum, iron-gall ink, a bottle-green binding and a red wax seal.',
    colors: {
      canvas: '#e8dfcc',
      surface: '#f4ecdb',
      ink: '#231c16',
      muted: '#76695a',
      accent: '#2f4a3a',
      flourish: '#8a2f2a',
      paper: '#f2eadb',
    },
  },
]

/** Earlier preset ids, mapped to the closest current theme so nobody's choice is lost. */
export const RETIRED_THEMES: Record<string, string> = {
  'reading-room': 'scriptorium',
  marginalia: 'scriptorium',
  herbarium: 'cartographer',
  atelier: 'marble',
  oxford: 'tweed',
  bodleian: 'moorland',
  nocturne: 'velvet',
  'midnight-oil': 'tweed',
  parchment: 'scriptorium',
  sage: 'cartographer',
  rosewater: 'scriptorium',
  mist: 'marble',
  lavender: 'velvet',
  candlelight: 'tweed',
  forest: 'moorland',
  midnight: 'velvet',
}

export const flourishOf = (colors: ThemeColors) => colors.flourish ?? colors.accent

export const DEFAULT_THEME_ID = 'scriptorium'

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
