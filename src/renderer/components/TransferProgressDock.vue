<!-- src/renderer/components/TransferProgressDock.vue -->
<template>
    <div v-if="state.open" class="fixed bottom-4 right-4 z-50 w-1/3">
        <div class="rounded-md border border-default bg-default shadow-xl overflow-hidden">
            <!-- header -->
            <div class="flex items-center justify-between bg-well px-3 py-2 border-b border-default">
                <div class="min-w-0">
                    <div class="font-semibold text-sm">
                        Transfers
                        <span v-if="activeCount" class="opacity-70">({{ activeCount }})</span>
                    </div>
                    <div class="text-xs opacity-70 truncate" v-if="hasActive">In progress…</div>
                    <div class="text-xs opacity-70" v-else>Idle</div>
                </div>

                <div class="flex items-center gap-2">
                    <button class="btn btn-secondary px-2 py-1 text-xs" @click="clearFinished">Clear finished</button>
                    <button v-if="activeCount > 0" class="btn btn-secondary px-2 py-1 text-xs" @click="toggleMinimize">
                        {{ state.minimized ? 'Expand' : 'Minimize' }}
                    </button>
                    <button class="btn btn-secondary px-2 py-1 text-xs" @click="setOpen(false)"
                        title="Hide">Hide</button>
                </div>
            </div>

            <!-- body -->
            <div v-show="!state.minimized" class="max-h-[22rem] overflow-auto">
                <div v-if="!state.tasks.length" class="px-3 py-3 text-sm opacity-70">
                    No active transfers.
                </div>

                <!-- OUTER GROUPS (Link / Upload batches) -->
                <div v-for="g in groups" :key="g.key" class="border-t border-default">
                    <!-- group header -->
                    <div class="px-3 py-2 bg-accent">
                        <div class="flex justify-between gap-2 items-start">
                            <div class="min-w-0">
                                <div class="text-sm font-semibold truncate" :title="g.title">
                                    {{ g.title }}
                                </div>
                                <div v-if="g.subtitle" class="text-xs opacity-70 truncate" :title="g.subtitle">
                                    {{ g.subtitle }}
                                </div>
                            </div>

                            <button class="btn btn-secondary px-2 py-1 text-xs flex-shrink-0"
                                @click="dismissGroup(g.key)">
                                Dismiss all
                            </button>
                        </div>
                    </div>

                    <!-- FILE GROUPS inside the batch -->
                    <div v-for="fg in g.files" :key="fg.key" class="border-t border-default">
                        <!-- file header -->
                        <div class="px-3 py-2">
                            <div class="text-sm font-semibold truncate" :title="fg.fileTitle">{{ fg.fileTitle }}</div>
                            <div v-if="fg.fileSubtitle" class="text-xs opacity-70 truncate" :title="fg.fileSubtitle">
                                {{ fg.fileSubtitle }}
                            </div>
                        </div>

                        <!-- TASKS under this file -->
                        <div v-for="t in fg.tasks" :key="t.taskId" class="px-3 pb-3">
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0 text-left">
                                    <div class="text-xs font-semibold truncate" :title="taskLabel(t)">
                                        {{ taskLabel(t) }}
                                    </div>

                                    <div class="text-xs opacity-70 truncate" v-if="t.detail"
                                        :title="String(t.detail).trim()">
                                        {{ String(t.detail).trim() }}
                                    </div>

                                </div>

                                <div class="flex items-center gap-2 flex-shrink-0">
                                    <button
                                        v-if="t.kind === 'upload' && (t.status === 'uploading' || t.status === 'queued')"
                                        class="btn btn-secondary px-2 py-1 text-xs" @click="cancelUpload(t.taskId)">
                                        Cancel
                                    </button>

                                    <button class="btn btn-secondary px-2 py-1 text-xs" @click="removeTask(t.taskId)">
                                        Dismiss
                                    </button>
                                </div>
                            </div>

                            <progress class="mt-2 w-full h-2 rounded-lg overflow-hidden bg-default"
                                :value="t.progress || 0" max="100" />

                            <div class="mt-1 text-xs opacity-80 flex flex-wrap gap-x-2 gap-y-1">
                                <span><b>Status:</b> {{ t.status }}</span>

                                <template v-if="t.kind === 'upload'">
                                    <span v-if="t.speed"><b>Speed:</b> {{ t.speed }}</span>
                                    <span v-if="t.eta"><b>ETA:</b> {{ t.eta }}</span>
                                </template>

                                <span><b>Progress:</b> {{ Math.round(t.progress || 0) }}%</span>
                            </div>

                            <div v-if="t.error" class="mt-1 text-xs text-red-400">
                                {{ t.error }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- minimized -->
            <div v-show="state.minimized" class="px-3 py-2 text-xs opacity-80">
                <span v-if="activeCount">{{ activeCount }} active transfer(s)</span>
                <span v-else>No active transfers</span>
            </div>
        </div>
    </div>

    <!-- reopen button -->
    <button v-else class="fixed bottom-4 right-4 z-50 btn btn-secondary px-3 py-2 text-xs shadow-xl"
        @click="setOpen(true)">
        Transfers
        <span v-if="activeCount" class="ml-1 opacity-70">({{ activeCount }})</span>
    </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTransferProgress } from '../composables/useTransferProgress'

