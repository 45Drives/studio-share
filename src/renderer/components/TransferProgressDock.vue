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
                    <button class="btn btn-secondary px-2 py-1 text-xs" @click="clearFinished">
                        Clear finished
                    </button>
                    <button v-if="activeCount > 0" class="btn btn-secondary px-2 py-1 text-xs" @click="toggleMinimize">
                        {{ state.minimized ? 'Expand' : 'Minimize' }}
                    </button>
                    <button class="btn btn-secondary px-2 py-1 text-xs" @click="setOpen(false)" title="Hide">
                        Hide
                    </button>
                </div>
            </div>

            <!-- body -->
            <div v-show="!state.minimized" class="max-h-[22rem] overflow-auto">
                <div v-if="!state.tasks.length" class="px-3 py-3 text-sm opacity-70">
                    No active transfers.
                </div>

                <!-- GROUPS -->
                <div v-for="g in grouped" :key="g.key" class="border-t border-default">
                    <!-- group "card" header -->
                    <div class="px-3 py-2 bg-default/40">
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                                <!-- prefer linkTitle; else linkUrl; else file summary -->
                                <div class="text-sm font-semibold truncate" :title="g.headerTitle">
                                    {{ g.headerTitle }}
                                </div>

                                <!-- show link url as secondary line when we also have a title -->
                                <div v-if="g.headerSub" class="text-xs opacity-70 truncate" :title="g.headerSub">
                                    {{ g.headerSub }}
                                </div>

                                <!-- file line -->
                                <div v-if="g.fileLine" class="text-xs opacity-70 truncate" :title="g.fileLine">
                                    {{ g.fileLine }}
                                </div>
                            </div>

                            <div class="flex items-center gap-2 flex-shrink-0">
                                <button class="btn btn-secondary px-2 py-1 text-xs" @click="dismissGroup(g.key)">
                                    Dismiss all
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- tasks inside the group -->
                    <div v-for="t in g.tasks" :key="t.taskId" class="px-3 py-2 border-t border-default">
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0 text-left">
                                <div class="text-sm font-semibold truncate" :title="t.title">
                                    {{ t.title }}
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

                        <div class="mt-2">
                            <progress class="w-full h-2 rounded-lg overflow-hidden bg-default" :value="t.progress || 0"
                                max="100" />
                        </div>

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

function fileLineFromContext(c: any) {
    const files = Array.isArray(c?.files) ? c.files : []
    if (!files.length) return ''
    if (files.length === 1) return files[0]
    const names = files.slice(0, 2).map((p: string) => basename(p)).filter(Boolean)
    const more = files.length > 2 ? ` +${files.length - 2} more` : ''
    return `${files.length} files: ${names.join(', ')}${more}`
}

type GroupView = {
    key: string
    headerTitle: string
    headerSub?: string
    fileLine?: string
    tasks: any[]
}

const grouped = computed<GroupView[]>(() => {
    const groups = new Map<string, GroupView>()

    for (const t of state.tasks as any[]) {
        const c = t?.context

        const key =
            (c?.linkUrl ? `link:${c.linkUrl}` : '') ||
            (Array.isArray(c?.files) && c.files.length ? `files:${c.files.join('|')}` : '') ||
            `task:${t.taskId}`

        const headerTitle =
            (c?.linkTitle && String(c.linkTitle).trim()) ||
            (c?.linkUrl && String(c.linkUrl).trim()) ||
            (Array.isArray(c?.files) && c.files.length === 1 ? basename(c.files[0]) : 'Transfer')

        const headerSub =
            (c?.linkTitle && c?.linkUrl) ? String(c.linkUrl) : undefined

        const fileLine = fileLineFromContext(c)

        if (!groups.has(key)) {
            groups.set(key, { key, headerTitle, headerSub, fileLine, tasks: [] })
        }

        groups.get(key)!.tasks.push(t)
    }

    // stable-ish ordering: groups with active tasks first
    const isActive = (t: any) =>
        (t.kind === 'upload' && (t.status === 'uploading' || t.status === 'queued')) ||
        (t.kind !== 'upload' && (t.status === 'queued' || t.status === 'running' || t.status === 'unknown'))

    const arr = Array.from(groups.values())
    arr.sort((a, b) => {
        const aAct = a.tasks.some(isActive)
        const bAct = b.tasks.some(isActive)
        if (aAct !== bAct) return aAct ? -1 : 1
        // newest-first inside groups: we unshift tasks in the store, so first task is newest
        const aTime = Number(a.tasks?.[0]?.startedAt || 0)
        const bTime = Number(b.tasks?.[0]?.startedAt || 0)
        return bTime - aTime
    })

    return arr
})

function dismissGroup(groupKey: string) {
    const g = grouped.value.find(x => x.key === groupKey)
    if (!g) return
    for (const t of g.tasks) removeTask(t.taskId)
}
</script>
