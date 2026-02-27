<template>
  <div
    class="w-screen h-screen overflow-hidden flex flex-col text-default bg-default app-bg-textured">
    <header
      v-if="!hideHeader"
      class="grid grid-cols-3 items-center w-full h-16 px-4 bg-accent"
    >
      <!-- Left (logo) -->
      <div class="justify-self-start">
        <DynamicBrandingLogo :division="divisionCode" :height="(divisionCode === 'studio' ? 16 : 12)" />
      </div>

      <!-- Center (title) -->
      <div class="justify-self-center text-center items-center text-2xl font-semibold whitespace-nowrap">
        <!-- {{ headerTitle || (route.meta.title as string) || '45Flow' }} -->
        <div
          class="flow-logo-gradient mx-auto my-auto"
          role="img"
          aria-label="45Flow"
          :style="{ '--flow-logo-src': `url(${flowLogo})` }"
        />
      </div>

      <!-- Right (menu) -->
      <div class="justify-self-end text-right flex items-center gap-2">
        <GlobalMenu v-if="showGlobalMenu" />
        <button
          class="theme-icon-btn"
          :class="darkMode ? 'theme-icon-btn--sun' : 'theme-icon-btn--moon'"
          :title="darkMode ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleDarkMode()"
        >
          <component :is="darkMode ? SunIcon : MoonIcon" class="w-6 h-6" />
        </button>
      </div>
    </header>


    <main class="flex-1 min-h-0 w-full overflow-hidden">
      <router-view />
    </main>
    <GlobalModalConfirm />
    <NotificationView />
    <UpdateBanner />
    <TransferProgressDock v-if="!hideTransfers" />
  </div>
</template>

<script setup lang="ts">
import { ref, provide, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { DynamicBrandingLogo, GlobalModalConfirm, NotificationView, reportError, reportSuccess, toggleDarkMode, useDarkModeState } from '@45drives/houston-common-ui'
import { MoonIcon, SunIcon } from '@heroicons/vue/24/outline'
import { divisionCodeInjectionKey, currentServerInjectionKey, discoveryStateInjectionKey, thisOsInjectionKey, connectionMetaInjectionKey } from '../renderer/keys/injection-keys'
import type { Server, DivisionType, DiscoveryState, ConnectionMeta } from '../renderer/types'
import { useServerDiscovery } from '../renderer/composables/useServerDiscovery'
import { useThemeFromAlias } from '../renderer/composables/useThemeFromAlias'
import { useRoute, useRouter } from 'vue-router'
import { useHeaderTitle } from '../renderer/composables/useHeaderTitle'
import { registerIpcActionListener } from "../renderer/composables/registerIpcActionListener";
import TransferProgressDock from '../renderer/components/TransferProgressDock.vue'
import UpdateBanner from '../renderer/components/UpdateBanner.vue'
import GlobalMenu from '../renderer/components/GlobalMenu.vue'
import flowLogo from '../../assets/logos/45Flow-w.png'

// provide shared refs
const currentServer = ref<Server | null>(null)
const divisionCode = ref<DivisionType>('default')
const thisOS = ref<string>('')
const route = useRoute()
const router = useRouter()
const hideHeader = computed(() => route.meta.hideHeader === true)
const { headerTitle } = useHeaderTitle()
const hideTransfers = computed(() => route.meta.hideTransfers === true)
const darkMode = useDarkModeState()
const GLOBAL_MENU_UNLOCK_KEY = '45flow-global-menu-unlock-v1'
const showGlobalMenu = ref(false)

const hasToken = computed(() => {
  if (connectionMeta.value?.token) return true
  try { return !!sessionStorage.getItem('hb_token') } catch { return false }
})

provide(currentServerInjectionKey, currentServer)
provide(divisionCodeInjectionKey, divisionCode)
provide(thisOsInjectionKey, thisOS)

const { discoveryState } = useServerDiscovery()
provide(discoveryStateInjectionKey, discoveryState as DiscoveryState)

const connectionMeta = ref<ConnectionMeta>({ port: 9095 })
provide(connectionMetaInjectionKey, connectionMeta)

const { currentDivision, setThemeControlsUnlocked } = useThemeFromAlias()

watch(currentDivision, (d) => { divisionCode.value = d as DivisionType }, { immediate: true })

let unregisterIpcListener: (() => void) | null = null
let unregisterSecretKeyListener: (() => void) | null = null

function loadGlobalMenuUnlockState() {
  try {
    return window.sessionStorage.getItem(GLOBAL_MENU_UNLOCK_KEY) === '1'
  } catch {
    return false
  }
}

function saveGlobalMenuUnlockState(unlocked: boolean) {
  try {
    window.sessionStorage.setItem(GLOBAL_MENU_UNLOCK_KEY, unlocked ? '1' : '0')
  } catch {
    // no-op
  }
}

onMounted(() => {
  const initialUnlockState = loadGlobalMenuUnlockState()
  showGlobalMenu.value = initialUnlockState
  setThemeControlsUnlocked(initialUnlockState)

  const secretToggleHandler = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase()
    const hasMainModifier = event.metaKey || event.ctrlKey
    if (!hasMainModifier || !event.shiftKey || !event.altKey || key !== 'g') return
    event.preventDefault()
    const next = !showGlobalMenu.value
    showGlobalMenu.value = next
    saveGlobalMenuUnlockState(next)
    setThemeControlsUnlocked(next)
  }

  window.addEventListener('keydown', secretToggleHandler)
  unregisterSecretKeyListener = () => window.removeEventListener('keydown', secretToggleHandler)

  const isJson = (s: string) => { try { JSON.parse(s); return true } catch { return false } }

  const notificationHandler = (_e: any, message: string) => {
    if (message.startsWith('Error')) return reportError(new Error(message))
    if (isJson(message)) {
      const m = JSON.parse(message)
      m.error ? reportError(new Error(m.error)) : reportSuccess(message)
    } else {
      reportSuccess(message)
    }
  }

  window.electron?.ipcRenderer.on('notification', notificationHandler)

  unregisterIpcListener = registerIpcActionListener({
    vueRouter: router,
  })

  onBeforeUnmount(() => {
    window.electron?.ipcRenderer.removeListener('notification', notificationHandler)
  })
})

onBeforeUnmount(() => {
  unregisterIpcListener?.()
  unregisterSecretKeyListener?.()
})
</script>

<style scoped>
.theme-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.theme-icon-btn--moon {
  color: #60a5fa;
  text-shadow: 0 0 10px rgba(96, 165, 250, 0.45);
}

.theme-icon-btn--moon:hover {
  color: #bfdbfe;
}

.theme-icon-btn--sun {
  color: #f59e0b;
  text-shadow: 0 0 10px rgba(245, 158, 11, 0.45);
}

.theme-icon-btn--sun:hover {
  color: #fde68a;
}

.flow-logo-gradient {
  width: clamp(9.5rem, 17vw, 12.25rem);
  aspect-ratio: 841 / 210;
  background: var(--btn-primary-fill);
  background-size: cover;
  -webkit-mask-image: var(--flow-logo-src);
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-image: var(--flow-logo-src);
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
}
</style>
