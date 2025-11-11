// src/renderer/utils/withResilientClick.ts
import { Notification, pushNotification } from '@45drives/houston-common-ui'

export function withTimeout<T>(p: Promise<T>, ms = 15000): Promise<T> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), ms)
        p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
    })
}

export function makeResilient(handler: () => Promise<any>, opts?: { timeoutMs?: number; label?: string }) {
    const timeoutMs = opts?.timeoutMs ?? 15000
    const label = opts?.label ?? 'Request'
    return async () => {
        try {
            await withTimeout(handler(), timeoutMs)
        } catch (e: any) {
            pushNotification(new Notification('Notice', `${label} did not complete (${e?.message || 'timeout'})`, 'warning', 8000))
        }
    }
}
