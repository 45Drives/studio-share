// src/renderer/composables/useThemeFromAlias.ts
import { ref, watchEffect } from 'vue'

export type Theme =
  | 'theme-homelab'
  | 'theme-professional'
  | 'theme-default'
  | 'theme-studio'
  | 'theme-studio-original-purple'
  | 'theme-studio-grad-purple-orange'
  | 'theme-studio-grad-purple-pink-orange'
  | 'theme-studio-grad-pink-orange'
  | 'theme-studio-slate'
  | 'theme-studio-ocean'
  | 'theme-studio-carbon'
type Division = 'studio' | 'homelab' | 'professional' | 'default'

const aliasToTheme: Record<string, Theme> = {
  homelab: 'theme-homelab',
  professional: 'theme-professional',
  default: 'theme-default',
  studio: 'theme-studio',
}

const themeToDivision: Record<Theme, Division> = {
  'theme-homelab': 'homelab',
  'theme-professional': 'professional',
  'theme-studio': 'studio',
  'theme-studio-original-purple': 'studio',
  'theme-studio-grad-purple-orange': 'studio',
  'theme-studio-grad-purple-pink-orange': 'studio',
  'theme-studio-grad-pink-orange': 'studio',
  'theme-studio-slate': 'studio',
  'theme-studio-ocean': 'studio',
  'theme-studio-carbon': 'studio',
  'theme-default': 'default'
}

const STORAGE_KEY = 'studio-share-theme-v1'

function isTheme(value: string): value is Theme {
  return [
    'theme-default',
    'theme-homelab',
    'theme-professional',
    'theme-studio',
    'theme-studio-original-purple',
    'theme-studio-grad-purple-orange',
    'theme-studio-grad-purple-pink-orange',
    'theme-studio-grad-pink-orange',
    'theme-studio-slate',
    'theme-studio-ocean',
    'theme-studio-carbon',
  ].includes(value)
}

function loadStoredTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw && isTheme(raw) ? raw : null
  } catch {
    return null
  }
}

function saveStoredTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // no-op
  }
}

const currentTheme = ref<Theme>(loadStoredTheme() ?? 'theme-studio')
const currentDivision = ref<Division>('studio')

function setHtmlThemeClass(theme: Theme) {
  const root = document.documentElement
  root.classList.remove(
    'theme-default',
    'theme-homelab',
    'theme-professional',
    'theme-studio',
    'theme-studio-original-purple',
    'theme-studio-grad-purple-orange',
    'theme-studio-grad-purple-pink-orange',
    'theme-studio-grad-pink-orange',
    'theme-studio-slate',
    'theme-studio-ocean',
    'theme-studio-carbon'
  )
  root.classList.add(theme)
}

watchEffect(() => {
  setHtmlThemeClass(currentTheme.value)
  currentDivision.value = themeToDivision[currentTheme.value]
  saveStoredTheme(currentTheme.value)
})

/** Apply a theme using the 45Drives alias coming from the server (e.g. "homelab"|"professional") */
function applyThemeFromAlias(aliasStyle?: string) {
  const normalized = (aliasStyle || '').toLowerCase()
  const mapped = aliasToTheme[normalized]

  if (mapped && mapped !== 'theme-studio') {
    currentTheme.value = mapped
    return
  }

  // Keep selected studio variant when server reports "studio"
  if (mapped === 'theme-studio' && themeToDivision[currentTheme.value] === 'studio') {
    return
  }

  currentTheme.value = mapped ?? 'theme-studio'
}

/** Directly set a theme */
function setTheme(theme: Theme) {
  currentTheme.value = theme
}

export function useThemeFromAlias() {
  return {
    currentTheme,         // reactive (theme-homelab|theme-studio|theme-professional|theme-default)
    currentDivision,      // reactive (homelab|studio|professional|default)
    applyThemeFromAlias,  // call with aliasStyle from server info
    setTheme,             // manual setter
  }
}
