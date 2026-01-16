<template>
    <div class="h-full flex items-start justify-center pt-6 overflow-y-auto">
        <div class="grid grid-cols-1 gap-10 text-2xl w-9/12 mx-auto">
            <CardContainer class="bg-accent rounded-md shadow-xl">
                <template #header>
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

                            <div class="max-h-64 overflow-auto border-default bg-default rounded-md">
                                <div v-for="r in projectRoots" :key="r.mountpoint"
                                    class="flex items-center justify-between border-b border-default px-3 py-2 text-base">
                                    <div class="truncate">
                                        <code :title="`${r.name} → ${r.mountpoint}`">{{ r.mountpoint }}</code>
                                    </div>
                                    <div class="flex gap-2">
                                        <button class="btn btn-primary"
                                            @click="chooseProject(r.mountpoint)">Select</button>
                                    </div>
                                </div>
                            </div>
                        </template>

                        <div class="text-sm text-red-400" v-if="detectError">
                            {{ detectError }}
                        </div>
                    </div>

                    <!-- ===== Step 2: select file content (only after project chosen) ===== -->
                    <div v-else class="flex flex-col gap-2 text-left">
                        <div class="text-sm text-muted -mb-1">
                            <span class="font-semibold">Project:</span>
                            <code class="ml-1">{{ projectBase }}</code>
                            <button class="btn btn-secondary ml-3" @click="resetProject">Change Project
                                Directory</button>
                        </div>

                        <FileExplorer :apiFetch="apiFetch" :modelValue="files" @add="onExplorerAdd"
                            :base="!showEntireTree ? projectBase : ''" :startDir="!showEntireTree ? projectBase : ''" />

                        <!-- Selected files panel -->
                        <div v-if="files.length" class="border rounded bg-accent">
                            <div class="flex items-center gap-2 p-2">
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
                        <div class="border-t border-default mt-4 pt-4">
                            <!-- ===== Common link options ===== -->
                            <CommonLinkControls>
                                <template #expiry>
                                    <div class="flex flex-col gap-3 min-w-0">
                                        <div class="flex items-center gap-3">
                                            <label class="whitespace-nowrap font-semibold">Expires in:</label>

                                            <div class="flex flex-row gap-1 items-center">
                                                <input type="number" min="1" step="1" v-model.number="expiresValue"
                                                    class="input-textlike border rounded px-3 py-2 w-full" />

                                                <select v-model="expiresUnit"
                                                    class="input-textlike border rounded px-3 py-2 w-full">
                                                    <option value="hours">hours</option>
                                                    <option value="days">days</option>
                                                    <option value="weeks">weeks</option>
                                                </select>
                                                <!-- <div class="text-sm opacity-75">
                                                ({{ prettyExpiry }})
                                            </div> -->
                                            </div>
                                        </div>
                                        <div class="flex flex-row flex-nowrap mx-auto gap-3 text-sm text-nowrap">
                                            <!-- <label class="text-lg">Presets:</label> -->
                                            <button type="button" class="btn btn-secondary w-20"
                                                @click="setPreset(1, 'hours')">1 hour</button>
                                            <button type="button" class="btn btn-secondary w-20"
                                                @click="setPreset(1, 'days')">1 day</button>
                                            <button type="button" class="btn btn-secondary w-20"
                                                @click="setPreset(1, 'weeks')">1 week</button>
                                            <button type="button" class="btn btn-secondary w-20"
                                                @click="setNever()">Never</button>
                                        </div>
                                    </div>
                                </template>

                                <template #title>
                                    <div class="flex items-center gap-3 min-w-0">
                                        <label class="whitespace-nowrap font-semibold">Link Title:</label>
                                        <input type="text" v-model.trim="linkTitle"
                                            class="input-textlike border rounded px-3 py-2 w-full"
                                            placeholder="Optional title for the shared link" />
                                    </div>
                                </template>


                                <template #access>
                                    <div class="flex items-center gap-3 min-w-0">
                                        <label class="whitespace-nowrap font-semibold" for="link-access-switch">
                                            Link Access:
                                        </label>

                                        <Switch id="link-access-switch" v-model="usePublicBase" :class="[
                                            usePublicBase ? 'bg-secondary' : 'bg-well',
                                            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                        ]">
                                            <span class="sr-only">Toggle link access</span>
                                            <span aria-hidden="true" :class="[
                                                usePublicBase ? 'translate-x-5' : 'translate-x-0',
                                                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                            ]" />
                                        </Switch>

                                        <span class="text-sm select-none truncate">
                                            {{ usePublicBase ? 'Share Externally (Over Internet)' : 'Share Locally (Over LAN)' }}
                                        </span>
                                    </div>
                                </template>

                                <template #accessExtra>
                                    <CheckPortForwarding v-if="usePublicBase" :apiFetch="apiFetch"
                                        endpoint="/api/forwarding/check" :autoCheckOnMount="false" :showDetails="true" />
                                </template>

                                <template #password>
                                    <div class="flex flex-col gap-2 min-w-0">
                                        <div class="flex items-center gap-3">
                                            <label class="whitespace-nowrap font-semibold">Password Protected Link:</label>

                                            <Switch id="use-password-switch" v-model="protectWithPassword" :class="[
                                                protectWithPassword ? 'bg-secondary' : 'bg-well',
                                                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                            ]">
                                                <span class="sr-only">Toggle use password</span>
                                                <span aria-hidden="true" :class="[
                                                    protectWithPassword ? 'translate-x-5' : 'translate-x-0',
                                                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                                ]" />
                                            </Switch>
                                        </div>

                                        <div class="flex items-center gap-3 min-w-0">
                                            <label class="text-default font-semibold whitespace-nowrap">Password</label>

                                            <div class="relative flex items-center min-w-0 w-full">
                                                <input :disabled="!protectWithPassword"
                                                    :type="showPassword ? 'text' : 'password'" v-model.trim="password"
                                                    placeholder="Enter your password"
                                                    class="input-textlike border rounded px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed w-full pr-10" />
                                                <button type="button" @click="showPassword = !showPassword"
                                                    class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted">
                                                    <EyeIcon v-if="!showPassword" class="w-5 h-5" />
                                                    <EyeSlashIcon v-else class="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </template>

                                <template #commenters>
                                    <div class="flex flex-col gap-2 min-w-0">
                                        <div class="flex items-center gap-3">
                                            <label class="whitespace-nowrap font-semibold">Allow Users to
                                                Comment</label>
                                            <Switch id="allow-comments-switch" v-model="noCommentAccess" :class="[
                                                !noCommentAccess ? 'bg-secondary' : 'bg-well',
                                                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                            ]">
                                                <span class="sr-only">Toggle comments</span>
                                                <span aria-hidden="true" :class="[
                                                    !noCommentAccess ? 'translate-x-5' : 'translate-x-0',
                                                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                                ]" />
                                            </Switch>
                                          
                                        </div>

                                        <button type="button" class="btn btn-primary" :class="noCommentAccess ? 'disabled' : ''" @click="openUserModal()">
                                            {{ !noCommentAccess ? 'Manage Commenting Users' : 'No Comments' }}
                                            <span v-if="commentCount"
                                                class="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-default">
                                                {{ commentCount }}
                                            </span>
                                        </button>
                                    </div>
                                </template>

                                <template #errorLeft>
                                    <p v-if="!commentAccessSatisfied" class="text-sm text-red-500">
                                        At least one commenting user is required when comments are allowed.
                                    </p>
                                </template>

                                <template #errorRight>
                                    <p v-if="protectWithPassword && !password" class="text-sm text-red-500">
                                        Password is required when protection is enabled.
                                    </p>
                                </template>


                            </CommonLinkControls>
                        </div>
                        <AddUsersModal v-model="userModalOpen" :apiFetch="apiFetch" :preselected="commenters.map(c => ({
                            id: c.id,
                            username: c.username || '',
                            name: c.name,
                            user_email: c.user_email,
                            display_color: c.display_color
                        }))" @apply="onApplyUsers" />
                    </div>
                </template>
                <div v-if="projectSelected" class="flex flex-col">
	                    <div class="button-group-row w-full">
							<button class="btn btn-secondary" :disabled="loading" @click="resetAll">
								Reset
							</button>
							<button class="btn btn-secondary w-full" :disabled="!canGenerate" @click="generateLink"
								title="Create a magic link with the selected options">
								Generate magic link
							</button>
						</div>
                
                    <div v-if="viewUrl" class="p-3 border rounded space-x-2 flex flex-col items-center mt-1">
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
import FileExplorer from '../components/FileExplorer.vue'
import { pushNotification, Notification, CardContainer } from '@45drives/houston-common-ui'
import { useProjectChoices } from '../composables/useProjectChoices'
import AddUsersModal from '../components/modals/AddUsersModal.vue'
import CommonLinkControls from '../components/CommonLinkControls.vue'
import CheckPortForwarding from '../components/CheckPortForwarding.vue'
import type { Commenter } from '../typings/electron'
import { useHeader } from '../composables/useHeader'
import { Switch } from '@headlessui/vue'
import { EyeIcon, EyeSlashIcon } from "@heroicons/vue/20/solid";
import { useResilientNav } from '../composables/useResilientNav'
const { to } = useResilientNav()
useHeader('Select Files to Share');

