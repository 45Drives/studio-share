<template>
    <div class="h-full flex items-start justify-center pt-16 overflow-y-auto">
        <div class="grid grid-cols-1 gap-10 text-2xl w-9/12 mx-auto">
            <CardContainer class="bg-accent rounded-md shadow-xl">
                <template #header>
                    <!-- <div class="flex flex-row gap-2 items-center">
                            <span class="whitespace-nowrap">Enter path for file.</span>
                            <PathInput v-model="filePath" :apiFetch="apiFetch" />
                        </div> -->
                    <!-- ===== Step 1: Project selection ===== -->
                    <div v-if="!projectSelected" class="flex flex-col gap-3 text-left">
                        <h2 class="text-xl font-semibold">Select a project</h2>

                        <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                            <input type="checkbox" v-model="showEntireTree" @change="loadProjectChoices" />
                            Show entire directory tree from root
                        </label>

                        <!-- Mode: ROOTS -->
                        <template v-if="browseMode === 'roots'">
                            <div class="text-sm opacity-80">
                                <span class="font-semibold">ZFS pools:</span>
                                <span v-if="detecting" class="ml-1">Detecting…</span>
                                <span v-else-if="!projectRoots.length" class="ml-1">None detected</span>
                            </div>

                            <div class="max-h-64 overflow-auto border rounded">
                                <div v-for="r in projectRoots" :key="r.mountpoint"
                                    class="flex items-center justify-between border-b border-default px-3 py-2 text-base">
                                    <div class="truncate">
                                        <code :title="`${r.name} → ${r.mountpoint}`">{{ r.mountpoint }}</code>
                                    </div>
                                    <div class="flex gap-2">
                                        <button class="btn btn-secondary" @click="openRoot(r)">Open</button>
                                        <button class="btn btn-primary"
                                            @click="chooseProject(r.mountpoint)">Select</button>
                                    </div>
                                </div>
                            </div>
                        </template>

                        <!-- Mode: DIR (browsing within a chosen root or / when entire-tree) -->
                        <template v-else>
                            <div class="flex items-center justify-between">
                                <div class="text-sm opacity-80">
                                    <span class="font-semibold">Browsing:</span>
                                    <code class="ml-1">{{ browsePath }}</code>
                                </div>
                                <div class="flex gap-2">
                                    <button v-if="!showEntireTree" class="btn btn-secondary" @click="backToRoots"
                                        title="Back to ZFS pool list">
                                        Back to pools
                                    </button>
                                    <button class="btn btn-secondary" :disabled="!canGoUp" @click="goUp"
                                        title="Go up one directory">
                                        Up
                                    </button>
                                    <button class="btn btn-primary" @click="chooseProject(browsePath)">Select this
                                        folder</button>
                                </div>
                            </div>

                            <div class="max-h-64 overflow-auto border rounded">
                                <div v-for="dir in projectDirs" :key="dir.path"
                                    class="flex items-center justify-between border-b border-default px-3 py-2 text-base">
                                    <div class="truncate">
                                        <code :title="dir.path">{{ dir.path }}</code>
                                    </div>
                                    <div class="flex gap-2">
                                        <button class="btn btn-secondary" @click="drillInto(dir.path)">Open</button>
                                        <button class="btn btn-primary" @click="chooseProject(dir.path)">Select</button>
                                    </div>
                                </div>

                                <div v-if="!projectDirs.length && !detecting" class="px-3 py-2 text-sm opacity-75">
                                    No directories here.
                                </div>
                            </div>
                        </template>

                        <div class="text-sm text-red-400" v-if="detectError">
                            {{ detectError }}
                        </div>
                    </div>

                    <!-- ===== Step 2: select file content (only after project chosen) ===== -->
                    <div v-else class="flex flex-col gap-2 text-left">
                        <div class="text-sm opacity-80 -mb-1">
                            <span class="font-semibold">Project:</span>
                            <code class="ml-1">{{ projectBase }}</code>
                            <button class="btn btn-secondary ml-3" @click="resetProject">Change project</button>
                        </div>

                        <FileExplorer :apiFetch="apiFetch" :modelValue="files" @add="onExplorerAdd"
                            :base="!showEntireTree ? projectBase : ''" :startDir="!showEntireTree ? projectBase : ''" />

                        <!-- Selected files panel (unchanged except we ensure paths remain under project when restricted) -->
                        <div v-if="files.length" class="border rounded bg-accent">
                            <div class="flex items-center gap-2">
                                <label class="flex items-center gap-2 text-xs cursor-pointer select-none">
                                    <input type="checkbox" v-model="autoRegenerate" />
                                    Auto-regenerate link
                                </label>
                                <button class="btn btn-secondary" @click="showSelected = !showSelected">
                                    {{ showSelected ? 'Hide' : 'Show' }} list
                                </button>
                                <button class="btn btn-danger" @click="clearAll">Clear all</button>
                            </div>

                            <div v-show="showSelected" class="max-h-40 overflow-auto">
                                <div v-for="(f, i) in files" :key="f"
                                    class="grid items-center [grid-template-columns:1fr_auto] border-t border-default text-sm">
                                    <code class="px-3 py-2 truncate block" :title="f">{{ f }}</code>
                                    <button class="btn btn-danger m-2 px-2 py-1" @click="removeFile(i)"
                                        title="Remove">✕</button>
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-base mt-2">
                            <div class="flex items-center gap-3">
                                <label class="whitespace-nowrap font-semibold">Expires in:</label>

                                <div class="flex flex-wrap gap-2 text-sm">
                                    <button type="button" class="btn btn-secondary" @click="setPreset(1, 'hours')">1
                                        hour</button>
                                    <button type="button" class="btn btn-secondary" @click="setPreset(1, 'days')">1
                                        day</button>
                                    <button type="button" class="btn btn-secondary" @click="setPreset(7, 'weeks')">7
                                        days</button>
                                </div>

                                <input type="number" min="1" step="1" v-model.number="expiresValue"
                                    class="input-textlike border rounded px-3 py-2 w-32 bg-transparent" />

                                <select v-model="expiresUnit"
                                    class="input-textlike border rounded px-3 py-2 bg-transparent"
                                    style="min-width: 8rem">
                                    <option value="hours">hours</option>
                                    <option value="days">days</option>
                                    <option value="weeks">weeks</option>
                                </select>

                                <span class="text-sm opacity-75">({{ prettyExpiry }})</span>
                            </div>
                        </div>
                    </div>
                </template>
                <div v-if="projectSelected" class="flex flex-col">
                    <button class="btn btn-secondary w-full" :disabled="!canGenerate" @click="generateLink"
                        title="Create a magic link with the selected options">
                        Share via magic link
                    </button>
                    <div v-if="viewUrl" class="p-3 border rounded space-x-2 flex flex-col items-center">
                        <code>{{ viewUrl }}</code>
                        <div class="button-group-row">
                            <button class="btn btn-secondary" @click="copyLink">Copy</button>
                            <button class="btn btn-primary" @click="openInBrowser">Open</button>
                        </div>
                    </div>
                </div>
            </CardContainer>
            <div class="button-group-row col-span-1">
                <button @click="goBack" class="btn btn-danger justify-start">
                    Go Back
                </button>
            </div>
        </div>

    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useApi } from '../../composables/useApi'
