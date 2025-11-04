// src/renderer/composables/useApi.ts
import { inject, computed } from 'vue'
import type { Ref } from 'vue'
import type { Server, ConnectionMeta } from '../types'
import { currentServerInjectionKey, connectionMetaInjectionKey } from '../keys/injection-keys'
import { router } from '../../app/routes'
import { pushNotification, Notification } from '@45drives/houston-common-ui'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
type ApiInit = RequestInit & {
    timeoutMs?: number
    retry?: number               // how many retries on network errors (idempotent only)
    retryDelayMs?: number        // backoff base
    parse?: 'json' | 'text' | 'auto' // default 'auto'
}

const DEFAULT_TIMEOUT = 12_000

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function shouldRetry(method?: string, err?: any) {
    const m = String(method || 'GET').toUpperCase() as HttpMethod
    // only retry safe/idempotent
    if (!['GET', 'HEAD', 'OPTIONS'].includes(m)) return false
    // retry on fetch/network/timeout errors (no Response)
    return !err || !('status' in err)
}

async function parseAuto(res: Response, mode: 'json' | 'text' | 'auto' = 'auto') {
    if (mode === 'text') return res.text()
    if (mode === 'json') {
        if (res.status === 204) return undefined
        const t = await res.text()
        return t ? JSON.parse(t) : undefined
    }
    // auto
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
        if (res.status === 204) return undefined
        const t = await res.text()
        return t ? JSON.parse(t) : undefined
    }
    return res.text()
}

export function useApi() {
    const currentServer = inject<Ref<Server | null>>(currentServerInjectionKey)!
    const meta = inject<Ref<ConnectionMeta>>(connectionMetaInjectionKey)!

    // IMPORTANT: no host building here; use what Connect2Server decided.
    const baseUrl = computed(() => meta.value.apiBase ?? '')

    async function apiFetch(path: string, init: ApiInit = {}) {
        if (!currentServer.value) throw new Error('No server selected')

        const headers = new Headers(init.headers || {})
        // Only set JSON by default if sending a body
        if (init.body && !headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json')
        }
        if (meta.value.token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${meta.value.token}`)
        }

        const urlPath = path.startsWith('/') ? path : `/${path}`
        const url = `${baseUrl.value}${urlPath}`

        const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(new DOMException('Timeout', 'AbortError')), timeoutMs)

        const method = (init.method || 'GET').toUpperCase()
        const retry = init.retry ?? 1
        const retryDelay = init.retryDelayMs ?? 500
        const parseMode = init.parse ?? 'auto'

        let lastErr: any

        for (let attempt = 0; attempt <= retry; attempt++) {
            try {
                window.appLog?.info('api.request', { url, method, attempt })
                const res = await fetch(url, { ...init, method, headers, signal: ctrl.signal })

                window.appLog?.info('api.response', { url, status: res.status })

                if (res.status === 401) {
                    // Token expired/invalid → clear and bounce to login once
                    try { sessionStorage.removeItem('hb_token') } catch { }
                    meta.value = { ...meta.value, token: undefined }
                    pushNotification(new Notification('Session expired', 'Please log in again.', 'warning', 6000))
                    router.push({ name: 'server-selection' })
                    throw Object.assign(new Error('Unauthorized'), { status: 401 })
                }

                if (!res.ok) {
                    // attempt to pull text for better error detail
                    const detail = await res.text().catch(() => res.statusText)
                    throw Object.assign(new Error(detail || `HTTP ${res.status}`), { status: res.status })
                }

                clearTimeout(timer)
                return await parseAuto(res, parseMode)

            } catch (err: any) {
                lastErr = err
                // Timeout or network? maybe retry if safe
                const aborted = err?.name === 'AbortError'
                const networkish = aborted || (err instanceof TypeError && !('status' in err))
                const canRetry = attempt < retry && (networkish || shouldRetry(method, err))
                window.appLog?.warn?.('api.request.error', { url, message: String(err?.message || err), attempt, canRetry })
                if (!canRetry) {
                    clearTimeout(timer)
                    throw err
                }
                await sleep(retryDelay * Math.pow(2, attempt)) // backoff
                // loop and try again (controller still valid)
            }
        }

        clearTimeout(timer)
        throw lastErr
    }

    return { baseUrl, apiFetch, meta }
}
