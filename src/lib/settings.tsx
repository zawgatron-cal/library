import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useLocalStorage } from './hooks'
import { DEFAULT_SETTINGS, ROUNDNESS, UI_FONTS, type Settings } from './preferences'
import { PRESET_THEMES, RETIRED_THEMES, defaultPageMode, flourishOf, isDark, onAccent, type PageMode, type Theme } from './themes'

type SettingsContextValue = {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  themes: Theme[]
  theme: Theme
  pageMode: PageMode
  dark: boolean
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useLocalStorage<Settings>('library:settings', DEFAULT_SETTINGS)

  const themes = useMemo(() => [...PRESET_THEMES, ...settings.customThemes], [settings.customThemes])
  const themeId = RETIRED_THEMES[settings.themeId] ?? settings.themeId
  const theme = themes.find((t) => t.id === themeId) ?? PRESET_THEMES[0]
  const uiFont = UI_FONTS[settings.uiFont] ?? UI_FONTS[DEFAULT_SETTINGS.uiFont]
  const dark = isDark(theme.colors)
  const pageMode = settings.pageMode === 'auto' ? defaultPageMode(theme.colors) : settings.pageMode

  useEffect(() => {
    const root = document.documentElement
    const { colors } = theme
    root.style.setProperty('--canvas', colors.canvas)
    root.style.setProperty('--surface', colors.surface)
    root.style.setProperty('--ink', colors.ink)
    root.style.setProperty('--muted', colors.muted)
    root.style.setProperty('--accent', colors.accent)
    root.style.setProperty('--flourish', flourishOf(colors))
    root.style.setProperty('--paper', colors.paper)
    root.style.setProperty('--on-accent', onAccent(colors))
    root.style.setProperty('--ui-font', uiFont.family)
    root.style.setProperty('--radius-unit', `${ROUNDNESS[settings.roundness]}rem`)
    root.style.setProperty('--tint-strength', `${settings.tintStrength / 100}`)
    root.style.fontSize = `${settings.uiScale * 16}px`
    root.dataset.dark = String(dark)
    root.dataset.grain = String(settings.grain)
    root.dataset.reduceMotion = String(settings.reduceMotion)
    root.style.colorScheme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.canvas)
  }, [theme, dark, uiFont, settings.roundness, settings.tintStrength, settings.uiScale, settings.grain, settings.reduceMotion])

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      update: (patch) => setSettings((s) => ({ ...s, ...patch })),
      themes,
      theme,
      pageMode,
      dark,
    }),
    [settings, setSettings, themes, theme, pageMode, dark],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>')
  return ctx
}