import CardContainer from '../../components/CardContainer.vue'
import FileExplorer from '../../components/FileExplorer.vue'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import { router } from '../../../app/routes'

const { apiFetch } = useApi()

// simple in-memory caches (per page life)
let zfsRootsCache: Array<{ name: string; mountpoint: string }> | null = null;
const dirCache = new Map<string, { ts: number; entries: Array<{ name: string; path: string }> }>();
const DIR_TTL = 5000; // 5s cache to avoid spam while the user is clicking around

// ================== Project selection state ==================
const projectSelected = ref(false)
const showEntireTree = ref(false)
const projectBase = ref<string>('')
const projectDirs = ref<Array<{ name: string; path: string }>>([])
const detecting = ref(false)
const detectError = ref<string | null>(null)
const projectRoots = ref<Array<{ name: string; mountpoint: string }>>([])
const browseMode = ref<'roots' | 'dir'>('roots')
const currentRoot = ref<string>('')   // mountpoint currently open
const browsePath = ref<string>('')    // current directory path we're listing

const canGoUp = computed(() => {
    if (showEntireTree.value) return browsePath.value !== '/'
    if (!currentRoot.value) return false
    return browsePath.value !== currentRoot.value
})

function backToRoots() {
    // return to the roots list
    browseMode.value = 'roots'
    currentRoot.value = ''
    browsePath.value = ''
    projectDirs.value = []
}

