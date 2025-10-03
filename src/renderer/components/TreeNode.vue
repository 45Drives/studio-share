<template>
    <!-- Non-root row -->
    <div v-if="!isRoot" class="grid items-center border-b border-default hover:bg-white/5
           [grid-template-columns:40px_minmax(0,1fr)_120px_110px_180px]" :class="{ 'opacity-60': isIndeterminate }">
        <!-- checkbox -->
        <div class="px-2 py-1 flex justify-center">
            <input ref="folderCb" class="input-checkbox" type="checkbox" :checked="isFolder ? isChecked : isFileChecked"
                @change="onFolderOrFileCheckbox" />
        </div>

        <!-- name -->
        <div class="px-2 py-1 min-w-0">
            <div class="flex items-center gap-2"
                :style="{ '--tw-ps': `${depth * 24}px`, paddingInlineStart: `var(--tw-ps)` }">
                <!-- arrow -->
                <button v-if="isDir"
                    class="w-4 h-4 rounded border border-current text-[10px] leading-none inline-flex items-center justify-center shrink-0"
                    @click="toggleOpen" :aria-label="open ? 'Collapse' : 'Expand'">
                    {{ open ? '▾' : '▸' }}
                </button>
                <span v-else class="w-4 h-4 rounded border border-transparent shrink-0"></span>

                <!-- label (truncate) -->
                <template v-if="isDir">
                    <button class="underline truncate" :title="label + '/'" @click="$emit('navigate', relPath)">
                        {{ label }}/
                    </button>
                </template>
                <template v-else>
                    <span class="truncate select-none" :title="label">{{ label }}</span>
                </template>
            </div>
        </div>

        <!-- type -->
        <div class="px-2 py-1">{{ isDir ? 'Folder' : 'File' }}</div>

        <!-- size -->
        <div class="px-2 py-1">{{ isDir ? '—' : fmtBytes(entrySize) }}</div>

        <!-- modified -->
        <div class="px-2 py-1">{{ fmtDate(entryMtime) }}</div>
    </div>

    <!-- children -->
    <div v-show="isRoot || open">
        <div v-if="loading" class="opacity-70 text-xs p-2">Loading…</div>

        <template v-for="ch in children" :key="ch.path">
            <TreeNode v-if="ch.isDir" :label="ch.name" :relPath="ch.path" :apiFetch="apiFetch" :selected="selected"
                :selectedVersion="selectedVersion" :getFilesFor="getFilesFor" :depth="depth + 1"
                @toggle="$emit('toggle', $event)" @navigate="$emit('navigate', $event)" />
            <div v-else class="grid items-center border-b border-default hover:bg-white/5
               [grid-template-columns:40px_minmax(0,1fr)_120px_110px_180px]">
                <div class="px-2 py-1 flex justify-center">
                    <input class="input-checkbox" type="checkbox" :checked="selected.has(ch.path)"
                        @change="$emit('toggle', { path: ch.path, isDir: false })" />
                </div>
                <div class="px-2 py-1 min-w-0">
                    <div class="flex items-center gap-2"
                        :style="{ '--tw-ps': `${(depth + 1) * 24}px`, paddingInlineStart: `var(--tw-ps)` }">
                        <span class="w-4 h-4 rounded border border-transparent shrink-0"></span>
                        <span class="truncate select-none" :title="ch.name">{{ ch.name }}</span>
                    </div>
                </div>
                <div class="px-2 py-1">File</div>
                <div class="px-2 py-1">{{ fmtBytes(ch.size) }}</div>
                <div class="px-2 py-1">{{ fmtDate(ch.mtime) }}</div>
            </div>
        </template>
    </div>
</template>


<script setup lang="ts">
import { ref, onMounted, watch, nextTick, computed } from 'vue'
defineOptions({ name: 'TreeNode' })

type TogglePayload = { path: string; isDir: boolean }

const props = defineProps<{
    label?: string                // display name (no trailing slash)
    relPath: string               // '' means root
    apiFetch: (url: string, init?: any) => Promise<any>
    selected: Set<string>         // files only
    selectedVersion?: number      // bump whenever selection changes
    getFilesFor: (folder: string) => Promise<string[]>
    depth?: number
    isRoot?: boolean
}>()

