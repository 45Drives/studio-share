import { ref, watch } from 'vue'

const STORAGE_KEY = '45flow:timeFormat'

function loadPreference(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === '24') return false
    if (v === '12') return true
  } catch {}
  // Default: 12-hour
  return true
}

/** Shared reactive — all consumers see the same value */
const hour12 = ref(loadPreference())

watch(hour12, (v) => {
  try { localStorage.setItem(STORAGE_KEY, v ? '12' : '24') } catch {}
})

export function useTimeFormat() {
  return { hour12 }
}
