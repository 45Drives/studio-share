<template>
  <div
    class="w-screen h-screen overflow-hidden flex flex-col items-center justify-center text-default bg-default text-center">
    <header v-if="!hideHeader" class="grid grid-cols-3 items-center w-full h-16 px-4">
      <!-- Left (logo) -->
      <div class="justify-self-start">
        <DynamicBrandingLogo :division="divisionCode" :height="20"/>
      </div>

      <!-- Center (title) -->
      <div class="justify-self-center text-2xl font-semibold whitespace-nowrap">
        {{ headerTitle || (route.meta.title as string) || '45Studio Sharing Software' }}
      </div>

      <!-- Right (menu) -->
      <!-- <div class="justify-self-end">
        <GlobalMenu />
      </div> -->
    </header>


    <main class="flex-1 min-h-0 w-full">
      <router-view />
    </main>
    <GlobalModalConfirm />
    <NotificationView />
  </div>
</template>

<script setup lang="ts">
import { ref, provide, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { DynamicBrandingLogo, GlobalModalConfirm, NotificationView, reportError, reportSuccess } from '@45drives/houston-common-ui'
import GlobalMenu from '../renderer/components/GlobalMenu.vue'
import { divisionCodeInjectionKey, currentServerInjectionKey, discoveryStateInjectionKey, thisOsInjectionKey } from '../renderer/keys/injection-keys'
import type { Server, DivisionType, DiscoveryState } from '../renderer/types'
import { useServerDiscovery } from '../renderer/composables/useServerDiscovery'
import { useIpcActions } from '../renderer/composables/useIpcActions'
import { useThemeFromAlias } from '../renderer/composables/useThemeFromAlias'
import { useRoute, useRouter } from 'vue-router'
import { useHeaderTitle } from '../renderer/composables/useHeaderTitle'
import { registerIpcActionListener } from "../renderer/composables/registerIpcActionListener";

// provide shared refs
const currentServer = ref<Server | null>(null)
const divisionCode = ref<DivisionType>('default')
const thisOS = ref<string>('')
const route = useRoute()
const router = useRouter()
const hideHeader = computed(() => route.meta.hideHeader === true)
const { headerTitle } = useHeaderTitle()

provide(currentServerInjectionKey, currentServer)
provide(divisionCodeInjectionKey, divisionCode)
provide(thisOsInjectionKey, thisOS)

// discovery (optional to provide globally)
const { discoveryState } = useServerDiscovery()
provide(discoveryStateInjectionKey, discoveryState as DiscoveryState)


// 🌈 THEME: hook composable and reflect division into provided ref
const { currentTheme, currentDivision, applyThemeFromAlias } = useThemeFromAlias()

watch(currentDivision, (d) => { divisionCode.value = d as DivisionType }, { immediate: true })

let unregisterIpcListener: (() => void) | null = null

// IPC → router navigation (uses currentServer IP)
useIpcActions(() => currentServer.value?.ip)

// (optional) global notifications
onMounted(() => {
  // IPC → router navigation listener
  unregisterIpcListener = registerIpcActionListener({
    vueRouter: router,
    setCurrentWizard: (w) => { /* optional: track wizard here if needed */ },
    setShowWebView: (v) => { /* optional: track webview toggle */ },
    // if you have old helpers, pass them in:
    // openStorageSetup,
    // openHoustonWindow,
    // waitForServerRebootAndShowWizard,
    // waitForServerRebootAndOpenHouston
  })

  const isJson = (s: string) => { try { JSON.parse(s); return true } catch { return false } }
  window.electron?.ipcRenderer.on('notification', (_e, message: string) => {
    if (message.startsWith('Error')) return reportError(new Error(message))
    if (isJson(message)) {
      const m = JSON.parse(message)
      m.error ? reportError(new Error(m.error)) : reportSuccess(message)
    } else reportSuccess(message)
  })
})

onBeforeUnmount(() => {
  unregisterIpcListener?.()
})
</script>
