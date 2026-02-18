// src/renderer/composables/useTransferProgress.ts
import { computed, reactive, watch } from 'vue'
import type { ProgressItem, VersionProgressItem } from './transcodeProgress'
import { startProgressPolling } from './transcodeProgress'

type UploadStatus = 'queued' | 'uploading' | 'done' | 'canceled' | 'error'
type TranscodeStatus = 'queued' | 'running' | 'done' | 'failed' | 'unknown'

export type TransferContext = {
    source: 'link' | 'upload'
    groupId?: string          // stable id shared by upload+transcode for same action
    linkUrl?: string
    linkTitle?: string
    destDir?: string          // for uploads
    file?: string             // single file for this specific task (preferred for grouping)
    files?: string[]          // optional; avoid using this for per-file grouping
    proxyQualities?: string[] // requested proxy qualities snapshot for cumulative progress math
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

type PlaybackProgressSnapshot = {
    status?: string
    progress?: number | null
    items?: any[]
    qualityOrder?: string[]
    activeQuality?: string
    perQualityProgress?: Record<string, number>
}

function now() {
    return Date.now()
}

function clampPct(n: any) {
    const v = Number(n)
    if (!Number.isFinite(v)) return 0
    return Math.max(0, Math.min(100, v))
}

function normalizeProgressPercent(n: any) {
    const v = Number(n)
    if (!Number.isFinite(v)) return 0
    // Some backends report [0..1], others [0..100]
    const pct = (v > 0 && v <= 1) ? v * 100 : v
    return clampPct(pct)
}

function makeId(prefix: string) {
    return `${prefix}_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`
}

function qualityLabel(q: string) {
    const s = String(q || '').trim().toLowerCase()
    if (!s) return ''
    if (s === 'original') return 'Original'
    return s
}

function proxyDetailFromProgress(progress: number, qualities?: string[]) {
    const list = normalizeQualityList(qualities)
    if (!list.length) return 'Tracking proxy'
    const chunk = 100 / list.length
    const p = clampPct(progress)
    const idx = Math.min(list.length - 1, Math.floor(p / chunk))
    const current = qualityLabel(list[idx])
    return current ? `Tracking proxy (${current})` : 'Tracking proxy'
}

function proxyDetailFromActiveQuality(activeQuality?: string, progress?: number, qualities?: string[]) {
    const q = qualityLabel(activeQuality || '')
    if (q) return `Tracking proxy (${q})`
    return proxyDetailFromProgress(progress ?? 0, qualities)
}

function proxyActiveQualityProgress(activeQuality: any, perQualityProgress: any): number | null {
    const key = String(activeQuality || '').trim().toLowerCase()
    if (!key || !perQualityProgress || typeof perQualityProgress !== 'object') return null
    const raw = (perQualityProgress as any)[key]
    const pct = normalizeProgressPercent(raw)
    if (!Number.isFinite(pct)) return null
    return pct
}

const proxyQualityOrder = ['720p', '1080p', 'original'] as const

function normalizeQualityList(list: unknown): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of Array.isArray(list) ? list : []) {
        const q = String(raw || '').trim().toLowerCase()
        if (!q || seen.has(q)) continue
        seen.add(q)
        out.push(q)
    }
    out.sort((a, b) => {
        const ia = proxyQualityOrder.indexOf(a as any)
        const ib = proxyQualityOrder.indexOf(b as any)
        const sa = ia === -1 ? Number.MAX_SAFE_INTEGER : ia
        const sb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib
        if (sa !== sb) return sa - sb
        return a.localeCompare(b)
    })
    return out
}

function isProxyJobKind(kind: unknown) {
    const k = String(kind || '').toLowerCase()
    return k === 'proxy_mp4' || k.startsWith('proxy_mp4:')
}

function kindMatchesForSummary(kind: unknown, wanted: 'proxy_mp4' | 'hls' | 'any') {
    if (wanted === 'any') return true
    const k = String(kind || '').toLowerCase()
    if (wanted === 'proxy_mp4') return isProxyJobKind(k)
    return k === wanted
}