function goUp() {
    if (!browsePath.value || browsePath.value === '/') return
    const up = browsePath.value.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '/'
    // don’t escape the root dataset boundary when restricted
    if (!showEntireTree.value && currentRoot.value && !up.startsWith(currentRoot.value)) {
        browsePath.value = currentRoot.value
    } else {
        browsePath.value = up
    }
    listDirs(browsePath.value)
}

function drillInto(p: string) {
    browsePath.value = p
    listDirs(p)
}

function openRoot(r: { name: string; mountpoint: string }) {
    currentRoot.value = r.mountpoint
    browsePath.value = r.mountpoint
    browseMode.value = 'dir'
    listDirs(r.mountpoint)
}

// List directories for any absolute path
let listTimer: ReturnType<typeof setTimeout> | null = null;
async function listDirs(base: string) {
    if (listTimer) clearTimeout(listTimer);
    detecting.value = true;

    // small debounce to coalesce rapid “Up/Open/Back” clicks
    await new Promise<void>(resolve => {
        listTimer = setTimeout(() => resolve(), 120);
    });

    try {
        const now = Date.now();
        const cached = dirCache.get(base);
        if (cached && (now - cached.ts) < DIR_TTL) {
            projectDirs.value = cached.entries;
            return;
        }

        const data = await apiFetch(`/api/files?dir=${encodeURIComponent(base)}&dirsOnly=1`);
        const root = base.endsWith('/') ? base : base + '/';
        const entries = (data.entries || [])
            .filter((e: any) => e.isDir)
            .map((e: any) => ({ name: e.name, path: root + e.name }))
            .sort((a: any, b: any) => a.name.localeCompare(b.name));

        projectDirs.value = entries;
        dirCache.set(base, { ts: now, entries });
    } catch (e) {
        projectDirs.value = [];
        detectError.value = 'Unable to load directories.';
    } finally {
        detecting.value = false;
    }
}


/**
 * Try to detect a ZFS pool and use its mountpoint to populate project choices.
 * Fallbacks:
 *  - if user checked "Show entire directory tree", browse from '/'
 *  - if zpool detection fails, browse from '/'
 */
async function loadProjectChoices() {
    detecting.value = true;
    detectError.value = null;
    projectDirs.value = [];
    projectRoots.value = [];
    currentRoot.value = '';
    browsePath.value = '';

    try {
        if (showEntireTree.value) {
            browseMode.value = 'dir';
            await listDirs('/');
            return;
        }

        // use cache first
        if (zfsRootsCache) {
            projectRoots.value = zfsRootsCache;
            browseMode.value = 'roots';
            return;
        }

        const roots = await apiFetch('/api/zfs/roots').catch(() => []);
        projectRoots.value = Array.isArray(roots) ? roots : [];
        zfsRootsCache = projectRoots.value; // cache
        browseMode.value = 'roots';
    } catch (e) {
        detectError.value = 'ZFS detection failed; showing system root.';
        browseMode.value = 'dir';
        await listDirs('/');
    } finally {
        detecting.value = false;
    }
}

function chooseProject(dirPath: string) {
    projectBase.value = dirPath
    projectSelected.value = true
    // Optional: clear previously selected files when switching projects
    files.value = []
    invalidateLink()
}

// Allow going back to re-pick a project
function resetProject() {
    projectSelected.value = false
    projectBase.value = ''
    invalidateLink()
    files.value = []
    // Refresh choice list (honors current checkbox)
    loadProjectChoices()
}

const autoRegenerate = ref(false)
let regenTimer: ReturnType<typeof setTimeout> | null = null

const filePath = ref('')
const files = ref<string[]>([])
const showSelected = ref(true)
function clearAll() {
    files.value = []
    invalidateLink()
}

function addFile() {
    if (!filePath.value) return
    let pathToAdd = filePath.value

    // If restricted to project root, ensure the added path stays under it
    if (!showEntireTree.value && projectBase.value && !pathToAdd.startsWith(projectBase.value)) {
        pathToAdd = joinPath(projectBase.value, pathToAdd)
    }

    if (!files.value.includes(pathToAdd)) {
        files.value.push(pathToAdd)
        invalidateLink()
        scheduleAutoRegen()
    }
    filePath.value = ''
}