const {
    state,
    hasActive,
    activeCount,
    toggleMinimize,
    setOpen,
    removeTask,
    clearFinished,
    cancelUpload,
} = useTransferProgress()

function basename(p?: string) {
    if (!p) return ''
    const s = String(p)
    const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
    return i >= 0 ? s.slice(i + 1) : s
}

function isActiveTask(t: any) {
    return (
        (t.kind === 'upload' && (t.status === 'uploading' || t.status === 'queued')) ||
        (t.kind !== 'upload' && (t.status === 'queued' || t.status === 'running' || t.status === 'unknown'))
    )
}

function taskLabel(t: any) {
    if (t?.kind === 'upload') return 'Uploading'
    if (t?.kind === 'transcode') {
        const jk = String(t?.jobKind || '').toLowerCase()
        if (jk === 'hls') return 'Generating adaptive stream'
        if (jk === 'proxy_mp4') return 'Generating proxy files'
        return 'Generating transcodes'
    }
    return t?.title || 'Task'
}

type FileGroup = {
    key: string
    fileTitle: string
    fileSubtitle?: string
    tasks: any[]
}

type OuterGroup = {
    key: string
    title: string
    subtitle?: string
    files: FileGroup[]
    tasksFlat: any[]
}

function outerKeyForTask(t: any) {
    const c = t?.context || {}
    // best: explicit stable id shared by upload+transcode
    if (c.groupId) return String(c.groupId)
    // next best: link url
    if (c.linkUrl) return `link:${c.linkUrl}`
    // uploads: bucket by destDir if provided
    if (c.source === 'upload' && c.destDir) return `upload:${c.destDir}`
    // fallback: single file
    if (c.file) return `file:${c.file}`
    // last resort
    return `task:${t.taskId}`
}

function outerTitleForBucket(bucketCtx: any, tasks: any[]) {
    const c = bucketCtx || {}

    // STRONG signal: uploads always win
    if (c.source === 'upload') {
        const dest = (c.destDir && String(c.destDir).trim()) || ''
        return {
            title: 'Upload',
            subtitle: dest || undefined,
        }
    }

    // STRONG signal: explicit link
    if (c.source === 'link') {
        const title = (c.linkTitle && String(c.linkTitle).trim()) || ''
        const url = (c.linkUrl && String(c.linkUrl).trim()) || ''
        return {
            title: title ? title : (url ? 'Link' : 'Link'),
            subtitle: title && url ? url : url || undefined,
        }
    }

    // WEAK inference (only if no upload context exists anywhere)
    const anyUpload = tasks.some(t => t?.context?.source === 'upload')
    if (!anyUpload) {
        const anyLink = tasks.find(t => t?.context?.linkUrl)?.context?.linkUrl
        if (anyLink) {
            return {
                title: 'Link',
                subtitle: String(anyLink),
            }
        }
    }

    return { title: 'Transfers' }
}

