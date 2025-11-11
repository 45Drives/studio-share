<template>
  <div
    class="w-screen h-screen overflow-hidden flex flex-col items-center justify-center text-default bg-default text-center">
    <header v-if="!hideHeader" class="grid grid-cols-3 items-center w-full h-16 px-4 bg-accent">
      <!-- Left (logo) -->
      <div class="justify-self-start">
        <DynamicBrandingLogo :division="divisionCode" :height="(divisionCode === 'studio' ? 16 : 12)"/>
      </div>

      <!-- Center (title) -->
      <div class="justify-self-center text-2xl font-semibold whitespace-nowrap">
        {{ headerTitle || (route.meta.title as string) || '45Studio Sharing Software' }}
      </div>

      <!-- Right (menu) -->
      <div class="justify-self-end text-right">
        <GlobalMenu />
      </div>
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
import { divisionCodeInjectionKey, currentServerInjectionKey, discoveryStateInjectionKey, thisOsInjectionKey, connectionMetaInjectionKey } from '../renderer/keys/injection-keys'
import type { Server, DivisionType, DiscoveryState, ConnectionMeta } from '../renderer/types'
import { useServerDiscovery } from '../renderer/composables/useServerDiscovery'
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

const { discoveryState } = useServerDiscovery()
provide(discoveryStateInjectionKey, discoveryState as DiscoveryState)

const connectionMeta = ref<ConnectionMeta>({ port: 9095 })
provide(connectionMetaInjectionKey, connectionMeta)

const { currentTheme, currentDivision, applyThemeFromAlias } = useThemeFromAlias()

watch(currentDivision, (d) => { divisionCode.value = d as DivisionType }, { immediate: true })

let unregisterIpcListener: (() => void) | null = null

onMounted(() => {
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
})
</script>
