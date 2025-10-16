// src/renderer/composables/useApi.ts
import { inject, computed } from 'vue'
import type { Ref } from 'vue'
import type { Server, ConnectionMeta } from '../types'
import { currentServerInjectionKey, connectionMetaInjectionKey } from '../keys/injection-keys'

export function useApi() {
    const currentServer = inject<Ref<Server | null>>(currentServerInjectionKey)!
    const meta = inject<Ref<ConnectionMeta>>(connectionMetaInjectionKey)!

    // IMPORTANT: no host building here; use what Connect2Server decided.
    const baseUrl = computed(() => meta.value.apiBase ?? '')

    async function apiFetch(path: string, init: RequestInit = {}) {
        if (!currentServer.value) throw new Error('No server selected')
        const headers = new Headers(init.headers || {})
        headers.set('Content-Type', 'application/json')
        if (meta.value.token) headers.set('Authorization', `Bearer ${meta.value.token}`)

        // path must start with '/'
        const url = `${baseUrl.value}${path.startsWith('/') ? path : `/${path}`}`
        const res = await fetch(url, { ...init, headers })
        if (!res.ok) {
            const msg = await res.text().catch(() => res.statusText)
            throw new Error(msg || `HTTP ${res.status}`)
        }
        console.log('token:', meta.value.token); // temporarily
        const text = await res.text()
        return text ? JSON.parse(text) : undefined
    }

    return { baseUrl, apiFetch, meta }
}
