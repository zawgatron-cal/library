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
    id: 'reading-room',
    name: 'Reading Room',
    blurb: 'Oxblood bindings and brass lamps over old paper.',
    colors: {
      canvas: '#ece3d0',
      surface: '#f6efdf',
      ink: '#2a211c',
      muted: '#7a6a58',
      accent: '#7b2d26',
      flourish: '#a07a35',
      paper: '#f3eadb',
    },
  },
  {
    id: 'marginalia',
    name: 'Marginalia',
    blurb: 'Iron-gall ink, vermilion rubrics and lapis, as in an illuminated manuscript.',
    colors: {
      canvas: '#ebe5d8',
      surface: '#f6f2e8',
      ink: '#1e2733',
      muted: '#6b6f78',
      accent: '#a63d2a',
      flourish: '#2f5175',
      paper: '#f4efe3',
    },
  },
  {
    id: 'herbarium',
    name: 'Herbarium',
    blurb: 'Pressed ferns and rust-red labels on linen.',
    colors: {
      canvas: '#e6e3d3',
      surface: '#f2f0e3',
      ink: '#252c22',
      muted: '#6c7363',
      accent: '#4d6a3c',
      flourish: '#a65a2e',
      paper: '#efecdc',
    },
  },
  {
    id: 'atelier',
    name: 'Atelier',
    blurb: "Slate blue and ochre, a painter's study in north light.",
    colors: {
      canvas: '#e7e3db',
      surface: '#f3f0ea',
      ink: '#26282d',
      muted: '#737069',
      accent: '#3d5a6c',
      flourish: '#b9852f',
      paper: '#f0ece3',
    },
  },
  {
    id: 'oxford',
    name: 'Oxford',
    blurb: 'Walnut panelling, oxblood leather and brass by lamplight.',
    colors: {
      canvas: '#191310',
      surface: '#231b16',
      ink: '#eadbc0',
      muted: '#a08c74',
      accent: '#b04f3d',
      flourish: '#c9a25a',
      paper: '#1f1813',
    },
  },
  {
    id: 'bodleian',
    name: 'Bodleian',
    blurb: 'Green-shaded lamps and gilt spines after hours.',
    colors: {
      canvas: '#111a15',
      surface: '#18241d',
      ink: '#e4dbc5',
      muted: '#8f9a88',
      accent: '#c8a256',
      flourish: '#c0675a',
      paper: '#15201a',
    },
  },
  {
    id: 'nocturne',
    name: 'Nocturne',
    blurb: 'Midnight ink, claret and candle gold.',
    colors: {
      canvas: '#11141d',
      surface: '#191d29',
      ink: '#e6dfce',
      muted: '#8d91a0',
      accent: '#b65d6e',
      flourish: '#cfae6c',
      paper: '#151925',
    },
  },
  {
    id: 'midnight-oil',
    name: 'Midnight Oil',
    blurb: 'Umber pages, an amber lamp and a sage-green blotter.',
    colors: {
      canvas: '#1a150f',
      surface: '#241d15',
      ink: '#f0e1c4',
      muted: '#a69479',
      accent: '#d9954c',
      flourish: '#8fa57c',
      paper: '#211a13',
    },
  },
]

/** Earlier preset ids, mapped to the closest current theme so nobody's choice is lost. */
export const RETIRED_THEMES: Record<string, string> = {
  parchment: 'reading-room',
  sage: 'herbarium',
  rosewater: 'marginalia',
  mist: 'atelier',
  lavender: 'marginalia',
  candlelight: 'midnight-oil',
  forest: 'bodleian',
  midnight: 'nocturne',
}

export const flourishOf = (colors: ThemeColors) => colors.flourish ?? colors.accent

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
