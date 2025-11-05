<template>
    <div class="h-full flex items-start justify-center pt-6 overflow-y-auto">
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
                                <span class="font-semibold">ZFS Pools:</span>
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
                            <button class="btn btn-secondary ml-3" @click="resetProject">Change Project
                                Directory</button>
                        </div>

                        <FileExplorer :apiFetch="apiFetch" :modelValue="files" @add="onExplorerAdd"
                            :base="!showEntireTree ? projectBase : ''" :startDir="!showEntireTree ? projectBase : ''" />

                        <!-- Selected files panel (unchanged except we ensure paths remain under project when restricted) -->
                        <div v-if="files.length" class="border rounded bg-accent">
                            <div class="flex items-center gap-2 p-2">
                                <!-- <label class="flex items-center gap-2 text-xs cursor-pointer select-none">
                                    <input type="checkbox" v-model="autoRegenerate" />
                                    Auto-regenerate link
                                </label> -->
                                <button class="btn btn-secondary" @click="showSelected = !showSelected">
                                    {{ showSelected ? 'Hide' : 'Show' }} list
                                </button>
                                <button class="btn btn-danger" @click="clearAll">Clear all</button>
                            </div>
                            <div v-show="showSelected" class="max-h-40 overflow-auto">
                                <div v-for="(f, i) in files" :key="f"
                                    class="grid items-center [grid-template-columns:1fr_auto] border-t border-default text-sm">
                                    <div class="relative px-3 py-2 rounded-md bg-default">
                                        <!-- pulsing overlay -->
                                        <span aria-hidden="true"
                                            class="pointer-events-none absolute inset-0 rounded-md bg-green-500/50 animate-pulse z-0"></span>

                                        <span class="truncate block text-default relative z-10">{{ f }}</span>
                                    </div>

                                    <button class="btn btn-danger m-2 px-2 py-1" @click="removeFile(i)"
                                        title="Remove">✕</button>
                                </div>
                            </div>

                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-base mt-2">
                            <!-- Max downloads -->
                            <!-- <div class="flex items-center gap-3">
                                <label class="whitespace-nowrap font-semibold">Max downloads</label>
                                <input type="number" min="1" step="1" v-model.number="maxDownloads"
                                    class="input border rounded px-3 py-2 w-32 bg-transparent" />
                            </div> -->

                            <!-- Expiry -->
                            <div class="flex items-center gap-3">
                                <label class="whitespace-nowrap font-semibold">Expires in:</label>

                                <div class="flex flex-wrap gap-2 text-sm">
                                    <button type="button" class="btn btn-secondary" @click="setPreset(1, 'hours')">1
                                        hour</button>
                                    <button type="button" class="btn btn-secondary" @click="setPreset(1, 'days')">1
                                        day</button>
                                    <button type="button" class="btn btn-secondary" @click="setPreset(1, 'weeks')">1
                                        week</button>
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

                            <!-- Password (optional) -->
                            <div class="flex items-center gap-3">
                                <label class="whitespace-nowrap font-semibold">Password:</label>
                                <div class="flex items-center gap-2">
                                    <input id="pw-enabled" type="checkbox" v-model="protectWithPassword" />
                                    <label for="pw-enabled" class="text-sm">Protect with password</label>
                                </div>
                                <input :disabled="!protectWithPassword" :type="showPassword ? 'text' : 'password'"
                                    v-model.trim="password"
                                    class="input-textlike border rounded px-3 py-2 bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                                    placeholder="Enter password" style="min-width: 16rem" />
                                <button type="button" class="btn btn-secondary" @click="showPassword = !showPassword"
                                    :disabled="!protectWithPassword">
                                    {{ showPassword ? 'Hide' : 'Show' }}
                                </button>
                            </div>
                        </div>
                        <div>
                            <div class="flex items-center gap-3">
                                <button type="button" class="btn btn-primary" @click="openUserModal()">
                                    Manage comment access
                                    <span v-if="commentCount"
                                        class="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-default">
                                        {{ commentCount }}
                                    </span>
                                </button>

                                <label class="flex items-center gap-2 text-sm">
                                    <input type="checkbox" v-model="noCommentAccess" />
                                    <span>No one can comment</span>
                                </label>
                            </div>

                            <p v-if="!commentAccessSatisfied" class="text-sm text-red-500 mt-1">
                                Select at least one commenter or check “No one can comment”.
                            </p>

                            <AddUsersModal v-model="userModalOpen" :apiFetch="apiFetch" :preselected="commenters.map(c => ({
                                id: c.id,
                                username: c.username || '',
                                name: c.name,
                                user_email: c.user_email,
                                display_color: c.display_color
                            }))" @apply="onApplyUsers" />
                        </div>
                    </div>
                </template>
                <div v-if="projectSelected" class="flex flex-col">
                    <button class="btn btn-secondary w-full" :disabled="!canGenerate" @click="generateLink"
                        title="Create a magic link with the selected options">
                        Share via magic link
                    </button>
                    <p v-if="protectWithPassword && !password" class="text-sm text-red-500 mt-2">Password is required
                        when protection is enabled.</p>
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
                    Return to Dashboard
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useApi } from '../composables/useApi'
import CardContainer from '../components/CardContainer.vue'
import FileExplorer from '../components/FileExplorer.vue'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import { router } from '../../app/routes'
import { useProjectChoices } from '../composables/useProjectChoices'
import AddUsersModal from '../components/modals/AddUsersModal.vue'
import type { Commenter } from '../typings/electron'

