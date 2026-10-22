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
    blurb: 'Warm paper and terracotta, like an old reading room.',
    colors: {
      canvas: '#f3ede2',
      surface: '#faf6ee',
      ink: '#3d342b',
      muted: '#8b7f71',
      accent: '#b5694a',
      paper: '#f8f1e3',
    },
  },
  {
    id: 'sage',
    name: 'Sage',
    blurb: 'Soft greens for long afternoons by a window.',
    colors: {
      canvas: '#ebeee3',
      surface: '#f5f7ef',
      ink: '#2f3a2f',
      muted: '#7a8574',
      accent: '#6b8f5e',
      paper: '#f2f4e8',
    },
  },
  {
    id: 'rosewater',
    name: 'Rosewater',
    blurb: 'Blush tones, gentle and quiet.',
    colors: {
      canvas: '#f5e9e6',
      surface: '#fcf4f2',
      ink: '#4a3334',
      muted: '#9a7f7f',
      accent: '#c0737d',
      paper: '#fbf1ee',
    },
  },
  {
    id: 'mist',
    name: 'Mist',
    blurb: 'Cool morning greys with a hint of blue.',
    colors: {
      canvas: '#e9edf1',
      surface: '#f5f7f9',
      ink: '#2e3440',
      muted: '#7b8494',
      accent: '#5f7fae',
      paper: '#f5f6f8',
    },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    blurb: 'Dusky violets for late-night poetry.',
    colors: {
      canvas: '#edeaf3',
      surface: '#f7f5fb',
      ink: '#36304a',
      muted: '#857f99',
      accent: '#8770bb',
      paper: '#f6f3fa',
    },
  },
  {
    id: 'candlelight',
    name: 'Candlelight',
    blurb: 'Deep amber dark mode that is easy on tired eyes.',
    colors: {
      canvas: '#1f1a16',
      surface: '#29231d',
      ink: '#ecdfcb',
      muted: '#a69680',
      accent: '#e0a458',
      paper: '#251f1a',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    blurb: 'Moss and pine after dusk.',
    colors: {
      canvas: '#181e1a',
      surface: '#212923',
      ink: '#dde6d8',
      muted: '#8f9e8f',
      accent: '#9cc28a',
      paper: '#1d241f',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    blurb: 'Inky blues for reading under the stars.',
    colors: {
      canvas: '#171a24',
      surface: '#1f2331',
      ink: '#dce1ee',
      muted: '#8a92aa',
      accent: '#93a9e6',
      paper: '#1b1f2b',
    },
  },
]

export const DEFAULT_THEME_ID = PRESET_THEMES[0].id

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
