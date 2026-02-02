// src/renderer/composables/useTransferProgress.ts
import { computed, reactive, ref, watch } from 'vue'
import type { ProgressItem, VersionProgressItem } from './transcodeProgress'
import { startProgressPolling } from './transcodeProgress'

type UploadStatus = 'queued' | 'uploading' | 'done' | 'canceled' | 'error'
type TranscodeStatus = 'queued' | 'running' | 'done' | 'failed' | 'unknown'

export type TransferContext = {
    linkUrl?: string
    linkTitle?: string
    files?: string[]
}

export type TransferTask =
    | {
        taskId: string
        kind: 'upload'
        title: string
        detail?: string
        status: UploadStatus
        progress: number
        speed?: string | null
        eta?: string | null
        error?: string | null
        startedAt?: number
        completedAt?: number
        cancel?: () => void
        context?: TransferContext
    }
    | {
        taskId: string
        kind: 'transcode'
        title: string
        detail?: string
        status: TranscodeStatus
        progress: number
        error?: string | null

        // exactly one of these should be set
        fileIds?: number[]
        assetVersionIds?: number[]

        // can be either file-based or version-based items
        items?: Array<ProgressItem | VersionProgressItem>

        startedAt?: number
        completedAt?: number
        stop?: () => void
        jobKind?: 'proxy_mp4' | 'hls' | 'any'
        context?: TransferContext
    }

function now() {
    return Date.now()
}

function clampPct(n: any) {
    const v = Number(n)
    if (!Number.isFinite(v)) return 0
    return Math.max(0, Math.min(100, v))
}

function makeId(prefix: string) {
    return `${prefix}_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`
}

const _state = reactive({
    open: false,
    minimized: false,
    tasks: [] as TransferTask[],
})

function upsertTask(task: TransferTask) {
    const idx = _state.tasks.findIndex(t => t.taskId === task.taskId)
    if (idx === -1) _state.tasks.unshift(task)
    else _state.tasks[idx] = task
}

function removeTask(taskId: string) {
    _state.tasks = _state.tasks.filter(t => t.taskId !== taskId)
}

function clearFinished() {
    _state.tasks = _state.tasks.filter(t => {
        if (t.kind === 'upload') return !(t.status === 'done' || t.status === 'canceled' || t.status === 'error')
        return !(t.status === 'done' || t.status === 'failed')
    })
}