const { apiFetch } = useApi()

// ================== Project selection state ==================
const projectSelected = ref(false)
const showEntireTree = ref(false)
const projectBase = ref<string>('')
const {
    detecting, detectError, projectRoots, projectDirs,
    browseMode, currentRoot, browsePath, canGoUp,
    listDirs, backToRoots, goUp, drillInto, openRoot, loadProjectChoices,
} = useProjectChoices(showEntireTree)
const commenters = ref<Commenter[]>([])
const noCommentAccess = ref(false)
const commentCount = computed(() => commenters.value.length)
const commentAccessSatisfied = computed(() => noCommentAccess.value || commentCount.value > 0)




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

const files = ref<string[]>([])
const showSelected = ref(true)
function clearAll() {
    files.value = []
    invalidateLink()
}

function toAbsUnder(base: string, p: string) {
    // base: e.g. "/tank"
    const bName = (base || '').replace(/\/+$/, '').replace(/^\/+/, ''); // "tank"
    const clean = (p || '').replace(/^\/+/, '');                         // "tank/foo" or "foo"
    if (!bName) return '/' + clean;                                      // no project root picked

    // If the path already starts with the base name, don't duplicate it.
    if (clean === bName || clean.startsWith(bName + '/')) {
        return '/' + clean;                                                // "/tank/..."
    }
    return '/' + bName + '/' + clean;                                    // "/tank/foo"
}


// When FileExplorer emits @add, normalize relative paths to live under the chosen project (if restricted)
function onExplorerAdd(paths: string[]) {
    paths.forEach(p => {
        let full = p;
        if (!showEntireTree.value && projectBase.value) {
            // Always normalize to an absolute path under the chosen project root.
            full = toAbsUnder(projectBase.value, p);
        } else {
            // Ensure absolute (avoid accidental relative paths)
            full = p.startsWith('/') ? p : '/' + p.replace(/^\/+/, '');
        }
        if (!files.value.includes(full)) files.value.push(full);
    });
    invalidateLink();
    scheduleAutoRegen();
}

const externalBase = ref<string>(''); // e.g., "https://demo123.collab.45d.io"


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
watch(
    commenters,
    (arr) => {
        if (arr.length > 0) noCommentAccess.value = false
    },
    { deep: true }
)

const expiresValue = ref(1)
const expiresUnit = ref<'hours' | 'days' | 'weeks'>('days')
// const maxDownloads = ref(5)

// NEW: password state
const protectWithPassword = ref(false)
const password = ref('')
const showPassword = ref(false)

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
    files.value.length > 0 &&
    Number.isFinite(expiresValue.value) && expiresValue.value >= 1 &&
    (!protectWithPassword.value || !!password.value) &&
    commentAccessSatisfied.value
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
        projectBase: projectBase.value || undefined,
        externalBase: externalBase.value || undefined,
    };

    if (files.value.length === 1) body.filePath = files.value[0];
    else body.filePaths = files.value.slice();

    // NEW: include password if enabled
    if (protectWithPassword.value && password.value) {
        body.password = password.value
    }

    if (!noCommentAccess.value && commenters.value.length) {
        (body as any).commenters = commenters.value.map(c => {
            const out: any = {}
            if (c.id != null) out.userId = c.id
            if (c.username) out.username = c.username
            if (c.user_email) out.user_email = c.user_email
            if (c.name) out.name = c.name
            return out
        })
    }
    const data = await apiFetch('/api/magic-link', {
        method: 'POST',
        body: JSON.stringify(body),
    });

    console.log('Got magic link data', data)
    // viewUrl.value = data.downloadUrl
    viewUrl.value = data.viewUrl;
    downloadUrl.value = data.downloadUrl;

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

function resetToProjectPicker() {
    // ensure we’re not in the “entire tree” mode, and drop the chosen root
    showEntireTree.value = false
    backToRoots()            // show ZFS pools list UI
    resetProject()           // clears projectBase, files, link, and calls loadProjectChoices()
}

function goBack() {
    router.push({ name: 'dashboard' })
}

const userModalOpen = ref(false)

function openUserModal() {
    userModalOpen.value = true
}

function makeKey(name?: string, user_email?: string, username?: string) {
    const u = (username ?? '').trim().toLowerCase()
    const e = (user_email ?? '').trim().toLowerCase()
    const n = (name ?? '').trim().toLowerCase()
    return (u || n) + '|' + e
}
// Called when the modal emits @apply
function onApplyUsers(
    users: Array<{ id?: number; username: string; name?: string; user_email?: string; display_color?: string }>
) {
    // Normalize the selection coming back from the modal
    const next = users.map(u => {
        const username = (u.username || '').trim()
        const name = (u.name || username).trim()
        const user_email = u.user_email?.trim() || undefined
        const display_color = u.display_color
        const key = makeKey(name, user_email, username)
        return { key, id: u.id, username, name, user_email, display_color }
    })

    // Dedupe by key just in case
    const seen = new Set<string>()
    const dedup: typeof next = []
    for (const c of next) {
        if (seen.has(c.key)) continue
        seen.add(c.key)
        dedup.push(c)
    }

    // REPLACE (not merge): reflect exactly what's selected in the modal
    commenters.value = dedup

    invalidateLink()
    scheduleAutoRegen()
}


</script>
