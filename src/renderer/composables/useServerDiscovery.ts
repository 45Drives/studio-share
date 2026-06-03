// useServerDiscovery.ts
import { reactive, onMounted, onBeforeUnmount } from 'vue'
import type { Server } from '../types'
import { loadSavedManualServers } from './useSessionPersistence'

export function useServerDiscovery() {
  const discoveryState = reactive<{ servers: Server[]; fallbackTriggered: boolean }>({
    servers: [],
    fallbackTriggered: false,
  })

  // Pre-populate with any manually-saved servers from previous sessions
  const savedManual = loadSavedManualServers()
  for (const s of savedManual) {
    discoveryState.servers.push({
      ip: s.ip,
      name: s.name || s.ip,
      lastSeen: s.savedAt,
      status: 'unknown',
      manuallyAdded: true,
    })
  }

  function mergeServer(server: Server) {
    const idx = discoveryState.servers.findIndex(s => s.ip === server.ip)
    if (idx > -1) {
      const current = discoveryState.servers[idx]
      // Don't overwrite a real hostname with an IP
      const hasRealHostname = server.name && server.name !== server.ip
      // Don't let a stale saved/registry name override a live mDNS name
      const currentIsLive = !current.manuallyAdded && !current.fallbackAdded
      const incomingIsStale = server.manuallyAdded || server.registryDiscovered
      const nameToUse = hasRealHostname
        ? (currentIsLive && incomingIsStale && current.name && current.name !== current.ip
          ? current.name
          : server.name)
        : current.name
      const updated = {
        ...current, ...server,
        name: nameToUse,
        fallbackAdded: server.fallbackAdded ?? (hasRealHostname ? false : current.fallbackAdded),
      }
      discoveryState.servers.splice(idx, 1, updated)
    } else {
      discoveryState.servers.push(server)
    }
  }

  function sortServers() {
    discoveryState.servers.sort((a, b) => {
      if (a.name === a.ip && b.name !== b.ip) return 1
      if (a.name !== a.ip && b.name === b.ip) return -1
      return 0
    })
  }

  function onDiscovered(_evt:any, mdnsList: Server[]) {
    mdnsList.forEach(m => mergeServer(m))
    sortServers()
  }

  async function runFallbackScanOnce() {
    if (discoveryState.fallbackTriggered) return
    discoveryState.fallbackTriggered = true
    try {
      const fallback: Server[] = await window.electron.ipcRenderer.invoke('scan-network-fallback')
      const toAdd = fallback.filter(fb => !discoveryState.servers.some(existing => existing.ip === fb.ip))
      if (toAdd.length) {
        discoveryState.servers.push(...toAdd)
        sortServers()
      }
    } catch (err) {
      console.error('Fallback scan failed:', err)
    }
  }

  onMounted(async () => {
    window.electron?.ipcRenderer.on('discovered-servers', onDiscovered)
    
    // Check if running from AppImage (mDNS won't work, so trigger fallback immediately)
    const isAppImage = await window.electron?.ipcRenderer.invoke('is-appimage').catch(() => false)
    
    if (isAppImage) {
      // AppImage: mDNS multicast is often blocked, so use fallback immediately
      console.log('[discovery] AppImage detected - using fallback network scan immediately')
      setTimeout(runFallbackScanOnce, 300)
    } else {
      // Standard install: wait a bit to give mDNS time to discover servers first
      setTimeout(runFallbackScanOnce, 1200)
    }
  })

  onBeforeUnmount(() => {
    window.electron?.ipcRenderer.removeListener?.('discovered-servers', onDiscovered)
  })

  return { discoveryState }
}