function proxyQualityFromJob(j: any): string | null {
    const rawQuality = j?.quality
        ?? j?.proxyQuality
        ?? j?.targetQuality
        ?? j?.outputQuality
        ?? j?.meta?.quality
        ?? j?.metadata?.quality
        ?? j?.payload?.quality
        ?? j?.params?.quality
        ?? j?.options?.quality
        ?? j?.job_data?.quality

    const direct = String(rawQuality || '').trim().toLowerCase()
    if (direct) return direct

    const kind = String(j?.kind || '').toLowerCase()
    const m = kind.match(/^proxy_mp4[:_/-]([a-z0-9]+p?|original)$/i)
    if (m?.[1]) return String(m[1]).toLowerCase()

    return null
}

function proxyJobProgress(j: any) {
    const st = String(j?.status || '').toLowerCase()
    if (st === 'done') return 100
    return normalizeProgressPercent(j?.progress)
}

function summarizeProxyCumulativeProgress(jobs: any[], expectedQualities?: string[]) {
    const proxyJobs = (jobs || []).filter(j => isProxyJobKind(j?.kind))
    if (!proxyJobs.length) return null

    const expected = normalizeQualityList(expectedQualities)
    const found = normalizeQualityList(proxyJobs.map(proxyQualityFromJob).filter(Boolean))
    const qualities = expected.length ? expected : found

    // If the backend doesn't expose quality labels yet, fall back to previous behavior.
    if (!qualities.length) {
        const ps = proxyJobs
            .map(proxyJobProgress)
            .filter((n: number) => Number.isFinite(n))
        if (!ps.length) return 0
        return clampPct(ps.reduce((a: number, b: number) => a + b, 0) / ps.length)
    }

    const byQuality = new Map<string, number>()
    for (const q of qualities) byQuality.set(q, 0)
    let matchedQualityJobs = 0

    for (const j of proxyJobs) {
        const q = proxyQualityFromJob(j)
        if (!q || !byQuality.has(q)) continue
        const next = proxyJobProgress(j)
        if (next > (byQuality.get(q) || 0)) byQuality.set(q, next)
        matchedQualityJobs++
    }

    // Backend may emit one unlabeled proxy job whose progress is already cumulative.
    if (matchedQualityJobs === 0) {
        const ps = proxyJobs
            .map(proxyJobProgress)
            .filter((n: number) => Number.isFinite(n))
        if (!ps.length) return 0
        return clampPct(ps.reduce((a: number, b: number) => a + b, 0) / ps.length)
    }

    let sum = 0
    for (const q of qualities) sum += byQuality.get(q) || 0
    return clampPct(sum / qualities.length)
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

function isActiveTask(t: TransferTask) {
    if (t.kind === 'upload') return t.status === 'uploading' || t.status === 'queued'
    return t.status === 'queued' || t.status === 'running' || t.status === 'unknown'
}

function isFinishedTask(t: TransferTask) {
    if (t.kind === 'upload') return t.status === 'done' || t.status === 'canceled' || t.status === 'error'
    return t.status === 'done' || t.status === 'failed'
}

function jobKindMatches(taskKind?: 'proxy_mp4' | 'hls' | 'any', want?: 'proxy_mp4' | 'hls' | 'any') {
    if (!want || want === 'any') return true
    if (!taskKind || taskKind === 'any') return true
    return taskKind === want
}

function taskHasFile(t: Extract<TransferTask, { kind: 'transcode' }>, file: string) {
    const ctx = t.context
    if (!ctx) return false
    if (ctx.file && ctx.file === file) return true
    if (Array.isArray(ctx.files) && ctx.files.includes(file)) return true
    return false
}

function hasActiveTranscode(opts: {
    assetVersionIds?: number[]
    file?: string
    jobKind?: 'proxy_mp4' | 'hls' | 'any'
}) {
    const ids = Array.from(new Set((opts.assetVersionIds || [])
        .map(n => Number(n))
        .filter(n => Number.isFinite(n) && n > 0)))

    const file = (opts.file || '').trim()

    if (!ids.length && !file) return false

    return _state.tasks.some(t => {
        if (t.kind !== 'transcode') return false
        if (!isActiveTask(t)) return false
        if (!jobKindMatches(t.jobKind, opts.jobKind)) return false

        if (ids.length) {
            const taskIds = t.assetVersionIds || []
            return ids.some(id => taskIds.includes(id))
        }

        return file ? taskHasFile(t, file) : false
    })
}

function hasActiveTranscodeForFile(file: string, jobKind?: 'proxy_mp4' | 'hls' | 'any') {
    if (!file) return false
    return hasActiveTranscode({ file, jobKind })
}

function hasActiveTranscodeForFileId(fileId: number, jobKind?: 'proxy_mp4' | 'hls' | 'any') {
    const fid = Number(fileId)
    if (!Number.isFinite(fid) || fid <= 0) return false
    return _state.tasks.some(t => {
        if (t.kind !== 'transcode') return false
        if (!isActiveTask(t)) return false
        if (!jobKindMatches(t.jobKind, jobKind)) return false
        const ids = (t.fileIds || []).map(Number)
        return ids.includes(fid)
    })
}

function findActiveTranscodeTaskByIds(opts: {
    mode: 'file' | 'version'
    ids: number[]
    jobKind?: 'proxy_mp4' | 'hls' | 'any'
}) {
    const ids = Array.from(new Set((opts.ids || [])
        .map(n => Number(n))
        .filter(n => Number.isFinite(n) && n > 0)))
    if (!ids.length) return null

    for (const t of _state.tasks) {
        if (t.kind !== 'transcode') continue
        if (!isActiveTask(t)) continue
        if (!jobKindMatches(t.jobKind, opts.jobKind)) continue

        const taskIds = (opts.mode === 'version'
            ? (t.assetVersionIds || [])
            : (t.fileIds || [])
        ).map(Number)

        if (ids.some(id => taskIds.includes(id))) return t
    }
    return null
}

function splitActiveTranscodeAssetVersions(assetVersionIds: number[], jobKind?: 'proxy_mp4' | 'hls' | 'any') {
    const ids = Array.from(new Set((assetVersionIds || [])
        .map(n => Number(n))
        .filter(n => Number.isFinite(n) && n > 0)))

    const active: number[] = []
    const inactive: number[] = []

    for (const id of ids) {
        if (hasActiveTranscode({ assetVersionIds: [id], jobKind })) active.push(id)
        else inactive.push(id)
    }

    return { active, inactive }
}

function removeTask(taskId: string) {
    _state.tasks = _state.tasks.filter(t => t.taskId !== taskId)
}

function clearFinished() {
    _state.tasks = _state.tasks.filter(t => !isFinishedTask(t))
}

export function useTransferProgress() {
    const hasActive = computed(() =>
        _state.tasks.some(t => isActiveTask(t))
    )

    const activeCount = computed(() =>
        _state.tasks.filter(t => isActiveTask(t)).length
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

    function createUploadTask(opts: {
        title: string
        detail?: string
        cancel?: () => void
        context?: TransferContext
    }) {
        const taskId = makeId('upl')
        const t: TransferTask = {
            taskId,
            kind: 'upload',
            title: opts.title,
            detail: opts.detail?.trim(),
            status: 'queued',
            progress: 0,
            speed: null,
            eta: null,
            error: null,
            startedAt: now(),
            cancel: opts.cancel,
            context: opts.context,
        }
        upsertTask(t)
        return taskId
    }

    function updateUpload(
        taskId: string,
        patch: Partial<Extract<TransferTask, { kind: 'upload' }>>
    ) {
        const t = _state.tasks.find(x => x.taskId === taskId && x.kind === 'upload') as
            | Extract<TransferTask, { kind: 'upload' }>
            | undefined
        if (!t) return

        const nextStatus = patch.status
        if (t.status === 'canceled' && nextStatus && nextStatus !== 'canceled') return
        if ((t.status === 'done' || t.status === 'error') && (nextStatus === 'queued' || nextStatus === 'uploading')) return

        if (typeof patch.detail === 'string') patch.detail = patch.detail.trim()
        Object.assign(t, patch)
        if (typeof patch.progress !== 'undefined') t.progress = clampPct(patch.progress)
    }

    function finishUpload(taskId: string, ok: boolean, err?: string) {
        const t = _state.tasks.find(x => x.taskId === taskId && x.kind === 'upload') as
            | Extract<TransferTask, { kind: 'upload' }>
            | undefined
        if (!t) return
        if (t.status === 'canceled') {
            updateUpload(taskId, { status: 'canceled', completedAt: t.completedAt ?? now() })
            return
        }

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
        updateUpload(taskId, { status: 'canceled', completedAt: now(), speed: null, eta: null })
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
                .map(j => (typeof j.progress === 'number' ? normalizeProgressPercent(j.progress) : null))
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

    function summarizeVersions(
        items: VersionProgressItem[],
        jobKind: 'proxy_mp4' | 'hls' | 'any' = 'any',
        context?: TransferContext
    ) {
        let failed = 0
        let running = 0
        let queued = 0
        let done = 0

        let sumPct = 0
        let pctCount = 0

        for (const it of items) {
            // status counts should also respect kind if you want the label to match
            const jobs = (it.jobs || []).filter(j => {
                return kindMatchesForSummary(j?.kind, jobKind)
            })

            for (const j of jobs) {
                const st = String(j?.status || '').toLowerCase()
                if (st === 'failed' || st === 'error' || st === 'missing_output') failed++
                else if (st === 'running') running++
                else if (st === 'queued') queued++
                else if (st === 'done') done++

                if (jobKind !== 'proxy_mp4') {
                    sumPct += normalizeProgressPercent(j?.progress)
                    pctCount++
                }
            }

            if (jobKind === 'proxy_mp4') {
                const cumulative = summarizeProxyCumulativeProgress(it.jobs || [], context?.proxyQualities)
                if (typeof cumulative === 'number') {
                    sumPct += cumulative
                    pctCount++
                }
                // console.log('[transcode:proxy:summarize:item]', {
                //     assetVersionId: (it as any)?.assetVersionId,
                //     requestedQualities: context?.proxyQualities || [],
                //     allKinds: (it.jobs || []).map((j: any) => String(j?.kind || '')),
                //     filteredKinds: jobs.map((j: any) => String(j?.kind || '')),
                //     filteredStatuses: jobs.map((j: any) => String(j?.status || '')),
                //     filteredProgress: jobs.map((j: any) => j?.progress),
                //     filteredProgressPct: jobs.map((j: any) => normalizeProgressPercent(j?.progress)),
                //     cumulative,
                // })
            } else if (jobKind === 'hls') {
                // console.log('[transcode:hls:summarize:item]', {
                //     assetVersionId: (it as any)?.assetVersionId,
                //     allKinds: (it.jobs || []).map((j: any) => String(j?.kind || '')),
                //     filteredKinds: jobs.map((j: any) => String(j?.kind || '')),
                //     filteredStatuses: jobs.map((j: any) => String(j?.status || '')),
                //     filteredProgress: jobs.map((j: any) => j?.progress),
                //     filteredProgressPct: jobs.map((j: any) => normalizeProgressPercent(j?.progress)),
                // })
            }
        }

        const progress = (jobKind === 'proxy_mp4' && pctCount)
            ? clampPct(sumPct / pctCount)
            : pctCount
            ? clampPct(sumPct / pctCount)
            : (done > 0 && running === 0 && queued === 0 && failed === 0 ? 100 : 0)

        let status: TranscodeStatus = 'unknown'
        if (failed > 0) status = 'failed'
        else if (running > 0 || queued > 0) status = 'running'
        else if (done > 0) status = 'done'

        if (jobKind === 'proxy_mp4' || jobKind === 'hls') {
            // console.log('[transcode:summarize:result]', {
            //     jobKind,
            //     status,
            //     progress,
            //     counts: { failed, running, queued, done },
            //     items: items.length,
            // })
        }

        return { status, progress, counts: { failed, running, queued, done } }
    }
    

    function startTranscodeTaskBase<TItem extends ProgressItem | VersionProgressItem>(opts: {
        apiFetch: (path: string, init?: any) => Promise<any>
        ids: number[]
        title: string
        detail?: string
        intervalMs?: number
        jobKind?: 'proxy_mp4' | 'hls' | 'any'
        context?: TransferContext
        mode: 'file' | 'version'
        summarizeItems: (
            items: TItem[],
            task: Extract<TransferTask, { kind: 'transcode' }>
        ) => { status: TranscodeStatus; progress: number }
        initialItems: TItem[]
    }) {
        const normalizedIds = Array.from(new Set((opts.ids || [])
            .map(n => Number(n))
            .filter(n => Number.isFinite(n) && n > 0)))

        const idsToTrack = opts.mode === 'version'
            ? normalizedIds.filter(id => !hasActiveTranscode({ assetVersionIds: [id], jobKind: opts.jobKind }))
            : normalizedIds.filter(id => !hasActiveTranscodeForFileId(id, opts.jobKind))

        if (!idsToTrack.length) {
            const existing = findActiveTranscodeTaskByIds({
                mode: opts.mode,
                ids: normalizedIds,
                jobKind: opts.jobKind,
            })
            return existing?.taskId || ''
        }

        const taskId = makeId(opts.mode === 'version' ? 'trnV' : 'trn')
        const t: TransferTask = {
            taskId,
            kind: 'transcode',
            title: opts.title,
            detail: opts.detail,
            status: 'queued',
            progress: 0,
            error: null,
            ...(opts.mode === 'version' ? { assetVersionIds: idsToTrack.slice() } : { fileIds: idsToTrack.slice() }),
            items: opts.initialItems,
            startedAt: now(),
            stop: undefined,
            jobKind: opts.jobKind ?? 'any',
            context: opts.context,
        }
        upsertTask(t)

        const stop = startProgressPolling({
            apiFetch: opts.apiFetch,
            ...(opts.mode === 'version'
                ? { assetVersionIds: () => idsToTrack }
                : { fileIds: () => idsToTrack }),
            intervalMs: opts.intervalMs ?? 1500,
            onUpdate: (items) => {
                const cur = _state.tasks.find(x => x.taskId === taskId && x.kind === 'transcode') as
                    | Extract<TransferTask, { kind: 'transcode' }>
                    | undefined
                if (!cur) return

                const castItems = (items || []) as TItem[]
                cur.items = castItems as any

                const s = opts.summarizeItems(castItems, cur)
                cur.status = s.status
                cur.progress = s.progress
                if ((cur.jobKind ?? 'any') === 'proxy_mp4') {
                    cur.detail = proxyDetailFromProgress(cur.progress, cur.context?.proxyQualities)
                }

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

    function startAssetVersionTranscodeTask(opts: {
        apiFetch: (path: string, init?: any) => Promise<any>
        assetVersionIds: number[]
        title: string
        detail?: string
        intervalMs?: number
        jobKind?: 'proxy_mp4' | 'hls' | 'any'
        context?: TransferContext
    }) {
        return startTranscodeTaskBase<VersionProgressItem>({
            apiFetch: opts.apiFetch,
            ids: opts.assetVersionIds,
            title: opts.title,
            detail: opts.detail,
            intervalMs: opts.intervalMs,
            jobKind: opts.jobKind,
            context: opts.context,
            mode: 'version',
            summarizeItems: (items, task) => summarizeVersions(items, task.jobKind ?? 'any', task.context),
            initialItems: [] as VersionProgressItem[],
        })
    }

    function startPlaybackTranscodeTask(opts: {
        title: string
        detail?: string
        intervalMs?: number
        jobKind?: 'proxy_mp4' | 'hls' | 'any'
        context?: TransferContext
        fetchSnapshot: () => Promise<PlaybackProgressSnapshot | null>
    }) {
        const taskId = makeId('trnP')
        const t: TransferTask = {
            taskId,
            kind: 'transcode',
            title: opts.title,
            detail: opts.detail,
            status: 'queued',
            progress: 0,
            error: null,
            items: [],
            startedAt: now(),
            stop: undefined,
            jobKind: opts.jobKind ?? 'any',
            context: opts.context,
        }
        upsertTask(t)

        let stopped = false
        let timer: any = null
        const intervalMs = Math.max(500, opts.intervalMs ?? 1500)

        const normalizePlaybackStatus = (v: any): TranscodeStatus => {
            const s = String(v || '').toLowerCase()
            if (s === 'done' || s === 'completed' || s === 'success' || s === 'ready') return 'done'
            if (s === 'failed' || s === 'error' || s === 'missing_output') return 'failed'
            if (s === 'queued' || s === 'pending' || s === 'running' || s === 'processing' || s === 'started') return 'running'
            return 'unknown'
        }

        const tick = async () => {
            if (stopped) return
            try {
                const cur = _state.tasks.find(x => x.taskId === taskId && x.kind === 'transcode') as
                    | Extract<TransferTask, { kind: 'transcode' }>
                    | undefined
                if (!cur) return

                const snap = await opts.fetchSnapshot()
                if (!snap) {
                    cur.status = 'unknown'
                    cur.error = 'no playback snapshot'
                    return
                }

                cur.items = Array.isArray(snap.items) ? (snap.items as any) : cur.items
                cur.status = normalizePlaybackStatus(snap.status)
                cur.progress = normalizeProgressPercent(snap.progress)
                if ((cur.jobKind ?? 'any') === 'proxy_mp4') {
                    const perQ = snap.perQualityProgress
                    if (perQ && typeof perQ === 'object') {
                        const qualityOrder = normalizeQualityList(
                            (Array.isArray(snap.qualityOrder) && snap.qualityOrder.length)
                                ? snap.qualityOrder
                                : Object.keys(perQ)
                        )
                        if (qualityOrder.length) {
                            if (!cur.context) cur.context = { source: 'link' }
                            cur.context.proxyQualities = qualityOrder
                        }
                        const jobs = qualityOrder.map((q) => {
                            const pct = normalizeProgressPercent(perQ[q])
                            return {
                                kind: `proxy_mp4:${q}`,
                                status: pct >= 100 ? 'done' : String(snap.status || 'running'),
                                progress: pct,
                                quality: q,
                            }
                        })
                        cur.items = [{ assetVersionId: 0, jobs, summary: { queued: 0, running: 1, done: 0, failed: 0 } }] as any
                    }
                    const activePct = proxyActiveQualityProgress(snap.activeQuality, perQ)
                    if (typeof activePct === 'number') {
                        // Keep bar/percentage aligned with "Tracking proxy (<quality>)" label.
                        cur.progress = activePct
                    }
                    cur.detail = proxyDetailFromActiveQuality(snap.activeQuality, cur.progress, cur.context?.proxyQualities)
                }

                if (cur.status === 'done' || cur.status === 'failed') {
                    cur.completedAt = now()
                    stopped = true
                    if (timer) clearTimeout(timer)
                    return
                }
            } catch (e: any) {
                const cur = _state.tasks.find(x => x.taskId === taskId && x.kind === 'transcode') as
                    | Extract<TransferTask, { kind: 'transcode' }>
                    | undefined
                if (cur) {
                    cur.status = 'unknown'
                    cur.error = e?.message || String(e)
                }
            } finally {
                if (!stopped) timer = setTimeout(tick, intervalMs)
            }
        }

        const stop = () => {
            stopped = true
            if (timer) clearTimeout(timer)
        }
        ;(t as any).stop = stop
        tick()
        return taskId
    }

    function startTranscodeTask(opts: {
        apiFetch: (path: string, init?: any) => Promise<any>
        fileIds: number[]
        title: string
        detail?: string
        intervalMs?: number
        jobKind?: 'proxy_mp4' | 'hls' | 'any'
        context?: TransferContext
    }) {
        return startTranscodeTaskBase<ProgressItem>({
            apiFetch: opts.apiFetch,
            ids: opts.fileIds,
            title: opts.title,
            detail: opts.detail,
            intervalMs: opts.intervalMs,
            jobKind: opts.jobKind,
            context: opts.context,
            mode: 'file',
            summarizeItems: (items) => summarize(items),
            initialItems: [] as ProgressItem[],
        })
    }

    return {
        state: _state,
        hasActive,
        activeCount,
        toggleMinimize,
        setOpen,
        removeTask,
        clearFinished,

        hasActiveTranscode,
        hasActiveTranscodeForFile,
        splitActiveTranscodeAssetVersions,

        createUploadTask,
        updateUpload,
        finishUpload,
        cancelUpload,

        startTranscodeTask,
        startAssetVersionTranscodeTask,
        startPlaybackTranscodeTask,
    }
}