// When FileExplorer emits @add, normalize relative paths to live under the chosen project (if restricted)
function onExplorerAdd(paths: string[]) {
    paths.forEach(p => {
        let full = p
        if (!showEntireTree.value && projectBase.value && !p.startsWith(projectBase.value)) {
            full = joinPath(projectBase.value, p)
        }
        if (!files.value.includes(full)) files.value.push(full)
    })
    invalidateLink()
    scheduleAutoRegen()
}

function removeFile(i: number) {
    files.value.splice(i, 1)
    invalidateLink()
    scheduleAutoRegen()
}

watch(files, () => {
    // This catches adds/removes done outside the helpers (e.g., FileExplorer @add)
    invalidateLink()
    scheduleAutoRegen()
}, { deep: true })

watch(showEntireTree, (v) => {
    if (v) {
        // Bypass the project picker and jump straight to the normal file selector
        projectBase.value = '';          // no restriction
        projectSelected.value = true;    // show step 2
        invalidateLink();
    } else {
        // Return to ZFS pool selection
        projectSelected.value = false;
        projectBase.value = '';
        invalidateLink();
        loadProjectChoices();
    }
});

const expiresValue = ref(1)
const expiresUnit = ref<'hours' | 'days' | 'weeks'>('days')
// const maxDownloads = ref(5)

const viewUrl = ref('')
const downloadUrl = ref('')

// Map units → seconds
const UNIT_TO_SECONDS = {
    hours: 60 * 60,
    days: 24 * 60 * 60,
    weeks: 7 * 24 * 60 * 60,
} as const

// Compute the seconds value we send to the server
const expiresSec = computed(() => {
    const v = Math.max(1, Math.floor(expiresValue.value || 0))
    return v * UNIT_TO_SECONDS[expiresUnit.value]
})

// Pretty text like "3 days" / "2 weeks"
const prettyExpiry = computed(() => {
    const v = Math.max(1, Math.floor(expiresValue.value || 0))
    const u = expiresUnit.value
    // pluralize
    const label = v === 1 ? u.slice(0, -1) : u
    return `${v} ${label}`
})

const canGenerate = computed(() =>
    // Boolean(filePath.value) &&
    files.value.length > 0 &&
    // Number.isFinite(maxDownloads.value) && maxDownloads.value >= 1 &&
    Number.isFinite(expiresValue.value) && expiresValue.value >= 1
)

function invalidateLink() {
    viewUrl.value = ''
    downloadUrl.value = ''
}

function scheduleAutoRegen() {
    // avoid spamming the server if multiple mutations happen quickly
    if (regenTimer) clearTimeout(regenTimer)
    regenTimer = setTimeout(async () => {
        if (autoRegenerate.value && canGenerate.value) {
            await generateLink()
        }
    }, 350)
}


// Set preset helper
function setPreset(v: number, u: 'hours' | 'days' | 'weeks') {
    expiresValue.value = v
    expiresUnit.value = u
}


async function generateLink() {
    const body: any = {
        expiresInSeconds: expiresSec.value,
        projectBase: projectBase.value || undefined, // server can use this to validate/resolve paths
    }

    if (files.value.length === 1) {
        body.filePath = files.value[0]
    } else {
        body.filePaths = files.value.slice()
    }

    const data = await apiFetch('/api/magic-link', {
        method: 'POST',
        body: JSON.stringify(body)
    })
    viewUrl.value = data.viewUrl
    downloadUrl.value = data.downloadUrl
}

// Basic join to avoid double slashes
function joinPath(a: string, b: string) {
    if (!a) return b
    if (!b) return a
    const left = a.endsWith('/') ? a.slice(0, -1) : a
    const right = b.startsWith('/') ? b.slice(1) : b
    return `${left}/${right}`
}


onMounted(() => {
    // Initial: land on project selection
    loadProjectChoices()
})


async function copyLink() {
    if (!viewUrl.value) return
    await navigator.clipboard.writeText(viewUrl.value)
    pushNotification(new Notification('Copied!', 'Link copied to clipboard', 'success', 8000))
}

function openInBrowser() {
    // window.open will be intercepted by your main.ts setWindowOpenHandler
    window.open(viewUrl.value, '_blank')
}

function goBack() {
    router.push({ name: 'server-selection' })
}

</script>
