// src/renderer/composables/useApi.ts
import { inject, ref, computed } from 'vue'
import type { Ref } from 'vue'
import type { Server, DivisionType, DiscoveryState, ConnectionMeta } from '../types'
import { currentServerInjectionKey, connectionMetaInjectionKey } from '../keys/injection-keys'

export function useApi() {
    const currentServer = inject<Ref<Server | null>>(currentServerInjectionKey)!
    const meta = inject<Ref<ConnectionMeta>>(connectionMetaInjectionKey)!

    const baseUrl = computed(() => {
        const s = currentServer.value
        if (!s) return ''
        if (meta.value.httpsHost) return `https://${meta.value.httpsHost}`
        return `http://${s.ip}:${meta.value.port}`
    })

    async function apiFetch(path: string, init: RequestInit = {}) {
        if (!currentServer.value) throw new Error('No server selected')
        const headers = new Headers(init.headers || {})
        headers.set('Content-Type', 'application/json')
        if (meta.value.token) headers.set('Authorization', `Bearer ${meta.value.token}`)
        const res = await fetch(`${baseUrl.value}${path}`, { ...init, headers })
        if (!res.ok) {
            const msg = await res.text().catch(() => res.statusText)
            throw new Error(msg || `HTTP ${res.status}`)
        }
        const text = await res.text()
        return text ? JSON.parse(text) : undefined
    }

    return { baseUrl, apiFetch, meta }
}