const { apiFetch } = useApi()
// ================== Project selection state ==================
const projectSelected = ref(false)
const showEntireTree = ref(false)
const projectBase = ref<string>('')
const {
    detecting, detectError, projectRoots, browseMode, loadProjectChoices,
} = useProjectChoices(showEntireTree)
const commenters = ref<Commenter[]>([])
const noCommentAccess = ref(false)
const commentCount = computed(() => commenters.value.length)
const commentAccessSatisfied = computed(() => noCommentAccess.value || commentCount.value > 0)
const linkTitle = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

const forwardingOk = ref<boolean | null>(null)

function resetAll() {
    files.value = []
    showSelected.value = true
    expiresValue.value = 7
    expiresUnit.value = 'days'
    usePublicBase.value = true
    linkTitle.value = ''
    commenters.value = []
    noCommentAccess.value = false
    password.value = ''
    protectWithPassword.value = false
    showPassword.value = false
    viewUrl.value = ''
    downloadUrl.value = ''
    error.value = null
    autoRegenerate.value = false
    if (regenTimer) {
        clearTimeout(regenTimer)
        regenTimer = null
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

const files = ref<string[]>([])
const showSelected = ref(true)
function clearAll() {
    files.value = []
    invalidateLink()
}

const usePublicBase = ref(true);

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

// password state
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
    const raw = Math.floor(expiresValue.value || 0);

    // 0 → Never
    if (raw <= 0) return 0;

    return raw * UNIT_TO_SECONDS[expiresUnit.value];
});


