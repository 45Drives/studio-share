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



// // src/renderer/composables/useApi.ts
// import { inject, computed } from 'vue'
// import type { Ref } from 'vue'
// import type { Server, ConnectionMeta } from '../types'
// import { currentServerInjectionKey, connectionMetaInjectionKey } from '../keys/injection-keys'

// /**
//  * Improvements:
//  * - Adds request timeout via AbortController (default 15s).
//  * - Handles 401 by attempting a single silent refresh, then retries the original request once.
//  * - Works with either cookie-based refresh OR JSON { token } responses.
//  * - Parses JSON only when Content-Type is JSON; otherwise returns text/void.
//  * - Produces a recognizable error code 'SESSION_EXPIRED' so the UI can show a relogin modal.
//  */

// const TIMEOUT_MS = 15000

// let isRefreshing = false
// let pendingRefresh: Promise<boolean> | null = null

// export function useApi() {
//     const currentServer = inject<Ref<Server | null>>(currentServerInjectionKey)!
//     const meta = inject<Ref<ConnectionMeta>>(connectionMetaInjectionKey)!

//     // IMPORTANT: no host building here; use what Connect2Server decided.
//     const baseUrl = computed(() => meta.value.apiBase ?? '')

//     async function apiFetch(path: string, init: RequestInit = {}) {
//         if (!currentServer.value) throw new Error('No server selected')

//         // Build URL (path must start with '/')
//         const url = `${baseUrl.value}${path.startsWith('/') ? path : `/${path}`}`

//         // Build headers (don’t force JSON for GET without body)
//         const headers = new Headers(init.headers || {})
//         if (!headers.has('Content-Type') && init.body) {
//             headers.set('Content-Type', 'application/json')
//         }
//         if (meta.value.token) {
//             headers.set('Authorization', `Bearer ${meta.value.token}`)
//         }

//         // One-shot executor so we can retry once after refresh
//         const doRequest = async (): Promise<any> => {
//             const controller = new AbortController()
//             const t = setTimeout(() => controller.abort(), TIMEOUT_MS)
//             try {
//                 const res = await fetch(url, { ...init, headers, signal: controller.signal, credentials: 'include' })
//                 if (res.status === 401) throw Object.assign(new Error('Unauthorized'), { code: 401 })

//                 if (!res.ok) {
//                     // Try to extract text for better messages
//                     const msg = await res.text().catch(() => res.statusText)
//                     throw new Error(msg || `HTTP ${res.status}`)
//                 }

//                 // Parse only if JSON
//                 const ctype = res.headers.get('Content-Type') || ''
//                 if (ctype.includes('application/json')) return res.json()
//                 const text = await res.text()
//                 return text || undefined
//             } catch (err: any) {
//                 if (err?.name === 'AbortError') {
//                     throw new Error('Request timed out')
//                 }
//                 throw err
//             } finally {
//                 clearTimeout(t)
//             }
//         }

//         try {
//             return await doRequest()
//         } catch (err: any) {
//             // Handle expired/invalid access token: try a single silent refresh.
//             if (err?.code === 401) {
//                 const refreshed = await trySilentRefresh(baseUrl.value, meta)
//                 if (refreshed) {
//                     // Retry once with updated token
//                     const retryHeaders = new Headers(init.headers || {})
//                     if (!retryHeaders.has('Content-Type') && init.body) {
//                         retryHeaders.set('Content-Type', 'application/json')
//                     }
//                     if (meta.value.token) retryHeaders.set('Authorization', `Bearer ${meta.value.token}`)
//                     return doRequest()
//                 }
//                 // Bubble a normalized error the UI can key on
//                 const e = new Error('Session expired. Please log in again.')
//                     ; (e as any).code = 'SESSION_EXPIRED'
//                 throw e
//             }
//             throw err
//         }
//     }

//     return { baseUrl, apiFetch, meta }
// }

// /**
//  * Attempts a cookie- or JSON-based refresh flow:
//  * - POST {base}/api/auth/refresh with credentials: 'include'
//  * - Accepts either:
//  *    a) 200 with JSON { token: '...' } → update meta.value.token
//  *    b) 200 with no body (cookie-only sessions) → consider refreshed
//  * - Debounces concurrent 401s so only one refresh happens.
//  */
// async function trySilentRefresh(base: string, meta: Ref<ConnectionMeta>): Promise<boolean> {
//     if (isRefreshing && pendingRefresh) return pendingRefresh

//     isRefreshing = true
//     pendingRefresh = (async () => {
//         try {
//             const res = await fetch(`${base}/api/auth/refresh`, {
//                 method: 'POST',
//                 credentials: 'include',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: '{}',
//             })

//             if (!res.ok) return false

//             // If server returns a fresh token, store it.
//             const ctype = res.headers.get('Content-Type') || ''
//             if (ctype.includes('application/json')) {
//                 const data = await res.json().catch(() => ({}))
//                 if (data?.token && typeof data.token === 'string') {
//                     meta.value = { ...meta.value, token: data.token }
//                 }
//             }
//             return true
//         } catch {
//             return false
//         } finally {
//             isRefreshing = false
//             pendingRefresh = null
//         }
//     })()

//     return pendingRefresh
// }