const emit = defineEmits<{
    (e: 'toggle', payload: TogglePayload): void
    (e: 'navigate', rel: string): void
}>()

const depth = props.depth ?? 0
const isRoot = props.isRoot ?? false

const open = ref<boolean>(isRoot ? true : false)
const loading = ref(false)
const children = ref<Array<{ name: string; isDir: boolean; path: string; size?: number; mtime?: number }>>([])

const entrySize = computed(() => 0)
const entryMtime = computed(() => 0)

const folderCb = ref<HTMLInputElement | null>(null)
const isDir = computed(() => isRoot || props.relPath.length > 0 ? true : false) // root treated like folder row only for children
const isFolder = computed(() => !isRoot && isDir.value)
const isFileChecked = computed(() => props.selected.has(props.relPath))

async function ensureChildren() {
    if (children.value.length || loading.value) return
    loading.value = true
    const data = await props.apiFetch(`/api/files?dir=${encodeURIComponent(props.relPath)}`)
    const dir = data.dir ?? props.relPath
    const ents = (data.entries || [])
        .map((e: any) => ({ ...e, path: (dir ? dir + '/' : '') + e.name }))
        .sort((a: any, b: any) => (Number(b.isDir) - Number(a.isDir)) || a.name.localeCompare(b.name))
    children.value = ents
    loading.value = false
}

function toggleOpen() {
    open.value = !open.value
    if (open.value) {
        ensureChildren()
        ensureAllFiles()
    }
}
async function onFolderOrFileCheckbox(e: Event) {
    // Immediately expand folders for visual feedback
    if (isFolder.value && !open.value) {
        open.value = true
        await ensureChildren()
    }
    await ensureAllFiles()
    // parent handles mass add/remove of files
    emit('toggle', { path: props.relPath, isDir: isFolder.value })
    // after parent updates selection, refresh tri-state (indeterminate)
    await nextTick()
    if (folderCb.value) folderCb.value.indeterminate = isIndeterminate.value
}

const allFiles = ref<string[] | null>(null)

const selectedCount = computed(() => {
    if (!allFiles.value) return 0
    let c = 0
    for (const f of allFiles.value) if (props.selected.has(f)) c++
    return c
})
const totalCount = computed(() => allFiles.value?.length || 0)

const isChecked = computed(() => totalCount.value > 0 && selectedCount.value === totalCount.value)
const isIndeterminate = computed(() =>
    totalCount.value > 0 && selectedCount.value > 0 && selectedCount.value < totalCount.value
)


async function ensureAllFiles() {
    if (isRoot) return
    if (allFiles.value === null) {
        allFiles.value = await props.getFilesFor(props.relPath || '')
    }
}

async function refreshTriState() {
    await nextTick()
    if (folderCb.value) folderCb.value.indeterminate = isIndeterminate.value
}

// mount: load per-folder file list even when collapsed
onMounted(async () => {
    if (isRoot) {
        await ensureChildren()
    } else {
        allFiles.value = null
        await ensureAllFiles()
        await refreshTriState()
    }
})

// selection changed somewhere → recompute (and make sure we have the file list)
watch(() => props.selectedVersion, async () => {
    if (!isRoot) {
        if (allFiles.value === null) allFiles.value = await props.getFilesFor(props.relPath || '')
        await refreshTriState()
    }
})

// root/folder path changed (e.g., PathInput picked a new cwd) → reset caches
watch(() => props.relPath, async () => {
    children.value = []
    allFiles.value = null
    open.value = isRoot ? true : open.value
    await ensureChildren()
    await ensureAllFiles()
    await refreshTriState()
})

function fmtBytes(n?: number) {
    if (!n || n < 0) return '—'
    const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0, x = n
    while (x >= 1024 && i < u.length - 1) { x /= 1024; i++ }
    return `${x.toFixed(x >= 10 || i === 0 ? 0 : 1)} ${u[i]}`
}
function fmtDate(ms?: number) {
    if (!ms) return '—'
    try { return new Date(ms).toLocaleString() } catch { return '—' }
}
</script>