// Pretty text like "3 days" / "2 weeks"
const prettyExpiry = computed(() => {
    if (expiresSec.value === 0) return 'Never';

    const v = Math.max(1, Math.floor(expiresValue.value || 0));
    const u = expiresUnit.value;
    const label = v === 1 ? u.slice(0, -1) : u;
    return `${v} ${label}`;
});

const canGenerate = computed(() =>
    files.value.length > 0 &&
    Number.isFinite(expiresValue.value) &&
    expiresValue.value >= 0 && // 0 = never, >=1 = normal
    (!protectWithPassword.value || !!password.value) &&
    commentAccessSatisfied.value
);

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

function setNever() {
    expiresValue.value = 0;
    expiresUnit.value = 'hours';
}
async function generateLink() {
    if (!canGenerate.value) {
        // Safety guard – normally prevented by disabled button
        pushNotification(
            new Notification(
                'Cannot Generate Link',
                'Please select at least one file and fix any validation errors before creating a link.',
                'denied',
                8000,
            )
        )
        return
    }

    if (protectWithPassword.value && !password.value) {
        pushNotification(
            new Notification(
                'Password Required',
                'Enter a password or turn off link password protection.',
                'warning',
                8000,
            )
        )
        return
    }

    loading.value = true
    error.value = null
    viewUrl.value = ''
    downloadUrl.value = ''

    const body: any = {
        expiresInSeconds: expiresSec.value,
        projectBase: projectBase.value || undefined,
        baseMode: usePublicBase.value ? 'externalPreferred' : 'local',
        title: linkTitle.value || undefined,
    }

    if (files.value.length === 1) body.filePath = files.value[0]
    else body.filePaths = files.value.slice()

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

    try {
        const data = await apiFetch('/api/magic-link', {
            method: 'POST',
            body: JSON.stringify(body),
        })

        viewUrl.value = data.viewUrl
        downloadUrl.value = data.downloadUrl

        const label = usePublicBase.value ? 'external (Internet)' : 'local (LAN)'
        const titlePart = linkTitle.value ? ` for “${linkTitle.value}”` : ''

        pushNotification(
            new Notification(
                'Magic Link Created',
                `A ${label} magic link was created${titlePart}.`,
                'success',
                8000,
            )
        )
    } catch (e: any) {
        const msg = e?.message || e?.error || String(e)
        const level: 'error' | 'denied' =
            /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error'

        error.value = msg

        pushNotification(
            new Notification(
                'Failed to Create Magic Link',
                msg,
                level,
                8000,
            )
        )
    } finally {
        loading.value = false
    }
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
    if (!viewUrl.value) return
    window.open(viewUrl.value, '_blank')

    pushNotification(
        new Notification(
            'Opening Link',
            'Magic link opened in your default browser.',
            'info',
            4000,
        )
    )
}


async function goBack() {
    to('dashboard');
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

function onApplyUsers(
    users: any[]
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