function fileKeyForTask(t: any) {
    const c = t?.context || {}
    if (c.file) return `file:${c.file}`
    // if a task still only has files[], only split when exactly 1
    const files = Array.isArray(c.files) ? c.files : []
    if (files.length === 1) return `file:${files[0]}`
    return 'file:__multi__'
}

function fileHeaderForKey(fileKey: string, bucketCtx: any) {
    if (fileKey === 'file:__multi__') {
        const files = Array.isArray(bucketCtx?.files) ? bucketCtx.files : []
        return {
            title: files.length > 1 ? 'Multiple files' : 'File',
            subtitle: files.length > 1 ? `${files.length} files` : undefined,
        }
    }

    const file = fileKey.startsWith('file:') ? fileKey.slice(5) : fileKey
    return { title: basename(file), subtitle: file }
}

const groups = computed<OuterGroup[]>(() => {
    // 1) bucket tasks by outer group
    const buckets = new Map<string, { ctx: any; tasks: any[] }>()

    for (const t of state.tasks as any[]) {
        const k = outerKeyForTask(t)
        if (!buckets.has(k)) buckets.set(k, { ctx: t?.context, tasks: [] })
        buckets.get(k)!.tasks.push(t)
    }

    // 2) build per-file groups inside each bucket
    const out: OuterGroup[] = []

    for (const [key, bucket] of buckets.entries()) {
        // pick a representative ctx (prefer one that has source/linkUrl/destDir)
        const rep =
            bucket.tasks.find(t => t?.context?.source)?.context ||
            bucket.tasks.find(t => t?.context?.linkUrl)?.context ||
            bucket.tasks.find(t => t?.context?.destDir)?.context ||
            bucket.ctx ||
            {}

        const hdr = outerTitleForBucket(rep, bucket.tasks)

        const fileGroups = new Map<string, FileGroup>()

        function ensureFileGroup(fk: string) {
            if (!fileGroups.has(fk)) {
                const fh = fileHeaderForKey(fk, rep)
                fileGroups.set(fk, {
                    key: fk,
                    fileTitle: fh.title,
                    fileSubtitle: fh.subtitle,
                    tasks: [],
                })
            }
            return fileGroups.get(fk)!
        }

        for (const t of bucket.tasks) {
            ensureFileGroup(fileKeyForTask(t)).tasks.push(t)
        }

        // sort tasks per file: transcode first, then upload; within transcode prefer proxy then hls (or vice versa)
        const taskOrder = (t: any) => {
            if (t.kind === 'transcode') {
                const jk = String(t?.jobKind || '').toLowerCase()
                if (jk === 'proxy_mp4') return 0
                if (jk === 'hls') return 1
                return 2
            }
            if (t.kind === 'upload') return 3
            return 9
        }

        const filesArr = Array.from(fileGroups.values()).map(fg => {
            fg.tasks.sort((a, b) => {
                const d = taskOrder(a) - taskOrder(b)
                if (d !== 0) return d
                return Number(a?.startedAt || 0) - Number(b?.startedAt || 0)
            })
            return fg
        })

        // active file groups first
        filesArr.sort((a, b) => {
            const aAct = a.tasks.some(isActiveTask)
            const bAct = b.tasks.some(isActiveTask)
            if (aAct !== bAct) return aAct ? -1 : 1
            return String(a.fileTitle).localeCompare(String(b.fileTitle))
        })

        out.push({
            key,
            title: hdr.title,
            subtitle: hdr.subtitle,
            files: filesArr,
            tasksFlat: bucket.tasks.slice(),
        })
    }

    // active outer groups first, newest first
    out.sort((a, b) => {
        const aAct = a.tasksFlat.some(isActiveTask)
        const bAct = b.tasksFlat.some(isActiveTask)
        if (aAct !== bAct) return aAct ? -1 : 1
        const aNew = Math.max(...a.tasksFlat.map(t => Number(t?.startedAt || 0)), 0)
        const bNew = Math.max(...b.tasksFlat.map(t => Number(t?.startedAt || 0)), 0)
        return bNew - aNew
    })

    return out
})

function dismissGroup(groupKey: string) {
    const g = groups.value.find(x => x.key === groupKey)
    if (!g) return
    for (const t of g.tasksFlat) removeTask(t.taskId)
}
</script>