export function useTransferProgress() {
    const hasActive = computed(() =>
        _state.tasks.some(t => {
            if (t.kind === 'upload') return t.status === 'uploading' || t.status === 'queued'
            return t.status === 'queued' || t.status === 'running' || t.status === 'unknown'
        })
    )

    const activeCount = computed(() =>
        _state.tasks.filter(t => {
            if (t.kind === 'upload') return t.status === 'uploading' || t.status === 'queued'
            return t.status === 'queued' || t.status === 'running' || t.status === 'unknown'
        }).length
    )

    // Auto-open dock when transfers start
    watch(
        () => hasActive.value,
        (active, wasActive) => {
            // rising edge: inactive -> active
            if (active && !wasActive) {
                _state.open = true
                // choose one behavior:
                _state.minimized = true  // open but minimized
                // _state.minimized = false // open expanded
            }
        }
    )

    watch(
        () => hasActive.value,
        (active) => {
            if (!active) {
                _state.minimized = true
                _state.open = false
            }
        }
    )


    function toggleMinimize() {
        _state.minimized = !_state.minimized
    }

    function setOpen(v: boolean) {
        _state.open = v
    }
    function createUploadTask(opts: { title: string; detail?: string; cancel?: () => void }) {
        const taskId = makeId('upl')
        const t: TransferTask = {
            taskId,
            kind: 'upload',
            title: opts.title,
            detail: opts.detail?.trim(), // trim here
            status: 'queued',
            progress: 0,
            speed: null,
            eta: null,
            error: null,
            startedAt: now(),
            cancel: opts.cancel,
        }
        upsertTask(t)
        return taskId
    }

    function updateUpload(taskId: string, patch: Partial<Extract<TransferTask, { kind: 'upload' }>>) {
        const t = _state.tasks.find(x => x.taskId === taskId && x.kind === 'upload') as
            | Extract<TransferTask, { kind: 'upload' }>
            | undefined
        if (!t) return

        if (typeof patch.detail === 'string') patch.detail = patch.detail.trim()
        Object.assign(t, patch)
        if (typeof patch.progress !== 'undefined') t.progress = clampPct(patch.progress)
    }

    function finishUpload(taskId: string, ok: boolean, err?: string) {
        if (ok) {
            updateUpload(taskId, { status: 'done', progress: 100, completedAt: now(), error: null })
        } else {
            updateUpload(taskId, { status: 'error', completedAt: now(), error: err || 'upload failed' })
        }
    }

    function cancelUpload(taskId: string) {
        const t = _state.tasks.find(x => x.taskId === taskId && x.kind === 'upload') as
            | Extract<TransferTask, { kind: 'upload' }>
            | undefined
        if (!t) return
        try {
            t.cancel?.()
        } catch { }
        updateUpload(taskId, { status: 'canceled', completedAt: now() })
    }

    // Aggregate transcode progress from items:
    // - if any failed => failed
    // - else if any running/queued => running
    // - else => done
    function summarize(items: ProgressItem[]) {
        let failed = 0
        let running = 0
        let queued = 0
        let done = 0

        let sumPct = 0
        let pctCount = 0

        for (const it of items) {
            failed += it.summary.failed || 0
            running += it.summary.running || 0
            queued += it.summary.queued || 0
            done += it.summary.done || 0

            // best-effort per-item %: average job.progress where present
            const ps = (it.jobs || [])
                .map(j => (typeof j.progress === 'number' ? j.progress : null))
                .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))

            if (ps.length) {
                const avg = ps.reduce((a, b) => a + b, 0) / ps.length
                sumPct += avg
                pctCount++
            }
        }

        const progress = pctCount ? clampPct(sumPct / pctCount) : (done > 0 && running === 0 && queued === 0 && failed === 0 ? 100 : 0)

        let status: TranscodeStatus = 'unknown'
        if (failed > 0) status = 'failed'
        else if (running > 0 || queued > 0) status = 'running'
        else if (done > 0) status = 'done'

        return { status, progress, counts: { failed, running, queued, done } }
    }

    function summarizeVersions(items: VersionProgressItem[], jobKind: 'proxy_mp4' | 'hls' | 'any' = 'any') {
        let failed = 0
        let running = 0
        let queued = 0
        let done = 0

        let sumPct = 0
        let pctCount = 0

        for (const it of items) {
            // status counts should also respect kind if you want the label to match
            const jobs = (it.jobs || []).filter(j => {
                if (jobKind === 'any') return true
                return String(j.kind || '').toLowerCase() === jobKind
            })

            for (const j of jobs) {
                const st = String(j?.status || '').toLowerCase()
                if (st === 'failed' || st === 'error') failed++
                else if (st === 'running') running++
                else if (st === 'queued') queued++
                else if (st === 'done') done++

                const p = Number(j?.progress)
                if (Number.isFinite(p)) {
                    sumPct += p
                    pctCount++
                }
            }
        }

        const progress = pctCount
            ? clampPct(sumPct / pctCount)
            : (done > 0 && running === 0 && queued === 0 && failed === 0 ? 100 : 0)

        let status: TranscodeStatus = 'unknown'
        if (failed > 0) status = 'failed'
        else if (running > 0 || queued > 0) status = 'running'
        else if (done > 0) status = 'done'

        return { status, progress, counts: { failed, running, queued, done } }
    }

    function startAssetVersionTranscodeTask(opts: {
        apiFetch: (path: string, init?: any) => Promise<any>
        assetVersionIds: number[]
        title: string
        detail?: string
        intervalMs?: number
        jobKind?: 'proxy_mp4' | 'hls' | 'any'
        context?: TransferContext // ADD
    }) {
        const taskId = makeId('trnV')
        const t: TransferTask = {
            taskId,
            kind: 'transcode',
            title: opts.title,
            detail: opts.detail,
            status: 'queued',
            progress: 0,
            error: null,
            assetVersionIds: opts.assetVersionIds.slice(),
            items: [] as VersionProgressItem[],
            startedAt: now(),
            stop: undefined,
            jobKind: opts.jobKind ?? 'any',
            context: opts.context, // ADD
        }
        upsertTask(t)

        const stop = startProgressPolling({
            apiFetch: opts.apiFetch,
            assetVersionIds: () => opts.assetVersionIds,
            intervalMs: opts.intervalMs ?? 1500,
            onUpdate: (items) => {
                const cur = _state.tasks.find(x => x.taskId === taskId && x.kind === 'transcode') as
                    | Extract<TransferTask, { kind: 'transcode' }>
                    | undefined
                if (!cur) return

                const vItems = (items || []) as VersionProgressItem[]
                cur.items = vItems

                const s = summarizeVersions(vItems, cur.jobKind ?? 'any')
                cur.status = s.status
                cur.progress = s.progress

                if (s.status === 'done' || s.status === 'failed') {
                    cur.completedAt = now()
                    try { cur.stop?.() } catch { }
                }
            },
            onError: (e) => {
                const cur = _state.tasks.find(x => x.taskId === taskId && x.kind === 'transcode') as
                    | Extract<TransferTask, { kind: 'transcode' }>
                    | undefined
                if (!cur) return
                cur.status = 'unknown'
                cur.error = (e as any)?.message || String(e)
            },
        })

            ; (t as any).stop = stop
        return taskId
    }

    function startTranscodeTask(opts: {
        apiFetch: (path: string, init?: any) => Promise<any>
        fileIds: number[]
        title: string
        detail?: string
        intervalMs?: number
    }) {
        const taskId = makeId('trn')
        const t: TransferTask = {
            taskId,
            kind: 'transcode',
            title: opts.title,
            detail: opts.detail,
            status: 'queued',
            progress: 0,
            error: null,
            fileIds: opts.fileIds.slice(),
            items: [],
            startedAt: now(),
            stop: undefined,
        }
        upsertTask(t)

        const stop = startProgressPolling({
            apiFetch: opts.apiFetch,
            fileIds: () => opts.fileIds,
            intervalMs: opts.intervalMs ?? 1500,
            onUpdate: (items) => {
                const cur = _state.tasks.find(x => x.taskId === taskId && x.kind === 'transcode') as
                    | Extract<TransferTask, { kind: 'transcode' }>
                    | undefined
                if (!cur) return

                const fItems = (items || []) as ProgressItem[]
                cur.items = fItems

                const s = summarize(fItems)
                cur.status = s.status
                cur.progress = s.progress

                if (s.status === 'done' || s.status === 'failed') {
                    cur.completedAt = now()
                    try { cur.stop?.() } catch { }
                }
            },
            onError: (e) => {
                const cur = _state.tasks.find(x => x.taskId === taskId && x.kind === 'transcode') as
                    | Extract<TransferTask, { kind: 'transcode' }>
                    | undefined
                if (!cur) return
                cur.status = 'unknown'
                cur.error = (e as any)?.message || String(e)
            },
        })

            ; (t as any).stop = stop
        return taskId
    }

    return {
        state: _state,
        hasActive,
        activeCount,
        toggleMinimize,
        setOpen,
        removeTask,
        clearFinished,

        createUploadTask,
        updateUpload,
        finishUpload,
        cancelUpload,

        startTranscodeTask,
        startAssetVersionTranscodeTask
    }
}
